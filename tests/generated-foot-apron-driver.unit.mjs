import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateRally } from '../rally-engine.js';
import { createEngineDriverV1 } from '../rally-engine-driver.js';
import { normalizeRallyInputV1 } from '../rally-recipe.js';
import { compileDocument } from '../play-compiler.js';
import { sampleActorFeetV2 } from '../play-actors-v2.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';

const bounds = { minX: -8, maxX: 28, minY: -8, maxY: 52 };
const inApron = p => p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY;
const inputAt = x => {
  const input = structuredClone(normalizeRallyInputV1({ seed: 740, options: { maxShots: 1 } }));
  input.layout.player2.x = x;
  return input;
};

for (const right of [false, true]) {
  test(`independent foot-apron audit rejects a later recovery outside the ${right ? 'right' : 'left'} apron without repairing source`, async () => {
    const input = inputAt(right ? 27 : -7), inputBefore = JSON.stringify(input);
    const baseline = await simulateRally(input);
    assert.equal(baseline.status, 'censored', JSON.stringify(baseline.diagnostics));
    const provisional = structuredClone(baseline), shot = provisional.document.shots[0];
    shot.playerMovement.player2 = { intent: 'manual', pinned: false,
      target: { x: right ? 27.5 : -7.5, y: input.layout.player2.y } };
    const before = JSON.stringify(provisional), compiled = compileDocument(provisional.document), segment = compiled.timeline.segments[0];
    assert.equal(compiled.validShotCount, 1, JSON.stringify(compiled.findings));
    assert.equal(inspectGeneratedMovementV1(compiled.timeline, { maxAccelerationFeetPerSecondSquared: 30 }).valid, true);
    assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
    assert.ok(sampleActorFeetV2(segment, 'player2', 0).every(inApron), 'the initial feet fit the apron');
    assert.ok(sampleActorFeetV2(segment, 'player2', segment.duration).some(p => !inApron(p)), 'the actual later feet leave the apron');
    const result = await createEngineDriverV1(async () => provisional, { yieldControl: async () => {} })(input);
    assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.code, 'generated-foot-apron', JSON.stringify(result.diagnostics));
    const apron = result.diagnostics.validation.footApron;
    assert.equal(apron.valid, false); assert.equal(apron.actor, 'player2'); assert.equal(apron.shotId, shot.id);
    assert.equal(apron.time, segment.duration); assert.ok(apron.time > 0);
    assert.deepEqual(apron.bounds, bounds);
    assert.ok(apron.feet.some(p => Math.abs(p.x - (right ? 28.22 : -8.22)) < 1e-8));
    assert.equal(result.document, null); assert.equal(result.outcome, null);
    assert.equal(JSON.stringify(provisional), before); assert.equal(JSON.stringify(input), inputBefore);
  });

  test(`independent foot-apron audit accepts a foot exactly on the ${right ? 'right' : 'left'} supported boundary`, async () => {
    const input = inputAt(right ? 27.28 : -7.28), before = JSON.stringify(input), result = await simulateRally(input);
    assert.equal(result.status, 'censored', JSON.stringify(result.diagnostics));
    assert.deepEqual(result.diagnostics.validation.footApron, { valid: true, bounds });
    const compiled = compileDocument(result.document), feet = sampleActorFeetV2(compiled.timeline.segments[0], 'player2', 0);
    assert.ok(feet.every(inApron)); assert.ok(feet.some(p => p.x === (right ? 28 : -8)));
    assert.equal(JSON.stringify(input), before);
  });
}
