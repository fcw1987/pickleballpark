import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeliveredFlightV1 } from '../rally-quality.js';
import { planRallyFlightV1 } from '../rally-flight-planner.js';
import { solveFlightV2, PHYSICS_V2 } from '../play-physics-v2.js';

const fixed = () => ({ candidate: { family: 'dink', intent: 'straight-dink', pace: 'soft', arc: 'medium' },
  contact: { x: -2.5, y: 26.8, heightFeet: 1.62 }, team: 'orange',
  execution: { quality: 'error', errorReason: 'wide', draw: .09314089035615325, errorDraw: .8472760086879134 },
  applied: { target: { x: -2.89, y: 18.03 }, quality: 'error', intendedError: 'wide', route: 'over-net',
    intent: 'straight-dink', pace: 'soft', arc: 'medium', preferredFlight: { launchVerticalFeetPerSecond: 12.163119475 },
    draws: { lateral: .7977281191851944, depth: .5543470913544297 } } });
const mirror = input => {
  const result = structuredClone(input);
  for (const point of [result.contact, result.applied.target]) { point.x = 20 - point.x; point.y = 44 - point.y; }
  result.team = result.team === 'orange' ? 'green' : 'orange';
  return result;
};

test('fixed wide delivery derives actual route in both directions without changing draws, intent or source', () => {
  for (const input of [fixed(), mirror(fixed())]) {
    const before = structuredClone(input), result = resolveDeliveredFlightV1(input);
    assert.deepEqual(input, before);
    assert.deepEqual(result.applied.target, before.applied.target);
    assert.deepEqual(result.applied.draws, before.applied.draws);
    assert.equal(result.applied.route, 'over-net');
    assert.equal(result.applied.intent, 'straight-dink');
    assert.equal(result.applied.quality, 'error');
    assert.equal(result.guidance.nominalRoute, 'over-net');
    assert.equal(result.guidance.deliveredRoute, 'around-the-post');
    assert.equal(result.guidance.incidentalAroundPost, true);
    for (const solution of result.solutions) {
      assert.equal(solution.evidence.actual.aroundPost, true);
      assert.equal(solution.evidence.intendedError, 'wide');
      assert.deepEqual(solution.flight.target, before.applied.target);
      assert.ok(solution.flight.launchSpeedMph <= 25);
      assert.ok(solution.flight.metadata.apexFeet <= 30);
      assert.ok(Math.abs(solution.flight.metadata.launchVerticalFeetPerSecond) <= 80);
      const replay = solveFlightV2({ from: input.contact, target: input.applied.target, family: 'dink', quality: 'error',
        pace: 'soft', arc: 'medium', physics: solution.applied.physics });
      assert.deepEqual(replay.terminal, solution.flight.terminal);
      assert.deepEqual(replay.obstruction, solution.flight.obstruction);
      assert.deepEqual(replay.landing, solution.flight.landing);
    }
    assert.deepEqual(resolveDeliveredFlightV1(input).guidance, result.guidance);
  }
});

test('nominal over-net and non-wide deliveries do not gain incidental ATP admission', () => {
  const input = fixed();
  assert.equal(planRallyFlightV1({ from: input.contact, target: input.applied.target, family: 'dink', quality: 'error', errorReason: 'wide' }).status, 'unavailable');
  for (const execution of [{ quality: 'neutral' }, { quality: 'error', errorReason: 'long' }, { quality: 'error', errorReason: 'net' }]) {
    assert.throws(() => resolveDeliveredFlightV1({ ...input, execution }), /Delivered flight unavailable/);
  }
  const nominalATP = { ...input, route: 'around-the-post', contact: { x: 10, y: 26.8, heightFeet: 1.62 }, applied: { ...input.applied, target: { x: 10, y: 18 } } };
  assert.throws(() => resolveDeliveredFlightV1(nominalATP), /wholly outside a post/);
});

test('wide error on over-net chord retains independently solved earlier mesh fault', () => {
  for (const input of [fixed(), mirror(fixed())]) {
    input.contact.x = 7; input.contact.y = input.team === 'orange' ? 30 : 14; input.contact.heightFeet = 2.2;
    input.applied.target = { x: -3, y: input.team === 'orange' ? 9 : 35 };
    input.applied.preferredFlight = { clearanceFeet: -1.5 };
    const result = resolveDeliveredFlightV1(input);
    assert.equal(result.guidance.incidentalAroundPost, false);
    assert.equal(result.guidance.deliveredRoute, 'over-net');
    assert.equal(result.flight.obstruction.kind, 'net');
    assert.equal(result.flight.terminal.reason, 'net');
    assert.equal(result.evidence.intendedError, 'wide');
    assert.deepEqual(result.flight.target, input.applied.target);
  }
});

test('post and net-gap chords never acquire incidental around-post permission', () => {
  for (const planeX of [-1.125, -.876, -.5, 21.125, 20.876, 20.5]) {
    const input = fixed(); input.contact = { x: planeX, y: 24, heightFeet: PHYSICS_V2.ballRadiusFeet + .001 };
    input.applied.target = { x: planeX, y: 20 };
    input.applied.preferredFlight = { launchVerticalFeetPerSecond: -79 };
    const result = resolveDeliveredFlightV1(input);
    assert.equal(result.guidance.incidentalAroundPost, false);
    assert.equal(result.guidance.deliveredRoute, 'over-net');
    for (const solution of result.solutions) {
      assert.ok(!solution.flight.obstruction || solution.flight.obstruction.kind === 'net');
      if (!solution.flight.obstruction) {
        assert.equal(solution.evidence.actual.aroundPost, false);
        assert.ok(solution.evidence.actual.clearanceFeet >= 0);
      }
    }
  }
});
