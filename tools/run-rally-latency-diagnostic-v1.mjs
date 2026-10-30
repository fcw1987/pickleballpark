// One predeclared diagnostic, never release acceptance or a qualification retry.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, openSync, closeSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import readline from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostSnapshotV1 } from './rally-latency-telemetry.mjs';
import { deterministicProjectionV1, decodeRepeatV1 } from './rally-latency-diagnostic-cell.mjs';

const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const bytesHash = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const ids = ['old-original', 'old-repeat', 'current-original', 'current-repeat'];
export function validateLatencyProtocolV1(p) {
  if (p?.version !== 'rally-latency-diagnostic-v1' || p.diagnosticOnly !== true || p.nodeVersion !== 'v24.22.1'
    || p.oldRuntimeRevision !== '4e336e3f268dfcce601618fd21319712f1e90456'
    || p.currentRuntimeRevision !== 'd4af73fd2e31442e892f41a254ee0623df8db991'
    || p.runnerClass !== 'ubuntu-24.04' || p.inputs?.length !== 114
    || digest(p.inputs) !== p.inputOrderSha256 || new Set(p.inputs.map(i => i.id)).size !== 114
    || JSON.stringify(p.blocks) !== JSON.stringify([{ id: 1, order: ids }, { id: 2, order: [...ids].reverse() }])
    || JSON.stringify(p.cells) !== JSON.stringify(ids.map(id => ({ id, runtime: id.startsWith('old') ? 'old' : 'current', orchestration: id.endsWith('repeat') ? 'repeat' : 'original' })))) throw Error('Diagnostic protocol differs from its fixed declaration.');
  const counts = {};
  for (const item of p.inputs) {
    if (digest(item.input) !== item.inputSha256 || item.input.seed !== item.seed || item.expectedShots !== 12
      || item.id !== `holdout:${item.style}:balanced:${item.seed}`
      || !/^[a-f0-9]{64}$/.test(item.expectedDocumentSha256) || !/^[a-f0-9]{64}$/.test(item.expectedOutcomeSha256)
      || item.input.options.lengthFeel !== 'natural' || item.input.options.winner !== 'either' || item.input.options.maxShots !== 99) throw Error('Diagnostic archived input differs.');
    counts[item.style] = (counts[item.style] ?? 0) + 1;
  }
  if (JSON.stringify(counts) !== JSON.stringify({ pro: 47, advanced: 36, intermediate: 31 })) throw Error('Diagnostic style counts differ.');
  return p;
}
const childExit = child => new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
async function archiveRevision(revision, destination) {
  await mkdir(destination);
  const source = spawn('git', ['archive', '--format=tar', revision], { stdio: ['ignore', 'pipe', 'inherit'] });
  const unpack = spawn('tar', ['-xf', '-', '-C', destination], { stdio: ['pipe', 'inherit', 'inherit'] });
  source.stdout.pipe(unpack.stdin);
  const [a, b] = await Promise.all([childExit(source), childExit(unpack)]);
  if (a.code || b.code || a.signal || b.signal) throw Error('Runtime snapshot extraction failed.');
  return { revision, tree: git('rev-parse', `${revision}^{tree}`) };
}
function stats(values) {
  const x = values.filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = f => { const at = (x.length - 1) * f, low = Math.floor(at), high = Math.ceil(at); return x.length ? x[low] + (x[high] - x[low]) * (at - low) : null; };
  return { n: x.length, missing: values.length - x.length, min: x[0] ?? null, median: quantile(.5), p95: quantile(.95), max: x.at(-1) ?? null, mean: x.length ? x.reduce((a, b) => a + b, 0) / x.length : null };
}
export async function summarizeLatencyDiagnosticV1(protocol, runs, resultRoot) {
  const all = [], issues = [];
  for (const run of runs) {
    const directory = join(resultRoot, run.directory);
    const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
    const telemetry = JSON.parse(await readFile(join(directory, 'telemetry.json'), 'utf8'));
    const identity = JSON.parse(await readFile(join(directory, 'identity.json'), 'utf8'));
    let ordinal = 0;
    for await (const line of readline.createInterface({ input: createReadStream(join(directory, 'archive.jsonl')), crlfDelay: Infinity })) {
      if (!line) continue;
      const record = JSON.parse(line), expected = protocol.inputs[ordinal++];
      const generation = telemetry.spans.find(s => s.id === record.job.id && s.kind === 'collector-generation');
      const clocks = telemetry.phases.filter(p => p.phase === 'collector-clock' && p.jobId === record.job.id);
      const generationBoundary = telemetry.phases.find(p => p.phase === 'collector-boundary-check' && p.jobId === record.job.id);
      const observed = { block: run.block, cell: run.cell, runtime: identity.cell.runtime, orchestration: identity.cell.orchestration,
        id: record.job.id, style: record.job.style, seed: record.job.seed, generationMs: record.generationMs, validationMs: record.validationMs,
        status: record.result.status, shots: record.result.document?.shots.length ?? null,
        documentSha256: digest(record.result.document), outcomeSha256: digest(record.result.outcome), projectionSha256: digest(deterministicProjectionV1(record.result)),
        generationCPUms: generation?.cpuDelta ? (generation.cpuDelta.user + generation.cpuDelta.system) / 1000 : null,
        validationCPUms: clocks.length === 4 ? (clocks[3].snapshot.cpu.user - clocks[2].snapshot.cpu.user + clocks[3].snapshot.cpu.system - clocks[2].snapshot.cpu.system) / 1000 : null,
        heapBefore: generation?.before.memory, heapAfter: generation?.after?.memory,
        yieldCount: generation?.observedYieldCount, yieldInitToCallbackMs: generation?.observedYieldInitToBeforeMs,
        overlappingGC: generation?.overlappingGC ?? [], exactBoundaryCheck: generationBoundary,
        repeat: record.repeat ? { firstSha256: record.repeat.firstSha256, secondSha256: record.repeat.secondSha256, encoding: record.repeat.encoding } : null };
      if (!expected || expected.id !== observed.id || digest(record.job.input) !== expected.inputSha256) issues.push({ run: run.directory, id: observed.id, issue: 'input/order mismatch' });
      if (expected && (observed.documentSha256 !== expected.expectedDocumentSha256 || observed.outcomeSha256 !== expected.expectedOutcomeSha256 || observed.shots !== 12 || observed.status !== 'complete')) issues.push({ run: run.directory, id: observed.id, issue: 'archived physical result differs' });
      if (!generationBoundary?.generationMatches || !generationBoundary.validationMatches) issues.push({ run: run.directory, id: observed.id, issue: 'collector timer boundary differs' });
      if (record.repeat && (record.repeat.firstSha256 !== record.repeat.secondSha256 || digest(deterministicProjectionV1(decodeRepeatV1(record.result, record.repeat))) !== observed.projectionSha256)) issues.push({ run: run.directory, id: observed.id, issue: 'repeat mismatch' });
      all.push(observed);
    }
    if (ordinal !== protocol.inputs.length || report.persistedRecords !== protocol.inputs.length || report.interrupted || report.failure || run.exit.code !== 0) issues.push({ run: run.directory, issue: 'incomplete cell', records: ordinal, exit: run.exit });
  }
  const byCell = protocol.cells.map(cell => {
    const samples = all.filter(x => x.cell === cell.id);
    return { ...cell, perBlock: protocol.blocks.map(block => { const rows = samples.filter(x => x.block === block.id); return { block: block.id, generationMs: stats(rows.map(x => x.generationMs)), validationMs: stats(rows.map(x => x.validationMs)), generationCPUms: stats(rows.map(x => x.generationCPUms)), byStyle: ['pro', 'advanced', 'intermediate'].map(style => ({ style, generationMs: stats(rows.filter(x => x.style === style).map(x => x.generationMs)) })) }; }),
      pooledGenerationMs: stats(samples.map(x => x.generationMs)), pooledValidationMs: stats(samples.map(x => x.validationMs)) };
  });
  const comparisons = [];
  for (const block of protocol.blocks) for (const [name, first, second] of [
    ['old repeat/original', 'old-original', 'old-repeat'], ['current repeat/original', 'current-original', 'current-repeat'],
    ['current/old original', 'old-original', 'current-original'], ['current/old repeat', 'old-repeat', 'current-repeat']]) {
    const pairs = protocol.inputs.map(input => { const a = all.find(x => x.block === block.id && x.cell === first && x.id === input.id), b = all.find(x => x.block === block.id && x.cell === second && x.id === input.id); return { id: input.id, style: input.style, firstMs: a?.generationMs, secondMs: b?.generationMs, ratio: a && b && a.generationMs > 0 ? b.generationMs / a.generationMs : null,
      sameDocument: a?.documentSha256 === b?.documentSha256, sameOutcome: a?.outcomeSha256 === b?.outcomeSha256, sameProjection: a?.projectionSha256 === b?.projectionSha256 }; });
    comparisons.push({ block: block.id, name, ratio: stats(pairs.map(p => p.ratio)), byStyle: ['pro', 'advanced', 'intermediate'].map(style => ({ style, ratio: stats(pairs.filter(p => p.style === style).map(p => p.ratio)) })), pairs });
  }
  return { version: 'rally-latency-diagnostic-summary-v1', diagnosticOnly: true, notReleaseAcceptance: true,
    protocolSha256: bytesHash(await readFile(new URL('./rally-latency-diagnostic-v1.json', import.meta.url))),
    plannedFirstGenerations: 912, observedFirstGenerations: all.length, plannedIndependentRepeats: 456, observedIndependentRepeats: all.filter(x => x.repeat).length,
    methodology: protocol.measurement, issues, byCell, comparisons, observations: all };
}

