import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRallyInputV1 } from '../rally-recipe.js';
import { STACKING_VERSION } from '../rally-stacking.js';
import { planMovementV1, replanMovementV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { sampleActorBoardPositionV2 } from '../play-actors-v2.js';
import { simulateRally } from '../rally-engine.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
const IDS = ['player1', 'player2', 'player3', 'player4'];
const other = (players, actor) => IDS.find(id => id !== actor && players[id].team === players[actor].team);
function setup({ server = 'player1', receiver = 'player3', court = 'right', hand = 'right', swap = true } = {}) {
  const players = Object.fromEntries(IDS.map((id,i) => [id, { team: i < 2 ? 'green' : 'orange', handedness: hand, style: 'advanced', flavour: 'balanced' }]));
  const preferred = swap ? (court === 'left' ? 'right' : 'left') : court;
  const stacking = { version: STACKING_VERSION, teams: Object.fromEntries([server, receiver].map(actor => [players[actor].team,
    { mode: 'full', leftPlayer: preferred === 'left' ? actor : other(players, actor) }])) };
  return normalizeRallyInputV1({ seed: 7, players, service: { server, receiver, court }, stacking });
}
const feetAt = p => [{ x: p.x - .42, y: p.y }, { x: p.x + .42, y: p.y }];
const positionsOf = layout => Object.fromEntries(IDS.map(id => [id, layout[id]]));
function actual(args, plan) {
  return { modelVersion: 2, startTime: 0, endTime: args.durationSeconds, duration: args.durationSeconds, originalDuration: args.durationSeconds,
    contactTime: args.contactTime ?? 0, previous: { positions: args.positions }, step: { id: 'stacking-leg', positions: plan.positions },
    shotSemantics: { playerId: args.hitter, contact: { feet: args.contactFeet } }, model2Momentum: [] };
}
function validRoutes(segment) {
  const movement = inspectGeneratedMovementV1(segment), spacing = inspectGeneratedSpacingV1(segment);
  assert.equal(movement.valid, true, JSON.stringify(movement)); assert.equal(spacing.valid, true, JSON.stringify(spacing));
}

test('all serve stacking orientations hold the partner and receiver, preserve deep roots, and unwind only after contact', () => {
  for (const server of IDS) for (const receiver of IDS.filter(id => Number(id.at(-1)) < 3 !== (Number(server.at(-1)) < 3))) {
    for (const court of ['left','right']) for (const hand of ['left','right']) for (const swap of [false,true]) {
      const input = setup({ server, receiver, court, hand, swap }), positions = positionsOf(input.layout), before = JSON.stringify(input);
      const partner = other(input.players, server), receiverPartner = other(input.players, receiver);
      const args = { ...input, positions, hitter: server, contact: input.layout.ball,
        target: { x: input.layout[receiver].x, y: input.players[server].team === 'green' ? 37 : 7 },
        contactFeet: feetAt(positions[server]), durationSeconds: 1.2, contactTime: .3, kind: 'serve', index: 0, family: 'serve', intent: 'deep-serve' };
      const plan = planMovementV1(args); assert.equal(plan.ok, true, JSON.stringify(plan));
      assert.deepEqual(plan.positions[partner], positions[partner]);
      assert.deepEqual(plan.positions[receiver], positions[receiver]); assert.deepEqual(plan.positions[receiverPartner], positions[receiverPartner]);
      assert.equal(plan.positions[server].y, positions[server].y);
      const route = actual(args, plan); validRoutes(route);
      for (const t of [0,.15,.3,.42]) assert.deepEqual(sampleActorBoardPositionV2(route, server, t), positions[server]);
      if (swap) assert.ok(Math.abs(plan.positions[server].x - positions[server].x) > .1);
      assert.equal(JSON.stringify(input), before);
      const replanned = replanMovementV1({ plan, segment: route, players: input.players, durationSeconds: 1.6 });
      assert.equal(replanned.ok, true); assert.deepEqual(replanned.positions[partner], positions[partner]);
      assert.equal(replanned.positions[server].y, positions[server].y);
    }
  }
});

test('full return stacks enter together after the designated return without advancing the serving pair early', () => {
  for (const server of ['player1','player3']) for (const court of ['left','right']) for (const hand of ['left','right']) {
    const receiver = server === 'player1' ? 'player3' : 'player1', input = setup({ server, receiver, court, hand });
    const positions = positionsOf(input.layout), partner = other(input.players, receiver), servingPartner = other(input.players, server);
    const args = { ...input, positions, hitter: receiver, contact: positions[receiver], contactFeet: feetAt(positions[receiver]),
      target: { x: 10, y: input.players[receiver].team === 'green' ? 39 : 5 }, durationSeconds: 1.7, index: 1,
      family: 'return', intent: 'deep-return', quality: 'neutral', pace: 'medium', kind: 'groundstroke' };
    const plan = planMovementV1(args); assert.equal(plan.ok, true);
    for (const id of [receiver, partner]) {
      assert.ok(Math.abs(plan.positions[id].x - positions[id].x) > .1, 'both players participate in the lateral switch');
      assert.equal(plan.diagnostics.goals[id].y, input.players[id].team === 'green' ? 14.25 : 29.75);
    }
    for (const id of [server, servingPartner]) assert.equal(plan.positions[id].y, positions[id].y, 'opening bounce still protects deep serving positions');
    validRoutes(actual(args, plan));
  }
});

test('preferred identities survive a poach, but unsafe direct crossovers are held rather than teleported', () => {
  const input = setup(), positions = { player1: { x: 5, y: 14.25 }, player2: { x: 15, y: 14.25 },
    player3: { x: 5, y: 29.75 }, player4: { x: 15, y: 29.75 } };
  const args = { ...input, positions, hitter: 'player3', contact: positions.player3, contactFeet: feetAt(positions.player3),
    target: { x: 10, y: 16 }, durationSeconds: 2, index: 8, family: 'dink', intent: 'middle-dink', kind: 'groundstroke', opening: 'midrally' };
  const plan = planMovementV1(args); assert.equal(plan.ok, true);
  assert.equal(plan.diagnostics.goals.player1.x, 15); assert.equal(plan.diagnostics.goals.player2.x, 5);
  assert.deepEqual(plan.positions.player1, positions.player1); assert.deepEqual(plan.positions.player2, positions.player2);
  assert.ok(plan.diagnostics.notes.some(item => item.code === 'sampled-pair-spacing-hold' && item.team === 'green'));
  validRoutes(actual(args, plan));
});

for (const server of ['player1','player3']) for (const court of ['left','right']) {
  test(`real stacked generation retains roles, settings and independently valid paths (${server}/${court})`, async () => {
    const input = setup({ server, receiver: server === 'player1' ? 'player3' : 'player1', court, hand: court === 'left' ? 'left' : 'right' });
    const before = JSON.stringify(input), result = await simulateRally(input);
    assert.ok(['complete','censored'].includes(result.status), JSON.stringify(result.diagnostics));
    assert.equal(result.document.shots[0].hitter, input.service.server);
    if (result.document.shots.length > 1) assert.equal(result.document.shots[1].hitter, input.service.receiver);
    assert.deepEqual(result.document.stacking, input.stacking); assert.deepEqual(result.document.generation.input.stacking, input.stacking);
    const compiled = compileDocument(result.document);
    assert.deepEqual(compiled.findings.filter(item => item.severity === 'error'), []);
    assert.equal(compiled.validShotCount, result.document.shots.length);
    const rules = validateRallyRules(compiled.play, compiled.timeline); assert.equal(rules.valid, true, JSON.stringify(rules.violations));
    validRoutes(compiled.timeline);
    assert.equal(JSON.stringify(input), before);
  });
}
