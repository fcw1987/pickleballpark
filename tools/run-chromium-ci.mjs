// Both CI runners independently discover all files and derive the same plan.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromiumArguments, discoverChromiumCatalog, createChromiumPlan, chromiumFileFilters, assertPartitionCatalog } from './chromium-partitions.mjs';

const index = Number(process.argv[2]);
if (process.argv.length !== 3 || ![1, 2].includes(index)) throw new Error('Usage: node tools/run-chromium-ci.mjs <1|2>');
const directory = 'release-results/chromium-ci';
mkdirSync(directory, { recursive: true });
const blob = resolve(directory, `chromium-${index}.zip`);
rmSync(blob, { force: true });
const catalog = discoverChromiumCatalog();
const plan = createChromiumPlan(catalog);
const partition = plan.partitions[index - 1];
const filters = chromiumFileFilters(partition);
assertPartitionCatalog(discoverChromiumCatalog(filters), partition);
writeFileSync(`${directory}/partition-${index}.json`, `${JSON.stringify({ partition: index, plan }, null, 2)}\n`);
console.log(`Chromium ${index}/2: ${partition.files.length} whole files, ${partition.files.flatMap(file => file.expectedIds).length} tests; estimated ${(partition.estimatedDurationMs / 60000).toFixed(1)} test minutes.`);
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', ...chromiumArguments, ...filters, '--reporter=line,blob', `--output=release-results/chromium-tests-${index}`], {
  stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BLOB_OUTPUT_FILE: blob },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
