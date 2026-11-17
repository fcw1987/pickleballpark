import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileDocument} from '../play-compiler.js';
import {solveFlightV2} from '../play-physics-v2.js';
import {certifyGeneratedRouteExclusionV1} from '../generated-route-certificate-v1.js';
import {certifyGeneratedRouteExclusionV2} from '../generated-route-certificate-v2.js';
import {GENERATED_ROUTE_CERTIFICATE_VERSION_V3, certifyGeneratedRouteExclusionV3,
  validGeneratedRouteCertificateShapeV3, matchesGeneratedRouteCertificateV3} from '../generated-route-certificate-v3.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/model2/generated-route-exclusion-v3-witnesses.json', import.meta.url), 'utf8'));
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ids = {player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2'};
function mirror(value) {
  if (Array.isArray(value)) return value.map(mirror);
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [ids[key] ?? key, mirror(item)]));
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) {result.x = 20 - value.x; result.y = 44 - value.y;}
    return result;
  }
  return ids[value] ?? ({green: 'orange', orange: 'green'}[value]) ?? value;
}
function solve(document) {
  const compiled = compileDocument(document), segment = compiled.timeline.segments.at(-1);
  assert.equal(compiled.validShotCount, document.shots.length);
  assert.deepEqual(compiled.findings.filter(row => row.severity === 'error'), []);
  return {play: compiled.play, segment, solved: solveFlightV2(segment.step.shot.physicsV2)};
}

test('the eight witnesses retain exact failed-archive provenance and immutable reconstructed source bytes', () => {
  assert.equal(fixture.cases.length, 8);
  assert.equal(fixture.provenance.sourceRevision, '6e1e282a1d6c6080ebafccea6949a04c587f3811');
  assert.equal(fixture.provenance.archiveSha256, '909d3b4551e523973210492a369d209f89f1c429ea0a1ac8fd5d9cf35933c73d');
  for (const row of fixture.cases) {
    assert.equal(row.provenance.originalStatus, 'failed');
    assert.equal(row.provenance.originalCode, 'no-feasible-contact');
    assert.equal(row.provenance.reconstructedPrefixStatus, 'censored');
    assert.equal(row.provenance.prefixDrawsExactlyMatched, true);
    assert.equal(row.provenance.pendingOriginsExactlyMatched, true);
    assert.equal(row.provenance.restoredArchivedPendingRecipe, true);
    assert.equal(sha(row.document), row.provenance.documentSha256);
    assert.equal(row.document.ending, 'stop'); assert.equal(row.document.outcome, undefined);
    assert.equal(row.diagnosticDyadicProof.proven, true);
  }
});

for (const row of fixture.cases) for (const mirrored of [false, true]) {
  test(`adaptive proof covers the actual narrow positive endpoint margin: ${row.id} (${mirrored ? 'mirrored' : 'original'})`, () => {
    const document = mirrored ? mirror(row.document) : structuredClone(row.document), before = JSON.stringify(document);
    const {play, segment, solved} = solve(document);
    assert.equal(certifyGeneratedRouteExclusionV1(play, segment, solved), null);
    assert.equal(certifyGeneratedRouteExclusionV2(play, segment, solved), null, 'historical512-grid uncertainty stays unchanged');
    const certificate = certifyGeneratedRouteExclusionV3(play, segment, solved);
    assert.ok(certificate); assert.equal(certificate.version, GENERATED_ROUTE_CERTIFICATE_VERSION_V3);
    assert.equal(validGeneratedRouteCertificateShapeV3(certificate), true);
    if (!mirrored) assert.deepEqual(certificate, row.expectedAdaptiveCertificate);
    assert.equal(matchesGeneratedRouteCertificateV3(certificate, certifyGeneratedRouteExclusionV3(play, segment, solved)), true);
    for (const actor of certificate.actors) {
      assert.ok(actor.continuousLowerBoundFeet > 1e-7);
      assert.ok(actor.intervalEvaluations <= 8192 && actor.maxDepthUsed <= 12);
      assert.equal(actor.intervalEvaluations, 2 * actor.leafIntervals - 32 * solved.stages.length,
        'every initial interval is covered by a full binary refinement tree');
      for (let index = 0; index <= 8000; index++) {
        const time = solved.secondBounceTime * index / 8000, point = solved.sampleBoard(time), duration = segment.contactTime + time;
        const gap = Math.hypot(point.x - actor.origin.x, point.y - actor.origin.y) - 3 - Math.min(9 * duration, 7.5 * duration * duration);
        assert.ok(gap >= actor.continuousLowerBoundFeet - 1e-10);
      }
    }
    assert.equal(JSON.stringify(document), before);
  });
}

test('a reachable actor, extra preparation or active momentum cannot borrow an adaptive exclusion', () => {
  const {play, segment, solved} = solve(fixture.cases[0].document);
  const at = solved.sampleBoard(.52), positions = structuredClone(segment.previous.positions);
  positions.player1 = {x: at.x, y: at.y};
  assert.equal(certifyGeneratedRouteExclusionV3(play, {...segment, previous: {...segment.previous, positions}}, solved), null);
  assert.equal(certifyGeneratedRouteExclusionV3(play, {...segment, contactTime: .2}, solved), null);
  for (const model2Momentum of [[{actor: 'player1'}], null, {}]) {
    assert.equal(certifyGeneratedRouteExclusionV3(play, {...segment, model2Momentum}, solved), null);
  }
});

test('fixed policy and exact adaptive counters cannot be altered or borrowed across proof versions', () => {
  const source = solve(fixture.cases[0].document), proof = certifyGeneratedRouteExclusionV3(source.play, source.segment, source.solved);
  assert.deepEqual(proof.parameters, {peakFeetPerSecond: 18, accelerationFeetPerSecondSquared: 30,
    endpointFeetPerSecond: 9, endpointAccelerationFactor: 7.5, paddleReachFeet: 3, reactionSeconds: 0,
    initialIntervalsPerStage: 32, maxRefinementDepth: 12, maxIntervalEvaluationsPerActor: 8192, allowanceLipschitzFeetPerSecond: 18});
  for (const mutate of [
    c => {c.version = 'generated-contact-endpoint-route-v2';},
    c => {c.parameters.paddleReachFeet = 2.9;}, c => {c.parameters.allowanceLipschitzFeetPerSecond = 9;},
    c => {c.parameters.maxIntervalEvaluationsPerActor = 8193;},
    c => {c.actors[0].intervalEvaluations += .1;}, c => {c.actors[0].maxDepthUsed = 13;},
    c => {c.actors[0].leafIntervals = 0;}, c => {c.actors[0].continuousLowerBoundFeet = 1e-7;},
  ]) {
    const changed = structuredClone(proof); mutate(changed);
    assert.equal(validGeneratedRouteCertificateShapeV3(changed), false);
    assert.equal(matchesGeneratedRouteCertificateV3(changed, proof), false);
  }
  for (const key of ['intervalEvaluations', 'leafIntervals', 'maxDepthUsed']) {
    const changed = structuredClone(proof); changed.actors[0][key]++;
    assert.equal(validGeneratedRouteCertificateShapeV3(changed), true);
    assert.equal(matchesGeneratedRouteCertificateV3(changed, proof), false, 'integer work evidence requires an exact recomputed match');
  }
  const rounded = JSON.parse(JSON.stringify(proof, (_, value) => typeof value === 'number' ? Math.round(value * 1e9) / 1e9 : value));
  assert.equal(matchesGeneratedRouteCertificateV3(rounded, proof), true);
});
