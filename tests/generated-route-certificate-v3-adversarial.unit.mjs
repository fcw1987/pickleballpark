import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileDocument } from '../play-compiler.js';
import { solveFlightV2 } from '../play-physics-v2.js';
import { validateRallyRules } from '../rally-rules.js';
import { classifyOutcomeV1 } from '../rally-quality.js';
import { certifyGeneratedRouteExclusion, matchesGeneratedRouteCertificate } from '../generated-route-certificates.js';
import { certifyGeneratedRouteExclusionV2 } from '../generated-route-certificate-v2.js';
import {
  GENERATED_ROUTE_CERTIFICATE_VERSION_V3,
  certifyGeneratedRouteExclusionV3,
  validGeneratedRouteCertificateShapeV3,
  matchesGeneratedRouteCertificateV3,
} from '../generated-route-certificate-v3.js';

const players = {
  player1: { team: 'green' }, player2: { team: 'green' },
  player3: { team: 'orange' }, player4: { team: 'orange' },
};
const allowance = time => Math.min(18 * time / 2, 30 * time * time / 4);
function line({ from = 0, speed = 0, end = 1, lead = 0, origins = [50, 52] } = {}) {
  return {
    play: { modelVersion: 2, players },
    segment: { modelVersion: 2, contactTime: lead, model2Momentum: [],
      shotSemantics: { playerId: 'player3' },
      previous: { positions: { player1: { x: origins[0], y: 0 }, player2: { x: origins[1], y: 0 } } } },
    solved: { secondBounceTime: end,
      stages: [{ from: { x: from, y: 0 }, startTime: 0, endTime: end, vx: speed, vz: 0 }],
      sampleBoard: time => ({ x: from + speed * time, y: 0 }) },
  };
}
const certify = input => certifyGeneratedRouteExclusionV3(input.play, input.segment, input.solved);
// On each side of the distance cusp and allowance crossover, this one-axis
// gap is concave or affine. Its exact minimum is therefore among these cuts.
function analyticMinimum(input, origin) {
  const stage = input.solved.stages[0], end = input.solved.secondBounceTime, lead = input.segment.contactTime;
  const cuts = [0, end, 1.2 - lead];
  if (stage.vx !== 0) cuts.push((origin - stage.from.x) / stage.vx);
  return Math.min(...cuts.filter(time => time >= 0 && time <= end).map(time =>
    Math.abs((stage.from.x - origin) + stage.vx * time) - 3 - allowance(lead + time)));
}

test('adaptive lower bounds agree with independent analytic one-axis minima, including the acceleration crossover', () => {
  let exclusions = 0, reachable = 0;
  for (const end of [.12, .8, 1.2, 2]) for (const lead of [0, .15, 1]) {
    for (const speed of [-60, -4, 0, 15, 80]) for (const origin of [-35, -6, 10, 40]) {
      const input = line({ from: 2, speed, end, lead, origins: [origin, 1000] });
      const exact = analyticMinimum(input, origin), proof = certify(input);
      if (exact <= 1e-7) {
        reachable++;
        assert.equal(proof, null, JSON.stringify({ end, lead, speed, origin, exact }));
      }
      if (proof) {
        exclusions++;
        assert.equal(validGeneratedRouteCertificateShapeV3(proof), true);
        assert.ok(proof.actors[0].continuousLowerBoundFeet <= exact + 1e-10,
          JSON.stringify({ end, lead, speed, origin, exact, actor: proof.actors[0] }));
        assert.deepEqual(certify(input), proof, 'adaptive traversal and counters are deterministic');
      }
    }
  }
  assert.ok(exclusions > 100); assert.ok(reachable > 100);
});

test('adaptive refinement proves a small positive margin without changing the historical 512-sample theorem', () => {
  const input = line({ origins: [10.5005, 12.5005] }), proof = certify(input);
  assert.equal(certifyGeneratedRouteExclusionV2(input.play, input.segment, input.solved), null);
  assert.ok(proof); assert.equal(proof.version, GENERATED_ROUTE_CERTIFICATE_VERSION_V3);
  assert.ok(proof.actors[0].continuousLowerBoundFeet > 1e-7);
  assert.ok(proof.actors[0].continuousLowerBoundFeet <= .0005 + 1e-12);
  assert.ok(proof.actors[0].intervalEvaluations > 32); assert.ok(proof.actors[0].maxDepthUsed > 0);
  assert.equal(proof.parameters.peakFeetPerSecond, 18);
  assert.equal(proof.parameters.accelerationFeetPerSecondSquared, 30);
  assert.equal(proof.parameters.paddleReachFeet, 3);
  assert.equal(proof.parameters.allowanceLipschitzFeetPerSecond, 18);
});

