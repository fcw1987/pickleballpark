// Model-2 corpus runner. Every attempted result is archived, including no-document failures.
import { readFile, writeFile, appendFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { assessGeneratedFlightFeasibilityV1 } from '../rally-flight-audit.js';
import { normalizeRallyInputV1, validateGenerationRecipeV1, createRallyRequestRecipeV1, RALLY_ENGINE_VERSION, RALLY_POLICY_VERSION, RALLY_PHYSICS_VERSION, RALLY_FLIGHT_PLANNER_VERSION } from '../rally-recipe.js';
import { parseSeeds } from './rally-realism.mjs';
import { METRICS_VERSION_V2, observeRallyV2, summarizeObservationsV2, evaluateCalibrationV2 } from './rally-realism-metrics-v2.mjs';
import holdoutSource from './rally-holdout-v1.json' with { type: 'json' };

export const REPORT_VERSION_V2 = 2;
export const CORE_STYLE_IDS = Object.freeze(['pro', 'advanced', 'intermediate']);
export const DEVELOPMENT_SEEDS = Object.freeze(Array.from({ length: 60 }, (_, i) => i));
export const QUALIFICATION_SEEDS = Object.freeze(Array.from({ length: 300 }, (_, i) => i + 1000));
const STATUSES = ['complete', 'censored', 'unsatisfied', 'cancelled', 'failed'];
const clone = value => structuredClone(value);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const key = job => job.id;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const validSeeds = seeds => Array.isArray(seeds) && seeds.length && new Set(seeds).size === seeds.length
  && seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const SERVICE_ROTATION = Object.freeze([
  Object.freeze({ server: 'player1', receiver: 'player3', court: 'right' }), Object.freeze({ server: 'player1', receiver: 'player3', court: 'left' }),
  Object.freeze({ server: 'player3', receiver: 'player1', court: 'right' }), Object.freeze({ server: 'player3', receiver: 'player1', court: 'left' }),
]);

/** Version 1 fixes the complete reservation; changing its range needs a new definition. */
export function validateHoldoutDefinitionV1(value) {
  const keys = ['version', 'cohort', 'baselineSourceRevision', 'seedStart', 'seedCountPerStyle', 'styles', 'flavour', 'serviceRotation', 'options', 'purpose', 'status'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || canonical(Object.keys(value).sort()) !== canonical(keys.sort())
    || value.version !== 'rally-holdout-v1' || value.cohort !== 'm2-holdout-v1'
    || value.baselineSourceRevision !== '9493af303c181a91f74f0fed3bc4c121ad822072'
    || value.seedStart !== 50000 || value.seedCountPerStyle !== 1200
    || !Array.isArray(value.styles) || value.styles.length !== CORE_STYLE_IDS.length
    || value.styles.some((style, index) => style !== CORE_STYLE_IDS[index]) || value.flavour !== 'balanced'
    || !Array.isArray(value.serviceRotation) || value.serviceRotation.length !== SERVICE_ROTATION.length
    || value.serviceRotation.some((role, index) => !role || Object.keys(role).length !== 3
      || ['server', 'receiver', 'court'].some(key => role[key] !== SERVICE_ROTATION[index][key]))
    || !value.options || Object.keys(value.options).length !== 4
    || value.options.lengthFeel !== 'natural' || value.options.winner !== 'either' || value.options.signatureShots !== true || value.options.maxShots !== 99
    || value.status !== 'RESERVED_NOT_RUN'
    || value.purpose !== 'Reserved before resumed tuning; run once on a frozen reviewed candidate. Do not extend after results.') {
    throw TypeError('Holdout v1 must retain its complete bounded immutable reservation definition');
  }
  return freeze(clone(value));
}
export const HOLDOUT_DEFINITION_V1 = validateHoldoutDefinitionV1(holdoutSource);
export const HOLDOUT_SEEDS_V1 = Object.freeze(Array.from({ length: HOLDOUT_DEFINITION_V1.seedCountPerStyle }, (_, index) => HOLDOUT_DEFINITION_V1.seedStart + index));

export function createCohortSchedule({ cohort = 'development', styles = CORE_STYLE_IDS, flavour = 'balanced', seeds } = {}) {
  if (!['development', 'qualification', 'holdout', 'custom'].includes(cohort)) throw TypeError('Unknown corpus cohort');
  if (!Array.isArray(styles) || !styles.length || new Set(styles).size !== styles.length || styles.some(style => ![...CORE_STYLE_IDS, 'beginner'].includes(style))) throw TypeError('Styles must be unique supported skill IDs');
  if (!['balanced', 'bangers', 'kitchen-masters', 'lobbers'].includes(flavour)) throw TypeError('Unsupported flavour');
  if (cohort !== 'custom' && seeds !== undefined) throw TypeError('Frozen development/qualification/holdout cohorts do not accept replacement seeds');
  if (cohort === 'holdout' && (canonical(styles) !== canonical(HOLDOUT_DEFINITION_V1.styles) || flavour !== HOLDOUT_DEFINITION_V1.flavour)) throw TypeError('Holdout v1 requires every reserved style in order and its balanced flavour');
  seeds = cohort === 'development' ? DEVELOPMENT_SEEDS : cohort === 'qualification' ? QUALIFICATION_SEEDS : cohort === 'holdout' ? HOLDOUT_SEEDS_V1 : seeds;
  if (!validSeeds(seeds)) throw TypeError('Corpus seeds must be unique explicit uint32 values');
  const roles = cohort === 'holdout' ? HOLDOUT_DEFINITION_V1.serviceRotation : SERVICE_ROTATION;
  const jobs = styles.flatMap(style => seeds.map((seed, ordinal) => ({
    id: `${cohort}:${style}:${flavour}:${seed}`, cohort, style, flavour, seed,
    input: {
      seed,
      players: Object.fromEntries(['player1', 'player2', 'player3', 'player4'].map((id, index) => [id, { team: index < 2 ? 'green' : 'orange', handedness: 'right', style, flavour }])),
      service: { ...roles[ordinal % roles.length], courtConvention: 'server-perspective-v1' },
      options: cohort === 'holdout' ? clone(HOLDOUT_DEFINITION_V1.options) : { lengthFeel: 'natural', winner: 'either', signatureShots: true, maxShots: 99 },
    },
  })));
  return cohort === 'holdout' ? freeze(jobs) : jobs;
}

export function validateHoldoutScheduleV1(jobs) {
  if (!Array.isArray(jobs) || jobs.length !== HOLDOUT_DEFINITION_V1.seedCountPerStyle * HOLDOUT_DEFINITION_V1.styles.length
    || canonical(jobs) !== canonical(createCohortSchedule({ cohort: 'holdout' }))) throw TypeError('Holdout v1 requires its exact complete reserved generation schedule');
  return true;
}

/** Reservation metadata is not a ledger of which results a reviewer has seen. */
export function describeCohortEvidenceV2(jobs) {
  const cohorts = [...new Set(jobs.map(job => job.cohort))];
  return {
    cohorts,
    purpose: cohorts.includes('holdout') ? 'reserved-frozen-candidate-holdout' : cohorts.includes('qualification') ? 'examined-qualification-regression-data' : 'development-or-custom-observation',
    examinationState: 'NOT_ESTABLISHED_BY_COLLECTOR', unseenClaim: 'NOT_ASSERTED',
    ...(cohorts.includes('holdout') ? { reservationDefinition: clone(HOLDOUT_DEFINITION_V1),
      note: 'The definition status records the original reservation, not current run history. First use requires a frozen reviewed candidate; examined results used for retuning are not unseen evidence. Do not extend the count or range after results.' }
      : cohorts.includes('qualification') ? { note: 'Qualification seeds 1000–1299 have been examined. This unchanged cohort is regression evidence and does not establish an unseen holdout.' } : {}),
  };
}

const missingObservation = (job, result, generationMs, error = null) => ({
  seed: job.seed, settings: clone(job.input), status: result.status, physicallyValid: false, accepted: false, complete: false, censored: false,
  documentPresent: !!result.document, shots: 0, sourceShots: result.document?.shots?.length ?? null,
  outcome: null, outcomeClassification: result.outcomeClassification ?? null,
  generatedFlightFeasibility: { ...assessGeneratedFlightFeasibilityV1({ document: result.document }), status: 'NOT_EVALUATED' },
  service: result.recipe?.input?.service ?? job.input.service ?? null, servingTeam: null,
  firstAllFourUpShot: null, longestDinkRun: 0, generationMs, validationMs: null,
  attempts: result.recipe?.selection?.attempts ?? result.diagnostics?.attempts ?? null, selectedAttempt: result.recipe?.selection?.selectedAttempt ?? null,
  conditioned: (job.input.options?.lengthFeel ?? 'natural') !== 'natural' || (job.input.options?.winner ?? 'either') !== 'either',
  validation: { acceptedShots: null, compilerErrors: error ? [{ message: error.message }] : [], ruleViolations: [], outcomeMatched: false, terminalMatched: false, sourceUnchanged: true },
  contacts: [], ...(error ? { error: { name: error.name, message: error.message } } : {}),
});

export async function runRealismV2({ generate, jobs = createCohortSchedule(), signal, onRecord = async () => {}, records = null,
  clock = () => performance.now(), sourceRevision = null, minConditionalSamples = 10, minPerformanceSamples = 10 } = {}) {
  if (!Array.isArray(jobs) || !jobs.length || new Set(jobs.map(key)).size !== jobs.length || jobs.some(job => typeof job.id !== 'string' || !job.input || !Number.isInteger(job.seed) || job.seed < 0 || job.seed > 0xffffffff || job.input.seed !== job.seed)) throw TypeError('A unique explicit corpus schedule is required');
  if (jobs.some(job => job.cohort === 'holdout')) validateHoldoutScheduleV1(jobs);
  if (typeof clock !== 'function' || typeof onRecord !== 'function') throw TypeError('Clock and archive callback must be functions');
  if (!generate && !records) generate = (await import('../rally-engine.js')).simulateRally;
  if (!records && typeof generate !== 'function') throw TypeError('A rally generator is required');
  const expected = new Map(jobs.map(job => [key(job), job]));
  if (records && (!Array.isArray(records) || new Set(records.map(record => record.job?.id)).size !== records.length
    || records.some(record => !expected.has(record.job?.id) || record.archiveVersion !== REPORT_VERSION_V2 || record.metricsVersion !== METRICS_VERSION_V2 || !record.result || canonical(record.job) !== canonical(expected.get(record.job.id))))) throw TypeError('Archive rows must be unique model-2 records from the explicit schedule');
  const observations = [], archives = [], failures = [];
  const work = records ? records.map(record => ({ job: expected.get(record.job.id), replay: record })) : jobs.map(job => ({ job }));
  for (const { job, replay } of work) {
    if (signal?.aborted) break;
    let result, generationMs = null, validationMs = null, validationError = null;
    if (replay) { result = clone(replay.result); generationMs = replay.generationMs; }
    else {
      const started = clock();
      try {
        result = await generate({ ...clone(job.input), signal });
        if (!result || !STATUSES.includes(result.status)) throw TypeError('Engine returned an unsupported result status');
      } catch (error) {
        result = { status: error.name === 'AbortError' ? 'cancelled' : 'failed', document: null, outcome: null, decisions: [], stats: {}, recipe: null,
          diagnostics: { thrown: { name: error.name, message: error.message } } };
        validationError = error;
      }
      generationMs = clock() - started;
    }
    const originalResult = clone(result);
    let observation;
    if (!result.document && !validationError) {
      try {
        const request = clone(createRallyRequestRecipeV1(normalizeRallyInputV1(job.input)));
        // Historical request-only archive rows retain their original strict identity.
        if (replay && result.recipe?.policyVersion === 'rally-policy-v1') { request.policyVersion = 'rally-policy-v1'; delete request.flightPlannerVersion; }
        if (canonical(result.recipe) !== canonical(request)) throw Error('No-document result does not retain the normalized request recipe');
        const diagnostic = result.diagnostics;
        if (!Number.isInteger(diagnostic?.attempts) || diagnostic.attempts < 0 || diagnostic.attempts > 64
          || !Array.isArray(diagnostic.attemptedSeeds) || diagnostic.attemptedSeeds.length > diagnostic.attempts
          || diagnostic.attemptedSeeds.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) throw Error('No-document result needs bounded attempts and attempted-seed diagnostics');
      } catch (error) { validationError = error; }
    }
    if (result.document) {
      const source = JSON.stringify(result.document), started = clock();
      try {
        validateDocument(result.document);
        validateGenerationRecipeV1(result.recipe);
        const normalized = normalizeRallyInputV1(job.input);
        if (canonical(result.recipe) !== canonical(result.document.generation)) throw Error('Returned recipe does not match saved generation provenance');
        if (result.recipe.seed !== job.seed || canonical(result.recipe.input) !== canonical({ players: normalized.players, layout: normalized.layout, service: normalized.service, options: normalized.options })) throw Error('Generation provenance does not match the scheduled normalized input');
        const compiled = compileDocument(result.document), rules = validateRallyRules(compiled.play, compiled.timeline);
        if (JSON.stringify(result.document) !== source) throw Error('Public validation mutated its source document');
        validationMs = clock() - started;
        observation = observeRallyV2({ document: result.document, compiled, rules, result, seed: job.seed, settings: job.input, generationMs, validationMs });
      } catch (error) { validationError = error; validationMs = clock() - started; }
    }
    observation ??= missingObservation(job, result, generationMs, validationError);
    observation.jobId = job.id; observation.style = job.style; observation.flavour = job.flavour; observation.cohort = job.cohort;
    if (!observation.accepted) failures.push({ jobId: job.id, seed: job.seed, status: result.status,
      message: validationError?.message ?? result.diagnostics?.reason ?? 'No fully validated selected document', documentPresent: !!result.document });
    const record = { archiveVersion: REPORT_VERSION_V2, metricsVersion: METRICS_VERSION_V2, sourceRevision: replay?.sourceRevision ?? sourceRevision, analysisSourceRevision: sourceRevision,
      job: clone(job), result: originalResult, generationMs, validationMs,
      generatedFlightFeasibility: clone(observation.generatedFlightFeasibility),
      validation: clone(observation.validation), ...(validationError ? { validationError: { name: validationError.name, message: validationError.message } } : {}) };
    observations.push(observation); archives.push(record);
    // An archive write failure is fatal and must not retry the generated rally.
    await onRecord(record);
    if (result.status === 'cancelled') break;
  }
  const attempted = new Set(observations.map(row => row.jobId));
  const missingJobs = jobs.filter(job => !attempted.has(job.id)).map(job => job.id);
  const summary = summarizeObservationsV2(observations);
  const scheduledFeasibility = (audit, scheduledRallies, observedRallies) => ({ ...audit,
    scheduledRallies, missingScheduledRallies: scheduledRallies - observedRallies,
    status: scheduledRallies > observedRallies && audit.status !== 'FAIL' ? 'NOT_EVALUATED' : audit.status,
  });
  summary.generatedFlightFeasibility = scheduledFeasibility(summary.generatedFlightFeasibility, jobs.length, observations.length);
  const byStyle = [...new Set(jobs.map(job => `${job.style}:${job.flavour}`))].map(id => {
    const [style, flavour] = id.split(':'), rows = observations.filter(row => row.style === style && row.flavour === flavour);
    const planned = jobs.filter(job => job.style === style && job.flavour === flavour);
    const summarized = summarizeObservationsV2(rows);
    summarized.generatedFlightFeasibility = scheduledFeasibility(summarized.generatedFlightFeasibility, planned.length, rows.length);
    const naturalJobs = planned.filter(job => (job.input.options?.lengthFeel ?? 'natural') === 'natural' && (job.input.options?.winner ?? 'either') === 'either');
    const naturalIds = new Set(naturalJobs.map(job => job.id));
    const naturalSummary = summarizeObservationsV2(rows.filter(row => naturalIds.has(row.jobId)));
    return { style, flavour, scheduledRallies: planned.length, ...summarized,
      calibration: flavour === 'balanced' && naturalJobs.length ? evaluateCalibrationV2(naturalSummary, { style, expectedRallies: naturalJobs.length, minConditionalSamples, minPerformanceSamples })
        : { status: 'NOT_APPLICABLE', reason: 'Numerical bands apply only to unconditioned natural core-style cohorts; flavour and selection comparisons are separate' } };
  });
  const incomplete = missingJobs.length > 0 || observations.some(row => ['cancelled', 'censored', 'unsatisfied'].includes(row.status));
  const invalid = observations.some(row => row.status === 'failed' || row.error && row.error.name !== 'AbortError' || row.documentPresent && !row.accepted);
  const invalidPhysical = observations.some(row => row.documentPresent && !row.physicallyValid);
  const calibrationStatuses = byStyle.map(row => row.calibration.status).filter(status => status !== 'NOT_APPLICABLE');
  const calibrationStatus = !calibrationStatuses.length ? 'NOT_APPLICABLE' : calibrationStatuses.includes('FAIL') ? 'FAIL'
    : calibrationStatuses.includes('INSUFFICIENT_SAMPLE') ? 'INSUFFICIENT_SAMPLE' : 'PASS';
  const origins = archives.map(record => record.result.document?.generation ?? record.result.recipe).filter(Boolean);
  const sourceVersions = Object.fromEntries(['generatorVersion', 'policyVersion', 'physicsVersion', 'flightPlannerVersion'].map(field => [field, [...new Set(origins.map(origin => origin[field] ?? null))]]));
  const requestedVersions = { generatorVersion: RALLY_ENGINE_VERSION, policyVersion: RALLY_POLICY_VERSION,
    physicsVersion: RALLY_PHYSICS_VERSION, flightPlannerVersion: RALLY_FLIGHT_PLANNER_VERSION };
  const versions = { ...Object.fromEntries(Object.entries(sourceVersions).map(([field, values]) => [field,
    values.length === 1 ? values[0] : values.length === 0 && !records ? requestedVersions[field] : null])), sourceVersions };
  return {
    reportVersion: REPORT_VERSION_V2, metricsVersion: METRICS_VERSION_V2,
    status: invalid ? 'INVALID' : incomplete ? 'INCOMPLETE' : summary.modelSupport.status === 'FAIL' ? 'MODEL_SUPPORT_FAIL' : summary.generatedFlightFeasibility.status === 'FAIL' ? 'GENERATED_FLIGHT_FEASIBILITY_FAIL' : 'PASS',
    statusMeaning: 'Corpus completeness, independent rule validity, generator-model support and separate generated-flight feasibility; calibration retains its original verdict and denominators',
    sourceRevision, generationReplayedFromArchive: !!records, cohortEvidence: describeCohortEvidenceV2(jobs),
    generationSourceRevisions: [...new Set(records ? records.map(record => record.sourceRevision) : [sourceRevision])],
    versions,
    corpus: { status: missingJobs.length ? 'INCOMPLETE' : 'COMPLETE', scheduledRallies: jobs.length, attemptedRallies: observations.length, missingJobs },
    physicalValidity: { status: invalidPhysical ? 'INVALID' : observations.some(row => row.physicallyValid) ? 'PASS' : 'NOT_EVALUATED',
      validDocuments: observations.filter(row => row.physicallyValid).length, invalidDocuments: observations.filter(row => row.documentPresent && !row.physicallyValid).length,
      missingDocuments: observations.filter(row => !row.documentPresent).length },
    modelSupport: summary.modelSupport,
    generatedFlightFeasibility: summary.generatedFlightFeasibility,
    calibration: { status: calibrationStatus, scope: 'homogeneous unconditioned natural core-style cohorts; no game-level rates', minConditionalSamples, minPerformanceSamples },
    schedule: clone(jobs), failures, summary, byStyle, observations,
  };
}

async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') { console.log('Usage: node tools/rally-realism-v2.mjs --cohort development|qualification|holdout|custom [--styles pro,advanced,intermediate] [--flavour balanced] [--seeds 7,9 (custom only)] [--output report.json] [--archive rows.jsonl] [--archive-input rows.jsonl] [--require-calibration] [--require-clean]\nHoldout: immutable 3600-job reservation; requires --require-clean and a frozen reviewed candidate before first use. Qualification: examined seeds 1000–1299, retained as regression data. The collector does not establish whether results remain unseen.'); return; }
    if (['--require-calibration', '--require-clean'].includes(args[i])) { options[args[i]] = true; continue; }
    if (!['--cohort', '--styles', '--flavour', '--seeds', '--output', '--archive', '--archive-input'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Unknown or missing argument: ${args[i]}`);
    if (options[args[i]]) throw Error(`Repeated argument: ${args[i]}`);
    options[args[i]] = args[++i];
  }
  const outputs = [options['--output'], options['--archive']].filter(Boolean).map(path => resolve(path));
  if (new Set(outputs).size !== outputs.length) throw Error('Report and archive need separate output paths');
  for (const path of outputs) {
    try { await access(path); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw Error(`Refusing existing output before generation: ${path}`);
  }
  const cohort = options['--cohort'] ?? (options['--seeds'] ? 'custom' : 'development');
  const jobs = createCohortSchedule({ cohort, styles: options['--styles']?.split(',') ?? CORE_STYLE_IDS,
    flavour: options['--flavour'] ?? 'balanced', ...(options['--seeds'] ? { seeds: parseSeeds(options['--seeds']) } : {}) });
  if (cohort === 'holdout' && !options['--require-clean']) throw Error('Reserved holdout use requires --require-clean and a frozen reviewed candidate');
  const git = (...parameters) => execFileSync('git', parameters, { encoding: 'utf8' }).trim();
  const sourceRevision = git('rev-parse', 'HEAD'), sourceState = git('status', '--porcelain', '--untracked-files=all') ? 'dirty' : 'clean';
  if (options['--require-clean'] && sourceState !== 'clean') throw Error(`${cohort === 'holdout' ? 'Holdout' : 'Qualification'} requires a clean committed source`);
  const files = ['rally-realism-v2.mjs', 'rally-realism-metrics-v2.mjs', ...(cohort === 'holdout' ? ['rally-holdout-v1.json'] : [])];
  const collectorFilesSha256 = Object.fromEntries(await Promise.all(files.map(async file => [file, sha256(await readFile(new URL(file, import.meta.url)))])));
  const records = options['--archive-input'] ? (await readFile(options['--archive-input'], 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)) : null;
  if (options['--archive']) { await mkdir(dirname(resolve(options['--archive'])), { recursive: true }); await writeFile(options['--archive'], '', { flag: 'wx' }); }
  const controller = new AbortController(), interrupt = () => controller.abort(); process.once('SIGINT', interrupt);
  const startedAt = new Date().toISOString(), started = performance.now();
  try {
    const report = await runRealismV2({ jobs, signal: controller.signal, records, sourceRevision,
      onRecord: options['--archive'] ? record => appendFile(options['--archive'], `${JSON.stringify(record)}\n`) : undefined });
    report.provenance = { sourceRevision, sourceState, collectorFilesSha256, node: process.version, platform: process.platform,
      architecture: process.arch, availableParallelism: availableParallelism(), measurementNote: records ? 'Generation timings are original archived observations, not a new performance measurement; independent collector validation is separately timed on this host.' : 'End-to-end generation await includes search, yields and the engine final validation; independent collector validation is separately timed.' };
    report.timing = { startedAt, elapsedMs: performance.now() - started };
    if (options['--archive']) report.archive = { sha256: sha256(await readFile(options['--archive'])) };
    if (options['--archive-input']) report.archiveInput = { sha256: sha256(await readFile(options['--archive-input'])) };
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (options['--output']) { await mkdir(dirname(resolve(options['--output'])), { recursive: true }); await writeFile(options['--output'], text, { flag: 'wx' });
      console.log(JSON.stringify({ output: options['--output'], status: report.status, modelSupport: report.modelSupport.status, generatedFlightFeasibility: report.generatedFlightFeasibility.status, calibration: report.calibration.status, attemptedRallies: report.corpus.attemptedRallies,
        cohortPurpose: report.cohortEvidence.purpose, examinationState: report.cohortEvidence.examinationState })); }
    else process.stdout.write(text);
    if (report.status !== 'PASS' || options['--require-calibration'] && report.calibration.status !== 'PASS') process.exitCode = 1;
  } finally { process.removeListener('SIGINT', interrupt); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
