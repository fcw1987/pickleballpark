import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayBuilder } from '../play-builder.js';
import { createStarterDocument, validateDocument } from '../play-document.js';
import { DraftStore, EditHistory, STORAGE_KEY } from '../builder-storage.js';
import { simulateRally } from '../rally-engine.js';

const clone = value => structuredClone(value);
const canonical = value => JSON.stringify(value);
const generated = await simulateRally({ seed: 0 });
assert.equal(generated.status, 'complete');

function harness(generate = async () => clone(generated)) {
  const builder = Object.create(PlayBuilder.prototype);
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  builder.store = new DraftStore({ validate: validateDocument, storage });
  builder.document = createStarterDocument();
  for (const player of Object.values(builder.document.players)) player.handedness = 'right';
  Object.assign(builder, { generation: 0, sourceIntent: 0, proposalGeneration: 0, pendingAddCount: 0, addQueue: Promise.resolve(),
    proposalController: null, proposalBusy: false, proposalProgress: null, persistedSource: null, saveError: null,
    pristineSource: canonical(builder.document), coachOptions: [], coachCandidates: new Map(),
    history: new EditHistory(builder.document), selectedShotId: builder.document.shots[0].id,
    generateRally: generate, courtTools: { clear() {} }, pause() {}, render() {}, scheduleRender() {}, cancelPendingView() {}, installPlay() {} });
  return { builder, values, storage, before: canonical(builder.document) };
}
const keep = ({ builder, values, before }, beforeStorage = undefined) => {
  assert.equal(canonical(builder.document), before);
  assert.equal(values.get(STORAGE_KEY), beforeStorage);
  assert.equal(builder.proposalBusy, false);
  assert.equal(builder.proposalController, null);
};

