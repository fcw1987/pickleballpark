import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterDocument, documentFromTemplate } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { compilePlayTimeline } from '../three-d-core.js';
import { validateRallyRules } from '../rally-rules.js';
import { assessReach, createTacticalSnapshot, REACH_MODEL, tacticalRecovery } from '../rally-tactics.js';

const clone = value => structuredClone(value);
const separation = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const starter = () => {
  const document = createStarterDocument();
  return { document, ...compileDocument(document) };
};
const snapshot = (compiled, elapsed, extra = {}) => createTacticalSnapshot({
  play: compiled.play, timeline: compiled.timeline, elapsed, ...extra
});
function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  Object.values(value).forEach(assertDeepFrozen);
}

test('serve preparation assesses the current striker and current contact before launch', () => {
  const compiled = starter();
  const first = compiled.timeline.segments.find(segment => segment.shotSemantics);
  assert.ok(first.contactTime > 0);
  const result = snapshot(compiled, first.startTime);
  assert.equal(result.phase, 'serve');
  assert.deepEqual(result.eligibleHitters, ['player1']);
  assert.equal(result.players.player1.responsibility, 'primary');
  assert.equal(result.players.player1.reach.reachable, true,
    'the server is beside the serve contact, not being asked to reach the next return contact');
  assert.ok(Math.abs(result.players.player1.reach.distanceFeet -
    separation(compiled.document.initialLayout.player1, first.shotSemantics.contact.point)) < 1e-9);
  assert.ok(Math.abs(result.players.player1.reach.availableSeconds - first.contactTime) < 1e-9,
    'preparation ends at this contact, before the outgoing flight');
});

test('a midrally preparation keeps both teammates eligible and assigns the authored striker primary responsibility', () => {
  const document = documentFromTemplate(PICKLEBOARD_PLAYS.find(play => play.id === 'dink-exchange'));
  const compiled = compileDocument(document);
  const first = compiled.timeline.segments.find(segment => segment.shotSemantics);
  const currentHitter = first.shotSemantics.playerId;
  const result = snapshot(compiled, first.startTime, { players: document.players });
  assert.equal(result.phase, 'open-rally');
  const eligibleTeam = document.players[currentHitter].team;
  const expectedEligible = Object.keys(document.players).filter(id => document.players[id].team === eligibleTeam);
  assert.deepEqual(result.eligibleHitters, expectedEligible);
  assert.equal(result.authoredReceiver, currentHitter);
  assert.equal(result.players[currentHitter].responsibility, 'primary');
  assert.equal(result.mustBounceBeforeContact, false);
  for (const [id, actor] of Object.entries(result.players)) {
    assert.equal(actor.eligible, document.players[id].team === eligibleTeam);
    if (id !== currentHitter) assert.notEqual(actor.responsibility, 'primary');
  }
});

test('outgoing serve retains its designated returner despite a nearer partner and changes bounce state once', () => {
  const compiled = starter();
  const first = compiled.timeline.segments.find(segment => segment.rallyLeg === 1);
  const bounce = compiled.timeline.events.find(event => event.type === 'bounce' && event.rallyLeg === 1);
  const positions = clone(compiled.document.initialLayout);
  positions.player4 = { x: first.nextShotSemantics.contact.point.x, y: first.nextShotSemantics.contact.point.y };
  positions.player3 = { x: 19, y: 43 };
  const before = snapshot(compiled, first.startTime + first.contactTime + 1e-5, { positions });
  const after = snapshot(compiled, bounce.time + 1e-5, { positions });
  for (const result of [before, after]) {
    assert.equal(result.phase, 'return');
    assert.equal(result.designatedReceiver, 'player3');
    assert.equal(result.legalReceiver, 'player3');
    assert.deepEqual(result.eligibleHitters, ['player3']);
    assert.equal(result.players.player3.responsibility, 'designated-returner');
    assert.equal(result.players.player4.eligible, false);
  }
  assert.equal(before.mustBounceBeforeContact, true);
  assert.equal(after.mustBounceBeforeContact, false);
});

