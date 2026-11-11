import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulateRally } from '../rally-engine.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { inspectGeneratedTrainerSupportV1 } from '../generated-trainer-support.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/model2/generated-timed-stance-9060-v1.json', import.meta.url), 'utf8'));
test('mixed-hand lobbers recover the formerly missed intermediate stance without redrawing execution or widening physical limits', async () => {
  const before = JSON.stringify(fixture.input), result = await simulateRally(fixture.input);
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.equal(result.document.shots.length, 19);
  assert.deepEqual(result.decisions.slice(0, 10).map(row => row.draws), fixture.prefixDraws,
    'the original ten intent, execution, target, perturbation and narration draw objects are unchanged');
  const reply = result.document.shots[10];
  assert.equal(reply.hitter, 'player2'); assert.equal(reply.family, 'reset'); assert.equal(reply.contactMode, 'bounced');
  assert.ok(reply.contactTiming.afterBounceSeconds > 0 && reply.contactTiming.afterBounceSeconds < .1);
  const compiled = compileDocument(result.document);
  assert.equal(compiled.validShotCount, 19); assert.deepEqual(compiled.findings.filter(row => row.severity === 'error'), []);
  assert.equal(validateRallyRules(compiled.play, compiled.timeline).valid, true);
  const motion = inspectGeneratedMovementV1(compiled.timeline, { maxAccelerationFeetPerSecondSquared: 30 });
  assert.equal(motion.valid, true, JSON.stringify(motion));
  assert.ok(motion.maxPeakFeetPerSecond <= 18 + 1e-6); assert.ok(motion.maxAccelerationFeetPerSecondSquared <= 30 + 1e-6);
  assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
  const trainer = inspectGeneratedTrainerSupportV1({ timeline: compiled.timeline, players: result.document.players });
  assert.equal(trainer.valid, true, JSON.stringify(trainer)); assert.equal(trainer.checkedContacts, 19);
  for (const decision of result.decisions) {
    const attempted = decision.resolution.choiceAttempts.filter(row => row.executionDraws);
    assert.equal(attempted.length, 1); assert.deepEqual(attempted[0].executionDraws, decision.draws.execution);
  }
  assert.equal(JSON.stringify(fixture.input), before);
});
