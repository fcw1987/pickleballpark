import { readFileSync, writeFileSync } from 'node:fs';

const flattenSpecs = suite => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(flattenSpecs)];
export const browserSpecs = report => (report?.suites ?? []).flatMap(flattenSpecs);
// IDs distinguish viewport parameterizations with identical source locations.
export const specKey = spec => spec.id || `${spec.file.replaceAll('\\', '/')}\0${spec.title}\0${spec.line}\0${spec.column}`;
const browserLabel = project => ({ chromium: 'Chromium', webkit: 'WebKit' })[project];

// Every discovered case must pass on its sole attempt, with no exceptions.
export function inspectBrowserReport(report, catalog = report, project = 'webkit') {
  const label = browserLabel(project);
  if (!label) throw new Error(`Unsupported browser project: ${project}`);
  const failures = [];
  const specs = browserSpecs(report);
  const catalogSpecs = browserSpecs(catalog);
  const expected = catalogSpecs.map(specKey).sort();
  const observed = specs.map(specKey).sort();
  if (expected.length === 0) failures.push(`empty ${label} test catalog`);
  if (new Set(expected).size !== expected.length) failures.push(`duplicate ${label} catalog entries`);
  if ((catalog?.errors ?? []).length) failures.push('catalog contains discovery errors');
  for (const spec of catalogSpecs) {
    if (spec.tests?.length !== 1 || spec.tests[0].projectName !== project) failures.push(`unexpected catalog project: ${spec.file} :: ${spec.title}`);
  }
  if (new Set(observed).size !== observed.length) failures.push(`duplicate ${label} test results`);
  if (JSON.stringify(expected) !== JSON.stringify(observed)) failures.push('executed tests differ from the full discovered catalog');
  if ((report?.errors ?? []).length) failures.push('report contains errors outside tests');
  const stats = report?.stats ?? {};
  for (const [name, value] of Object.entries({ expected: specs.length, unexpected: 0, flaky: 0, skipped: 0 })) {
    if (stats[name] !== value) failures.push(`unexpected ${name} count: ${stats[name]}`);
  }
  for (const spec of specs) {
    const name = `${spec.file} :: ${spec.title}`;
    const tests = spec.tests ?? [];
    if (tests.length !== 1) { failures.push(`unexpected project result count: ${name}`); continue; }
    const test = tests[0];
    if (test.projectName !== project) failures.push(`unexpected browser project: ${name}`);
    if (test.expectedStatus !== 'passed') failures.push(`non-passing expected status: ${name}`);
    if (test.status !== 'expected') failures.push(`disallowed outcome ${test.status}: ${name}`);
    if (test.results?.length !== 1) failures.push(`expected exactly one attempt: ${name}`);
    for (const result of test.results ?? []) {
      if (result.status !== 'passed' || (result.errors ?? []).length || result.error) failures.push(`non-passing result: ${name}`);
      if (result.retry !== undefined && result.retry !== 0) failures.push(`retry result: ${name}`);
    }
  }
  return {
    accepted: failures.length === 0,
    failures,
    counts: { catalog: expected.length, passed: stats.expected, failed: stats.unexpected, skipped: stats.skipped, flaky: stats.flaky }
  };
}

export function enforceBrowserPolicy(reportPath, catalogPath, summaryPath, project) {
  const summary = inspectBrowserReport(JSON.parse(readFileSync(reportPath)), JSON.parse(readFileSync(catalogPath)), project);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.accepted) throw new Error(`${browserLabel(project)} gate rejected:\n${summary.failures.join('\n')}`);
  return summary;
}

export function requireSuccessfulShards(result, project) {
  if (result !== 'success') throw new Error(`Every ${browserLabel(project)} shard job must succeed; received ${result ?? 'no result'}`);
}
