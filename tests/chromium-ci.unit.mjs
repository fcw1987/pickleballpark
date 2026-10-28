import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectBrowserReport, requireSuccessfulShards, browserSpecs, specKey } from '../tools/browser-report-policy.mjs';
import { createChromiumPlan, chromiumFileFilters, assertPartitionCatalog, assertChromiumInputs } from '../tools/chromium-partitions.mjs';

const spec = (file, id, project = 'chromium') => ({
  id, file, title: id, line: 1, column: 1,
  tests: [{ projectName: project, expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', errors: [], retry: 0 }] }]
});
const report = specs => ({ suites: [{ suites: [{ specs }] }], errors: [], stats: { expected: specs.length, unexpected: 0, flaky: 0, skipped: 0 } });
const catalog = () => report([spec('slow.spec.mjs', 'slow-1'), spec('slow.spec.mjs', 'slow-2'), spec('medium.spec.mjs', 'medium'), spec('small.spec.mjs', 'small')]);
const timings = { files: { 'slow.spec.mjs': { durationMs: 100, tests: 2 }, 'medium.spec.mjs': { durationMs: 60, tests: 1 }, 'small.spec.mjs': { durationMs: 40, tests: 1 } } };
const files = plan => plan.partitions.flatMap(partition => partition.files);
const manifests = plan => Object.fromEntries(plan.partitions.map(({ index }) => [index, { partition: index, plan: structuredClone(plan) }]));
const inputNames = ['chromium-1.zip', 'chromium-2.zip', 'partition-1.json', 'partition-2.json'];

test('balances longest whole files first and covers every fresh reporter ID once', () => {
  const source = catalog();
  const plan = createChromiumPlan(source, timings);
  assert.deepEqual(plan.partitions.map(partition => partition.estimatedDurationMs), [100, 100]);
  assert.equal(files(plan).length, 3);
  assert.deepEqual(files(plan).flatMap(file => file.expectedIds).sort(), ['medium', 'slow-1', 'slow-2', 'small']);
  assert.deepEqual(files(plan).find(file => file.file === 'slow.spec.mjs').expectedIds, ['slow-1', 'slow-2']);
  const reordered = report(browserSpecs(source).reverse());
  assert.deepEqual(createChromiumPlan(reordered, timings), plan);
});

test('automatically includes new files and cases; stale duration entries cannot select removed files', () => {
  const source = catalog();
  source.suites[0].suites[0].specs.push(spec('new/subdir/new.spec.mjs', 'new'));
  const plan = createChromiumPlan(source, { files: { ...timings.files, 'deleted.spec.mjs': { tests: 1, durationMs: 10000 } } });
  assert(files(plan).some(file => file.file === 'new/subdir/new.spec.mjs' && file.expectedIds.includes('new')));
  assert(!files(plan).some(file => file.file === 'deleted.spec.mjs'));
  source.suites[0].suites[0].specs.push(spec('slow.spec.mjs', 'slow-3'));
  assert.equal(files(createChromiumPlan(source, timings)).find(file => file.file === 'slow.spec.mjs').estimatedDurationMs, 150);
});

test('rejects empty, duplicate, erroneous, unsafe and multi-project discovery', () => {
  assert.throws(() => createChromiumPlan(report([]), timings), /nonempty/);
  for (const mutate of [
    source => source.suites[0].suites[0].specs.push(spec('slow.spec.mjs', 'slow-1')),
    source => source.errors.push({ message: 'broken import' }),
  ]) { const source = catalog(); mutate(source); assert.throws(() => createChromiumPlan(source, timings), /unique and error-free/); }
  for (const file of ['/absolute.spec.mjs', '../outside.spec.mjs', 'nested/../outside.spec.mjs']) {
    assert.throws(() => createChromiumPlan(report([spec(file, 'a'), spec('b.spec.mjs', 'b')]), timings), /Unsafe/);
  }
  const source = catalog(); source.suites[0].suites[0].specs[0].tests[0].projectName = 'webkit';
  assert.throws(() => createChromiumPlan(source, timings), /single-project Chromium/);
  assert.throws(() => createChromiumPlan(catalog(), { files: { broken: { tests: 0, durationMs: 5 } } }), /duration/);
  assert.throws(() => createChromiumPlan(report([spec('only.spec.mjs', 'only')]), timings), /full catalog exactly once/);
});

test('file filters escape regex metacharacters and cannot match suffix collisions', () => {
  const partition = { files: [{ file: 'nested/a[1]+.spec.mjs' }] };
  const regex = new RegExp(chromiumFileFilters(partition)[0]);
  assert(regex.test('/checkout/tests/nested/a[1]+.spec.mjs'));
  assert(!regex.test('/checkout/tests/other/nested/a[1]+.spec.mjs'));
  assert(!regex.test('/checkout/tests/nested/a1.spec.mjs'));
  assert(!regex.test('/checkout/tests/nested/a[1]+.spec.mjs.extra'));
});

test('validates selected discovery against planned IDs before starting a browser', () => {
  const source = catalog(), plan = createChromiumPlan(source, timings);
  const partition = plan.partitions[0];
  const selected = report(browserSpecs(source).filter(spec => partition.files.some(file => file.expectedIds.includes(specKey(spec)))));
  assert.doesNotThrow(() => assertPartitionCatalog(selected, partition));
  selected.suites[0].suites[0].specs.pop();
  assert.throws(() => assertPartitionCatalog(selected, partition), /planned catalog/);
  assert.throws(() => assertPartitionCatalog(source, partition), /planned catalog/);
});

test('aggregation rejects missing, extra, duplicate and stale partition inputs', () => {
  const plan = createChromiumPlan(catalog(), timings);
  assert.doesNotThrow(() => assertChromiumInputs(plan, inputNames, manifests(plan)));
  for (const names of [inputNames.slice(1), [...inputNames, 'extra.zip'], [...inputNames, inputNames[0]], inputNames.filter(name => name !== 'partition-2.json')]) {
    assert.throws(() => assertChromiumInputs(plan, names, manifests(plan)), /exactly both/);
  }
  const stale = manifests(plan); stale[2].plan.partitions[0].files.pop();
  assert.throws(() => assertChromiumInputs(plan, inputNames, stale), /fresh full discovery/);
  const swapped = manifests(plan); swapped[2].partition = 1;
  assert.throws(() => assertChromiumInputs(plan, inputNames, swapped), /partition 2/);
  const absent = manifests(plan); delete absent[2];
  assert.throws(() => assertChromiumInputs(plan, inputNames, absent), /partition 2/);
});

for (const project of ['chromium', 'webkit']) {
  const valid = () => report([spec('same.spec.mjs', 'portrait', project), spec('same.spec.mjs', 'landscape', project)]);
  const rejected = mutate => {
    const result = valid(); mutate(result);
    assert.equal(inspectBrowserReport(result, valid(), project).accepted, false);
  };
  test(`${project} aggregate requires full unique coverage and a single clean passing attempt`, () => {
    assert.equal(inspectBrowserReport(valid(), valid(), project).accepted, true);
    rejected(result => result.suites[0].suites[0].specs.pop());
    rejected(result => result.suites[0].suites[0].specs.push(structuredClone(result.suites[0].suites[0].specs[0])));
    rejected(result => result.suites = []);
    rejected(result => result.errors.push({ message: 'server failed' }));
    for (const status of ['failed', 'skipped', 'timedOut', 'interrupted', 'cancelled']) {
      rejected(result => { browserSpecs(result)[0].tests[0].results[0].status = status; });
    }
    for (const mutate of [
      entry => { entry.results = []; },
      entry => { entry.results.push({ status: 'passed' }); },
      entry => { entry.status = 'flaky'; },
      entry => { entry.results[0].retry = 1; },
      entry => { entry.results[0].errors.push({ message: 'hidden failure' }); },
      entry => { entry.results[0].error = { message: 'hidden failure' }; },
      entry => { entry.expectedStatus = 'failed'; },
      entry => { entry.projectName = 'other'; },
    ]) rejected(result => mutate(browserSpecs(result)[0].tests[0]));
    for (const name of ['expected', 'unexpected', 'flaky', 'skipped']) rejected(result => { result.stats[name]++; });
    const duplicateCatalog = valid(); duplicateCatalog.suites[0].suites[0].specs.push(browserSpecs(duplicateCatalog)[0]);
    assert.equal(inspectBrowserReport(valid(), duplicateCatalog, project).accepted, false);
  });
  test(`${project} aggregate rejects failed, skipped, cancelled and absent matrix conclusions`, () => {
    assert.doesNotThrow(() => requireSuccessfulShards('success', project));
    for (const result of ['failure', 'skipped', 'cancelled', 'neutral', undefined, null]) assert.throws(() => requireSuccessfulShards(result, project), /must succeed/);
  });
}
