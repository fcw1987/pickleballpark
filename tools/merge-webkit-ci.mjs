// Combine official Playwright shard reports, then apply the unchanged full-suite
// policy. A partial report or a failed shard can never produce a successful gate.
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { enforceWebKitPolicy } from './webkit-policy.mjs';
import { requireSuccessfulShards } from './browser-report-policy.mjs';

mkdirSync('release-results', { recursive: true });
const reportPath = 'release-results/webkit-raw.json';
const catalogPath = 'release-results/webkit-catalog.json';
const summaryPath = 'release-results/webkit-policy-summary.json';
for (const file of [reportPath, catalogPath, summaryPath]) rmSync(file, { force: true });
const cli = 'node_modules/@playwright/test/cli.js';
const catalog = spawnSync(process.execPath, [cli, 'test', '--config=playwright.webkit.config.mjs', '--workers=1', '--retries=0', '--forbid-only', '--list', '--reporter=json'], {
  encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
});
if (catalog.error) throw catalog.error;
if (catalog.status !== 0) throw new Error(`Full WebKit discovery failed: ${catalog.stderr || catalog.stdout}`);
JSON.parse(catalog.stdout);
writeFileSync(catalogPath, catalog.stdout);

const merged = spawnSync(process.execPath, [cli, 'merge-reports', '--reporter=json,html', 'release-results/webkit-blobs'], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath, PLAYWRIGHT_HTML_OUTPUT_DIR: 'release-results/webkit-html', PLAYWRIGHT_HTML_OPEN: 'never' },
});
if (merged.error) throw merged.error;
if (merged.status !== 0) throw new Error(`WebKit report merge must exit 0; received ${merged.status}`);
const summary = enforceWebKitPolicy(reportPath, catalogPath, summaryPath);
requireSuccessfulShards(process.env.WEBKIT_SHARDS_RESULT, 'webkit');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
  '### WebKit validation', '',
  `- **${summary.counts.passed}/${summary.counts.catalog} passed**, with no failures, retries, skips or flaky results.`,
  '- Both shard jobs succeeded; their combined results exactly match an independent full test discovery.', ''
].join('\n'));
console.log(JSON.stringify(summary));
