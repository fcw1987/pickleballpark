import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateRally } from '../rally-engine.js';
import { normalizeRallyInputV1 } from '../rally-recipe.js';
import { planMovementV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';

const ids = ['player1', 'player2', 'player3', 'player4'];
const stacking = { version: 'stacking-v1', teams: { green: { mode: 'full', leftPlayer: 'player1' }, orange: { mode: 'full', leftPlayer: 'player3' } } };
const feet = point => [{ x: point.x - .42, y: point.y }, { x: point.x + .42, y: point.y }];

test('stacking does not repair an illegal declared service position or overlapping explicit partners', async () => {
  for (const server of ['player1', 'player3']) for (const court of ['left', 'right']) {
    const receiver = server === 'player1' ? 'player3' : 'player1', partner = server === 'player1' ? 'player2' : 'player4';
    for (const problem of ['wrong-serving-area', 'overlapping-partner']) {
      const input = structuredClone(normalizeRallyInputV1({ seed: 7, stacking, service: { server, receiver, court } }));
      if (problem === 'wrong-serving-area') { input.layout[server].x = 20 - input.layout[server].x; input.layout.ball.x = 20 - input.layout.ball.x; }
      else input.layout[partner] = { ...input.layout[server] };
      const before = JSON.stringify(input), result = await simulateRally(input);
      assert.equal(result.status, 'failed', `${server}/${court}/${problem}: ${JSON.stringify(result.diagnostics)}`);
      assert.equal(result.document, null); assert.equal(result.recipe.selection, null);
      assert.deepEqual(result.recipe.input.layout, input.layout); assert.equal(JSON.stringify(input), before);
    }
  }
});

test('a fast return gives a stacked pair honest partial progress rather than an instant kitchen arrival', () => {
  for (const server of ['player1', 'player3']) {
    const receiver = server === 'player1' ? 'player3' : 'player1';
    const input = normalizeRallyInputV1({ seed: 7, stacking, service: { server, receiver, court: 'right' } });
    const positions = Object.fromEntries(ids.map(id => [id, input.layout[id]]));
    const args = { ...input, positions, hitter: receiver, contact: positions[receiver], contactFeet: feet(positions[receiver]),
      target: { x: 10, y: server === 'player1' ? 4 : 40 }, durationSeconds: .2, index: 1, kind: 'groundstroke', family: 'return', intent: 'deep-return', pace: 'firm' };
    const plan = planMovementV1(args); assert.equal(plan.ok, true);
    assert.notEqual(plan.positions[receiver].y, plan.diagnostics.goals[receiver].y);
    assert.ok(Math.hypot(plan.positions[receiver].x - positions[receiver].x, plan.positions[receiver].y - positions[receiver].y) <= .72 + 1e-8);
    const segment = { modelVersion: 2, startTime: 0, endTime: .2, duration: .2, originalDuration: .2, contactTime: 0,
      previous: { positions }, step: { id: 'fast-return', positions: plan.positions }, shotSemantics: { playerId: receiver, contact: { feet: args.contactFeet } }, model2Momentum: [] };
    assert.equal(inspectGeneratedMovementV1(segment).valid, true); assert.equal(inspectGeneratedSpacingV1(segment).valid, true);
  }
});

test('stacked generation is deterministic and the legal designated returner cannot be replaced by a side preference', async () => {
  const input = { seed: 7, stacking }, first = await simulateRally(input), repeated = await simulateRally(input);
  assert.equal(first.status, 'complete'); assert.deepEqual(repeated.document, first.document); assert.deepEqual(repeated.outcome, first.outcome);
  assert.ok(first.document.shots.length >= 2);
  const invalid = structuredClone(first.document); invalid.ending = 'stop'; delete invalid.outcome;
  const returned = invalid.shots[1], original = returned.hitter;
  const partner = ids.find(id => id !== original && invalid.players[id].team === invalid.players[original].team);
  returned.hitter = partner; delete returned.playerMovement?.[partner];
  const before = JSON.stringify(invalid), compiled = compileDocument(invalid), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, 0); assert.equal(rules.valid, false);
  assert.ok(rules.violations.some(item => item.code === 'incorrect-receiver'), JSON.stringify(rules.violations));
  assert.equal(JSON.stringify(invalid), before);
});