test('return flight permits either serving partner but requires the second opening bounce', () => {
  const document = createStarterDocument();
  document.shots[1].receiver = 'auto';
  const compiled = compileDocument(document);
  const returned = compiled.timeline.segments.find(segment => segment.rallyLeg === 2);
  const bounce = compiled.timeline.events.find(event => event.type === 'bounce' && event.rallyLeg === 2);
  const before = snapshot(compiled, returned.startTime + returned.contactTime + 1e-5);
  const after = snapshot(compiled, bounce.time + 1e-5);
  for (const result of [before, after]) {
    assert.equal(result.phase, 'third-shot');
    assert.deepEqual([...result.eligibleHitters].sort(), ['player1', 'player2']);
    assert.equal(result.legalReceiver, null);
  }
  assert.equal(before.mustBounceBeforeContact, true);
  assert.equal(after.mustBounceBeforeContact, false);
});

test('terminal snapshots have no eligible hitter or outstanding opening bounce', () => {
  const compiled = starter();
  const atEnd = snapshot(compiled, compiled.timeline.duration);
  const later = snapshot(compiled, compiled.timeline.duration + 100);
  assert.deepEqual(later, atEnd);
  assert.equal(atEnd.phase, 'complete');
  assert.deepEqual(atEnd.eligibleHitters, []);
  assert.equal(atEnd.legalReceiver, null);
  assert.equal(atEnd.mustBounceBeforeContact, false);
  for (const actor of Object.values(atEnd.players)) {
    assert.equal(actor.eligible, false);
    assert.equal(actor.responsibility, 'complete');
  }
});

test('snapshots are deterministic, deeply frozen and do not mutate source or sampled position overrides', () => {
  const compiled = starter();
  const positions = clone(compiled.document.initialLayout);
  positions.player2 = { x: 8, y: 12 };
  const players = clone(compiled.document.players);
  const before = JSON.stringify({ play: compiled.play, timeline: compiled.timeline, positions, players });
  const first = snapshot(compiled, .7, { positions, players });
  snapshot(compiled, compiled.timeline.duration * .8, { positions, players });
  const repeated = snapshot(compiled, .7, { positions, players });
  assert.deepEqual(repeated, first);
  assertDeepFrozen(first);
  assert.deepEqual(first.players.player2.position, positions.player2);
  assert.notEqual(first.players.player2.position, positions.player2);
  for (const actor of Object.values(first.players)) {
    assert.ok(Math.abs(Math.hypot(actor.facing.x, actor.facing.y) - 1) < 1e-9);
    assert.deepEqual(actor.trackingTarget, { x: first.ball.x, y: first.ball.y, heightFeet: first.ball.heightFeet });
  }
  assert.equal(JSON.stringify({ play: compiled.play, timeline: compiled.timeline, positions, players }), before);
  assert.equal(Object.isFrozen(positions.player2), false, 'producing a frozen snapshot must not freeze caller data');
  assert.equal(Object.isFrozen(players.player2), false);
});

test('illustrative reach responds to available time without changing its contact distance', () => {
  const position = { x: 3, y: 14 }, contact = { x: 15, y: 14 };
  const rushed = assessReach(position, contact, .15);
  const prepared = assessReach(position, contact, 1);
  assert.equal(rushed.distanceFeet, 12);
  assert.equal(prepared.distanceFeet, rushed.distanceFeet);
  assert.equal(rushed.reachable, false);
  assert.equal(prepared.reachable, true);
  assert.ok(prepared.radiusFeet > rushed.radiusFeet);
  assert.equal(assessReach(position, contact, -1).availableSeconds, 0);
  assert.match(prepared.model, /illustrative/);
});

function poachFixture() {
  const players = createStarterDocument().players;
  const positions = {
    player1: { x: 11, y: 14 }, player2: { x: 5, y: 14 },
    player3: { x: 5, y: 30 }, player4: { x: 15, y: 30 }
  };
  const homePositions = { ...clone(positions), player1: { x: 5, y: 0 }, player2: { x: 15, y: 0 } };
  const options = { players, hitter: 'player1', family: 'dink', target: { x: 10, y: 27 }, seconds: 1, index: 4, homePositions };
  return { positions, options };
}

