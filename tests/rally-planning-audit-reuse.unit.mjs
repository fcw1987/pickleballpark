import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2, replacePendingMovementV2 } from '../play-planning-v2.js';
import { inspectModel2SegmentV2 } from '../play-outcome-v2.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';
import { model2Shot } from './fixtures/model2/factories.mjs';

const clone = value => structuredClone(value);
const plain = value => JSON.parse(JSON.stringify(value));
function prefix() {
  const document = JSON.parse(readFileSync(new URL('./fixtures/model2/off-apron-unreachable.json', import.meta.url), 'utf8'));
  const state = createPlanningStateV2(document);
  for (const recipe of document.shots.slice(0, 2)) {
    const trial = trialRecipeV2(state, recipe);
    assert.equal(trial.ok, true, JSON.stringify(trial.findings)); commitPlanningTrialV2(state, trial);
  }
  return { state, recipe: clone(document.shots[2]) };
}
const changedOutgoing = recipe => ({ ...clone(recipe), family: 'drop', intent: 'drop', arc: 'high', pace: 'soft', target: { x: 12, y: 17 } });
function assertFullFallback(state, recipe, probe, options = {}) {
  const full = trialRecipeV2(state, recipe, options);
  const reuse = trialRecipeV2(state, recipe, { ...options, reusePreviousTrial: probe });
  assert.equal(reuse.previousInspectionReused, false);
  assert.equal(reuse.ok, full.ok); assert.deepEqual(reuse.findings, full.findings);
  assert.deepEqual(reuse.terminalBeforeNextContact, full.terminalBeforeNextContact);
  assert.deepEqual(plain(reuse.resolvedPrevious), plain(full.resolvedPrevious));
  return reuse;
}

test('identical prior geometry reuses its complete physical inspection while the actual outgoing family and target are rebuilt', async context => {
  const { state, recipe } = prefix(), priorFlight = state.solved.at(-1);
  const probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true }), outgoing = changedOutgoing(recipe);
  assert.equal(probe.ok, true); assert.equal(probe.previousInspectionReused, false);
  // V8 call coverage observes the real owned solver without replacing its
  // immutable closures or introducing timing-sensitive performance thresholds.
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params,
    (error, result) => error ? reject(error) : resolve(result)));
  let full, reused, fullCoverage, reusedCoverage;
  const calls = (coverage, file, name) => coverage.result.filter(script => script.url.endsWith(`/${file}`))
    .flatMap(script => script.functions).filter(fn => fn.functionName === name)
    .reduce((sum, fn) => sum + fn.ranges[0].count, 0);
  try {
    await post('Profiler.enable'); await post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
    full = trialRecipeV2(state, outgoing); fullCoverage = await post('Profiler.takePreciseCoverage');
    reused = trialRecipeV2(state, outgoing, { reusePreviousTrial: probe }); reusedCoverage = await post('Profiler.takePreciseCoverage');
    await post('Profiler.stopPreciseCoverage'); await post('Profiler.disable');
  } finally { session.disconnect(); }
  const fullCalls = calls(fullCoverage, 'play-outcome-v2.js', 'inspectModel2SegmentV2');
  const reusedCalls = calls(reusedCoverage, 'play-outcome-v2.js', 'inspectModel2SegmentV2');
  assert.equal(fullCalls, 1); assert.equal(reusedCalls, 0, 'verified reuse must skip the complete prior-leg collision inspection');
  assert.equal(calls(fullCoverage, 'play-planning-v2.js', 'previousInspectionProof'), 0, 'default compiler trials skip proof work');
  assert.equal(calls(fullCoverage, 'play-planning-v2.js', 'privateInspection'), 0, 'default compiler trials skip cache copies');
  assert.equal(calls(reusedCoverage, 'play-planning-v2.js', 'previousInspectionProof'), 1);
  assert.equal(reused.ok, true); assert.equal(reused.previousInspectionReused, true);
  assert.deepEqual(reused.findings, full.findings);
  assert.deepEqual(plain(reused.resolvedPrevious), plain(full.resolvedPrevious));
  assert.equal(probe.resolvedPrevious.nextShotSemantics.stroke, 'drive');
  assert.equal(reused.resolvedPrevious.nextShotSemantics.stroke, 'drop');
  assert.deepEqual(reused.resolvedPrevious.nextStep.shot.intendedTarget, outgoing.target);
  assert.notDeepEqual(reused.resolvedPrevious.nextStep.shot.intendedTarget, recipe.target);
  const expected = inspectModel2SegmentV2(state.play, full.resolvedPrevious, { index: 1, terminal: false,
    prior: { segment: state.finalizedSegments.at(-1), solved: state.solved.at(-2) }, solved: priorFlight });
  commitPlanningTrialV2(state, reused);
  const inspection = state.finalizedInspections.at(-1);
  assert.equal(inspection.solved, priorFlight, 'retain the owned solver closure; structuredClone cannot copy it');
  for (const key of ['violations', 'physicalCandidates', 'momentumCandidates']) assert.deepEqual(inspection[key], expected[key]);
  context.diagnostic(`V8 coverage: ${fullCalls} full prior-leg inspection versus ${reusedCalls} with verified reuse; independent inspection data remains identical.`);
});

