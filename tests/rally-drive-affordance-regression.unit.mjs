import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulateRally} from '../rally-engine.js';
import {compileDocument} from '../play-compiler.js';
import {validateDocument} from '../play-document.js';
import {validateRallyRules} from '../rally-rules.js';
import {resolveFlightParametersV1} from '../rally-targets.js';
import {inspectGeneratedContactSupportV1} from '../generated-contact-support.js';
import {inspectGeneratedTrainerSupportV1} from '../generated-trainer-support.js';
import {inspectGeneratedMovementV1, inspectGeneratedSpacingV1} from '../rally-movement.js';
import {assessGeneratedFlightFeasibilityV1} from '../rally-flight-audit.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/model2/nonattacking-drive-50526-v1.json', import.meta.url), 'utf8'));
const prefix = result => result.decisions.slice(0, 6).map(decision => ({chosen: decision.chosen, draws: decision.draws}));

for (const row of fixture.cases) test(row.name + ' retains a supported non-attacking drive and the six historical draw pairs', async () => {
  const before = JSON.stringify(row.input), result = await simulateRally(row.input);
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.equal(result.diagnostics.attempts, 1);
  assert.deepEqual(result.diagnostics.attemptedSeeds, [50526]);
  assert.deepEqual(prefix(result), fixture.historicalPrefix, 'No already-delivered contact or random draw may be retried to fix the seventh contact.');
  assert.equal(JSON.stringify(row.input), before);

  const decision = result.decisions[6];
  assert.equal(decision.chosen.id, 'drive');
  assert.equal(decision.situation.canDrive, true);
  assert.equal(decision.situation.attackable, false);
  assert.equal(decision.situation.affordances.drive, true);
  assert.equal(decision.situation.affordances.attack, false);
  assert.ok(decision.candidates.some(candidate => candidate.id === 'drive'));
  assert.ok(decision.situation.contactSelection.outgoingSafety.supportedReplyIds.includes('drive'));
  assert.equal(decision.excluded.some(candidate => candidate.id === 'drive'), false);
  // Independently recompute the same physical opportunity probe. Its flight
  // clears the net but lies outside the separate attacking-clearance band.
  const probe = resolveFlightParametersV1({candidate: {family: 'drive', pace: 'firm', arc: 'medium', intent: 'drive'},
    contact: decision.situation.contact, target: {x: 10, y: 3}, team: 'orange',
    style: row.input.players[decision.situation.hitter].style, materialization: 'first'});
  assert.equal(probe.flight.obstruction, null);
  assert.equal(probe.attacking, false);
  assert.equal(probe.reason, 'solved-flight-clearance-outside-attack-band');

  for (const item of result.decisions) {
    const selected = item.resolution.choiceAttempts.filter(attempt => attempt.executionDraws);
    assert.equal(selected.length, 1);
    assert.deepEqual(selected[0].executionDraws, item.draws.execution);
  }
  validateDocument(result.document);
  const compiled = compileDocument(result.document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, result.document.shots.length);
  assert.deepEqual(compiled.findings.filter(finding => finding.severity === 'error'), []);
  assert.equal(rules.valid, true); assert.deepEqual(rules.violations, []);
  assert.ok(rules.expectedOutcomes.some(outcome => outcome.shotId === result.outcome.shotId
    && outcome.reason === result.outcome.reason && outcome.winner === result.outcome.winner));
  assert.equal(inspectGeneratedContactSupportV1(compiled.timeline).valid, true);
  const trainer = inspectGeneratedTrainerSupportV1({timeline: compiled.timeline, players: result.document.players});
  assert.equal(trainer.supported, true); assert.equal(trainer.valid, true, JSON.stringify(trainer));
  const movement = inspectGeneratedMovementV1(compiled.timeline, {maxAccelerationFeetPerSecondSquared: 30});
  assert.equal(movement.valid, true, JSON.stringify(movement));
  assert.ok(movement.maxPeakFeetPerSecond <= 18 + 1e-6);
  assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
  assert.equal(assessGeneratedFlightFeasibilityV1({document: result.document, compiled}).status, 'PASS');
});