test('poach recovery allocates separate partner lanes without a crossing or overlap', () => {
  const { positions, options } = poachFixture();
  const before = clone(positions);
  const recovered = tacticalRecovery(positions, options);
  assert.deepEqual(tacticalRecovery(positions, options), recovered);
  assert.deepEqual(positions, before);
  assert.ok(recovered.player1.x > recovered.player2.x,
    'the pair should preserve the safe post-poach order during this recovery window');
  for (let index = 0; index <= 10; index++) {
    const progress = index / 10;
    const at = id => ({
      x: positions[id].x + (recovered[id].x - positions[id].x) * progress,
      y: positions[id].y + (recovered[id].y - positions[id].y) * progress
    });
    assert.ok(separation(at('player1'), at('player2')) >= 2.5,
      `partners overlap during recovery at progress ${progress}`);
  }
  for (const id of Object.keys(positions)) {
    assert.ok(separation(positions[id], recovered[id]) <= options.seconds * REACH_MODEL.recoverySpeedFeetPerSecond + 1e-9);
  }
});

test('recovery preserves a protected partner and leaves the other player a separate lane', () => {
  for (const protectedPlayer of ['player1', 'player2']) {
    const { positions, options } = poachFixture();
    const protectedIds = new Set([protectedPlayer]);
    const result = tacticalRecovery(positions, { ...options, protectedIds });
    assert.deepEqual(result[protectedPlayer], positions[protectedPlayer]);
    assert.ok(separation(result.player1, result.player2) >= 2.5);
    assert.ok(result.player1.x > result.player2.x, 'a protected partner cannot be crossed by automatic recovery');
    assert.deepEqual([...protectedIds], [protectedPlayer]);
  }
});

test('recovery does not move into a protected partner occupying its usual lane', () => {
  const { positions, options } = poachFixture();
  positions.player1 = { x: 3, y: 14 };
  positions.player2 = { x: 7.5, y: 14 };
  const result = tacticalRecovery(positions, { ...options, protectedIds: new Set(['player2']) });
  assert.deepEqual(result.player2, positions.player2);
  assert.ok(separation(result.player1, result.player2) >= 2.5,
    'preserving the pin also requires keeping automatic recovery out of the pinned partner');
  assert.ok(result.player1.x < result.player2.x,
    'a blocked recovery lane must not be fixed by crossing through the pinned partner');
});

test('a grounded kitchen contact remains legal even when illustrative reach says it is too far away', () => {
  const players = createStarterDocument().players;
  const positions = {
    player1: { x: 5, y: 17 }, player2: { x: 15, y: 14 },
    player3: { x: 5, y: 30 }, player4: { x: 15, y: 30 }, ball: { x: 5, y: 17 }
  };
  const play = { id: 'grounded-kitchen-tactics', mode: 'doubles', players, rally: { openingBouncesSatisfied: true }, steps: [
    { id: 'setup', positions: clone(positions) },
    { id: 'kitchen-groundstroke', positions: { ...clone(positions), ball: { x: 5, y: 26 } }, shot: {
      from: { x: 5, y: 17 }, to: { x: 5, y: 26 }, type: 'dink', stroke: 'dink', playerId: 'player1',
      contact: { kind: 'groundstroke', heightFeet: .8, strokeSide: 'forehand', feet: [{ x: 4.6, y: 17 }, { x: 5.4, y: 17 }] },
      flight: { bounces: 1, apexFeet: 6 }
    } }
  ] };
  const timeline = compilePlayTimeline(play);
  const override = { ...clone(positions), player1: { x: -4, y: 0 } };
  const result = createTacticalSnapshot({ play, timeline, elapsed: 0, positions: override });
  assert.equal(validateRallyRules(play, timeline).valid, true);
  assert.deepEqual(result.eligibleHitters, ['player1', 'player2']);
  assert.equal(result.players.player1.eligible, true);
  assert.equal(result.players.player1.reach.reachable, false);
  assert.match(result.players.player1.reach.model, /illustrative/);
});
