import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFlightParametersV1 } from '../rally-targets.js';
import { applyExecutionV1, resolveDeliveredFlightV1 } from '../rally-quality.js';
import { solveFlightV2 } from '../play-physics-v2.js';
import { planMovementV1, replanMovementV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { simulateRally } from '../rally-engine.js';

const candidate = arc => ({ id: 'return-deep-middle', family: 'return', intent: 'deep-return', pace: 'medium', arc });
const reflect = p => ({ ...p, x: 20 - p.x, y: 44 - p.y });
const setup = team => ({ team, contact: team === 'green' ? { x: 5.8, y: 0, heightFeet: 1.5 } : reflect({ x: 5.8, y: 0, heightFeet: 1.5 }),
  target: team === 'green' ? { x: 10, y: 39 } : reflect({ x: 10, y: 39 }) });
function delivered(input, quality, arc = 'high', errorReason = null) {
  const selected = candidate(arc), nominal = resolveFlightParametersV1({ ...input, candidate: selected });
  const execution = { quality, errorReason }, draws = { lateral: .8, depth: .2 };
  const applied = applyExecutionV1({ ...input, candidate: selected, family: 'return', intent: 'deep-return', pace: 'medium', arc,
    physics: nominal.physics, execution, draws });
  const result = resolveDeliveredFlightV1({ ...input, candidate: selected, execution, applied });
  const independent = solveFlightV2({ from: input.contact, target: result.applied.target, physics: result.applied.physics,
    family: 'return', pace: 'medium', arc, quality });
  return { nominal, execution, draws, applied, result, independent };
}

for (const team of ['green', 'orange']) test(`high-return intent keeps its coherent loft and buys time at the ${team} end`, () => {
  const input = setup(team), before = JSON.stringify(input);
  for (const style of ['pro', 'advanced', 'intermediate']) {
    const high = resolveFlightParametersV1({ ...input, style, candidate: candidate('high') });
    const medium = resolveFlightParametersV1({ ...input, style, candidate: candidate('medium') });
    assert.ok(Math.abs(high.flight.metadata.apexFeet - 7.6) < 1e-6, 'honor the existing high-return apex preference');
    assert.ok(high.flight.firstLandingTime > medium.flight.firstLandingTime + .25);
    assert.equal(high.flight.obstruction, null);
    assert.ok(high.flight.launchSpeedMph <= high.planner.diagnostics.speedCeilingMph);
    assert.ok(high.flight.metadata.netClearanceInches > medium.flight.metadata.netClearanceInches);
  }
  for (const quality of ['neutral', 'excellent', 'low']) {
    const high = delivered(input, quality), medium = delivered(input, quality, 'medium');
    assert.deepEqual(high.applied.target, medium.applied.target, 'the same quality and perturbation draws retain target precision');
    assert.equal(high.applied.quality, quality);
    assert.equal(high.applied.physicalTransformation.requestedClearanceFeet, null);
    assert.equal(high.applied.preferredFlight.launchVerticalFeetPerSecond, high.nominal.physics.launchVerticalFeetPerSecond);
    assert.ok(high.independent.metadata.apexFeet > 7, 'controlled quality must not flatten a chosen high return');
    assert.ok(high.independent.firstLandingTime > medium.independent.firstLandingTime + .25);
    assert.equal(high.independent.obstruction, null);
    if (quality !== 'neutral') assert.equal(medium.applied.physicalTransformation.kind, 'controlled-clearance');
  }
  assert.equal(JSON.stringify(input), before);
});

test('high-return execution preserves sampled errors and their exact target perturbation', () => {
  for (const team of ['green', 'orange']) for (const reason of ['net', 'long', 'wide']) {
    const input = setup(team), high = delivered(input, 'error', 'high', reason), medium = delivered(input, 'error', 'medium', reason);
    assert.deepEqual(high.applied.target, medium.applied.target);
    assert.equal(high.applied.quality, 'error');
    assert.equal(high.applied.intendedError, reason);
    if (reason === 'net') {
      assert.equal(high.applied.physicalTransformation.requestedClearanceFeet, -1.5);
      assert.equal(high.independent.terminal.reason, 'net');
    } else if (reason === 'long') assert.ok(high.independent.landing.y < 0 || high.independent.landing.y > 44);
    else assert.ok(high.independent.landing.x < 0 || high.independent.landing.x > 20);
  }
});

test('extra return airtime permits more bounded approach without moving the line or changing contact feet', () => {
  const input = setup('green'), players = Object.fromEntries([1, 2, 3, 4].map(i => [`player${i}`, { team: i < 3 ? 'green' : 'orange', handedness: 'right' }]));
  const positions = { player1: { x: 5, y: 2 }, player2: { x: 15, y: 14 }, player3: { x: 5, y: 45 }, player4: { x: 15, y: 45 } };
  const feet = [{ x: 5.42, y: 2 }, { x: 4.58, y: 2 }];
  const results = {};
  for (const arc of ['medium', 'high']) {
    const delivery = delivered(input, 'neutral', arc);
    const duration = delivery.independent.firstLandingTime + .24; // Explicit bounced third-contact opportunity, not a fabricated volley.
    const plan = planMovementV1({ ...input, positions, players, hitter: 'player1', durationSeconds: duration, contactTime: 0,
      index: 1, service: { server: 'player3', receiver: 'player1' }, opening: 'serve', family: 'return', intent: 'deep-return',
      quality: 'neutral', pace: 'medium', kind: 'groundstroke', contactFeet: feet, peakFeetPerSecond: 17.95 });
    assert.equal(plan.ok, true);
    const segment = { modelVersion: 2, startTime: 0, endTime: duration, duration, originalDuration: duration, contactTime: 0,
      previous: { positions }, step: { id: 'return', positions: plan.positions }, shotSemantics: { playerId: 'player1', contact: { feet } }, model2Momentum: [] };
    const replanned = replanMovementV1({ plan, segment, players, durationSeconds: duration, peakFeetPerSecond: 17.95 });
    assert.equal(replanned.ok, true);
    assert.deepEqual(replanned.positions.player1, plan.positions.player1);
    assert.equal(inspectGeneratedMovementV1(segment).valid, true);
    assert.equal(inspectGeneratedSpacingV1(segment).valid, true);
    assert.equal(plan.diagnostics.goals.player1.y, 14.25);
    assert.deepEqual(plan.contactEvidence.feet, feet);
    results[arc] = plan.positions.player1.y;
  }
  assert.ok(results.high > results.medium + 2, 'slower return flight buys actual approach, not an aggregate up-count adjustment');
});

test('a generated high-return causal case is repeatable without conditioning its winner or rerolling execution', async () => {
  const input = { seed: 50000, players: Object.fromEntries([1, 2, 3, 4].map(i => [`player${i}`, { team: i < 3 ? 'green' : 'orange', handedness: 'right', style: 'pro', flavour: 'balanced' }])),
    service: { server: 'player1', receiver: 'player3', court: 'right', courtConvention: 'server-perspective-v1' },
    options: { lengthFeel: 'natural', winner: 'either', signatureShots: true, maxShots: 99 } };
  const first = await simulateRally(input), second = await simulateRally(input);
  assert.equal(first.status, 'complete');
  assert.deepEqual(second, first);
  assert.equal(first.document.shots[1].arc, 'high');
  assert.equal(first.decisions[1].execution.quality, 'neutral');
  assert.ok(first.decisions[1].resolution.deliveredGuidance.actual.apexFeet > 7);
  assert.equal(first.decisions[1].execution.draw, first.decisions[1].draws.execution.quality);
});
