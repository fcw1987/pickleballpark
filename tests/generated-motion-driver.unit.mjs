import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATION_MOTION_V1 } from '../generated-motion-limits.js';
import { createEngineDriverV1 } from '../rally-engine-driver.js';
import { inspectGeneratedMovementV1 } from '../rally-movement.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { MODEL2_AUTHORING_FIELDS } from '../play-document.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

const options = { maxAccelerationFeetPerSecondSquared: GENERATION_MOTION_V1.accelerationFeetPerSecondSquared };
function fixture(plantDistance, mirrored = false, hand = 'right') {
  const document = model2Document({ ending: 'stop', shots: [model2Shot({
    contactEvidence: { feet: [{x: 7 + plantDistance - .42, y: 14}, {x: 7 + plantDistance + .42, y: 14}], feetEstablishedOutsideNVZ: true },
  })] });
  document.initialLayout.player3 = {x: 15, y: 30};
  document.initialLayout.player4 = {x: 18, y: 30};
  if (mirrored) {
    const ids = {player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2'};
    const rotate = point => ({...point, x: 20 - point.x, y: 44 - point.y});
    document.initialLayout = Object.fromEntries(Object.entries(document.initialLayout).map(([id, point]) => [ids[id] ?? id, rotate(point)]));
    for (const shot of document.shots) {
      shot.hitter = ids[shot.hitter]; shot.target = rotate(shot.target);
      shot.contactEvidence.feet = shot.contactEvidence.feet.map(rotate);
    }
  }
  for (const player of Object.values(document.players)) player.handedness = hand;
  const shot = document.shots[0];
  shot.generation = {seed: 7, generatorVersion: 'rally-engine-v1'};
  shot.authoring = {ownership: 'automatic', fields: MODEL2_AUTHORING_FIELDS.filter(field => Object.hasOwn(shot, field))};
  return {status: 'censored', document, outcome: null, outcomeClassification: null,
    decisions: [{shotId: shot.id}], stats: {shots: 1},
    // A producer-provided audit is never evidence for final acceptance.
    diagnostics: {validation: {movement: {valid: true, maxPeakFeetPerSecond: 0, maxAccelerationFeetPerSecondSquared: 0}}}};
}

for (const mirrored of [false, true]) for (const hand of ['left', 'right']) {
  test(`driver rejects a speed-safe but excessive initial plant acceleration without repairing source (${mirrored}/${hand})`, async () => {
    const provisional = fixture(1, mirrored, hand), before = JSON.stringify(provisional);
    const compiled = compileDocument(provisional.document), segment = compiled.timeline.segments[0];
    assert.equal(compiled.validShotCount, 1); assert.deepEqual(compiled.findings, []);
    assert.equal(validateRallyRules(compiled.play, compiled.timeline).valid, true);
    const historical = inspectGeneratedMovementV1(compiled.timeline);
    assert.equal(historical.valid, true); assert.ok(historical.maxPeakFeetPerSecond < 6);
    assert.equal(Object.hasOwn(historical, 'maxAccelerationFeetPerSecondSquared'), false, 'default historical inspection stays speed-only');
    assert.ok(4 / segment.contactTime ** 2 > 30, 'the actual one-foot plant takes only the represented contact lead-in');
    const independent = inspectGeneratedMovementV1(compiled.timeline, options);
    assert.equal(independent.valid, false);
    assert.ok(independent.maxAccelerationFeetPerSecondSquared > 30);
    assert.equal(independent.boundAccelerationFeetPerSecondSquared, 30);
    let attempts = 0;
    const result = await createEngineDriverV1(async () => { attempts++; return provisional; }, {yieldControl: async () => {}})({seed: 7, options: {maxShots: 1}});
    assert.equal(result.status, 'failed'); assert.equal(attempts, 1);
    assert.equal(result.diagnostics.code, 'generated-movement', JSON.stringify(result.diagnostics));
    assert.equal(result.diagnostics.validation.movement.valid, false);
    assert.ok(result.diagnostics.validation.movement.maxAccelerationFeetPerSecondSquared > 30);
    assert.equal(result.diagnostics.validation.movement.boundAccelerationFeetPerSecondSquared, 30);
    assert.equal(result.document, null); assert.equal(result.outcome, null);
    assert.equal(JSON.stringify(provisional), before);
  });
}

test('driver publishes a recomputed acceleration audit for a supported generated route', async () => {
  const provisional = fixture(.25), before = JSON.stringify(provisional);
  const result = await createEngineDriverV1(async () => provisional, {yieldControl: async () => {}})({seed: 7, options: {maxShots: 1}});
  assert.equal(result.status, 'censored', JSON.stringify(result.diagnostics));
  const movement = result.diagnostics.validation.movement;
  assert.equal(movement.valid, true); assert.equal(movement.boundAccelerationFeetPerSecondSquared, 30);
  assert.ok(movement.maxAccelerationFeetPerSecondSquared > 0 && movement.maxAccelerationFeetPerSecondSquared <= 30);
  assert.deepEqual(movement, inspectGeneratedMovementV1(compileDocument(result.document).timeline, options));
  assert.equal(JSON.stringify(provisional), before);
});
