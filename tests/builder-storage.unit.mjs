import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDocument } from '../play-document.js';
import { proposeRandomRally } from '../smart-rally-generator.js';
import {
  DraftStore,
  DRAFT_CONFLICT_CODE,
  DRAFT_CAPACITY_CODE,
  EditHistory,
  MAX_DRAFTS,
  MAX_JSON_BYTES,
  MAX_LIBRARY_BYTES,
  STORAGE_KEY
} from '../builder-storage.js';

const document = (id = 'draft-1', overrides = {}) => ({
  id,
  title: `Play ${id}`,
  schemaVersion: 1,
  shots: [],
  ...overrides
});

const validate = value => {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.shots) || value.shots.length > 64) {
    throw new Error('invalid play document');
  }
};

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('round trips version-one source drafts, selection, listing, and removal', () => {
  const storage = new MemoryStorage();
  const store = new DraftStore({ storage, validate });
  store.save(document('one'));
  store.save(document('two', { title: 'Second', incomplete: true }));
  assert.deepEqual(store.list(), [{ id: 'one', title: 'Play one' }, { id: 'two', title: 'Second' }]);
  assert.equal(store.loadLast().id, 'two');
  assert.equal(store.open('one').id, 'one');
  assert.equal(store.loadLast().id, 'one');
  assert.equal(store.remove('one'), true);
  assert.equal(store.loadLast().id, 'two');
  assert.equal(store.remove('missing'), false);
});

test('returns detached documents and exports/imports validated JSON', () => {
  const store = new DraftStore({ storage: new MemoryStorage(), validate });
  const source = document('one', { shots: [{ id: 'shot-1', target: { x: 1, y: 2 } }] });
  store.save(source);
  source.shots[0].target.x = 99;
  const opened = store.open('one');
  assert.equal(opened.shots[0].target.x, 1);
  opened.shots[0].target.x = 88;
  assert.equal(store.open('one').shots[0].target.x, 1);
  assert.deepEqual(store.importJSON(store.exportJSON(source)), source);
});

test('rejects malformed, oversized, future-version, non-finite, and prototype-key imports', () => {
  const store = new DraftStore({ storage: new MemoryStorage(), validate });
  assert.throws(() => store.importJSON('{bad'), /malformed JSON/);
  assert.throws(() => store.importJSON(`{"id":"x","title":"${'x'.repeat(MAX_JSON_BYTES)}"}`), /512 KiB/);
  assert.throws(() => store.importJSON(JSON.stringify(document('future', { schemaVersion: 2 }))), /invalid play document/);
  assert.throws(() => store.importJSON('{"id":"x","title":"x","schemaVersion":1,"shots":[],"__proto__":{}}'), /blocked key/);
  assert.throws(() => store.save(document('nan', { coordinate: Number.NaN })), /finite number/);
});

test('preserves corrupt and unsupported stored bytes for recovery', () => {
  for (const bytes of ['{broken', JSON.stringify({ schemaVersion: 2, drafts: [], lastId: null })]) {
    const storage = new MemoryStorage({ [STORAGE_KEY]: bytes });
    const store = new DraftStore({ storage, validate });
    assert.throws(() => store.loadLast(), /malformed|unsupported/);
    assert.equal(storage.getItem(STORAGE_KEY), bytes);
  }
});

test('quota failure cannot overwrite the previously committed library', () => {
  const storage = new MemoryStorage();
  const store = new DraftStore({ storage, validate });
  store.save(document('safe'));
  const prior = storage.getItem(STORAGE_KEY);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => store.save(document('new')), /previous saved library was kept/);
  assert.equal(storage.getItem(STORAGE_KEY), prior);
});

test('detects a same-draft overwrite from another store and identifies the conflict', () => {
  const storage = new MemoryStorage();
  const first = new DraftStore({ storage, validate });
  const second = new DraftStore({ storage, validate });
  first.save(document('shared', { title: 'Original' }));
  assert.equal(first.loadLast().title, 'Original');
  assert.equal(second.loadLast().title, 'Original');
  second.save(document('shared', { title: 'From second tab' }));

  const prior = storage.getItem(STORAGE_KEY);
  assert.throws(
    () => first.save(document('shared', { title: 'From first tab' })),
    error => error.code === DRAFT_CONFLICT_CODE && error.draftId === 'shared'
  );
  assert.equal(storage.getItem(STORAGE_KEY), prior);
  assert.equal(second.open('shared').title, 'From second tab');
});

test('does not conflict when another store saves an unrelated draft', () => {
  const storage = new MemoryStorage();
  const first = new DraftStore({ storage, validate });
  const second = new DraftStore({ storage, validate });
  first.save(document('one'));
  first.open('one');
  second.save(document('two'));

  first.save(document('one', { title: 'Updated one' }));
  assert.equal(first.open('one').title, 'Updated one');
  assert.equal(first.open('two').title, 'Play two');
});

