import test from 'node:test';
import assert from 'node:assert/strict';
import { applyExecutionV1, resolveDeliveredFlightV1, sampleExecutionV1, PHYSICAL_TRANSFORMATION_VERSION } from '../rally-quality.js';
import { solveFlightV2, PHYSICS_V2 } from '../play-physics-v2.js';
import { generationFlightCeilingMphV1, MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET } from '../rally-flight-planner.js';
import { simulateRally } from '../rally-engine.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const execution = Object.freeze({ quality: 'error', errorReason: 'net', draw: .14760705386288464, errorDraw: .19165906263515353 });
// Intermediate 50907, contact 4. Copy the exact geometry/draws rather than
// depending on a mutable development archive or changing a historical fixture.
const regression = {
  contact: { x: 15.608601122, y: 16.689006524, heightFeet: 3.0356109 },
  target: { x: 7.229289123, y: 43.2 }, team: 'green', execution,
  family: 'volley', intent: 'counter', pace: 'firm', arc: 'low', style: 'intermediate',
  physics: { launchVerticalFeetPerSecond: 11.729184306 },
  draws: { lateral: .9123134568799287, depth: .49720122921280563 },
};
function mirrored(input, acrossNet = false, acrossCourt = false) {
  const result = structuredClone(input);
  for (const p of [result.contact, result.target]) {
    if (acrossNet) p.y = 44 - p.y;
    if (acrossCourt) p.x = 20 - p.x;
  }
  if (acrossNet) result.team = input.team === 'green' ? 'orange' : 'green';
  return result;
}
function assertHeading(contact, original, actual) {
  const a = { x: original.x - contact.x, y: original.y - contact.y };
  const b = { x: actual.x - contact.x, y: actual.y - contact.y };
  near(a.x * b.y - a.y * b.x, 0, 1e-8);
  assert.ok(a.x * b.x + a.y * b.y > 0, 'the direction cannot reverse');
  near(contact.x + a.x * (22 - contact.y) / a.y, contact.x + b.x * (22 - contact.y) / b.y);
}
function deliver(input, applied = applyExecutionV1(input)) {
  return resolveDeliveredFlightV1({ candidate: { family: input.family, intent: input.intent ?? input.family },
    contact: input.contact, team: input.team, style: input.style ?? 'advanced', execution: input.execution, applied });
}
function assertNet(input, result) {
  assert.equal(result.flight.obstruction?.kind, 'net');
  assert.equal(result.flight.terminal?.reason, 'net');
  assert.equal(result.guidance.accepted, true);
  assert.ok(result.guidance.trials.length <= MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET);
  assert.ok(result.guidance.plannerDiagnostics.solverCalls <= MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET);
  const ceiling = generationFlightCeilingMphV1({ family: input.family, intent: input.intent ?? input.family,
    style: input.style ?? 'advanced', quality: 'error' });
  assert.ok(result.flight.launchSpeedMph > 0 && result.flight.launchSpeedMph <= ceiling);
  assert.ok(result.flight.metadata.apexFeet <= 30);
  assertHeading(input.contact, input.target, result.applied.target);
  near(result.flight.stages[0].vx / result.flight.stages[0].vz,
    (input.target.x - input.contact.x) / (input.target.y - input.contact.y));
  const independent = solveFlightV2({ from: input.contact, ...result.applied, family: input.family });
  assert.deepEqual(independent.obstruction, result.flight.obstruction);
  assert.deepEqual(independent.terminal, result.flight.terminal);
  assert.deepEqual(independent.metadata, result.flight.metadata);
  for (const fraction of [0, .25, .75, 1]) assert.deepEqual(
    independent.sampleBoard(fraction * independent.firstLandingTime),
    result.flight.sampleBoard(fraction * result.flight.firstLandingTime));
}

