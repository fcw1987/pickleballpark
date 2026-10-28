import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { browserSpecs, specKey } from './browser-report-policy.mjs';

export const chromiumArguments = ['test', '--config=playwright.config.mjs', '--workers=1', '--retries=0', '--forbid-only'];
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function discoverChromiumCatalog(filters = []) {
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', ...chromiumArguments, ...filters, '--list', '--reporter=json'], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Chromium discovery failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

export function createChromiumPlan(catalog, timings = JSON.parse(readFileSync(new URL('./chromium-file-durations.json', import.meta.url)))) {
  const specs = browserSpecs(catalog);
  const ids = specs.map(specKey);
  if (!ids.length || new Set(ids).size !== ids.length || catalog.errors?.length) throw new Error('Chromium discovery must be nonempty, unique and error-free');
  const files = new Map();
  for (const spec of specs) {
    if (spec.tests?.length !== 1 || spec.tests[0].projectName !== 'chromium') throw new Error('Expected the complete single-project Chromium catalog');
    const file = spec.file.replaceAll('\\', '/');
    if (file.startsWith('/') || file.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe test file: ${file}`);
    if (!files.has(file)) files.set(file, []);
    files.get(file).push(specKey(spec));
  }
  const samples = Object.values(timings.files);
  if (!samples.length || samples.some(sample => !Number.isFinite(sample.durationMs) || sample.durationMs <= 0 || !Number.isSafeInteger(sample.tests) || sample.tests <= 0)) throw new Error('Invalid Chromium duration estimates');
  const rates = samples.map(sample => sample.durationMs / sample.tests).sort((a, b) => a - b);
  const fallbackPerTestMs = rates[Math.floor(rates.length / 2)];
  const weighted = [...files].map(([file, expectedIds]) => {
    const sample = timings.files[file];
    return { file, expectedIds: expectedIds.sort(compare), estimatedDurationMs: Math.ceil(expectedIds.length * (sample ? sample.durationMs / sample.tests : fallbackPerTestMs)) };
  }).sort((a, b) => b.estimatedDurationMs - a.estimatedDurationMs || compare(a.file, b.file));
  const partitions = [1, 2].map(index => ({ index, estimatedDurationMs: 0, files: [] }));
  for (const file of weighted) {
    const partition = partitions.reduce((a, b) => a.estimatedDurationMs <= b.estimatedDurationMs ? a : b);
    partition.files.push(file);
    partition.estimatedDurationMs += file.estimatedDurationMs;
  }
  for (const partition of partitions) partition.files.sort((a, b) => compare(a.file, b.file));
  const covered = partitions.flatMap(partition => partition.files.flatMap(file => file.expectedIds));
  if (partitions.some(partition => !partition.files.length) || !same([...ids].sort(compare), covered.sort(compare))) throw new Error('Partitions must cover the full catalog exactly once');
  return { version: 1, project: 'chromium', partitions };
}

export function chromiumFileFilters(partition) {
  // CLI file arguments are regular expressions against absolute file paths.
  return partition.files.map(({ file }) => `(^|/)tests/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

export function assertPartitionCatalog(catalog, partition) {
  const expected = partition.files.flatMap(file => file.expectedIds).sort(compare);
  const observed = browserSpecs(catalog).map(specKey).sort(compare);
  if (catalog.errors?.length || !same(expected, observed)) throw new Error('Selected Chromium files differ from their planned catalog');
}

export function assertChromiumInputs(plan, names, manifests) {
  const expectedBlobs = plan.partitions.map(({ index }) => `chromium-${index}.zip`).sort();
  const expectedManifests = plan.partitions.map(({ index }) => `partition-${index}.json`).sort();
  if (!same([...names].sort(), [...expectedBlobs, ...expectedManifests].sort())) throw new Error('Require exactly both Chromium blobs and partition manifests');
  for (const { index } of plan.partitions) {
    if (!same(manifests[index], { partition: index, plan })) throw new Error(`Chromium partition ${index} does not match fresh full discovery and duration plan`);
  }
}
