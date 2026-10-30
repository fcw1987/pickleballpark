import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { assertQualityGate, qualityGateFailures } from '../tools/check-quality-gate.mjs';

const success = () => ({ result: 'success' });
const successfulNeeds = () => ({
  checks: success(),
  chromium: success(),
  webkit: success(),
  package: success(),
  'rally-calibration': success(),
});

test('quality gate accepts only when every required conclusion is success', () => {
  assert.deepEqual(qualityGateFailures(successfulNeeds()), []);
  assert.doesNotThrow(() => assertQualityGate(successfulNeeds()));
});

for (const conclusion of ['skipped', 'cancelled', 'failure']) {
  test(`quality gate rejects every required job with an actual ${conclusion} conclusion`, () => {
    for (const job of Object.keys(successfulNeeds())) {
      const needs = successfulNeeds();
      needs[job] = { result: conclusion };
      assert.deepEqual(qualityGateFailures(needs), [`${job}: ${conclusion}`]);
      assert.throws(() => assertQualityGate(needs), new RegExp(`${job}: ${conclusion}`));
    }
  });
}

test('quality gate rejects a missing required job', () => {
  for (const job of Object.keys(successfulNeeds())) {
    const needs = successfulNeeds();
    delete needs[job];
    assert.deepEqual(qualityGateFailures(needs), [`${job}: missing`]);
    assert.throws(() => assertQualityGate(needs), new RegExp(`${job}: missing`));
  }
});

test('quality gate reports every non-success conclusion together', () => {
  assert.deepEqual(
    qualityGateFailures({ checks: success(), chromium: { result: 'failure' } }),
    ['chromium: failure', 'webkit: missing', 'package: missing', 'rally-calibration: missing'],
  );
});

test('Quality requires the complete examined regression contract and retains failure evidence', () => {
  const workflow = readFileSync(new URL('../.github/workflows/quality.yml', import.meta.url), 'utf8');
  const regression = workflow.match(/^  rally-calibration:\n([\s\S]*?)(?=^  [a-z][a-z-]*:|$(?![\s\S]))/m)?.[1];
  assert.ok(regression, 'The regression keeps the stable required job ID');
  assert.match(regression, /^    name: Rally physical regression$/m);
  assert.doesNotMatch(regression, /(?:strategy|continue-on-error):/m);
  assert.doesNotMatch(regression.slice(0, regression.indexOf('      - name: Retain regression')), /\n\s+if:/m);
  assert.equal(workflow.match(/node tools\/rally-regression-v1\.mjs/g)?.length, 1);
  assert.match(regression, /run: >-\n\s+node tools\/rally-regression-v1\.mjs --require-clean\n\s+--output release-results\/game-mode-m2\/required-regression\.json\n\s+--archive release-results\/game-mode-m2\/required-regression\.jsonl\n/);
  assert.doesNotMatch(regression, /--(?:cohort|styles|seeds|archive-input|require-calibration)\b|rally-realism-v2\.mjs/);
  const retain = regression.slice(regression.indexOf('      - name: Retain regression'));
  assert.match(retain, /\n        if: always\(\)\n/);
  assert.match(retain, /\n          name: rally-regression-results\n/);
  assert.match(retain, /\n          if-no-files-found: error\n/);
  assert.match(retain, /\n          retention-days: 7\n/);
  assert.match(retain, /\n            release-results\/game-mode-m2\/required-regression\.json\n            release-results\/game-mode-m2\/required-regression\.jsonl\n/);
  assert.match(workflow, /^    needs: \[checks, chromium, webkit, package, rally-calibration\]$/m);
});
