import test from 'node:test';
import assert from 'node:assert/strict';
import { solveFlightV2, interceptFlightV2, flightReachCriticalTimesV2, sampleFlightVelocityV2 } from '../play-physics-v2.js';
import { REACH_MODEL, assessReach } from '../rally-tactics.js';

// Two preserved development examples. These are exact solved-source facts,
// independent of generated outcomes, execution draws or a corpus rerun.
const examples = [
  { seed: 26, from: { x: 8.674787905, y: 17.200000008, heightFeet: 3.902346347 },
    target: { x: 9.298726169, y: 39.069228883 }, launch: -4.008539593,
    origin: { x: 4.623392839, y: 29.75 }, other: { x: 14.623392839, y: 29.138819434 },
    critical: .2323661276960754, clearance: -.03209090629511735 },
  { seed: 47, from: { x: 10.788466202, y: 26.799999996, heightFeet: 3.616450804 },
    target: { x: 10.721848535, y: 3.25925548 }, launch: -1.709127877,
    origin: { x: 15.310084273, y: 14.25 }, other: { x: 5.310084273, y: 14.25 },
    critical: .24211643825710905, clearance: -.006299765998416973 },
];
const flightFor = source => solveFlightV2({ from: source.from, target: source.target, family: 'volley', physics: { launchVerticalFeetPerSecond: source.launch } });
const clearance = (flight, origin, time, model = REACH_MODEL) => {
  const reach = assessReach(origin, flight.sampleBoard(time), time, model);
  return reach.distanceFeet - reach.radiusFeet;
};
const minimum = (flight, origin, times, model = REACH_MODEL) => times.map(time => ({ time, clearance: clearance(flight, origin, time, model) })).sort((a, b) => a.clearance - b.clearance)[0];
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const bounded = (flight, times, end = flight.totalDuration) => {
  assert.ok(Object.isFrozen(times));
  assert.deepEqual(times, [...new Set(times)].sort((a, b) => a - b));
  assert.ok(times.every(time => Number.isFinite(time) && time > 0 && time < end));
  assert.ok(times.length <= flight.stages.length * 11, 'the analytic candidate count stays bounded per physical stage');
};

for (const source of examples) for (const mirrorX of [false, true]) for (const mirrorY of [false, true]) {
  test(`analytic critical times recover the narrow development ${source.seed} reach window (${mirrorX}/${mirrorY})`, () => {
    const mirror = at => ({ ...at, x: mirrorX ? 20 - at.x : at.x, y: mirrorY ? 44 - at.y : at.y });
    const flight = flightFor({ ...source, from: mirror(source.from), target: mirror(source.target) }), origin = mirror(source.origin);
    const before = JSON.stringify({ flight, origin, model: REACH_MODEL });
    const times = flightReachCriticalTimesV2(flight, origin, REACH_MODEL), best = minimum(flight, origin, times);
    bounded(flight, times); close(best.time, source.critical); close(best.clearance, source.clearance);
    assert.ok(best.clearance < 0);
    const contact = interceptFlightV2(flight, { kind: 'volley', stance: origin, beforeBounceSeconds: flight.firstLandingTime - best.time });
    close(contact.time, best.time); assert.equal(contact.bounces, 0);
    assert.equal(assessReach(origin, contact.point, contact.time).reachable, true);
    assert.equal(JSON.stringify({ flight, origin, model: REACH_MODEL }), before);
    const other = mirror(source.other), negative = minimum(flight, other, flightReachCriticalTimesV2(flight, other, REACH_MODEL));
    assert.ok(negative.clearance > .8, 'the actual other actor stays outside conservative reach');
    const away = { ...origin, x: origin.x + Math.sign(origin.x - contact.point.x) * .05 };
    assert.ok(minimum(flight, away, flightReachCriticalTimesV2(flight, away, REACH_MODEL)).clearance > 0,
      'a slightly farther counterpart does not acquire a false reachable window');
    assert.ok(times.some(time => time > flight.firstLandingTime), 'the real post-bounce stage is represented too');
  });
}

test('reaction cuts, actual stage changes and supplied reach parameters determine candidates', () => {
  const flight = flightFor(examples[0]), origin = examples[0].origin;
  const ordinary = flightReachCriticalTimesV2(flight, origin, REACH_MODEL);
  assert.ok(ordinary.includes(REACH_MODEL.reactionSeconds));
  const custom = { speedFeetPerSecond: 0, reactionSeconds: .2, paddleReachFeet: 1 };
  const times = flightReachCriticalTimesV2(flight, origin, custom);
  bounded(flight, times); assert.ok(times.includes(.2));
  const first = flight.stages[0], dot = (first.from.x - origin.x) * first.vx + (first.from.y - origin.y) * first.vz;
  const closest = -dot / (first.vx ** 2 + first.vz ** 2);
  assert.ok(times.some(time => Math.abs(time - closest) < 1e-12));
  assert.ok(Math.abs(minimum(flight, origin, times, custom).time - minimum(flight, origin, ordinary).time) > .001,
    'the helper does not silently substitute a default 14 ft/s model');
});