test('changed contact feet, reset, stroke side, kind or timing cannot reuse a prior contact proof', () => {
  for (const mutate of [
    value => { value.contactEvidence.feet[0].x += .01; },
    value => { value.contactEvidence.feetEstablishedOutsideNVZ = false; },
    value => { value.contactStyle = value.contactStyle === 'backhand' ? 'forehand' : 'backhand'; },
    value => { value.contactTiming.afterBounceSeconds = .42; },
    value => { value.contactMode = 'volley'; value.contactTiming = { beforeBounceSeconds: .05 }; }
  ]) {
    const { state, recipe } = prefix(), probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
    const changed = changedOutgoing(recipe); mutate(changed);
    assertFullFallback(state, changed, probe);
  }
});

test('changed pending movement, physics/source, route, time, header, momentum or retained context forces a full audit', () => {
  for (const mutate of [
    state => { state.steps.at(-1).positions.player2.x += .1; },
    state => { state.steps.at(-2).positions.player2.y += .1; },
    state => { state.steps.at(-1).shot.authoring.pace = 'firm'; },
    state => { state.steps.at(-1).shot.physicsV2.target.x += .1; },
    state => { state.cursor += .01; },
    state => { state.play.players.player1.team = 'orange'; },
    state => { state.play.rally.openingBouncesSatisfied = true; },
    state => { state.play.rally.service.court = 'left'; },
    state => { state.play.id = 'changed-play-header'; },
    state => { state.play.steps[1].shot.authoring.receiver = 'player4'; },
    state => { state.momentum = [{ actor: 'player2', contactTime: state.cursor, time: state.cursor + .2,
      from: { x: 15, y: 14 }, to: { x: 7, y: 20 }, fromFeet: [{ x: 14.58, y: 14 }, { x: 15.42, y: 14 }], feet: [{ x: 6.58, y: 20 }, { x: 7.42, y: 20 }] }]; },
    state => { const segment = state.finalizedSegments.at(-1); segment.step.shot.physicsV2.endTimeSeconds += .01; },
    state => { const solved = state.solved.at(-1); state.solved[state.solved.length - 1] = { ...solved, sampleBoard: seconds => solved.sampleBoard(seconds) }; }
  ]) {
    const { state, recipe } = prefix(), probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
    mutate(state); assertFullFallback(state, changedOutgoing(recipe), probe);
  }
  const { state, recipe } = prefix(), probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
  const pendingRecipe = clone(state.pendingRecipe); pendingRecipe.playerMovement.player2.target.x += .1;
  assertFullFallback(state, changedOutgoing(recipe), probe, { pendingRecipe });
});

test('missing, unaudited, stale, foreign and fabricated trial tokens fall back to independent inspection', () => {
  const { state, recipe } = prefix(), probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
  const foreign = prefix(), foreignProbe = trialRecipeV2(foreign.state, foreign.recipe, { capturePreviousInspection: true });
  for (const token of [undefined, {}, foreignProbe, trialRecipeV2(state, recipe), trialRecipeV2(state, recipe, { inspect: false }), trialRecipeV2(state, recipe, { buildOnly: true })]) {
    assertFullFallback(state, changedOutgoing(recipe), token);
  }
  replacePendingMovementV2(state, clone(state.pendingRecipe));
  assertFullFallback(state, changedOutgoing(recipe), probe);
});

