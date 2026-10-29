import test from 'node:test';
import assert from 'node:assert/strict';
import { contactFeetV1, boundMovementV1, planMovementV1, sampleFeetStateV1, inspectGeneratedMovementV1 } from '../rally-movement.js';
import { sampleActorBoardPositionV2 } from '../play-actors-v2.js';

const players = {
  player1: { team: 'green', handedness: 'right' }, player2: { team: 'green', handedness: 'left' },
  player3: { team: 'orange', handedness: 'right' }, player4: { team: 'orange', handedness: 'left' },
};
const positions = { player1: { x: 5, y: 3 }, player2: { x: 15, y: 3 }, player3: { x: 5, y: 41 }, player4: { x: 15, y: 30 } };
const source = () => structuredClone({ positions, players });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segment({ from = positions, to = positions, hitter = 'player1', feet = [{ x: 4.58, y: 3 }, { x: 5.42, y: 3 }], duration = 1, contactTime = 0, startTime = 0, id = 'test', momentum = [] } = {}) {
  return { modelVersion: 2, startTime, endTime: startTime + duration, duration, originalDuration: duration, contactTime,
    previous: { positions: structuredClone(from) }, step: { id, positions: structuredClone(to) },
    shotSemantics: { playerId: hitter, contact: { feet } }, model2Momentum: momentum };
}

test('contact stance mirrors handedness and team while keeping explicit grounded feet within paddle reach', () => {
  for (const team of ['green', 'orange']) for (const handedness of ['right', 'left']) {
    const contact = { x: 10, y: team === 'green' ? 14 : 30 }, target = { x: 10, y: team === 'green' ? 30 : 14 };
    const result = contactFeetV1({ contact, target, team, handedness, kind: 'volley' });
    assert.equal(result.feet.length, 2); assert.equal(result.grounded, true); assert.equal(result.legalVolleyFeet, true); assert.equal(result.reachable, true);
    const expectedBodySide = (team === 'green' ? 1 : -1) * (handedness === 'right' ? 1 : -1);
    assert.ok(Math.sign(result.stance.x - contact.x) === expectedBodySide);
    assert.ok(distance(result.stance, contact) <= 3);
    assert.equal(result.feetEstablishedOutsideNVZ, true);
    assert.ok(team === 'green' ? result.feet.every(p => p.y < 15) : result.feet.every(p => p.y > 29));
  }
});

test('serve stance preserves the declared layout rather than silently repairing an illegal slot', () => {
  const at = { x: 4, y: -.75 };
  assert.deepEqual(contactFeetV1({ contact: at, target: { x: 14, y: 36 }, position: at, team: 'green', kind: 'serve' }).stance, at);
  const bad = { x: 4, y: 16 };
  const result = contactFeetV1({ contact: bad, target: { x: 14, y: 36 }, position: bad, team: 'green', kind: 'serve' });
  assert.deepEqual(result.stance, bad);
  assert.equal(result.feetEstablishedOutsideNVZ, false);
  const apron = { x: 28, y: -.75 };
  assert.deepEqual(contactFeetV1({ contact: apron, target: { x: 14, y: 36 }, position: apron, team: 'green', kind: 'serve' }).stance, apron);
});

test('bounded ease endpoints produce an actual peak at the declared bound, with no distance tolerance', () => {
  const from = { x: 0, y: 0 }, target = boundMovementV1(from, { x: 30, y: 0 }, 1);
  assert.equal(target.x, 9);
  const start = structuredClone(positions), end = structuredClone(positions); start.player4 = from; end.player4 = { ...target };
  const result = inspectGeneratedMovementV1(segment({ from: start, to: end }));
  assert.equal(result.valid, true); assert.ok(Math.abs(result.byActor.player4 - 18) < 1e-7);
  end.player4.x += .001;
  const rejected = inspectGeneratedMovementV1(segment({ from: start, to: end }));
  assert.equal(rejected.valid, false); assert.equal(rejected.actor, 'player4'); assert.ok(rejected.peakFeetPerSecond > 18);
});

