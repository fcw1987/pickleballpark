import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2, replacePendingMovementV2, finishPlanningV2 } from '../play-planning-v2.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';

const clone = value => structuredClone(value);
const json = value => JSON.stringify(value);
function prefix() {
  const document = JSON.parse(readFileSync(new URL('./fixtures/model2/off-apron-unreachable.json', import.meta.url), 'utf8'));
  const state = createPlanningStateV2(document);
  for (const recipe of document.shots.slice(0, 2)) {
    const trial = trialRecipeV2(state, recipe);
    assert.equal(trial.ok, true, json(trial.findings)); commitPlanningTrialV2(state, trial);
  }
  const pendingRecipe = clone(state.pendingRecipe); pendingRecipe.playerMovement.player2.target.x += .01;
  return { document, state, recipe: clone(document.shots[2]), pendingRecipe };
}
const stateBytes = state => json({ play: state.play, recipes: state.recipes, pendingRecipe: state.pendingRecipe,
  findings: state.findings, revision: state.revision, cursor: state.cursor, locks: [...state.locks], pendingLocksBefore: [...state.pendingLocksBefore] });

test('a patched private draft preserves exact independently compiled source, playback, inspection reuse and prefix identity', () => {
  const { document, state, recipe, pendingRecipe } = prefix(), before = stateBytes(state);
  const prefixStep = state.steps[1], prefixSegment = state.finalizedSegments[0], sourceBytes = json({ recipe, pendingRecipe });
  const probe = trialRecipeV2(state, recipe, { pendingRecipe, capturePreviousInspection: true });
  const trial = trialRecipeV2(state, recipe, { pendingRecipe, reusePreviousTrial: probe });
  assert.equal(trial.ok, true, json(trial.findings)); assert.equal(trial.previousInspectionReused, true);
  assert.equal(stateBytes(state), before, 'draft patching cannot alter the live state');
  assert.equal(json({ recipe, pendingRecipe }), sourceBytes);
  assert.deepEqual(trial.acceptedPendingRecipe, pendingRecipe);
  commitPlanningTrialV2(state, trial);
  assert.equal(state.steps[1], prefixStep); assert.equal(state.finalizedSegments[0], prefixSegment);
  for (const remaining of document.shots.slice(3)) {
    const continuation = trialRecipeV2(state, remaining);
    assert.equal(continuation.ok, true, json(continuation.findings)); commitPlanningTrialV2(state, continuation);
  }
  const expected = { ...document, shots: [document.shots[0], pendingRecipe, recipe, ...document.shots.slice(3)] };
  const independent = compileDocument(expected), finished = finishPlanningV2(state, { ending: document.ending, outcome: document.outcome, compileTimeline: true });
  assert.deepEqual(finished.play, independent.play);
  assert.deepEqual(finished.timeline.events, independent.timeline.events);
  assert.equal(finished.timeline.duration, independent.timeline.duration);
  assert.equal(validateRallyRules(independent.play, independent.timeline).valid, true);
  assert.deepEqual(state.recipes, expected.shots);
});

test('submitted recipes and exposed recipe snapshots stay detached from the uncommitted draft and committed source', () => {
  const { state, recipe, pendingRecipe } = prefix(), accepted = clone(recipe), acceptedPrior = clone(pendingRecipe);
  const trial = trialRecipeV2(state, recipe, { pendingRecipe });
  assert.equal(trial.ok, true, json(trial.findings));
  recipe.target.x += 100; recipe.contactEvidence.feet[0].x += 100;
  pendingRecipe.playerMovement.player2.target.x += 100;
  trial.recipe.target.x += 200; trial.recipe.contactEvidence.feet[0].x += 200;
  trial.acceptedPendingRecipe.target.x += 200;
  assert.deepEqual(trial.previousResolved.shot.authoring.target, acceptedPrior.target);
  assert.deepEqual(trial.step.shot.authoring.target, accepted.target);
  commitPlanningTrialV2(state, trial);
  assert.deepEqual(state.pendingRecipe, accepted); assert.deepEqual(state.recipes.at(-1), accepted);
  assert.deepEqual(state.recipes.at(-2), acceptedPrior);
  assert.notEqual(state.pendingRecipe, state.recipes.at(-1));
  assert.notEqual(state.pendingRecipe.target, state.recipes.at(-1).target);
  assert.notEqual(state.pendingRecipe.contactEvidence.feet, state.recipes.at(-1).contactEvidence.feet);
  state.pendingRecipe.target.x += 1;
  assert.deepEqual(state.recipes.at(-1), accepted, 'commit separates the private recipe snapshots before exposure');
  state.recipes.at(-1).movement.target.x += 1;
  assert.deepEqual(state.pendingRecipe.movement, accepted.movement);
});

test('a failed build after a private movement patch preserves source, live state and detached failure evidence', () => {
  const { state, recipe, pendingRecipe } = prefix(), before = stateBytes(state), submitted = json(pendingRecipe);
  recipe.target.x = NaN;
  const trial = trialRecipeV2(state, recipe, { pendingRecipe });
  assert.equal(trial.built, false); assert.equal(trial.ok, false);
  assert.equal(stateBytes(state), before); assert.equal(json(pendingRecipe), submitted);
  trial.previousResolved.shot.authoring.movement.target.x += 100;
  trial.acceptedPendingRecipe.playerMovement.player2.target.x += 100;
  assert.equal(stateBytes(state), before); assert.equal(json(pendingRecipe), submitted);
  assert.throws(() => commitPlanningTrialV2(state, trial), /finite/);
  assert.equal(stateBytes(state), before);
  const badPending = clone(pendingRecipe); badPending.target.x += 1;
  const rejected = trialRecipeV2(state, recipe, { pendingRecipe: badPending });
  assert.equal(rejected.ok, false); assert.match(rejected.reason, /only movement/);
  assert.equal(stateBytes(state), before);
});

test('deferred private copies do not change stale, foreign or competing-trial commit semantics', () => {
  const { state, recipe, pendingRecipe } = prefix(), foreign = prefix();
  const first = trialRecipeV2(state, recipe, { pendingRecipe }), competing = trialRecipeV2(state, recipe, { pendingRecipe });
  const before = stateBytes(state), foreignBefore = stateBytes(foreign.state);
  assert.throws(() => commitPlanningTrialV2(foreign.state, first), /different or stale/);
  assert.equal(stateBytes(state), before); assert.equal(stateBytes(foreign.state), foreignBefore);
  commitPlanningTrialV2(state, first); const accepted = stateBytes(state);
  assert.throws(() => commitPlanningTrialV2(state, competing), /different or stale/);
  assert.equal(stateBytes(state), accepted);
});

test('standalone pending replacement retains full detachment instead of exposing the trial-only shallow draft', () => {
  const { state, pendingRecipe } = prefix(), priorStep = state.steps.at(-1), priorBytes = json(priorStep);
  const accepted = clone(pendingRecipe);
  replacePendingMovementV2(state, pendingRecipe);
  pendingRecipe.movement.target.x += 100; pendingRecipe.contactEvidence.feet[0].x += 100;
  assert.deepEqual(state.pendingRecipe, accepted); assert.deepEqual(state.recipes.at(-1), accepted);
  assert.equal(json(priorStep), priorBytes);
  assert.notEqual(state.steps.at(-1).shot.contact, priorStep.shot.contact);
  assert.notEqual(state.steps.at(-1).shot.contactEvidence, priorStep.shot.contactEvidence);
  priorStep.shot.contactEvidence.feet[0].x += 100;
  assert.deepEqual(state.steps.at(-1).shot.contactEvidence, accepted.contactEvidence);
});
