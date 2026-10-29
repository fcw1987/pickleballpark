import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRallyInputV1, createGenerationRecipeV1, createRallyRequestRecipeV1, validateGenerationRecipeV1,
  RALLY_PLAYER_IDS, RALLY_STYLE_IDS, RALLY_FLAVOUR_IDS } from '../rally-recipe.js';
import { validateDocument, createStarterDocument, MODEL2_AUTHORING_FIELDS } from '../play-document.js';
import { DraftStore, MAX_JSON_BYTES } from '../builder-storage.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

const clone = value => structuredClone(value);
const recipe = () => createGenerationRecipeV1(normalizeRallyInputV1({ seed: 7 }));
const countValues = value => 1 + (value && typeof value === 'object' ? Object.values(value).reduce((sum, item) => sum + countValues(item), 0) : 0);
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

test('recipe defaults are explicit, immutable and independent of input insertion order', () => {
  const input = { seed: 7 }, normalized = normalizeRallyInputV1(input);
  assert.deepEqual(input, { seed: 7 });
  assert.deepEqual(normalized.options, { lengthFeel: 'natural', winner: 'either', signatureShots: true, maxShots: 99 });
  assert.equal(normalized.service.courtConvention, 'server-perspective-v1');
  assert.equal(normalized.players.player1.style, 'advanced');
  assert.equal(normalized.players.player1.flavour, 'balanced');
  assert.ok(Object.isFrozen(normalized) && Object.isFrozen(normalized.players.player1));
  const reversed = Object.fromEntries(Object.entries(clone(normalized)).reverse());
  reversed.players = Object.fromEntries(Object.entries(reversed.players).reverse().map(([id, value]) => [id, Object.fromEntries(Object.entries(value).reverse())]));
  assert.equal(JSON.stringify(normalizeRallyInputV1(reversed)), JSON.stringify(normalized));
  assert.equal(JSON.stringify(createGenerationRecipeV1(normalized)), JSON.stringify(recipe()));
  assert.equal(validateGenerationRecipeV1(recipe()).seed, 7);
});

test('default layouts honor both declared service courts and teams without renaming roles', () => {
  for (const team of ['green', 'orange']) for (const court of ['right', 'left']) for (const hand of ['left', 'right']) {
    const base = clone(normalizeRallyInputV1({ seed: 0xffffffff }));
    const server = team === 'green' ? 'player2' : 'player4', receiver = team === 'green' ? 'player3' : 'player1';
    base.players[server].handedness = hand;
    const value = normalizeRallyInputV1({ seed: base.seed, players: base.players, service: { server, receiver, court } });
    assert.equal(value.service.server, server); assert.equal(value.service.receiver, receiver);
    const x = (team === 'green') === (court === 'right') ? 5 : 15;
    assert.equal(value.layout[server].x, x);
    assert.equal(value.layout[receiver].x, 20 - x);
    assert.equal(value.layout[server].y, team === 'green' ? -1 : 45);
    const handSign = (team === 'green' ? -1 : 1) * (hand === 'right' ? 1 : -1);
    assert.equal(value.layout.ball.x, x + handSign * .8);
  }
});

test('normalization rejects malformed values and arbitrary settings blobs before generation', () => {
  for (const seed of [undefined, null, -1, 0x100000000, 1.5, NaN, Infinity, '7']) assert.throws(() => normalizeRallyInputV1({ seed }), /seed/);
  for (const options of [{ maxShots: 0 }, { maxShots: 100 }, { maxShots: null }, { winner: 'blue' }, { lengthFeel: null }, { signatureShots: 1 }, { errorRate: .01 }]) assert.throws(() => normalizeRallyInputV1({ seed: 7, options }), TypeError);
  assert.throws(() => normalizeRallyInputV1({ seed: 7, arbitrary: {} }), /unsupported/);
  assert.throws(() => normalizeRallyInputV1({ seed: 7, service: { server: 'player1', receiver: 'player2' } }), /receiving team/);
  assert.throws(() => normalizeRallyInputV1({ seed: 7, service: {} }), /server/);
  assert.throws(() => normalizeRallyInputV1({ seed: 7, service: { server: 'player1', receiver: 'player3', courtConvention: null } }), /courtConvention/);
  const source = clone(normalizeRallyInputV1({ seed: 7 }));
  for (const mutate of [value => { value.players.player1.style = 'custom'; }, value => { value.players.player1.flavour = null; }, value => { delete value.players.player4; }, value => { value.layout.ball.heightFeet = 5; }, value => { value.layout.player1.x = -8.01; }, value => { value.layout.ball.y = Infinity; }]) {
    const invalid = clone(source); mutate(invalid); assert.throws(() => normalizeRallyInputV1(invalid), TypeError);
  }
  const accessor = { seed: 7 }; Object.defineProperty(accessor, 'options', { enumerable: true, get() { throw Error('must not run'); } });
  assert.throws(() => normalizeRallyInputV1(accessor), /accessor/);
});