test('peak audit includes first contact arrival, the contact hold and terminal release', () => {
  const end = structuredClone(positions); end.player1 = { x: 10, y: 3 };
  const held = segment({ to: end, contactTime: .5, duration: 1 });
  const audit = inspectGeneratedMovementV1(held);
  assert.equal(audit.valid, false); assert.equal(audit.actor, 'player1');
  assert.ok(Math.abs(audit.peakFeetPerSecond - 10 / .38) < 1e-6);
  const feet = [{ x: 8.58, y: 3 }, { x: 9.42, y: 3 }];
  const arrival = inspectGeneratedMovementV1(segment({ feet, contactTime: .1, duration: 1 }));
  assert.equal(arrival.valid, false); assert.ok(arrival.peakFeetPerSecond > 18);
});

test('actual clipped terminal motion is checked instead of an endpoint that is never reached', () => {
  const end = structuredClone(positions); end.player4.x += 8;
  const full = segment({ to: end, duration: 1 });
  const clipped = { ...full, duration: .1, endTime: .1, originalDuration: 1 };
  const audit = inspectGeneratedMovementV1(clipped);
  assert.equal(audit.valid, true); assert.ok(audit.maxPeakFeetPerSecond <= 18);
  assert.ok(sampleActorBoardPositionV2(clipped, 'player4', .1).x < 15.2);
});

test('momentum foot motion and a zero-time stage jump cannot evade peak checks', () => {
  const evidence = [{ actor: 'player1', contactTime: 0, time: .04, from: { x: 5, y: 3 }, to: { x: 15, y: 3 },
    fromFeet: [{ x: 4.58, y: 3 }, { x: 5.42, y: 3 }], feet: [{ x: 14.58, y: 3 }, { x: 15.42, y: 3 }] }];
  const momentum = inspectGeneratedMovementV1(segment({ momentum: evidence }));
  assert.equal(momentum.valid, false); assert.ok(momentum.peakFeetPerSecond >= 250 - 1e-6);
  const first = segment({ duration: .2 }); const nextFrom = structuredClone(positions); nextFrom.player4.x += 1;
  const second = segment({ from: nextFrom, to: nextFrom, startTime: .2, duration: .2, id: 'jump' });
  assert.equal(inspectGeneratedMovementV1({ segments: [first, second], duration: .4 }).valid, false);
});

test('opening serving team holds until the return has bounced and declared receiver remains back for the serve', () => {
  const input = source(), before = JSON.stringify(input);
  const plan = planMovementV1({ ...input, hitter: 'player1', contact: positions.player1, target: { x: 5, y: 36 },
    contactFeet: [{ x: 4.58, y: 3 }, { x: 5.42, y: 3 }], kind: 'serve', durationSeconds: 1.6, contactTime: .2, index: 0,
    service: { server: 'player1', receiver: 'player3', servingTeam: 'green' }, intent: 'serve' });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.positions.player1, positions.player1); assert.deepEqual(plan.positions.player2, positions.player2);
  assert.deepEqual(plan.positions.player3, positions.player3);
  assert.equal(JSON.stringify(input), before);
  const returnPlan = planMovementV1({ ...source(), hitter: 'player3', contact: positions.player3, target: { x: 5, y: 7 },
    contactFeet: [{ x: 4.58, y: 41 }, { x: 5.42, y: 41 }], durationSeconds: 1.8, index: 1,
    service: { server: 'player1', receiver: 'player3' }, intent: 'deep-return' });
  assert.deepEqual(returnPlan.positions.player1, positions.player1); assert.deepEqual(returnPlan.positions.player2, positions.player2);
  assert.ok(returnPlan.positions.player3.y < positions.player3.y);
  const sampled = segment({ from: positions, to: returnPlan.positions, hitter: 'player3', feet: returnPlan.contactEvidence.feet, duration: 1.8 });
  assert.equal(inspectGeneratedMovementV1(sampled).valid, true);
});

test('paired advance is complementary and subordinate to actual release time', () => {
  const plan = planMovementV1({ ...source(), hitter: 'player1', contact: positions.player1, target: { x: 8, y: 30 },
    contactFeet: [{ x: 4.58, y: 3 }, { x: 5.42, y: 3 }], durationSeconds: .3, contactTime: .1, index: 2,
    service: { server: 'player1', receiver: 'player3' }, intent: 'third-shot-drop' });
  assert.ok(plan.positions.player1.y < 4);
  assert.ok(plan.positions.player1.x < plan.positions.player2.x);
  const actual = segment({ from: positions, to: plan.positions, feet: plan.contactEvidence.feet, duration: .3, contactTime: .1 });
  assert.equal(inspectGeneratedMovementV1(actual).valid, true);
});

