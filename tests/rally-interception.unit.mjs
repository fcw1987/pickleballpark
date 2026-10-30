import test from 'node:test';
import assert from 'node:assert/strict';
import { solveFlightV2, interceptFlightV2 } from '../play-physics-v2.js';
import { validateDocument } from '../play-document.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

for (const mirrored of [false, true]) test(`explicit ordinary volley time samples a kitchen air contact with legal grounded feet (${mirrored ? 'orange' : 'green'})`, () => {
  const y = value => mirrored ? 44 - value : value;
  const flight = solveFlightV2({ from: { x: 6, y: y(30), heightFeet: 2.2 }, target: { x: 6, y: y(16.5) }, family: 'reset', physics: { apexFeet: 5 } });
  const depth = y(17), time = (depth - flight.from.y) / flight.stages[0].vz;
  // Choose a live point just before the short landing, inside the kitchen.
  const beforeBounceSeconds = .06;
  const contact = interceptFlightV2(flight, { kind: 'volley', stance: { x: 6, y: y(14.5) }, beforeBounceSeconds });
  assert.equal(contact.bounces, 0);
  assert.ok(contact.point.y > 15 && contact.point.y < 29);
  assert.equal(contact.time, flight.firstLandingTime - beforeBounceSeconds);
  assert.deepEqual(contact.point, { x: flight.sampleBoard(contact.time).x, y: flight.sampleBoard(contact.time).y, heightFeet: flight.sampleBoard(contact.time).heightFeet });
  assert.ok(Math.hypot(contact.point.x - 6, contact.point.y - y(14.5)) <= 3);
  assert.notEqual(contact.time, time, 'time is an explicit trajectory observation, not a forced kitchen plane');
});

test('explicit pre-bounce timing rejects bounced, ambiguous, out-of-flight and unbounded contacts', () => {
  const flight = solveFlightV2({ from: { x: 6, y: 30, heightFeet: 2.2 }, target: { x: 6, y: 17.5 }, family: 'reset' });
  const base = { kind: 'volley', stance: { x: 6, y: 14.5 }, beforeBounceSeconds: .06 };
  for (const change of [{ kind: 'groundstroke' }, { contactOverride: { x: 6, y: 17 } }, { afterBounceSeconds: .2 }, { beforeBounceSeconds: 0 }, { beforeBounceSeconds: 5.01 }, { beforeBounceSeconds: NaN }, { beforeBounceSeconds: flight.firstLandingTime + .1 }]) {
    assert.throws(() => interceptFlightV2(flight, { ...base, ...change }));
  }
});

test('saved explicit pre-bounce timing is model2-only, bounded and exclusive of bounced timing', () => {
  const source = model2Document({ shots: [model2Shot(), model2Shot({ id: 'reply', hitter: 'player3', family: 'volley', contactMode: 'volley', contactTiming: { beforeBounceSeconds: .06 } })] });
  assert.equal(validateDocument(source), source);
  for (const patch of [{ beforeBounceSeconds: 0 }, { beforeBounceSeconds: 5.01 }, { beforeBounceSeconds: .1, afterBounceSeconds: .2 }, {}]) {
    const invalid = structuredClone(source); invalid.shots[1].contactTiming = patch;
    assert.throws(() => validateDocument(invalid), /contactTiming/);
  }
  const bounced = structuredClone(source); bounced.shots[1].contactMode = 'bounced';
  assert.throws(() => validateDocument(bounced), /contactTiming/);
  const noIncoming = structuredClone(source); noIncoming.shots.shift();
  assert.throws(() => validateDocument(noIncoming), /incoming leg/);
});

test('a feasible fifth air contact is sampled between actor planes rather than forced to bounce', async () => {
  const { simulateRally } = await import('../rally-engine.js');
  const players = Object.fromEntries(['player1','player2','player3','player4'].map((id,index)=>[id,{team:index<2?'green':'orange',handedness:'right',style:'pro',flavour:'balanced'}]));
  const result = await simulateRally({ seed: 2, players, options: { maxShots: 5 }, service: { server: 'player3', receiver: 'player1', court: 'right', courtConvention: 'server-perspective-v1' } });
  assert.equal(result.status, 'censored');
  assert.equal(result.decisions[2].chosen.family, 'drive');
  assert.equal(result.decisions[4].situation.contactKind, 'volley');
  assert.ok(result.document.shots[4].contactTiming.beforeBounceSeconds > 0);
  assert.equal(result.decisions[4].situation.contactSelection.strategy, 'feasibility-then-fixed-opportunity-actors-then-opportunities');
});

test('leaving a real out flight adds a defensive decision without inventing an opponent contact', async () => {
  const { simulateRally } = await import('../rally-engine.js');
  const result = await simulateRally({ seed: 1 });
  assert.equal(result.status, 'complete');
  assert.ok(['long','wide'].includes(result.outcome.reason));
  const last = result.decisions.find(decision=>decision.shotId===result.outcome.shotId);
  const defence = last.resolution.defensiveDecision;
  assert.equal(defence.action, 'let-go'); assert.equal(defence.addsContact, false);
  assert.equal(result.document.shots.length, result.decisions.length);
  assert.equal(defence.incomingShotId, result.outcome.shotId);
  assert.ok(defence.eligibleActors.length > 0);
  for (const axis of ['x','y','heightFeet']) assert.ok(Math.abs(defence.information.predictedLanding[axis]-result.outcome.evidence.position[axis])<1e-6);
});
