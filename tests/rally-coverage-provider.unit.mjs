import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterDocument, documentFromTemplate } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { createRallyCoverageProvider } from '../rally-coverage-provider.js';
import { createTacticalSnapshot } from '../rally-tactics.js';
import { samplePlayBall, boardToWorld } from '../three-d-core.js';

const fixture = () => {
  const document = createStarterDocument();
  return { document, ...compileDocument(document) };
};
const prepare = state => state.timeline.segments[0].contactTime + .01;

test('coverage provider converts rendered metre axes and carries authoritative phase, roles and ball facing', () => {
  const state = fixture();
  state.document.players.player3.handedness = 'left';
  const timeSeconds = prepare(state);
  const samples = {
    player3: { worldPosition: { x: -1.524, y: .6, z: 4.572 }, bodyFacing: { x: 1, z: 0 }, handedness: 'right' }
  };
  const before = JSON.stringify({ state, samples });
  const context = { timeSeconds, samples, ball: samplePlayBall(state.timeline, timeSeconds) };
  const result = createRallyCoverageProvider(() => state)(context);
  const expected = createTacticalSnapshot({ ...state, elapsed: timeSeconds, positions: {
    ...state.document.initialLayout, player3: { x: 5, y: 37 }
  } });
  const receiver = result.players.find(player => player.id === 'player3');
  assert.equal(result.version, 1);
  assert.equal(result.phase, expected.phase);
  assert.equal(result.timeSeconds, expected.time);
  assert.equal(result.legalReceiverId, 'player3');
  assert.deepEqual(result.eligibleHitters, ['player3']);
  assert.deepEqual(receiver.position, { x: 5, y: 37 });
  assert.deepEqual(receiver.facing, expected.players.player3.facing);
  assert.deepEqual(receiver.coverageFacing, receiver.facing, 'the overlay must bypass its independent facing blend');
  assert.equal(receiver.handedness, 'left', 'source handedness wins over a stale presentation field');
  assert.equal(receiver.legalReceiver, true);
  assert.equal(result.players.find(player => player.id === 'player4').legalReceiver, false);
  assert.deepEqual(result.ball, expected.ball);
  assert.equal(result.coveragePriorities[0].id, 'player3');
  assert.equal(Object.hasOwn(receiver, 'radiusFeet'), false, 'the adapter never turns reach estimates into a cone radius');
  assert.equal(JSON.stringify({ state, samples }), before);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(receiver.position));
});

test('coverage seeks share opening bounce facts and permit either partner after the return', () => {
  const state = fixture(), provider = createRallyCoverageProvider(() => state);
  const bounce = state.timeline.events.find(event => event.type === 'bounce' && event.rallyLeg === 1);
  const before = provider({ timeSeconds: bounce.time - .01 });
  const after = provider({ timeSeconds: bounce.time + .01 });
  assert.equal(before.mustBounceBeforeContact, true);
  assert.equal(after.mustBounceBeforeContact, false);
  assert.deepEqual(provider({ timeSeconds: bounce.time - .01 }), before);
  const returned = state.timeline.segments.find(segment => segment.rallyLeg === 2);
  const third = provider({ timeSeconds: returned.startTime + .01 });
  assert.equal(third.phase, 'third-shot');
  assert.equal(third.legalReceiverId, null);
  assert.deepEqual(third.eligibleHitters, ['player1', 'player2']);
  for (const player of third.players) assert.equal(player.legalReceiver, null);
});

test('the provider reads fresh source references and preserves source pins and rendered actor positions', () => {
  let state = fixture();
  const provider = createRallyCoverageProvider(() => state), timeSeconds = prepare(state);
  const first = provider({ timeSeconds });
  const document = createStarterDocument();
  document.id = 'replacement-document'; document.players.player3.handedness = 'left';
  state = { document, ...compileDocument(document), positions: { player2: { x: 12, y: 8 } } };
  const pinned = JSON.stringify(state.document);
  const result = provider({ timeSeconds, samples: { player1: { worldPosition: boardToWorld({ x: 16, y: -1 }) } } });
  assert.equal(first.players.find(player => player.id === 'player3').handedness, 'right');
  assert.equal(result.players.find(player => player.id === 'player3').handedness, 'left');
  assert.deepEqual(result.players.find(player => player.id === 'player1').position, { x: 16, y: -1 });
  assert.deepEqual(result.players.find(player => player.id === 'player2').position, { x: 12, y: 8 });
  assert.equal(JSON.stringify(state.document), pinned);
});

test('legacy source context survives the coverage bridge and trailing recovery is complete', () => {
  const document = documentFromTemplate(PICKLEBOARD_PLAYS.find(play => play.id === 'third-shot-drop'));
  const state = { document, ...compileDocument(document) }, provider = createRallyCoverageProvider(() => state);
  assert.equal(provider({ timeSeconds: prepare(state) }).legalReceiverId, 'player3');
  const recovery = state.timeline.segments.find(segment => segment.step.id === 'drop-transition');
  const result = provider({ timeSeconds: recovery.startTime + recovery.duration / 2 });
  assert.equal(result.phase, 'complete');
  assert.equal(result.authoredReceiverId, null);
  assert.equal(result.legalReceiverId, null);
  assert.deepEqual(result.eligibleHitters, []);
});

test('unavailable, stale or non-finite coverage inputs hide a sample without rewriting state', () => {
  const state = fixture(), provider = createRallyCoverageProvider(() => state), timeSeconds = prepare(state);
  assert.equal(createRallyCoverageProvider(() => null)({ timeSeconds }), null);
  assert.equal(createRallyCoverageProvider(() => { throw Error('state unavailable'); })({ timeSeconds }), null);
  assert.equal(provider({ timeSeconds: NaN }), null);
  assert.equal(provider({ timeSeconds, samples: { player1: { worldPosition: { x: Infinity, z: 0 } } } }), null);
  assert.equal(provider({ timeSeconds, ball: boardToWorld({ x: 20, y: 44 }, 20) }), null);
  assert.equal(createRallyCoverageProvider(() => ({ ...state, play: { ...state.play } }))({ timeSeconds }), null);
  assert.equal(createRallyCoverageProvider(() => ({ ...state, document: { ...state.document, id: 'wrong-source' } }))({ timeSeconds }), null);
  assert.notEqual(provider({ timeSeconds }), null);
});
