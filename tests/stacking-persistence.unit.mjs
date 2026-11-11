import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRallyInputV1, createGenerationRecipeV1, createRallyRequestRecipeV1, validateGenerationRecipeV1 } from '../rally-recipe.js';
import { createStarterDocument, validateDocument, documentFromTemplate } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { DraftStore, EditHistory, STORAGE_KEY, MAX_DRAFTS } from '../builder-storage.js';
import { createPlanningStateV2 } from '../play-planning-v2.js';
import { sampleActorBoardPositionV2 } from '../play-actors-v2.js';
import { model2Document } from './fixtures/model2/factories.mjs';

const stacking = { version: 'stacking-v1', teams: {
  green: { mode: 'serve-only', leftPlayer: 'player1' }, orange: { mode: 'full', leftPlayer: 'player3' }
} };
const copy = value => structuredClone(value);
const storage = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('absent stacking keeps normalized input and generation origin byte-compatible', () => {
  const absent = normalizeRallyInputV1({ seed: 47 }), explicit = normalizeRallyInputV1({ seed: 47, stacking: undefined });
  assert.equal(JSON.stringify(absent), JSON.stringify(explicit));
  assert.equal(Object.hasOwn(absent, 'stacking'), false);
  const origin = createGenerationRecipeV1(absent);
  assert.equal(Object.hasOwn(origin.input, 'stacking'), false);
  assert.equal(JSON.stringify(origin), JSON.stringify(createGenerationRecipeV1(explicit)));
  assert.equal(validateGenerationRecipeV1(origin), origin);
});

test('generated defaults can stack but explicit layouts survive normalization and provenance unchanged', () => {
  const base = normalizeRallyInputV1({ seed: 47 }), before = JSON.stringify(base);
  const defaults = normalizeRallyInputV1({ seed: 47, stacking });
  assert.equal(defaults.layout.player2.x, 1); assert.equal(defaults.layout.player4.x, 21.25);
  const explicit = normalizeRallyInputV1({ seed: 47, stacking, layout: base.layout });
  assert.deepEqual(explicit.layout, base.layout); assert.equal(JSON.stringify(base), before);
  const origin = createGenerationRecipeV1(explicit), requested = createRallyRequestRecipeV1(explicit);
  assert.deepEqual(origin.input.stacking, stacking); assert.deepEqual(origin.input.layout, base.layout);
  assert.deepEqual(requested.input.stacking, stacking); assert.equal(requested.selection, null);
  assert.equal(validateGenerationRecipeV1(origin), origin);
  for (const invalid of [null, {}, { ...stacking, version: 'stacking-v2' }]) assert.throws(() => normalizeRallyInputV1({ seed: 47, stacking: invalid }), TypeError);
});

test('ordinary return starts remain ordinary when their legal court is already the preferred side', () => {
  for (const server of ['player1', 'player3']) for (const court of ['left', 'right']) {
    const receiver = server === 'player1' ? 'player3' : 'player1', partner = receiver === 'player3' ? 'player4' : 'player2';
    const team = receiver === 'player3' ? 'orange' : 'green';
    const settings = { version: 'stacking-v1', teams: { [team]: { mode: 'full', leftPlayer: court === 'left' ? receiver : partner } } };
    const base = normalizeRallyInputV1({ seed: 5, service: { server, receiver, court } });
    const result = normalizeRallyInputV1({ seed: 5, service: { server, receiver, court }, stacking: settings });
    assert.deepEqual(result.layout, base.layout);
  }
});

