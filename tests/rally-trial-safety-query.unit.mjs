import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from 'node:inspector';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2,
  inspectPlanningTrialEventsV2, inspectPlanningTrialBodyV2, inspectPlanningTrialContactV2,
  inspectPlanningTrialSafetyV2 } from '../play-planning-v2.js';
import { MODEL2_CASES, readModel2Fixture } from './fixtures/model2/cases.mjs';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

const actors = ['player1', 'player2', 'player3', 'player4'];
const contactInvalid = contact => contact.violations.length || contact.physicalCandidates.length || contact.momentumCandidates.length;
function firstTrial(document = model2Document({ ending: 'winner' }), options = { capturePendingEvents: true }) {
  const state = createPlanningStateV2(document);
  return { document, state, trial: trialRecipeV2(state, document.shots[0], options) };
}
function lateContactTrial() {
  const document = model2Document({ ending: 'winner' });
  document.initialLayout.player3 = { x: 12, y: 34 };
  const state = createPlanningStateV2(document);
  commitPlanningTrialV2(state, trialRecipeV2(state, document.shots[0]));
  const incoming = state.solved[0];
  const recipe = model2Shot({ id: 'reply', hitter: 'player3', target: { x: 7, y: 14 }, contactMode: 'bounced',
    contactTiming: { afterBounceSeconds: incoming.secondBounceTime - incoming.firstLandingTime - 5e-8 } });
  return { state, trial: trialRecipeV2(state, recipe, { capturePendingEvents: true }) };
}
function assertAllQueriesReject(state, trial, pattern) {
  for (const query of [inspectPlanningTrialSafetyV2, inspectPlanningTrialContactV2,
    inspectPlanningTrialBodyV2, inspectPlanningTrialEventsV2])
    assert.throws(() => query(state, trial, { actors }), pattern, query.name);
}

for (const { id } of MODEL2_CASES) test(`combined trial safety preserves sequential contact/body results for ${id}`, () => {
  const document = readModel2Fixture(id), documentBefore = JSON.stringify(document), state = createPlanningStateV2(document);
  for (const recipe of document.shots) {
    const trial = trialRecipeV2(state, recipe, { capturePendingEvents: true });
    assert.equal(trial.ok, true, JSON.stringify(trial.findings));
    const stateBefore = JSON.stringify(state), trialBefore = JSON.stringify(trial);
    const contact = inspectPlanningTrialContactV2(state, trial);
    const bodyEvents = contactInvalid(contact) ? [] : inspectPlanningTrialBodyV2(state, trial, { actors });
    const safety = inspectPlanningTrialSafetyV2(state, trial, { actors });
    assert.deepEqual(safety, { contact, bodyEvents });
    assert.equal(JSON.stringify(state), stateBefore);
    assert.equal(JSON.stringify(trial), trialBefore);
    assert.equal(JSON.stringify(document), documentBefore, 'query leaves the original document and recipe untouched');
    commitPlanningTrialV2(state, trial);
  }
});

test('combined body query preserves selected actors and collisions after the first bounce', () => {
  const document = model2Document({ ending: 'winner' });
  document.initialLayout.player3 = { x: 7, y: 32 };
  const { state, trial } = firstTrial(document);
  const safety = inspectPlanningTrialSafetyV2(state, trial, { actors: ['player3'] });
  assert.equal(contactInvalid(safety.contact), 0);
  assert.deepEqual(safety.bodyEvents, inspectPlanningTrialBodyV2(state, trial, { actors: ['player3'] }));
  assert.equal(safety.bodyEvents.length, 1);
  assert.ok(safety.bodyEvents[0].afterContactSeconds > trial.flight.firstLandingTime);
  assert.deepEqual(inspectPlanningTrialSafetyV2(state, trial, { actors: ['player4'] }).bodyEvents, []);
  assert.deepEqual(inspectPlanningTrialSafetyV2(state, trial, { actors: [] }).bodyEvents, []);
  for (const invalid of [undefined, ['unknown'], ['player1', 'player1'], [null]])
    assert.throws(() => inspectPlanningTrialSafetyV2(state, trial, { actors: invalid }), /player IDs/);
});

test('combined query rejects forged, foreign, revision-mismatched, stale, failed, nonbuilt and uncaptured trials', () => {
  const { document, state, trial } = firstTrial();
  for (const token of [{}, { ...trial }, structuredClone({ ok: true, built: true })])
    assertAllQueriesReject(state, token, /different or stale/);
  assertAllQueriesReject(createPlanningStateV2(document), trial, /different or stale/);
  const failed = trialRecipeV2(state, { ...document.shots[0], target: { x: NaN, y: 30 } }, { capturePendingEvents: true });
  assertAllQueriesReject(state, failed, /valid built/);
  const buildOnly = trialRecipeV2(state, document.shots[0], { buildOnly: true, capturePendingEvents: true });
  assertAllQueriesReject(state, buildOnly, /valid built/);
  assertAllQueriesReject(state, trialRecipeV2(state, document.shots[0]), /mutated or are unsupported/);
  const mismatched = firstTrial(); mismatched.state.revision++;
  assertAllQueriesReject(mismatched.state, mismatched.trial, /different or stale/);
  inspectPlanningTrialSafetyV2(state, trial, { actors });
  commitPlanningTrialV2(state, trial);
  assertAllQueriesReject(state, trial, /different or stale/);
});

