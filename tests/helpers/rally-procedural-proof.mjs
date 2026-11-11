import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRallyRandomV1} from '../../rally-random.js';
import {compileDocument} from '../../play-compiler.js';
import {validateRallyRules} from '../../rally-rules.js';
import {inspectGeneratedMovementV1, inspectGeneratedSpacingV1} from '../../rally-movement.js';
import {inspectGeneratedContactSupportV1} from '../../generated-contact-support.js';
import {inspectGeneratedTrainerSupportV1} from '../../generated-trainer-support.js';

const reviewed = JSON.parse(readFileSync(new URL('../fixtures/model2/procedural-current-policy-v3-audit-v2.json', import.meta.url), 'utf8'));
export const currentProceduralCase = id => {
  const row = reviewed.cases.find(item => item.id === id);
  assert.ok(row, `Missing reviewed current case: ${id}`); return row;
};
export function proceduralProjection(result) {
  return {status: result.status, shots: result.document?.shots.length ?? null, outcome: result.outcome ?? null,
    decisions: result.decisions.map((decision, index) => ({shotId: decision.shotId, chosen: decision.chosen,
      draws: decision.draws, execution: decision.execution, contact: decision.situation.contact,
      contactKind: decision.situation.contactKind, contactTiming: result.document?.shots[index].contactTiming ?? null,
      target: decision.resolution.target, solutionIndex: decision.resolution.solutionIndex,
      nominalRoute: decision.resolution.deliveredGuidance.nominalRoute,
      deliveredRoute: decision.resolution.deliveredGuidance.deliveredRoute,
      incidentalAroundPost: decision.resolution.deliveredGuidance.incidentalAroundPost}))};
}
export function assertCurrentProceduralResult(result, id) {
  // Source hashes in the manifest document review provenance only. They are
  // not an exact-runtime stamp gate, and unrelated edits need no hash updates.
  assert.deepEqual(JSON.parse(JSON.stringify(proceduralProjection(result))), currentProceduralCase(id).expected, id);
}
export function assertFixedExecutionPairs(result, seed = result.document.generation.selection.selectedSeed) {
  const random = createRallyRandomV1(seed);
  for (const decision of result.decisions) {
    assert.deepEqual(decision.draws.execution, {quality: random.execution(), error: random.execution()}, decision.shotId);
    const fixed = decision.resolution.choiceAttempts.filter(attempt => attempt.executionDraws);
    assert.equal(fixed.length, 1, decision.shotId);
    assert.deepEqual(fixed[0].executionDraws, decision.draws.execution);
    assert.equal(fixed[0].repairs.some(repair => repair.stage === 'execution-route'), false, decision.shotId);
    assert.equal(decision.resolution.solutionIndex, 0, 'the first constructible delivery is not filtered for a better outcome');
  }
}
export function assertCurrentGeneratedFootState(document) {
  // The current outcome projection remains exact without duplicating the old
  // manifest. This is a separate new-generation source contract, not a rule
  // retroactively imposed on historical or explicitly authored foot evidence.
  assert.deepEqual(document.defaultFootState, {version: 'generated-ready-stance-v1'});
  for (const shot of document.shots) {
    const feet = shot.contactEvidence?.feet;
    assert.equal(feet?.length, 2, `${shot.id}: explicit generated contact feet`);
    assert.ok(feet.every(foot => Number.isFinite(foot.x) && Number.isFinite(foot.y)), shot.id);
    assert.ok(Math.abs(Math.abs(feet[0].x - feet[1].x) - 1.44) < 1e-8, `${shot.id}: current ready-stance width`);
    assert.ok(Math.abs(feet[0].y - feet[1].y) < 1e-8, `${shot.id}: current paired grounded stance`);
  }
}
export function assertFreshPhysicalResult(result) {
  assert.ok(result.document, JSON.stringify(result.diagnostics));
  assertCurrentGeneratedFootState(result.document);
  const compiled = compileDocument(result.document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, result.document.shots.length);
  assert.deepEqual(compiled.findings.filter(row => row.severity === 'error'), []);
  assert.equal(rules.valid, true); assert.deepEqual(rules.violations, []);
  assert.equal(inspectGeneratedMovementV1(compiled.timeline, {maxAccelerationFeetPerSecondSquared: 30}).valid, true);
  assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
  assert.equal(inspectGeneratedContactSupportV1(compiled.timeline).valid, true);
  assert.equal(inspectGeneratedTrainerSupportV1({timeline: compiled.timeline, players: result.document.players}).valid, true);
  if (result.status === 'complete') {
    assert.deepEqual(result.outcome, result.document.outcome);
    assert.ok(rules.expectedOutcomes.some(outcome => ['shotId', 'reason', 'winner', 'ruleRef', 'faultingActor', 'struckActor']
      .every(key => (outcome[key] ?? null) === (result.outcome[key] ?? null))));
  } else {
    assert.equal(result.status, 'censored'); assert.equal(result.outcome, null);
    assert.equal(result.document.ending, 'stop'); assert.equal(result.document.outcome, undefined);
    assert.deepEqual(rules.expectedOutcomes, []);
  }
  return {compiled, rules};
}