test('sampled net errors retain the nominal horizontal heading in both end and lateral mirrors', () => {
  assert.equal(PHYSICAL_TRANSFORMATION_VERSION, 'rally-execution-physical-v4');
  for (const acrossNet of [false, true]) for (const acrossCourt of [false, true]) {
    const input = mirrored(regression, acrossNet, acrossCourt), before = structuredClone(input);
    const applied = applyExecutionV1(input), result = deliver(input, applied);
    near(applied.target.x, acrossCourt ? 20 - 13.787993144 : 13.787993144);
    near(applied.target.y, acrossNet ? 44 - 22.449160369 : 22.449160369);
    assert.deepEqual(applied.preferredFlight, { clearanceFeet: -1.5 });
    assert.equal(applied.quality, 'error'); assert.equal(applied.intendedError, 'net');
    assert.equal(applied.physicalTransformation.kind, 'net-mesh');
    assert.equal(applied.physicalTransformation.version, 'rally-execution-physical-v4');
    assert.deepEqual(applied.physicalTransformation.sourceContact, input.contact);
    assert.deepEqual(applied.physicalTransformation.sourceTarget, input.target);
    assert.deepEqual(applied.physicalTransformation.sourcePhysics, input.physics);
    assert.equal(applied.physicalTransformation.requestedClearanceFeet, -1.5);
    assert.equal(applied.physicalTransformation.physics, null);
    assert.deepEqual(applied.physicalTransformation.solveAttempts, []);
    assert.equal('outcome' in applied, false);
    assert.ok(Object.isFrozen(applied.target)); assert.ok(Object.isFrozen(applied.physicalTransformation));
    assertNet(input, result);
    assert.deepEqual(input, before); assert.equal(Object.isFrozen(input.target), false);
  }
});

test('all families retain net impacts and physical bounds without an artificial lateral mesh clamp', () => {
  let solved = 0;
  for (const family of ['serve', 'return', 'drive', 'drop', 'dink', 'reset', 'lob', 'volley', 'overhead'])
    for (const x of [-.87, .25, 10, 19.75, 20.87]) for (const acrossNet of [false, true])
      for (const depth of [0, .5, 1 - Number.EPSILON]) {
        const input = mirrored({ ...regression, family, intent: family, contact: { x, y: 14, heightFeet: family === 'overhead' ? 7.5 : 2.2 },
          target: { x, y: 38 }, draws: { lateral: .1, depth } }, acrossNet);
        const result = deliver(input);
        assertNet(input, result); near(result.applied.target.x, x);
        near(Math.abs(result.applied.target.y - 22), .3 + .3 * depth);
        assert.ok(Math.abs(result.applied.target.y - 22) >= .3 - 1e-12);
        assert.ok(Math.abs(result.applied.target.y - 22) <= .6 + 1e-12);
        solved++;
      }
  assert.equal(solved, 270);
});

test('one supplied target draw pair is read once and repeated application neither rerolls nor mutates', () => {
  const reads = { lateral: 0, depth: 0 }, input = structuredClone(regression);
  const draws = Object.fromEntries(Object.entries(input.draws));
  input.draws = Object.defineProperties({}, Object.fromEntries(Object.entries(draws).map(([key, value]) =>
    [key, { enumerable: true, get: () => { reads[key]++; return value; } }])));
  const applied = applyExecutionV1(input);
  assert.deepEqual(reads, { lateral: 1, depth: 1 });
  assert.deepEqual(applyExecutionV1(regression), applied);
  assert.deepEqual(regression.draws, draws);
  for (const lateral of [0, .25, .9, 1 - Number.EPSILON]) assert.deepEqual(
    applyExecutionV1({ ...regression, draws: { lateral, depth: draws.depth } }), applied);
  for (const key of ['lateral', 'depth']) for (const bad of [-1, 1, NaN]) assert.throws(() =>
    applyExecutionV1({ ...regression, draws: { ...draws, [key]: bad } }), /draw/);
});

test('net target mapping leaves sampled quality and error rates unchanged', () => {
  const profile = { execution: { kitchen: { error: .2, attackable: .1, excellent: .1, low: .1 } },
    pressureErrorScale: 0, errorWeights: { net: .5, long: .3, wide: .2 } };
  const counts = { net: 0, long: 0, wide: 0, attackable: 0, excellent: 0, low: 0, neutral: 0 };
  for (let i = 0; i < 1000; i++) {
    const sampled = sampleExecutionV1({ profile, situation: { phase: 'kitchen' },
      draws: { quality: (i + .5) / 1000, error: ((i % 10) + .5) / 10 } });
    const before = structuredClone(sampled), applied = applyExecutionV1({ ...regression, execution: sampled });
    counts[sampled.errorReason ?? sampled.quality]++;
    assert.deepEqual(sampled, before);
    assert.equal(applied.quality, sampled.quality); assert.equal(applied.intendedError, sampled.errorReason);
  }
  assert.deepEqual(counts, { net: 100, long: 60, wide: 40, attackable: 100, excellent: 100, low: 100, neutral: 500 });
});

