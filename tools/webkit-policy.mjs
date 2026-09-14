import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const REVIEW_EXPIRES = '2026-10-06';
export const TEST_FILE_HASHES = Object.freeze({
  'tests/coaching-workflow.spec.mjs': '417c47c2f77efd5c8d51ec5caf9cbf23a53e97ba843ec5e3a25220a7bb5b3ddb',
  'tests/pixel-replay.spec.mjs': '11e47959d5a67ec9d22f78c3e8fd014e86142419ed11aef16442b9688c1b0808',
  'tests/plays.spec.mjs': 'a081abea40b87dc7d6f345eb31bf0e09da10655ccc84bdef0120f01acd3826cf',
  'tests/three-d.spec.mjs': '596165ad01f342efb923d888dd32bf0332914ef9bc7e79adab105f820317df2f',
  'tests/service-worker.spec.mjs': '7eeffad655763f215a7603c97d6a1d65823d8c93f25f09838938cca441269847',
});

export const ALLOWED_FAILURES = Object.freeze([
  ['tests/coaching-workflow.spec.mjs', 'cached coaching engine resumes an interrupted shot offline', 122, 'page.reload', 'page.reload: WebKit encountered an internal error'],
  ['tests/pixel-replay.spec.mjs', 'fresh cached installation opens all four pixel actors fully offline', 73, 'page.reload', 'page.reload: WebKit encountered an internal error'],
  ['tests/plays.spec.mjs', 'guided plays start and advance on an offline repeat visit', 228, 'page.reload', 'page.reload: WebKit encountered an internal error'],
  ['tests/three-d.spec.mjs', 'offline repeat visit can open the locally cached Three.js viewer', 126, 'page.reload', 'page.reload: WebKit encountered an internal error'],
  ['tests/service-worker.spec.mjs', 'installs the versioned shell and serves a repeat visit offline', 52, 'page.goto', 'page.goto: WebKit encountered an internal error'],
  ['tests/service-worker.spec.mjs', 'offline navigation uses only the owned shell cache and does not cache unknown pages as the shell', 108, 'page.goto', 'page.goto: WebKit encountered an internal error'],
  ['tests/service-worker.spec.mjs', 'upgrades old Pickleboard caches without deleting unrelated origin caches', 93, 'toBe', 'expect(received).toBe(expected) // Object.is equality'],
].map(([file, title, line, method, firstLine]) => Object.freeze({ file, title, line, method, firstLine })));

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const cleanMessage = (message = '') => message.replace(/\u001b\[[0-9;]*m/g, '');
const cleanFirstLine = (message = '') => cleanMessage(message).replace(/^Error:\s*/, '').split('\n')[0].trim();
const flattenSpecs = (suite) => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(flattenSpecs)];
const key = ({ file, title }) => `${file.startsWith('tests/') ? file : `tests/${file}`}\0${title}`;

