import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessGeneratedFlightFeasibilityV1 } from '../rally-flight-audit.js';
import { generationFlightCeilingMphV1 } from '../rally-flight-planner.js';
import { solveFlightV2, PHYSICS_V2 } from '../play-physics-v2.js';
import { createGenerationRecipeV1, normalizeRallyInputV1 } from '../rally-recipe.js';
import { compileDocument } from '../play-compiler.js';
import { validateDocument } from '../play-document.js';
import { validateRallyRules } from '../rally-rules.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

const G = PHYSICS_V2.gravityFeetPerSecond2, R = PHYSICS_V2.ballRadiusFeet;
const rounded = value => JSON.parse(JSON.stringify(value, (key, v) => typeof v === 'number' ? Number(v.toFixed(9)) : v));
const origin = () => createGenerationRecipeV1(normalizeRallyInputV1({ seed: 7 }));
function specimen({ family = 'drive', intent = null, quality = 'neutral', style = 'advanced', speedMph = 28, direction = 1, vy = 10, height = 2.2 } = {}) {
  const time = (vy + Math.sqrt(vy * vy + 2 * G * (height - R))) / G;
  const horizontal = Math.sqrt((speedMph * (22 / 15)) ** 2 - vy * vy);
  const from = { x: 7, y: direction > 0 ? 14 : 30, heightFeet: height };
  const spec = rounded({ from, family, target: { x: 7, y: from.y + direction * horizontal * time }, physics: { launchVerticalFeetPerSecond: vy }, quality });
  const document = model2Document({ generation: structuredClone(origin()), shots: [model2Shot({ family, intent, quality, target: spec.target, physics: spec.physics })] });
  document.generation.input.players.player1.style = style;
  const solved = solveFlightV2(spec);
  const compiled = { validShotCount: 1, findings: [], timeline: { segments: [{ shotSemantics: { contact: { point: spec.from } }, trajectory: { solved } }] } };
  return { document, compiled };
}

for (const direction of [1, -1]) for (const family of ['serve', 'return', 'drive', 'dink', 'reset', 'drop', 'lob', 'volley', 'overhead']) {
  test(`independent rounded ${family} launch envelope direction ${direction}`, () => {
    for (const quality of ['neutral', 'excellent', 'low', 'attackable', 'error']) {
      const ceiling = generationFlightCeilingMphV1({ family, quality });
      const vy = family === 'lob' ? 29 : family === 'overhead' ? -5 : 10;
      const height = family === 'overhead' ? 8 : 2.2;
      const good = specimen({ family, direction, quality, vy, height, speedMph: ceiling - 1e-4 });
      const before = JSON.stringify(good.document), audit = assessGeneratedFlightFeasibilityV1(good);
      assert.equal(audit.status, 'PASS', JSON.stringify(audit));
      assert.equal(audit.checkedFlights, 1); assert.equal(JSON.stringify(good.document), before);
      assert.ok(Math.abs(audit.flights[0].launchSpeedMph - (ceiling - 1e-4)) < 1e-6);
      const bad = assessGeneratedFlightFeasibilityV1(specimen({ family, direction, quality, vy, height, speedMph: ceiling + 1e-4 }));
      assert.equal(bad.status, 'FAIL');
      assert.ok(bad.violations.some(item => item.code === 'launch-speed-above-envelope'));
    }
  });
}

test('rounded speed tolerance uses stage derivatives despite fabricated acceptance and speed metadata', () => {
  for (const direction of [1, -1]) for (const [delta, expected] of [[.5e-6, 'PASS'], [2e-6, 'FAIL']]) {
    const sample = specimen({ direction, speedMph: 38 + delta });
    const solved = sample.compiled.timeline.segments[0].trajectory.solved;
    sample.compiled.timeline.segments[0].trajectory.solved = { ...solved,
      launchSpeedMph: 1, accepted: true, metadata: { speedMph: 1, launchSpeedMph: 1 }, diagnostics: { accepted: true, speedMph: 1 } };
    const audit = assessGeneratedFlightFeasibilityV1(sample);
    assert.equal(audit.status, expected, JSON.stringify(audit));
    assert.ok(audit.flights[0].launchSpeedMph > 38);
  }
});

