import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPressureV1, sampleExecutionV1, applyExecutionV1, classifyOutcomeV1 } from '../rally-quality.js';
import { solveFlightV2 } from '../play-physics-v2.js';
const profile = { execution: { kitchen: { error: .1, attackable: .1, excellent: .1, low: .1 } }, pressureErrorScale: .2, errorWeights: { net: .5, long: .3, wide: .2 } };
const outcome = { type: 'fault', reason: 'net', shotId: 'shot-7', faultingActor: 'player1' };

test('pressure derives from actual reach, time, motion and incoming speed rather than execution labels', () => {
  const easy = assessPressureV1({ contact: { x: 7, y: 14, heightFeet: 2 }, position: { x: 7, y: 14 }, availableSeconds: 1 });
  const hard = assessPressureV1({ contact: { x: 14, y: 14, heightFeet: .7 }, position: { x: 7, y: 14 }, availableSeconds: .25,
    incomingFlight: { launchSpeedMph: 40 }, incomingIntent: 'speed-up', movementSpeedFeetPerSecond: 12 });
  assert.ok(hard.score > easy.score); assert.ok(hard.reachMarginFeet < easy.reachMarginFeet);
  assert.equal(hard.reachable, false); assert.equal(hard.contactHeightFeet, .7); assert.equal(hard.incomingSpeedMph, 40);
});

test('supplied execution draws are deterministic, bounded and cannot mutate the input pressure', () => {
  const situation = { phase: 'kitchen', pressure: { score: .5, availableSeconds: .3 } }, before = JSON.stringify(situation);
  const a = sampleExecutionV1({ profile, situation, draws: { quality: .05, error: .9 } });
  const b = sampleExecutionV1({ profile, situation, draws: { quality: .05, error: .9 } });
  assert.deepEqual(a, b); assert.equal(a.quality, 'error'); assert.equal(a.errorReason, 'wide');
  assert.equal(JSON.stringify(situation), before); assert.equal(Object.isFrozen(situation.pressure), false);
  assert.ok(Math.abs(Object.values(a.probabilities).reduce((x, y) => x + y) - 1) < 1e-9);
  for (const bad of [-1, 1, NaN]) assert.throws(() => sampleExecutionV1({ profile, situation, draws: { quality: bad, error: .5 } }), /draw/);
});

test('neutral receives unallocated probability and pressure increases risk without exceeding 1', () => {
  const low = sampleExecutionV1({ profile, situation: { phase: 'kitchen', pressure: { score: 0 } }, draws: { quality: .9 } });
  const high = sampleExecutionV1({ profile, situation: { phase: 'kitchen', pressure: { score: 1 } }, draws: { quality: .9 } });
  assert.equal(low.quality, 'neutral'); assert.ok(high.probabilities.error > low.probabilities.error);
  assert.ok(Object.values(high.probabilities).every(p => p >= 0 && p <= 1));
  assert.throws(() => sampleExecutionV1({ profile: { execution: { kitchen: { error: .8, excellent: .5 } } }, draws: { quality: .5 } }), /probabilities/);
});

test('error perturbations produce source parameters whose actual solver can demonstrate net, long and wide', () => {
  for (const team of ['green', 'orange']) for (const reason of ['net', 'long', 'wide']) {
    const contact = { x: 7, y: team === 'green' ? 14 : 30, heightFeet: 2.2 }, target = { x: 7, y: team === 'green' ? 35 : 9 };
    const result = applyExecutionV1({ execution: { quality: 'error', errorReason: reason }, contact, target, team,
      physics: { apexFeet: 6 }, draws: { lateral: .6, depth: .5 } });
    const solved = solveFlightV2({ from: contact, target: result.target, family: 'drive', physics: result.physics });
    assert.equal(result.intendedError, reason);
    if (reason === 'net') assert.equal(solved.terminal.reason, 'net');
    if (reason === 'long') assert.ok(solved.landing.y < 0 || solved.landing.y > 44);
    if (reason === 'wide') assert.ok(solved.landing.x < 0 || solved.landing.x > 20);
  }
});

test('execution never overwrites contact height or manufactures an outcome', () => {
  const contact = { x: 7, y: 14, heightFeet: 4.1 }, target = { x: 8, y: 32 }, before = JSON.stringify({ contact, target });
  const result = applyExecutionV1({ execution: { quality: 'attackable', errorReason: null }, contact, target, team: 'green', physics: { apexFeet: 5 }, draws: { lateral: .5, depth: .5 } });
  assert.equal(result.physics.apexFeet, 5.6); assert.equal(JSON.stringify({ contact, target }), before);
  assert.equal('outcome' in result, false); assert.equal('heightFeet' in result, false);
  assert.throws(() => applyExecutionV1({ execution: { quality: 'error' }, contact, target, team: 'green', draws: { lateral: .5, depth: .5 } }), /reason/);
});

