import assert from 'node:assert/strict';
import test from 'node:test';
import { DraftStore, STORAGE_KEY } from '../builder-storage.js';
import { applyCoverageAssistance } from '../coverage-assistance.js';
import { compileDocument } from '../play-compiler.js';
import { createStarterDocument, validateDocument } from '../play-document.js';

const copy = value => structuredClone(value);
const jsonSnapshot = value => JSON.parse(JSON.stringify(value));

class MemoryStorage {
  constructor() { this.values = new Map(); this.failWrites = false; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.values.set(key, String(value));
  }
}

function assistedDocument() {
  const document = createStarterDocument();
  document.assistance = { autoShading: true, showGuides: true, team: 'both' };
  document.shots[0].movement = {intent:'manual',pinned:true,target:{x:15,y:5.25}};
  document.shots[1].movement.pinned = true;
  return document;
}

test('real compiler and coverage preserve authored pins and every intended target', () => {
  const document = assistedDocument();
  const authoredBefore = copy(document);
  const compiled = compileDocument(document);
  assert.equal(compiled.validShotCount, 3);
  const compiledBefore = copy(compiled.play);
  const result = applyCoverageAssistance(compiled.play, document, compiled.timeline);

  assert.deepEqual(document, authoredBefore);
  assert.deepEqual(document.shots.map(shot => shot.target), authoredBefore.shots.map(shot => shot.target));
  for (const pinnedId of ['player1', 'player3']) {
    for (let index = 0; index < compiledBefore.steps.length; index += 1) {
      assert.deepEqual(result.play.steps[index].positions[pinnedId], compiledBefore.steps[index].positions[pinnedId]);
    }
  }
  assert.deepEqual(
    result.play.steps.filter(step => step.shot).map(step => step.shot.intendedTarget),
    authoredBefore.shots.map(shot => shot.target)
  );
});

test('guide-only coverage leaves compiled play and timeline unchanged', () => {
  const document = createStarterDocument();
  document.assistance = { autoShading: false, showGuides: true, team: 'both' };
  const compiled = compileDocument(document);
  const playBefore = copy(compiled.play);
  const timelineBefore = jsonSnapshot(compiled.timeline);
  const timelineReference = compiled.timeline;
  const result = applyCoverageAssistance(compiled.play, document, compiled.timeline);

  assert.deepEqual(jsonSnapshot(result.play), jsonSnapshot(playBefore));
  assert(result.coverage.length > 0);
  assert(result.coverage.every(item => item.explanation.includes('Guide only')));
  assert.equal(compiled.timeline, timelineReference);
  assert.deepEqual(jsonSnapshot(compiled.timeline), timelineBefore);
});

test('compile plus coverage is deterministic for identical source and timeline', () => {
  const source = assistedDocument();
  const firstCompile = compileDocument(copy(source));
  const secondCompile = compileDocument(copy(source));
  const first = applyCoverageAssistance(firstCompile.play, copy(source), firstCompile.timeline);
  const second = applyCoverageAssistance(secondCompile.play, copy(source), secondCompile.timeline);
  assert.deepEqual(first, second);
  assert.deepEqual(jsonSnapshot(firstCompile.timeline), jsonSnapshot(secondCompile.timeline));
});

test('actual schema storage round-trips an incomplete source draft', () => {
  const storage = new MemoryStorage();
  const store = new DraftStore({ storage, validate: validateDocument });
  const incomplete = createStarterDocument();
  incomplete.id = 'incomplete-real-schema';
  incomplete.title = 'Unfinished rally';
  incomplete.shots = [];
  store.save(incomplete);
  assert.deepEqual(store.loadLast(), incomplete);
  assert.equal(compileDocument(store.loadLast()).validShotCount, 0);
});

test('actual schema rejects malformed imports and preserves the prior draft on write failure', () => {
  const storage = new MemoryStorage();
  const store = new DraftStore({ storage, validate: validateDocument });
  const safe = createStarterDocument();
  store.save(safe);
  const bytesBefore = storage.getItem(STORAGE_KEY);

  assert.throws(() => store.importJSON('{"schemaVersion":1,"shots":['), /malformed JSON/);
  const invalid = copy(safe);
  invalid.shots[0].target.x = Infinity;
  assert.throws(() => store.save(invalid), /finite number|non-finite/);
  assert.equal(storage.getItem(STORAGE_KEY), bytesBefore);

  storage.failWrites = true;
  const changed = copy(safe);
  changed.title = 'A newer edit';
  assert.throws(() => store.save(changed), /previous saved library was kept/);
  assert.equal(storage.getItem(STORAGE_KEY), bytesBefore);
});
