import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planRallyFlightV1, generationFlightCeilingMphV1, FLIGHT_PLANNER_VERSION,
  GENERATION_FLIGHT_ENVELOPES_V1, MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET } from '../rally-flight-planner.js';
import { solveFlightV2, PHYSICS_V2, localNetHeightFeet } from '../play-physics-v2.js';

const G = PHYSICS_V2.gravityFeetPerSecond2, R = PHYSICS_V2.ballRadiusFeet;
const readFixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const archived = readFixture('flight-planner-archived-maxima.json').fixtures;
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const rounded = value => JSON.parse(JSON.stringify(value, (key, v) => typeof v === 'number' ? Number(v.toFixed(9)) : v));
const normal = { from: { x: 7, y: 14, heightFeet: 2.2 }, target: { x: 11, y: 35 }, family: 'drop' };

function verify(input, result) {
  assert.equal(result.status, 'solved');
  assert.equal(result.plannerVersion, FLIGHT_PLANNER_VERSION);
  assert.ok(result.solutions.length > 0 && result.solutions.length <= 6);
  assert.ok(result.diagnostics.solverCalls <= MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET);
  assert.equal(result.diagnostics.solverCalls, result.diagnostics.trials.length);
  assert.equal(result.physics, result.solutions[0].physics);
  assert.equal(result.flight, result.solutions[0].flight);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.evidence.actual.landing));
  const ceiling = generationFlightCeilingMphV1({ ...input, quality: input.errorReason ? 'error' : input.quality });
  let priorScore = -Infinity;
  for (const solution of result.solutions) {
    const { physics, flight, evidence } = solution;
    const replay = solveFlightV2({ ...input, physics });
    assert.deepEqual(physics, rounded(physics), 'source launch physics is already in the engine serialization format');
    near(replay.launchSpeedMph, flight.launchSpeedMph);
    near(replay.metadata.launchVerticalFeetPerSecond, evidence.actual.launchVerticalFeetPerSecond);
    near(replay.metadata.apexFeet, evidence.actual.apexFeet);
    near(replay.firstLandingTime, flight.firstLandingTime);
    assert.deepEqual(flight.target, input.target);
    const first = replay.stages[0];
    const independentSpeed = Math.hypot(first.vx, first.vy, first.vz) / (22 / 15);
    near(independentSpeed, evidence.actual.speedMph);
    assert.ok(independentSpeed <= ceiling, `${independentSpeed} > ${ceiling}`);
    const independentApex = input.from.heightFeet + Math.max(0, first.vy) ** 2 / (2 * G);
    near(independentApex, evidence.actual.apexFeet);
    assert.ok(independentApex >= input.from.heightFeet && independentApex <= 30);
    assert.ok(first.vy >= -80 && first.vy <= 80);
    assert.ok(evidence.actual.flightTimeSeconds > .001);
    const t = (22 - input.from.y) / first.vz;
    const x = input.from.x + first.vx * t;
    const clearance = input.from.heightFeet + first.vy * t - .5 * G * t * t - R - localNetHeightFeet(x);
    near(clearance, evidence.actual.clearanceFeet);
    if (input.errorReason === 'net') assert.equal(flight.obstruction?.kind, 'net');
    if (input.quality !== 'error' && !input.errorReason) assert.equal(flight.obstruction, null);
    if (!flight.obstruction) {
      for (const axis of ['x', 'y']) near(flight.landing[axis], input.target[axis]);
      assert.ok(flight.events.some(e => e.type === 'net-crossing' && Boolean(e.aroundPost) === (input.route === 'around-the-post')));
    }
    if (input.family === 'overhead') assert.ok(first.vy <= 0);
    if (input.family === 'lob' && input.quality !== 'error' && !input.errorReason && input.from.heightFeet < 15) assert.ok(independentApex >= 15);
    assert.ok(evidence.preferenceScore >= priorScore); priorScore = evidence.preferenceScore;
    for (const d of evidence.preferredDepartures) {
      assert.equal(d.actual, evidence.actual[d.metric]); near(d.departure, d.actual - d.requested);
    }
    // The planner's margins must also withstand source coordinate rounding.
    const serialized = rounded({ ...input, physics });
    const sourceReplay = solveFlightV2(serialized);
    assert.ok(sourceReplay.launchSpeedMph <= ceiling);
    near(sourceReplay.launchSpeedMph, flight.launchSpeedMph, 2e-6);
    near(sourceReplay.metadata.apexFeet, flight.metadata.apexFeet, 2e-6);
  }
}