test('family shapes and error pace floors are explicit measured contracts', () => {
  assert.equal(assessGeneratedFlightFeasibilityV1(specimen({ family: 'volley', speedMph: 15 })).status, 'PASS');
  for (const family of ['drive', 'overhead']) {
    const data = { family, height: family === 'overhead' ? 8 : 2.2, vy: family === 'overhead' ? -5 : 10, speedMph: 20 };
    assert.ok(assessGeneratedFlightFeasibilityV1(specimen(data)).violations.some(item => item.code === 'launch-speed-below-fast-floor'));
    assert.equal(assessGeneratedFlightFeasibilityV1(specimen({ ...data, quality: 'error' })).status, 'PASS');
  }
  for (const intent of ['speed-up', 'counter', 'firm-volley', 'put-away']) {
    assert.ok(assessGeneratedFlightFeasibilityV1(specimen({ family: 'volley', intent, speedMph: 20 })).violations.some(item => item.code === 'launch-speed-below-fast-floor'));
  }
  assert.ok(assessGeneratedFlightFeasibilityV1(specimen({ family: 'lob', speedMph: 20, vy: 10 })).violations.some(item => item.code === 'apex-outside-envelope'));
  assert.ok(assessGeneratedFlightFeasibilityV1(specimen({ family: 'overhead', height: 8, speedMph: 30, vy: 1 })).violations.some(item => item.code === 'overhead-launch-upward'));
  assert.equal(assessGeneratedFlightFeasibilityV1(specimen({ family: 'overhead', height: 8, speedMph: 30, vy: 0 })).status, 'PASS');
});

test('manual, absent and incompletely compiled source never becomes a generated feasibility PASS', () => {
  assert.equal(assessGeneratedFlightFeasibilityV1().status, 'NOT_EVALUATED');
  assert.equal(assessGeneratedFlightFeasibilityV1({ document: model2Document() }).status, 'NOT_APPLICABLE');
  const sample = specimen(); sample.compiled.validShotCount = 0;
  assert.equal(assessGeneratedFlightFeasibilityV1(sample).status, 'NOT_EVALUATED');
});

const archived = JSON.parse(readFileSync(new URL('./fixtures/flight-audit-legacy.json', import.meta.url))).fixtures;
for (const [index, fixture] of archived.entries()) test(`old public archive ${fixture.jobId} remains valid with separate feasibility analysis`, () => {
  const document = fixture.document, before = JSON.stringify(document);
  assert.equal(document.generation.policyVersion, 'rally-policy-v1');
  assert.equal(Object.hasOwn(document.generation, 'flightPlannerVersion'), false);
  assert.equal(validateDocument(document), document);
  const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, document.shots.length, JSON.stringify(compiled.findings)); assert.equal(rules.valid, true);
  const audit = assessGeneratedFlightFeasibilityV1({ document, compiled });
  const flight = audit.flights.find(item => item.shotId === (index < 2 ? 'shot-6' : 'shot-12'));
  const expected = [182.47977030152865, 91.14800830336232, 49.76620213634538][index];
  assert.ok(Math.abs(flight.launchSpeedMph - expected) < 1e-6, JSON.stringify(flight));
  if (index < 2) {
    assert.equal(audit.status, 'FAIL');
    assert.ok(audit.violations.some(item => item.shotId === 'shot-6' && item.code === 'launch-speed-above-envelope'));
  } else {
    assert.equal(flight.quality, 'error'); assert.equal(flight.maximumSpeedMph, 50); assert.equal(flight.status, 'PASS');
  }
  assert.equal(JSON.stringify(document), before);
});

test('provenance style selects its real cap and genuine net errors remain faults without clamping', () => {
  for (const [style, quality, speedMph, status, ceiling] of [
    ['pro', 'neutral', 44, 'PASS', 45], ['advanced', 'neutral', 44, 'FAIL', 38],
    ['pro', 'error', 49.9, 'PASS', 50], ['advanced', 'error', 49.9, 'FAIL', 47.5],
  ]) {
    const audit = assessGeneratedFlightFeasibilityV1(specimen({ style, quality, speedMph }));
    assert.equal(audit.status, status); assert.equal(audit.flights[0].maximumSpeedMph, ceiling);
  }
  const source = specimen({ family: 'dink', quality: 'error', vy: 0, speedMph: 24 });
  const before = JSON.stringify(source.document);
  assert.equal(source.compiled.timeline.segments[0].trajectory.solved.obstruction.kind, 'net');
  const audit = assessGeneratedFlightFeasibilityV1(source);
  assert.equal(audit.status, 'PASS'); assert.equal(audit.flights[0].obstruction, 'net');
  assert.equal(JSON.stringify(source.document), before);
});


