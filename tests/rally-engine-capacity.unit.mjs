import test from 'node:test';
import assert from 'node:assert/strict';
import { runNaturalAttemptV1 } from '../rally-engine.js';
import { normalizeRallyInputV1 } from '../rally-recipe.js';
import { createRallyRandomV1 } from '../rally-random.js';
import { validateDocument, MAX_SHOTS } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { samplePlayState } from '../three-d-core.js';
import { fieldOwnership } from '../rally-proposals.js';
import { DraftStore, EditHistory, MAX_JSON_BYTES, STORAGE_KEY } from '../builder-storage.js';

const clone = value => structuredClone(value);
const byteLength = text => new TextEncoder().encode(text).byteLength;
const IDS = ['player1', 'player2', 'player3', 'player4'];

function jsonBounds(value, depth = 0, budget = { values: 0, depth: 0 }) {
  budget.values++;
  budget.depth = Math.max(budget.depth, depth);
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) jsonBounds(child, depth + 1, budget);
  }
  return budget;
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

// Controlled capacity seam, NOT a sample of natural rally lengths/calibration.
// The real policy/planner runs unchanged. Intent .65 selects deep-middle
// serve/return, a third drop and transition resets, then middle dinks. Target
// .5 keeps nominal targets centered and execution .999 gives neutral quality.
// Consume every underlying seed-0 draw for stream accounting; narration uses
// its original value. No failing route is retried under another seed.
// Exercise final acceptance independently below: this lower-level producer
// deliberately bypasses the driver's ordinary random-stream construction.
// Saved generation metadata retains origin only: this controlled fixture does
// NOT claim production recipe reproduction from its seed or natural calibration.
const CAPACITY_CONTROLLER = Object.freeze({ intent: .65, target: .5, execution: .999 });
let capacityPromise;
function controlledCapacityFixture() {
  capacityPromise ??= (async () => {
    const input = normalizeRallyInputV1({ seed: 0, options: { maxShots: 99 } });
    const before = JSON.stringify(input), seeded = createRallyRandomV1(0);
    let executionDraws = 0, work = 0;
    const controlledDraw = stream => () => {
      seeded[stream]();
      if (stream === 'execution') executionDraws++;
      return CAPACITY_CONTROLLER[stream];
    };
    const result = await runNaturalAttemptV1(input, {
      attemptIndex: 0,
      attemptSeed: 0,
      random: { ...seeded, intent: controlledDraw('intent'), target: controlledDraw('target'), execution: controlledDraw('execution') },
      checkpoint: async event => { work += event.workDelta ?? 0; }
    });
    assert.equal(JSON.stringify(input), before, 'the attempt must preserve its normalized input');
    return { result, input, executionDraws, work, seededDraws: seeded.snapshot().draws };
  })();
  return capacityPromise;
}

