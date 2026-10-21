import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { enforceWebKitPolicy } from './webkit-policy.mjs';

mkdirSync('release-results', { recursive: true });
const reportPath = 'release-results/webkit-raw.json';
const catalogPath = 'release-results/webkit-catalog.json';
const summaryPath = 'release-results/webkit-policy-summary.json';
for (const file of [reportPath, catalogPath, summaryPath]) rmSync(file, { force: true });
const command = ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.webkit.config.mjs', '--workers=1', '--retries=0', '--forbid-only'];
const catalog = spawnSync(process.execPath, [...command, '--list', '--reporter=json'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if (catalog.error) throw catalog.error;
if (catalog.status !== 0) throw new Error(`WebKit discovery failed: ${catalog.stderr}`);
JSON.parse(catalog.stdout);
writeFileSync(catalogPath, catalog.stdout);
const run = spawnSync(process.execPath, [...command, '--reporter=line,json,html'], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath, PLAYWRIGHT_HTML_OUTPUT_DIR: 'release-results/webkit-html', PLAYWRIGHT_HTML_OPEN: 'never' },
});
if (run.error) throw run.error;
const summary = enforceWebKitPolicy(reportPath, catalogPath, summaryPath);
if (run.status !== 0) throw new Error(`Full WebKit suite must exit 0; received ${run.status}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
  '### WebKit validation', '',
  `- **${summary.counts.passed}/${summary.counts.catalog} passed**, with no failures, retries, skips or flaky results.`,
  '- Offline tests stop their own HTTP servers; no browser offline-emulation exception is applied.', ''
].join('\n'));
console.log(JSON.stringify(summary));