test('transient driver callbacks and signals never enter a serialized origin', () => {
  const value = normalizeRallyInputV1({ seed: 3, signal: new AbortController().signal, onProgress() {} });
  const output = createGenerationRecipeV1(value);
  assert.equal(Object.hasOwn(value, 'signal'), false); assert.equal(Object.hasOwn(value, 'onProgress'), false);
  assert.equal(Object.hasOwn(output.input, 'signal'), false);
  const invalid = clone(output); invalid.input.onProgress = 'not a callback';
  assert.throws(() => validateGenerationRecipeV1(invalid), /unsupported/);
});

test('cancelled or unsatisfied requests retain inputs without inventing a selected document origin', () => {
  const normalized = normalizeRallyInputV1({ seed: 9, options: { lengthFeel: 'epic', winner: 'green' } });
  const request = createRallyRequestRecipeV1(normalized);
  assert.equal(request.selection, null); assert.equal(request.seed, 9);
  assert.deepEqual(request.input.options, normalized.options);
  assert.ok(Object.isFrozen(request) && Object.isFrozen(request.input.options));
  assert.throws(() => validateGenerationRecipeV1(request), /selection/);
  const document = model2Document({ generation: request });
  assert.throws(() => validateDocument(document), /selection/);
  const selected = createGenerationRecipeV1(normalized, { attempts: 3, selectedAttempt: 2, selectedSeed: 12 });
  assert.equal(selected.selection.attempts, 3); assert.equal(request.selection, null);
  assert.throws(() => createGenerationRecipeV1(normalized, { attempts: 1, selectedAttempt: 0, selectedSeed: 9, rngState: 1 }), /unsupported/);
});

test('origin versions, selected attempts and normalized input are strictly bounded', () => {
  const valid = recipe();
  for (const field of ['mode', 'generatorVersion', 'policyVersion', 'physicsVersion']) {
    const invalid = clone(valid); invalid[field] = 'unsupported'; assert.throws(() => validateGenerationRecipeV1(invalid), new RegExp(field));
  }
  for (const mutate of [value => { value.trace = []; }, value => { value.input.options.extra = true; }, value => { delete value.input.options.maxShots; }, value => { delete value.input.players.player1.flavour; }, value => { value.selection.attempts = 0; }, value => { value.selection.attempts = 65; }, value => { value.selection.selectedAttempt = 1; }, value => { value.selection.selectedSeed = -1; }, value => { value.selection.rngState = 1; }]) {
    const invalid = clone(valid); mutate(invalid); assert.throws(() => validateGenerationRecipeV1(invalid), TypeError);
  }
  const conditioned = normalizeRallyInputV1({ seed: 7, options: { lengthFeel: 'epic', winner: 'orange' } });
  assert.equal(createGenerationRecipeV1(conditioned, { attempts: 64, selectedAttempt: 63, selectedSeed: 0xffffffff }).selection.attempts, 64);
  assert.throws(() => createGenerationRecipeV1(normalizeRallyInputV1({ seed: 7 }), { attempts: 2, selectedAttempt: 1, selectedSeed: 8 }), /one attempt/);
});

test('all supported style and flavour identifiers normalize without adding them to saved players', () => {
  for (const style of RALLY_STYLE_IDS) for (const flavour of RALLY_FLAVOUR_IDS) {
    const value = clone(normalizeRallyInputV1({ seed: 7 }));
    for (const id of RALLY_PLAYER_IDS) Object.assign(value.players[id], { style, flavour });
    assert.equal(normalizeRallyInputV1(value).players.player4.style, style);
  }
  const document = model2Document({ generation: recipe() });
  const before = JSON.stringify(document); assert.equal(validateDocument(document), document);
  assert.equal(JSON.stringify(document), before);
  document.players.player1.style = 'advanced';
  assert.throws(() => validateDocument(document), /not supported/);
});