test('a reachable cusp between all initial endpoint and midpoint samples is never certified', () => {
  const crossing = 1 / 128, speed = 2048;
  const input = line({ from: -speed * crossing, speed, origins: [0, 10000] });
  const coarse = Array.from({ length: 65 }, (_, index) => {
    const time = index / 64;
    return Math.abs(input.solved.sampleBoard(time).x) - 3 - allowance(time);
  });
  assert.ok(Math.min(...coarse) > 10, 'all initial proof samples appear out of reach');
  assert.equal(input.solved.sampleBoard(crossing).x, 0);
  assert.ok(analyticMinimum(input, 0) < 0);
  assert.equal(certify(input), null, 'the whole-interval penalty must trigger refinement into the missed contact');
});

test('depth exhaustion stays uncertain while a positive leaf at the exact depth limit is allowed', () => {
  const atLimit = certify(line({ origins: [10.50005, 50] }));
  assert.ok(atLimit); assert.equal(atLimit.actors[0].maxDepthUsed, 12);
  assert.ok(atLimit.actors[0].continuousLowerBoundFeet <= .00005 + 1e-12);
  const unresolved = line({ origins: [10.5000002, 50] });
  assert.ok(analyticMinimum(unresolved, 10.5000002) > 1e-7);
  assert.equal(certify(unresolved), null, 'a true but unresolved tiny exclusion is not an accepted proof');
  for (const origin of [10.5, 10.5000001, 10.49]) assert.equal(certify(line({ origins: [origin, 50] })), null);
});

test('the 8192 interval budget covers every stage and is enforced per actor, not silently truncated', () => {
  const manyStages = count => {
    const input = line();
    input.solved.stages = Array.from({ length: count }, (_, index) => ({
      from: { x: 0, y: 0 }, startTime: index / count, endTime: (index + 1) / count, vx: 0, vz: 0,
    }));
    return input;
  };
  const exactBudget = certify(manyStages(256)); assert.ok(exactBudget);
  for (const actor of exactBudget.actors) {
    assert.equal(actor.intervalEvaluations, 8192); assert.equal(actor.leafIntervals, 8192); assert.equal(actor.maxDepthUsed, 0);
  }
  assert.equal(certify(manyStages(257)), null, 'unproved final stages cannot be dropped');
});

test('positive clock gaps, overlaps, missing coverage and spatial jumps fail closed', () => {
  const two = () => {
    const input = line({ speed: 1 });
    input.solved.stages = [
      { from: { x: 0, y: 0 }, startTime: 0, endTime: .5, vx: 1, vz: 0 },
      { from: { x: .5, y: 0 }, startTime: .5, endTime: 1, vx: 1, vz: 0 },
    ];
    return input;
  };
  assert.ok(certify(two()));
  for (const gap of [Number.EPSILON, 1e-12, .001]) {
    for (const sign of [-1, 1]) {
      const input = two(); input.solved.stages[1].startTime += sign * gap; assert.equal(certify(input), null);
    }
  }
  const missing = two(); missing.solved.stages.pop(); assert.equal(certify(missing), null);
  const jump = two(); jump.solved.stages[1].from.x += .01;
  jump.solved.sampleBoard = time => ({ x: time + (time < .5 ? 0 : .01), y: 0 });
  assert.equal(certify(jump), null, 'a self-consistent callback cannot hide a discontinuous stage boundary');
});

test('malformed numeric geometry, unsplittable clocks, callback errors and momentum cannot borrow the theorem', () => {
  for (const mutate of [
    input => { input.solved.stages[0].from.x = NaN; },
    input => { input.solved.stages[0].vx = Infinity; },
    input => { input.solved.stages[0].from.x = Number.MAX_VALUE; input.solved.stages[0].vx = Number.MAX_VALUE; },
    input => { input.solved.sampleBoard = () => { throw Error('not a solved flight'); }; },
    input => { input.solved.sampleBoard = () => ({ x: NaN, y: 0 }); },
    input => { input.solved.sampleBoard = () => ({ x: 1, y: 0 }); },
    input => { input.segment.contactTime = Number.MAX_VALUE; },
    input => { input.segment.model2Momentum = [{ actor: 'player1' }]; },
    input => { input.segment.model2Momentum = new Array(1); },
    input => { input.play.modelVersion = 1; },
    input => { input.segment.modelVersion = 1; },
  ]) {
    const input = line(); mutate(input); assert.equal(certify(input), null);
  }
  assert.equal(certify(line({ end: Number.MIN_VALUE })), null, 'underflow cannot turn unrepresentable intervals into coverage');
  assert.equal(certify(line({ origins: [11, 50], lead: .2 })), null, 'preparation time remains part of the defender budget');
});