test('a successful combined query does not cache acceptance of later source mutations', () => {
  for (const mutate of [
    trial => { trial.pendingSegment.step.shot.physicsV2.target.y += 1; },
    trial => { trial.pendingSegment.step.positions.player3.y += 1; },
    trial => { trial.pendingSegment.previous.positions.player3.y += 1; },
    trial => { trial.pendingSegment.step.shot.contact.feet[0].y += 1; },
    trial => { trial.step.shot.authoring.pace = 'firm'; },
    trial => { trial.pendingSegment.startTime += .01; }
  ]) {
    const { document, state, trial } = firstTrial(), original = JSON.stringify(document);
    inspectPlanningTrialSafetyV2(state, trial, { actors });
    mutate(trial);
    const stateBefore = JSON.stringify(state);
    assertAllQueriesReject(state, trial, /mutated or are unsupported/);
    assert.equal(JSON.stringify(state), stateBefore, 'rejected observation leaves the current state untouched');
    assert.equal(JSON.stringify(document), original);
  }
});

test('combined query retains strict pending-proof rejection for unsupported physical source', () => {
  for (const mutate of [
    shot => { shot.proofSentinel = undefined; },
    shot => { shot.proofSentinel = Infinity; },
    shot => { shot.proofSentinel = -0; },
    shot => { shot.proofSentinel = () => true; },
    shot => { shot.proofSentinel = Symbol('unsupported'); },
    shot => { shot.proofSentinel = 1n; },
    shot => { shot.proofSentinel = new Date(0); },
    shot => { shot.proofSentinel = Array(2); },
    shot => { shot.proofSentinel = shot; },
    shot => { shot[Symbol('hidden')] = true; },
    shot => { Object.defineProperty(shot, 'hidden', { value: true }); },
    shot => { Object.defineProperty(shot, 'proofSentinel', { enumerable: true, get() { throw Error('unsupported accessor'); } }); }
  ]) {
    const { state, trial } = firstTrial();
    inspectPlanningTrialSafetyV2(state, trial, { actors });
    mutate(trial.pendingSegment.step.shot);
    assertAllQueriesReject(state, trial, /mutated or are unsupported/);
  }
  const { state, trial } = firstTrial();
  inspectPlanningTrialSafetyV2(state, trial, { actors });
  state.play.players.player1.team = 'orange';
  assertAllQueriesReject(state, trial, /mutated or are unsupported/);
});

async function callCounts(run) {
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params,
    (error, result) => error ? reject(error) : resolve(result)));
  try {
    await post('Profiler.enable'); await post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
    run();
    const coverage = await post('Profiler.takePreciseCoverage');
    await post('Profiler.stopPreciseCoverage'); await post('Profiler.disable');
    return (name, file = 'play-planning-v2.js') => coverage.result.filter(script => script.url.endsWith(`/${file}`))
      .flatMap(script => script.functions).filter(fn => fn.functionName === name).reduce((sum, fn) => sum + fn.ranges[0].count, 0);
  } finally { session.disconnect(); }
}

test('combined query verifies once while the sequential valid pair verifies twice and retains both inspections', async () => {
  const { state, trial } = firstTrial(readModel2Fixture('body')), selected = ['player3', 'player4'];
  const combined = await callCounts(() => inspectPlanningTrialSafetyV2(state, trial, { actors: selected }));
  const sequential = await callCounts(() => {
    inspectPlanningTrialContactV2(state, trial);
    inspectPlanningTrialBodyV2(state, trial, { actors: selected });
  });
  for (const name of ['verifiedTrialNext', 'previousInspectionProof', 'strictInspectionJSON']) {
    assert.equal(combined(name), 1, name);
    assert.equal(sequential(name), 2, name);
  }
  for (const counts of [combined, sequential]) {
    for (const name of ['inspectModel2ContactV2', 'verifySegment', 'contactCandidates', 'inspectBodyPathV2'])
      assert.equal(counts(name, 'play-outcome-v2.js'), 1, name);
    assert.equal(counts('bodyContact', 'play-outcome-v2.js'), selected.length);
    assert.equal(counts('inspectModel2SegmentV2', 'play-outcome-v2.js'), 0);
    assert.equal(counts('assessTerminalReach', 'play-outcome-v2.js'), 0);
  }
});

test('any contact violation, physical candidate or momentum candidate skips the entire body query', async () => {
  const invalidTrials = [
    [lateContactTrial(), 'violations'],
    [firstTrial(readModel2Fixture('nvz-foot')), 'physicalCandidates'],
    [firstTrial(readModel2Fixture('nvz-momentum-after-dead')), 'momentumCandidates']
  ];
  for (const [{ state, trial }, field] of invalidTrials) {
    assert.equal(trial.ok, true, JSON.stringify(trial.findings));
    const expected = inspectPlanningTrialContactV2(state, trial);
    assert.ok(expected[field].length, field);
    let result;
    const counts = await callCounts(() => { result = inspectPlanningTrialSafetyV2(state, trial, { actors: ['unknown'] }); });
    assert.deepEqual(result, { contact: expected, bodyEvents: [] });
    assert.equal(counts('verifiedTrialNext'), 1);
    assert.equal(counts('previousInspectionProof'), 1);
    assert.equal(counts('inspectModel2ContactV2', 'play-outcome-v2.js'), 1);
    assert.equal(counts('inspectBodyPathV2', 'play-outcome-v2.js'), 0);
    assert.equal(counts('bodyContact', 'play-outcome-v2.js'), 0);
  }
});
