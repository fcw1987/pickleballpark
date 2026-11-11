import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulateRally } from '../rally-engine.js';
import { compileDocument } from '../play-compiler.js';
import { validateDocument } from '../play-document.js';
import { validateRallyRules } from '../rally-rules.js';
import { classifyOutcomeV1 } from '../rally-quality.js';
import { certifyGeneratedRouteExclusion, validGeneratedRouteCertificateShape, matchesGeneratedRouteCertificate } from '../generated-route-certificates.js';
import { certifyGeneratedRouteExclusionV1 } from '../generated-route-certificate-v1.js';
import { inspectGeneratedMovementV1 } from '../rally-movement.js';
import { inspectGeneratedTrainerSupportV1 } from '../generated-trainer-support.js';
import { solveFlightV2 } from '../play-physics-v2.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/model2/generated-route-exclusion-50021-v2.json', import.meta.url), 'utf8'));
const input = () => ({ seed: fixture.document.generation.seed, ...structuredClone(fixture.document.generation.input),
  options: { ...fixture.document.generation.input.options, maxShots: 99 } });

test('the exact failed overhead now ends only through an independently recomputed v2 second-bounce fault', async () => {
  const request = input(), before = JSON.stringify(request), result = await simulateRally(request);
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.equal(result.document.shots.length, 14, 'the proof adds no invented interception');
  assert.equal(result.outcome.reason, 'second-bounce'); assert.equal(result.outcome.type, 'fault');
  assert.equal(result.outcome.faultingActor, 'player2'); assert.equal(result.outcome.ruleRef, '10.B.1');
  assert.equal(result.outcome.evidence.generatedRouteCertificate.version, 'generated-contact-endpoint-route-v2');
  for (const [index, shot] of result.document.shots.entries()) for (const key of ['family', 'hitter', 'target', 'quality', 'contactEvidence', 'contactTiming', 'physics']) {
    assert.deepEqual(shot[key], fixture.document.shots[index][key], `shot${index + 1}/${key}: certificate never changes the existing contact or sampled delivery`);
  }
  const compiled = compileDocument(result.document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.deepEqual(compiled.findings.filter(row => row.severity === 'error'), []); assert.equal(rules.valid, true);
  const terminal = rules.expectedOutcomes[0];
  assert.equal(terminal.reach.unreachable, false, 'the broader human-style reach model retains its uncertainty');
  assert.equal(matchesGeneratedRouteCertificate(result.outcome.evidence.generatedRouteCertificate, terminal.generatedRouteCertificate), true);
  assert.equal(classifyOutcomeV1({ outcome: result.outcome, terminalEvidence: terminal }).kind, 'rule-fault');
  assert.equal(classifyOutcomeV1({ outcome: result.outcome }).kind, 'unknown', 'a copied producer certificate alone is not evidence');
  assert.equal(inspectGeneratedMovementV1(compiled.timeline, { maxAccelerationFeetPerSecondSquared: 30 }).valid, true);
  assert.equal(inspectGeneratedTrainerSupportV1({ timeline: compiled.timeline, players: result.document.players }).valid, true);
  assert.equal(JSON.stringify(request), before);
  const repeat = await simulateRally(input());
  for (const key of ['status', 'document', 'outcome', 'decisions', 'stats', 'recipe', 'outcomeClassification']) assert.deepEqual(repeat[key], result[key]);
});

test('public compilation independently rejects altered v2 proof geometry and terminal evidence', async () => {
  const result = await simulateRally(input()); assert.equal(result.status, 'complete');
  for (const mutate of [
    value => { value.outcome.evidence.generatedRouteCertificate.actors[0].origin.x += .01; },
    value => { value.outcome.evidence.generatedRouteCertificate.actors[1].continuousLowerBoundFeet += .01; },
    value => { value.outcome.evidence.generatedRouteCertificate.throughSeconds += .01; },
    value => { value.outcome.evidence.position.y += .01; },
  ]) {
    const document = structuredClone(result.document); mutate(document); validateDocument(document);
    const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
    assert.ok(compiled.findings.some(row => row.severity === 'error')); assert.equal(rules.valid, false);
  }
  const bad = structuredClone(result.document); bad.outcome.evidence.generatedRouteCertificate.parameters.accelerationFeetPerSecondSquared = 31;
  assert.throws(() => validateDocument(bad), /certificate/);
});

test('version dispatch preserves old v1 proofs and never borrows a theorem across versions', () => {
  const compiled = compileDocument(readModel2Fixture('unreachable')), segment = compiled.timeline.segments.at(-1);
  const solved = solveFlightV2(segment.step.shot.physicsV2), old = certifyGeneratedRouteExclusionV1(compiled.play, segment, solved);
  assert.ok(old); assert.deepEqual(certifyGeneratedRouteExclusion(compiled.play, segment, solved), old);
  assert.deepEqual(certifyGeneratedRouteExclusion(compiled.play, segment, solved, { version: old.version }), old);
  assert.equal(certifyGeneratedRouteExclusion(compiled.play, segment, solved, { version: 'unknown' }), null);
  assert.equal(validGeneratedRouteCertificateShape({ ...old, version: 'unknown' }), false);
  assert.equal(matchesGeneratedRouteCertificate(old, { ...old, version: 'generated-contact-endpoint-route-v2' }), false);
  let read = false; const accessor = { ...old }; Object.defineProperty(accessor, 'version', { get() { read = true; return old.version; } });
  assert.equal(validGeneratedRouteCertificateShape(accessor), false); assert.equal(read, false);
});