test('relative affine geometry cannot lose a reachable displacement under a huge coordinate translation', () => {
  const unshifted = line({ speed: 10, end: .1, origins: [4, 6] });
  const shifted = line({ from: 1e16, speed: 10, end: .1, origins: [1e16 + 4, 1e16 + 6] });
  assert.ok(analyticMinimum(unshifted, 4) < 0);
  assert.equal(certify(unshifted), null);
  assert.equal(certify(shifted), null,
    'rounding 1e16+10*t before subtracting the defender must not erase a real one-foot endpoint displacement');
});

test('sparse/accessor actor arrays and nested proof getters are rejected without executing them', () => {
  const proof = certify(line()); assert.ok(proof); let reads = 0;
  const getter = () => { reads++; throw Error('proof getters must not execute'); };
  const arrays = [new Array(2), [proof.actors[0], ,], [, proof.actors[1]]];
  const indexed = [...proof.actors]; Object.defineProperty(indexed, '0', { get: getter }); arrays.push(indexed);
  const method = [...proof.actors]; Object.defineProperty(method, 'every', { get: getter }); arrays.push(method);
  const inherited = new Array(2); Object.setPrototypeOf(inherited, { 0: proof.actors[0], 1: proof.actors[1] }); arrays.push(inherited);
  class ActorArray extends Array {} arrays.push(new ActorArray(...proof.actors));
  const symbol = [...proof.actors]; symbol[Symbol('extra')] = true; arrays.push(symbol);
  for (const actors of arrays) {
    const malformed = { ...proof, actors };
    assert.equal(validGeneratedRouteCertificateShapeV3(malformed), false);
    assert.equal(matchesGeneratedRouteCertificateV3(malformed, proof), false);
    assert.equal(matchesGeneratedRouteCertificateV3(proof, malformed), false);
  }
  for (const path of ['version', 'actors', 'origin', 'coordinate', 'parameter', 'counter']) {
    const malformed = structuredClone(proof);
    if (path === 'version') Object.defineProperty(malformed, 'version', { get: getter });
    if (path === 'actors') Object.defineProperty(malformed, 'actors', { get: getter });
    if (path === 'origin') Object.defineProperty(malformed.actors[0], 'origin', { get: getter });
    if (path === 'coordinate') Object.defineProperty(malformed.actors[0].origin, 'x', { get: getter });
    if (path === 'parameter') Object.defineProperty(malformed.parameters, 'maxRefinementDepth', { get: getter });
    if (path === 'counter') Object.defineProperty(malformed.actors[0], 'leafIntervals', { get: getter });
    assert.equal(validGeneratedRouteCertificateShapeV3(malformed), false);
  }
  assert.equal(reads, 0);
});

test('fixed policy, exact adaptive counters and declared geometry cannot be changed in a matching proof', () => {
  const proof = certify(line({ origins: [10.5005, 50] })); assert.ok(proof);
  assert.equal(matchesGeneratedRouteCertificateV3(structuredClone(proof), proof), true);
  const rounded = JSON.parse(JSON.stringify(proof, (_, value) => typeof value === 'number' ? Math.round(value * 1e9) / 1e9 : value));
  assert.equal(matchesGeneratedRouteCertificateV3(rounded, proof), true);
  for (const mutate of [
    value => { value.version = 'generated-contact-endpoint-route-v2'; },
    value => { value.applicability = 'universal-human-unreachability'; },
    value => { value.parameters.allowanceLipschitzFeetPerSecond = 9; },
    value => { value.parameters.maxIntervalEvaluationsPerActor = 8193; },
    value => { value.actors[0].leafIntervals = 1.5; },
    value => { value.actors[0].intervalEvaluations = 8193; },
    value => { value.actors[0].maxDepthUsed = 13; },
    value => { value.actors[0].continuousLowerBoundFeet = 0; },
    value => { value.actors[1].actor = value.actors[0].actor; },
    value => { value.actors[0].extra = true; },
  ]) {
    const malformed = structuredClone(proof); mutate(malformed);
    assert.equal(validGeneratedRouteCertificateShapeV3(malformed), false);
    assert.equal(matchesGeneratedRouteCertificateV3(malformed, proof), false);
  }
  for (const mutate of [
    value => { value.actors[0].leafIntervals++; },
    value => { value.actors[0].intervalEvaluations++; },
    value => { value.actors[0].maxDepthUsed--; },
    value => { value.actors[0].origin.x += .001; },
    value => { value.actors[0].continuousLowerBoundFeet += .001; },
    value => { value.throughSeconds += .001; },
    value => { value.actors.reverse(); },
  ]) {
    const altered = structuredClone(proof); mutate(altered);
    assert.equal(matchesGeneratedRouteCertificateV3(altered, proof), false);
    assert.equal(matchesGeneratedRouteCertificateV3(proof, altered), false);
  }
});


