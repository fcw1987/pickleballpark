// Owner-approved release contract, 2026-10-30. Research calibration remains reported
// evidence; it is not release acceptance. No runtime generation policy is changed.
import { distribution } from './rally-realism-metrics.mjs';
import { evaluateCalibrationV2, METRICS_VERSION_V2 } from './rally-realism-metrics-v2.mjs';

export const RALLY_RELEASE_ACCEPTANCE_VERSION_V1 = 'rally-release-acceptance-v1';
const styles = ['pro', 'advanced', 'intermediate'];
const canonical = value => JSON.stringify(value, function (key, child) {
  return child && typeof child === 'object' && !Array.isArray(child)
    ? Object.fromEntries(Object.keys(child).sort().map(name => [name, child[name]])) : child;
});
const same = (a, b) => canonical(a) === canonical(b);
const empty = value => Array.isArray(value) && value.length === 0;
const audit = value => value?.status === 'PASS' && empty(value.violations);
const roles = [
  { server: 'player1', receiver: 'player3', court: 'right' },
  { server: 'player1', receiver: 'player3', court: 'left' },
  { server: 'player3', receiver: 'player1', court: 'right' },
  { server: 'player3', receiver: 'player1', court: 'left' },
];
/** Independently reconstruct the previously examined schedule, never an unseen claim. */
function validSchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length !== 3600) return false;
  const cohort = schedule[0]?.cohort;
  if (cohort !== 'examined-regression') return false;
  return schedule.every((job, index) => {
    const style = styles[Math.floor(index / 1200)], ordinal = index % 1200, seed = 50000 + ordinal;
    return same(job, { id: `${cohort}:${style}:balanced:${seed}`, cohort, style, flavour: 'balanced', seed,
      input: { seed, players: Object.fromEntries(['player1', 'player2', 'player3', 'player4'].map((id, i) =>
        [id, { team: i < 2 ? 'green' : 'orange', handedness: 'right', style, flavour: 'balanced' }])),
      service: { ...roles[ordinal % 4], courtConvention: 'server-perspective-v1' },
      options: { lengthFeel: 'natural', winner: 'either', signatureShots: true, maxShots: 99 } } });
  });
}

