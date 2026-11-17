import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOutcomeV1 } from '../rally-quality.js';
import { certifyGeneratedRouteExclusionV1 } from '../generated-route-certificate-v1.js';
import { compileDocument } from '../play-compiler.js';
import { solveFlightV2 } from '../play-physics-v2.js';
import { validateRallyRules } from '../rally-rules.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';

const ids = { player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' };
const teams = { green: 'orange', orange: 'green' };
function mirror(value) {
  if (Array.isArray(value)) return value.map(mirror);
  if (value && typeof value === 'object') {
    const next = Object.fromEntries(Object.entries(value).map(([key, item]) => [ids[key] ?? key, mirror(item)]));
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) { next.x = 20 - value.x; next.y = 44 - value.y; }
    return next;
  }
  return ids[value] ?? teams[value] ?? value;
}
function certifiedFixture(mirrored = false) {
  const original = readModel2Fixture('unreachable'), document = mirrored ? mirror(original) : original;
  const first = compileDocument(document);
  const segment = (first.timeline.rawSegments ?? first.timeline.segments).filter(row => row.shotSemantics).at(-1);
  const certificate = certifyGeneratedRouteExclusionV1(first.play, segment, solveFlightV2(segment.step.shot.physicsV2));
  assert.ok(certificate);
  assert.equal(certificate.actors.length, 2);
  assert.ok(certificate.actors.every(row => row.continuousLowerBoundFeet > 0), 'both defenders have a positive continuous exclusion margin');
  const actor = [...certificate.actors].sort((a, b) => a.continuousLowerBoundFeet - b.continuousLowerBoundFeet || a.actor.localeCompare(b.actor))[0].actor;
  document.outcome = { ...document.outcome, type: 'fault', reason: 'second-bounce', faultingActor: actor,
    evidence: { ...document.outcome.evidence, generatedRouteCertificate: certificate } };
  const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.deepEqual(compiled.findings.filter(row => row.severity === 'error'), []);
  assert.equal(rules.valid, true);
  assert.equal(rules.expectedOutcomes.length, 1);
  return { document, outcome: document.outcome, terminalEvidence: rules.expectedOutcomes[0] };
}

for (const mirrored of [false, true]) test(`independently certified second bounce stays a rule fault, not an unrestricted winner${mirrored ? ' when mirrored' : ''}`, () => {
  const source = certifiedFixture(mirrored), before = JSON.stringify(source);
  const classified = classifyOutcomeV1(source);
  assert.equal(classified.kind, 'rule-fault');
  assert.equal(classified.actor, source.outcome.faultingActor);
  assert.match(classified.evidence.basis, /generated-route exclusion, not universal unreachability/);
  assert.equal(source.outcome.type, 'fault');
  assert.equal(source.outcome.reason, 'second-bounce');
  assert.equal(JSON.stringify(source), before, 'classification never rewrites physical source or independent evidence');
});

test('missing, mismatched or borrowed terminal certificates do not supply tactical causation', () => {
  const source = certifiedFixture();
  assert.equal(classifyOutcomeV1({ outcome: source.outcome }).kind, 'unknown');
  for (const mutate of [
    row => { row.terminalEvidence = null; },
    row => { delete row.outcome.evidence.generatedRouteCertificate; },
    row => { delete row.terminalEvidence.generatedRouteCertificate; },
    row => { row.terminalEvidence.shotId = 'other-shot'; },
    row => { row.terminalEvidence.reason = 'net'; },
    row => { row.terminalEvidence.winner = 'other-team'; },
    row => { row.terminalEvidence.faultingActor = 'other-player'; },
    row => { row.terminalEvidence.ruleRef = 'other-rule'; },
    row => { row.terminalEvidence.afterContactSeconds += .01; },
    row => { row.outcome.evidence.position.x += .01; },
    row => { row.outcome.evidence.generatedRouteCertificate.throughSeconds += .01; },
    row => { row.outcome.evidence.generatedRouteCertificate.actors[0].continuousLowerBoundFeet += .01; },
    row => { row.outcome.evidence.generatedRouteCertificate.actors[0].continuousLowerBoundFeet = 0; },
    row => { row.outcome.evidence.generatedRouteCertificate.actors.pop(); },
    row => { row.outcome.evidence.generatedRouteCertificate.parameters.endpointFeetPerSecond = 10; },
  ]) {
    const changed = structuredClone(source); mutate(changed);
    assert.equal(classifyOutcomeV1(changed).kind, 'unknown');
  }
  const ordinary = readModel2Fixture('second-bounce'), compiled = compileDocument(ordinary);
  const terminalEvidence = validateRallyRules(compiled.play, compiled.timeline).expectedOutcomes[0];
  assert.equal(classifyOutcomeV1({ outcome: ordinary.outcome, terminalEvidence }).kind, 'unknown');
  ordinary.outcome.evidence.generatedRouteCertificate = structuredClone(source.outcome.evidence.generatedRouteCertificate);
  assert.ok(compileDocument(ordinary).findings.some(row => row.severity === 'error'), 'public validation rejects a borrowed exclusion proof');
  assert.equal(classifyOutcomeV1({ outcome: ordinary.outcome, terminalEvidence }).kind, 'unknown');
});

test('unknown pressure-based causation and independently unreachable winners retain their meanings', () => {
  const source = certifiedFixture();
  const net = { type: 'fault', reason: 'net', shotId: 'shot-7', faultingActor: 'player1' };
  assert.equal(classifyOutcomeV1({ outcome: net, terminalEvidence: source.terminalEvidence,
    execution: { quality: 'error' }, pressure: { score: .2, reachMarginFeet: 4, availableSeconds: .8, movementSpeedFeetPerSecond: 4 } }).kind, 'unknown');
  const winner = readModel2Fixture('unreachable').outcome;
  assert.equal(classifyOutcomeV1({ outcome: winner, terminalEvidence: source.terminalEvidence }).kind, 'winner');
});