test('a complete worker point is independently validated and saved as a separate paused draft', async () => {
  let request, scheduled=0;
  const state = harness(async input => {
    request = input;
    input.onProgress({ phase: 'search', attempt: 1, shots: 3 });
    assert.equal(state.builder.proposalProgress.completed, 3);
    return clone(generated);
  });
  const { builder, values } = state;
  builder.scheduleRender=()=>{scheduled++;};
  await builder.action('title', 'Keep the authored previous play');
  const previous = clone(builder.document);
  const result = await builder.randomRally({ lengthFeel: 'natural', seed: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'complete');
  assert.equal(request.options.lengthFeel, 'natural');
  assert.equal(scheduled,1,'worker progress schedules rendering without a synchronous layout pass');
  assert.equal(request.players.player4.handedness, 'right');
  assert.equal(request.players.player4.style, 'advanced');
  assert.ok(request.signal instanceof AbortSignal);
  assert.notEqual(builder.document.id, previous.id);
  assert.equal(builder.document.modelVersion, 2);
  assert.deepEqual(builder.document.generation, generated.document.generation);
  assert.equal(Object.hasOwn(builder.document, 'decisions'), false);
  const saved = JSON.parse(values.get(STORAGE_KEY));
  assert.deepEqual(saved.drafts.find(document => document.id === previous.id), previous);
  assert.deepEqual(saved.drafts.find(document => document.id === builder.document.id), builder.document);
  assert.equal(saved.lastId, builder.document.id);
  assert.equal(builder.proposalBusy, false);
  assert.ok(request.signal.aborted, 'successful installation terminates the owned request');
});

for (const status of ['cancelled', 'censored', 'unsatisfied', 'failed', 'unknown']) {
  test(`a ${status} result never replaces or saves the current draft`, async () => {
    const state = harness(async () => ({ status, document: clone(generated.document), outcome: clone(generated.outcome) }));
    const result = await state.builder.randomRally({ lengthFeel: 'natural', seed: 0 });
    assert.equal(result.ok, false);
    assert.match(result.error, /current play was kept/i);
    keep(state);
  });
}

for (const [name, mutate] of [
  ['wrong source seed', value => { value.document.generation.seed = 1; }],
  ['wrong input recipe', value => { value.document.generation.input.options.lengthFeel = 'short'; }],
  ['wrong outcome', value => { value.outcome.reason = value.outcome.reason === 'net' ? 'wide' : 'net'; }],
  ['wrong rule reference', value => { value.document.outcome.ruleRef = '7.E.5'; value.outcome = clone(value.document.outcome); }],
  ['unsupported physics', value => { value.document.physicsVersion = 'play-physics-v999'; }],
  ['false terminal evidence', value => { value.document.outcome.evidence.position.x += 1; value.outcome = clone(value.document.outcome); }]
]) {
  test(`independent installation guard rejects ${name}`, async () => {
    const state = harness(async () => { const result = clone(generated); mutate(result); return result; });
    const result = await state.builder.randomRally({ lengthFeel: 'natural', seed: 0 });
    assert.equal(result.ok, false);
    keep(state);
  });
}

test('worker rejection is actionable and retains the current draft', async () => {
  const state = harness(async () => { throw Error('The rally worker could not run.'); });
  const result = await state.builder.randomRally({ seed: 0 });
  assert.equal(result.ok, false);
  assert.match(result.error, /worker could not run/);
  assert.match(result.error, /Retry generation/);
  keep(state);
});

test('invalid options reject before a worker is allocated', async () => {
  let calls = 0;
  const state = harness(async () => { calls++; return clone(generated); });
  for (const options of [{ lengthFeel: 'exact' }, { lengthFeel: 'natural', seed: -1 }, { lengthFeel: 'natural', seed: 1.2 }, { lengthFeel: 'natural', extra: true }]) {
    assert.equal((await state.builder.randomRally(options)).ok, false);
  }
  assert.equal(calls, 0);
  keep(state);
});

test('Cancel ignores a late worker completion and later progress', async () => {
  let finish, request;
  const state = harness(input => { request = input; return new Promise(resolve => { finish = resolve; }); });
  const pending = state.builder.randomRally({ seed: 0 });
  assert.equal(state.builder.proposalBusy, true);
  state.builder.cancelPendingProposals();
  assert.equal(request.signal.aborted, true);
  request.onProgress({ phase: 'search', attempt: 1, shots: 20 });
  assert.equal(state.builder.proposalProgress, null);
  finish(clone(generated));
  assert.equal((await pending).ok, false);
  keep(state);
});

test('a newer authored edit owns the draft even when an old worker ignores cancellation', async () => {
  let finish;
  const state = harness(() => new Promise(resolve => { finish = resolve; }));
  const pending = state.builder.randomRally({ seed: 0 });
  state.builder.edit(document => { document.title = 'Newer authored title'; });
  const edited = canonical(state.builder.document), saved = state.values.get(STORAGE_KEY);
  finish(clone(generated));
  assert.equal((await pending).ok, false);
  assert.equal(canonical(state.builder.document), edited);
  assert.equal(state.values.get(STORAGE_KEY), saved);
  assert.equal(state.builder.document.title, 'Newer authored title');
});

test('a newer request owns progress and installation after an older completion', async () => {
  const callbacks = [];
  const state = harness(input => new Promise(resolve => { callbacks.push({ input, resolve }); }));
  const first = state.builder.randomRally({ seed: 0 });
  const second = state.builder.randomRally({ seed: 0 });
  assert.equal(callbacks[0].input.signal.aborted, true);
  callbacks[0].resolve(clone(generated));
  assert.equal((await first).ok, false);
  assert.equal(state.builder.proposalBusy, true);
  callbacks[1].resolve(clone(generated));
  assert.equal((await second).ok, true);
  assert.equal(JSON.parse(state.values.get(STORAGE_KEY)).drafts.length, 1);
});

test('a source mutation without a revision still fails the final identity check', async () => {
  let finish;
  const state = harness(() => new Promise(resolve => { finish = resolve; }));
  const pending = state.builder.randomRally({ seed: 0 });
  state.builder.document.title = 'Unexpected source mutation';
  finish(clone(generated));
  assert.equal((await pending).ok, false);
  assert.equal(state.builder.document.title, 'Unexpected source mutation');
  assert.equal(state.values.size, 0);
});

test('a failed atomic save leaves the current source and exact saved bytes intact', async () => {
  const state = harness();
  assert.equal(state.builder.save(), true);
  const before = state.values.get(STORAGE_KEY);
  state.storage.setItem = () => { throw Object.assign(Error('Browser quota full'), { name: 'QuotaExceededError' }); };
  const result = await state.builder.randomRally({ seed: 0 });
  assert.equal(result.ok, false);
  keep(state, before);
});

test('unsaved work cannot be replaced when its preservation save fails', async () => {
  let calls = 0;
  const state = harness(async () => { calls++; return clone(generated); });
  state.builder.document = { ...state.builder.document, title: 'Unsaved authored work' };
  state.storage.setItem = () => { throw Error('Storage unavailable'); };
  const before = canonical(state.builder.document);
  const result = await state.builder.randomRally({ seed: 0 });
  assert.equal(result.ok, false);
  assert.match(result.error, /Keep this play first/);
  assert.equal(calls, 0);
  assert.equal(canonical(state.builder.document), before);
});
