import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileDocument } from '../play-compiler.js';
import { solveFlightV2 } from '../play-physics-v2.js';
import { validateRallyRules } from '../rally-rules.js';
import { runNaturalAttemptV1, simulateRally } from '../rally-engine.js';
import { createEngineDriverV1, ENGINE_DRIVER_LIMITS } from '../rally-engine-driver.js';
import { createRallyRandomV1 } from '../rally-random.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { inspectGeneratedContactSupportV1 } from '../generated-contact-support.js';
import { inspectGeneratedTrainerSupportV1 } from '../generated-trainer-support.js';
import { assessGeneratedFlightFeasibilityV1 } from '../rally-flight-audit.js';
import { GENERATED_ROUTE_CERTIFICATE_VERSION as V1 } from '../generated-route-certificate-v1.js';
import { GENERATED_ROUTE_CERTIFICATE_VERSION_V2 as V2 } from '../generated-route-certificate-v2.js';
import { GENERATED_ROUTE_CERTIFICATE_VERSION_V3 as V3 } from '../generated-route-certificate-v3.js';
import { certifyGeneratedRouteExclusion } from '../generated-route-certificates.js';

const fixture = JSON.parse(readFileSync(new URL(
  './fixtures/model2/generated-contact-facing-historical-prefixes.json', import.meta.url), 'utf8'));
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('the exact historical prefixes remain uncertain rather than becoming invented route winners', () => {
  assert.equal(fixture.cases.length, 3);
  assert.equal(fixture.provenance.sourceRevision, '5e384de2a4f7d0904254ecb06a174e9c5dbc5d22');
  assert.equal(fixture.provenance.archiveSha256, 'a2e5e31b880d63d35a4138ec843e677822658a31e2066487d06a15f125f9a8fd');
  for (const row of fixture.cases) {
    const document = structuredClone(row.document), before = JSON.stringify(document);
    assert.equal(sha(document), row.provenance.documentSha256);
    assert.equal(row.provenance.originalStatus, 'failed');
    assert.equal(row.provenance.originalCode, 'no-feasible-contact');
    assert.equal(row.provenance.prefixDrawsExactlyMatched, true);
    assert.equal(row.provenance.restoredArchivedPendingRecipe, true);
    assert.equal(row.provenance.pendingOriginsExactlyMatched, true);
    assert.equal(document.ending, 'stop');
    assert.equal(document.outcome, undefined);
    const compiled = compileDocument(document), segment = compiled.timeline.segments.at(-1);
    assert.equal(compiled.validShotCount, document.shots.length);
    assert.equal(sha(segment.previous.positions), row.provenance.pendingOriginsSha256);
    assert.deepEqual(compiled.findings.filter(finding => finding.severity === 'error'), []);
    const flight = solveFlightV2(segment.step.shot.physicsV2);
    const { actor, timeSeconds, gapFeet } = row.broadRouteWitness;
    const contact = flight.sampleBoard(timeSeconds), origin = segment.previous.positions[actor];
    const duration = segment.contactTime + timeSeconds;
    const gap = Math.hypot(contact.x - origin.x, contact.y - origin.y)
      - 3 - Math.min(9 * duration, 7.5 * duration * duration);
    assert(gap < 0, 'The broad route bound permits a contact; failed pose search is not a winning proof.');
    assert(Math.abs(gap - gapFeet) < 1e-10);
    for (const version of [undefined, V1, V2, V3]) {
      assert.equal(certifyGeneratedRouteExclusion(compiled.play, segment, flight, { version }), null);
    }
    assert.equal(JSON.stringify(document), before);
  }
});

for (const row of fixture.cases) {
  test(row.id + ' now establishes a real supported return with one execution draw pair per contact', async () => {
    let executionCalls = 0, randomSnapshot;
    const simulate = createEngineDriverV1(async (input, context) => {
      const random = { ...context.random, execution: () => {
        executionCalls++;
        return context.random.execution();
      } };
      try {
        return await runNaturalAttemptV1(input, { ...context, random });
      } finally {
        randomSnapshot = context.random.snapshot();
      }
    });
    const request = structuredClone(row.input), before = JSON.stringify(request);
    const result = await simulate(request);
    assert.equal(JSON.stringify(request), before);
    assert.equal(result.status, 'complete');
    assert.equal(result.diagnostics.attempts, 1);
    assert.deepEqual(result.diagnostics.attemptedSeeds, [request.seed]);
    assert(result.document.shots.length > row.provenance.prefixContacts);
    assert.equal(executionCalls, result.decisions.length * 2);
    assert.equal(randomSnapshot.draws.execution, executionCalls);
    assert.equal(sha(result.decisions.slice(0, row.provenance.prefixContacts).map(decision => decision.draws)),
      row.provenance.prefixDrawsSha256, 'Every already-accepted historical RNG draw stays unchanged.');
    const expected = createRallyRandomV1(request.seed);
    for (const decision of result.decisions) assert.deepEqual(decision.draws.execution, {
      quality: expected.execution(), error: expected.execution(),
    });

    // Recompute public physics from the source, not producer acceptance claims.
    // Source stances may legitimately differ from the old footprint model.
    const compiled = compileDocument(result.document);
    assert.equal(compiled.validShotCount, result.document.shots.length);
    assert.deepEqual(compiled.findings.filter(finding => finding.severity === 'error'), []);
    assert(validateRallyRules(compiled.play, compiled.timeline).valid);
    assert(inspectGeneratedMovementV1(compiled.timeline, { maxAccelerationFeetPerSecondSquared: 30 }).valid);
    assert(inspectGeneratedSpacingV1(compiled.timeline).valid);
    assert(inspectGeneratedContactSupportV1(compiled.timeline).valid);
    const trainer = inspectGeneratedTrainerSupportV1({
      timeline: compiled.timeline, players: result.document.players,
    });
    assert(trainer.supported && trainer.valid);
    assert.equal(trainer.checkedContacts, result.document.shots.length);
    assert.equal(assessGeneratedFlightFeasibilityV1({ document: result.document, compiled }).status, 'PASS');
    assert(result.diagnostics.validation.groundedSoles.valid);
    assert(result.diagnostics.validation.footApron.valid);
    assert(result.diagnostics.work <= ENGINE_DRIVER_LIMITS.maxWorkPerAttempt);

    const returned = compiled.timeline.segments[row.provenance.prefixContacts];
    assert.equal(returned.shotSemantics.strokeSide, 'backhand');
    assert(returned.shotSemantics.contact.point.heightFeet * .3048 < .8);
    assert.equal(result.document.players[returned.shotSemantics.playerId].handedness, 'right');
    const decision = result.decisions[row.provenance.prefixContacts];
    if (row.input.seed === 51074) {
      assert.equal(decision.situation.attackable, false);
      assert.equal(decision.policyContext.emergencyRetrieval.trigger,
        'ordinary-bounded-nominal-options-exhausted');
      assert.equal(decision.draws.target, null);
      assert.equal(decision.resolution.nominalTargetSelection.targetDrawsUsed, false);
    }
    const repeated = await simulateRally(request);
    assert.equal(repeated.status, 'complete');
    assert.deepEqual(repeated.document, result.document);
    assert.deepEqual(repeated.decisions, result.decisions);
  });
}