test('detects deletion or creation after a draft identity was observed', () => {
  const storage = new MemoryStorage();
  const first = new DraftStore({ storage, validate });
  const second = new DraftStore({ storage, validate });
  first.save(document('deleted'));
  first.open('deleted');
  second.remove('deleted');
  assert.throws(() => first.save(document('deleted')), error => error.code === DRAFT_CONFLICT_CODE);

  assert.equal(first.open('appeared'), null);
  second.save(document('appeared', { title: 'Created elsewhere' }));
  assert.throws(() => first.save(document('appeared')), error => error.code === DRAFT_CONFLICT_CODE);
});

test('failed writes retain the observation so a quota retry can succeed', () => {
  const storage = new MemoryStorage();
  const store = new DraftStore({ storage, validate });
  store.save(document('retry', { title: 'Before' }));
  store.open('retry');
  const setItem = storage.setItem.bind(storage);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => store.save(document('retry', { title: 'After' })), /previous saved library was kept/);
  storage.setItem = setItem;
  assert.equal(store.save(document('retry', { title: 'After' })).title, 'After');
});

test('preserves schema-one extension data including intermediate waypoints', () => {
  const storage = new MemoryStorage();
  const store = new DraftStore({ storage, validate });
  const legacy = document('legacy', {
    assistance: { coverageGuides: false, autoShading: true },
    shots: [{
      id: 'shot-1',
      target: { x: 4, y: 11 },
      waypoints: [{ x: 1, y: 2 }, { x: 3, y: 5 }],
      legacyExtension: { exact: ['keep', 7] }
    }]
  });
  const envelope = { schemaVersion: 1, drafts: [legacy], lastId: legacy.id };
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));

  const opened = store.loadLast();
  opened.title = 'Renamed';
  store.save(opened);
  assert.deepEqual(store.open('legacy').shots[0], legacy.shots[0]);
  assert.deepEqual(store.open('legacy').assistance, legacy.assistance);
});

test('a save without a prior observation retains legacy overwrite behavior', () => {
  const storage = new MemoryStorage();
  new DraftStore({ storage, validate }).save(document('legacy-caller', { title: 'Before' }));
  const fresh = new DraftStore({ storage, validate });
  assert.equal(fresh.save(document('legacy-caller', { title: 'After' })).title, 'After');
});

test('reports unavailable default storage as a constructor contract error', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    delete globalThis.localStorage;
    assert.throws(() => new DraftStore({ validate }), /localStorage-compatible storage object/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
  }
});

test('enforces the library bound without changing saved data', () => {
  const storage = new MemoryStorage();
  const store = new DraftStore({ storage, validate });
  for (let index = 0; index < MAX_DRAFTS; index += 1) store.save(document(`d${index}`));
  const prior = storage.getItem(STORAGE_KEY);
  assert.throws(() => store.save(document('overflow')), /limited to 50/);
  assert.equal(storage.getItem(STORAGE_KEY), prior);
});

test('uses a dedicated key and leaves the legacy theme and service-worker-like entries alone', () => {
  const storage = new MemoryStorage({
    'pickleboard-theme': 'dark',
    'pickleboard-static-v16': 'cache sentinel'
  });
  new DraftStore({ storage, validate }).save(document());
  assert.equal(storage.getItem('pickleboard-theme'), 'dark');
  assert.equal(storage.getItem('pickleboard-static-v16'), 'cache sentinel');
  assert(storage.getItem(STORAGE_KEY));
});

test('edit history isolates snapshots, truncates redo, and honors its limit', () => {
  const initial = document('history', { shots: [{ id: 'a' }] });
  const history = new EditHistory(initial, { limit: 2 });
  initial.shots.push({ id: 'external' });
  assert.deepEqual(history.current.shots, [{ id: 'a' }]);
  history.commit(document('history', { shots: [{ id: 'b' }] }));
  const returned = history.undo();
  returned.shots[0].id = 'mutated';
  assert.equal(history.current.shots[0].id, 'a');
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  history.commit(document('history', { shots: [{ id: 'c' }] }));
  assert.equal(history.canRedo, false);
  history.commit(document('history', { shots: [{ id: 'd' }] }));
  history.commit(document('history', { shots: [{ id: 'e' }] }));
  assert.equal(history.undo().shots[0].id, 'd');
  assert.equal(history.undo().shots[0].id, 'c');
  assert.equal(history.canUndo, false);
});

