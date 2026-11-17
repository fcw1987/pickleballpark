import test from 'node:test';
import assert from 'node:assert/strict';
import { rankContactCandidates } from '../rally-tactics.js';
import { rankContactCandidatesV2 } from '../rally-policy.js';
import { planMovementV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';

const ids = ['player1', 'player2', 'player3', 'player4'];
const players = Object.fromEntries(ids.map((id, i) => [id, { team: i < 2 ? 'green' : 'orange', handedness: 'right' }]));
const positions = { player1: { x: 5, y: 8 }, player2: { x: 15, y: 8 }, player3: { x: 5, y: 36 }, player4: { x: 15, y: 36 } };
const feetAt = p => [{ x: p.x - .42, y: p.y }, { x: p.x + .42, y: p.y }];
const opposite = { player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' };
const rotate = p => ({ x: 20 - p.x, y: 44 - p.y });
const mirrorPositions = p => Object.fromEntries(Object.entries(p).map(([id, at]) => [opposite[id], rotate(at)]));
function input(hitter = 'player1', extra = {}) {
  return { positions, players, hitter, contact: positions[hitter], target: { x: 10, y: players[hitter].team === 'green' ? 27 : 17 },
    contactFeet: feetAt(positions[hitter]), durationSeconds: .8, index: 5,
    service: { server: 'player1', receiver: 'player3' }, family: 'reset', intent: 'reset', quality: 'neutral', pace: 'soft', ...extra };
}
function verifyRoute(args, plan) {
  assert.equal(plan.ok, true);
  const segment = { modelVersion: 2, startTime: 0, endTime: args.durationSeconds, duration: args.durationSeconds,
    originalDuration: args.durationSeconds, contactTime: args.contactTime ?? 0,
    previous: { positions: args.positions }, step: { id: 'positioning', positions: plan.positions },
    shotSemantics: { playerId: args.hitter, contact: { feet: args.contactFeet } }, model2Momentum: [] };
  assert.equal(inspectGeneratedMovementV1(segment).valid, true);
  assert.equal(inspectGeneratedSpacingV1(segment).valid, true);
}

test('coverage and new Smart ranking use the same anatomical forehand as physical model 2 for both ends and hands', () => {
  for (const team of ['green', 'orange']) for (const handedness of ['left', 'right']) {
    const records = structuredClone(players), eligible = ids.filter(id => records[id].team === team);
    for (const id of eligible) records[id].handedness = handedness;
    const args = { eligible, positions, players: records, contact: { x: 10, y: positions[eligible[0]].y }, availableSeconds: .5 };
    const ranked = rankContactCandidates(args), model2 = rankContactCandidatesV2(args);
    assert.equal(ranked[0].id, model2[0].id, `${team}/${handedness}`);
    assert.ok(ranked[0].reasons.includes('forehand-tiebreak'));
    assert.ok(!ranked[1].reasons.includes('forehand-tiebreak'));
    assert.deepEqual(rankContactCandidates({ ...args, eligible: [eligible[0]] }).map(row => row.id), [eligible[0]], 'tactics cannot add an ineligible serve returner');
  }
  const centered = rankContactCandidates({ eligible: ['player1'], positions, players, contact: positions.player1, availableSeconds: 0 });
  assert.ok(!centered[0].reasons.includes('forehand-tiebreak'), 'zero lateral offset is not a forehand advantage');
});

test('after the opening both teams earn approach equally and attackable soft shots cannot keep a permanent returner advantage', () => {
  for (const hitter of ['player1', 'player3']) for (const family of ['drop', 'reset', 'dink']) {
    const args = input(hitter, { family, intent: family, quality: 'attackable' });
    const original = structuredClone(args), plan = planMovementV1(args);
    verifyRoute(args, plan);
    for (const id of ids.filter(id => players[id].team === players[hitter].team)) assert.equal(plan.positions[id].y, positions[id].y, `${hitter}/${family}/${id}: hold after own attackable shot`);
    for (const id of ids.filter(id => players[id].team !== players[hitter].team)) assert.ok(Math.abs(plan.positions[id].y - 22) < Math.abs(positions[id].y - 22), `${id}: incoming soft shot gives time to close`);
    assert.deepEqual(args, original);
    const swappedService = planMovementV1({ ...args, service: { server: 'player3', receiver: 'player1' } });
    assert.deepEqual(plan.positions, swappedService.positions, 'old server/receiver labels cannot change open-rally strategy');
    const controlled = planMovementV1({ ...args, quality: 'neutral' });
    verifyRoute({ ...args, quality: 'neutral' }, controlled);
    for (const id of ids.filter(id => players[id].team === players[hitter].team)) {
      assert.ok(Math.abs(controlled.positions[id].y - 22) < Math.abs(positions[id].y - 22));
    }
  }
});

test('incoming attacks do not pull the off-ball defender forward merely because that team returned the serve', () => {
  for (const hitter of ['player1', 'player3']) for (const family of ['drive', 'volley', 'overhead']) {
    const args = input(hitter, { family, intent: family, pace: 'firm' }), plan = planMovementV1(args);
    verifyRoute(args, plan);
    for (const id of ids.filter(id => players[id].team !== players[hitter].team)) {
      assert.equal(plan.diagnostics.goals[id].y, positions[id].y);
      assert.equal(plan.positions[id].y, positions[id].y);
    }
  }
});

test('midrally demonstrations earn a controlled approach from their first represented shot without inventing service restrictions', () => {
  for (const hitter of ['player1', 'player3']) for (const family of ['drop', 'reset', 'drive', 'volley']) {
    const args = input(hitter, { opening: 'midrally', index: 0, service: {}, family, intent: family, pace: 'firm' });
    const plan = planMovementV1(args); verifyRoute(args, plan);
    for (const id of ids) {
      if (players[id].team === players[hitter].team) assert.ok(Math.abs(plan.positions[id].y - 22) < Math.abs(positions[id].y - 22));
      else if (['drop', 'reset'].includes(family)) assert.ok(Math.abs(plan.positions[id].y - 22) < Math.abs(positions[id].y - 22));
      else assert.equal(plan.positions[id].y, positions[id].y);
    }
  }
});

test('kitchen crosscourt and wide-ball supporting recovery mirror physical ends, preserve spacing and settle at contact', () => {
  const up = { player1: { x: 5, y: 14.25 }, player2: { x: 15, y: 14.25 }, player3: { x: 5, y: 29.75 }, player4: { x: 15, y: 29.75 } };
  for (const target of [{ x: 17, y: 27 }, { x: -2, y: 27 }]) {
    const args = input('player1', { positions: up, contact: { x: 4, y: 14.25 }, contactFeet: feetAt(up.player1), target, family: 'dink', intent: 'cross-court-dink' });
    const plan = planMovementV1(args); verifyRoute(args, plan);
    const mirroredArgs = { ...args, positions: mirrorPositions(up), hitter: 'player3', contact: rotate(args.contact), target: rotate(target),
      contactFeet: args.contactFeet.map(rotate), service: { server: 'player3', receiver: 'player1' } };
    const mirrored = planMovementV1(mirroredArgs); verifyRoute(mirroredArgs, mirrored);
    for (const id of ids) {
      const expected = rotate(plan.positions[id]), actual = mirrored.positions[opposite[id]];
      assert.ok(Math.hypot(expected.x - actual.x, expected.y - actual.y) < 1e-9, id);
    }
    if (target.x > 10) for (const id of ids) assert.ok(plan.positions[id].x > up[id].x, `${id} follows the current crosscourt flight`);
    else assert.ok(plan.positions.player4.x < up.player4.x && plan.positions.player4.x > 10, 'partner closes toward the seam when the ball pulls the other defender beyond the left sideline');
  }
});

test('an outdated soft intent cannot turn an incoming drive or overhead into a soft approach opportunity', () => {
  for (const family of ['drive', 'volley', 'overhead']) {
    const args = input('player1', { family, intent: 'reset', pace: 'firm' });
    const plan = planMovementV1(args); verifyRoute(args, plan);
    for (const id of ['player3', 'player4']) assert.equal(plan.positions[id].y, positions[id].y);
  }
});

test('established kitchen defenders hold their balanced depth instead of creeping to an exact line on every soft ball', () => {
  for (const hitter of ['player1', 'player3']) {
    const up = { player1: { x: 5, y: 13.5 }, player2: { x: 15, y: 13.5 }, player3: { x: 5, y: 30.5 }, player4: { x: 15, y: 30.5 } };
    const args = input(hitter, { positions: up, contact: up[hitter], contactFeet: feetAt(up[hitter]), family: 'dink', intent: 'middle-dink' });
    const plan = planMovementV1(args); verifyRoute(args, plan);
    for (const id of ids.filter(id => players[id].team !== players[hitter].team)) assert.equal(plan.positions[id].y, up[id].y);
  }
});

test('the two-foot transition heuristic mirrors its boundary and treats a split pair as transitional', () => {
  for (const hitter of ['player1', 'player3']) {
    const defending = players[hitter].team === 'green' ? ['player3', 'player4'] : ['player1', 'player2'];
    const near = players[defending[0]].team === 'green', ready = near ? 14.25 : 29.75;
    const boundary = near ? 12.25 : 31.75, retreat = near ? -1 : 1;
    for (const offset of [-.001, 0, .001]) {
      const at = structuredClone(positions);
      for (const id of defending) at[id].y = boundary + retreat * offset;
      const args = input(hitter, { positions: at, contact: at[hitter], contactFeet: feetAt(at[hitter]) });
      const plan = planMovementV1(args); verifyRoute(args, plan);
      for (const id of defending) assert.equal(plan.diagnostics.goals[id].y, offset > 0 ? ready : at[id].y);
    }
    const at = structuredClone(positions);
    at[defending[0]].y = boundary + retreat;
    at[defending[1]].y = ready;
    const args = input(hitter, { positions: at, contact: at[hitter], contactFeet: feetAt(at[hitter]) });
    const plan = planMovementV1(args); verifyRoute(args, plan);
    assert.equal(plan.diagnostics.goals[defending[0]].y, ready, 'back partner may close behind a soft ball');
    assert.equal(plan.positions[defending[1]].y, ready, 'already-set partner does not retreat or overshoot');
  }
});
