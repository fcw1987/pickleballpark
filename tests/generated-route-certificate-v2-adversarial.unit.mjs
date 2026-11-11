import test from 'node:test';
import assert from 'node:assert/strict';
import { certifyGeneratedRouteExclusionV1 } from '../generated-route-certificate-v1.js';
import { certifyGeneratedRouteExclusionV2, validGeneratedRouteCertificateShapeV2, matchesGeneratedRouteCertificateV2 } from '../generated-route-certificate-v2.js';

const players = {player1: {team: 'green'}, player2: {team: 'green'}, player3: {team: 'orange'}, player4: {team: 'orange'}};
function stationary(distance, {end = 1, lead = 0} = {}) {
  return {play: {modelVersion: 2, players}, segment: {modelVersion: 2, contactTime: lead, model2Momentum: [],
    shotSemantics: {playerId: 'player3'}, previous: {positions: {player1: {x: distance, y: 0}, player2: {x: distance + 2, y: 0}}}},
    solved: {secondBounceTime: end, stages: [{from: {x: 0, y: 0, heightFeet: .1}, startTime: 0, endTime: end, vx: 0, vz: 0}],
      sampleBoard: () => ({x: 0, y: 0, heightFeet: .1})}};
}
const certificate = input => certifyGeneratedRouteExclusionV2(input.play, input.segment, input.solved);
const allowance = time => Math.min(18 * time / 2, 30 * time * time / 4);

test('acceleration exclusion remains a rest-to-rest endpoint theorem with all preparation time available', () => {
  const input = stationary(11), source = JSON.stringify({play: input.play, segment: input.segment, stages: input.solved.stages});
  const current = certificate(input); assert.ok(current);
  assert.equal(certifyGeneratedRouteExclusionV1(input.play, input.segment, input.solved), null);
  assert.ok(Math.abs(current.actors[0].continuousLowerBoundFeet - (11 - 3 - 7.5 - 18 / 1024)) < 1e-12);
  assert.equal(certificate(stationary(10.5)), null, 'exact reachable boundary is never exclusion');
  assert.equal(certificate(stationary(11, {lead: .2})), null, 'preparation is usable time even before ball launch');
  assert.equal(certificate(stationary(11, {lead: 2})), null);
  assert.equal(certificate(stationary(4.4, {end: .5})), null, 'a time-feasible intermediate2.525ft paddle plant cannot be relabeled a winner because an older stance grid missed it');
  assert.equal(JSON.stringify({play: input.play, segment: input.segment, stages: input.solved.stages}), source);
});

test('the full 18-Lipschitz penalty remains valid on both sides of the 1.2-second crossover', () => {
  const h = 1e-6, leftSlope = (allowance(1.2) - allowance(1.2 - h)) / h;
  assert.ok(leftSlope > 17.99 && leftSlope <= 18);
  for (const end of [1.199999, 1.2, 1.200001, 1.7]) {
    const input = stationary(allowance(end) + 3.1, {end}), current = certificate(input); assert.ok(current);
    const lower = current.actors[0].continuousLowerBoundFeet;
    assert.ok(Math.abs(lower - (.1 - 18 * end / 1024)) < 1e-12);
    for (let i = 0; i <= 10000; i++) assert.ok(input.segment.previous.positions.player1.x - 3 - allowance(end * i / 10000) >= lower);
    const forged = structuredClone(current); forged.parameters.allowanceLipschitzFeetPerSecond = 9;
    assert.equal(validGeneratedRouteCertificateShapeV2(forged), false);
    assert.equal(matchesGeneratedRouteCertificateV2(forged, current), false);
  }
});

test('a very fast between-grid paddle opportunity cannot acquire a sampled-only winner proof', () => {
  const input = stationary(0), speed = 1e7, crossing = .5005;
  input.solved.stages[0] = {from: {x: -speed * crossing, y: 0, heightFeet: .1}, startTime: 0, endTime: 1, vx: speed, vz: 0};
  input.solved.sampleBoard = time => ({x: speed * (time - crossing), y: 0, heightFeet: .1});
  const sampledMinimum = Math.min(...Array.from({length: 513}, (_, i) => Math.abs(speed * (i / 512 - crossing)) - 3 - allowance(i / 512)));
  assert.ok(sampledMinimum > 1000, 'every coarse sample appears unreachable');
  assert.equal(input.solved.sampleBoard(crossing).x, 0, 'the real between-grid point is at the defender');
  assert.equal(certificate(input), null, 'the Lipschitz interval penalty prevents the false certificate');
});

test('actual momentum, malformed model applicability and missing stage coverage cannot borrow the theorem', () => {
  for (const momentum of [[{actor: 'player3'}], new Array(1), null, {}]) {
    const input = stationary(50); input.segment.model2Momentum = momentum; assert.equal(certificate(input), null);
  }
  for (const mutate of [
    input => {input.play.modelVersion = 1;}, input => {input.segment.modelVersion = 1;},
    input => {input.segment.shotSemantics.playerId = 'ball';},
    input => {input.play.players = {...players, player2: {team: 'orange'}};},
    input => {input.solved.stages = [{...input.solved.stages[0], startTime: Number.EPSILON}];},
  ]) { const input = stationary(50); mutate(input); assert.equal(certificate(input), null); }
});