// Size fixtures use UTF-8 bytes rather than JS string length, matching storage.
const byteLength = value => new TextEncoder().encode(value).byteLength;
function libraryAtByteLimit() {
  const drafts = Array.from({ length: 4 }, (_, index) => document(`large-${index}`, { extension: 'é'.repeat(250_000) }));
  drafts.push(document('editable'));
  const envelope = { schemaVersion: 1, drafts, lastId: 'editable' };
  let spare = MAX_LIBRARY_BYTES - byteLength(JSON.stringify(envelope));
  for (const draft of drafts.slice(0, 4)) {
    const added = Math.min(spare, MAX_JSON_BYTES - byteLength(JSON.stringify(draft)));
    draft.extension += 'x'.repeat(added);
    spare -= added;
  }
  assert.equal(spare, 0);
  assert(drafts.every(draft => byteLength(JSON.stringify(draft)) <= MAX_JSON_BYTES));
  assert.equal(byteLength(JSON.stringify(envelope)), MAX_LIBRARY_BYTES);
  return envelope;
}

test('multi-play libraries can exceed the old file limit and round trip without migration', () => {
  const storage = new MemoryStorage(), store = new DraftStore({ storage, validate });
  const original = document('one', { extension: 'é'.repeat(150_000) });
  store.save(original);
  store.save(document('two', { extension: 'x'.repeat(300_000) }));
  assert(byteLength(storage.getItem(STORAGE_KEY)) > MAX_JSON_BYTES);
  const reopened = new DraftStore({ storage, validate });
  assert.deepEqual(reopened.open('one'), original);
  reopened.save({ ...original, title: 'Renamed' });
  assert.equal(reopened.list().length, 2);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion, 1);
  assert.equal(reopened.open('two').extension.length, 300_000);
});

test('byte capacity rejects edits, copies and imported saves atomically and allows recovery', () => {
  const envelope = libraryAtByteLimit();
  const storage = new MemoryStorage({ [STORAGE_KEY]: JSON.stringify(envelope) });
  const store = new DraftStore({ storage, validate });
  const editing = store.loadLast();
  assert.deepEqual(store.save(editing), editing); // Exactly at the byte bound is writable.
  const prior = storage.getItem(STORAGE_KEY);
  const changed = { ...editing, extension: 'unsaved changes' };
  const copied = { ...changed, id: 'copy' };
  const imported = store.importJSON(JSON.stringify(document('imported')));
  for (const candidate of [changed, copied, imported]) {
    const before = structuredClone(candidate);
    assert.throws(() => store.save(candidate), error => error.code === DRAFT_CAPACITY_CODE && /2 MiB/.test(error.message));
    assert.equal(storage.getItem(STORAGE_KEY), prior);
    assert.deepEqual(candidate, before);
  }
  store.remove('large-0');
  assert.deepEqual(store.save(changed), changed);
  assert.deepEqual(store.open('editable'), changed);
});

test('browser quota below the app byte cap stays distinct and does not advance save observations', () => {
  const storage = new MemoryStorage(), store = new DraftStore({ storage, validate });
  const original = document('quota', { extension: 'x'.repeat(300_000) });
  store.save(original);
  const prior = storage.getItem(STORAGE_KEY), write = storage.setItem.bind(storage);
  const cause = new Error('browser storage exhausted');
  cause.name = 'QuotaExceededError';
  storage.setItem = () => { throw cause; };
  const edited = { ...original, title: 'Unsaved quota edit' };
  assert.throws(() => store.save(edited), error => error.code === DRAFT_CAPACITY_CODE && error.capacityKind === 'quota' && error.cause === cause);
  assert.equal(storage.getItem(STORAGE_KEY), prior);
  assert.equal(store.observedDrafts.get('quota'), JSON.stringify(original));
  storage.setItem = write;
  assert.deepEqual(store.save(edited), edited);
});

test('50-play libraries permit updates while conflicts retain precedence over capacity', () => {
  const storage = new MemoryStorage(), store = new DraftStore({ storage, validate });
  for (let index = 0; index < MAX_DRAFTS; index++) store.save(document(`full-${index}`));
  const other = new DraftStore({ storage, validate });
  const stale = other.open('full-0');
  store.save({ ...stale, title: 'Newer at capacity' });
  const prior = storage.getItem(STORAGE_KEY);
  assert.throws(() => other.save({ ...stale, title: 'Stale local work' }), error => error.code === DRAFT_CONFLICT_CODE);
  assert.throws(() => other.save({ ...stale, id: 'copy' }), error => error.code === DRAFT_CAPACITY_CODE);
  assert.equal(storage.getItem(STORAGE_KEY), prior);
  assert.equal(store.list().length, MAX_DRAFTS);
});

