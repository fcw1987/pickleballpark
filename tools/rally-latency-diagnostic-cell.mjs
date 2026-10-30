// Diagnostic only. Does not change a runtime, collector, release gate, or holdout.
import { appendFile, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { createLatencyTelemetryV1, hostSnapshotV1 } from './rally-latency-telemetry.mjs';

export const projectionKeysV1 = ['status', 'document', 'outcome', 'decisions', 'stats', 'recipe', 'outcomeClassification'];
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const deterministicProjectionV1 = result => Object.fromEntries(projectionKeysV1.map(key => [key, result?.[key] ?? null]));
export function encodeRepeatV1(first, repeated) {
  // Exactly two production projection hashes. Do not retain matching projection twice.
  const firstSha256 = digest(deterministicProjectionV1(first)), secondSha256 = digest(deterministicProjectionV1(repeated));
  const matches = firstSha256 === secondSha256;
  return { firstSha256, secondSha256, ...(matches ? { encoding: 'first-projection-alias-v1',
    presentProjectionKeys: projectionKeysV1.filter(key => Object.hasOwn(repeated, key)),
    nullProjectionKeys: projectionKeysV1.filter(key => Object.hasOwn(repeated, key) && repeated[key] === null),
    undefinedProjectionKeys: projectionKeysV1.filter(key => Object.hasOwn(repeated, key) && repeated[key] === undefined),
    nonProjection: Object.fromEntries(Object.entries(repeated).filter(([key]) => !projectionKeysV1.includes(key))) } : { encoding: 'full-result-v1', repeatedResult: repeated }) };
}
export function decodeRepeatV1(first, encoded) {
  if (encoded.encoding === 'full-result-v1') return encoded.repeatedResult;
  return { ...Object.fromEntries(encoded.presentProjectionKeys.map(key => [key, encoded.undefinedProjectionKeys?.includes(key) ? undefined : encoded.nullProjectionKeys.includes(key) ? null : first[key]])), ...encoded.nonProjection };
}
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
export async function runDiagnosticCellV1({ protocol: protocolPath, runtimeRoot, cell: cellId, block, outputDir }) {
  const protocolBytes = await readFile(protocolPath), protocol = JSON.parse(protocolBytes);
  const cell = protocol.cells?.find(c => c.id === cellId), chosenBlock = protocol.blocks?.find(b => b.id === Number(block));
  if (protocol.version !== 'rally-latency-diagnostic-v1' || protocol.diagnosticOnly !== true || !cell || !chosenBlock?.order.includes(cellId)) throw Error('Unknown diagnostic protocol, cell, or block.');
  if (process.version !== protocol.nodeVersion) throw Error(`Expected ${protocol.nodeVersion}; found ${process.version}`);
  if (!['old', 'current'].includes(cell.runtime) || !['original', 'repeat'].includes(cell.orchestration)) throw Error('Invalid cell definition.');
  if (protocol.inputs.length !== 114 || new Set(protocol.inputs.map(x => x.id)).size !== 114) throw Error('Expected fixed114 unique archived inputs.');
  const root = resolve(runtimeRoot), output = resolve(outputDir), revision = protocol[cell.runtime === 'old' ? 'oldRuntimeRevision' : 'currentRuntimeRevision'];
  // Exclusive directory prevents accidental overwrite or continuation of an old cell.
  await mkdir(output, { recursive: false });
  const hashFiles = [...(await readdir(root)).filter(p => p.endsWith('.js')), ...(await readdir(join(root, 'tools'))).filter(p => p.endsWith('.mjs')).map(p => `tools/${p}`)].sort();
  const sourceHashes = Object.fromEntries(await Promise.all(hashFiles.map(async p => [p, hashBytes(await readFile(join(root, p)))])));
  const identity = { diagnosticOnly: true, protocolSha256: hashBytes(protocolBytes), revision, cell, block: Number(block), node: process.version,
    instrumentationNote: 'Collector clock captures performance.now before synchronous CPU/memory/resource snapshots. Start snapshot costs included; end snapshots occur after returned boundary. Same instrumentation all cells; no subtraction. Direct selected-runtime simulateRally passed to collector; no side then or extra await.', sourceHashes, nodeExecutableSha256: hashBytes(await readFile(process.execPath)), executable: process.execPath, startHost: hostSnapshotV1(), childSha256: hashBytes(await readFile(fileURLToPath(import.meta.url))), telemetrySha256: hashBytes(await readFile(new URL('./rally-latency-telemetry.mjs', import.meta.url))) };
  await writeFile(join(output, 'identity.json'), JSON.stringify(identity, null, 2), { flag: 'wx' });
  const { simulateRally } = await import(pathToFileURL(join(root, 'rally-engine.js')));
  const { runRealismV2 } = await import(pathToFileURL(join(root, 'tools/rally-realism-v2.mjs')));
  const jobs = protocol.inputs.map(j => ({ ...j, cohort: 'latency-diagnostic', flavour: 'balanced' }));
  const telemetry = createLatencyTelemetryV1(), controller = new AbortController();
  const interrupt = () => controller.abort(); process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  let clockBoundary = 0, persisted = 0, report, failure;
  try {
    report = await runRealismV2({ jobs, generate: simulateRally, sourceRevision: revision, signal: controller.signal, clock: () => telemetry.clock(jobs[persisted]?.id, clockBoundary++),
      onRecord: async record => {
        let repeatEncoding = null;
        const boundaries = telemetry.phases.filter(event => event.phase === 'collector-clock' && event.jobId === record.job.id);
        telemetry.event('collector-boundary-check', { jobId: record.job.id, timestamps: boundaries.map(event => event.at),
          generationMatches: boundaries.length >= 2 && boundaries[1].at - boundaries[0].at === record.generationMs,
          validationMatches: record.validationMs === null ? boundaries.length === 2 : boundaries.length === 4 && boundaries[3].at - boundaries[2].at === record.validationMs });
        clockBoundary = 0;
        telemetry.event('collector-record', { jobId: record.job.id, generationMs: record.generationMs, validationMs: record.validationMs });
        if (cell.orchestration === 'repeat' && !controller.signal.aborted) {
          const span = telemetry.begin(record.job.id, 'independent-repeat'); let repeated;
          try { repeated = await simulateRally({ ...structuredClone(record.job.input), signal: controller.signal }); }
          catch (error) { repeated = { status: 'failed', document: null, outcome: null, decisions: [], stats: null, recipe: null, outcomeClassification: null, diagnostics: { code: 'repeat-exception', name: error.name, message: error.message } }; }
          telemetry.end(span); telemetry.event('canonical-comparison-start', { jobId: record.job.id });
          repeatEncoding = encodeRepeatV1(record.result, repeated);
          record.determinism = { jobId: record.job.id, firstSha256: repeatEncoding.firstSha256, secondSha256: repeatEncoding.secondSha256 };
          telemetry.event('canonical-comparison-end', { jobId: record.job.id });
        }
        if (controller.signal.aborted) record.interruption = { phase: 'collection-or-repeat' };
        telemetry.event('archive-append-start', { jobId: record.job.id });
        // Persist a recoverable alias without retaining the second diagnostics
        // graph in the collector's in-memory first-result archive.
        await appendFile(join(output, 'archive.jsonl'), `${JSON.stringify(repeatEncoding ? { ...record, repeat: repeatEncoding } : record)}\n`); persisted++;
        telemetry.event('archive-append-end', { jobId: record.job.id });
      } });
  } catch (error) { failure = { name: error.name, message: error.message, stack: error.stack }; }
  finally {
    // Drain pending observer deliveries after all measured work; no GC is forced.
    await yieldTurn(); await yieldTurn();
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    await writeFile(join(output, 'telemetry.json'), JSON.stringify({ ...telemetry.finish(), endHost: hostSnapshotV1() }), { flag: 'wx' });
    await writeFile(join(output, 'report.json'), JSON.stringify({ diagnosticOnly: true, interrupted: controller.signal.aborted, persistedRecords: persisted, failure, report }, null, 2), { flag: 'wx' });
  }
  if (failure || controller.signal.aborted || persisted !== jobs.length) throw Error('Diagnostic cell incomplete; raw evidence retained.');
  return { diagnosticOnly: true, persistedRecords: persisted, output };
}
function parse(args) { const map = {}; for (let i = 0; i < args.length; i += 2) { if (!['--protocol', '--runtime-root', '--cell', '--block', '--output-dir'].includes(args[i]) || !args[i + 1] || map[args[i]]) throw Error('Expected --protocol PATH --runtime-root PATH --cell ID --block1|2 --output-dir PATH'); map[args[i]] = args[i + 1]; } if (Object.keys(map).length !== 5) throw Error('Five diagnostic arguments required.'); return { protocol: map['--protocol'], runtimeRoot: map['--runtime-root'], cell: map['--cell'], block: map['--block'], outputDir: map['--output-dir'] }; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runDiagnosticCellV1(parse(process.argv.slice(2))).then(value => console.log(JSON.stringify(value))).catch(error => { console.error(error); process.exitCode = 1; });
