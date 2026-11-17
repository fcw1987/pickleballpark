import test from 'node:test';
import assert from 'node:assert/strict';
import { planMovementV1, replanMovementV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1, sampleFeetStateV1 } from '../rally-movement.js';
import { sampleActorBoardPositionV2 } from '../play-actors-v2.js';
const players = Object.fromEntries([1,2,3,4].map(i => [`player${i}`, { team: i < 3 ? 'green' : 'orange', handedness: 'right' }]));
const ids = { player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' };
function mirror(value) {
  if (Array.isArray(value)) return value.map(mirror);
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(Object.entries(value).map(([k,v]) => [ids[k] ?? ({ green: 'orange', orange: 'green' })[k] ?? k, mirror(v)]));
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) { result.x = 20 - value.x; result.y = 44 - value.y; }
    return result;
  }
  return ids[value] ?? ({ green: 'orange', orange: 'green' })[value] ?? value;
}
function input() {
  return { positions: { player1: { x: 5, y: 17 }, player2: { x: 15, y: 0 }, player3: { x: 5, y: 29.75 }, player4: { x: 15, y: 29.75 } },
    players, hitter: 'player1', contact: { x: 4.2, y: 18, heightFeet: 1 }, target: { x: 15, y: 27 },
    durationSeconds: 1, contactTime: 0, index: 6, opening: 'midrally', family: 'dink', intent: 'cross-court-dink',
    quality: 'neutral', pace: 'soft', kind: 'groundstroke', contactFeet: [{ x: 5.42, y: 17 }, { x: 4.58, y: 17 }], peakFeetPerSecond: 17.95 };
}
function segment(args, plan, duration = args.durationSeconds) {
  return { modelVersion: 2, startTime: 0, endTime: duration, duration, originalDuration: duration, contactTime: args.contactTime,
    previous: { positions: args.positions }, step: { id: 'grounded-dink-recovery', positions: plan.positions },
    shotSemantics: { playerId: args.hitter, contact: { feet: args.contactFeet } }, model2Momentum: [] };
}
for (const reflected of [false, true]) {
  test(`a legal grounded kitchen entry exits independently of a lagging partner (${reflected ? 'orange' : 'green'})`, () => {
    const args = reflected ? mirror(input()) : input(), before = JSON.stringify(args), hitter = args.hitter;
    const plan = planMovementV1(args), lineY = reflected ? 29.75 : 14.25;
    assert.equal(plan.ok, true); assert.equal(plan.positions[hitter].y, lineY);
    const actual = segment(args, plan);
    assert.equal(inspectGeneratedMovementV1(actual).valid, true); assert.equal(inspectGeneratedSpacingV1(actual).valid, true);
    assert.equal(sampleFeetStateV1(actual, 0)[hitter].feetEstablishedOutsideNVZ, false);
    assert.equal(sampleFeetStateV1(actual, 1)[hitter].feetEstablishedOutsideNVZ, true);
    assert.deepEqual(sampleActorBoardPositionV2(actual, hitter, .12), args.positions[hitter], 'the contact hold is not shortened');
    const resolved = replanMovementV1({ plan, segment: actual, players: args.players, durationSeconds: 1, peakFeetPerSecond: 17.95 });
    assert.equal(resolved.ok, true); assert.deepEqual(resolved.positions, plan.positions);
    assert.equal(JSON.stringify(args), before);
  });
  test(`insufficient time leaves a partial honest NVZ exit (${reflected ? 'orange' : 'green'})`, () => {
    const args = reflected ? mirror(input()) : input(); args.durationSeconds = .2;
    const plan = planMovementV1(args); assert.equal(plan.ok, true);
    const actual = segment(args, plan), hitter = args.hitter;
    assert.equal(sampleFeetStateV1(actual, .2)[hitter].feetEstablishedOutsideNVZ, false);
    assert.ok(Math.abs(plan.positions[hitter].y - args.positions[hitter].y) > 0);
    assert.equal(inspectGeneratedMovementV1(actual).valid, true); assert.equal(inspectGeneratedSpacingV1(actual).valid, true);
    const resolved = replanMovementV1({ plan, segment: actual, players: args.players, durationSeconds: 1, peakFeetPerSecond: 17.95 });
    assert.equal(resolved.ok, true); assert.equal(resolved.positions[hitter].y, reflected ? 29.75 : 14.25);
    assert.equal(sampleFeetStateV1(segment(args, resolved, 1), 1)[hitter].feetEstablishedOutsideNVZ, true);
  });
}
test('one foot inside the sideline still needs a grounded reset, even when the body center is outside', () => {
  const args = input(); args.positions.player1.x = -.2; args.contact.x = -.5;
  args.quality = 'attackable';
  args.contactFeet = [{ x: .22, y: 17 }, { x: -.62, y: 17 }]; args.durationSeconds = 2;
  const plan = planMovementV1(args); assert.equal(plan.ok, true);
  assert.equal(plan.positions.player1.y, 14.25);
  const actual = segment(args, plan); assert.equal(sampleFeetStateV1(actual, 2).player1.feetEstablishedOutsideNVZ, true);
  assert.equal(inspectGeneratedMovementV1(actual).valid, true); assert.equal(inspectGeneratedSpacingV1(actual).valid, true);
});

for (const reflected of [false,true]) test(`a temporarily crossed stack exits the kitchen before trying to restore preferred sides (${reflected})`, () => {
  let args = input();
  args.positions.player1 = { x: 15, y: 17 }; args.positions.player2 = { x: 5, y: 14.25 };
  args.contact = { x: 14.2, y: 18, heightFeet: 1 }; args.contactFeet = [{ x: 15.42, y: 17 }, { x: 14.58, y: 17 }];
  args.target = { x: 10, y: 27 }; args.durationSeconds = 1.5;
  args.stacking = { version: 'stacking-v1', teams: { green: { mode: 'full', leftPlayer: 'player2' } } };
  if (reflected) args = mirror(args);
  const before = JSON.stringify(args), plan = planMovementV1(args); assert.equal(plan.ok, true);
  const expected = { x: args.positions[args.hitter].x, y: reflected ? 29.75 : 14.25 };
  assert.deepEqual(plan.positions[args.hitter], expected);
  const actual = segment(args, plan); assert.equal(inspectGeneratedSpacingV1(actual).valid, true); assert.equal(inspectGeneratedMovementV1(actual).valid, true);
  assert.equal(sampleFeetStateV1(actual,1.5)[args.hitter].feetEstablishedOutsideNVZ,true);
  const resolved = replanMovementV1({ plan, segment: actual, players: args.players, durationSeconds: 1.5 });
  assert.equal(resolved.ok,true); assert.deepEqual(resolved.positions[args.hitter],expected);
  assert.equal(JSON.stringify(args),before);
});