test('generation envelopes are declarative defaults, immutable and shared with independent audits', () => {
  assert.equal(FLIGHT_PLANNER_VERSION, 'rally-flight-planner-v1');
  assert.equal(MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET, 6);
  assert.ok(Object.isFrozen(GENERATION_FLIGHT_ENVELOPES_V1.drive));
  for (const [family, expected] of Object.entries({ serve: 40, return: 36, drive: 38, dink: 20, reset: 24, drop: 26,
    lob: 28, volley: 45, overhead: 45, 'firm-volley': 45, 'speed-up': 45, counter: 45, 'put-away': 45 })) {
    assert.equal(generationFlightCeilingMphV1({ family }), expected);
    assert.equal(generationFlightCeilingMphV1({ family, quality: 'error' }), Math.min(50, 1.25 * expected));
  }
  assert.equal(generationFlightCeilingMphV1({ family: 'drive', style: 'pro' }), 45);
  assert.equal(generationFlightCeilingMphV1({ family: 'drive', style: 'advanced', quality: 'error' }), 47.5);
  assert.equal(generationFlightCeilingMphV1({ family: 'speedup' }), 45);
});

for (const fixture of archived) test(`preserved exact archive regression: ${fixture.id}`, () => {
  const before = JSON.stringify(fixture.input), result = planRallyFlightV1(fixture.input);
  assert.equal(fixture.expectedStatus, 'solved', 'these are known feasible cases, never success-or-rejection tests');
  verify(fixture.input, result);
  assert.equal(JSON.stringify(fixture.input), before);
  if (fixture.id.endsWith('shot6')) {
    assert.ok(fixture.oldSpeedMph > 90);
    assert.ok(result.flight.launchSpeedMph >= 22 && result.flight.launchSpeedMph <= 38);
    assert.ok(result.flight.metadata.netClearanceInches > 10);
    near(result.solutions.find(s => s.flight.launchSpeedMph > 37.99).flight.launchSpeedMph, 38, 2e-5);
  }
});

test('all nine families solve exact low/high contacts in both directions', () => {
  for (const family of ['serve', 'return', 'drive', 'dink', 'reset', 'drop', 'lob', 'volley', 'overhead']) {
    for (const heightFeet of [family === 'overhead' ? 4 : .6, 8.5]) for (const mirror of [false, true]) {
      const input = { from: { x: 7, y: mirror ? 30 : 14, heightFeet }, target: { x: 11, y: mirror ? 9 : 35 }, family };
      const result = planRallyFlightV1(input); verify(input, result);
      if (['drive', 'overhead'].includes(family)) assert.ok(result.flight.launchSpeedMph >= 22);
    }
  }
});

test('fast intent aliases retain actual attacking pace while ordinary soft volleys can remain soft', () => {
  for (const intent of ['speed-up', 'speedup', 'counter', 'firm-volley', 'put-away', 'putaway']) {
    const input = { ...normal, family: 'volley', intent, preferred: { speedMph: 8, apexFeet: 20 } };
    const result = planRallyFlightV1(input); verify(input, result);
    for (const solution of result.solutions) assert.ok(solution.flight.launchSpeedMph >= 22);
    assert.ok(result.evidence.preferredDepartures.some(d => d.metric === 'speedMph' && d.departure > 0));
  }
  const soft = { ...normal, from: { x: 7, y: 17, heightFeet: 4 }, target: { x: 7, y: 29 }, family: 'volley', pace: 'soft', preferred: { speedMph: 12 } };
  const result = planRallyFlightV1(soft); verify(soft, result); assert.ok(result.flight.launchSpeedMph < 22);
});

