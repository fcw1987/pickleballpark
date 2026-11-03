import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2,
  inspectPendingLegV2, inspectPendingEventsV2, inspectPlanningTrialEventsV2, inspectPlanningTrialBodyV2, finishPlanningV2 } from '../play-planning-v2.js';
import { inspectBodyPathV2 } from '../play-outcome-v2.js';
import { Session } from 'node:inspector';
import { compileDocument } from '../play-compiler.js';
import { MODEL2_CASES, readModel2Fixture } from './fixtures/model2/cases.mjs';
import { model2Document } from './fixtures/model2/factories.mjs';

function plan(document) {
  const state = createPlanningStateV2(document);
  for (const recipe of document.shots) {
    const trial = trialRecipeV2(state, recipe);
    assert.equal(trial.ok, true, JSON.stringify(trial.findings));
    commitPlanningTrialV2(state, trial);
  }
  return state;
}
const terminalReach = candidate => ['second-bounce', 'unreachable'].includes(candidate.reason);

for (const { id } of MODEL2_CASES) test(`pending physical events preserve ${id} inspection and final outcome`, () => {
  const document = readModel2Fixture(id), state = plan(document);
  const before = JSON.stringify(state), pending = state.pendingSegment, steps = state.steps;
  const full = inspectPendingLegV2(state), events = inspectPendingEventsV2(state);
  assert.deepEqual(events.physicalCandidates, full.physicalCandidates.filter(candidate =>
    candidate.shotId !== state.pendingRecipe.id || !terminalReach(candidate)));
  assert.deepEqual(events.violations, full.violations);
  assert.deepEqual(events.momentumCandidates, full.momentumCandidates);
  assert.equal(events.segment.duration, full.segment.duration);
  assert.equal(JSON.stringify(state), before, 'raw inspection preserves pending state');
  assert.equal(state.pendingSegment, pending);
  assert.equal(state.steps, steps);
  const final = finishPlanningV2(state, { ending: document.ending, outcome: document.outcome, compileTimeline: true });
  const compiled = compileDocument(document);
  assert.deepEqual(final.timeline.events, compiled.timeline.events);
  assert.deepEqual(final.timeline.outcome, compiled.timeline.outcome);
  if (full.decision && !terminalReach(full.decision)) assert.deepEqual(events.decision, full.decision,
    'earlier net, out, body, contact or NVZ momentum keeps precedence');
});

function postBounceBody() {
  const document = model2Document({ ending: 'winner' });
  document.initialLayout.player3 = { x: 7, y: 32 };
  return plan(document);
}

test('full outgoing span retains a concrete post-first-bounce body collision that default stop misses', () => {
  const state = postBounceBody(), full = inspectPendingLegV2(state), events = inspectPendingEventsV2(state);
  const body = events.physicalCandidates.find(candidate => candidate.reason === 'body');
  assert.ok(body);
  assert.equal(body.struckActor, 'player3');
  assert.ok(body.afterContactSeconds > full.solved.firstLandingTime);
  assert.ok(body.afterContactSeconds < full.solved.secondBounceTime);
  assert.deepEqual(events.decision, full.decision);
  const naive = inspectPendingLegV2(state, { terminal: false });
  assert.equal(naive.physicalCandidates.some(candidate => candidate.reason === 'body'), false);
  assert.ok(naive.segment.duration < events.segment.duration);
});

test('events omit terminal reach sampling while retaining every other flight sample', () => {
  const state = postBounceBody(), original = state.solved.at(-1);
  let calls = 0;
  state.solved[state.solved.length - 1] = { ...original, sampleBoard(time) { calls++; return original.sampleBoard(time); } };
  const full = inspectPendingLegV2(state), fullCalls = calls;
  calls = 0;
  inspectPendingEventsV2(state);
  const reach = full.physicalCandidates.find(terminalReach).reach;
  assert.equal(fullCalls - calls, reach.players.length * reach.samples + 1,
    'only terminal reach grid samples and the terminal candidate position disappear');
});

