import test from 'node:test';
import assert from 'node:assert/strict';

import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { createStarterDocument, documentFromTemplate, MAX_SHOTS, validateDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { evaluateCandidate, proposeFamilyChange, documentSourceIdentity, authorizeProposal } from '../rally-proposals.js';
import { proposeRandomRally, proposeSmartAdd } from '../smart-rally-generator.js';

const clone = value => structuredClone(value);

test('smart Add appends five validated hits from an empty document and preserves the prefix', async () => {
  let source = documentFromTemplate(PICKLEBOARD_PLAYS.find(play => play.id === 'third-shot-drop'));
  source.shots = [];
  const initial = clone(source);
  for (let index = 0; index < 5; index += 1) {
    const proposal = await proposeSmartAdd(source, { seed: 0x100 + index });
    assert.equal(proposal.ok, true, proposal.reason);
    assert.equal(proposal.sourceIdentity, documentSourceIdentity(source));
    assert.deepEqual(proposal.document.shots.slice(0, source.shots.length), source.shots);
    assert.equal(compileDocument(proposal.document).validShotCount, source.shots.length + 1);
    source = proposal.document;
  }
  assert.equal(source.shots.length, 5);
  assert.equal(source.shots[0].family, 'serve');
  assert.deepEqual(initial.shots, []);
});

test('Smart Add records bounded seed metadata, keeps all source fields, and avoids an occupied deterministic id', async () => {
  const generated = await proposeRandomRally({ length: 4, seed: 1 });
  assert.equal(generated.ok, true, generated.reason);
  generated.document.shots[3].id = 'smart-shot-5';
  const before = clone(generated.document);
  const proposal = await proposeSmartAdd(generated.document, { seed: 0xdeadbeef });
  assert.equal(proposal.ok, true, proposal.reason);
  assert.deepEqual(generated.document, before);
  assert.deepEqual(proposal.document.shots.slice(0, before.shots.length), before.shots);
  assert.equal(proposal.document.shots.at(-1).id, 'smart-shot-5-2');
  assert.deepEqual(proposal.document.shots.at(-1).generation, { seed: 0xdeadbeef, generatorVersion: 'smart-rally-v2' });
  validateDocument(proposal.document);
});

test('candidate evaluation includes the same coverage and Auto Shading boundary as play installation', () => {
  const document = createStarterDocument();
  document.assistance = { autoShading: true, showGuides: true, team: 'both' };
  document.shots[0].movement = { intent: 'manual', pinned: true, target: { x: 15, y: 5.25 } };
  document.shots[1].movement.pinned = true;
  const result = evaluateCandidate(document);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.validShotCount, document.shots.length);
  assert.ok(result.compiled.coverage.length > 0);
  assert.deepEqual(document.shots[0].target, { x: 5, y: 38 });
});

test('Fifth Shot Drop continuation chooses a compiler-reachable opposing hitter', async () => {
  let source = documentFromTemplate(PICKLEBOARD_PLAYS.find(play => play.id === 'fifth-shot-drop'));
  const prefix = clone(source.shots);
  for (let index = 0; index < 5; index += 1) {
    const proposal = await proposeSmartAdd(source, { seed: 0xfeed + index });
    assert.equal(proposal.ok, true, proposal.reason);
    assert.deepEqual(proposal.document.shots.slice(0, prefix.length), prefix);
    const compiled = compileDocument(proposal.document);
    assert.equal(compiled.validShotCount, proposal.document.shots.length);
    assert.equal(compiled.findings.length, 0);
    source = proposal.document;
  }
  assert.equal(source.shots.length, 10);
});

test('Random Rally returns exact bounded lengths, deterministic seeds, and varied authored sequences', async () => {
  const lengths = [1, 7, 63, 64, 65, 98, 99];
  for (const length of lengths) {
    const first = await proposeRandomRally({ length, seed: 0xc0ffee });
    assert.equal(first.ok, true, `${length}: ${first.reason}`);
    assert.equal(first.document.shots.length, length);
    assert.equal(compileDocument(first.document).validShotCount, length);
    const contacts = compileDocument(first.document).timeline.events.filter(event => event.type === 'contact');
    assert.equal(contacts.length, length);
    validateDocument(first.document);
    if (length > 1) {
      const second = await proposeRandomRally({ length, seed: 0xc0ffee });
      assert.deepEqual(second.document.shots, first.document.shots);
      assert.deepEqual(second.document.generation, first.document.generation);
    }
  }
  const a = await proposeRandomRally({ length: 30, seed: 1 });
  const b = await proposeRandomRally({ length: 30, seed: 2 });
  assert.notDeepEqual(a.document.shots.map(shot => `${shot.family}/${shot.target.x}/${shot.target.y}`), b.document.shots.map(shot => `${shot.family}/${shot.target.x}/${shot.target.y}`));
  assert.ok(new Set(a.document.shots.map(shot => shot.family)).size >= 3);
  assert.ok(new Set(a.document.shots.map(shot => shot.hitter)).size >= 3);
});