test('preferred speed, clearance, apex and signed launch are hints with measured departures', () => {
  const input = { ...normal, preferred: { speedMph: 200, clearanceFeet: .4, apexFeet: 29, launchVerticalFeetPerSecond: -80 } };
  const result = planRallyFlightV1(input); verify(input, result);
  assert.equal(result.evidence.preferredDepartures.length, 4);
  assert.ok(result.evidence.preferredDepartures.some(d => Math.abs(d.departure) > 1));
  assert.ok(result.evidence.rangeDepartures.every(d => d.actual === result.evidence.actual[d.metric]));
  const second = planRallyFlightV1(input);
  assert.deepEqual(second.diagnostics, result.diagnostics);
  assert.deepEqual(second.solutions.map(s => s.evidence), result.solutions.map(s => s.evidence));
  const extreme = { ...normal, preferred: Object.fromEntries(['speedMph', 'clearanceFeet', 'apexFeet', 'launchVerticalFeetPerSecond'].map(key => [key, Number.MAX_VALUE])) };
  const extremeResult = planRallyFlightV1(extreme); verify(extreme, extremeResult);
  assert.ok(Number.isFinite(extremeResult.evidence.preferenceScore));
});

test('lob hints cannot remove the high apex, overhead hints cannot create an upward overhead', () => {
  const lob = { ...normal, family: 'lob', preferred: { apexFeet: 4, launchVerticalFeetPerSecond: -20 } };
  const overhead = { ...normal, from: { ...normal.from, heightFeet: 8.5 }, family: 'overhead', preferred: { apexFeet: 29, launchVerticalFeetPerSecond: 40 } };
  verify(lob, planRallyFlightV1(lob)); verify(overhead, planRallyFlightV1(overhead));
});

test('a sampled lob loft failure can hit mesh without requiring the ideal non-error apex', () => {
  const geometry = { from: { x: 10, y: 20, heightFeet: 3 }, target: { x: 10, y: 22.45 }, family: 'lob',
    preferred: { apexFeet: 3, launchVerticalFeetPerSecond: -20 }, arc: 'low' };
  const error = { ...geometry, quality: 'error', errorReason: 'net' };
  const result = planRallyFlightV1(error); verify(error, result);
  assert.equal(result.flight.obstruction?.kind, 'net');
  assert.ok(result.flight.launchSpeedMph <= 35);
  assert.ok(result.flight.metadata.apexFeet < 15);
  assert.ok(result.evidence.rangeDepartures.some(d => d.metric === 'apexFeet' && d.departure < 0));
  const nonError = { ...geometry, quality: 'neutral' };
  const lofted = planRallyFlightV1(nonError); verify(nonError, lofted);
  for (const solution of lofted.solutions) assert.ok(solution.flight.metadata.apexFeet >= 15);
});

test('mesh errors are genuine collisions and long/wide errors retain real earlier mesh events', () => {
  for (const errorReason of ['net', 'long', 'wide']) {
    const target = errorReason === 'long' ? { x: 7, y: 49 } : errorReason === 'wide' ? { x: -3, y: 35 } : { x: 7, y: 35 };
    const input = { from: { x: 7, y: 14, heightFeet: 2.2 }, target, family: 'drive', quality: 'error', errorReason,
      preferred: { clearanceFeet: -1.5 } };
    const result = planRallyFlightV1(input); verify(input, result);
    assert.equal(result.evidence.intendedError, errorReason);
    assert.equal(result.flight.obstruction?.kind, 'net');
    assert.equal(result.flight.terminal?.reason, 'net');
    assert.deepEqual(result.flight.target, target);
    assert.notDeepEqual({ x: result.flight.landing.x, y: result.flight.landing.y }, target);
  }
});