test('externally substituted solvers or context with accessors, cycles, undefined, nonfinite values or functions is never reusable', () => {
  for (const index of [0, 1]) {
    const { state, recipe } = prefix(), solved = state.solved[index];
    state.solved[index] = Object.freeze({ ...solved, sampleBoard: seconds => solved.sampleBoard(seconds) });
    const probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
    assertFullFallback(state, changedOutgoing(recipe), probe);
  }
  for (const mutate of [
    state => { Object.defineProperty(state.play.players.player1, 'team', { get: () => 'green', enumerable: true }); },
    state => { state.play.extraContext = state.play; },
    state => { state.play.extraContext = { value: undefined }; },
    state => { state.play.extraContext = { value: Infinity }; },
    state => { state.play.extraContext = { value: -0 }; },
    state => { state.play.extraContext = { value: () => true }; },
    state => { state.play.extraContext = { toJSON: () => 'coerced' }; },
    state => { state.play.extraContext = new Date(0); },
    state => { Object.defineProperty(state.play.rally, 'hidden', { value: true }); },
    state => { const physics = state.finalizedSegments[0].step.shot.physicsV2, time = physics.endTimeSeconds;
      Object.defineProperty(physics, 'endTimeSeconds', { get: () => time, enumerable: true }); },
    state => { const source = state.play.steps[1].shot.authoring, receiver = source.receiver;
      Object.defineProperty(source, 'receiver', { get: () => receiver, enumerable: true }); }
  ]) {
    const { state, recipe } = prefix(); mutate(state);
    const probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
    assertFullFallback(state, changedOutgoing(recipe), probe);
  }
});

function bodyPrefix() {
  const document = readModel2Fixture('body'), state = createPlanningStateV2(document);
  commitPlanningTrialV2(state, trialRecipeV2(state, document.shots[0]));
  const recipe = model2Shot({ id: 'next', hitter: 'player4', target: { x: 7, y: 14 }, contactMode: 'bounced', contactTiming: { afterBounceSeconds: .16 } });
  return { state, recipe };
}

test('a different next hitter cannot reuse a clear route to hide an earlier torso collision', () => {
  const { state, recipe } = bodyPrefix(), clearRecipe = { ...recipe, hitter: 'player3' };
  const clear = trialRecipeV2(state, clearRecipe, { capturePreviousInspection: true });
  assert.equal(clear.ok, true);
  const result = assertFullFallback(state, recipe, clear);
  assert.equal(result.ok, false); assert.equal(result.terminalBeforeNextContact.reason, 'body');
  assert.equal(result.terminalBeforeNextContact.struckActor, 'player3');
});

test('exposed trial mutation cannot poison the private inspection or erase a cached body collision', () => {
  const { state, recipe } = bodyPrefix(), probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
  assert.equal(probe.ok, false); assert.equal(probe.terminalBeforeNextContact.reason, 'body');
  probe.findings.length = 0;
  probe.terminalBeforeNextContact.reason = 'unreachable';
  probe.terminalBeforeNextContact.position.x = 999;
  probe.resolvedPrevious.step.positions.player3.x = 999;
  probe.resolvedPrevious.step.shot.physicsV2.endTimeSeconds = 0;
  const full = trialRecipeV2(state, recipe), reused = trialRecipeV2(state, recipe, { reusePreviousTrial: probe });
  assert.equal(reused.previousInspectionReused, true, 'the private proof still matches the unchanged owned source, not the exposed altered segment');
  assert.equal(reused.ok, false);
  assert.deepEqual(reused.findings, full.findings);
  assert.deepEqual(reused.terminalBeforeNextContact, full.terminalBeforeNextContact);
  assert.equal(reused.terminalBeforeNextContact.reason, 'body');
  assert.notEqual(reused.terminalBeforeNextContact.position.x, 999);
});