test('reach-boundary times and an interior narrow-window sample accompany the stationary minimum', () => {
  const source = examples[1], flight = flightFor(source), times = flightReachCriticalTimesV2(flight, source.origin, REACH_MODEL);
  const roots = times.filter(time => time < flight.firstLandingTime && Math.abs(clearance(flight, source.origin, time)) < 1e-10);
  assert.equal(roots.length, 2);
  assert.ok(roots[0] < source.critical && roots[1] > source.critical);
  assert.ok(roots[1] - roots[0] < .01, 'the fixture exercises a narrow interval');
  assert.ok(times.some(time => time > roots[0] && time < roots[1] && clearance(flight, source.origin, time) < 0));
});

test('zero horizontal speed, coincident closest approach and equal-speed degeneracies remain finite', () => {
  const stationary = solveFlightV2({ from: { x: 6, y: 10, heightFeet: 2 }, target: { x: 6, y: 10 }, family: 'drop' });
  for (const model of [REACH_MODEL, { speedFeetPerSecond: 0, reactionSeconds: 0, paddleReachFeet: 0 },
    { speedFeetPerSecond: 100, reactionSeconds: 20, paddleReachFeet: 0 }]) {
    bounded(stationary, flightReachCriticalTimesV2(stationary, { x: 6, y: 10 }, model));
  }
  const flight = solveFlightV2({ from: { x: 6, y: 4, heightFeet: 2 }, target: { x: 6, y: 14 }, family: 'drop' });
  const first = flight.stages[0], horizontal = Math.hypot(first.vx, first.vz), origin = { x: 6, y: 9 };
  for (const speed of [0, horizontal, horizontal * (1 - 1e-12), horizontal * (1 + 1e-12)]) {
    bounded(flight, flightReachCriticalTimesV2(flight, origin, { speedFeetPerSecond: speed, reactionSeconds: 0, paddleReachFeet: 3 }));
  }
  const times = flightReachCriticalTimesV2(flight, origin, { speedFeetPerSecond: 0, reactionSeconds: 0, paddleReachFeet: 0 });
  const cusp = times.find(time => Math.abs(flight.sampleBoard(time).y - origin.y) < 1e-10);
  assert.ok(Number.isFinite(cusp), 'a nondifferentiable zero-distance minimum is retained');
});

test('times honor truncation and decisive physical ends without altering solved position or velocity', () => {
  const flight = flightFor(examples[0]), origin = examples[0].origin, velocity = sampleFlightVelocityV2(flight, .23), position = flight.sampleBoard(.23);
  for (const truncated of [{ ...flight, totalDuration: .3 }, { ...flight, terminal: { time: .3 } }, { ...flight, obstruction: { time: .3 } }]) {
    const times = flightReachCriticalTimesV2(truncated, origin, REACH_MODEL);
    bounded(truncated, times, .3); assert.ok(times.length > 0);
  }
  assert.deepEqual(sampleFlightVelocityV2(flight, .23), velocity); assert.deepEqual(flight.sampleBoard(.23), position);
  assert.deepEqual(flightReachCriticalTimesV2({ ...flight, obstruction: { time: 0 } }, origin, REACH_MODEL), []);
});

test('malformed, nonfinite and inconsistent analytic inputs fail explicitly', () => {
  const flight = flightFor(examples[0]), origin = examples[0].origin;
  for (const model of [undefined, {}, { ...REACH_MODEL, reactionSeconds: -1 }, { ...REACH_MODEL, speedFeetPerSecond: Infinity },
    { ...REACH_MODEL, paddleReachFeet: -1 }, { ...REACH_MODEL, speedFeetPerSecond: 1e300 }]) {
    assert.throws(() => flightReachCriticalTimesV2(flight, origin, model));
  }
  assert.throws(() => flightReachCriticalTimesV2(null, origin, REACH_MODEL), /solved flight/);
  assert.throws(() => flightReachCriticalTimesV2(flight, { x: NaN, y: 14 }, REACH_MODEL), /finite/);
  assert.throws(() => flightReachCriticalTimesV2({ ...flight, stages: [{ ...flight.stages[0], vx: NaN }] }, origin, REACH_MODEL), /finite/);
  assert.throws(() => flightReachCriticalTimesV2({ ...flight, stages: [{ ...flight.stages[0], duration: -1 }] }, origin, REACH_MODEL), /positive solved/);
  assert.throws(() => flightReachCriticalTimesV2({ ...flight, stages: [{ ...flight.stages[0], endTime: 7 }] }, origin, REACH_MODEL), /positive solved/);
  assert.throws(() => flightReachCriticalTimesV2({ ...flight, totalDuration: 0 }, origin, REACH_MODEL), /positive solved/);
});
