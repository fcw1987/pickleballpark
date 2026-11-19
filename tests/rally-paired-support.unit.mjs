import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFlightParametersV1 } from '../rally-targets.js';
import { contactFeetV1, planMovementV1, replanMovementV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
const ids = { player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' };
function mirror(value) {
  if (Array.isArray(value)) return value.map(mirror);
  if (value && typeof value === 'object') {
    const out = Object.fromEntries(Object.entries(value).map(([k,v]) => [ids[k] ?? k, mirror(v)]));
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) { out.x = 20 - value.x; out.y = 44 - value.y; }
    return out;
  }
  return ids[value] ?? ({green:'orange',orange:'green'})[value] ?? value;
}
function setup(reflected = false) {
  const source = { positions: { player1: { x: 15, y: 14.25 }, player2: { x: 5, y: 14.25 }, player3: { x: 8, y: 29.75 }, player4: { x: 16, y: 29.75 } },
    players: Object.fromEntries([1,2,3,4].map(i => [`player${i}`, { team: i < 3 ? 'green' : 'orange', handedness: 'right' }])),
    hitter: 'player1', receiver: 'player3', partner: 'player4', contact: { x: 15.8, y: 17, heightFeet: 1.2 }, target: { x: 1, y: 27 },
    contactFeet: [{ x: 15.42, y: 14.25 }, { x: 14.58, y: 14.25 }], kind: 'groundstroke', index: 8, opening: 'midrally',
    family: 'dink', intent: 'cross-court-dink', quality: 'neutral', pace: 'soft', contactTime: 0, peakFeetPerSecond: 17.95 };
  const args = reflected ? mirror(source) : source;
  const flight = resolveFlightParametersV1({ candidate: { family: 'dink', intent: 'cross-court-dink', pace: 'soft', arc: 'medium' },
    contact: args.contact, target: args.target, team: args.players[args.hitter].team }).flight;
  let lo = flight.firstLandingTime, hi = flight.totalDuration;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2, x = flight.sampleBoard(m).x; if (reflected ? x < 21.7 : x > -1.7) lo = m; else hi = m; }
  const contact = flight.sampleBoard(hi), feet = contactFeetV1({ contact, target: args.contact, team: args.players[args.receiver].team,
    handedness: 'right', contactStyle: 'backhand', kind: 'groundstroke', position: args.positions[args.receiver], availableSeconds: hi });
  assert.equal(feet.reachable, true); assert.equal(feet.routeReachable, true);
  return { args: { ...args, durationSeconds: flight.firstLandingTime }, arrival: { id: args.receiver, stance: feet.stance, contact }, duration: hi };
}
function segment(args, plan, duration = args.durationSeconds) {
  return { modelVersion: 2, startTime: 0, endTime: duration, duration, originalDuration: duration, contactTime: 0,
    previous: { positions: args.positions }, step: { id: 'wide-dink', positions: plan.positions },
    shotSemantics: { playerId: args.hitter, contact: { feet: args.contactFeet } }, model2Momentum: [] };
}
for (const reflected of [false,true]) for (const pairedCoverage of [false,true]) test(`an actual wide kitchen dink brings the supporting partner toward the middle (reflected=${reflected}, paired=${pairedCoverage})`, () => {
  const { args, arrival, duration } = setup(reflected);
  const plan = planMovementV1({ ...args, pairedCoverage }), pending = segment(args, plan);
  const before = JSON.stringify({ args, plan, pending, arrival });
  const result = replanMovementV1({ plan, segment: pending, players: args.players, durationSeconds: duration, arrival, peakFeetPerSecond: 17.95 });
  assert.equal(result.ok, true); assert.deepEqual(result.positions[arrival.id], arrival.stance);
  assert.equal(result.positions[args.partner].x, 10);
  assert.equal(result.positions[args.partner].y, args.positions[args.partner].y, 'line balance is not traded for a purely lateral support move');
  const actual = segment(args, result, duration);
  assert.equal(inspectGeneratedMovementV1(actual).valid, true); assert.equal(inspectGeneratedSpacingV1(actual).valid, true);
  assert.equal(JSON.stringify({ args, plan, pending, arrival }), before);
  const partial = replanMovementV1({ plan, segment: pending, players: args.players, durationSeconds: .25, arrival: { ...arrival, stance: args.positions[arrival.id] } });
  assert.equal(partial.ok, true);
  assert.ok(Math.abs(partial.positions[args.partner].x - args.positions[args.partner].x) <= 18*.25/2+1e-7, 'short time cannot teleport a partner to the T');
});

test('central poaches, fast attacks, deep arrivals and unsupported arrival metadata do not force a second player to chase', () => {
  const base = setup();
  for (const change of [{ arrival: { contact: { x: 10, y: 30, heightFeet: 2 } } },
    { args: { family: 'drive', intent: 'drive', pace: 'firm' } },
    { arrival: { contact: { x: -1.7, y: 39, heightFeet: 2 }, stance: { x: 1.3, y: 39 } } },
    { arrival: { contact: undefined } }]) {
    const args = { ...base.args, ...change.args }, arrival = { ...base.arrival, ...change.arrival };
    // Keep the deep example reachable; this assertion concerns lateral support only.
    const duration = change.arrival?.stance?.y === 39 ? 3 : base.duration;
    const plan = planMovementV1(args), pending = segment(args, plan);
    const withMetadata = replanMovementV1({ plan, segment: pending, players: args.players, durationSeconds: duration, arrival });
    const withoutMetadata = replanMovementV1({ plan, segment: pending, players: args.players, durationSeconds: duration, arrival: { id: arrival.id, stance: arrival.stance } });
    assert.equal(withMetadata.ok, true); assert.deepEqual(withMetadata.positions, withoutMetadata.positions);
  }
});

test('repeated wide exchanges retain a partner already covering the T without geometric threshold jumps', () => {
  for (const reflected of [false,true]) {
    const base = setup(reflected), receiver = base.arrival.id, partner = base.args.partner;
    const lineY = reflected ? 14.25 : 29.75;
    const args = structuredClone(base.args); args.durationSeconds = 1.5;
    args.positions[receiver] = { x: reflected ? 18.7 : 1.3, y: lineY };
    const endpoints = [];
    for (const offset of [-1e-7,0,1e-7]) {
      args.positions[partner] = { x: 10 + offset, y: lineY };
      const plan = planMovementV1(args);
      const arrival = { id: receiver, stance: args.positions[receiver], contact: { x: reflected ? 21.7 : -1.7, y: lineY, heightFeet: 1 } };
      const result = replanMovementV1({ plan, segment: segment(args,plan), players: args.players, durationSeconds: 1.5, arrival });
      assert.equal(result.ok,true); assert.equal(result.positions[partner].x,10);
      endpoints.push(result.positions[partner].x);
      assert.equal(inspectGeneratedSpacingV1(segment(args,result)).valid,true);
      assert.equal(inspectGeneratedMovementV1(segment(args,result)).valid,true);
    }
    assert.ok(Math.max(...endpoints)-Math.min(...endpoints)<1e-6);
  }
});