test('Random Rally rejects malformed and over-limit requests without a candidate', async () => {
  for (const length of [0, -1, 1.5, Infinity, NaN, 100, MAX_SHOTS + 1, '7']) {
    const result = await proposeRandomRally({ length, seed: 7 });
    assert.equal(result.ok, false, String(length));
    assert.equal(result.document, null, String(length));
    assert.match(result.reason, /integer|from 1 to|finite|99/);
  }
});

test('family proposals retain authored fields and adapt only explicit automatic metadata', async () => {
  const source = documentFromTemplate(PICKLEBOARD_PLAYS.find(play => play.id === 'third-shot-drop'));
  const protectedTarget = clone(source.shots[2].target);
  const proposal = await proposeFamilyChange(source, { index: 2, family: 'drive' });
  assert.equal(proposal.ok, true, proposal.reason);
  assert.equal(proposal.document.shots[2].family, 'drive');
  assert.deepEqual(proposal.document.shots[2].target, protectedTarget);
  assert.equal(source.shots[2].family, 'drop');
  assert.equal(authorizeProposal(proposal, source, { operation: 'family-change' }).ok, true);
  source.title = 'Changed after proposal';
  assert.equal(authorizeProposal(proposal, source, { operation: 'family-change' }).ok, false);
});

test('family changes maintain the schema-conditional serve method', async () => {
  const source = documentFromTemplate(PICKLEBOARD_PLAYS.find(play => play.id === 'third-shot-drop'));
  const drive = await proposeFamilyChange(source, { index: 2, family: 'drive' });
  assert.equal(drive.ok, true, drive.reason);
  assert.equal(Object.hasOwn(drive.document.shots[2], 'serveMethod'), false);
  const serve = await proposeFamilyChange(source, { index: 2, family: 'serve' });
  assert.equal(serve.ok, false, 'an invalid late Serve remains visible as a rejected proposal');
  assert.equal(serve.document.shots[2].family, 'serve');
  assert.equal(serve.document.shots[2].serveMethod, 'volley');
});

test('family changes preserve an authored drop serve method when the family is unchanged', async () => {
  const source = createStarterDocument();
  source.shots[0].serveMethod = 'drop';
  const proposal = await proposeFamilyChange(source, { index: 0, family: 'serve' });
  assert.equal(proposal.ok, true, proposal.reason);
  assert.equal(proposal.document.shots[0].serveMethod, 'drop');
});

test('Smart Add refuses terminal documents and malformed finite attempt overrides', async () => {
  const terminal = createStarterDocument();
  terminal.ending = 'winner';
  const stopped = await proposeSmartAdd(terminal, { seed: 3 });
  assert.equal(stopped.ok, false);
  assert.match(stopped.reason, /terminal outcome/);
  for (const options of [{ maxAttempts: Infinity }, { maxAttempts: 1.5 }, { maxAttempts: 0 }]) {
    const result = await proposeSmartAdd(createStarterDocument(), options);
    assert.equal(result.ok, false);
    assert.match(result.reason, /finite integer/);
  }
  for (const options of [{ maxAttempts: Infinity }, { maxBacktracks: Infinity }, { maxBacktracks: -1 }]) {
    const result = await proposeRandomRally({ length: 1, seed: 4, ...options });
    assert.equal(result.ok, false);
    assert.match(result.reason, /finite integer/);
  }
});

test('Random Rally yields between successful hits so cancellation remains observable', async () => {
  const controller = new AbortController();
  const progress = [];
  const result = await proposeRandomRally({
    length: 99,
    seed: 0x1234,
    signal: controller.signal,
    onProgress: update => {
      progress.push(update.shot);
      if (update.shot === 4) controller.abort();
    }
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /cancelled/i);
  assert.ok(progress.includes(4));
});