test('saved edits preserve original stacking provenance without regenerating explicit layouts, pins or contacts', () => {
  const input = normalizeRallyInputV1({ seed: 47, stacking });
  const origin = createGenerationRecipeV1(input);
  const doc = model2Document({ stacking: copy(stacking), generation: origin });
  doc.shots[0].movement = { intent: 'manual', target: { x: 8, y: 13 }, pinned: true };
  const original = JSON.stringify(doc), state = createPlanningStateV2(doc);
  assert.deepEqual(state.document.stacking, stacking); assert.deepEqual(state.play.stacking, stacking);
  assert.equal(JSON.stringify(doc), original);
  const before = compileDocument(doc);
  const edited = copy(doc); edited.stacking.teams.green.leftPlayer = 'player2';
  assert.equal(validateDocument(edited), edited);
  assert.deepEqual(edited.generation, origin);
  const after = compileDocument(edited);
  assert.equal(JSON.stringify(after.timeline.segments), JSON.stringify(before.timeline.segments));
  for (const [index, segment] of before.timeline.segments.entries()) for (const id of Object.keys(doc.players)) for (const progress of [0, .25, .5, .75, 1]) {
    const time = segment.startTime + segment.duration * progress;
    assert.deepEqual(sampleActorBoardPositionV2(after.timeline.segments[index], id, time), sampleActorBoardPositionV2(segment, id, time));
  }
  assert.deepEqual(edited.initialLayout, doc.initialLayout); assert.deepEqual(edited.shots, doc.shots);
  const memory = storage(), store = new DraftStore({ storage: memory, validate: validateDocument });
  store.save(edited);
  assert.deepEqual(store.loadLast(), edited);
  assert.deepEqual(store.importJSON(store.exportJSON(edited)), edited);
  const duplicate = { ...copy(edited), id: 'stacking-copy', title: 'Stacking copy' };
  store.save(duplicate); assert.deepEqual(store.open(duplicate.id), duplicate);
  const history = new EditHistory(doc); history.commit(edited);
  assert.deepEqual(history.undo(), doc); assert.deepEqual(history.redo(), edited);
});

test('legacy lessons can retain future-generation preferences without changing their trusted authored motion', () => {
  const doc = documentFromTemplate(PICKLEBOARD_PLAYS[0]), expected = compileDocument(doc);
  const withPreferences = { ...copy(doc), stacking: copy(stacking) };
  assert.equal(validateDocument(withPreferences), withPreferences);
  const actual = compileDocument(withPreferences);
  assert.equal(JSON.stringify(actual.timeline), JSON.stringify(expected.timeline));
  assert.deepEqual(actual.play.steps, expected.play.steps);
});

test('invalid stacking imports, storage failures, conflicts and capacity preserve previous source bytes', () => {
  const memory = storage(), store = new DraftStore({ storage: memory, validate: validateDocument });
  const doc = { ...createStarterDocument(), stacking: copy(stacking) }; store.save(doc);
  const saved = memory.getItem(STORAGE_KEY), invalid = copy(doc); invalid.stacking.teams.orange.leftPlayer = 'player2';
  assert.throws(() => store.importJSON(JSON.stringify(invalid)), /leftPlayer/);
  assert.equal(memory.getItem(STORAGE_KEY), saved);
  const changed = copy(doc); changed.stacking.teams.green.leftPlayer = 'player2';
  const write = memory.setItem; memory.setItem = () => { throw Object.assign(Error('full'), { name: 'QuotaExceededError' }); };
  assert.throws(() => store.save(changed), /previous saved library was kept/); assert.equal(memory.getItem(STORAGE_KEY), saved);
  memory.setItem = write;
  const other = new DraftStore({ storage: memory, validate: validateDocument }); other.open(doc.id);
  store.save(changed); const newer = memory.getItem(STORAGE_KEY);
  assert.throws(() => other.save(doc), error => error.code === 'DRAFT_CONFLICT'); assert.equal(memory.getItem(STORAGE_KEY), newer);
  for (let index = 1; index < MAX_DRAFTS; index++) store.save({ ...copy(doc), id: `stack-${index}` });
  const full = memory.getItem(STORAGE_KEY);
  assert.throws(() => store.save({ ...copy(doc), id: 'one-too-many' }), error => error.code === 'DRAFT_CAPACITY');
  assert.equal(memory.getItem(STORAGE_KEY), full); assert.equal(store.list().length, MAX_DRAFTS);
});
