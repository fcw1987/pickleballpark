// Required examined-corpus regression. This never consumes or updates a holdout
// reservation. Historical calibration values retain their independent verdicts.
import { appendFile, mkdir, open, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { availableParallelism, cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { createCohortSchedule, runRealismV2 } from './rally-realism-v2.mjs';
import { evaluateRallyReleaseAcceptanceV1 } from './rally-release-acceptance-v1.mjs';

export const EXAMINED_REGRESSION_VERSION = 'rally-examined-regression-v1';
export const EXAMINED_REGRESSION_DEFINITION = Object.freeze({
  version: EXAMINED_REGRESSION_VERSION, cohort: 'examined-regression',
  seedStart: 50000, seedCountPerStyle: 1200,
  styles: Object.freeze(['pro', 'advanced', 'intermediate']), flavour: 'balanced',
  purpose: 'Required physical and deterministic regression on previously examined inputs; not unseen qualification.',
});
const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

export function createExaminedRegressionScheduleV1() {
  const definition = EXAMINED_REGRESSION_DEFINITION;
  // Reuse the ordinary explicit-input constructor, independently of the
  // immutable first-qualification reservation and its consumed-run ledger.
  const seeds = Array.from({ length: definition.seedCountPerStyle }, (_, i) => definition.seedStart + i);
  return freeze(createCohortSchedule({ cohort: 'custom', styles: [...definition.styles], flavour: definition.flavour, seeds })
    .map(job => ({ ...job, cohort: definition.cohort, id: `${definition.cohort}:${job.style}:${job.flavour}:${job.seed}` })));
}

export function deterministicResultProjectionV1(result) {
  // These are the complete deterministic deliverables. Diagnostics contain
  // observational timing/work counters and are retained in the raw archive.
  return Object.fromEntries(['status', 'document', 'outcome', 'decisions', 'stats', 'recipe', 'outcomeClassification']
    .map(key => [key, result?.[key] ?? null]));
}
export function compareRallyResultsV1(jobId, first, second) {
  return { jobId, firstSha256: digest(deterministicResultProjectionV1(first)),
    secondSha256: digest(deterministicResultProjectionV1(second)) };
}
async function hashFile(path, signal) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    checkInterruption(signal, 'archive-hashing');
    hash.update(chunk);
  }
  return hash.digest('hex');
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
function checkInterruption(signal, phase) {
  if (!signal?.aborted) return;
  const error = new Error(`Regression interrupted during ${phase}.`);
  error.name = 'AbortError'; error.code = 'REGRESSION_INTERRUPTED'; error.phase = phase;
  throw error;
}

/** Preserve the first observation even when its independent repeat is cancelled. */
export async function recordRegressionRepeatV1(record, { signal, generate, persist }) {
  let repeated;
  if (!signal?.aborted) {
    try { repeated = await generate({ ...clone(record.job.input), signal }); }
    catch (error) { repeated = { status: 'failed', document: null, outcome: null,
      decisions: [], stats: null, recipe: null, outcomeClassification: null,
      diagnostics: { code: 'repeat-exception', name: error.name, message: error.message } }; }
  }
  if (signal?.aborted) {
    record.interruption = { phase: 'independent-repeat', repeatedResult: repeated ?? null };
    await persist(record);
    checkInterruption(signal, 'independent-repeat');
  }
  const comparison = compareRallyResultsV1(record.job.id, record.result, repeated);
  record.determinism = comparison;
  if (comparison.firstSha256 !== comparison.secondSha256) record.determinismFailure = { repeatedResult: repeated };
  await persist(record);
  checkInterruption(signal, 'archive-write');
  return comparison;
}

/** Finalization has a cancellation boundary after hashing and after publication. */
export async function finalizeRegressionReportV1(report, { signal, hashArchive, publish }) {
  checkInterruption(signal, 'finalization');
  report.archive = { sha256: await hashArchive() };
  checkInterruption(signal, 'archive-hashing');
  await publish(report);
  // Deliver a queued SIGINT before declaring completion. The caller replaces
  // its own newly written report with a non-success record if this throws.
  await yieldTurn();
  checkInterruption(signal, 'report-publication');
  return report;
}

export async function persistRegressionInterruptionV1({ output, archive, sourceRevision, persistedRecords, error, outputCreated }) {
  const interrupted = { status: 'INTERRUPTED', sourceRevision, persistedRecords,
    interruption: { phase: error.phase ?? 'collection', message: error.message },
    releaseAcceptance: { contractVersion: 'rally-release-acceptance-v1', status: 'FAIL',
      requiredChecks: [{ name: 'uninterruptedCompletion', status: 'FAIL' }] },
    archive: { path: archive, evidence: 'Partial records retained unchanged; no successful completion claimed.' } };
  // Only a report successfully created by this run may be replaced. Existing
  // unrelated evidence remains protected by the exclusive-create path.
  await writeFile(output, `${JSON.stringify(interrupted, null, 2)}\n`, { flag: outputCreated ? 'w' : 'wx' });
  return interrupted;
}

export async function runRequiredRegressionV1({ output, archive, requireClean = false } = {}) {
  if (!output || !archive || resolve(output) === resolve(archive)) throw Error('Distinct report and archive paths are required.');
  // No point is generated if an output path already exists or source identity
  // fails. Once generation starts, numerical failures are recorded, never retried.
  for (const path of [output, archive]) {
    try { await stat(path); throw Error(`Refusing existing regression evidence: ${path}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const sourceRevision = git('rev-parse', 'HEAD'), sourceState = git('status', '--porcelain', '--untracked-files=all') ? 'dirty' : 'clean';
  if (requireClean && sourceState !== 'clean') throw Error('Required regression needs an exact clean committed source.');
  await mkdir(dirname(resolve(output)), { recursive: true });
  await mkdir(dirname(resolve(archive)), { recursive: true });
  const file = await open(archive, 'wx'); await file.close();
  const { simulateRally } = await import('../rally-engine.js');
  const jobs = createExaminedRegressionScheduleV1(), comparisons = [], statuses = {};
  let persistedRecords = 0, outputCreated = false;
  const controller = new AbortController(), interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  const startedAt = new Date().toISOString(), began = performance.now();
  try {
    const report = await runRealismV2({ jobs, sourceRevision, signal: controller.signal,
      onRecord: async record => {
        const comparison = await recordRegressionRepeatV1(record, { signal: controller.signal, generate: simulateRally,
          persist: async value => { await appendFile(archive, `${JSON.stringify(value)}\n`); persistedRecords++; } });
        comparisons.push(comparison);
        statuses[record.result.status] = (statuses[record.result.status] ?? 0) + 1;
        if (comparisons.length % 300 === 0) console.log(JSON.stringify({ attempted: comparisons.length, statuses, elapsedMs: performance.now() - began }));
      } });
    checkInterruption(controller.signal, 'acceptance');
    const determinism = { version: 'rally-determinism-regression-v1',
      status: comparisons.length === jobs.length && comparisons.every(c => c.firstSha256 === c.secondSha256) ? 'PASS' : 'FAIL',
      comparisons };
    report.cohortEvidence = { cohorts: ['examined-regression'], purpose: EXAMINED_REGRESSION_DEFINITION.purpose,
      examinationState: 'CONSUMED_AND_EXAMINED', unseenClaim: 'NOT_ASSERTED', definition: clone(EXAMINED_REGRESSION_DEFINITION),
      note: 'The original qualification archive and its failed verdict are immutable. This required regression does not reserve, consume or renew a holdout.' };
    report.determinism = determinism;
    report.releaseAcceptance = evaluateRallyReleaseAcceptanceV1(report, { determinism });
    report.provenance = { sourceRevision, sourceState, node: process.version, platform: process.platform,
      architecture: process.arch, cpuModel: cpus()[0]?.model ?? null, availableParallelism: availableParallelism(),
      measurementNote: 'First-run end-to-end Natural generation includes default real yields and independent final validation. The separate independent determinism repeat is not included in that latency observation.' };
    report.timing = { startedAt, elapsedMs: performance.now() - began };
    await finalizeRegressionReportV1(report, { signal: controller.signal, hashArchive: () => hashFile(archive, controller.signal),
      publish: async value => { await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); outputCreated = true; } });
    console.log(JSON.stringify({ output, archive, sourceRevision, releaseAcceptance: report.releaseAcceptance.status,
      physicalRegression: report.status, determinism: determinism.status, realismGoals: report.calibration.status,
      attempted: report.corpus.attemptedRallies, scheduled: jobs.length, archiveSha256: report.archive.sha256 }));
    return report;
  } catch (error) {
    if (controller.signal.aborted) {
      await persistRegressionInterruptionV1({ output, archive, sourceRevision, persistedRecords, error, outputCreated });
    }
    throw error;
  } finally { process.removeListener('SIGINT', interrupt); }
}

async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--require-clean') options.requireClean = true;
    else if (['--output', '--archive'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i].slice(2)] = args[++i];
    else throw Error(`Unsupported regression argument: ${args[i]}`);
  }
  const report = await runRequiredRegressionV1(options);
  if (report.releaseAcceptance.status !== 'PASS') process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
