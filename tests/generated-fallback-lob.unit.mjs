import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { simulateRally, runNaturalAttemptV1 } from '../rally-engine.js';
import { createEngineDriverV1, ENGINE_DRIVER_LIMITS } from '../rally-engine-driver.js';
import { createRallyRandomV1 } from '../rally-random.js';
import { compileDocument } from '../play-compiler.js';
import { solveFlightV2 } from '../play-physics-v2.js';
import { validateRallyRules } from '../rally-rules.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { inspectGeneratedTrainerSupportV1 } from '../generated-trainer-support.js';
import { assessGeneratedFlightFeasibilityV1 } from '../rally-flight-audit.js';
import { certifyGeneratedRouteExclusion } from '../generated-route-certificates.js';

const fixture = JSON.parse(readFileSync(new URL(
  './fixtures/model2/generated-fallback-lob-witness.json', import.meta.url), 'utf8'));
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const engineURL = new URL('../rally-engine.js', import.meta.url);
const source = readFileSync(engineURL, 'utf8').replace(/from (['"])(\.\/[^'"]+)\1/g,
  (_all, _quote, path) => 'from ' + JSON.stringify(new URL(path, engineURL).href));
const { contactReplySupportV1 } = await import('data:text/javascript;base64,'
  + Buffer.from(source + '\nexport { contactReplySupportV1 };').toString('base64'));

function audit(document) {
  const compiled = compileDocument(document);
  assert.equal(compiled.validShotCount, document.shots.length);
  assert.deepEqual(compiled.findings.filter(row => row.severity === 'error'), []);
  assert(validateRallyRules(compiled.play, compiled.timeline).valid);
  assert(inspectGeneratedMovementV1(compiled.timeline, { maxAccelerationFeetPerSecondSquared: 30 }).valid);
  assert(inspectGeneratedSpacingV1(compiled.timeline).valid);
  const support = inspectGeneratedTrainerSupportV1({ timeline: compiled.timeline, players: document.players });
  assert(support.supported && support.valid);
  assert.equal(assessGeneratedFlightFeasibilityV1({ document, compiled }).status, 'PASS');
  return compiled;
}

test('a constructible reset no longer hides a physically necessary lob in fallback only', () => {
  const pair = { id: fixture.witness.id, contact: fixture.witness.contact };
  const ordinary = contactReplySupportV1(fixture.input, pair);
  const fallback = contactReplySupportV1(fixture.input, pair, { diverse: true });
  assert(ordinary.ids.includes('reset'));
  assert(!ordinary.ids.includes('lob'), 'The ordinary probe set remains unchanged.');
  assert(fallback.ids.includes('lob'));
  assert.equal(fallback.probes.filter(probe => probe.id === 'lob').length, 1);
  assert.deepEqual(fallback.probes.find(probe => probe.id === 'lob').target, { x: 10, y: 40 });
  assert(fallback.workUnits > ordinary.workUnits);
});

const oppositeId = { player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' };
function transform(value, mode) {
  if (Array.isArray(value)) return value.map(item => transform(item, mode));
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [
      mode === 'rotate' ? oppositeId[key] ?? key : key, transform(item, mode),
    ]));
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
      result.x = 20 - value.x;
      result.y = mode === 'rotate' ? 44 - value.y : value.y;
    }
    return result;
  }
  if (mode === 'rotate') return oppositeId[value] ?? ({ green: 'orange', orange: 'green' })[value] ?? value;
  return ({ left: 'right', right: 'left' })[value] ?? value;
}

for (const mode of ['original', 'reflect', 'rotate']) {
  test('the actual lob witness preserves strict route, feet and selected-hand support: ' + mode, () => {
    const original = structuredClone(fixture.prefixDocument);
    original.shots[original.shots.length - 1] = structuredClone(fixture.witness.pendingRecipe);
    original.shots.push(structuredClone(fixture.witness.recipe));
    const document = mode === 'original' ? original : transform(original, mode), before = JSON.stringify(document);
    const compiled = audit(document), last = compiled.timeline.segments.at(-1);
    assert.equal(last.shotSemantics.strokeSide, 'forehand');
    assert.equal(document.players[last.shotSemantics.playerId].handedness, mode === 'reflect' ? 'left' : 'right');
    assert.equal(last.shotSemantics.contact.kind, 'groundstroke');
    assert.equal(document.shots.at(-1).family, 'lob');
    assert.equal(JSON.stringify(document), before);
  });
}

test('the historical failure remains uncertified while current policy makes a real lob with unchanged prior draws', async () => {
  const historical = structuredClone(fixture.prefixDocument), before = JSON.stringify(historical);
  const old = compileDocument(historical), segment = old.timeline.segments.at(-1);
  assert.equal(old.validShotCount, historical.shots.length);
  assert.equal(certifyGeneratedRouteExclusion(old.play, segment, solveFlightV2(segment.step.shot.physicsV2)), null);
  assert.equal(JSON.stringify(historical), before);
  let executionCalls = 0;
  const simulate = createEngineDriverV1((input, controls) => runNaturalAttemptV1(input, {
    ...controls, random: { ...controls.random, execution: () => {
      executionCalls++;
      return controls.random.execution();
    } },
  }), { yieldControl: async () => {} });
  const result = await simulate(fixture.input);
  assert.equal(result.status, 'complete', result.diagnostics.message ?? result.diagnostics.code);
  audit(result.document);
  assert(result.diagnostics.validation.groundedSoles.valid);
  assert(result.diagnostics.work <= ENGINE_DRIVER_LIMITS.maxWorkPerAttempt);
  const count = fixture.provenance.prefixContacts;
  assert.equal(sha(result.decisions.slice(0, count).map(decision => decision.draws)), fixture.provenance.prefixDrawsSha256);
  assert.deepEqual(result.document.shots.slice(0, count - 1), historical.shots.slice(0, count - 1));
  const unchangedIncoming = value => {
    const copy = structuredClone(value);
    delete copy.movement; delete copy.playerMovement;
    return copy;
  };
  assert.deepEqual(unchangedIncoming(result.document.shots[count - 1]), unchangedIncoming(historical.shots[count - 1]));
  assert.equal(result.document.shots[count].family, 'lob');
  assert.equal(result.decisions[count].policyContext.emergencyRetrieval, undefined);
  assert.notEqual(result.decisions[count].draws.target, null, 'The ordinary target policy still draws the lob target.');
  assert.equal(executionCalls, result.decisions.length * 2);
  const random = createRallyRandomV1(fixture.input.seed);
  for (const decision of result.decisions) {
    assert.deepEqual(decision.draws.execution, { quality: random.execution(), error: random.execution() });
    assert.equal(decision.resolution.choiceAttempts.filter(attempt => attempt.executionDraws).length, 1);
  }
  assert(result.diagnostics.producer.contactTimeRefinements.some(row => row.contactIndex === count
    && row.intervalsPerPhase === 64 && row.trigger === 'no-supported-contact'));
  const repeated = await simulateRally(fixture.input);
  assert.deepEqual(repeated.document, result.document);
  assert.deepEqual(repeated.decisions, result.decisions);
});