test('degenerate and wrong-direction inputs fail before inventing a different net heading', () => {
  for (const acrossNet of [false, true]) for (const pair of [
    { contact: { x: 7, y: 14, heightFeet: 2 }, target: { x: 13, y: 14 } },
    { contact: { x: 7, y: 14, heightFeet: 2 }, target: { x: 7, y: 14 } },
    { contact: { x: 7, y: 14, heightFeet: 2 }, target: { x: 13, y: 5 } },
    { contact: { x: 7, y: 14, heightFeet: 2 }, target: { x: 13, y: 20 } },
    { contact: { x: 7, y: 14, heightFeet: 2 }, target: { x: 13, y: 22 } },
    { contact: { x: 7, y: 22, heightFeet: 2 }, target: { x: 13, y: 38 } },
    { contact: { x: 7, y: 30, heightFeet: 2 }, target: { x: 13, y: 14 } },
  ]) {
    const input = mirrored({ ...regression, ...pair }, acrossNet), before = structuredClone(input);
    assert.throws(() => applyExecutionV1(input), /forward target crossing/);
    assert.deepEqual(input, before);
  }
  for (const field of ['contact', 'target']) for (const coordinate of ['x', 'y']) for (const bad of [NaN, Infinity, -Infinity])
    assert.throws(() => applyExecutionV1({ ...regression, [field]: { ...regression[field], [coordinate]: bad } }), /finite/);
  assert.throws(() => applyExecutionV1({ ...regression, contact: { x: -Number.MAX_VALUE, y: 14, heightFeet: 2 },
    target: { x: Number.MAX_VALUE, y: 38 } }), /finite contact-to-target heading/);
  assert.throws(() => applyExecutionV1({ ...regression, contact: { x: 7, y: -Number.MAX_VALUE, heightFeet: 2 },
    target: { x: 13, y: Number.MAX_VALUE } }), /finite contact-to-target heading/);
});

test('around-post, post-gap and infeasible paths stay unavailable with fixed heading and bounded evidence', () => {
  for (const acrossNet of [false, true]) for (const acrossCourt of [false, true]) for (const row of [
    { x: -3, route: 'around-the-post', reason: /around-post route cannot construct a net mesh error/ },
    { x: -3, route: 'over-net', reason: /around a post, not over the net/ },
    { x: -.9, route: 'over-net', reason: /does not intersect supported net mesh/ },
  ]) {
    const input = mirrored({ ...regression, route: row.route, contact: { x: row.x, y: 14, heightFeet: 2.2 },
      target: { x: row.x, y: 38 } }, acrossNet, acrossCourt), before = structuredClone(input);
    const applied = applyExecutionV1(input);
    assertHeading(input.contact, input.target, applied.target);
    assert.equal(applied.route, row.route); assert.equal(applied.intendedError, 'net');
    assert.throws(() => deliver(input, applied), error => {
      assert.match(error.message, row.reason); assert.equal(error.guidance.accepted, false);
      assert.equal(error.guidance.incidentalAroundPost, false); assert.equal(error.guidance.deliveredRoute, row.route);
      assert.equal(error.plannerDiagnostics.solverCalls, 0); assert.deepEqual(error.guidance.trials, []);
      assert.ok(Object.isFrozen(error.guidance)); assert.equal(error.outcome, undefined); return true;
    });
    assert.deepEqual(input, before);
  }
  const input = { ...regression, contact: { x: 7, y: 21.5, heightFeet: 30 }, target: { x: 10, y: 35 } };
  assert.throws(() => deliver(input), error => {
    assert.match(error.message, /Delivered flight unavailable/); assert.equal(error.guidance.accepted, false);
    assert.ok(error.plannerDiagnostics.solverCalls <= MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET);
    assert.equal(error.outcome, undefined); return true;
  });
  // A very short original crossing can project beyond the supported apron.
  // Keep that finite ray endpoint and fail; clamping it would rotate the shot.
  for (const acrossNet of [false, true]) for (const acrossCourt of [false, true]) {
    const short = mirrored({ ...regression, contact: { x: 7, y: 21.9, heightFeet: 2.2 }, target: { x: 20, y: 22.1 } }, acrossNet, acrossCourt);
    const applied = applyExecutionV1(short);
    assert.ok(applied.target.x < -8 || applied.target.x > 28);
    assertHeading(short.contact, short.target, applied.target);
    assert.throws(() => deliver(short, applied), /supported 8-foot apron/);
  }
});

