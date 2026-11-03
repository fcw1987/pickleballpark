// Owner-approved November 3 contract: latency is advisory evidence. The fixed
// physical/deterministic corpus and truthful reporting remain release checks.
// Keep v1 immutable so historical failed reports retain their original meaning.
import { evaluateRallyReleaseAcceptanceV1 } from './rally-release-acceptance-v1.mjs';
import { distribution } from './rally-realism-metrics.mjs';

export const RALLY_RELEASE_ACCEPTANCE_VERSION_V2 = 'rally-release-acceptance-v2';
const styles = ['pro', 'advanced', 'intermediate'];
const canonical = value => JSON.stringify(value, function (key, child) {
  return child && typeof child === 'object' && !Array.isArray(child)
    ? Object.fromEntries(Object.keys(child).sort().map(name => [name, child[name]])) : child;
});

export function evaluateRallyReleaseAcceptanceV2(report, { determinism } = {}) {
  const historical = evaluateRallyReleaseAcceptanceV1(report, { determinism });
  const timing = styles.map(style => {
    const groups = Array.isArray(report?.byStyle)
      ? report.byStyle.filter(row => row?.style === style && row.flavour === 'balanced') : [];
    const reported = groups[0]?.metrics?.generationTiming?.natural?.twelveContacts;
    const styleRows = (Array.isArray(report?.observations) ? report.observations : [])
      .filter(row => row?.style === style);
    const samples = styleRows
      .filter(row => row.complete === true && row.conditioned === false && row.shots === 12)
      .map(row => row.generationMs);
    const measured = distribution(samples);
    const intact = groups.length === 1 && styleRows.every(row => Number.isFinite(row.generationMs) && row.generationMs >= 0)
      && measured.n === samples.length && measured.n >= 10
      && canonical(reported) === canonical(measured)
      && ['mean', 'min', 'median', 'p95', 'max'].every(key => Number.isFinite(measured[key]) && measured[key] >= 0);
    return { style, evidenceStatus: intact ? 'PASS' : 'FAIL', measurement: measured,
      p95Reference: { exclusiveMaximumMs: 100,
        disposition: 'ADVISORY',
        comparison: Number.isFinite(measured.p95) ? measured.p95 < 100 ? 'WITHIN_REFERENCE' : 'ABOVE_REFERENCE' : 'UNAVAILABLE' } };
  });
  // Only these three former numerical gates change. All source, physical,
  // deterministic, trace and research-report checks are retained from v1.
  const replacements = new Map(timing.map(row => [`${row.style}HostedTwelveContactP95`, {
    name: `${row.style}HostedTwelveContactTimingEvidence`, status: row.evidenceStatus,
  }]));
  const checks = historical.requiredChecks.map(check => replacements.get(check.name) ?? { ...check });
  return { contractVersion: RALLY_RELEASE_ACCEPTANCE_VERSION_V2,
    status: checks.every(check => check.status === 'PASS') ? 'PASS' : 'FAIL', requiredChecks: checks,
    reportedGoals: historical.reportedGoals,
    performanceAdvisory: { disposition: 'REPORTED_NOT_RELEASE_BLOCKING', minimumSamples: 10,
      workload: 'complete unconditioned Natural rallies with exactly 12 contacts',
      measurement: 'First-generation wall time includes default yields, allocations and independent final validation; no latency is subtracted.',
      usability: 'Latency alone does not certify usability. Worker cancellation, isolation and UI responsiveness remain required Quality checks; physical-phone review is separate.',
      byStyle: timing } };
}