test('a quality roll alone is insufficient evidence of forced causation', () => {
  const unknown = classifyOutcomeV1({ outcome, execution: { quality: 'error' } });
  assert.equal(unknown.kind, 'unknown'); assert.equal(unknown.version, 'rally-causation-v1'); assert.equal(unknown.evidence.heuristic, true);
  const vague = classifyOutcomeV1({ outcome, execution: { quality: 'error' }, pressure: { score: 1 }, pressureDecisionId: 'previous', previousIntent: 'speed-up' });
  assert.equal(vague.kind, 'unknown');
  const forced = classifyOutcomeV1({ outcome, pressureDecisionId: 'decision-6', previousIntent: 'speed-up', pressure: {
    score: .8, reachMarginFeet: .7, availableSeconds: .25, movementSpeedFeetPerSecond: 10, incomingSpeedMph: 38, contactHeightFeet: .8,
  } });
  assert.equal(forced.kind, 'forced-error'); assert.equal(forced.pressureDecisionId, 'decision-6'); assert.equal(forced.actor, 'player1');
  assert.deepEqual(outcome, { type: 'fault', reason: 'net', shotId: 'shot-7', faultingActor: 'player1' });
});

test('unforced errors require represented low pressure and rule faults stay separate', () => {
  const pressure = { score: .1, reachMarginFeet: 4, availableSeconds: 1, movementSpeedFeetPerSecond: 0, incomingSpeedMph: 10, contactHeightFeet: 2 };
  assert.equal(classifyOutcomeV1({ outcome, pressure, execution: { quality: 'error' } }).kind, 'unforced-error');
  assert.equal(classifyOutcomeV1({ outcome, pressure, execution: { quality: 'excellent' } }).kind, 'unknown');
  assert.equal(classifyOutcomeV1({ outcome: { ...outcome, reason: 'nvz-foot' }, pressure }).kind, 'rule-fault');
  const winner = classifyOutcomeV1({ outcome: { ...outcome, type: 'winner', reason: 'unreachable', faultingActor: null }, actor: 'player2' });
  assert.equal(winner.kind, 'winner'); assert.equal(winner.actor, 'player2');
});


test('missing actual geometry and unknown phases fail rather than inventing neutral inputs', () => {
  assert.throws(() => assessPressureV1({ contact: { x: 7, y: 14 }, position: { x: 7, y: 14 } }), /actual.*height/);
  assert.throws(() => sampleExecutionV1({ profile, situation: { phase: 'invented' }, draws: { quality: .5 } }), /phase/);
});

test('net-error execution uses coherent shared mesh contact even just above the ball radius', () => {
  for (const team of ['green', 'orange']) for (const ownDepth of [5, 14.25]) for (const heightFeet of [.12140107611548556, .13, 2.2, 7.5, 18, 30]) {
    const contact = { x: 7, y: team === 'green' ? ownDepth : 44 - ownDepth, heightFeet };
    const target = { x: 10, y: team === 'green' ? 35 : 9 }, execution = { quality: 'error', errorReason: 'net' };
    const before = JSON.stringify({ contact, target, execution });
    const result = applyExecutionV1({ execution, contact, target, team, physics: { apexFeet: 30 }, draws: { lateral: .5, depth: .5 } });
    const solved = solveFlightV2({ from: contact, target: result.target, family: 'drive', quality: result.quality, physics: result.physics });
    assert.equal(solved.obstruction.kind, 'net'); assert.equal(solved.terminal.reason, 'net');
    assert.ok(solved.launchSpeedMph < 50, `${team}/${ownDepth}/${heightFeet}: ${solved.launchSpeedMph}mph`);
    assert.ok(solved.metadata.apexFeet <= 30); assert.ok(solved.totalDuration > .02);
    assert.ok(team === 'green' ? result.target.y > 22 : result.target.y < 22);
    assert.ok(Math.abs(result.target.y - 22) <= .6 + 1e-9);
    assert.equal(result.quality, 'error'); assert.equal(JSON.stringify({ contact, target, execution }), before);
    assert.equal('outcome' in result, false);
  }
});

test('an unavailable bounded net solve fails without changing source quality or inventing a terminal outcome', () => {
  const input = { execution: { quality: 'error', errorReason: 'net' }, contact: { x: 7, y: 21.5, heightFeet: 30 },
    target: { x: 10, y: 35 }, team: 'green', draws: { lateral: .5, depth: .5 } };
  const before = JSON.stringify(input);
  assert.throws(() => applyExecutionV1(input), /six shared-solver trials/);
  assert.equal(JSON.stringify(input), before);
});

test('self-paced serve preparation retains real facts without incoming reaction-time pressure', () => {
  const source = { contact: { x: 5, y: -.75, heightFeet: 2.2 }, position: { x: 5, y: -.75 }, availableSeconds: .2 };
  const reactive = assessPressureV1(source), selfPaced = assessPressureV1({ ...source, selfPaced: true });
  assert.deepEqual(assessPressureV1({ ...source, selfPaced: false }), reactive);
  assert.ok(reactive.score > 0); assert.equal(selfPaced.score, 0);
  assert.equal(selfPaced.availableSeconds, .2); assert.equal(selfPaced.contactHeightFeet, 2.2);
  assert.equal(selfPaced.reachMarginFeet, reactive.reachMarginFeet); assert.equal(selfPaced.distanceFeet, reactive.distanceFeet);
  assert.equal(selfPaced.reachable, reactive.reachable); assert.equal(selfPaced.selfPaced, true);
  assert.equal(selfPaced.factors.reachLoad, 0); assert.equal(selfPaced.factors.shortTime, 0);
  assert.throws(() => assessPressureV1({ ...source, selfPaced: 'true' }), /boolean/);
});
