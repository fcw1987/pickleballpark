// Fresh independent discovery, official merge and strict full-catalog validation.
import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { enforceBrowserPolicy, requireSuccessfulShards } from './browser-report-policy.mjs';
import { discoverChromiumCatalog, createChromiumPlan, assertChromiumInputs } from './chromium-partitions.mjs';

mkdirSync('release-results', { recursive: true });
const reportPath = 'release-results/chromium-raw.json';
const catalogPath = 'release-results/chromium-catalog.json';
const summaryPath = 'release-results/chromium-policy-summary.json';
for (const file of [reportPath, catalogPath, summaryPath]) rmSync(file, { force: true });
const catalog = discoverChromiumCatalog();
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
const plan = createChromiumPlan(catalog);
const directory = 'release-results/chromium-ci';
const names = readdirSync(directory);
const manifests = Object.fromEntries(plan.partitions.map(({ index }) => [index, JSON.parse(readFileSync(`${directory}/partition-${index}.json`))]));
assertChromiumInputs(plan, names, manifests);
const merged = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'merge-reports', '--reporter=json,html', directory], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath, PLAYWRIGHT_HTML_OUTPUT_DIR: 'release-results/chromium-html', PLAYWRIGHT_HTML_OPEN: 'never' },
});
if (merged.error) throw merged.error;
if (merged.status !== 0) throw new Error(`Chromium report merge must exit 0; received ${merged.status}`);
const summary = enforceBrowserPolicy(reportPath, catalogPath, summaryPath, 'chromium');
requireSuccessfulShards(process.env.CHROMIUM_SHARDS_RESULT, 'chromium');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
  '### Chromium validation', '',
  `- **${summary.counts.passed}/${summary.counts.catalog} passed**, with no failures, retries, skips or flaky results.`,
  '- Both partition jobs succeeded; combined results exactly match fresh independent full discovery.', ''
].join('\n'));
console.log(JSON.stringify(summary));
