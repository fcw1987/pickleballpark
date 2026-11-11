import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileDocument} from '../play-compiler.js';
import {solveFlightV2} from '../play-physics-v2.js';
import {certifyGeneratedRouteExclusionV1} from '../generated-route-certificate-v1.js';
import {GENERATED_ROUTE_CERTIFICATE_VERSION_V2, certifyGeneratedRouteExclusionV2,
  validGeneratedRouteCertificateShapeV2, matchesGeneratedRouteCertificateV2} from '../generated-route-certificate-v2.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/model2/generated-route-exclusion-50021-v2.json', import.meta.url), 'utf8'));
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
function source(mirrored = false) {
  const document = mirrored ? mirror(fixture.document) : structuredClone(fixture.document);
  const compiled = compileDocument(document), segment = compiled.timeline.segments.at(-1);
  assert.equal(compiled.validShotCount, 14); assert.deepEqual(compiled.findings.filter(row => row.severity === 'error'), []);
  const solved = solveFlightV2(segment.step.shot.physicsV2);
  return {document, play: compiled.play, segment, solved};
}

for (const mirrored of [false, true]) test(`actual Intermediate50021 overhead has continuous acceleration-only endpoint exclusion (${mirrored ? 'mirrored' : 'original'})`, () => {
  const {document, play, segment, solved} = source(mirrored), before = JSON.stringify(document);
  assert.equal(segment.contactTime, 0); assert.deepEqual(segment.model2Momentum, []);
  assert.equal(certifyGeneratedRouteExclusionV1(play, segment, solved), null, 'the historical speed-only theorem retains its uncertainty');
  const certificate = certifyGeneratedRouteExclusionV2(play, segment, solved);
  assert.ok(certificate); assert.equal(certificate.version, GENERATED_ROUTE_CERTIFICATE_VERSION_V2);
  assert.equal(validGeneratedRouteCertificateShapeV2(certificate), true);
  assert.deepEqual(certificate.parameters, {peakFeetPerSecond: 18, accelerationFeetPerSecondSquared: 30,
    endpointFeetPerSecond: 9, endpointAccelerationFactor: 7.5, paddleReachFeet: 3, reactionSeconds: 0,
    samplesPerStage: 512, allowanceLipschitzFeetPerSecond: 18});
  assert.equal(certificate.actors.length, 2);
  const margins = certificate.actors.map(row => row.continuousLowerBoundFeet).sort((a, b) => a - b);
  assert.ok(Math.abs(margins[0] - .12751953356261958) < 1e-8);
  assert.ok(Math.abs(margins[1] - 1.3624684417131494) < 1e-8);
  for (const row of certificate.actors) for (let index = 0; index <= 10000; index++) {
    const time = solved.secondBounceTime * index / 10000, ball = solved.sampleBoard(time), duration = segment.contactTime + time;
    const independent = Math.hypot(ball.x - row.origin.x, ball.y - row.origin.y) - 3 - Math.min(18 * duration / 2, 30 * duration * duration / 4);
    assert.ok(independent >= row.continuousLowerBoundFeet - 1e-10, 'dense independent witnesses cannot undercut the whole-interval lower bound');
  }
  assert.equal(JSON.stringify(document), before);
});

test('the acceleration fixture retains the exact serialized source and does not claim the failed request completed', () => {
  assert.equal(fixture.provenance.originalUncappedStatus, 'failed');
  assert.equal(fixture.provenance.prefixStatus, 'censored');
  assert.equal(fixture.document.ending, 'stop'); assert.equal(fixture.document.outcome, undefined);
  assert.equal(createHash('sha256').update(JSON.stringify(fixture.document)).digest('hex'), fixture.provenance.documentSha256);
});

test('a reachable defender or extra lead-in prevents an exclusion certificate', () => {
  const {play, segment, solved} = source();
  const at = solved.sampleBoard(.4058), close = structuredClone(segment.previous.positions);
  close.player2 = {x: at.x, y: at.y};
  assert.equal(certifyGeneratedRouteExclusionV2(play, {...segment, previous: {...segment.previous, positions: close}}, solved), null);
  assert.equal(certifyGeneratedRouteExclusionV2(play, {...segment, contactTime: .2}, solved), null, 'lead-in time belongs to the full route duration');
});

