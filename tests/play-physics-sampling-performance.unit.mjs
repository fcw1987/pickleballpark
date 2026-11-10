import test from 'node:test';
import assert from 'node:assert/strict';
import { solveFlightV2, solveFlightForClearanceV2, PHYSICS_V2 } from '../play-physics-v2.js';

const EPS = 1e-8, G = PHYSICS_V2.gravityFeetPerSecond2, R = PHYSICS_V2.ballRadiusFeet;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Intentionally retain the 63016b5 sampling algorithm, including allocation,
// lookup, arithmetic order and phase comparisons. This is the exact oracle
// for the optimized sampler, not a second approximate physics implementation.
function frozenBoardAlgorithm(flight, seconds) {
  if (!Number.isFinite(seconds)) throw new TypeError('seconds must be finite.');
  const t = clamp(seconds, 0, flight.totalDuration);
  const selected = flight.stages.find(stage => t < stage.endTime - EPS) || flight.stages.at(-1);
  const local = clamp(t - selected.startTime, 0, selected.duration);
  const at = { x: selected.from.x + selected.vx * local, y: selected.from.y + selected.vz * local,
    heightFeet: Math.max(R, selected.from.heightFeet + selected.vy * local - .5 * G * local * local) };
  const bounce = flight.events.find(event => event.type === 'bounce' && Math.abs(event.time - t) < EPS);
  return Object.freeze({ ...at, phase: bounce ? 'bounce' : t >= flight.totalDuration - EPS
    ? flight.terminal ? 'dead' : 'second-bounce' : selected.phase, bounced: t >= flight.firstLandingTime - EPS });
}
function frozenWorldAlgorithm(flight, seconds) {
  const at = frozenBoardAlgorithm(flight, seconds);
  const world = { x: (at.x - 10) * .3048, y: at.heightFeet * .3048, z: (at.y - 22) * .3048 };
  return Object.freeze({ ...world, phase: at.phase, bounced: at.bounced });
}

function fixtures() {
  const inputs = [
    { from: { x: 5, y: 4, heightFeet: 2.2 }, target: { x: 15, y: 40 }, family: 'drive', pace: 'firm', arc: 'low' },
    { from: { x: 15, y: 40, heightFeet: 2.2 }, target: { x: 5, y: 4 }, family: 'return', pace: 'medium', arc: 'high' },
    { from: { x: 5, y: 14.25, heightFeet: 1.4 }, target: { x: 15, y: 26.5 }, family: 'dink', pace: 'soft', arc: 'medium' },
    { from: { x: 15, y: 29.75, heightFeet: 1.4 }, target: { x: 5, y: 17.5 }, family: 'drop', pace: 'soft', arc: 'high' },
    { from: { x: 8, y: 14.25, heightFeet: 2.2 }, target: { x: 12, y: 35 }, family: 'drive', physics: { launchVerticalFeetPerSecond: 0 } },
    { from: { x: 12, y: 29.75, heightFeet: 2.2 }, target: { x: 8, y: 9 }, family: 'drive', physics: { launchVerticalFeetPerSecond: 0 } },
    { from: { x: 8, y: 14.25, heightFeet: 2.5500000000000003 }, target: { x: 12, y: 35 }, family: 'drive', physics: { launchVerticalFeetPerSecond: 0 } },
    { from: { x: -2, y: 17, heightFeet: 1.2 }, target: { x: -2, y: 30 }, family: 'drive', physics: { apexFeet: 4 } },
    { from: { x: -1.15, y: 17, heightFeet: 1.2 }, target: { x: -1.15, y: 30 }, family: 'drive', physics: { launchVerticalFeetPerSecond: 0 } },
    { from: { x: 8, y: 14.25, heightFeet: .2 }, target: { x: 12, y: 35 }, family: 'drive', physics: { launchVerticalFeetPerSecond: 0 } },
    { from: { x: 7, y: 14.25, heightFeet: 8.5 }, target: { x: 14, y: 31 }, family: 'overhead', pace: 'firm' },
    { from: { x: 7, y: 14.25, heightFeet: 1.4 }, target: { x: 14, y: 40 }, family: 'lob', physics: { apexFeet: 18 } },
    { from: { x: 0, y: 4, heightFeet: R }, target: { x: -0, y: 40 }, family: 'serve', physics: { launchVerticalFeetPerSecond: 8 } },
    { from: { x: 7, y: 14.25, heightFeet: 30 }, target: { x: 14, y: 35 }, family: 'drive', physics: { launchVerticalFeetPerSecond: -0 } },
  ];
  return [...inputs.map(solveFlightV2), solveFlightForClearanceV2({ from: { x: 7, y: 14, heightFeet: 2.2 }, target: { x: 12, y: 35 }, family: 'drive' }, 0)];
}

