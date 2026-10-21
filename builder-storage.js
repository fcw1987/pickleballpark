export const STORAGE_KEY = 'pickleballpark-builder-v1';
export const STORAGE_SCHEMA_VERSION = 1;
export const MAX_JSON_BYTES = 512 * 1024;
export const MAX_DRAFTS = 50;
export const DRAFT_CONFLICT_CODE = 'DRAFT_CONFLICT';
export const DRAFT_CAPACITY_CODE = 'DRAFT_CAPACITY';

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function fail(message, cause) {
  const error = new Error(`Builder storage: ${message}`);
  if (cause !== undefined) error.cause = cause;
  return error;
}

function conflict(id) {
  const error = fail(`draft "${id}" changed in another tab; save it as a copy or reopen the newer version`);
  error.code = DRAFT_CONFLICT_CODE;
  error.draftId = id;
  return error;
}

function jsonByteLength(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).byteLength;
  if (typeof Blob !== 'undefined') return new Blob([text]).size;
  return unescape(encodeURIComponent(text)).length;
}

function assertBoundedPlainJSON(value, label = 'value') {
  const seen = new Set();
  let nodes = 0;
  const visit = (item, path, depth) => {
    if (++nodes > 100_000) throw fail(`${label} contains too many values`);
    if (depth > 64) throw fail(`${label} is nested too deeply`);
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw fail(`${path} must be a finite number`);
      return;
    }
    if (typeof item !== 'object') throw fail(`${path} is not plain JSON data`);
    if (seen.has(item)) throw fail(`${path} contains a recursive reference`);
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
      throw fail(`${path} is not plain JSON data`);
    }
    seen.add(item);
    if (Array.isArray(item)) {
      for (let index = 0; index < item.length; index += 1) visit(item[index], `${path}[${index}]`, depth + 1);
    } else {
      for (const key of Object.keys(item)) {
        if (BLOCKED_KEYS.has(key)) throw fail(`${path} contains blocked key "${key}"`);
        visit(item[key], `${path}.${key}`, depth + 1);
      }
    }
    seen.delete(item);
  };
  visit(value, label, 0);
}

function clone(value) {
  assertBoundedPlainJSON(value);
  return JSON.parse(JSON.stringify(value));
}

function assertDocumentIdentity(doc) {
  if (typeof doc.id !== 'string' || doc.id.length < 1 || doc.id.length > 128) {
    throw fail('document id must be a non-empty string of at most 128 characters');
  }
  if (typeof doc.title !== 'string' || doc.title.length > 200) {
    throw fail('document title must be plain text of at most 200 characters');
  }
}

function parseJSON(text, label) {
  if (typeof text !== 'string') throw fail(`${label} must be JSON text`);
  if (jsonByteLength(text) > MAX_JSON_BYTES) throw fail(`${label} exceeds the 512 KiB limit`);
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw fail(`${label} is malformed JSON`, cause);
  }
}

export class DraftStore {
  constructor({ storage, validate } = {}) {
    const resolvedStorage = storage === undefined ? globalThis.localStorage : storage;
    if (!resolvedStorage || typeof resolvedStorage.getItem !== 'function' || typeof resolvedStorage.setItem !== 'function') {
      throw new TypeError('DraftStore requires a localStorage-compatible storage object');
    }
    if (typeof validate !== 'function') throw new TypeError('DraftStore requires a document validator');
    this.storage = resolvedStorage;
    this.validate = validate;
    // Values are tracked per document so another tab changing a different
    // draft does not prevent this store from saving the document it opened.
    this.observedDrafts = new Map();
    // A library listing authorizes deletion of its displayed revision, but
    // must never advance the active editor's independent save observation.
    this.listedDrafts = new Map();
  }

  _validatedDocument(value) {
    assertBoundedPlainJSON(value, 'document');
    this.validate(value);
    assertDocumentIdentity(value);
    return clone(value);
  }

  _readEnvelope() {
    let text;
    try {
      text = this.storage.getItem(STORAGE_KEY);
    } catch (cause) {
      throw fail('could not read local drafts', cause);
    }
    if (text === null) return { schemaVersion: STORAGE_SCHEMA_VERSION, drafts: [], lastId: null };
    const value = parseJSON(text, 'saved library');
    assertBoundedPlainJSON(value, 'saved library');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('saved library has an invalid envelope');
    if (value.schemaVersion !== STORAGE_SCHEMA_VERSION) {
      throw fail(`saved library schema version ${String(value.schemaVersion)} is unsupported`);
    }
    if (!Array.isArray(value.drafts) || value.drafts.length > MAX_DRAFTS) throw fail('saved library has an invalid draft list');
    if (value.lastId !== null && typeof value.lastId !== 'string') throw fail('saved library has an invalid last draft id');
    const ids = new Set();
    const drafts = value.drafts.map(document => {
      const doc = this._validatedDocument(document);
      if (ids.has(doc.id)) throw fail(`saved library contains duplicate id "${doc.id}"`);
      ids.add(doc.id);
      return doc;
    });
    if (value.lastId !== null && !ids.has(value.lastId)) throw fail('saved library points to a missing last draft');
    return { schemaVersion: STORAGE_SCHEMA_VERSION, drafts, lastId: value.lastId };
  }