test('every positive coverage gap, overlapping stage, missing interval or invalid clock rejects proof', () => {
  const {play, segment, solved} = source();
  for (const gap of [Number.EPSILON, 1e-12, 1e-8, .001]) {
    const stages = solved.stages.map(stage => ({...stage})); stages[1].startTime += gap;
    assert.equal(certifyGeneratedRouteExclusionV2(play, segment, {...solved, stages}), null, `unproved ${gap}s gap`);
  }
  for (const mutate of [
    value => {value.stages[0].startTime = 1e-12;},
    value => {value.stages[1].startTime -= 1e-12;},
    value => {value.stages[1].endTime -= 1e-12;},
    value => {value.stages.pop();},
    value => {value.stages.reverse();},
    value => {value.stages[1].endTime = value.stages[1].startTime;},
    value => {value.stages[0].vx = Infinity;},
    value => {value.secondBounceTime = NaN;},
    value => {value.secondBounceTime = 0;},
  ]) {
    const changed = {...solved, stages: solved.stages.map(stage => ({...stage}))}; mutate(changed);
    assert.equal(certifyGeneratedRouteExclusionV2(play, segment, changed), null);
  }
  for (const contactTime of [-1, NaN, Infinity]) assert.equal(certifyGeneratedRouteExclusionV2(play, {...segment, contactTime}, solved), null);
});

test('momentum, unsupported models and malformed origins cannot acquire endpoint proofs', () => {
  const {play, segment, solved} = source();
  for (const model2Momentum of [[{actor: 'player1'}], {}, null]) assert.equal(certifyGeneratedRouteExclusionV2(play, {...segment, model2Momentum}, solved), null);
  assert.equal(certifyGeneratedRouteExclusionV2({...play, modelVersion: 1}, segment, solved), null);
  assert.equal(certifyGeneratedRouteExclusionV2(play, {...segment, modelVersion: 1}, solved), null);
  assert.equal(certifyGeneratedRouteExclusionV2(play, {...segment, previous: {positions: {}}}, solved), null);
  assert.equal(certifyGeneratedRouteExclusionV2(play, segment, {...solved, sampleBoard: () => ({x: NaN, y: 1})}), null);
});

test('strict v2 schema and recomputation reject tampering, borrowing, wrong versions and mutable parameters', () => {
  const {play, segment, solved} = source(), current = certifyGeneratedRouteExclusionV2(play, segment, solved);
  assert.ok(current); assert.equal(matchesGeneratedRouteCertificateV2(structuredClone(current), current), true);
  const rounded = JSON.parse(JSON.stringify(current, (_, value) => typeof value === 'number' ? Math.round(value * 1e9) / 1e9 : value));
  assert.equal(matchesGeneratedRouteCertificateV2(rounded, current), true);
  for (const mutate of [
    c => {c.version = 'generated-contact-endpoint-route-v1';}, c => {c.applicability = 'universal-human-reach';},
    c => {c.extra = true;}, c => {c.parameters.accelerationFeetPerSecondSquared = 31;},
    c => {c.parameters.allowanceLipschitzFeetPerSecond = 9;}, c => {delete c.parameters.reactionSeconds;},
    c => {c.actors.pop();}, c => {c.actors[1].actor = c.actors[0].actor;}, c => {c.actors[0].origin.z = 0;},
    c => {c.actors[0].continuousLowerBoundFeet = 0;}, c => {c.leadInSeconds = -1;}, c => {c.throughSeconds = Infinity;},
  ]) {
    const changed = structuredClone(current); mutate(changed);
    assert.equal(validGeneratedRouteCertificateShapeV2(changed), false);
    assert.equal(matchesGeneratedRouteCertificateV2(changed, current), false);
    assert.equal(matchesGeneratedRouteCertificateV2(current, changed), false);
  }
  for (const mutate of [
    c => {c.leadInSeconds += .0001;}, c => {c.throughSeconds += .0001;},
    c => {c.actors[0].origin.x += .0001;}, c => {c.actors[0].continuousLowerBoundFeet += .0001;}, c => {c.actors.reverse();},
  ]) {
    const changed = structuredClone(current); mutate(changed); assert.equal(matchesGeneratedRouteCertificateV2(changed, current), false);
  }
  let read = false; const accessor = {...current}; Object.defineProperty(accessor, 'throughSeconds', {get() {read = true; return 1;}});
  assert.equal(validGeneratedRouteCertificateShapeV2(accessor), false); assert.equal(read, false);
  assert.equal(matchesGeneratedRouteCertificateV2(current, null), false);
  current.parameters.peakFeetPerSecond = 99;
  assert.equal(certifyGeneratedRouteExclusionV2(play, segment, solved).parameters.peakFeetPerSecond, 18);
});
