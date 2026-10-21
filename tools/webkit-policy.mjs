import { readFileSync, writeFileSync } from 'node:fs';

const flattenSpecs = suite => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(flattenSpecs)];
export const webkitSpecs = report => (report?.suites ?? []).flatMap(flattenSpecs);
// Reporter IDs include the describe path; viewport parameterizations can have
// identical titles and source locations while remaining distinct tests.
export const specKey = spec => spec.id || `${spec.file.replaceAll('\\', '/')}\0${spec.title}\0${spec.line}\0${spec.column}`;

// No platform, browser-version or error-signature exception. A successful gate
// means every discovered WebKit test passed on its sole attempt.
export function inspectWebKitReport(report, catalog = report) {
  const failures = [];
  const specs = webkitSpecs(report);
  const expected = webkitSpecs(catalog).map(specKey).sort();
  const observed = specs.map(specKey).sort();
  if (expected.length === 0) failures.push('empty WebKit test catalog');
  if (new Set(observed).size !== observed.length) failures.push('duplicate WebKit test results');
  if (JSON.stringify(expected) !== JSON.stringify(observed)) failures.push('executed tests differ from the full discovered catalog');
  if ((report?.errors ?? []).length) failures.push('report contains errors outside tests');
  const stats = report?.stats ?? {};
  for (const [name, value] of Object.entries({ expected: specs.length, unexpected: 0, flaky: 0, skipped: 0 })) {
    if (stats[name] !== value) failures.push(`unexpected ${name} count: ${stats[name]}`);
  }
  for (const spec of specs) {
    const label = `${spec.file} :: ${spec.title}`;
    const tests = spec.tests ?? [];
    if (tests.length !== 1) { failures.push(`unexpected project result count: ${label}`); continue; }
    const test = tests[0];
    if (test.projectName !== 'webkit') failures.push(`unexpected browser project: ${label}`);
    if (test.expectedStatus !== 'passed') failures.push(`non-passing expected status: ${label}`);
    if (test.status !== 'expected') failures.push(`disallowed outcome ${test.status}: ${label}`);
    if (test.results?.length !== 1) failures.push(`expected exactly one attempt: ${label}`);
    for (const result of test.results ?? []) {
      if (result.status !== 'passed' || (result.errors ?? []).length || result.error) failures.push(`non-passing result: ${label}`);
      if (result.retry !== undefined && result.retry !== 0) failures.push(`retry result: ${label}`);
    }
  }
  return {
    accepted: failures.length === 0,
    failures,
    counts: { catalog: expected.length, passed: stats.expected, failed: stats.unexpected, skipped: stats.skipped, flaky: stats.flaky }
  };
}

export function enforceWebKitPolicy(reportPath, catalogPath, summaryPath) {
  const summary = inspectWebKitReport(JSON.parse(readFileSync(reportPath)), JSON.parse(readFileSync(catalogPath)));
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.accepted) throw new Error(`WebKit gate rejected:\n${summary.failures.join('\n')}`);
  return summary;
}