for (const name of ['around-the-post', 'erne']) test(`existing ${name} signature fixture retains its route and exact target`, () => {
  const document = readFixture(`model2/${name}.json`), shot = document.shots[0];
  for (const mirror of [false, true]) {
    const input = { from: { ...shot.contactOverride, heightFeet: 2.2 }, target: { ...shot.target }, family: shot.family,
      intent: shot.intent, pace: shot.pace, arc: shot.arc, preferred: shot.physics,
      route: name === 'around-the-post' ? name : 'over-net' };
    if (mirror) { input.from.x = 20 - input.from.x; input.from.y = 44 - input.from.y; input.target.x = 20 - input.target.x; input.target.y = 44 - input.target.y; }
    const result = planRallyFlightV1(input); verify(input, result);
    assert.equal(result.evidence.actual.aroundPost, name === 'around-the-post');
    if (name === 'around-the-post') assert.ok(result.evidence.actual.clearanceFeet < 0, 'ATP has no over-net minimum clearance');
  }
});

test('near-chord clearance hints cannot cause launch-speed blowups', () => {
  const from = { x: 11.41782852071753, y: 17.199999999397942, heightFeet: 4.229652240216385 };
  const target = { x: 5.65488797, y: 39.224937546 }, fraction = (22 - from.y) / (target.y - from.y);
  const x = from.x + (target.x - from.x) * fraction;
  const chordClearance = from.heightFeet * (1 - fraction) + R * fraction - R - localNetHeightFeet(x);
  for (const offset of [0, 1e-15, 1e-10, 1e-6]) {
    const input = { from, target, family: 'drive', preferred: { clearanceFeet: chordClearance + offset } };
    const result = planRallyFlightV1(input); verify(input, result); assert.ok(result.flight.launchSpeedMph <= 38);
  }
});

test('valid but impossible constraints return explicit deterministic unavailability without solver cascades', () => {
  const cases = [
    { ...normal, target: { x: 11, y: 20 } },
    { from: { x: -8, y: -8, heightFeet: .2 }, target: { x: 28, y: 52 }, family: 'dink' },
    { ...normal, from: { x: 7, y: 21, heightFeet: 15 }, errorReason: 'net', quality: 'error' },
    { ...normal, route: 'around-the-post' },
    { from: { x: -2.5, y: 18, heightFeet: 2.2 }, target: { x: .5, y: 32 }, family: 'dink', route: 'over-net' },
    { ...normal, family: 'overhead', from: { x: 7, y: 21, heightFeet: .2 } },
  ];
  for (const input of cases) {
    const result = planRallyFlightV1(input);
    assert.equal(result.status, 'unavailable'); assert.equal(result.physics, null); assert.equal(result.flight, null);
    assert.deepEqual(result.solutions, []); assert.ok(result.diagnostics.reason.length > 0);
    assert.ok(result.diagnostics.solverCalls <= 6); assert.deepEqual(planRallyFlightV1(input), result);
  }
});

test('unsupported under-net, net-gap and post constructions are rejected as policy inputs', () => {
  for (const errorReason of ['under-net', 'net-gap', 'post']) assert.throws(() => planRallyFlightV1({ ...normal, quality: 'error', errorReason }), RangeError);
  for (const route of ['under-net', 'net-gap', 'post']) assert.throws(() => planRallyFlightV1({ ...normal, route }), RangeError);
});

test('malformed inputs reject without mutation or nonfinite output', () => {
  const invalid = [undefined, {}, { ...normal, from: null }, { ...normal, from: { ...normal.from, x: NaN } },
    { ...normal, target: { x: Infinity, y: 35 } }, { ...normal, from: { ...normal.from, heightFeet: R - 1e-6 } },
    { ...normal, from: { ...normal.from, heightFeet: 31 } }, { ...normal, target: { x: -8.01, y: 35 } },
    { ...normal, from: { ...normal.from, y: 52.01 } }, { ...normal, family: 'unknown' }, { ...normal, style: 'expert' },
    { ...normal, quality: 'bad' }, { ...normal, preferred: null }, { ...normal, preferred: { apexFeet: NaN } },
    { ...normal, preferred: { unknown: 3 } }, { ...normal, preferred: [] }, { ...normal, pace: 'fast' }, { ...normal, arc: 'flat' }];
  for (const input of invalid) assert.throws(() => planRallyFlightV1(input), error => error instanceof TypeError || error instanceof RangeError);
  const input = structuredClone(normal); Object.freeze(input.from); Object.freeze(input.target); Object.freeze(input);
  verify(input, planRallyFlightV1(input));
});