test('non-net target and shape mappings keep their established values', () => {
  const base = { ...regression, family: 'drive', intent: 'drive', contact: { x: 7, y: 14, heightFeet: 2.2 },
    target: { x: 13, y: 38 }, physics: { apexFeet: 6 }, draws: { lateral: .75, depth: .25 } };
  for (const row of [
    { quality: 'neutral', target: { x: 13.2, y: 37.8 }, preferred: { apexFeet: 6 }, kind: 'target-precision' },
    { quality: 'excellent', target: { x: 13.075, y: 37.925 }, preferred: { clearanceFeet: .55 }, kind: 'controlled-clearance' },
    { quality: 'low', target: { x: 13.1, y: 37.9 }, preferred: { clearanceFeet: .4 }, kind: 'controlled-clearance' },
    { quality: 'attackable', target: { x: 13.375, y: 37.625 }, preferred: { apexFeet: 6.6 }, kind: 'apex-perturbation' },
    { quality: 'error', errorReason: 'long', target: { x: 13.2, y: 45.75 }, preferred: { apexFeet: 6 }, kind: 'error-target' },
    { quality: 'error', errorReason: 'wide', target: { x: 22.75, y: 37.8 }, preferred: { apexFeet: 6 }, kind: 'error-target' },
  ]) {
    const applied = applyExecutionV1({ ...base, execution: { quality: row.quality, errorReason: row.errorReason ?? null } });
    assert.deepEqual(applied.target, row.target); assert.deepEqual(applied.preferredFlight, row.preferred);
    assert.equal(applied.physicalTransformation.kind, row.kind);
  }
});

test('Intermediate 50907 completes the fixed sampled net error through independent final validation', async () => {
  const players = Object.fromEntries(['player1', 'player2', 'player3', 'player4'].map((id, i) =>
    [id, { team: i < 2 ? 'green' : 'orange', handedness: 'right', style: 'intermediate', flavour: 'balanced' }]));
  const input = { seed: 50907, players, service: { server: 'player3', receiver: 'player1', court: 'left', courtConvention: 'server-perspective-v1' },
    options: { lengthFeel: 'natural', winner: 'either', signatureShots: true, maxShots: 99 } };
  const before = structuredClone(input), result = await simulateRally(input);
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.equal(result.decisions.length, 4); assert.equal(result.diagnostics.attempts, 1);
  const decision = result.decisions.at(-1), transform = decision.resolution.physicalTransformation;
  assert.equal(decision.execution.quality, 'error'); assert.equal(decision.execution.errorReason, 'net');
  assert.equal(decision.execution.draw, execution.draw); assert.equal(decision.execution.errorDraw, execution.errorDraw);
  assert.deepEqual(decision.draws.perturbation, regression.draws);
  assert.equal(transform.version, 'rally-execution-physical-v4');
  assertHeading(transform.sourceContact, transform.sourceTarget, transform.target);
  const compiled = compileDocument(result.document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, 4); assert.equal(rules.valid, true);
  assert.deepEqual(compiled.findings.filter(row => row.severity === 'error'), []);
  assert.equal(result.outcome.reason, 'net');
  assert.ok(rules.expectedOutcomes.some(row => row.reason === 'net' && row.shotId === decision.shotId));
  const last = compiled.timeline.segments.filter(row => row.shotSemantics).at(-1).trajectory.solved;
  assert.equal(last.obstruction?.kind, 'net');
  assert.ok(last.obstruction.position.x >= PHYSICS_V2.netLeft && last.obstruction.position.x <= PHYSICS_V2.netRight);
  assert.deepEqual(input, before);
});