export function inspectWebKitReport(report, diagnostics, options = {}) {
  const failures = [];
  const runtimePlatform = options.runtimePlatform ?? process.platform;
  const ci = options.ci ?? Boolean(process.env.CI);
  const playwrightVersion = options.playwrightVersion ?? JSON.parse(readFileSync('node_modules/@playwright/test/package.json')).version;
  const now = options.now ?? new Date();
  const sourceHashes = options.sourceHashes ?? Object.fromEntries(Object.keys(TEST_FILE_HASHES).map((file) => [file, sha256(readFileSync(file))]));
  if (!ci || runtimePlatform !== 'linux') failures.push('policy is valid only on Linux CI');
  if (playwrightVersion !== '1.61.0') failures.push(`unexpected Playwright version: ${playwrightVersion}`);
  if (now > new Date(`${REVIEW_EXPIRES}T23:59:59.999Z`)) failures.push(`policy review expired: ${REVIEW_EXPIRES}`);
  for (const [file, expected] of Object.entries(TEST_FILE_HASHES)) if (sourceHashes[file] !== expected) failures.push(`changed test source: ${file}`);

  const requiredDiagnostics = {
    playwright: '1.61.0', platform: 'linux', browserVersion: '26.5',
    offlineSignature: 'page.reload: WebKit encountered an internal error',
    cacheSeed: 'keep me', cacheAfterNavigation: null, appCodeServed: false,
    realOfflineWithoutEmulation: true, cacheDeletionCodeServed: false, result: 'confirmed',
  };
  if (!diagnostics || typeof diagnostics !== 'object') failures.push('missing WebKit infrastructure diagnostics');
  else {
    if (JSON.stringify(Object.keys(diagnostics).sort()) !== JSON.stringify(Object.keys(requiredDiagnostics).sort())) failures.push('unexpected WebKit diagnostic fields');
    for (const [name, expected] of Object.entries(requiredDiagnostics)) if (diagnostics[name] !== expected) failures.push(`diagnostic mismatch: ${name}`);
  }

  const specs = (report?.suites ?? []).flatMap(flattenSpecs);
  if ((report?.errors ?? []).length) failures.push('report contains errors outside tests');
  if (specs.length !== 278) failures.push(`expected 278 tests, found ${specs.length}`);
  const stats = report?.stats ?? {};
  for (const [name, expected] of Object.entries({ expected: 271, unexpected: 7, flaky: 0, skipped: 0 })) if (stats[name] !== expected) failures.push(`unexpected ${name} count: ${stats[name]}`);

  const allowed = new Map(ALLOWED_FAILURES.map((entry) => [key(entry), entry]));
  const observed = new Set();
  for (const spec of specs) {
    const tests = spec.tests ?? [];
    if (tests.length !== 1) { failures.push(`unexpected project result count: ${spec.file} :: ${spec.title}`); continue; }
    const test = tests[0];
    if (test.projectName !== 'webkit') failures.push(`unexpected browser project: ${spec.file}`);
    if (test.expectedStatus !== 'passed') failures.push(`non-passing expected status: ${spec.file} :: ${spec.title}`);
    if (test.status === 'expected') {
      if (test.results?.length !== 1 || test.results[0].status !== 'passed' || (test.results[0].errors ?? []).length) failures.push(`invalid passing result: ${spec.file} :: ${spec.title}`);
      continue;
    }
    const entry = allowed.get(key(spec));
    if (!entry) { failures.push(`unapproved failing test: ${spec.file} :: ${spec.title}`); continue; }
    observed.add(key(entry));
    if (test.status !== 'unexpected') failures.push(`disallowed outcome ${test.status}: ${entry.title}`);
    if (test.results?.length !== 2) failures.push(`expected initial failure and one retry: ${entry.title}`);
    for (const result of test.results ?? []) {
      if (result.status !== 'failed') { failures.push(`disallowed result ${result.status}: ${entry.title}`); continue; }
      if ((result.errors ?? []).length !== 1) { failures.push(`expected one error: ${entry.title}`); continue; }
      const error = result.errors[0];
      const location = error.location ?? result.errorLocation;
      const locationFile = location?.file?.replaceAll('\\', '/');
      if (!(locationFile === entry.file || locationFile?.endsWith(`/${entry.file}`)) || location?.line !== entry.line) failures.push(`wrong failure location: ${entry.title}`);
      const firstLine = cleanFirstLine(error.message);
      const methodMatches = entry.method === 'toBe' ? firstLine.includes('.toBe(') : firstLine.startsWith(entry.method);
      if (firstLine !== entry.firstLine || !methodMatches) failures.push(`wrong error signature: ${entry.title}`);
      if (entry.method === 'toBe') {
        const lines = cleanMessage(error.message).split('\n').map((line) => line.trim()).filter(Boolean);
        if (!lines.includes('Expected: "keep me"') || !lines.includes('Received: undefined')) failures.push(`wrong cache assertion details: ${entry.title}`);
      }
    }
  }
  for (const entry of ALLOWED_FAILURES) if (!observed.has(key(entry))) failures.push(`missing allowed failure: ${entry.title}`);
  return {
    accepted: failures.length === 0,
    failures,
    counts: { catalog: specs.length, passed: stats.expected, allowedFailures: stats.unexpected, skipped: stats.skipped, flaky: stats.flaky },
    observedAllowedFailures: ALLOWED_FAILURES.map(({ file, title, line, method, firstLine }) => ({ file, title, line, method, firstLine })),
    reviewExpires: REVIEW_EXPIRES,
  };
}

export function enforceWebKitPolicy(reportPath, diagnosticsPath, summaryPath) {
  const report = JSON.parse(readFileSync(reportPath));
  let diagnostics;
  try { diagnostics = JSON.parse(readFileSync(diagnosticsPath)); } catch { diagnostics = null; }
  const summary = inspectWebKitReport(report, diagnostics);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.accepted) throw new Error(`WebKit policy rejected:\n${summary.failures.join('\n')}`);
  return summary;
}
