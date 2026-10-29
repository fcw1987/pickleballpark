import test from 'node:test';
import assert from 'node:assert/strict';
import { STYLE_VERSION, STYLE_IDS, FLAVOUR_IDS, STYLE_PROFILES, EXECUTION_PHASES, resolveStyle, validateStyleProfile } from '../rally-styles.js';

const clone = value => structuredClone(value);

test('styles and flavours are separate strict versioned recipe identities', () => {
  assert.equal(STYLE_VERSION, 'rally-profiles-v1');
  assert.deepEqual(STYLE_IDS, ['pro', 'advanced', 'intermediate', 'beginner']);
  assert.deepEqual(FLAVOUR_IDS, ['balanced', 'bangers', 'kitchen-masters', 'lobbers']);
  assert.equal(resolveStyle().id, 'advanced');
  assert.equal(resolveStyle().flavour, 'balanced');
  for (const style of ['Advanced 4.0', 'advanced-4.0', null, {}, 'elite']) assert.throws(() => resolveStyle(style), /Unsupported rally style/);
  for (const flavour of ['highlight', 'banger', null, {}, '']) assert.throws(() => resolveStyle('pro', flavour), /Unsupported rally flavour/);
});

test('all sixteen profiles have bounded weights and coherent execution probabilities', () => {
  for (const style of STYLE_IDS) for (const flavour of FLAVOUR_IDS) {
    const value = resolveStyle(style, flavour);
    assert.equal(validateStyleProfile(value), value);
    assert.equal(value.id, style); assert.equal(value.flavour, flavour);
    assert.equal(value.settledSoftError, { pro: .085, advanced: .13, intermediate: .14, beginner: .18 }[style]);
    for (const row of Object.values(value.weights)) {
      assert.ok(Object.values(row).every(weight => Number.isFinite(weight) && weight >= 0));
      assert.ok(Object.values(row).some(weight => weight > 0));
    }
    for (const phase of EXECUTION_PHASES) {
      const row = value.execution[phase], total = Object.values(row).reduce((a, b) => a + b, 0);
      assert.ok(total <= 1); assert.ok(total >= 0);
      assert.ok(Object.values(row).every(probability => probability >= 0 && probability <= 1));
    }
  }
});

test('resolved profiles are immutable and no flavour can alter the shared baseline', () => {
  const before = JSON.stringify(STYLE_PROFILES), balanced = resolveStyle('pro');
  assert.ok(Object.isFrozen(balanced)); assert.ok(Object.isFrozen(balanced.execution.third));
  assert.throws(() => { balanced.weights.third['third-shot-drop'] = 0; }, TypeError);
  assert.throws(() => { balanced.execution.third.error = 1; }, TypeError);
  resolveStyle('pro', 'bangers'); resolveStyle('pro', 'lobbers');
  assert.equal(JSON.stringify(STYLE_PROFILES), before);
  assert.equal(resolveStyle('pro'), balanced);
});

test('flavour priors change tactical direction without inventing another skill level', () => {
  const base = resolveStyle('advanced'), banger = resolveStyle('advanced', 'bangers');
  const kitchen = resolveStyle('advanced', 'kitchen-masters'), lobber = resolveStyle('advanced', 'lobbers');
  const driveShare = profile => profile.weights.third['third-shot-drive'] / (profile.weights.third['third-shot-drive'] + profile.weights.third['third-shot-drop']);
  assert.ok(driveShare(banger) > driveShare(base));
  assert.ok(driveShare(kitchen) < driveShare(base));
  assert.ok(lobber.weights.kitchen.lob > base.weights.kitchen.lob);
  assert.equal(banger.skill, base.skill); assert.deepEqual(lobber.execution, base.execution);
});

test('malformed profiles cannot smuggle nonfinite values, probabilities or unsupported fields', () => {
  const source = clone(resolveStyle('pro'));
  const mutations = [
    value => { value.version = 'future'; }, value => { value.extra = true; },
    value => { value.skill = NaN; }, value => { value.pressureErrorScale = 1.1; },
    value => { delete value.settledSoftError; },
    ...[-.01, 1.01, NaN, Infinity, null, '0.07', true, {}].map(invalid => value => { value.settledSoftError = invalid; }),
    value => { value.weights.third.lob = Infinity; }, value => { value.weights.third.lob = -1; },
    value => { value.weights.third.unknown = 1; }, value => { delete value.weights.third.lob; },
    value => { value.weights.extra = { drive: 1 }; },
    value => { value.execution.third.error = .9; value.execution.third.excellent = .9; },
    value => { delete value.execution.third; }, value => { value.execution.third.extra = .1; },
    value => { value.errorWeights.net = .6; }, value => { value.errorWeights.extra = 0; },
    value => { value.signature.erneWeight = NaN; }, value => { value.signature.extra = 1; },
    value => { value.label = '<b>Pro</b>'; }, value => { value.flavour = 'unknown'; }
  ];
  for (const mutate of mutations) {
    const value = clone(source); mutate(value);
    assert.throws(() => validateStyleProfile(value), TypeError);
  }
});

test('settled soft error is an explicit immutable bounded policy prior independent of flavour and ordinary phase risks', () => {
  for (const style of STYLE_IDS) for (const flavour of FLAVOUR_IDS) {
    const value = resolveStyle(style, flavour);
    assert.equal(value.settledSoftError, STYLE_PROFILES[style].settledSoftError);
    assert.deepEqual(value.execution, STYLE_PROFILES[style].execution);
    assert.throws(() => { value.settledSoftError = 0; }, TypeError);
  }
  for (const edge of [0, 1]) {
    const source = clone(resolveStyle('pro')); source.settledSoftError = edge;
    assert.equal(validateStyleProfile(source), source);
  }
});