function sampleTimes(flight) {
  const values = [-Number.MAX_VALUE, -1, -EPS, -0, 0, EPS, flight.totalDuration + EPS, flight.totalDuration + 1, Number.MAX_VALUE];
  for (let i = 0; i <= 1024; i++) values.push(flight.totalDuration * i / 1024);
  const boundaries = [flight.firstLandingTime, flight.totalDuration, ...flight.stages.flatMap(stage => [stage.startTime, stage.endTime]), ...flight.events.map(event => event.time)];
  for (const boundary of boundaries) for (const offset of [-2 * EPS, -EPS, -EPS / 2, -1e-12, -Number.EPSILON, 0, Number.EPSILON, 1e-12, EPS / 2, EPS, 2 * EPS]) values.push(boundary + offset);
  return values;
}

test('optimized board and world samples remain bit-exact with the frozen algorithm at dense and critical times', () => {
  const flights = fixtures(), phases = new Set();
  assert.ok(flights.some(flight => flight.obstruction?.kind === 'net'));
  assert.ok(flights.some(flight => flight.obstruction?.kind === 'post'));
  assert.ok(flights.some(flight => flight.obstruction?.kind === 'under-net'));
  assert.ok(flights.some(flight => flight.events.some(event => event.aroundPost === true)));
  for (const flight of flights) {
    const before = JSON.stringify(flight);
    for (const seconds of sampleTimes(flight)) {
      const board = flight.sampleBoard(seconds), world = flight.sample(seconds);
      assert.deepEqual(board, frozenBoardAlgorithm(flight, seconds));
      assert.deepEqual(world, frozenWorldAlgorithm(flight, seconds));
      assert.deepEqual(Reflect.ownKeys(board), ['x', 'y', 'heightFeet', 'phase', 'bounced']);
      assert.deepEqual(Reflect.ownKeys(world), ['x', 'y', 'z', 'phase', 'bounced']);
      assert.equal(Object.isFrozen(board), true); assert.equal(Object.isFrozen(world), true);
      phases.add(board.phase);
    }
    assert.equal(JSON.stringify(flight), before);
  }
  for (const phase of ['flight', 'post-bounce', 'net-drop', 'bounce', 'dead', 'second-bounce']) assert.ok(phases.has(phase), phase);
});

test('optimized samplers preserve finite-input rejection without coercion', () => {
  const flight = fixtures()[0];
  for (const seconds of [undefined, null, NaN, Infinity, -Infinity, '1', false, {}, [], 1n, Symbol('time')]) {
    for (const sample of [flight.sampleBoard, flight.sample]) assert.throws(() => sample(seconds), { name: 'TypeError', message: 'seconds must be finite.' });
  }
  let coerced = false;
  const seconds = { valueOf() { coerced = true; return .5; } };
  assert.throws(() => flight.sampleBoard(seconds), TypeError); assert.equal(coerced, false);
});

test('samples stay frozen and independent across calls, coordinate spaces and flights', () => {
  const flights = fixtures(), flight = flights[0], time = flight.totalDuration * .37;
  const board = flight.sampleBoard(time), world = flight.sample(time), savedBoard = { ...board }, savedWorld = { ...world };
  assert.notEqual(flight.sampleBoard(time), board); assert.notEqual(flight.sample(time), world);
  assert.throws(() => { board.x = 0; }, TypeError); assert.throws(() => { world.phase = 'invented'; }, TypeError);
  for (const other of flights) for (const fraction of [0, .17, .51, .97, 1]) { other.sampleBoard(other.totalDuration * fraction); other.sample(other.totalDuration * fraction); }
  assert.deepEqual(board, savedBoard); assert.deepEqual(world, savedWorld);
});