test('grounded reset state is sampled from actual feet rather than a provisional endpoint', () => {
  const start = structuredClone(positions), end = structuredClone(positions); start.player1 = { x: 7, y: 16 }; end.player1 = { x: 7, y: 14.25 };
  const actual = segment({ from: start, to: end, feet: [{ x: 6.58, y: 16 }, { x: 7.42, y: 16 }], duration: 1 });
  assert.equal(sampleFeetStateV1(actual, 0).player1.feetEstablishedOutsideNVZ, false);
  assert.equal(sampleFeetStateV1(actual, 1).player1.feetEstablishedOutsideNVZ, true);
  assert.equal(sampleFeetStateV1(actual, 0).player1.feetEstablishedOutsideNVZ, false, 'reverse sampling has no reset memory');
});

test('partner spacing checks real routes between safe endpoints, including a contact hold', async () => {
  const { inspectGeneratedSpacingV1 } = await import('../rally-movement.js');
  const end = structuredClone(positions); end.player1.x = 15; end.player2.x = 5;
  const actual = segment({ to: end, duration: 4, contactTime: .2 });
  assert.equal(inspectGeneratedMovementV1(actual).valid, true, 'the crossing is slow enough but tactically unsafe');
  const crossing = inspectGeneratedSpacingV1(actual);
  assert.equal(crossing.valid, false); assert.deepEqual(crossing.pair, ['player1', 'player2']);
  assert.ok(crossing.time > 0 && crossing.time < 4); assert.ok(crossing.separationFeet < 2.5);
  const clipped = { ...actual, duration: .1, endTime: .1 };
  assert.equal(inspectGeneratedSpacingV1(clipped).valid, true, 'an unplayed endpoint cannot establish an actual crossing');
});

test('paired movement holds a close pair when different hold phases would squeeze their actual gap', async () => {
  const { inspectGeneratedSpacingV1 } = await import('../rally-movement.js');
  const from = structuredClone(positions); from.player1 = { x: 4, y: 14 }; from.player2 = { x: 6.6, y: 14 };
  const plan = planMovementV1({ positions: from, players, hitter: 'player2', contact: from.player2, target: { x: 8, y: 30 },
    contactFeet: [{ x: 6.18, y: 14 }, { x: 7.02, y: 14 }], durationSeconds: 1, contactTime: .5, index: 5,
    service: { server: 'player1', receiver: 'player3' }, intent: 'cross-court-dink' });
  assert.equal(plan.ok, true);
  const actual = segment({ from, to: plan.positions, hitter: 'player2', feet: plan.contactEvidence.feet, duration: 1, contactTime: .5 });
  assert.equal(inspectGeneratedSpacingV1(actual).valid, true);
});


test('nonfinite derived actor geometry cannot pass either generated-route audit', async () => {
  const { inspectGeneratedSpacingV1 } = await import('../rally-movement.js');
  const to = structuredClone(positions); to.player4.x = NaN;
  assert.equal(inspectGeneratedMovementV1(segment({ to })).valid, false);
  assert.equal(inspectGeneratedSpacingV1(segment({ to })).valid, false);
});


test('generator helpers cannot raise the 18 ft/s bound through a caller option', () => {
  assert.throws(() => boundMovementV1({ x: 0, y: 0 }, { x: 10, y: 0 }, 1, 19), /18/);
  assert.throws(() => inspectGeneratedMovementV1(segment(), { maxPeakFeetPerSecond: 19 }), /18/);
});