test('sparse, inherited, accessor and nonordinary actor arrays are rejected without executing entries', () => {
  const current = certificate(stationary(50)); let reads = 0;
  const arrays = [new Array(2), [current.actors[0], ,], [, current.actors[1]]];
  const accessor = [...current.actors];
  Object.defineProperty(accessor, '0', {get() {reads++; throw Error('must not run actor getter');}, configurable: true});
  arrays.push(accessor);
  const inherited = new Array(2); Object.setPrototypeOf(inherited, {0: current.actors[0], 1: current.actors[1]}); arrays.push(inherited);
  class Entries extends Array {} arrays.push(new Entries(...current.actors));
  const method = [...current.actors]; Object.defineProperty(method, 'every', {get() {reads++; throw Error('must not run custom every');}}); arrays.push(method);
  const decorated = [...current.actors]; decorated.extra = true; arrays.push(decorated);
  const symbol = [...current.actors]; symbol[Symbol('extra')] = true; arrays.push(symbol);
  for (const actors of arrays) {
    const declared = {...current, actors};
    assert.doesNotThrow(() => assert.equal(validGeneratedRouteCertificateShapeV2(declared), false));
    assert.equal(matchesGeneratedRouteCertificateV2(declared, current), false);
    assert.equal(matchesGeneratedRouteCertificateV2(current, declared), false);
  }
  assert.equal(reads, 0);
});

test('nested proof getters are rejected without execution and ordinary frozen JSON proofs remain valid', () => {
  const current = certificate(stationary(50)); let reads = 0;
  for (const path of ['actors', 'origin', 'coordinate', 'parameter', 'actor']) {
    const declared = structuredClone(current), get = () => {reads++; throw Error('untrusted getter');};
    if (path === 'actors') Object.defineProperty(declared, 'actors', {get});
    if (path === 'origin') Object.defineProperty(declared.actors[0], 'origin', {get});
    if (path === 'coordinate') Object.defineProperty(declared.actors[0].origin, 'x', {get});
    if (path === 'parameter') Object.defineProperty(declared.parameters, 'accelerationFeetPerSecondSquared', {get});
    if (path === 'actor') Object.defineProperty(declared.actors[0], 'actor', {get});
    assert.equal(validGeneratedRouteCertificateShapeV2(declared), false);
  }
  const frozen = JSON.parse(JSON.stringify(current)); Object.freeze(frozen.actors[0]); Object.freeze(frozen.actors[1]); Object.freeze(frozen.actors); Object.freeze(frozen);
  assert.equal(validGeneratedRouteCertificateShapeV2(frozen), true);
  assert.equal(matchesGeneratedRouteCertificateV2(frozen, current), true);
  assert.equal(reads, 0);
});

test('observed callback disagreement cannot replace the finite canonical affine trajectory', () => {
  for (const sampleBoard of [
    () => ({x: 1, y: 0}), () => ({x: 50, y: 0}),
    time => ({x: time, y: time}), () => ({x: NaN, y: 0}),
  ]) {
    const input = stationary(50); input.solved.sampleBoard = sampleBoard;
    assert.equal(certificate(input), null);
  }
  const canonical = stationary(50), repeated = certificate(canonical);
  assert.ok(repeated); assert.deepEqual(certificate(canonical), repeated);
});

test('missing, nonfinite or overflowing stage origins cannot acquire an affine proof', () => {
  for (const from of [undefined, null, {}, {x: NaN, y: 0}, {x: 0, y: Infinity}]) {
    const input = stationary(50); input.solved.stages[0].from = from;
    assert.equal(certificate(input), null);
  }
  const overflow = stationary(50); overflow.solved.stages[0].from.x = Number.MAX_VALUE; overflow.solved.stages[0].vx = Number.MAX_VALUE;
  assert.equal(certificate(overflow), null);
});

test('a spatial discontinuity is rejected even when the callback reports each mismatched stage consistently', () => {
  const make = displacement => {
    const input = stationary(50);
    input.solved.stages = [
      {from: {x: 0, y: 0}, startTime: 0, endTime: .5, vx: 1, vz: 0},
      {from: {x: .5 + displacement, y: 0}, startTime: .5, endTime: 1, vx: 1, vz: 0},
    ];
    input.solved.sampleBoard = time => ({x: time + (time < .5 ? 0 : displacement), y: 0});
    return input;
  };
  for (const displacement of [-.1, .1, 1e-8]) assert.equal(certificate(make(displacement)), null);
  const exact = certificate(make(0)), roundoff = certificate(make(Number.EPSILON * 2));
  assert.ok(exact); assert.ok(roundoff, 'roundoff-sized joins do not become a new physical travel allowance');
  for (const [index, actor] of roundoff.actors.entries()) {
    assert.ok(Math.abs(actor.continuousLowerBoundFeet - exact.actors[index].continuousLowerBoundFeet) < 1e-12);
  }
});