test('a late next contact retains its exact resolved bound and prior physical candidates', () => {
  const document = readModel2Fixture('variable-bounced-contact');
  document.shots[1].contactTiming.afterBounceSeconds = .35;
  const state = plan(document), before = JSON.stringify(state);
  const previous = state.finalizedSegments[0], expected = state.solved[0].firstLandingTime + .35;
  assert.ok(Math.abs(previous.step.shot.physicsV2.endTimeSeconds - expected) < 1e-9);
  const full = inspectPendingLegV2(state), events = inspectPendingEventsV2(state);
  assert.deepEqual(events.physicalCandidates, full.physicalCandidates.filter(candidate =>
    candidate.shotId !== state.pendingRecipe.id || !terminalReach(candidate)));
  assert.equal(state.finalizedSegments[0], previous);
  assert.equal(JSON.stringify(state), before);
});


test('owned uncommitted trial inspection preserves live state and source and sees late body events', () => {
  const document = model2Document({ ending: 'winner' });
  document.initialLayout.player3 = { x: 7, y: 32 };
  const source = JSON.stringify(document), state = createPlanningStateV2(document);
  const trial = trialRecipeV2(state, document.shots[0], { capturePendingEvents: true }), before = JSON.stringify(state), token = JSON.stringify(trial);
  const events = inspectPlanningTrialEventsV2(state, trial);
  assert.ok(events.physicalCandidates.some(candidate => candidate.reason === 'body' &&
    candidate.afterContactSeconds > events.solved.firstLandingTime));
  assert.equal(events.physicalCandidates.some(terminalReach), false);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(trial), token);
  assert.equal(JSON.stringify(document), source);
  assert.equal(state.pendingSegment, null);
  commitPlanningTrialV2(state, trial);
  assert.deepEqual(inspectPendingEventsV2(state).physicalCandidates, events.physicalCandidates);
});

test('trial events reject forged, foreign, stale, failed and nonbuilt tokens', () => {
  const document = model2Document({ ending: 'winner' }), state = createPlanningStateV2(document);
  const trial = trialRecipeV2(state, document.shots[0], { capturePendingEvents: true }), foreign = createPlanningStateV2(document);
  for (const token of [{}, { ...trial }, structuredClone({ ok: true, built: true })])
    assert.throws(() => inspectPlanningTrialEventsV2(state, token), /different or stale/);
  assert.throws(() => inspectPlanningTrialEventsV2(foreign, trial), /different or stale/);
  const failed = trialRecipeV2(state, { ...document.shots[0], target: { x: NaN, y: 30 } });
  assert.throws(() => inspectPlanningTrialEventsV2(state, failed), /valid built/);
  const uncaptured = trialRecipeV2(state, document.shots[0]);
  assert.throws(() => inspectPlanningTrialEventsV2(state, uncaptured), /mutated or are unsupported/);
  const buildOnly = trialRecipeV2(state, document.shots[0], { buildOnly: true, capturePendingEvents: true });
  assert.throws(() => inspectPlanningTrialEventsV2(state, buildOnly), /valid built/);
  commitPlanningTrialV2(state, trial);
  assert.throws(() => inspectPlanningTrialEventsV2(state, trial), /different or stale/);
});

test('exposed candidate mutation cannot hide or alter physical evidence in trial inspection', () => {
  for (const mutate of [
    trial => { trial.pendingSegment.step.shot.physicsV2.target.y = 10; },
    trial => { trial.pendingSegment.step.positions.player3.y = 44; },
    trial => { trial.pendingSegment.previous.positions.player3.y = 44; },
    trial => { trial.pendingSegment.step.shot.contact.feet[0].y = 20; }
  ]) {
    const document = model2Document({ ending: 'winner' }), state = createPlanningStateV2(document);
    const trial = trialRecipeV2(state, document.shots[0], { capturePendingEvents: true });
    mutate(trial);
    const before = JSON.stringify(state);
    assert.throws(() => inspectPlanningTrialEventsV2(state, trial), /mutated or are unsupported/);
    assert.equal(JSON.stringify(state), before);
  }
});


const bodyRecords = candidates => candidates.filter(candidate => candidate.reason === 'body').map(
  ({ struckActor, afterContactSeconds, position }) => ({ struckActor, afterContactSeconds, position }));
