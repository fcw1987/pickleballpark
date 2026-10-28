import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterDocument, validateDocument } from '../play-document.js';
import { compileDocument, automaticActorPeakSpeed, automaticActorPairSpacing } from '../play-compiler.js';
import { compilePlayTimeline } from '../three-d-core.js';
import { validateRallyRules } from '../rally-rules.js';
import { resolveServiceContext, eligibleHitters, updateServiceFromShotEdit } from '../rally-state.js';
import { proposeRandomRally, proposeSmartAdd } from '../smart-rally-generator.js';
import { compileEffectiveCandidate, evaluateCandidate } from '../rally-proposals.js';
import { DraftStore, EditHistory } from '../builder-storage.js';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';

const clone = value => structuredClone(value);

test('seven-hit seed 2 regression: designated receiver returns the serve in every shared engine path', async () => {
  // Before this change seed 2 selected player4 for the serve to (5,33).
  // player4 is the near-net partner; player3 is the declared returner.
  const proposal = await proposeRandomRally({ length: 7, seed: 2 });
  assert.equal(proposal.ok, true, proposal.reason);
  const source = proposal.document;
  assert.equal(source.service.receiver, 'player3');
  assert.equal(source.shots[0].receiver, 'player3');
  assert.equal(source.shots[1].hitter, 'player3');
  const store = new DraftStore({ storage: { getItem: () => null, setItem: () => {} }, validate: validateDocument });
  const imported = store.importJSON(JSON.stringify(source));
  assert.deepEqual(imported, source);
  for (const autoShading of [false, true]) {
    imported.assistance = { autoShading, showGuides: true, team: 'both' };
    const before = clone(imported), compiled = compileEffectiveCandidate(imported);
    assert.equal(compiled.validShotCount, 7);
    assert.deepEqual(compiled.timeline.events.filter(e => e.type === 'contact').map(e => e.actor), source.shots.map(s => s.hitter));
    assert.equal(validateRallyRules(compiled.play, compiled.timeline).valid, true);
    assert.deepEqual(imported, before);
  }
  const extended = await proposeSmartAdd(source, { seed: 11 });
  assert.equal(extended.ok, true, extended.reason);
  assert.deepEqual(extended.document.shots.slice(0, 7), source.shots);
  assert.equal(extended.document.shots[1].hitter, 'player3');
  assert.deepEqual((await proposeRandomRally({ length: 7, seed: 2 })).document, source);
});

test('bounded seeded corpus preserves roles, opening bounces, contact reach and doubles spacing', async () => {
  for (const seed of [0, 1, 5, 17, 42, 0xffffffff]) {
    const result = await proposeRandomRally({ length: 7, seed });
    assert.ok(result.ok, `${seed}: ${result.reason}`);
    const doc = result.document, { play, timeline } = compileDocument(doc);
    assert.equal(doc.shots[0].hitter, doc.service.server);
    assert.equal(doc.shots[1].hitter, doc.service.receiver);
    for (const leg of [1, 2]) assert.equal(timeline.events.filter(e => e.type === 'bounce' && e.rallyLeg === leg).length, 1);
    assert.ok(validateRallyRules(play, timeline).valid);
    for (const segment of timeline.segments) {
      for (const id of Object.keys(doc.players)) assert.ok(automaticActorPeakSpeed(segment, id, doc.players[id].handedness) <= 18 + 1e-8, `${seed}/${id}: contact/recovery route`);
      for (const pair of [['player1', 'player2'], ['player3', 'player4']]) assert.ok(automaticActorPairSpacing(segment, pair, doc.players) >= 2.5 - 1e-8, `${seed}: pair route`);
    }
  }
});

test('a closer stacked partner cannot replace the designated returner in authored or imported plays', () => {
  const document = createStarterDocument();
  document.initialLayout.player4 = { x: 5, y: 39 };
  document.initialLayout.player3 = { x: 12, y: 41 };
  document.shots[0].receiver = 'auto';
  document.shots[1].hitter = 'player4';
  const before = clone(document), compiled = compileDocument(document);
  assert.equal(compiled.validShotCount, 1);
  assert.match(compiled.findings[0].message, /designated receiver is player3/);
  assert.deepEqual(document, before);
  const raw = clone(compileDocument(createStarterDocument()).play);
  raw.steps[2].shot.playerId = 'player4';
  assert.ok(validateRallyRules(raw).violations.some(v => v.code === 'incorrect-receiver'));
});

test('designated receiver may cross the centerline and either serving partner may hit the third', () => {
  const document = createStarterDocument();
  document.initialLayout.player3.x = 12;
  document.shots[1].target = { x: 5, y: 6 };
  document.shots[1].receiver = 'player2';
  document.shots[2].hitter = 'player2';
  const result = evaluateCandidate(document);
  assert.ok(result.ok, result.reason);
  assert.equal(result.compiled.play.steps[1].positions.player3.x, 5);
  assert.equal(result.compiled.timeline.events.filter(e => e.type === 'contact')[2].actor, 'player2');
});

test('legacy identity uses declared recipe roles; unknown service order stays unknown without rewriting', async () => {
  const document = createStarterDocument(); delete document.service;
  assert.equal(resolveServiceContext(document).receiver, 'player3');
  document.shots[0].receiver = 'auto';
  const before = clone(document), compiled = compileDocument(document);
  assert.equal(resolveServiceContext(document).known, false);
  assert.equal(compiled.validShotCount, document.shots.length);
  assert.ok(compiled.findings.some(f => f.kind === 'context' && /unknown/.test(f.message)));
  assert.deepEqual(document, before);
  document.shots = document.shots.slice(0, 1);
  const result = await proposeSmartAdd(document);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Declare the server and designated receiver/);
});

