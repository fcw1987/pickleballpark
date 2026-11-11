import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { simulateRally, runNaturalAttemptV1 } from '../rally-engine.js';
import { createEngineDriverV1 } from '../rally-engine-driver.js';
import { compileDocument } from '../play-compiler.js';
import { validateDocument } from '../play-document.js';
import { validateRallyRules } from '../rally-rules.js';
import { classifyOutcomeV1 } from '../rally-quality.js';
import { certifyGeneratedRouteExclusion, validGeneratedRouteCertificateShape, matchesGeneratedRouteCertificate } from '../generated-route-certificates.js';
import { certifyGeneratedRouteExclusionV1 } from '../generated-route-certificate-v1.js';
import { certifyGeneratedRouteExclusionV2 } from '../generated-route-certificate-v2.js';
import { sampleActorFeetV2 } from '../play-actors-v2.js';
import { assertFreshPhysicalResult, assertFixedExecutionPairs } from './helpers/rally-procedural-proof.mjs';
import { inspectGeneratedMovementV1 } from '../rally-movement.js';
import { inspectGeneratedTrainerSupportV1 } from '../generated-trainer-support.js';
import { solveFlightV2 } from '../play-physics-v2.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/model2/generated-route-exclusion-50021-v2.json', import.meta.url), 'utf8'));
const input = () => ({ seed: fixture.document.generation.seed, ...structuredClone(fixture.document.generation.input),
  options: { ...fixture.document.generation.input.options, maxShots: 99 } });

test('the exact historical narrow-foot prefix retains its unchanged v2 second-bounce causality', () => {
  const original = JSON.stringify(fixture), document = structuredClone(fixture.document);
  assert.equal(createHash('sha256').update(JSON.stringify(document)).digest('hex'), fixture.provenance.documentSha256);
  assert.equal(Object.hasOwn(document, 'defaultFootState'), false);
  const prefix = compileDocument(document), segment = prefix.timeline.segments.at(-1), solved = solveFlightV2(segment.step.shot.physicsV2);
  assert.equal(prefix.validShotCount, 14); assert.deepEqual(prefix.findings.filter(row => row.severity === 'error'), []);
  const proof = certifyGeneratedRouteExclusionV2(prefix.play, segment, solved);
  assert.ok(proof); assert.equal(certifyGeneratedRouteExclusionV1(prefix.play, segment, solved), null);
  const end = solved.sampleBoard(solved.secondBounceTime);
  document.ending = 'winner';
  document.outcome = { winner: 'orange', type: 'fault', reason: 'second-bounce', shotId: 'shot-14', ruleRef: '10.B.1', faultingActor: 'player2',
    evidence: { position: {x: end.x, y: end.y, heightFeet: end.heightFeet}, afterContactSeconds: solved.secondBounceTime, generatedRouteCertificate: proof } };
  assert.deepEqual(document.shots, fixture.document.shots, 'a terminal proof may not rewrite any preserved contact or delivery');
  const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, 14); assert.deepEqual(compiled.findings.filter(row => row.severity === 'error'), []);
  assert.equal(rules.valid, true); assert.equal(rules.expectedOutcomes.length, 1);
  assert.equal(matchesGeneratedRouteCertificate(proof, rules.expectedOutcomes[0].generatedRouteCertificate), true);
  assert.equal(rules.expectedOutcomes[0].reach.unreachable, false);
  assert.equal(classifyOutcomeV1({outcome: document.outcome, terminalEvidence: rules.expectedOutcomes[0]}).kind, 'rule-fault');
  for (const shot of document.shots) {
    const feet = shot.contactEvidence.feet;
    assert.ok(Math.abs(Math.hypot(feet[0].x - feet[1].x, feet[0].y - feet[1].y) - .84) < 1e-8);
  }
  assert.equal(JSON.stringify(fixture), original);
});

test('current wide-foot generation preserves the overhead delivery and independently recomputes its v2 fault without rerolling', async () => {
  let executionCalls = 0;
  const simulate = createEngineDriverV1((normalized, controls) => runNaturalAttemptV1(normalized, {...controls,
    random: {...controls.random, execution: () => { executionCalls++; return controls.random.execution(); }}}), {yieldControl: async () => {}});
  const request = input(), before = JSON.stringify(request), result = await simulate(request);
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.equal(result.document.shots.length, 14, 'the proof adds no invented interception');
  assert.equal(result.outcome.reason, 'second-bounce'); assert.equal(result.outcome.type, 'fault');
  assert.equal(result.outcome.faultingActor, 'player2'); assert.equal(result.outcome.ruleRef, '10.B.1');
  assert.equal(result.outcome.evidence.generatedRouteCertificate.version, 'generated-contact-endpoint-route-v2');
  for (const [index, shot] of result.document.shots.entries()) for (const key of ['family', 'hitter', 'target', 'quality', 'contactTiming', 'physics']) {
    assert.deepEqual(shot[key], fixture.document.shots[index][key], `shot${index + 1}/${key}: certificate never changes the existing contact or sampled delivery`);
  }
  assert.deepEqual(result.document.defaultFootState, {version: 'generated-ready-stance-v1'});
  assert.equal(executionCalls, 2 * result.decisions.length, 'nominal refinement never draws and discards an execution');
  assertFixedExecutionPairs(result); assertFreshPhysicalResult(result);
  for (const [index, shot] of result.document.shots.entries()) {
    const {feet, ...evidence} = shot.contactEvidence, {feet: oldFeet, ...oldEvidence} = fixture.document.shots[index].contactEvidence;
    assert.deepEqual(evidence, oldEvidence);
    assert.ok(Math.abs(Math.hypot(feet[0].x - feet[1].x, feet[0].y - feet[1].y) - 1.44) < 1e-8);
    for (const axis of ['x', 'y']) assert.ok(Math.abs((feet[0][axis] + feet[1][axis] - oldFeet[0][axis] - oldFeet[1][axis]) / 2) < 1e-8,
      `shot${index + 1}: the wider base preserves the reviewed contact root`);
  }
  const compiled = compileDocument(result.document), rules = validateRallyRules(compiled.play, compiled.timeline);
  for (const segment of compiled.timeline.segments) for (const actor of ['player1', 'player2', 'player3', 'player4']) {
    for (const time of [0, segment.contactTime, segment.duration / 2, segment.duration]) {
      const feet = sampleActorFeetV2(segment, actor, time);
      assert.ok(Math.abs(Math.hypot(feet[0].x - feet[1].x, feet[0].y - feet[1].y) - 1.44) < 1e-8);
    }
  }
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