export async function runLatencyDiagnosticV1({ output }) {
  if (!output) throw Error('A fresh --output directory is required.');
  const protocolPath = fileURLToPath(new URL('./rally-latency-diagnostic-v1.json', import.meta.url));
  const protocolBytes = await readFile(protocolPath), protocol = validateLatencyProtocolV1(JSON.parse(protocolBytes));
  if (process.version !== protocol.nodeVersion) throw Error(`Expected ${protocol.nodeVersion}; found ${process.version}`);
  if (git('status', '--porcelain', '--untracked-files=all')) throw Error('Diagnostic requires a clean committed source.');
  const root = resolve(output), results = join(root, 'results');
  await mkdir(dirname(root), { recursive: true }); await mkdir(root); await mkdir(results); await mkdir(join(root, 'snapshots'));
  await writeFile(join(results, 'protocol.json'), protocolBytes, { flag: 'wx' });
  const source = { diagnosticSource: git('rev-parse', 'HEAD'), diagnosticTree: git('rev-parse', 'HEAD^{tree}'), protocolSha256: bytesHash(protocolBytes), hostBefore: hostSnapshotV1(), runtimes: {} };
  for (const runtime of ['old', 'current']) source.runtimes[runtime] = await archiveRevision(protocol[runtime === 'old' ? 'oldRuntimeRevision' : 'currentRuntimeRevision'], join(root, 'snapshots', runtime));
  await writeFile(join(results, 'source-manifests.json'), JSON.stringify(source, null, 2), { flag: 'wx' });
  const runs = [], began = new Date().toISOString();
  await writeFile(join(results, 'execution-plan.json'), JSON.stringify({ declaredBeforeSamples: true, began, blocks: protocol.blocks, processes: 8, sequential: true, diagnosticOnly: true }, null, 2), { flag: 'wx' });
  for (const block of protocol.blocks) for (const cellId of block.order) {
    const cell = protocol.cells.find(c => c.id === cellId), directory = `block-${block.id}-${cellId}`;
    const logOut = openSync(join(results, `${directory}.stdout.log`), 'wx'), logErr = openSync(join(results, `${directory}.stderr.log`), 'wx');
    console.log(JSON.stringify({ diagnosticOnly: true, event: 'cell-start', block: block.id, cell: cellId, at: new Date().toISOString() }));
    const child = spawn(process.execPath, [fileURLToPath(new URL('./rally-latency-diagnostic-cell.mjs', import.meta.url)), '--protocol', protocolPath,
      '--runtime-root', join(root, 'snapshots', cell.runtime), '--cell', cellId, '--block', String(block.id), '--output-dir', join(results, directory)], { stdio: ['ignore', logOut, logErr] });
    let exit;
    try { exit = await childExit(child); } finally { closeSync(logOut); closeSync(logErr); }
    runs.push({ block: block.id, cell: cellId, directory, exit });
    await writeFile(join(results, 'executions.json'), JSON.stringify(runs, null, 2));
    console.log(JSON.stringify({ diagnosticOnly: true, event: 'cell-end', block: block.id, cell: cellId, exit, at: new Date().toISOString() }));
    if (exit.code !== 0 || exit.signal) throw Error('Diagnostic cell did not complete; no retries or replacement cells are allowed.');
  }
  const summary = await summarizeLatencyDiagnosticV1(protocol, runs, results);
  await writeFile(join(results, 'summary.json'), JSON.stringify(summary, null, 2), { flag: 'wx' });
  await writeFile(join(results, 'host-after.json'), JSON.stringify(hostSnapshotV1(), null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ diagnosticOnly: true, notReleaseAcceptance: true, processes: runs.length,
    firstGenerations: summary.observedFirstGenerations, independentRepeats: summary.observedIndependentRepeats, issues: summary.issues.length, output: results }));
  if (summary.issues.length) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output') { console.error('Usage: node tools/run-rally-latency-diagnostic-v1.mjs --output FRESH_DIRECTORY'); process.exitCode = 1; }
  else runLatencyDiagnosticV1({ output: args[1] }).catch(error => { console.error(error); process.exitCode = 1; });
}
