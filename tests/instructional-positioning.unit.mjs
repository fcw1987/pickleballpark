import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterDocument } from '../play-document.js';
import { compileEffectiveCandidate } from '../rally-proposals.js';
import { simulateRally } from '../rally-engine.js';
import { planMovementV1 } from '../rally-movement.js';
import { createRallyCoverageProvider } from '../rally-coverage-provider.js';
import { coverageSectors } from '../player-coverage.js';
import { sampleActorWorldPosition } from '../three-d-presentation.js';
import { worldToBoard, boardToWorld, samplePlayBall } from '../three-d-core.js';
import { readyAim } from '../emerald-motion.js';
import { assertFreshPhysicalResult } from './helpers/rally-procedural-proof.mjs';

const options = { lobRecovery: 'planted-v2', pairPositioning: 'ball-side-v1' };
const feetAt = (s, id, t, players) => worldToBoard(sampleActorWorldPosition(s, id, t, players[id].handedness, true));

test('the fresh starter moves both partners through the deep return and short third', () => {
  const document = createStarterDocument({ demonstrateTeamMovement: true });
  const { timeline, validShotCount } = compileEffectiveCandidate(document);
  assert.equal(validShotCount, 3);
  const [, returned, drop] = timeline.segments;
  const contacts = timeline.events.filter(e => e.type === 'contact');
  assert.deepEqual(contacts.map(e => e.actor), ['player1', 'player3', 'player1']);
  for (const leg of [1, 2]) {
    assert.ok(timeline.events.some(e => e.type === 'bounce' && e.rallyLeg === leg && e.time < contacts[leg].time));
  }
  const at = (s, id, end) => feetAt(s, id, end ? s.duration : 0, document.players);
  for (const id of ['player3', 'player4']) {
    assert.ok(at(returned, id, true).x > at(returned, id, false).x + .5, id);
    assert.ok(at(drop, id, true).x < at(drop, id, false).x - .5, id);
    assert.ok(at(drop, id, true).y >= 29.5 && at(drop, id, true).y <= 31, id);
  }
  for (const id of ['player1', 'player2']) {
    assert.ok(at(drop, id, true).x < at(drop, id, false).x - .5, id);
    assert.ok(at(drop, id, true).y > at(drop, id, false).y + 3, id);
  }
  assert.ok(Math.abs(at(drop, 'player1', true).y - at(drop, 'player2', true).y) <= 3);
  assert.ok(at(drop, 'player4', true).x - at(drop, 'player3', true).x >= 8);
});

test('seeded soft exchanges move both defenders toward the wide ball and back into complementary lanes', async () => {
  for (const [seed, leg, outside, middle, side] of [[13, 7, 'player3', 'player4', 1], [95, 6, 'player1', 'player2', -1]]) {
    const result = await simulateRally({ seed, options });
    const { compiled } = assertFreshPhysicalResult(result);
    const historical = await simulateRally({ seed, options: { lobRecovery: 'planted-v2' } });
    const older = compileEffectiveCandidate(historical.document).timeline.segments[leg - 1];
    const segment = compiled.timeline.segments[leg - 1];
    const gap = s => Math.abs(s.step.positions[outside].x - s.step.positions[middle].x);
    assert.ok(gap(older) > 9.5 && gap(segment) <= 9.01 && gap(segment) >= 7);
    for (const id of [outside, middle]) {
      const start = feetAt(segment, id, 0, result.document.players);
      const half = feetAt(segment, id, segment.duration / 2, result.document.players);
      const end = feetAt(segment, id, segment.duration, result.document.players);
      assert.ok(side * (half.x - start.x) > .15 && side * (end.x - half.x) > .15);
      assert.ok(Math.abs(end.y - (side === 1 ? 29.75 : 14.25)) < 1);
    }
    if (seed === 13) {
      const recovery = compiled.timeline.segments[leg];
      for (const id of [outside, middle]) assert.ok(recovery.step.positions[id].x < segment.step.positions[id].x - 2);
      assert.ok(gap(recovery) >= 8 && gap(recovery) <= 10);
    }
  }
});

test('a short attackable return limits the returner’s advance on either end', () => {
  for (const returning of ['orange', 'green']) {
    const near = returning === 'green', flip = y => near ? 44 - y : y;
    const [server, partner, receiver, front] = near
      ? ['player3', 'player4', 'player1', 'player2'] : ['player1', 'player2', 'player3', 'player4'];
    const players = createStarterDocument().players;
    const positions = { [server]: {x:5,y:flip(2)}, [partner]: {x:15,y:flip(2)},
      [receiver]: {x:5,y:flip(40)}, [front]: {x:15,y:flip(29.75)} };
    const plan = (y, quality, pairedCoverage) => planMovementV1({ players, positions, hitter:receiver, contact:positions[receiver],
      contactFeet:[{x:4.5,y:flip(40)}, {x:5.5,y:flip(40)}], service:{server,receiver,servingTeam:players[server].team},
      durationSeconds:2, index:1, family:'return', target:{x:10,y:flip(y)}, quality, pairedCoverage }).positions;
    const short = plan(12, 'attackable', true), controlled = plan(3, 'neutral', true);
    assert.ok(Math.abs(short[receiver].y - positions[receiver].y) <= 2.01);
    assert.ok(Math.abs(controlled[receiver].y - positions[receiver].y) > 6);
    assert.ok(Math.abs(plan(12, 'attackable', false)[receiver].y - positions[receiver].y) > 6);
    for (const id of [server, partner, front]) assert.equal(short[id].y, positions[id].y);
  }
});

test('a wide hitter’s identical lead-up gives the same ready cues until the outgoing flights separate', async () => {
  const { document } = await simulateRally({seed:13, options});
  function branch(family, target, pace, arc) {
    const d = structuredClone(document);
    d.ending = 'stop';
    delete d.outcome;
    const last = d.shots.at(-1);
    Object.assign(last, {family, target, pace, arc, quality:'neutral'});
    delete last.physics;
    const {play, timeline, validShotCount} = compileEffectiveCandidate(d);
    assert.equal(validShotCount, 8);
    const hit = timeline.segments.at(-1);
    const read = createRallyCoverageProvider(() => ({play, timeline, document:d}));
    return offset => {
      const t = hit.startTime + hit.contactTime + offset;
      const snapshot = read({timeSeconds:t}), defenders = snapshot.players.filter(p => p.team === 'green');
      const trail = [0, .07, .16].map(delay => samplePlayBall(timeline, t - delay));
      return { ball:snapshot.ball, roles:defenders.map(p => p.responsibility), feet:defenders.map(p => p.position),
        cones:coverageSectors(snapshot).filter(s => s.team === 'green').map(s => s.direction),
        aim:defenders.map(p => readyAim(trail, boardToWorld(p.position), 0, p.handedness === 'left' ? -1 : 1, 1)) };
    };
  }
  const line = branch('drive', {x:18,y:6}, 'firm', 'medium');
  const cross = branch('dink', {x:4,y:17}, 'soft', 'high');
  for (const t of [-.08, -.02, 0]) assert.deepEqual(line(t), cross(t));
  assert.deepEqual(line(.02).roles, cross(.02).roles);
  const a = line(.35), b = cross(.35);
  assert.ok(a.ball.x - b.ball.x > 4);
  assert.deepEqual(a.roles, ['support', 'primary']);
  assert.deepEqual(b.roles, ['primary', 'support']);
  assert.ok(a.cones[1].x > b.cones[1].x);
});
