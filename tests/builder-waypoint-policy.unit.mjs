import assert from 'node:assert/strict';
import test from 'node:test';
import { getWaypointPolicy, WAYPOINT_DISCLOSURE } from '../builder-waypoint-policy.js';

const fixture = () => ({
  id: 'draft-policy',
  title: 'Policy fixture',
  shots: [
    { id: 'serve-1', hitter: 'player1', target: { x: 5, y: 38 }, movement: { intent: 'hold', pinned: false } },
    { id: 'return-2', hitter: 'player3', target: { x: 15, y: 6 }, movement: { intent: 'manual', pinned: false, target: { x: 12, y: 28 }, waypoints: [{ x: 9, y: 36 }, { x: 11, y: 32 }] } },
    { id: 'drop-3', hitter: 'player1', target: { x: 7, y: 27 }, movement: { intent: 'advance', pinned: false, waypoints: [{ x: 14, y: 8 }] } }
  ],
  assistance: { autoShading: false, showGuides: false, team: 'both' }
});

test('incomplete and path-free documents need no acknowledgement', () => {
  assert.deepEqual(getWaypointPolicy(), { key: null, requiresConfirmation: false, affected: [], message: '' });
  assert.deepEqual(getWaypointPolicy({ id: 'empty', shots: [{ id: 'partial', movement: {} }] }), {
    key: null, requiresConfirmation: false, affected: [], message: ''
  });
  assert.deepEqual(getWaypointPolicy({ id: 'empty-array', shots: [{ movement: { waypoints: [] } }] }), {
    key: null, requiresConfirmation: false, affected: [], message: ''
  });
});

test('reports every affected shot, player, and intermediate point count', () => {
  const policy = getWaypointPolicy(fixture());
  assert.match(policy.key, /^waypoints-v1-[0-9a-f]{16}$/);
  assert.equal(policy.requiresConfirmation, true);
  assert.deepEqual(policy.affected, [
    { shotId: 'return-2', number: 2, player: 'player3', pointCount: 2 },
    { shotId: 'drop-3', number: 3, player: 'player1', pointCount: 1 }
  ]);
  assert.match(policy.message, /Shot 2 · player3 · 2 intermediate points/);
  assert.match(policy.message, /Shot 3 · player1 · 1 intermediate point/);
  assert.ok(policy.message.includes(WAYPOINT_DISCLOSURE));
});

test('matching session acknowledgement clears confirmation without changing disclosure', () => {
  const pending = getWaypointPolicy(fixture());
  const acknowledged = getWaypointPolicy(fixture(), pending.key);
  assert.equal(acknowledged.key, pending.key);
  assert.equal(acknowledged.requiresConfirmation, false);
  assert.deepEqual(acknowledged.affected, pending.affected);
  assert.equal(acknowledged.message, pending.message);
});

test('does not mutate source data or expose mutable policy records', () => {
  const source = fixture();
  const before = structuredClone(source);
  const policy = getWaypointPolicy(source);
  assert.deepEqual(source, before);
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.affected), true);
  assert.equal(Object.isFrozen(policy.affected[0]), true);
});

test('key changes for document identity and exact affected path, targets, intent, hitter, or shot identity', () => {
  const baseline = getWaypointPolicy(fixture()).key;
  const mutations = [
    doc => { doc.id = 'another-draft'; },
    doc => { doc.shots[1].id = 'renamed-return'; },
    doc => { doc.shots[1].hitter = 'player4'; },
    doc => { doc.shots[1].target.x = 14; },
    doc => { doc.shots[1].movement.intent = 'recover'; },
    doc => { doc.shots[1].movement.target.y = 29; },
    doc => { doc.shots[1].movement.waypoints[0].x = 8; },
    doc => { doc.shots[1].movement.waypoints.reverse(); }
  ];
  for (const mutate of mutations) {
    const document = fixture();
    mutate(document);
    assert.notEqual(getWaypointPolicy(document).key, baseline);
  }
});

test('key ignores unrelated presentation and assistance settings and object key order', () => {
  const source = fixture();
  const baseline = getWaypointPolicy(source).key;
  source.title = 'A renamed play';
  source.assistance = { showGuides: true, team: 'green', autoShading: true };
  source.view = '3d';
  source.layout = { inspector: 'collapsed' };
  source.shots[1].movement.waypoints[0] = { y: 36, x: 9 };
  assert.equal(getWaypointPolicy(source).key, baseline);
});