test('a sampled low lob net error retains its actual loft failure under the error maximum', () => {
  const source = specimen({ family: 'lob', quality: 'error', vy: 0, speedMph: 24 });
  const solved = source.compiled.timeline.segments[0].trajectory.solved;
  const sourceBytes = JSON.stringify(source.document);
  const stages = JSON.stringify(solved.stages);
  assert.equal(solved.obstruction.kind, 'net');
  const audit = assessGeneratedFlightFeasibilityV1(source);
  assert.equal(audit.status, 'PASS');
  assert.equal(audit.flights[0].obstruction, 'net');
  assert.equal(audit.flights[0].minimumApexFeet, solved.from.heightFeet);
  assert.equal(audit.flights[0].apexFeet, 2.2);
  assert.equal(audit.flights[0].maximumSpeedMph, 35);
  assert.ok(Math.abs(audit.flights[0].launchSpeedMph - 24) < 1e-6);
  assert.equal(JSON.stringify(source.document), sourceBytes);
  assert.equal(JSON.stringify(solved.stages), stages);
  const nonError = structuredClone(source.document); nonError.shots[0].quality = 'low';
  const failed = assessGeneratedFlightFeasibilityV1({ document: nonError, compiled: source.compiled });
  assert.equal(failed.status, 'FAIL');
  assert.ok(failed.violations.some(item => item.code === 'apex-outside-envelope'));
});

test('a serialized low lob net error crosses public replay and the independent audit unchanged', () => {
  const document = JSON.parse(readFileSync(new URL('./fixtures/model2/net.json', import.meta.url)));
  document.generation = structuredClone(origin());
  document.shots[0].family = 'lob'; document.shots[0].intent = 'lob';
  const before = JSON.stringify(document), sourcePhysics = JSON.stringify(document.shots[0].physics);
  validateDocument(document);
  const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, 1, JSON.stringify(compiled.findings));
  assert.equal(rules.valid, true); assert.equal(document.outcome.reason, 'net');
  const audit = assessGeneratedFlightFeasibilityV1({ document, compiled });
  assert.equal(audit.status, 'PASS'); assert.equal(audit.flights[0].obstruction, 'net');
  assert.equal(audit.flights[0].apexFeet, 2.25);
  assert.equal(audit.flights[0].maximumSpeedMph, 35);
  assert.equal(audit.flights[0].minimumApexFeet, 2.2);
  assert.ok(Math.abs(audit.flights[0].launchSpeedMph - 29.280703168172284) < 1e-6);
  assert.equal(JSON.stringify(document), before);
  assert.equal(JSON.stringify(document.shots[0].physics), sourcePhysics);
});

test('v2 audit rejects measured high arcs while explicit v1 replay keeps its historical shape envelope', () => {
  for (const direction of [1, -1]) for (const [family, apex, speedMph, maximumApexFeet] of [['dink', 13, 20, 5.2], ['drive', 16.7, 28, 6], ['return', 30, 30, 9]]) {
    const source = specimen({ family, direction, speedMph, vy: Math.sqrt(2 * G * (apex - 2.2)) });
    source.document.generation.flightPlannerVersion = 'rally-flight-planner-v2';
    const solved = source.compiled.timeline.segments[0].trajectory.solved;
    source.compiled.timeline.segments[0].trajectory.solved = { ...solved, metadata: { ...solved.metadata, apexFeet: 1 } };
    const audit = assessGeneratedFlightFeasibilityV1(source);
    assert.equal(audit.status, 'FAIL');
    const violation = audit.violations.find(v => v.code === 'apex-outside-envelope');
    assert.ok(violation, JSON.stringify(audit)); assert.equal(violation.maximumApexFeet, maximumApexFeet);
    source.document.generation.flightPlannerVersion = 'rally-flight-planner-v1';
    const before = JSON.stringify(source.document);
    assert.equal(assessGeneratedFlightFeasibilityV1(source).status, 'PASS');
    assert.equal(JSON.stringify(source.document), before);
    source.document.generation.flightPlannerVersion = 'rally-flight-planner-v2';
    source.document.shots[0].quality = 'error';
    assert.equal(assessGeneratedFlightFeasibilityV1(source).status, 'PASS');
  }
  for (const direction of [1, -1]) {
    const high = specimen({ family: 'dink', height: 12, vy: 0, speedMph: 15, direction });
    high.document.generation.flightPlannerVersion = 'rally-flight-planner-v2';
    const audit = assessGeneratedFlightFeasibilityV1(high);
    assert.equal(audit.status, 'PASS'); assert.equal(audit.flights[0].maximumApexFeet, 12);
  }
});