function publicSource(row) {
  const document = structuredClone(row.document), prefix = compileDocument(document);
  const segment = prefix.timeline.segments.at(-1), solved = solveFlightV2(segment.step.shot.physicsV2);
  const certificate = certifyGeneratedRouteExclusionV3(prefix.play, segment, solved);
  assert.ok(certificate);
  const point = solved.sampleBoard(solved.secondBounceTime);
  document.ending = 'winner';
  document.outcome = {
    type: 'fault', reason: 'second-bounce', shotId: document.shots.at(-1).id,
    winner: document.players[document.shots.at(-1).hitter].team,
    faultingActor: [...certificate.actors].sort((a, b) => a.continuousLowerBoundFeet - b.continuousLowerBoundFeet
      || a.actor.localeCompare(b.actor))[0].actor,
    ruleRef: '10.B.1', evidence: {
      position: { x: point.x, y: point.y, heightFeet: point.heightFeet },
      afterContactSeconds: solved.secondBounceTime, generatedRouteCertificate: certificate,
    },
  };
  return { document, certificate, prefix, segment, solved };
}
const frozenWitnesses = JSON.parse(readFileSync(new URL('./fixtures/model2/generated-route-exclusion-v3-witnesses.json', import.meta.url), 'utf8'));

test('all eight historical geometries admit only independently recomputed V3 rule faults, not universal winners', () => {
  const bytes = JSON.stringify(frozenWitnesses);
  for (const row of frozenWitnesses.cases) {
    const { document, certificate, prefix, segment, solved } = publicSource(row);
    const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
    assert.equal(compiled.validShotCount, document.shots.length, row.id);
    assert.deepEqual(compiled.findings.filter(item => item.severity === 'error'), [], row.id);
    assert.equal(rules.valid, true); assert.equal(rules.expectedOutcomes.length, 1);
    const terminal = rules.expectedOutcomes[0];
    assert.equal(terminal.reason, 'second-bounce'); assert.equal(terminal.reach.unreachable, false);
    assert.equal(matchesGeneratedRouteCertificate(certificate, terminal.generatedRouteCertificate), true);
    assert.equal(classifyOutcomeV1({ document, outcome: document.outcome, terminalEvidence: terminal }).kind, 'rule-fault');
    assert.equal(certifyGeneratedRouteExclusion(prefix.play, segment, solved).version, GENERATED_ROUTE_CERTIFICATE_VERSION_V3);
    for (const version of ['generated-contact-endpoint-route-v1', 'generated-contact-endpoint-route-v2', 'unknown']) {
      assert.equal(certifyGeneratedRouteExclusion(prefix.play, segment, solved, { version }), null,
        'declared old or unknown versions cannot fall through to a stronger theorem');
    }
  }
  assert.equal(JSON.stringify(frozenWitnesses), bytes);
});

test('public source validation rejects changed V3 counters, margins, origins, geometry and borrowed versions', () => {
  const { document } = publicSource(frozenWitnesses.cases[0]);
  for (const mutate of [
    value => { value.outcome.evidence.generatedRouteCertificate.actors[0].leafIntervals++; },
    value => { value.outcome.evidence.generatedRouteCertificate.actors[0].intervalEvaluations++; },
    value => { value.outcome.evidence.generatedRouteCertificate.actors[0].maxDepthUsed++; },
    value => { value.outcome.evidence.generatedRouteCertificate.actors[0].continuousLowerBoundFeet += .001; },
    value => { value.outcome.evidence.generatedRouteCertificate.actors[0].origin.x += .001; },
    value => { value.outcome.evidence.generatedRouteCertificate.throughSeconds += .001; },
    value => { value.shots.at(-1).target.x += .001; },
  ]) {
    const altered = structuredClone(document); mutate(altered);
    const compiled = compileDocument(altered);
    assert.ok(compiled.findings.some(item => item.severity === 'error'), JSON.stringify(compiled.findings));
    const rules = validateRallyRules(compiled.play, compiled.timeline);
    assert.ok(rules.violations.some(item => item.code === 'outcome-generated-route-certificate'), JSON.stringify(rules.violations));
  }
  for (const mutate of [
    value => { value.outcome.evidence.generatedRouteCertificate.version = 'generated-contact-endpoint-route-v2'; },
    value => { value.outcome.evidence.generatedRouteCertificate.version = 'unknown'; },
    value => { value.outcome.evidence.generatedRouteCertificate.parameters.accelerationFeetPerSecondSquared = 31; },
    value => { value.outcome.evidence.generatedRouteCertificate.parameters.maxRefinementDepth = 13; },
  ]) {
    const altered = structuredClone(document); mutate(altered);
    assert.throws(() => compileDocument(altered), /generatedRouteCertificate/);
  }
});
