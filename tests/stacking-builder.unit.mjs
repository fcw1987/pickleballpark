import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayBuilder } from '../play-builder.js';
import { createStarterDocument, validateDocument } from '../play-document.js';
import { DraftStore, EditHistory, STORAGE_KEY } from '../builder-storage.js';
import { normalizeRallyInputV1 } from '../rally-recipe.js';

const copy = value => structuredClone(value);
const stacking = { version: 'stacking-v1', teams: { green: { mode: 'serve-only', leftPlayer: 'player1' }, orange: { mode: 'full', leftPlayer: 'player3' } } };
function harness(generateRally = async () => ({ status: 'cancelled' })) {
  const builder = Object.create(PlayBuilder.prototype), values = new Map();
  builder.store = new DraftStore({ validate: validateDocument, storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  builder.document = createStarterDocument();
  Object.assign(builder, { generation: 0, sourceIntent: 0, proposalGeneration: 0, pendingAddCount: 0, addQueue: Promise.resolve(),
    proposalController: null, proposalBusy: false, proposalProgress: null, persistedSource: null, saveError: null,
    pristineSource: JSON.stringify(builder.document), coachOptions: [], coachCandidates: new Map(),
    history: new EditHistory(builder.document), selectedShotId: builder.document.shots[0].id,
    generateRally, courtTools: { clear() {} }, pause() {}, render() {}, scheduleRender() {}, cancelPendingView() {}, installPlay() {} });
  return { builder, values };
}

test('explicit stacking edits are undoable settings only, preserve role/layout/routes and can be fully turned off', async () => {
  const { builder } = harness(), original = copy(builder.document);
  assert.equal((await builder.action('stacking', { team: 'green', mode: 'serve-only', leftPlayer: 'player1' })).ok, true);
  assert.equal((await builder.action('stacking', { team: 'orange', mode: 'full', leftPlayer: 'player3' })).ok, true);
  assert.deepEqual(builder.document.stacking, stacking);
  for (const key of ['shots', 'initialLayout', 'service', 'players']) assert.deepEqual(builder.document[key], original[key]);
  await builder.action('stacking', { team: 'orange', mode: 'full', leftPlayer: 'player4' });
  assert.equal(builder.document.stacking.teams.orange.leftPlayer, 'player4');
  await builder.action('undo'); assert.equal(builder.document.stacking.teams.orange.leftPlayer, 'player3');
  await builder.action('redo'); assert.equal(builder.document.stacking.teams.orange.leftPlayer, 'player4');
  await builder.action('stacking', { team: 'green', mode: 'off' });
  assert.equal(Object.hasOwn(builder.document.stacking.teams, 'green'), false);
  await builder.action('stacking', { team: 'orange', mode: 'off' });
  assert.equal(Object.hasOwn(builder.document, 'stacking'), false);
  assert.deepEqual(builder.document, original);
});

test('malformed stacking edits cannot mutate the current document or stored bytes', async () => {
  const { builder, values } = harness();
  builder.save(); const before = JSON.stringify(builder.document), saved = values.get(STORAGE_KEY);
  for (const value of [{ team: 'blue', mode: 'full', leftPlayer: 'player1' }, { team: 'green', mode: 'full', leftPlayer: 'player3' }, { team: 'green', mode: 'mystery', leftPlayer: 'player1' }]) {
    assert.equal((await builder.action('stacking', value)).ok, false);
    assert.equal(JSON.stringify(builder.document), before); assert.equal(values.get(STORAGE_KEY), saved);
  }
});

test('Random Rally inherits saved preferences, supports a genuine Off override, and retains work on failure', async () => {
  const calls = [], { builder, values } = harness(async input => { calls.push(normalizeRallyInputV1(input)); return { status: 'failed' }; });
  await builder.action('stacking', { team: 'green', mode: 'serve-only', leftPlayer: 'player1' });
  const before = JSON.stringify(builder.document), saved = values.get(STORAGE_KEY);
  assert.equal((await builder.randomRally({ seed: 7 })).ok, false);
  assert.deepEqual(calls.at(-1).stacking, builder.document.stacking); assert.equal(calls.at(-1).layout.player2.x, 1);
  assert.equal((await builder.randomRally({ seed: 7, stacking: null })).ok, false);
  assert.equal(Object.hasOwn(calls.at(-1), 'stacking'), false); assert.equal(calls.at(-1).layout.player2.x, 15);
  assert.equal((await builder.randomRally({ seed: 7, stacking })).ok, false);
  assert.deepEqual(calls.at(-1).stacking, stacking);
  assert.equal(JSON.stringify(builder.document), before); assert.equal(values.get(STORAGE_KEY), saved);
  const count = calls.length;
  for (const value of [false, {}, { version: 'stacking-v1', teams: { green: { mode: 'full', leftPlayer: 'player4' } } }]) {
    assert.equal((await builder.randomRally({ seed: 7, stacking: value })).ok, false);
  }
  assert.equal(calls.length, count); assert.equal(JSON.stringify(builder.document), before);
});

test('editing stacking cancels an older request and ignores its eventual completion', async () => {
  let finish, input;
  const { builder, values } = harness(request => { input = request; return new Promise(resolve => { finish = resolve; }); });
  const pending = builder.randomRally({ seed: 7, stacking });
  await builder.action('stacking', { team: 'orange', mode: 'full', leftPlayer: 'player4' });
  assert.equal(input.signal.aborted, true);
  const current = JSON.stringify(builder.document), saved = values.get(STORAGE_KEY);
  finish({ status: 'complete', document: {} });
  assert.equal((await pending).ok, false);
  assert.equal(JSON.stringify(builder.document), current); assert.equal(values.get(STORAGE_KEY), saved);
});
