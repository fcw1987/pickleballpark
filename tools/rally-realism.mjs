// Tools-only baseline runner. Custom adapters return documents; production
// validation/compilation remains authoritative unless an adapter supplies its
// own versioned compiler (for a future document model).
import { readFile, writeFile, mkdir, appendFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legacyAdapter } from './rally-realism-adapters.mjs';
import { METRICS_VERSION, summarizeObservations, observeRally } from './rally-realism-metrics.mjs';

export const REPORT_VERSION = 1;
const sha256 = value => createHash('sha256').update(value).digest('hex');

function settingsKey(value, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw TypeError('Settings must contain finite plain JSON values');
  seen.add(value);
  const text = Array.isArray(value) ? `[${Array.from(value, item => settingsKey(item, seen)).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${settingsKey(value[key], seen)}`).join(',')}}`;
  seen.delete(value);
  return text;
}

export async function runRealism({ adapter = legacyAdapter, seeds, settings, signal,
  clock = () => performance.now(), onRecord = async () => {}, records = null } = {}) {
  if (!adapter?.name || !adapter?.version || typeof adapter.generate !== 'function') throw TypeError('A named, versioned generator adapter is required');
  if (!Array.isArray(seeds) || !seeds.length || seeds.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) throw TypeError('Seeds must be explicit uint32 values');
  if (new Set(seeds).size !== seeds.length) throw TypeError('Duplicate seeds would silently reweight the corpus');
  if (!Array.isArray(settings) || !settings.length || settings.some(value => !value || typeof value !== 'object' || Array.isArray(value))) throw TypeError('Explicit settings objects are required');
  if (new Set(settings.map(value => settingsKey(value))).size !== settings.length) throw TypeError('Duplicate settings would silently reweight the corpus');
  const observations = [], failures = [];
  const scheduled = settings.flatMap(setting => seeds.map(seed => ({ seed, settings: setting })));
  const key = job => `${job.seed}:${settingsKey(job.settings)}`;
  const keys = new Set(scheduled.map(key));
  if (records && (records.some(record => !keys.has(key(record))) || new Set(records.map(key)).size !== records.length)) throw Error('Archive records must be unique members of the explicit corpus');
  const jobs = records ?? scheduled;
  for (const job of jobs) {
    if (signal?.aborted) break;
    let result, generationMs, original, archiveRecord;
    try {
      if (records) {
        if (job.generatorVersion !== adapter.version) throw Error('Archive generator version does not match adapter');
        result = { document: job.document, outcome: job.outcome, censored: job.censored, incomplete: job.incomplete };
        generationMs = job.generationMs;
      } else {
        const started = clock();
        result = await adapter.generate({ seed: job.seed, settings: structuredClone(job.settings), signal });
        generationMs = clock() - started;
      }
      if (!result?.document) {
        const error = Error(result?.reason ?? 'Generator returned no document');
        error.incomplete = result?.incomplete === true;
        throw error;
      }
      original = JSON.stringify(result.document);
      adapter.validate(result.document);
      const compileStart = clock(), compiled = adapter.compile(result.document);
      const rules = adapter.rules(compiled.play, compiled.timeline);
      const compileMs = clock() - compileStart;
      if (JSON.stringify(result.document) !== original) throw Error('Validation/compiler mutated its source document');
      const observation = observeRally({ document: result.document, compiled, rules, result,
        seed: job.seed, settings: structuredClone(job.settings), generationMs });
      observation.compileMs = compileMs;
      observations.push(observation);
      archiveRecord = { schemaVersion: REPORT_VERSION, generatorVersion: adapter.version,
        seed: job.seed, settings: job.settings, document: JSON.parse(original),
        outcome: result.outcome ?? null, censored: observation.censored, incomplete: observation.incomplete, generationMs };
    } catch (error) {
      failures.push({ seed: job.seed, settings: job.settings, message: error.message, incomplete: error.incomplete === true });
      if (original) archiveRecord = { schemaVersion: REPORT_VERSION, generatorVersion: adapter.version,
        seed: job.seed, settings: job.settings, document: JSON.parse(original), generationMs,
        censored: true, outcome: null, error: error.message };
    }
    // Archive I/O failure aborts the run; it is not a second generator attempt.
    if (archiveRecord) await onRecord(archiveRecord);
  }
  const summary = summarizeObservations(observations);
  return { reportVersion: REPORT_VERSION, metricsVersion: METRICS_VERSION,
    status: signal?.aborted || jobs.length !== scheduled.length || observations.some(o => o.incomplete) || failures.some(f => f.incomplete) ? 'INCOMPLETE' : failures.length || summary.denominators.invalidRallies ? 'INVALID' : 'PASS',
    statusMeaning: 'Corpus completeness and document/compiler/rule validation, not realism calibration',
    calibrationStatus: 'NOT_EVALUATED',
    generator: { name: adapter.name, version: adapter.version, limits: adapter.limits ?? null },
    inputs: { seeds: [...seeds], settings: structuredClone(settings) },
    attemptedRallies: observations.length + failures.length, scheduledRallies: scheduled.length,
    generationReplayedFromArchive: !!records, failures, summary,
    bySettings: settings.map(setting => ({ settings: setting,
      ...summarizeObservations(observations.filter(o => settingsKey(o.settings) === settingsKey(setting))) })),
    observations };
}

export function parseSeeds(value) {
  const values = value.includes(':') ? (() => {
    const parts = value.split(':');
    if (parts.some(part => part.trim() === '')) throw Error('Seed range needs both endpoints');
    const [start, end, ...extra] = parts.map(Number);
    if (extra.length || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > 0xffffffff || end - start > 9999) throw Error('Seed range must be increasing uint32 values, at most 10000 seeds');
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  })() : value.split(',').map(item => item.trim() === '' ? NaN : Number(item));
  if (!values.length || values.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) throw Error('Seeds must be comma-separated uint32 values or an inclusive start:end range');
  return values;
}

async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      console.log('Usage: node tools/rally-realism.mjs --seeds 0:27 --lengths 12,30,60 [--adapter ./adapter.mjs] [--settings JSON] [--output release-results/report.json] [--archive release-results/rallies.jsonl] [--archive-input release-results/rallies.jsonl]');
      return;
    }
    if (!['--seeds', '--lengths', '--settings', '--adapter', '--output', '--archive', '--archive-input'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Unknown or missing argument: ${args[i]}`);
    if (options[args[i]]) throw Error(`Repeated argument: ${args[i]}`);
    options[args[i]] = args[++i];
  }
  if (!options['--seeds']) throw Error('Record explicit --seeds; there is no hidden random default');
  const seeds = parseSeeds(options['--seeds']);
  if (!!options['--settings'] === !!options['--lengths']) throw Error('Choose exactly one of --settings or --lengths');
  const settings = options['--settings'] ? [JSON.parse(options['--settings'])] : options['--lengths'].split(',').map(value => {
    const length = Number(value);
    if (!Number.isInteger(length) || length < 1 || length > 99) throw Error('Legacy length must be an integer from 1 through 99');
    return { length };
  });
  const outputs = [options['--output'], options['--archive']].filter(Boolean).map(value => resolve(value));
  if (new Set(outputs).size !== outputs.length) throw Error('Report and archive need separate output paths');
  for (const path of outputs) {
    try { await access(path); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw Error(`Refusing existing output before generation: ${path}`);
  }
  const adapterPath = options['--adapter'] ? resolve(options['--adapter']) : fileURLToPath(new URL('./rally-realism-adapters.mjs', import.meta.url));
  const adapter = options['--adapter'] ? (await import(pathToFileURL(adapterPath).href)).default : legacyAdapter;
  for (const method of ['validate', 'compile', 'rules']) if (typeof adapter?.[method] !== 'function') throw Error(`Adapter needs ${method} so observations use a real compiled/rules path`);
  const git = (...params) => execFileSync('git', params, { encoding: 'utf8' }).trim();
  const collectorFiles = ['rally-realism.mjs', 'rally-realism-metrics.mjs', 'rally-realism-adapters.mjs'];
  const digests = {};
  for (const file of collectorFiles) digests[file] = sha256(await readFile(new URL(file, import.meta.url)));
  const provenance = { sourceRevision: git('rev-parse', 'HEAD'),
    sourceState: git('status', '--porcelain', '--untracked-files=all') ? 'dirty' : 'clean',
    collectorFilesSha256: digests, adapterSha256: sha256(await readFile(adapterPath)),
    node: process.version, platform: process.platform, architecture: process.arch,
    availableParallelism: availableParallelism(),
    measurementNote: 'One observational pass on this host; generation time includes cooperative yields and is not an isolated CI benchmark.' };
  const records = options['--archive-input'] ? (await readFile(options['--archive-input'], 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)) : null;
  if (records && records.some(r => !seeds.includes(r.seed) || !settings.some(s => settingsKey(s) === settingsKey(r.settings)))) throw Error('Archive records must match the explicit seeds and settings');
  if (options['--archive']) { await mkdir(dirname(resolve(options['--archive'])), { recursive: true }); await writeFile(options['--archive'], '', { flag: 'wx' }); }
  const controller = new AbortController();
  const interrupt = () => controller.abort(); process.once('SIGINT', interrupt);
  const startedAt = new Date().toISOString(), started = performance.now();
  try {
    const report = await runRealism({ adapter, seeds, settings, records, signal: controller.signal,
      onRecord: options['--archive'] ? record => appendFile(options['--archive'], `${JSON.stringify({ ...record, sourceRevision: provenance.sourceRevision })}\n`) : undefined });
    report.provenance = provenance;
    report.timing = { startedAt, elapsedMs: performance.now() - started };
    if (options['--archive-input']) report.archiveInput = { sha256: sha256(await readFile(options['--archive-input'])) };
    if (options['--archive']) report.archive = { sha256: sha256(await readFile(options['--archive'])) };
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (options['--output']) {
      await mkdir(dirname(resolve(options['--output'])), { recursive: true });
      await writeFile(options['--output'], text, { flag: 'wx' });
      console.log(JSON.stringify({ output: options['--output'], status: report.status, attemptedRallies: report.attemptedRallies, censoredRallies: report.summary.denominators.censoredRallies }));
    } else process.stdout.write(text);
    if (report.status !== 'PASS') process.exitCode = 1;
  } finally { process.removeListener('SIGINT', interrupt); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