test('model2 ownership additions do not grant legacy documents or root origins blanket ownership', () => {
  const extraFields = ['intent', 'quality', 'narration', 'contactMode', 'contactTiming', 'physics', 'contactEvidence', 'contactOverride'];
  const modern = model2Document(); modern.shots[0].authoring = { ownership: 'automatic', fields: extraFields };
  assert.equal(validateDocument(modern), modern);
  for (const field of extraFields) {
    const legacy = createStarterDocument(); legacy.shots[0].authoring = { ownership: 'automatic', fields: [field] };
    assert.throws(() => validateDocument(legacy), /supported shot fields/);
  }
  modern.shots[0].authoring.fields = ['physics', 'physics']; assert.throws(() => validateDocument(modern), /duplicate/);
  modern.shots[0].authoring.fields = ['teleport']; assert.throws(() => validateDocument(modern), /supported shot fields/);
  const legacy = createStarterDocument(); legacy.generation = { originExtension: 'retained' };
  assert.equal(validateDocument(legacy), legacy);
});

test('imported engine provenance survives authored edits without regenerating or replacing them', () => {
  const document = model2Document({ generation: recipe() });
  document.title = 'Authored after generation'; document.shots[0].target.x = 8.25;
  document.shots[0].authoring = { ownership: 'authored', fields: ['target'] };
  const source = JSON.stringify(document), store = new DraftStore({ storage: memoryStorage(), validate: validateDocument });
  const imported = store.importJSON(source); store.save(imported);
  const restored = store.open(document.id);
  assert.deepEqual(restored, document); assert.equal(restored.shots[0].target.x, 8.25);
  assert.equal(JSON.stringify(store.importJSON(store.exportJSON(restored))), source);
});

function fullSource() {
  const shots = Array.from({ length: 99 }, (_, index) => {
    const hitter = index % 2 ? 'player3' : 'player1', near = hitter === 'player1';
    const item = model2Shot({ id: `bounded-${index}`, hitter, intent: 'around-the-post',
      narration: { label: 'Around the post', why: 'Return the wide ball around the outside of the post.' },
      target: { x: 7, y: near ? 30 : 14 }, contactMode: 'bounced', contactTiming: { afterBounceSeconds: .28 },
      contactOverride: { x: -1.5, y: near ? 18 : 26 }, physics: { apexFeet: 5 },
      contactEvidence: { feet: [{ x: -2, y: near ? 18 : 26 }, { x: -1.16, y: near ? 18 : 26 }], feetEstablishedOutsideNVZ: true },
      movement: { intent: 'manual', target: { x: 5, y: near ? 14 : 30 }, pinned: false },
      playerMovement: Object.fromEntries(RALLY_PLAYER_IDS.filter(id => id !== hitter).map((id, i) => [id, { intent: 'manual', target: { x: 5 + i * 5, y: ['player1', 'player2'].includes(id) ? 14 : 30 }, pinned: false }])),
      generation: { seed: index, generatorVersion: 'rally-engine-v1' } });
    item.authoring = { ownership: 'automatic', fields: MODEL2_AUTHORING_FIELDS.filter(field => Object.hasOwn(item, field)) };
    return item;
  });
  return model2Document({ id: '99-record-schema-fixture', title: 'Fully populated source bounds', generation: recipe(), shots });
}

test('99 fully populated source records fit unchanged JSON and import/export/storage limits', context => {
  // Structural fixture only: the engine's physically generated99-contact case
  // is validated separately. These records exercise every applicable field.
  const document = fullSource(), before = JSON.stringify(document);
  assert.ok(countValues(document) <= 10000, `values: ${countValues(document)}`);
  assert.equal(validateDocument(document), document);
  const store = new DraftStore({ storage: memoryStorage(), validate: validateDocument });
  const exported = store.exportJSON(document);
  assert.ok(new TextEncoder().encode(exported).length < MAX_JSON_BYTES);
  context.diagnostic(`99 source records: ${countValues(document)} JSON values; ${new TextEncoder().encode(exported).length} exported UTF-8 bytes.`);
  const imported = store.importJSON(exported); store.save(imported);
  assert.equal(store.open(document.id).shots.length, 99);
  assert.equal(JSON.stringify(store.open(document.id)), before);
  document.annotations = [Array(10001).fill(0)];
  assert.throws(() => validateDocument(document), /too many values/);
});
