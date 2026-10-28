import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COVERAGE_MODEL, COVERAGE_PREFERENCE_KEY, coverageDirection, coverageSectors, coverageWeight, sharedCoverageAt, createCoveragePreference, isCoverageSnapshot } from '../player-coverage.js';
import { readCoverageSnapshot } from '../player-coverage-snapshot.js';

const player = (id, team, x, y, extra = {}) => ({ id, team, position: { x, y }, facing: { x: 0, y: y < 22 ? 1 : -1 }, handedness: 'right', ...extra });
const snapshot = () => ({ version: 1, timeSeconds: 2.5, phase: 'flight', ball: { x: 10, y: 22, heightFeet: 3 },
  players: [player('player1', 'green', 5, 14), player('player2', 'green', 15, 14), player('player3', 'orange', 5, 30), player('player4', 'orange', 15, 30)] });

test('116 degree pedagogical sectors are deterministic, finite and never mutate provider facts', () => {
  const input = snapshot(), before = structuredClone(input), sectors = coverageSectors(input);
  assert.equal(COVERAGE_MODEL.angleDegrees, 116);
  assert.deepEqual(coverageSectors(input), sectors); assert.deepEqual(input, before);
  sectors.forEach(s => { assert.equal(s.radius, 9); assert.ok(Math.abs(Math.hypot(s.direction.x, s.direction.y) - 1) < 1e-12); });
  const far = coverageWeight(sectors[0], { x: 5, y: 24 }); assert.equal(far, 0);
  assert.ok(coverageWeight(sectors[0], { x: 6, y: 18 }) > 0);
  assert.equal(coverageWeight(sectors[0], { x: 5, y: 12 }), 0);
  input.players[0].handedness = 'left';
  const left = coverageSectors(input)[0];
  assert.equal(left.handedness, 'left'); assert.deepEqual(left.direction, sectors[0].direction); assert.equal(left.radius, sectors[0].radius);
});

test('ball tracking is bounded by strategic facing and continuous behind a player', () => {
  const p = player('a', 'green', 10, 10);
  assert.ok(coverageDirection(p, { x: 20, y: 20 }).x > 0);
  assert.ok(coverageDirection(p, { x: 0, y: 20 }).x < 0);
  assert.deepEqual(coverageDirection(p, p.position), p.facing);
  for (let x = -30; x <= 50; x += 5) for (let y = -30; y <= 50; y += 5) assert.ok(coverageDirection(p, { x, y }).y > .9);
  const a = coverageDirection(p, { x: 9.999, y: 0 }), b = coverageDirection(p, { x: 10.001, y: 0 });
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < .001);
  assert.deepEqual(coverageDirection({ ...p, coverageFacing: { x: 1, y: 0 } }, { x: 0, y: 0 }), { x: 1, y: 0 });
});

test('shared coverage requires two same-team sectors; overlap is not a receiver assignment', () => {
  const s = coverageSectors(snapshot());
  assert.deepEqual(sharedCoverageAt(s, { x: 10, y: 19 }), ['green']);
  assert.deepEqual(sharedCoverageAt(s, { x: 10, y: 25 }), ['orange']);
  assert.deepEqual(sharedCoverageAt([s[0], { ...s[1], team: 'orange' }], { x: 10, y: 19 }), []);
  assert.deepEqual(sharedCoverageAt(s, { x: 40, y: 19 }), []);
  assert.equal(coverageWeight(s[0], { x: 10, y: 22.1 }), 0);
  assert.ok(s.every(p => p.legalReceiver === null && p.priority === null));
});

test('unknown provider versions, nonfinite coordinates and duplicate IDs fail closed', () => {
  for (const bad of [null, { ...snapshot(), version: 2 }, { ...snapshot(), ball: { x: NaN, y: 3 } }, { ...snapshot(), timeSeconds: NaN }, { ...snapshot(), players: [snapshot().players[0], snapshot().players[0]] }]) {
    assert.equal(isCoverageSnapshot(bad), false); assert.deepEqual(coverageSectors(bad), []);
  }
});

test('coverage preference defaults off, survives storage failure and writes no authoring keys', () => {
  const entries = new Map([['pickleboard-plays', 'untouched']]);
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
  const pref = createCoveragePreference(storage); assert.equal(pref.enabled, false);
  const changes = []; const unsubscribe = pref.subscribe(value => changes.push(value));
  assert.deepEqual(pref.set(true), { enabled: true, persisted: true }); assert.equal(createCoveragePreference(storage).enabled, true);
  pref.set(false); unsubscribe(); pref.set(true); assert.deepEqual(changes, [true, false]);
  assert.deepEqual([...entries.keys()], ['pickleboard-plays', COVERAGE_PREFERENCE_KEY]); assert.equal(entries.get('pickleboard-plays'), 'untouched');
  const denied = createCoveragePreference({ getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } });
  assert.equal(denied.enabled, false); assert.deepEqual(denied.set(true), { enabled: true, persisted: false });
});

test('snapshot adapter samples live physical world coordinates without guessing legal receivers', () => {
  const element = { style: {}, classList: { contains: () => false }, getAttribute: () => null };
  const board = { tokens: { player1: { id: 'player1', type: 'player', x: 1, y: 1, handedness: 'left', element }, ball: { x: 5, y: 6 } }, getPlayerTeamColor: () => 'green' };
  const samples = { player1: { worldPosition: { x: .3048, y: 0, z: -.6096 }, bodyFacing: { x: .6, z: .8 } } };
  const input = { board, timeSeconds: 4, samples, ball: { x: 0, y: .9144, z: 0, phase: 'bounce' } };
  const result = readCoverageSnapshot(input);
  assert.deepEqual(result.players[0].position, { x: 11, y: 20 }); assert.deepEqual(result.players[0].facing, { x: .6, y: .8 });
  assert.equal(result.players[0].legalReceiver, null); assert.equal(result.timeSeconds, 4); assert.equal(result.phase, 'bounce'); assert.ok(Math.abs(result.ball.heightFeet - 3) < 1e-12);
  assert.deepEqual({ x: board.tokens.player1.x, y: board.tokens.player1.y }, { x: 1, y: 1 });
  board.coverageSnapshotProvider = () => snapshot(); assert.deepEqual(readCoverageSnapshot(input), snapshot());
  board.coverageSnapshotProvider = () => ({ ...snapshot(), version: 99 }); assert.equal(readCoverageSnapshot(input), null);
  board.coverageSnapshotProvider = () => { throw Error('unavailable'); }; assert.equal(readCoverageSnapshot(input), null);
});
