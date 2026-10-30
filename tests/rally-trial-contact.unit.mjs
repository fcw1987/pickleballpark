import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from 'node:inspector';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2, inspectPlanningTrialEventsV2,
  inspectPlanningTrialBodyV2, inspectPlanningTrialContactV2 } from '../play-planning-v2.js';
import { MODEL2_CASES, readModel2Fixture } from './fixtures/model2/cases.mjs';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

for (const { id } of MODEL2_CASES) test(`current contact inspection matches existing full inspection for ${id}`, () => {
  const document = readModel2Fixture(id), state = createPlanningStateV2(document);
  for (const recipe of document.shots) {
    const trial = trialRecipeV2(state, recipe, { capturePendingEvents: true });
    assert.equal(trial.ok, true, JSON.stringify(trial.findings));
    const before = JSON.stringify(state), source = JSON.stringify(trial);
    const full = inspectPlanningTrialEventsV2(state, trial), contact = inspectPlanningTrialContactV2(state, trial);
    assert.deepEqual(contact.violations, full.violations.filter(issue => issue.stepId === recipe.id));
    assert.deepEqual(contact.physicalCandidates, full.physicalCandidates.filter(candidate =>
      candidate.shotId === recipe.id && ['nvz-foot', 'two-bounce'].includes(candidate.reason)));
    assert.deepEqual(contact.momentumCandidates, full.momentumCandidates.filter(candidate => candidate.shotId === recipe.id));
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(trial), source);
    commitPlanningTrialV2(state, trial);
  }
});

function boundaryTrial(margin) {
  const document = model2Document({ ending: 'winner' });
  document.initialLayout.player3 = { x: 12, y: 34 };
  const state = createPlanningStateV2(document);
  commitPlanningTrialV2(state, trialRecipeV2(state, document.shots[0]));
  const incoming = state.solved[0];
  const recipe = model2Shot({ id: 'reply', hitter: 'player3', target: { x: 7, y: 14 }, contactMode: 'bounced',
    contactTiming: { afterBounceSeconds: incoming.secondBounceTime - incoming.firstLandingTime - margin } });
  return { state, incoming, trial: trialRecipeV2(state, recipe, { capturePendingEvents: true }) };
}

test('current contact preserves the independent 1e-7 late-contact guard inside the interceptor boundary', () => {
  const { state, incoming, trial } = boundaryTrial(5e-8);
  assert.equal(trial.ok, true, JSON.stringify(trial.findings));
  const actual = trial.resolvedPrevious.step.shot.physicsV2.endTimeSeconds;
  assert.ok(actual < incoming.secondBounceTime - 1e-8, 'the interceptor accepts this contact');
  assert.ok(actual >= incoming.secondBounceTime - 1e-7, 'the independent rule still rejects it');
  assert.deepEqual(inspectPlanningTrialContactV2(state, trial).violations.map(issue => issue.code), ['late-contact']);
  const earlier = boundaryTrial(2e-7);
  assert.equal(earlier.trial.ok, true);
  assert.deepEqual(inspectPlanningTrialContactV2(earlier.state, earlier.trial).violations, []);
  const later = boundaryTrial(5e-9);
  assert.equal(later.trial.ok, false, 'the interceptor tolerance remains unchanged');
});

test('contact trial boundary rejects unsupported tokens and mutated physical source', () => {
  const { state, trial } = boundaryTrial(2e-7);
  assert.throws(() => inspectPlanningTrialContactV2(state, { ...trial }), /different or stale/);
  assert.throws(() => inspectPlanningTrialContactV2(createPlanningStateV2(model2Document()), trial), /different or stale/);
  const failed = trialRecipeV2(state, { id: 'broken' }, { capturePendingEvents: true });
  assert.throws(() => inspectPlanningTrialContactV2(state, failed), /valid built/);
  trial.pendingSegment.step.shot.physicsV2.target.y += 1;
  assert.throws(() => inspectPlanningTrialContactV2(state, trial), /mutated or are unsupported/);
  const fresh = boundaryTrial(2e-7);
  commitPlanningTrialV2(fresh.state, fresh.trial);
  assert.throws(() => inspectPlanningTrialContactV2(fresh.state, fresh.trial), /different or stale/);
});

test('contact validation adds no body sweep, full inspection or terminal reach work', async () => {
  const { state, trial } = boundaryTrial(2e-7), session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params,
    (error, result) => error ? reject(error) : resolve(result)));
  let coverage;
  try {
    await post('Profiler.enable'); await post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
    inspectPlanningTrialContactV2(state, trial);
    inspectPlanningTrialBodyV2(state, trial, { actors: ['player3', 'player4'] });
    coverage = await post('Profiler.takePreciseCoverage');
    await post('Profiler.stopPreciseCoverage'); await post('Profiler.disable');
  } finally { session.disconnect(); }
  const calls = name => coverage.result.filter(script => script.url.endsWith('/play-outcome-v2.js'))
    .flatMap(script => script.functions).filter(fn => fn.functionName === name).reduce((sum, fn) => sum + fn.ranges[0].count, 0);
  assert.equal(calls('verifySegment'), 1);
  assert.equal(calls('contactCandidates'), 1);
  assert.equal(calls('bodyContact'), 2, 'only the explicit body helper performs its two requested sweeps');
  assert.equal(calls('inspectModel2SegmentV2'), 0);
  assert.equal(calls('assessTerminalReach'), 0);
});