export function evaluateRallyReleaseAcceptanceV1(report, { determinism } = {}) {
  const checks = [];
  const add = (name, passes) => checks.push({ name, status: passes ? 'PASS' : 'FAIL' });
  const schedule = report?.schedule, rows = report?.observations;
  add('exactExaminedRegressionSchedule', validSchedule(schedule));
  const rowMap = new Map(Array.isArray(rows) ? rows.map(row => [row?.jobId, row]) : []);
  add('completeValidatedResults', report?.status === 'PASS' && report?.corpus?.status === 'COMPLETE'
    && report.corpus.scheduledRallies === 3600 && report.corpus.attemptedRallies === 3600
    && empty(report.corpus.missingJobs) && empty(report.failures)
    && Array.isArray(rows) && rows.length === 3600 && rowMap.size === 3600
    && Array.isArray(schedule) && schedule.length === 3600 && schedule.every(job => {
      if (!job || typeof job !== 'object') return false;
      const row = rowMap.get(job.id), v = row?.validation;
      return row?.status === 'complete' && row.complete === true && row.censored === false
        && row.accepted === true && row.physicallyValid === true && row.documentPresent === true
        && row.conditioned === false && row.seed === job.seed && row.style === job.style
        && row.flavour === job.flavour && row.cohort === job.cohort && same(row.settings, job.input)
        && !row.error && Number.isInteger(row.shots) && row.shots > 0 && row.sourceShots === row.shots
        && v?.acceptedShots === row.shots && empty(v.compilerErrors) && empty(v.ruleViolations)
        && v.outcomeMatched === true && v.terminalMatched === true && v.sourceUnchanged === true
        && audit(row.modelSupport) && row.modelSupport.checkedContacts === row.shots
        && row.modelSupport.unsupportedContacts === 0 && audit(row.generatedFlightFeasibility)
        && row.generatedFlightFeasibility.checkedFlights === row.shots;
    }));
  add('physicalModelAndFlightSummaries', report?.physicalValidity?.status === 'PASS'
    && report.physicalValidity.validDocuments === 3600 && report.physicalValidity.invalidDocuments === 0
    && report.physicalValidity.missingDocuments === 0 && audit(report?.modelSupport)
    && audit(report?.generatedFlightFeasibility));
  const comparisons = determinism?.comparisons;
  const comparisonMap = new Map(Array.isArray(comparisons) ? comparisons.map(row => [row?.jobId, row]) : []);
  add('independentDeterministicResults', determinism?.status === 'PASS'
    && Array.isArray(comparisons) && comparisons.length === 3600 && comparisonMap.size === 3600
    && Array.isArray(schedule) && schedule.length === 3600 && schedule.every(job => {
      if (!job || typeof job !== 'object') return false;
      const proof = comparisonMap.get(job.id);
      return /^[a-f0-9]{64}$/.test(proof?.firstSha256) && proof.firstSha256 === proof.secondSha256;
    }));
  const byStyle = report?.byStyle;
  // Reporting remains mandatory even when a research target is not a release
  // gate. Recompute the unchanged goal evaluator so missing/renamed goals,
  // widened bands or a falsely promoted PASS cannot conceal the measurements.
  let goalsRetained = false;
  try {
    const statuses = styles.map(style => {
      const groups = byStyle.filter(row => row.style === style && row.flavour === 'balanced');
      if (groups.length !== 1) throw Error('Missing research cohort');
      const calculated = evaluateCalibrationV2(groups[0], { style, expectedRallies: 1200,
        minConditionalSamples: 10, minPerformanceSamples: 10 });
      if (!same(calculated, groups[0].calibration)) throw Error('Research measurements changed');
      return calculated.status;
    });
    const status = statuses.includes('FAIL') ? 'FAIL' : statuses.includes('INSUFFICIENT_SAMPLE') ? 'INSUFFICIENT_SAMPLE' : 'PASS';
    goalsRetained = report.metricsVersion === METRICS_VERSION_V2 && report.calibration?.status === status
      && report.calibration.minConditionalSamples === 10 && report.calibration.minPerformanceSamples === 10;
  } catch { /* Missing or malformed research evidence fails its reporting check. */ }
  add('unchangedResearchMeasurementsReported', goalsRetained);
  for (const style of styles) {
    const groups = Array.isArray(byStyle) ? byStyle.filter(row => row.style === style && row.flavour === 'balanced') : [];
    const timing = groups[0]?.metrics?.generationTiming?.natural?.twelveContacts;
    const samples = (Array.isArray(rows) ? rows : []).filter(row => row.style === style && row.complete === true
      && row.conditioned === false && row.shots === 12).map(row => row.generationMs);
    const measured = distribution(samples);
    add(`${style}HostedTwelveContactP95`, groups.length === 1 && samples.every(value => Number.isFinite(value) && value >= 0)
      && same(timing, measured) && Number.isInteger(timing?.n) && timing.n >= 10
      && Number.isFinite(timing.p95) && timing.p95 >= 0 && timing.p95 < 100);
  }
  return { contractVersion: RALLY_RELEASE_ACCEPTANCE_VERSION_V1,
    status: checks.every(check => check.status === 'PASS') ? 'PASS' : 'FAIL', requiredChecks: checks,
    reportedGoals: { disposition: 'REPORTED_NOT_RELEASE_BLOCKING', calibration: structuredClone(report?.calibration ?? null),
      byStyle: (Array.isArray(byStyle) ? byStyle : []).map(row => ({ style: row.style, flavour: row.flavour,
        calibration: structuredClone(row.calibration ?? null),
        twelveContactGenerationTiming: structuredClone(row.metrics?.generationTiming?.natural?.twelveContacts ?? null) })),
      referenceDeviceMedianGoalMs: { exclusiveMaximum: 50, minimumSamples: 10, workload: 'complete unconditioned Natural rallies with exactly 12 contacts' } } };
}
