import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWebKitReport } from '../tools/webkit-policy.mjs';

const passingSpec = index => ({
  file: `example-${index}.spec.mjs`, title: `test ${index}`, line: 1, column: 1,
  tests: [{ projectName: 'webkit', expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', errors: [] }] }]
});
const validReport = () => ({
  suites: [{ suites: [{ specs: [passingSpec(1), passingSpec(2)] }] }],
  errors: [], stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0 }
});
const first = report => report.suites[0].suites[0].specs[0].tests[0];
const rejected = (mutate, pattern) => {
  const report = validReport();
  mutate(report);
  const summary = inspectWebKitReport(report, validReport());
  assert.equal(summary.accepted, false);
  assert.match(summary.failures.join('\n'), pattern);
};

test('requires all discovered WebKit tests to pass without infrastructure exceptions', () => {
  assert.deepEqual(inspectWebKitReport(validReport(), validReport()).failures, []);
});
test('uses reporter IDs to distinguish parameterized tests at one source location', () => {
  const report = validReport();
  report.suites[0].suites[0].specs = ['portrait', 'landscape'].map(id => ({ ...passingSpec(1), id }));
  assert.equal(inspectWebKitReport(report, structuredClone(report)).accepted, true);
});
test('rejects an empty report, missing discovered tests and duplicate results', () => {
  assert.equal(inspectWebKitReport({ suites: [], stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0 } }).accepted, false);
  rejected(report => report.suites[0].suites[0].specs.pop(), /full discovered catalog/);
  rejected(report => report.suites[0].suites[0].specs.push(passingSpec(1)), /duplicate/);
});
test('rejects failures including the former WebKit internal-error signature', () => {
  rejected(report => {
    first(report).status = 'unexpected';
    first(report).results[0] = { status: 'failed', errors: [{ message: 'page.reload: WebKit encountered an internal error' }] };
    report.stats.expected = 1; report.stats.unexpected = 1;
  }, /disallowed outcome unexpected/);
});
test('rejects skipped, flaky, timed-out and interrupted results', () => {
  for (const status of ['skipped', 'flaky', 'timedOut', 'interrupted']) rejected(report => {
    first(report).status = status;
    first(report).results[0].status = status;
  }, /disallowed outcome/);
});
test('rejects a successful retry and hidden errors on a passing result', () => {
  rejected(report => first(report).results.unshift({ status: 'failed', errors: [{ message: 'initial failure' }] }), /exactly one attempt/);
  rejected(report => first(report).results[0].errors.push({ message: 'hidden error' }), /non-passing result/);
  rejected(report => { first(report).results[0].error = { message: 'hidden error' }; }, /non-passing result/);
  rejected(report => { first(report).results[0].retry = 1; }, /retry result/);
});
test('rejects expected failures, other projects, missing attempts and extra projects', () => {
  rejected(report => { first(report).expectedStatus = 'failed'; }, /non-passing expected status/);
  rejected(report => { first(report).projectName = 'chromium'; }, /browser project/);
  rejected(report => { first(report).results = []; }, /exactly one attempt/);
  rejected(report => report.suites[0].suites[0].specs[0].tests.push(first(report)), /project result count/);
});
test('rejects reporter errors and inconsistent counts', () => {
  rejected(report => report.errors.push({ message: 'server failed' }), /outside tests/);
  for (const name of ['expected', 'unexpected', 'flaky', 'skipped']) rejected(report => { report.stats[name] += 1; }, new RegExp(`unexpected ${name} count`));
});