test('explicit role edits are undoable and do not rewrite a downstream hitter', () => {
  const before = createStarterDocument(), history = new EditHistory(before), changed = clone(before);
  const serve = changed.shots[0]; serve.receiver = 'player4';
  updateServiceFromShotEdit(changed, serve, 'receiver');
  assert.equal(changed.service.receiver, 'player4');
  assert.equal(changed.shots[1].hitter, 'player3');
  history.commit(changed);
  assert.deepEqual(history.undo(), before);
  assert.deepEqual(history.redo(), changed);
  assert.equal(evaluateCandidate(changed).ok, false);
});

test('receiver restrictions end after the serve and never use handedness or nearest position as law', () => {
  const doc = createStarterDocument(), service = resolveServiceContext(doc);
  assert.deepEqual(eligibleHitters({ players: doc.players, service, contactIndex: 1, previousHitter: 'player1' }), ['player3']);
  assert.deepEqual(eligibleHitters({ players: doc.players, service, contactIndex: 2, previousHitter: 'player3' }), ['player1', 'player2']);
  assert.deepEqual(eligibleHitters({ players: doc.players, service, contactIndex: 2, previousHitter: 'player3', intendedReceiver: 'player1' }), ['player1', 'player2'], 'authored responsibility is not a post-serve legal restriction');
  assert.deepEqual(eligibleHitters({ players: doc.players, service, contactIndex: 3, previousHitter: 'player1' }), ['player3', 'player4']);
});

test('serve court follows declared serving area even when paddle contact crosses its extension', () => {
  const doc = createStarterDocument();
  doc.initialLayout.player1 = { x: 10.6, y: -1 };
  doc.initialLayout.ball = { x: 9.8, y: 0 };
  const compiled = compileDocument(doc);
  assert.ok(validateRallyRules(compiled.play, compiled.timeline).valid);
  assert.ok(compiled.play.steps[1].shot.contact.feet.every(p => p.x > 10));
  const raw = clone(compileDocument(createStarterDocument()).play);
  const serve = raw.steps[1].shot;
  serve.from.x = 9.8;
  serve.contact.feet = [{ x: 10.5, y: -.7 }, { x: 11.3, y: -.7 }];
  const result = validateRallyRules(raw);
  assert.equal(result.violations.some(v => ['serve-target', 'serve-foot-position'].includes(v.code)), false);
  serve.contact.feet[0].y = 0;
  assert.ok(validateRallyRules(raw).violations.some(v => v.code === 'serve-foot-position'));
});

test('serve service lines are in except the NVZ line; preparation bounce is separate', () => {
  for (const target of [{ x: 0, y: 38 }, { x: 10, y: 38 }, { x: 5, y: 44 }, { x: 5, y: 29 }]) {
    const raw = clone(compileDocument(createStarterDocument()).play);
    raw.steps = raw.steps.slice(0, 2); raw.steps[1].shot.to = target;
    const invalid = validateRallyRules(raw).violations.some(v => v.code === 'serve-target');
    assert.equal(invalid, target.y === 29, JSON.stringify(target));
  }
  const doc = createStarterDocument(); doc.shots[0].serveMethod = 'drop';
  const { play, timeline } = compileDocument(doc);
  assert.equal(timeline.events.filter(e => e.type === 'preparation-bounce').length, 1);
  assert.equal(timeline.events.filter(e => e.type === 'bounce' && e.rallyLeg === 1).length, 1);
  assert.ok(validateRallyRules(play, timeline).valid);
});

test('NVZ airspace is legal, but explicit missing foot reestablishment and momentum are faults', () => {
  const raw = clone(PICKLEBOARD_PLAYS.find(play => play.id === 'volley-block'));
  const volley = raw.steps.find(step => step.shot?.contact.kind === 'volley').shot;
  assert.ok(validateRallyRules(raw).valid);
  volley.contact.feetEstablishedOutsideNVZ = false;
  assert.ok(validateRallyRules(raw).violations.some(v => v.code === 'non-volley-zone-reset'));
  volley.contact.feetEstablishedOutsideNVZ = true;
  volley.contact.momentumEntersNonVolleyZone = true;
  assert.ok(validateRallyRules(raw).violations.some(v => v.code === 'non-volley-zone-momentum'));
  volley.contact.momentumEntersNonVolleyZone = false;
  assert.ok(validateRallyRules(raw).valid);
});

test('raw replay team/late-serve semantics use the same validation boundary', () => {
  const raw = clone(compileDocument(createStarterDocument()).play);
  raw.steps[2].shot.playerId = 'player2';
  assert.ok(validateRallyRules(raw).violations.some(v => v.code === 'team-alternation'));
  raw.steps[2].shot.contact.kind = 'serve';
  assert.ok(validateRallyRules(raw).violations.some(v => v.code === 'late-serve'));
});

test('service schema rejects conflicting teams, unknown identity and unsupported match-state guesses', () => {
  for (const service of [{ server: 'player1', receiver: 'player2' }, { server: 'player1', receiver: 'auto' }, { server: 'player1', receiver: 'player3', score: [0, 0] }]) {
    const doc = createStarterDocument(); doc.service = service;
    assert.throws(() => validateDocument(doc));
  }
});
