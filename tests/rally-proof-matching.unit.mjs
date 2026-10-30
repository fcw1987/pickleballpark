import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2, inspectPlanningTrialContactV2 } from '../play-planning-v2.js';
import { model2Document } from './fixtures/model2/factories.mjs';

function prefix() {
  const document = JSON.parse(readFileSync(new URL('./fixtures/model2/off-apron-unreachable.json', import.meta.url)));
  const state = createPlanningStateV2(document);
  for (const recipe of document.shots.slice(0, 2)) commitPlanningTrialV2(state, trialRecipeV2(state, recipe));
  return { state, recipe: document.shots[2], document };
}
function fallback(state, recipe, probe) {
  const full = trialRecipeV2(state, recipe), reused = trialRecipeV2(state, recipe, { reusePreviousTrial: probe });
  assert.equal(reused.previousInspectionReused, false);
  assert.equal(reused.ok, full.ok);
  assert.deepEqual(reused.findings, full.findings);
  assert.deepEqual(reused.terminalBeforeNextContact, full.terminalBeforeNextContact);
}

for (const [name, value] of [
  ['undefined', undefined], ['NaN', NaN], ['infinity', Infinity], ['negative zero', -0],
  ['function', () => {}], ['symbol', Symbol('value')], ['bigint', 1n], ['boxed number', new Number(1)],
  ['date', new Date()], ['map', new Map()], ['set', new Set()], ['typed array', new Uint8Array(2)],
  ['sparse array', Array(2)], ['array with extra property', Object.assign([1], { extra: 2 })],
  ['array subclass', new (class extends Array {})(1, 2)]
]) test(`typed incoming proof rejects ${name} without reusing the full audit`, () => {
  const { state, recipe } = prefix();
  state.play.proofSentinel = { value: 1 };
  const probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
  state.play.proofSentinel.value = value;
  fallback(state, recipe, probe);
  const unsupportedProbe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
  fallback(state, recipe, unsupportedProbe);
});

for (const [name, mutate] of [
  ['accessor', object => Object.defineProperty(object, 'value', { enumerable: true, get() { throw Error('getter must not run'); } })],
  ['symbol key', object => { object[Symbol('hidden')] = 1; }],
  ['nonenumerable', object => Object.defineProperty(object, 'hidden', { value: 1 })],
  ['cycle', object => { object.value = object; }],
  ['own toJSON', object => { object.toJSON = () => { throw Error('toJSON must not run'); }; }],
  ['inherited toJSON', object => Object.setPrototypeOf(object, { toJSON() { throw Error('toJSON must not run'); } })],
  ['exotic prototype', object => Object.setPrototypeOf(object, { inherited: true })]
]) test(`typed incoming proof falls back for ${name}`, () => {
  const { state, recipe } = prefix();
  state.play.proofSentinel = { value: 1 };
  const probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
  mutate(state.play.proofSentinel);
  fallback(state, recipe, probe);
});

test('the detached private tree detects changes through the original reference and preserves typed distinctions and key order', () => {
  for (const mutate of [
    object => { object.value = '1'; }, object => { object.value = true; },
    object => { object.list[1].nested = 3; }, object => { object.extra = null; },
    object => { const value = object.value; delete object.value; object.value = value; }
  ]) {
    const { state, recipe } = prefix(), sentinel = { value: 1, list: [null, { nested: 2 }] };
    state.play.proofSentinel = sentinel;
    const probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
    mutate(sentinel);
    fallback(state, recipe, probe);
  }
});

test('equivalent null-prototype and independently allocated plain data retain exact reuse', () => {
  const { state, recipe } = prefix();
  state.play.proofSentinel = { value: 1, list: [null, 'x', true, { nested: 2 }] };
  const probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
  state.play.proofSentinel = Object.assign(Object.create(null), structuredClone(state.play.proofSentinel));
  assert.equal(trialRecipeV2(state, recipe, { reusePreviousTrial: probe }).previousInspectionReused, true);
});

async function callCounts(run) {
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params,
    (error, result) => error ? reject(error) : resolve(result)));
  try {
    await post('Profiler.enable'); await post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
    run();
    const coverage = await post('Profiler.takePreciseCoverage');
    await post('Profiler.stopPreciseCoverage'); await post('Profiler.disable');
    return (name, file = 'play-planning-v2.js') => coverage.result.filter(script => script.url.endsWith(`/${file}`))
      .flatMap(script => script.functions).filter(fn => fn.functionName === name).reduce((sum, fn) => sum + fn.ranges[0].count, 0);
  } finally { session.disconnect(); }
}

test('incoming reuse matches its private tree without recapturing or serializing it; compiler defaults do neither', async () => {
  const { state, recipe } = prefix(), probe = trialRecipeV2(state, recipe, { capturePreviousInspection: true });
  const reused = await callCounts(() => assert.equal(trialRecipeV2(state, recipe, { reusePreviousTrial: probe }).previousInspectionReused, true));
  assert.ok(reused('matchesInspectionData') > 0);
  assert.equal(reused('captureInspectionData'), 0);
  assert.equal(reused('strictInspectionJSON'), 0);
  assert.equal(reused('inspectModel2SegmentV2', 'play-outcome-v2.js'), 0);
  const plain = await callCounts(() => trialRecipeV2(state, recipe));
  for (const name of ['previousInspectionProof', 'captureInspectionData', 'matchesInspectionData', 'strictInspectionJSON']) assert.equal(plain(name), 0);
});

test('legacy captured pending guards still reject mutable exposed source without atomic checks', () => {
  const document = model2Document({ ending: 'winner' }), state = createPlanningStateV2(document);
  const trial = trialRecipeV2(state, document.shots[0], { capturePendingEvents: true });
  trial.step.shot.physicsV2.target.y += 1;
  assert.throws(() => inspectPlanningTrialContactV2(state, trial), /mutated or are unsupported/);
});
