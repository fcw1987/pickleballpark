import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulateRally } from '../rally-engine.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { inspectGeneratedTrainerSupportV1 } from '../generated-trainer-support.js';
import { assertFreshPhysicalResult, assertFixedExecutionPairs } from './helpers/rally-procedural-proof.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/model2/generated-timed-stance-9060-v1.json', import.meta.url), 'utf8'));
test('mixed-hand lobbers recover the formerly missed intermediate stance without redrawing execution or widening physical limits', async () => {
  const before = JSON.stringify(fixture.input), result = await simulateRally(fixture.input);
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  // The compact overhead plant and exact low-contact support now admit an
  // earlier reset. Its continuation is a real 32-contact net ending, not the
  // older 19-contact wide ending. The original failed prefix stays immutable.
  assert.equal(result.document.shots.length, 32);
  assert.deepEqual(result.decisions.slice(0, 10).map(row => row.draws), fixture.prefixDraws,
    'the original ten intent, execution, target, perturbation and narration draw objects are unchanged');
  const reply = result.document.shots[10];
  assert.equal(reply.hitter, 'player2'); assert.equal(reply.family, 'reset'); assert.equal(reply.contactMode, 'bounced');
  assert.ok(reply.contactTiming.afterBounceSeconds > 0 && reply.contactTiming.afterBounceSeconds < .1);
  assert.equal(reply.contactTiming.afterBounceSeconds, .012371279);
  assert.deepEqual(reply.contactEvidence.feet, [{x: 6.676012207, y: 14.246847556}, {x: 5.236012207, y: 14.246847556}]);
  assertFixedExecutionPairs(result); assertFreshPhysicalResult(result);
  const compiled = compileDocument(result.document);
  assert.equal(compiled.validShotCount, 32); assert.deepEqual(compiled.findings.filter(row => row.severity === 'error'), []);
  assert.equal(validateRallyRules(compiled.play, compiled.timeline).valid, true);
  const motion = inspectGeneratedMovementV1(compiled.timeline, { maxAccelerationFeetPerSecondSquared: 30 });
  assert.equal(motion.valid, true, JSON.stringify(motion));
  assert.ok(motion.maxPeakFeetPerSecond <= 18 + 1e-6); assert.ok(motion.maxAccelerationFeetPerSecondSquared <= 30 + 1e-6);
  assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
  const trainer = inspectGeneratedTrainerSupportV1({ timeline: compiled.timeline, players: result.document.players });
  assert.equal(trainer.valid, true, JSON.stringify(trainer)); assert.equal(trainer.checkedContacts, 32);
  assert.equal(result.outcome.reason, 'net'); assert.equal(result.outcome.shotId, 'shot-32');
  assert.equal(result.outcome.winner, 'green'); assert.equal(result.outcome.faultingActor, 'player4');
  assert.equal(result.decisions.at(-1).execution.errorReason, 'net');
  assert.equal(compiled.timeline.segments.at(-1).trajectory.solved.obstruction.kind, 'net');
  for (const decision of result.decisions) {
    const attempted = decision.resolution.choiceAttempts.filter(row => row.executionDraws);
    assert.equal(attempted.length, 1); assert.deepEqual(attempted[0].executionDraws, decision.draws.execution);
  }
  assert.equal(JSON.stringify(fixture.input), before);
});
