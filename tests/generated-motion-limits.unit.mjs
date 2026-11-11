import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATION_MOTION_V1, generationDistanceBudgetV1 } from '../generated-motion-limits.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('generated motion is a frozen, explicit selected policy rather than a human limit', () => {
  assert.deepEqual(GENERATION_MOTION_V1, { version: 'generation-motion-v1', peakFeetPerSecond: 18,
    accelerationFeetPerSecondSquared: 30, scope: 'selected-generation-policy' });
  assert.ok(Object.isFrozen(GENERATION_MOTION_V1));
});

test('short routes satisfy acceleration even when the older speed-only budget would pass', () => {
  for (const seconds of [.1, .25, .5, 1]) {
    const budget = generationDistanceBudgetV1(seconds);
    close(budget, 30 * seconds * seconds / 4);
    close(4 * budget / (seconds * seconds), 30);
    assert.ok(2 * budget / seconds < 18);
    assert.ok(4 * (18 * seconds / 2) / (seconds * seconds) > 30);
  }
  assert.equal(generationDistanceBudgetV1(1), 7.5);
});

test('speed becomes the binding constraint for longer routes with a continuous crossover', () => {
  const crossover = 2 * 18 / 30;
  close(generationDistanceBudgetV1(crossover), 10.8);
  for (const seconds of [crossover, 1.5, 2, 4]) {
    const budget = generationDistanceBudgetV1(seconds);
    close(2 * budget / seconds, 18);
    assert.ok(4 * budget / (seconds * seconds) <= 30 + 1e-12);
  }
  const epsilon = 1e-8;
  assert.ok(Math.abs(generationDistanceBudgetV1(crossover - epsilon) - generationDistanceBudgetV1(crossover + epsilon)) < 1e-6);
});

test('slower signature movement uses the same acceleration ceiling and its actual selected speed', () => {
  for (const peak of [1, 9, 17.95, 18]) for (const seconds of [.01, .25, .5, 1, 1.5, 3]) {
    const budget = generationDistanceBudgetV1(seconds, peak);
    assert.ok(2 * budget / seconds <= peak + 1e-12);
    assert.ok(4 * budget / (seconds * seconds) <= 30 + 1e-12);
    close(budget, Math.min(peak * seconds / 2, 30 * seconds ** 2 / 4));
  }
  assert.equal(generationDistanceBudgetV1(1, 9), 4.5);
  close(generationDistanceBudgetV1(1.5, 17.95), 13.4625);
});

test('a hold has zero travel and additional time never reduces the route budget', () => {
  assert.equal(generationDistanceBudgetV1(0), 0);
  assert.equal(generationDistanceBudgetV1(10, 0), 0);
  for (const peak of [0, 1, 9, 17.95, 18]) {
    let previous = 0;
    for (let i = 0; i <= 400; i++) {
      const budget = generationDistanceBudgetV1(i / 100, peak);
      assert.ok(budget >= previous); previous = budget;
    }
  }
});

test('invalid time or speed cannot silently relax the generation policy', () => {
  for (const seconds of [-1, NaN, Infinity, -Infinity, undefined, null, '1']) {
    assert.throws(() => generationDistanceBudgetV1(seconds), TypeError);
  }
  for (const peak of [-1, 18.000001, NaN, Infinity, -Infinity, null, '18']) {
    assert.throws(() => generationDistanceBudgetV1(1, peak), TypeError);
  }
});