test('controlled capacity seam constructs 99 physical contacts and censors without a winner', async () => {
  const { result, input, executionDraws, work, seededDraws } = await controlledCapacityFixture();
  assert.equal(result.status, 'censored', JSON.stringify(result.diagnostics));
  assert.equal(result.document.shots.length, MAX_SHOTS);
  assert.equal(result.decisions.length, MAX_SHOTS);
  assert.equal(result.stats.shots, MAX_SHOTS);
  assert.equal(result.document.ending, 'stop');
  assert.equal(Object.hasOwn(result.document, 'outcome'), false);
  assert.equal(result.outcome, null);
  assert.equal(result.outcomeClassification, null);
  assert.equal(executionDraws, MAX_SHOTS * 2);
  assert.equal(seededDraws.execution, executionDraws, 'the explicit controller consumes every underlying execution draw');
  assert.equal(seededDraws.intent, MAX_SHOTS);
  assert.equal(seededDraws.target, MAX_SHOTS * 4);
  assert.equal(seededDraws.narration, MAX_SHOTS);
  for (const stream of ['intent', 'target', 'narration']) assert.ok(seededDraws[stream] > 0);
  assert.ok(work > MAX_SHOTS && work <= 65536, `bounded attempt work: ${work}`);
  assert.deepEqual(result.diagnostics.failures, []);
  assert.deepEqual(result.document.generation.input, {
    players: input.players, layout: input.layout, service: input.service, options: input.options
  });
  assert.deepEqual(result.document.generation.selection, { attempts: 1, selectedAttempt: 0, selectedSeed: 0 });
  for (let index = 0; index < MAX_SHOTS; index++) {
    const shot = result.document.shots[index], decision = result.decisions[index];
    assert.equal(shot.id, `shot-${index + 1}`);
    assert.equal(decision.shotId, shot.id);
    assert.deepEqual(decision.draws.execution, { quality: .999, error: .999 });
    assert.notEqual(decision.execution.quality, 'error');
    assert.equal(decision.execution.quality, 'neutral');
    assert.equal(decision.draws.intent, CAPACITY_CONTROLLER.intent);
    assert.deepEqual(decision.draws.target, { lateral: .5, depth: .5 });
    assert.deepEqual(decision.draws.perturbation, { lateral: .5, depth: .5 });
    // Clearer incoming stances now put the controlled pair at the line by the
    // fifth contact; the same soft-middle controller then selects a dink.
    const opening = ['serve-deep-middle', 'return-deep-middle', 'third-shot-drop', 'reset'];
    assert.equal(decision.chosen.id, opening[index] ?? 'middle-dink', 'the capacity controller must keep its explicit soft-middle semantics');
    assert.deepEqual(shot.generation, { seed: 0, generatorVersion: 'rally-engine-v1' });
  }
});

test('all 99 controlled contacts pass independent source, compiler, rule, peak-speed and spacing checks', async () => {
  const { result } = await controlledCapacityFixture(), document = result.document;
  assert.ok(document, JSON.stringify(result.diagnostics));
  const before = JSON.stringify(document);
  assert.equal(validateDocument(document), document);
  const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, MAX_SHOTS, JSON.stringify(compiled.findings));
  assert.deepEqual(compiled.findings.filter(finding => finding.severity === 'error'), []);
  assert.equal(rules.valid, true, JSON.stringify(rules.violations));
  assert.deepEqual(rules.violations, []);
  assert.deepEqual(rules.expectedOutcomes, []);
  assert.equal(compiled.timeline.outcome, null);
  assert.equal(compiled.timeline.events.some(event => ['dead', 'fault'].includes(event.type)), false);
  const contacts = compiled.timeline.events.filter(event => event.type === 'contact');
  assert.equal(contacts.length, MAX_SHOTS);
  assert.equal(contacts.at(-1).rallyLeg, MAX_SHOTS, 'the complete last contact must survive compilation');
  assert.ok(compiled.timeline.duration > contacts.at(-1).time, 'the last represented leg must play after contact');
  const movement = inspectGeneratedMovementV1(compiled.timeline);
  assert.equal(movement.valid, true, JSON.stringify(movement));
  assert.ok(movement.maxPeakFeetPerSecond <= 18 + 1e-6, JSON.stringify(movement));
  const spacing = inspectGeneratedSpacingV1(compiled.timeline);
  assert.equal(spacing.valid, true, JSON.stringify(spacing));
  assert.ok(spacing.minimumSeparationFeet >= 2.5 - 1e-6, JSON.stringify(spacing));
  const end = samplePlayState(compiled.timeline, compiled.timeline.duration);
  assert.equal(end.stepIndex, MAX_SHOTS);
  for (const actor of IDS) for (const axis of ['x', 'y']) assert.ok(Number.isFinite(end.positions[actor][axis]));
  for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(end.ball[axis]));
  assert.equal(JSON.stringify(document), before, 'public validation and sampling must not rewrite source');
});

