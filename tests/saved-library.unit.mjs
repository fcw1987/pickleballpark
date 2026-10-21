import test from 'node:test';
import assert from 'node:assert/strict';
import { DraftStore, DRAFT_CAPACITY_CODE, DRAFT_CONFLICT_CODE, MAX_DRAFTS, STORAGE_KEY } from '../builder-storage.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}
const doc = id => ({ id, title: id, schemaVersion: 1, shots: [] });
const validate = value => { assert.equal(value.schemaVersion, 1); assert(Array.isArray(value.shots)); };

test('capacity failures are distinct from quota and deletion frees exactly one slot', () => {
  const storage = new MemoryStorage(), store = new DraftStore({ storage, validate });
  for (let i = 0; i < MAX_DRAFTS; i++) store.save(doc(`saved-${i}`));
  const before = storage.getItem(STORAGE_KEY);
  assert.throws(() => store.save(doc('overflow')), error => error.code === DRAFT_CAPACITY_CODE);
  assert.equal(storage.getItem(STORAGE_KEY), before);
  assert.equal(store.remove('saved-12'), true);
  store.save(doc('replacement'));
  assert.equal(store.list().length, MAX_DRAFTS);
  assert.equal(store.open('saved-12'), null);
  assert.equal(store.open('saved-13').title, 'saved-13');
});
test('a stale tab cannot delete a newer observed draft', () => {
  const storage = new MemoryStorage(), first = new DraftStore({ storage, validate }), second = new DraftStore({ storage, validate });
  first.save(doc('shared')); second.open('shared');
  first.save({ ...doc('shared'), title: 'Newer work' });
  const before = storage.getItem(STORAGE_KEY);
  assert.throws(() => second.remove('shared'), error => error.code === DRAFT_CONFLICT_CODE);
  assert.equal(storage.getItem(STORAGE_KEY), before);
  second.open('shared'); assert.equal(second.remove('shared'), true);
});
test('a list-only reader cannot delete unseen newer contents', () => {
  const storage = new MemoryStorage(), writer = new DraftStore({ storage, validate }), reader = new DraftStore({ storage, validate });
  writer.save(doc('listed-only')); reader.list();
  assert.equal(reader.observedDrafts.has('listed-only'), false);
  writer.save({ ...doc('listed-only'), title: 'Newer unseen play', shots: [{ id: 'new-shot' }] });
  const before = storage.getItem(STORAGE_KEY);
  assert.throws(() => reader.remove('listed-only'), error => error.code === DRAFT_CONFLICT_CODE);
  assert.equal(storage.getItem(STORAGE_KEY), before);
});
test('a displayed row revision stays stale even after a background library refresh', () => {
  const storage = new MemoryStorage(), writer = new DraftStore({ storage, validate }), reader = new DraftStore({ storage, validate });
  writer.save(doc('row'));
  const displayed = reader.list({ includeRevision: true })[0];
  writer.save({ ...doc('row'), title: 'Updated while row stays visible' });
  const refreshed = reader.list({ includeRevision: true })[0];
  assert.notEqual(displayed.revision, refreshed.revision);
  const before = storage.getItem(STORAGE_KEY);
  assert.throws(() => reader.remove(displayed.id, { expectedRevision: displayed.revision }), error => error.code === DRAFT_CONFLICT_CODE);
  assert.equal(storage.getItem(STORAGE_KEY), before);
  assert.equal(reader.remove(refreshed.id, { expectedRevision: refreshed.revision }), true);
});
test('refreshing library revisions does not advance the active editor save baseline', () => {
  const storage = new MemoryStorage(), writer = new DraftStore({ storage, validate }), reader = new DraftStore({ storage, validate });
  writer.save(doc('editing'));
  const editing = reader.open('editing');
  writer.save({ ...doc('editing'), title: 'Other tab has newer work' });
  reader.list({ includeRevision: true });
  const before = storage.getItem(STORAGE_KEY);
  assert.throws(() => reader.save({ ...editing, title: 'Unsaved local edit' }), error => error.code === DRAFT_CONFLICT_CODE);
  assert.equal(storage.getItem(STORAGE_KEY), before);
});
test('a failed deletion retains saved bytes and allows an honest retry', () => {
  const storage = new MemoryStorage(), store = new DraftStore({ storage, validate });
  store.save(doc('keep'));
  const before = storage.getItem(STORAGE_KEY), write = storage.setItem;
  storage.setItem = () => { throw Error('quota'); };
  assert.throws(() => store.remove('keep'), /previous saved library was kept/);
  assert.equal(storage.getItem(STORAGE_KEY), before);
  storage.setItem = write; assert.equal(store.remove('keep'), true);
});