const actors = ['player1', 'player2', 'player3', 'player4'];
for (const { id } of MODEL2_CASES) test(`selective trial body paths match all represented bodies for ${id}`, () => {
  const document = readModel2Fixture(id), state = createPlanningStateV2(document);
  for (let index = 0; index < document.shots.length; index++) {
    const trial = trialRecipeV2(state, document.shots[index], { capturePendingEvents: true });
    assert.equal(trial.ok, true, JSON.stringify(trial.findings));
    const before = JSON.stringify(state), source = JSON.stringify(trial);
    const full = inspectPlanningTrialEventsV2(state, trial);
    const expected = bodyRecords(full.physicalCandidates.filter(candidate => candidate.shotId === document.shots[index].id));
    assert.deepEqual(inspectPlanningTrialBodyV2(state, trial, { actors }), expected);
    for (const actor of actors) assert.deepEqual(inspectPlanningTrialBodyV2(state, trial, { actors: [actor] }),
      expected.filter(record => record.struckActor === actor));
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(trial), source);
    commitPlanningTrialV2(state, trial);
  }
});

test('selective body API retains post-bounce contact, guards tokens and rejects invalid actor IDs', () => {
  const document = model2Document({ ending: 'winner' });
  document.initialLayout.player3 = { x: 7, y: 32 };
  const state = createPlanningStateV2(document), trial = trialRecipeV2(state, document.shots[0], { capturePendingEvents: true });
  const body = inspectPlanningTrialBodyV2(state, trial, { actors: ['player3'] })[0];
  assert.ok(body.afterContactSeconds > trial.flight.firstLandingTime);
  for (const invalid of [undefined, ['unknown'], ['player1', 'player1'], [null]])
    assert.throws(() => inspectPlanningTrialBodyV2(state, trial, { actors: invalid }), /player IDs/);
  assert.throws(() => inspectPlanningTrialBodyV2(state, { ...trial }, { actors }), /different or stale/);
  assert.throws(() => inspectPlanningTrialBodyV2(createPlanningStateV2(document), trial, { actors }), /different or stale/);
  const failed = trialRecipeV2(state, { ...document.shots[0], target: { x: NaN, y: 30 } });
  assert.throws(() => inspectPlanningTrialBodyV2(state, failed, { actors }), /valid built/);
  const changed = trialRecipeV2(state, document.shots[0], { capturePendingEvents: true });
  changed.pendingSegment.step.shot.physicsV2.target.y = 12;
  assert.throws(() => inspectPlanningTrialBodyV2(state, changed, { actors }), /mutated or are unsupported/);
  commitPlanningTrialV2(state, trial);
  assert.throws(() => inspectPlanningTrialBodyV2(state, trial, { actors }), /different or stale/);
  const full = inspectPendingEventsV2(state);
  assert.deepEqual(inspectBodyPathV2(full.segment, full.solved, ['player3']), [body]);
});

test('selective feasibility invokes only the requested body sweeps without terminal reach or full inspection', async () => {
  const document = model2Document({ ending: 'winner' }), state = createPlanningStateV2(document);
  const trial = trialRecipeV2(state, document.shots[0], { capturePendingEvents: true });
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params,
    (error, result) => error ? reject(error) : resolve(result)));
  let coverage;
  try {
    await post('Profiler.enable'); await post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
    inspectPlanningTrialBodyV2(state, trial, { actors: ['player1', 'player2'] });
    coverage = await post('Profiler.takePreciseCoverage');
    await post('Profiler.stopPreciseCoverage'); await post('Profiler.disable');
  } finally { session.disconnect(); }
  const calls = name => coverage.result.filter(script => script.url.endsWith('/play-outcome-v2.js'))
    .flatMap(script => script.functions).filter(fn => fn.functionName === name).reduce((sum, fn) => sum + fn.ranges[0].count, 0);
  assert.equal(calls('bodyContact'), 2);
  assert.equal(calls('assessTerminalReach'), 0);
  assert.equal(calls('inspectModel2SegmentV2'), 0);
});