test('physical 99-contact source fits unchanged JSON/import/export/save bounds and restores all provenance', async context => {
  const { result } = await controlledCapacityFixture(), document = result.document;
  assert.ok(document, JSON.stringify(result.diagnostics));
  const source = JSON.stringify(document), bounds = jsonBounds(document);
  assert.ok(bounds.values <= 10000, `source values: ${bounds.values}`);
  assert.ok(bounds.depth <= 12, `source depth: ${bounds.depth}`);
  assert.ok(byteLength(source) <= MAX_JSON_BYTES);
  // Decisions/pressure/draw history belongs to analysis, outside saved source.
  for (const key of ['decisions', 'stats', 'diagnostics', 'outcomeClassification']) assert.equal(Object.hasOwn(document, key), false);
  const storage = memoryStorage(), store = new DraftStore({ storage, validate: validateDocument });
  const exported = store.exportJSON(document);
  assert.ok(byteLength(exported) <= MAX_JSON_BYTES);
  const imported = store.importJSON(exported);
  assert.deepEqual(imported, document);
  assert.deepEqual(store.save(imported), document);
  const restored = new DraftStore({ storage, validate: validateDocument });
  assert.deepEqual(restored.loadLast(), document);
  assert.deepEqual(restored.open(document.id), document);
  assert.deepEqual(restored.list(), [{ id: document.id, title: document.title }]);
  assert.equal(JSON.stringify(restored.importJSON(restored.exportJSON(restored.open(document.id)))), source);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).drafts[0].shots.length, MAX_SHOTS);
  assert.equal(JSON.stringify(document), source);
  context.diagnostic(`Controlled neutral soft-middle capacity seam; seed-0 stream accounting only, not natural calibration or production recipe reproduction: ${bounds.values} values; ${byteLength(source)} compact bytes; ${byteLength(exported)} exported bytes.`);
});

test('authored edits and Undo retain the physical 99-contact point and its origin across save/import', async () => {
  const { result } = await controlledCapacityFixture(), original = result.document;
  assert.ok(original, JSON.stringify(result.diagnostics));
  const provenance = clone(original.generation), history = new EditHistory(original);
  const edited = history.current;
  edited.title = 'Authored after the controlled capacity fixture';
  edited.shots.at(-1).narration = { label: 'My final contact', why: 'My authored explanation remains after saving and importing.' };
  // The builder claims edited top-level fields by removing automatic ownership.
  edited.shots.at(-1).authoring.fields = edited.shots.at(-1).authoring.fields.filter(field => field !== 'narration');
  assert.equal(fieldOwnership(edited, 'shots[98].narration'), 'authored');
  assert.equal(fieldOwnership(edited, 'shots[98].target'), 'automatic');
  assert.equal(validateDocument(edited), edited);
  history.commit(edited);
  assert.equal(history.canUndo, true);
  const storage = memoryStorage(), store = new DraftStore({ storage, validate: validateDocument });
  store.save(history.current);
  const restored = new DraftStore({ storage, validate: validateDocument }).loadLast();
  assert.deepEqual(restored, edited);
  assert.deepEqual(restored.generation, provenance);
  assert.deepEqual(store.importJSON(store.exportJSON(restored)), edited);
  const compiled = compileDocument(restored), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, MAX_SHOTS);
  assert.deepEqual(compiled.findings.filter(finding => finding.severity === 'error'), []);
  assert.equal(rules.valid, true, JSON.stringify(rules.violations));
  assert.deepEqual(rules.expectedOutcomes, []);
  const undone = history.undo();
  assert.deepEqual(undone, original, 'Undo must restore exact source, ownership and provenance');
  store.save(undone);
  assert.deepEqual(new DraftStore({ storage, validate: validateDocument }).loadLast(), original);
  const redone = history.redo();
  assert.deepEqual(redone, edited);
  assert.deepEqual(redone.generation, provenance);
  assert.equal(fieldOwnership(redone, 'shots[98].narration'), 'authored');
  assert.deepEqual(original.generation, provenance, 'history must not mutate the source fixture');
});
