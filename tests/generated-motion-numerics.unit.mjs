import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGeneratedMovementV1 } from '../rally-movement.js';
const limit = {maxAccelerationFeetPerSecondSquared: 30};
const initial = {player1: {x: 5, y: 3}, player2: {x: 15, y: 3}, player3: {x: 5, y: 30}, player4: {x: 15, y: 30}};
function segment({distance = 5, contactTime = 0, duration = 1, startTime = 0, from = initial, momentum = []} = {}) {
  return {modelVersion: 2, startTime, endTime: startTime + duration, duration, originalDuration: 1, contactTime,
    previous: {positions: structuredClone(from)}, step: {id: 'numerical-route', positions: {...structuredClone(from), player4: {x: from.player4.x + distance, y: from.player4.y}}},
    shotSemantics: {playerId: 'player1', contact: {feet: [{x: from.player1.x - .42, y: from.player1.y}, {x: from.player1.x + .42, y: from.player1.y}]}},
    model2Momentum: structuredClone(momentum)};
}
function rotate(route) {
  route = structuredClone(route);
  const point = value => ({x: 20 - value.x, y: 44 - value.y});
  for (const step of [route.previous, route.step]) step.positions = Object.fromEntries(Object.entries(step.positions).map(([id, value]) => [id, point(value)]));
  route.shotSemantics.contact.feet = route.shotSemantics.contact.feet.map(point);
  return route;
}

for (const mirrored of [false, true]) test(`irrelevant near-coincident hitter phases do not fabricate off-ball acceleration (${mirrored})`, () => {
  for (const distance of [.3, 1, 5, 7.5]) for (const epsilon of [1e-4, 1e-6, 1e-8, 1e-9, 1e-10, 1e-11]) {
    const source = segment({distance, contactTime: .5 + epsilon}), route = mirrored ? rotate(source) : source;
    const before = JSON.stringify(route), audit = inspectGeneratedMovementV1(route, limit);
    assert.equal(audit.valid, true, JSON.stringify({distance, epsilon, audit}));
    assert.ok(Math.abs(audit.maxAccelerationFeetPerSecondSquared - 4 * distance) < 1e-5);
    assert.ok(Math.abs(audit.maxPeakFeetPerSecond - 2 * distance) < 1e-5);
    assert.equal(JSON.stringify(route), before);
  }
});

test('a genuinely tiny dead-clipped interval retains the original quadratic derivative rather than cancellation noise', () => {
  for (const duration of [1e-4, 1e-6, 1e-8]) {
    const audit = inspectGeneratedMovementV1(segment({duration}), limit);
    assert.equal(audit.valid, true, JSON.stringify({duration, audit}));
    assert.ok(Math.abs(audit.maxAccelerationFeetPerSecondSquared - 20) < 1e-5);
    assert.ok(Math.abs(audit.maxPeakFeetPerSecond - 20 * duration) < 1e-6);
  }
});

test('a tiny represented interval of existing linear momentum has zero acceleration', () => {
  const momentum = [{actor: 'player4', contactTime: 0, time: 1, from: initial.player4, to: {x: 16, y: 30},
    fromFeet: [{x: 14.58, y: 30}, {x: 15.42, y: 30}], feet: [{x: 15.58, y: 30}, {x: 16.42, y: 30}]}];
  const audit = inspectGeneratedMovementV1(segment({duration: 1e-8, momentum}), limit);
  assert.equal(audit.valid, true, JSON.stringify(audit));
  assert.ok(audit.maxAccelerationFeetPerSecondSquared < 1e-5);
  assert.ok(Math.abs(audit.maxPeakFeetPerSecond - 1) < 1e-6);
});

test('tiny real momentum activation must not be skipped as an irrelevant numerical cut', () => {
  const momentum = [{actor: 'player4', contactTime: .5, time: .50000001, from: initial.player4, to: {x: 15.00000001, y: 30},
    fromFeet: [{x: 14.58, y: 30}, {x: 15.42, y: 30}], feet: [{x: 14.58000001, y: 30}, {x: 15.42000001, y: 30}]}];
  const route = segment({distance: 0, momentum});
  assert.equal(inspectGeneratedMovementV1(route).valid, true);
  const audit = inspectGeneratedMovementV1(route, limit);
  assert.equal(audit.valid, false); assert.match(audit.reason, /velocity|acceleration/);
});

test('continuous positions do not excuse an instantaneous velocity change across segment boundaries', () => {
  const first = segment({duration: .5}), from = structuredClone(initial); from.player4.x = 17.5;
  const second = segment({distance: 0, from, startTime: .5, duration: .5});
  const timeline = {segments: [first, second], duration: 1};
  assert.equal(inspectGeneratedMovementV1(timeline).valid, true);
  const audit = inspectGeneratedMovementV1(timeline, limit);
  assert.equal(audit.valid, false); assert.match(audit.reason, /velocity/);
  assert.ok(Math.abs(audit.velocityChangeFeetPerSecond - 10) < 1e-6);
});

test('the same continuous linear momentum across segments remains supported', () => {
  const momentum = [{actor: 'player4', contactTime: 0, time: 2, from: initial.player4, to: {x: 17, y: 30},
    fromFeet: [{x: 14.58, y: 30}, {x: 15.42, y: 30}], feet: [{x: 16.58, y: 30}, {x: 17.42, y: 30}]}];
  const first = segment({distance: .5, duration: .5, momentum}), from = structuredClone(initial); from.player4.x = 15.5;
  const second = segment({distance: .5, from, startTime: .5, duration: .5, momentum});
  const audit = inspectGeneratedMovementV1({segments: [first, second], duration: 1}, limit);
  assert.equal(audit.valid, true, JSON.stringify(audit)); assert.ok(audit.maxAccelerationFeetPerSecondSquared < 1e-6);
  assert.ok(Math.abs(audit.maxPeakFeetPerSecond - 1) < 1e-6);
});