  _writeEnvelope(envelope) {
    const text = JSON.stringify(envelope);
    if (jsonByteLength(text) > MAX_JSON_BYTES) throw fail('saved library exceeds the 512 KiB limit');
    try {
      // The whole library is one value so setItem is the only commit point. If it
      // fails (for example, quota), the browser retains the previous value.
      this.storage.setItem(STORAGE_KEY, text);
    } catch (cause) {
      throw fail('could not save local drafts; the previous saved library was kept', cause);
    }
  }

  _serializedDraft(envelope, id) {
    const document = envelope.drafts.find(saved => saved.id === id);
    return document ? JSON.stringify(document) : null;
  }

  _observe(envelope, id) {
    this.observedDrafts.set(id, this._serializedDraft(envelope, id));
  }

  _assertObservedDraftUnchanged(envelope, id) {
    if (!this.observedDrafts.has(id)) return;
    if (this.observedDrafts.get(id) !== this._serializedDraft(envelope, id)) throw conflict(id);
  }

  loadLast() {
    const envelope = this._readEnvelope();
    if (envelope.lastId === null) return null;
    this._observe(envelope, envelope.lastId);
    return clone(envelope.drafts.find(doc => doc.id === envelope.lastId));
  }

  list({ includeRevision = false } = {}) {
    const drafts = this._readEnvelope().drafts;
    this.listedDrafts = new Map(drafts.map(doc => [doc.id, JSON.stringify(doc)]));
    return drafts.map(({ id, title }) => includeRevision ? { id, title, revision: this.listedDrafts.get(id) } : { id, title });
  }

  save(value) {
    const doc = this._validatedDocument(value);
    const envelope = this._readEnvelope();
    this._assertObservedDraftUnchanged(envelope, doc.id);
    const index = envelope.drafts.findIndex(saved => saved.id === doc.id);
    if (index < 0) {
      if (envelope.drafts.length >= MAX_DRAFTS) {
        const error = fail(`library is limited to ${MAX_DRAFTS} drafts; delete a saved play in My Plays to make room`);
        error.code = DRAFT_CAPACITY_CODE;
        throw error;
      }
      envelope.drafts.push(doc);
    } else {
      envelope.drafts[index] = doc;
    }
    envelope.lastId = doc.id;
    this._writeEnvelope(envelope);
    this._observe(envelope, doc.id);
    return clone(doc);
  }

  open(id) {
    if (typeof id !== 'string') throw fail('draft id must be a string');
    const envelope = this._readEnvelope();
    const doc = envelope.drafts.find(saved => saved.id === id);
    if (!doc) {
      this._observe(envelope, id);
      return null;
    }
    if (envelope.lastId !== id) {
      envelope.lastId = id;
      this._writeEnvelope(envelope);
    }
    this._observe(envelope, id);
    return clone(doc);
  }

  remove(id, { expectedRevision } = {}) {
    if (typeof id !== 'string') throw fail('draft id must be a string');
    const envelope = this._readEnvelope();
    const listed = expectedRevision === undefined ? this.listedDrafts.get(id) : expectedRevision;
    if (listed !== undefined) {
      if (typeof listed !== 'string' || listed !== this._serializedDraft(envelope, id)) throw conflict(id);
    } else this._assertObservedDraftUnchanged(envelope, id);
    const index = envelope.drafts.findIndex(saved => saved.id === id);
    if (index < 0) return false;
    envelope.drafts.splice(index, 1);
    if (envelope.lastId === id) envelope.lastId = envelope.drafts.at(-1)?.id ?? null;
    this._writeEnvelope(envelope);
    this._observe(envelope, id);
    return true;
  }

  importJSON(text) {
    return this._validatedDocument(parseJSON(text, 'import'));
  }

  exportJSON(value) {
    const doc = this._validatedDocument(value);
    const text = JSON.stringify(doc, null, 2);
    if (jsonByteLength(text) > MAX_JSON_BYTES) throw fail('export exceeds the 512 KiB limit');
    return text;
  }
}

export class EditHistory {
  constructor(initial, { limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError('EditHistory limit must be a positive integer');
    this.limit = limit;
    this.snapshots = [clone(initial)];
    this.index = 0;
  }

  get current() { return clone(this.snapshots[this.index]); }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.snapshots.length - 1; }

  commit(value) {
    this.snapshots.splice(this.index + 1);
    this.snapshots.push(clone(value));
    if (this.snapshots.length > this.limit + 1) this.snapshots.shift();
    this.index = this.snapshots.length - 1;
    return this.current;
  }

  undo() {
    if (this.canUndo) this.index -= 1;
    return this.current;
  }

  redo() {
    if (this.canRedo) this.index += 1;
    return this.current;
  }
}