test('oversized stored libraries stay untouched for recovery', () => {
  const envelope = libraryAtByteLimit();
  envelope.drafts.at(-1).extension = 'x';
  const bytes = JSON.stringify(envelope);
  const storage = new MemoryStorage({ [STORAGE_KEY]: bytes });
  const store = new DraftStore({ storage, validate });
  assert.throws(() => store.loadLast(), /saved library exceeds/);
  assert.throws(() => store.save(document('replacement')), /saved library exceeds/);
  assert.equal(storage.getItem(STORAGE_KEY), bytes);
});

test('50 real 99-hit rallies remain readable and editable beyond the old aggregate node bound', async () => {
  const proposal = await proposeRandomRally({ length: 99, seed: 7 });
  assert.equal(proposal.ok, true, proposal.reason);
  const source = proposal.document;
  const storage = new MemoryStorage(), store = new DraftStore({ storage, validate: validateDocument });
  const countNodes = value => 1 + (value && typeof value === 'object' ? Object.values(value).reduce((total, child) => total + countNodes(child), 0) : 0);
  for (let index = 0; index < MAX_DRAFTS; index++) {
    store.save({ ...source, id: `rally-${index}`, title: `99-hit rally ${index}` });
    // Read immediately: every successful write must remain readable.
    assert.equal(store.loadLast().shots.length, 99);
  }
  const bytes = storage.getItem(STORAGE_KEY);
  assert.throws(() => store.save({ ...source, id: 'rally-51' }), error => error.code === DRAFT_CAPACITY_CODE && error.capacityKind === 'count');
  assert.equal(storage.getItem(STORAGE_KEY), bytes);
  assert(byteLength(bytes) < MAX_LIBRARY_BYTES);
  assert(countNodes(JSON.parse(bytes)) > 100_000);
  const reopened = new DraftStore({ storage, validate: validateDocument });
  assert.equal(reopened.list().length, MAX_DRAFTS);
  for (let index = 0; index < MAX_DRAFTS; index++) {
    const saved = reopened.open(`rally-${index}`);
    assert.deepEqual(saved.shots, source.shots);
  }
  const edited = { ...reopened.open('rally-0'), title: 'Edited full-library rally' };
  reopened.save(edited);
  assert.deepEqual(reopened.open('rally-0'), edited);
});

test('separate library validation retains per-document and envelope metadata node bounds', () => {
  const storage = new MemoryStorage(), store = new DraftStore({ storage, validate });
  store.save(document('safe'));
  const prior = storage.getItem(STORAGE_KEY);
  assert.throws(() => store.save(document('too-many-values', { extension: Array(100_000).fill(0) })), /document contains too many values/);
  assert.equal(storage.getItem(STORAGE_KEY), prior);
  const envelope = JSON.parse(prior);
  envelope.extension = Array(100_000).fill(0);
  const bytes = JSON.stringify(envelope);
  storage.setItem(STORAGE_KEY, bytes);
  assert.throws(() => store.loadLast(), /saved library contains too many values/);
  assert.equal(storage.getItem(STORAGE_KEY), bytes);
});

test('document byte bounds apply to direct saves and stored documents without rewriting bytes', () => {
  const storage = new MemoryStorage(), store = new DraftStore({ storage, validate });
  store.save(document('safe'));
  const prior = storage.getItem(STORAGE_KEY);
  const oversized = document('oversized', { extension: 'é'.repeat(MAX_JSON_BYTES / 2) });
  assert.throws(() => store.save(oversized), /document exceeds the 512 KiB limit/);
  assert.equal(storage.getItem(STORAGE_KEY), prior);
  const bytes = JSON.stringify({ schemaVersion: 1, drafts: [oversized], lastId: oversized.id });
  storage.setItem(STORAGE_KEY, bytes);
  assert.throws(() => store.open(oversized.id), /document exceeds the 512 KiB limit/);
  assert.equal(storage.getItem(STORAGE_KEY), bytes);
});

test('browser quota variants allow deletion and save retry while ordinary errors remain generic', () => {
  for (const name of ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED', 'SecurityError']) {
    const storage = new MemoryStorage(), store = new DraftStore({ storage, validate });
    store.save(document('keep')); store.save(document('delete'));
    const prior = storage.getItem(STORAGE_KEY), write = storage.setItem.bind(storage);
    const cause = Object.assign(new Error(name), { name });
    storage.setItem = () => { throw cause; };
    assert.throws(() => store.save(document('keep', { title: 'Local edit' })), error => error.cause === cause && (name === 'SecurityError' ? error.code === undefined : error.code === DRAFT_CAPACITY_CODE && error.capacityKind === 'quota'));
    assert.throws(() => store.remove('delete'));
    assert.equal(storage.getItem(STORAGE_KEY), prior);
    storage.setItem = write;
    store.remove('delete');
    store.save(document('keep', { title: 'Local edit' }));
    assert.equal(store.loadLast().title, 'Local edit');
  }
});
