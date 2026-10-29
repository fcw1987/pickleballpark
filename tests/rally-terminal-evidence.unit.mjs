import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { createEngineDriverV1 } from '../rally-engine-driver.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { DraftStore, MAX_JSON_BYTES } from '../builder-storage.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/model2/off-apron-unreachable.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} versus ${expected}`);
const ids = { player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' };
const teams = { green: 'orange', orange: 'green' };
function mirror(value) {
  if (Array.isArray(value)) return value.map(mirror);
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [ids[key] ?? key, mirror(item)]));
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
      result.x = 20 - value.x; result.y = 44 - value.y;
    }
    return result;
  }
  return ids[value] ?? teams[value] ?? value;
}
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
// Replay only saved physical source through the public final-validation gate.
// This test producer neither regenerates policy decisions nor changes a flight.
async function publicReplay(document) {
  const driver = createEngineDriverV1(async () => ({ status: 'complete', document: clone(document),
    outcome: clone(document.outcome), decisions: document.shots.map(shot => ({ shotId: shot.id })),
    stats: null, outcomeClassification: null, diagnostics: { rejections: 0 } }), { yieldControl: async () => {} });
  return driver({ seed: document.generation.seed, ...clone(document.generation.input) });
}

for (const mirrored of [false, true]) test(`off-apron solved terminal evidence passes complete public validation${mirrored ? ' after 180-degree rotation and player/team swap' : ''}`, async () => {
  const document = mirrored ? mirror(fixture()) : fixture(), before = JSON.stringify(document);
  assert.equal(validateDocument(document), document);
  const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, document.shots.length);
  assert.equal(compiled.validShotCount, 11);
  assert.deepEqual(compiled.findings, []);
  assert.equal(rules.valid, true); assert.deepEqual(rules.violations, []);
  assert.equal(rules.expectedOutcomes.length, 1);
  const expected = rules.expectedOutcomes[0], evidence = document.outcome.evidence;
  assert.equal(expected.reason, 'unreachable'); assert.equal(expected.winner, mirrored ? 'green' : 'orange');
  assert.equal(expected.faultingActor, null); assert.equal(expected.shotId, 'shot-11');
  for (const axis of ['x', 'y', 'heightFeet']) close(expected.position[axis], evidence.position[axis]);
  close(expected.afterContactSeconds, evidence.afterContactSeconds);
  close(evidence.position.y, mirrored ? 74.646674254 : -30.646674254);
  const final = compiled.timeline.segments.at(-1), flight = final.trajectory.solved;
  assert.ok(flight.landing.x >= 0 && flight.landing.x <= 20 && flight.landing.y >= 0 && flight.landing.y <= 44);
  assert.ok(evidence.afterContactSeconds > flight.firstLandingTime, 'terminal evidence is the second bounce, not the legal first landing');
  close(flight.launchSpeedMph, 46.71568813663946);
  // The preserved 46.72 mph speed-up is a separate calibration/guidance issue;
  // terminal serialization must neither clamp nor relabel the physical flight.
  assert.equal(document.shots.at(-1).intent, 'speed-up');
  assert.equal(inspectGeneratedMovementV1(compiled.timeline).valid, true);
  assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
  assert.equal(compiled.timeline.events.filter(event => event.type === 'dead').length, 1);
  assert.equal(compiled.timeline.events.some(event => event.type === 'body'), false, 'no earlier collision is hidden by terminal evidence');
  const replay = await publicReplay(document);
  assert.equal(replay.status, 'complete', JSON.stringify(replay.diagnostics));
  assert.deepEqual(replay.outcome, document.outcome);
  assert.deepEqual(replay.document, document);
  assert.equal(replay.diagnostics.validation.unexpectedViolations, 0);
  assert.equal(JSON.stringify(document), before);
});

test('off-apron regression preserves the exact archived SavedDocument rather than editing its outcome', () => {
  const source = JSON.stringify(fixture());
  assert.equal(createHash('sha256').update(source).digest('hex'), '0412b396c20099da3cae22ca17a7f1bba58fe46a6daec764cbde7d361427651a');
});

test('structurally valid tampered terminal position or time fails independent solved validation and public acceptance', async () => {
  for (const mutate of [
    value => { value.outcome.evidence.position.x += .5; },
    value => { value.outcome.evidence.position.y += .5; },
    value => { value.outcome.evidence.position.heightFeet += .5; },
    value => { value.outcome.evidence.afterContactSeconds += .05; }
  ]) {
    const value = fixture(); mutate(value);
    assert.equal(validateDocument(value), value, 'schema shape alone cannot establish terminal truth');
    const compiled = compileDocument(value), rules = validateRallyRules(compiled.play, compiled.timeline);
    assert.ok(compiled.findings.some(item => item.severity === 'error'));
    assert.ok(compiled.validShotCount < value.shots.length);
    assert.equal(rules.valid, false);
    const result = await publicReplay(value);
    assert.equal(result.status, 'failed'); assert.equal(result.document, null);
    assert.equal(result.diagnostics.code, 'final-validation');
  }
});

test('terminal evidence coordinates never expand contacts, feet, targets, movement or layout beyond the existing apron', () => {
  const position = fixture().outcome.evidence.position, xy = { x: position.x, y: position.y };
  for (const mutate of [
    value => { value.shots.at(-1).intent = 'erne'; value.shots.at(-1).contactOverride = clone(xy); },
    value => { value.shots.at(-1).contactEvidence.feet[0] = clone(xy); },
    value => { value.shots.at(-1).target = clone(xy); },
    value => { value.shots.at(-1).movement.target = clone(xy); },
    value => { value.initialLayout.ball = clone(xy); },
    value => { value.initialLayout.player1 = clone(xy); }
  ]) {
    const value = fixture(); mutate(value);
    assert.throws(() => validateDocument(value), /apron/);
  }
});

test('terminal-only arithmetic guards reject nonfinite numbers, extra or missing keys, invalid height/time and coordinates beyond 200000', () => {
  for (const axis of ['x', 'y']) for (const number of [-200000.001, 200000.001, NaN, Infinity, -Infinity]) {
    const value = fixture(); value.outcome.evidence.position[axis] = number;
    assert.throws(() => validateDocument(value), /finite|200000/);
  }
  for (const key of ['x', 'y', 'heightFeet']) {
    const value = fixture(); delete value.outcome.evidence.position[key];
    assert.throws(() => validateDocument(value), new RegExp(key));
  }
  for (const number of [-.001, 30.001, NaN, Infinity]) for (const field of ['heightFeet', 'afterContactSeconds']) {
    const value = fixture();
    if (field === 'heightFeet') value.outcome.evidence.position[field] = number;
    else value.outcome.evidence[field] = number;
    assert.throws(() => validateDocument(value), /finite|30/);
  }
  for (const mutate of [
    value => { value.outcome.evidence.position.extra = 1; },
    value => { value.outcome.evidence.extra = 1; }
  ]) {
    const value = fixture(); mutate(value); assert.throws(() => validateDocument(value), /not supported/);
  }
  for (const axis of ['x', 'y']) for (const bound of [-200000, 200000]) {
    const value = fixture(); value.outcome.evidence.position[axis] = bound;
    assert.equal(validateDocument(value), value, 'the terminal arithmetic bound is inclusive; independent solved validation remains separate');
  }
});

test('off-apron source round-trips through unchanged bounded import/save while malformed or oversized imports retain saved work', () => {
  const value = fixture(), storage = memoryStorage(), store = new DraftStore({ storage, validate: validateDocument });
  const exported = store.exportJSON(value);
  assert.deepEqual(store.importJSON(exported), value); store.save(value);
  assert.deepEqual(new DraftStore({ storage, validate: validateDocument }).loadLast(), value);
  const invalid = clone(value); invalid.outcome.evidence.position.y = -200000.001;
  const extra = clone(value); extra.outcome.evidence.position.extra = true;
  const nonfinite = JSON.stringify(value).replace('"heightFeet":0.121391076', '"heightFeet":1e309');
  assert.ok(nonfinite.includes('1e309'));
  for (const text of [JSON.stringify(invalid), JSON.stringify(extra), nonfinite, exported + ' '.repeat(MAX_JSON_BYTES)]) {
    assert.throws(() => store.importJSON(text), /finite|200000|supported|512 KiB/);
    assert.deepEqual(store.loadLast(), value);
  }
});

test('existing first-landing out and earlier-body outcomes retain their original physical event and evidence', () => {
  for (const id of ['long', 'wide', 'body']) {
    const value = readModel2Fixture(id), before = JSON.stringify(value), compiled = compileDocument(value);
    const rules = validateRallyRules(compiled.play, compiled.timeline), expected = rules.expectedOutcomes[0];
    assert.equal(validateDocument(value), value);
    assert.equal(rules.valid, true); assert.deepEqual(rules.violations, []);
    assert.equal(expected.reason, id); assert.equal(expected.winner, value.outcome.winner);
    for (const axis of ['x', 'y', 'heightFeet']) close(expected.position[axis], value.outcome.evidence.position[axis]);
    close(expected.afterContactSeconds, value.outcome.evidence.afterContactSeconds);
    const segment = compiled.timeline.segments.find(item => item.step.id === expected.shotId);
    if (id === 'body') assert.ok(expected.afterContactSeconds < segment.trajectory.solved.firstLandingTime);
    else close(expected.afterContactSeconds, segment.trajectory.solved.firstLandingTime);
    assert.equal(JSON.stringify(value), before);
  }
});
