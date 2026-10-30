import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleMomentumV2, sampleActorBoardPositionV2, sampleActorFeetV2 } from '../play-actors-v2.js';
import { compileDocument } from '../play-compiler.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';

// Literal sampler reference from 63016b5cf700fbe0f8e646b4498be29ec6b3f14b.
// Keep the old expression order, stable sort and reverse/find semantics here.
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t < .5 ? 2 * t * t : 1 - (1 - t) ** 2 * 2; };
const blend = (a, b, t) => Object.freeze({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const center = feet => ({ x: (feet[0].x + feet[1].x) / 2, y: (feet[0].y + feet[1].y) / 2 });
function referenceMomentum(evidence, actor, absoluteTime) {
  const candidates = (evidence || []).filter(item => item.actor === actor && item.contactTime <= absoluteTime + 1e-9);
  const active = candidates.sort((a, b) => b.contactTime - a.contactTime)[0];
  if (!active) return null;
  const duration = active.time - active.contactTime;
  const progress = duration > 0 ? clamp((absoluteTime - active.contactTime) / duration) : 1;
  return blend(active.from, active.to, progress);
}
function referencePosition(segment, actor, localTime) {
  if (segment?.modelVersion !== 2 || !Number.isFinite(localTime)) throw new TypeError('A model 2 segment and finite actor sample time are required.');
  const from = segment.previous.positions[actor], to = segment.step.positions[actor];
  if (!from || !to) throw new TypeError('Model 2 actor positions must be represented at both boundaries.');
  const absoluteTime = segment.startTime + localTime;
  const momentum = referenceMomentum(segment.model2Momentum, actor, absoluteTime);
  if (momentum) return momentum;
  const duration = segment.originalDuration ?? segment.duration;
  const time = Math.max(0, Math.min(duration, localTime));
  if (segment.shotSemantics?.playerId === actor && segment.shotSemantics.contact.feet.length === 2) {
    const plant = center(segment.shotSemantics.contact.feet);
    const contact = segment.contactTime;
    if (time <= contact) return blend(from, plant, contact > 0 ? ease(time / contact) : 1);
    const release = Math.min(duration, contact + .12);
    if (time <= release) return Object.freeze(plant);
    return blend(plant, to, ease((time - release) / Math.max(.001, duration - release)));
  }
  return blend(from, to, ease(time / Math.max(.001, duration)));
}
function referenceFeet(segment, actor, localTime) {
  const absoluteTime = segment.startTime + localTime;
  const active = [...(segment.model2Momentum || [])].reverse().find(item => item.actor === actor && item.contactTime <= absoluteTime + 1e-9);
  if (active) {
    const progress = clamp((absoluteTime - active.contactTime) / Math.max(.001, active.time - active.contactTime));
    return active.fromFeet.map((foot, index) => blend(foot, active.feet[index], progress));
  }
  const at = referencePosition(segment, actor, localTime);
  const feet = segment.shotSemantics?.playerId === actor ? segment.shotSemantics.contact.feet : segment.nextShotSemantics?.playerId === actor ? segment.nextShotSemantics.contact.feet : null;
  const origin = feet?.length === 2 ? center(feet) : at;
  return (feet?.length === 2 ? feet : [{ x: at.x - .42, y: at.y }, { x: at.x + .42, y: at.y }]).map(foot => Object.freeze({ x: at.x + foot.x - origin.x, y: at.y + foot.y - origin.y }));
}

const actors = ['player1', 'player2', 'player3', 'player4'];
const feet = [{ x: 4.58, y: 14 }, { x: 5.42, y: 14 }];
const momentum = (contactTime, time, x, actor = 'player1') => ({ actor, contactTime, time,
  from: { x: 5, y: 14 }, to: { x, y: 16 }, fromFeet: feet,
  feet: [{ x: x - .42, y: 16 }, { x: x + .42, y: 16 }] });
function segment(model2Momentum, overrides = {}) {
  return { modelVersion: 2, startTime: 0, duration: 1.5, originalDuration: 1.3, contactTime: .25,
    previous: { positions: { player1: { x: 5, y: 12 }, player2: { x: 15, y: 12 }, player3: { x: 5, y: 32 }, player4: { x: 15, y: 32 } } },
    step: { positions: { player1: { x: 6, y: 14 }, player2: { x: 16, y: 14 }, player3: { x: 6, y: 30 }, player4: { x: 16, y: 30 } } },
    shotSemantics: { playerId: 'player1', contact: { feet } },
    nextShotSemantics: { playerId: 'player3', contact: { feet: [{ x: 4.58, y: 30 }, { x: 5.42, y: 30 }] } }, model2Momentum, ...overrides };
}
function result(call, args) {
  try { return { value: call(...args) }; } catch (error) { return { error: { name: error.name, message: error.message } }; }
}
function assertExact(actual, expected) {
  assert.deepEqual(actual, expected);
  if (actual && typeof actual === 'object') {
    assert.deepEqual(Reflect.ownKeys(actual), Reflect.ownKeys(expected));
    assert.deepEqual(Object.getOwnPropertyDescriptors(actual), Object.getOwnPropertyDescriptors(expected));
    assert.equal(Object.isFrozen(actual), Object.isFrozen(expected));
    if (Array.isArray(actual)) for (let index = 0; index < actual.length; index++) if (index in actual) assertExact(actual[index], expected[index]);
  }
}

test('continuous routes, feet, activation, hold and release samples exactly match frozen 63016b5', () => {
  const mixed = [momentum(.7, 1.1, 9), momentum(.2, .5, 7), momentum(.7, 1.2, 11), momentum(.4, .9, 18, 'player2')];
  const cases = [segment(undefined), segment([]), segment(mixed), segment([...mixed].reverse()),
    segment([momentum(.3, .3, 12)]), segment([momentum(.3, .1, 13)]),
    segment([], { contactTime: 0, originalDuration: 0 }), segment([], { originalDuration: .0001 }),
    segment(mixed, { startTime: .375 }), segment([], { shotSemantics: undefined, nextShotSemantics: undefined })];
  const times = [...new Set([...Array.from({ length: 1001 }, (_, index) => index * .002 - .1),
    .2 - 1.000001e-9, .2 - 1e-9, .2, .25 - 1e-12, .25, .25 + 1e-12, .3 - 1e-9, .3, .37 - 1e-12, .37, .37 + 1e-12, .7 - 1e-9, .7, 1.3, 1.5])];
  const before = JSON.stringify(cases);
  for (const value of cases) for (const actor of actors) for (const time of times) {
    assertExact(sampleActorBoardPositionV2(value, actor, time), referencePosition(value, actor, time));
    assertExact(sampleActorFeetV2(value, actor, time), referenceFeet(value, actor, time));
    assertExact(sampleMomentumV2(value.model2Momentum, actor, value.startTime + time), referenceMomentum(value.model2Momentum, actor, value.startTime + time));
  }
  assert.equal(JSON.stringify(cases), before);
  assert.notEqual(sampleActorBoardPositionV2(cases[0], 'player1', .8), sampleActorBoardPositionV2(cases[0], 'player1', .8), 'samples remain fresh immutable results');
  assert.notEqual(sampleActorFeetV2(cases[0], 'player1', .8), sampleActorFeetV2(cases[0], 'player1', .8), 'feet arrays remain fresh caller-owned arrays');
});

test('position stable-time ties and feet reverse-array ties retain their distinct historical meanings', () => {
  const first = momentum(.7, 1, 9), second = momentum(.7, 1, 11), older = momentum(.2, .5, 13);
  assert.deepEqual(sampleMomentumV2([first, second, older], 'player1', 2), first.to, 'stable time sort keeps the first latest entry');
  assert.deepEqual(sampleActorFeetV2(segment([first, second, older]), 'player1', 2), older.feet, 'feet keep the last active array entry even when it is older');
  assert.deepEqual(sampleActorFeetV2(segment([first, second]), 'player1', 2), second.feet);
  const numericStrings = [momentum('2', 20, 8), momentum('10', 20, 12)];
  assertExact(sampleMomentumV2(numericStrings, 'player1', 15), referenceMomentum(numericStrings, 'player1', 15), 'selection preserves numeric subtraction semantics');
});

test('compiled physical fixtures retain exact continuous samples through momentum and terminal holds', () => {
  for (const id of ['transition-volley', 'variable-bounced-contact', 'nvz-momentum-after-dead', 'earlier-momentum-overrides-later-fault']) {
    const compiled = compileDocument(readModel2Fixture(id));
    for (const value of compiled.timeline.segments) for (const actor of actors) {
      const times = [...Array.from({ length: 257 }, (_, index) => value.duration * index / 256),
        value.contactTime, value.contactTime + .12, value.duration + .1];
      for (const time of times) {
        assertExact(sampleActorBoardPositionV2(value, actor, time), referencePosition(value, actor, time));
        assertExact(sampleActorFeetV2(value, actor, time), referenceFeet(value, actor, time));
      }
    }
  }
});

test('sparse/custom evidence, invalid boundaries and nonfinite times retain outputs and exact exceptions', () => {
  const sparse = []; sparse.length = 2; sparse[1] = momentum(.2, .5, 7);
  const customFilter = [momentum(.2, .5, 7)]; customFilter.filter = () => [momentum(.7, 1, 19)];
  const customIterator = [momentum(.2, .5, 7)]; customIterator[Symbol.iterator] = function* () { yield momentum(.4, .8, 18); };
  class EvidenceArray extends Array {}
  const subclass = new EvidenceArray(momentum(.2, .5, 7), momentum(.4, .8, 18));
  for (const evidence of [undefined, null, false, 0, '', NaN, 7, 'bad', {}, new Set([momentum(.2, .5, 7)]),
    new Float64Array([1, 2]), [null], sparse, customFilter, customIterator, subclass,
    [momentum(NaN, 1, 9), momentum(Infinity, Infinity, 12), momentum(-Infinity, 1, 8)]]) {
    for (const time of [-Infinity, NaN, Infinity, -.1, .2 - 1e-9, .2, .7, 2]) {
      assertExact(result(sampleMomentumV2, [evidence, 'player1', time]), result(referenceMomentum, [evidence, 'player1', time]));
      assertExact(result(sampleActorFeetV2, [segment(evidence), 'player1', time]), result(referenceFeet, [segment(evidence), 'player1', time]));
    }
  }
  for (const value of [undefined, null, {}, segment([], { modelVersion: 1 }), segment([], { previous: undefined }),
    segment([], { previous: { positions: {} } }), segment([], { shotSemantics: { playerId: 'player1', contact: {} } })]) {
    for (const time of [NaN, Infinity, -.1, .3, 2]) {
      assertExact(result(sampleActorBoardPositionV2, [value, 'player1', time]), result(referencePosition, [value, 'player1', time]));
      assertExact(result(sampleActorFeetV2, [value, 'player1', time]), result(referenceFeet, [value, 'player1', time]));
    }
  }
});

test('paired sampler microbenchmark retains exact checksums without a timing-dependent acceptance gate', t => {
  const cases = [segment([]), segment(undefined), segment([]), segment([momentum(.7, 1.1, 9), momentum(.2, .5, 7), momentum(.7, 1.2, 11)])];
  function run(position, sampleFeet, count) {
    let checksum = 0; const started = performance.now();
    for (let index = 0; index < count; index++) {
      const value = cases[(index >> 2) % cases.length], actor = actors[index % actors.length], time = (index % 127) * .013 - .05;
      const at = position(value, actor, time), points = sampleFeet(value, actor, time); checksum += at.x + at.y + points[0].x + points[1].y;
    }
    return { ms: performance.now() - started, checksum };
  }
  run(referencePosition, referenceFeet, 5000); run(sampleActorBoardPositionV2, sampleActorFeetV2, 5000);
  const reference = [], current = [];
  for (let round = 0; round < 5; round++) {
    reference.push(run(referencePosition, referenceFeet, 10000)); current.push(run(sampleActorBoardPositionV2, sampleActorFeetV2, 10000));
    assert.equal(current[round].checksum, reference[round].checksum);
  }
  const median = rows => rows.map(row => row.ms).sort((a, b) => a - b)[2];
  t.diagnostic(JSON.stringify({ samplesPerRound: 20000, referenceMedianMs: median(reference), currentMedianMs: median(current),
    note: 'Observational microbenchmark only; full generation performance is measured independently.' }));
});