test('an actual response origin can keep a reachable stance instead of forcing the default short paddle plant', () => {
  const contact = { x: 9.763085, y: 29.75, heightFeet: 2.735 }, origin = { x: 5.399185, y: 29.75 };
  const result = contactFeetV1({ contact, target: { x: 10, y: 8 }, team: 'orange', handedness: 'right',
    contactStyle: 'forehand', kind: 'volley', position: origin, availableSeconds: .28 });
  assert.equal(result.reachable, true); assert.equal(result.legalVolleyFeet, true); assert.equal(result.routeReachable, true);
  assert.ok(result.travelFeet < 1.365); assert.ok(result.arrivalPeakFeetPerSecond < 9.75);
  assert.ok(result.bodyClearanceFeet >= .9 && result.bodyClearanceFeet <= 3);
  assert.equal(result.stance.y, 29.75);
  const legacyPlant = contactFeetV1({ contact, target: { x: 10, y: 8 }, team: 'orange', handedness: 'right', kind: 'volley' });
  assert.ok(distance(origin, legacyPlant.stance) * 2 / .28 > 18, 'the old forced plant wastes the represented paddle reach');
  const from = structuredClone(positions), to = structuredClone(positions); from.player4 = origin; to.player4 = result.stance;
  const actual = segment({ from, to, duration: .28 });
  assert.equal(inspectGeneratedMovementV1(actual).valid, true);
});

test('origin-aware contacts mirror both teams, hands and stroke sides without changing their timed route bound', () => {
  for (const team of ['green', 'orange']) for (const handedness of ['right', 'left']) for (const contactStyle of ['forehand', 'backhand']) {
    const side = (team === 'green' ? 1 : -1) * (handedness === 'right' ? 1 : -1) * (contactStyle === 'backhand' ? -1 : 1);
    const contact = { x: 10, y: team === 'green' ? 14.25 : 29.75, heightFeet: 2.7 }, origin = { x: 10 + side * 4.4, y: contact.y };
    const result = contactFeetV1({ contact, target: { x: 10, y: team === 'green' ? 30 : 14 }, team, handedness, contactStyle,
      kind: 'volley', position: origin, availableSeconds: .28 });
    assert.equal(result.reachable, true); assert.equal(result.routeReachable, true); assert.equal(result.legalVolleyFeet, true);
    assert.ok(side * (result.stance.x - contact.x) >= .15 - 1e-7);
    assert.ok(result.bodyClearanceFeet >= .9 - 1e-7 && result.bodyClearanceFeet <= 3);
    assert.ok(result.arrivalPeakFeetPerSecond <= 18); assert.ok(Math.abs(result.travelFeet - 1.40001) < 1e-6);
    assert.ok(team === 'green' ? result.feet.every(p => p.y < 15) : result.feet.every(p => p.y > 29));
  }
});

test('a safe origin already inside paddle range stays put, but torso and NVZ clearance remain mandatory', () => {
  const contact = { x: 10, y: 14.25, heightFeet: 2.7 }, origin = { x: 12.8, y: 14.25 };
  const held = contactFeetV1({ contact, target: { x: 7, y: 32 }, team: 'green', kind: 'volley', position: origin });
  assert.deepEqual(held.stance, origin); assert.equal(held.travelFeet, 0);
  const close = contactFeetV1({ contact: { x: 10, y: 14.75 }, target: { x: 7, y: 32 }, team: 'green', kind: 'volley', position: { x: 10.05, y: 14.75 } });
  assert.ok(close.bodyClearanceFeet >= .9 - 1e-7); assert.ok(close.bodyClearanceFeet <= 3);
  assert.ok(close.feet.every(p => p.y <= 14.25)); assert.ok(close.stance.x > 10);
  assert.equal(close.reachable, true); assert.equal(close.legalVolleyFeet, true);
});

test('origin-aware grounded Erne feet may stay beside the kitchen when both feet are outside the sideline', () => {
  const result = contactFeetV1({ contact: { x: -1.6, y: 20 }, target: { x: 7, y: 32 }, team: 'green',
    kind: 'volley', position: { x: -1.5, y: 20 }, availableSeconds: .3 });
  assert.equal(result.reachable, true); assert.equal(result.routeReachable, true); assert.equal(result.legalVolleyFeet, true);
  assert.ok(result.feet.every(p => p.x < 0)); assert.ok(result.stance.y > 15 && result.stance.y < 22);
});

test('static paddle reach never certifies an arrival that lacks actual route time', () => {
  const result = contactFeetV1({ contact: { x: 10, y: 14.25 }, target: { x: 10, y: 32 }, team: 'green',
    kind: 'volley', position: { x: 17, y: 14.25 }, availableSeconds: .1 });
  assert.equal(result.reachable, true); assert.equal(result.routeReachable, false); assert.ok(result.arrivalPeakFeetPerSecond > 18);
  const impossible = contactFeetV1({ contact: { x: -8, y: 14 }, target: { x: 8, y: 32 }, team: 'green', handedness: 'right',
    contactStyle: 'backhand', kind: 'volley', position: { x: -7, y: 14 } });
  assert.equal(impossible.reachable, false); assert.equal(impossible.stanceFeasible, false);
  assert.throws(() => contactFeetV1({ contact: { x: 7, y: 14 }, target: { x: 7, y: 30 }, team: 'green',
    position: { x: 8, y: 14 }, availableSeconds: -.1 }), /time/);
});

