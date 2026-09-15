import test from 'node:test';
import assert from 'node:assert/strict';

import { ALLOWED_FAILURES, inspectWebKitReport, TEST_FILE_HASHES } from '../tools/webkit-policy.mjs';

const diagnostics = () => ({
  playwright: '1.61.0',
  platform: 'linux',
  browserVersion: '26.5',
  offlineSignature: 'page.reload: WebKit encountered an internal error',
  cacheSeed: 'keep me',
  cacheAfterNavigation: null,
  appCodeServed: false,
  realOfflineWithoutEmulation: true,
  cacheDeletionCodeServed: false,
  result: 'confirmed',
});
const result = (entry, status = 'failed') => ({
  status,
  errors: status === 'failed' ? [{
    message: entry.method === 'toBe' ? `Error: ${entry.firstLine}\n\nExpected: "keep me"\nReceived: undefined` : `Error: ${entry.firstLine}\nCall log:`,
    location: { file: `/ci-workspace/project/${entry.file}`, line: entry.line, column: 1 },
  }] : [],
});
const failingSpec = (entry) => ({
  file: entry.file, title: entry.title, line: entry.line, column: 1,
  tests: [{ projectName: 'webkit', expectedStatus: 'passed', status: 'unexpected', results: [result(entry), result(entry)] }],
});
const passingSpec = (index) => ({
  file: `tests/pass-${index}.spec.mjs`, title: `passing test ${index}`, line: 1, column: 1,
  tests: [{ projectName: 'webkit', expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', errors: [] }] }],
});
const validReport = () => ({
  suites: [{ specs: [...Array.from({ length: 302 }, (_, i) => passingSpec(i)), ...ALLOWED_FAILURES.map(failingSpec)] }],
  errors: [], stats: { expected: 302, unexpected: 7, flaky: 0, skipped: 0 },
});
const options = (overrides = {}) => ({
  runtimePlatform: 'linux', ci: true, playwrightVersion: '1.61.0',
  now: new Date('2026-09-06T12:00:00Z'), sourceHashes: { ...TEST_FILE_HASHES }, ...overrides,
});
const inspect = (report = validReport(), diag = diagnostics(), overrides = {}) => inspectWebKitReport(report, diag, options(overrides));
const expectRejected = (summary, pattern) => {
  assert.equal(summary.accepted, false);
  assert.match(summary.failures.join('\n'), pattern);
};

test('accepts exactly the seven confirmed failures with identical retries', () => {
  assert.deepEqual(inspect().failures, []);
});

test('rejects an unknown error signature', () => {
  const report = validReport();
  report.suites[0].specs[302].tests[0].results[1].errors[0].message = 'Error: page.reload: a different failure';
  expectRejected(inspect(report), /wrong error signature/);
});

test('rejects an unexpected pass of an allowed failure', () => {
  const report = validReport();
  report.suites[0].specs[302].tests[0] = { projectName: 'webkit', expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', errors: [] }] };
  report.stats.expected += 1; report.stats.unexpected = 6;
  expectRejected(inspect(report), /missing allowed failure/);
});

test('rejects a changed Playwright version or missing diagnostics', () => {
  expectRejected(inspect(validReport(), diagnostics(), { playwrightVersion: '1.62.0' }), /unexpected Playwright version/);
  expectRejected(inspect(validReport(), null), /missing WebKit infrastructure diagnostics/);
});

test('rejects timed out and skipped results', () => {
  const timedOut = validReport();
  timedOut.suites[0].specs[302].tests[0].results[0] = result(ALLOWED_FAILURES[0], 'timedOut');
  expectRejected(inspect(timedOut), /disallowed result timedOut/);
  const skipped = validReport();
  skipped.suites[0].specs[0].tests[0] = { projectName: 'webkit', expectedStatus: 'passed', status: 'skipped', results: [{ status: 'skipped', errors: [] }] };
  skipped.stats.expected = 270; skipped.stats.skipped = 1;
  expectRejected(inspect(skipped), /unexpected skipped count/);
});

test('rejects an extra assertion error on an allowed failure', () => {
  const report = validReport();
  report.suites[0].specs[302].tests[0].results[0].errors.push({ message: 'extra', location: { file: ALLOWED_FAILURES[0].file, line: ALLOWED_FAILURES[0].line } });
  expectRejected(inspect(report), /expected one error/);
});

test('rejects a wrong failure line', () => {
  const report = validReport();
  report.suites[0].specs[302].tests[0].results[0].errors[0].location.line += 1;
  expectRejected(inspect(report), /wrong failure location/);
});

test('rejects changed protected test source', () => {
  const sourceHashes = { ...TEST_FILE_HASHES, 'tests/plays.spec.mjs': '0'.repeat(64) };
  expectRejected(inspect(validReport(), diagnostics(), { sourceHashes }), /changed test source/);
});

test('rejects wrong cache assertion details and expired review', () => {
  const report = validReport();
  const cache = report.suites[0].specs.find((spec) => spec.title.startsWith('upgrades old'));
  cache.tests[0].results[0].errors[0].message = `Error: ${ALLOWED_FAILURES[6].firstLine}\nExpected: "other"\nReceived: undefined`;
  expectRejected(inspect(report), /wrong cache assertion details/);
  expectRejected(inspect(validReport(), diagnostics(), { now: new Date('2026-10-07T00:00:00Z') }), /policy review expired/);
});


test('accepts real reporter paths relative to testDir without relaxing error locations', () => {
  const report = validReport();
  for (const spec of report.suites[0].specs) spec.file = spec.file.replace(/^tests\//, '');
  assert.equal(inspect(report).accepted, true);
});