test('omitting an actual origin retains the original default stance and result shape', () => {
  const result = contactFeetV1({ contact: { x: 10, y: 14 }, target: { x: 10, y: 30 }, team: 'green', kind: 'volley' });
  assert.deepEqual(result.stance, { x: 10.8, y: 13.2 });
  assert.equal('originUsed' in result, false); assert.equal('travelFeet' in result, false);
});

test('a controlled third-shot drive advances the serving pair only after the return bounce, within actual timing', async () => {
  const { inspectGeneratedSpacingV1 } = await import('../rally-movement.js');
  for (const team of ['green', 'orange']) {
    const from = structuredClone(positions), hitter = team === 'green' ? 'player1' : 'player3', partner = team === 'green' ? 'player2' : 'player4';
    const server = hitter, receiver = team === 'green' ? 'player3' : 'player1';
    from[hitter] = { x: 5, y: team === 'green' ? 3 : 41 }; from[partner] = { x: 15, y: team === 'green' ? 3 : 41 };
    const feet = [{ x: 4.58, y: from[hitter].y }, { x: 5.42, y: from[hitter].y }];
    const input = { positions: from, players, hitter, contact: from[hitter], target: { x: 10, y: team === 'green' ? 37 : 7 },
      contactFeet: feet, durationSeconds: .8, index: 2, service: { server, receiver }, intent: 'third-shot-drive', family: 'drive', quality: 'neutral', pace: 'firm' };
    const plan = planMovementV1(input);
    assert.equal(plan.ok, true);
    for (const actor of [hitter, partner]) {
      assert.ok(team === 'green' ? plan.positions[actor].y > from[actor].y : plan.positions[actor].y < from[actor].y);
      assert.ok(team === 'green' ? plan.positions[actor].y < 14.25 : plan.positions[actor].y > 29.75, 'short flight cannot force the pair to the line');
    }
    const actual = segment({ from, to: plan.positions, hitter, feet, duration: .8 });
    assert.equal(inspectGeneratedMovementV1(actual).valid, true); assert.equal(inspectGeneratedSpacingV1(actual).valid, true);
    const waiting = planMovementV1({ ...input, index: 1 });
    assert.deepEqual(waiting.positions[hitter], from[hitter]); assert.deepEqual(waiting.positions[partner], from[partner]);
    const failed = planMovementV1({ ...input, quality: 'error' });
    assert.equal(failed.positions[hitter].y, from[hitter].y); assert.equal(failed.positions[partner].y, from[partner].y);
  }
});

test('a controlled firm volley continues a paired approach, while soft or attackable volleys do not invent it', () => {
  const from = structuredClone(positions); from.player1 = { x: 5, y: 9 }; from.player2 = { x: 15, y: 9 };
  const input = { positions: from, players, hitter: 'player1', contact: from.player1, target: { x: 10, y: 35 },
    contactFeet: [{ x: 4.58, y: 9 }, { x: 5.42, y: 9 }], durationSeconds: .35, index: 4,
    service: { server: 'player1', receiver: 'player3' }, intent: 'volley', family: 'volley', quality: 'excellent', pace: 'firm', kind: 'volley' };
  const plan = planMovementV1(input);
  assert.equal(plan.ok, true); assert.ok(plan.positions.player1.y > 9); assert.ok(plan.positions.player2.y > 9);
  const actual = segment({ from, to: plan.positions, feet: plan.contactEvidence.feet, duration: .35 });
  assert.equal(inspectGeneratedMovementV1(actual).valid, true);
  for (const change of [{ pace: 'soft' }, { quality: 'attackable' }, { quality: 'error' }]) {
    const held = planMovementV1({ ...input, ...change });
    assert.equal(held.positions.player1.y, 9); assert.equal(held.positions.player2.y, 9);
  }
});
