import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRallyReleaseAcceptanceV1 } from '../tools/rally-release-acceptance-v1.mjs';
import { evaluateRallyReleaseAcceptanceV2, RALLY_RELEASE_ACCEPTANCE_VERSION_V2 } from '../tools/rally-release-acceptance-v2.mjs';
import { createCohortSchedule } from '../tools/rally-realism-v2.mjs';
import { distribution } from '../tools/rally-realism-metrics.mjs';
import { evaluateCalibrationV2, METRICS_VERSION_V2 } from '../tools/rally-realism-metrics-v2.mjs';

// A complete explicit corpus fixture; the historical v1 tests stay unchanged.
function fixture() {
  const schedule = createCohortSchedule({ cohort: 'custom', seeds: Array.from({ length: 1200 }, (_, i) => i + 50000) })
    .map(job => ({ ...job, cohort: 'examined-regression', id: job.id.replace('custom:', 'examined-regression:') }));
  const audit = { status: 'PASS', violations: [] };
  const observations = schedule.map(job => ({ jobId: job.id, seed: job.seed, style: job.style, flavour: job.flavour,
    cohort: job.cohort, settings: structuredClone(job.input), status: 'complete', complete: true, censored: false,
    accepted: true, physicallyValid: true, documentPresent: true, conditioned: false, shots: 12, sourceShots: 12,
    contacts: Array.from({ length: 12 }, (_, index) => ({ ordinal: index + 1, shotId: `shot${index}`, time: index + 1,
      hitter: 'player1', hittingTeam: 'green', family: index === 0 ? 'serve' : 'drive', hitterUp: true,
      contact: { x: 5, y: 15, heightFeet: 3 },
      positions: { player1: { x: 5, y: 15 }, player2: { x: 15, y: 15 }, player3: { x: 5, y: 29 }, player4: { x: 15, y: 29 } },
      incomingAttackable: true, decisionEvidence: { matched: true, sampleTimeSeconds: index + 1, contactTimeSeconds: index + 1 } })),
    generationMs: 75, validation: { acceptedShots: 12, compilerErrors: [], ruleViolations: [], outcomeMatched: true,
      terminalMatched: true, sourceUnchanged: true }, modelSupport: { ...audit, checkedContacts: 12, unsupportedContacts: 0 },
    generatedFlightFeasibility: { ...audit, checkedFlights: 12 } }));
  const rate = value => ({ value, denominator: 1200, numerator: value * 1200 });
  const report = { status: 'PASS', metricsVersion: METRICS_VERSION_V2, schedule, observations, failures: [], corpus: { status: 'COMPLETE', scheduledRallies: 3600,
    attemptedRallies: 3600, missingJobs: [] }, physicalValidity: { status: 'PASS', validDocuments: 3600, invalidDocuments: 0,
    missingDocuments: 0 }, modelSupport: structuredClone(audit), generatedFlightFeasibility: structuredClone(audit),
    calibration: { status: 'FAIL', minConditionalSamples: 10, minPerformanceSamples: 10 },
    byStyle: ['pro', 'advanced', 'intermediate'].map(style => ({ style, flavour: 'balanced',
      denominators: { naturalCompleteRallies: 1200, invalidOrMissing: 0, censoredRallies: 0,
        conditionedCompleteRallies: 0, lineDrives: 20, lineDrivesWithAttackabilityEvidence: 20 },
      metrics: { naturalShotCount: distribution(Array(1200).fill(12)), naturalNineShotsOrFewer: rate(1),
        naturalThirtyShotsOrMore: rate(0), allFourUp: rate(.1), thirdDriveShareOfDriveDrop: rate(.45),
        thirdLobShare: rate(0), thirdShotKeptInPlay: rate(.94), fifthAfterDrive: { drop: rate(.65), firmVolley: rate(.31) },
        driveRalliesOverByFourth: rate(.1), receivingTeamWins: rate(.5), lobShare: rate(.02), teamSplitAfterSixth: rate(.05),
        dinksWhileOpponentNotUp: rate(.03), lineDrivesWithoutAttackableBall: rate(0), serveFaults: rate(.01),
        longestDinkRunAmongLineRallies: distribution(Array(1200).fill(5)),
        ernesPerGame: { status: 'NOT_APPLICABLE' }, aroundThePostPerGame: { status: 'NOT_APPLICABLE' },
        generationTiming: { natural: { twelveContacts: distribution(Array(1200).fill(75)) } } } })) };
  for (const row of report.byStyle) row.calibration = evaluateCalibrationV2(row, { style: row.style,
    expectedRallies: 1200, minConditionalSamples: 10, minPerformanceSamples: 10 });
  const determinism = { status: 'PASS', comparisons: schedule.map(job => ({ jobId: job.id, firstSha256: 'a'.repeat(64), secondSha256: 'a'.repeat(64) })) };
  return { report, determinism };
}
const evaluate = ({ report, determinism }) => evaluateRallyReleaseAcceptanceV2(report, { determinism });
function setTiming(data, values = { pro: 120, advanced: 230, intermediate: 345 }) {
  for (const row of data.report.observations) row.generationMs = values[row.style];
  for (const group of data.report.byStyle) {
    group.metrics.generationTiming.natural.twelveContacts = distribution(data.report.observations
      .filter(row => row.style === group.style && row.complete && !row.conditioned && row.shots === 12).map(row => row.generationMs));
    group.calibration = evaluateCalibrationV2(group, { style: group.style, expectedRallies: 1200,
      minConditionalSamples: 10, minPerformanceSamples: 10 });
  }
  return data;
}
const evidence = (result, style = 'pro') => result.requiredChecks.find(check => check.name === `${style}HostedTwelveContactTimingEvidence`);

test('owner-approved advisory timing preserves slow measurements, failed goals and historical verdict', () => {
  const data = setTiming(fixture()), original = structuredClone(data.report);
  const historical = evaluateRallyReleaseAcceptanceV1(data.report, { determinism: data.determinism });
  const result = evaluate(data);
  assert.equal(historical.status, 'FAIL');
  assert.equal(result.status, 'PASS');
  assert.equal(result.contractVersion, RALLY_RELEASE_ACCEPTANCE_VERSION_V2);
  assert.equal(result.reportedGoals.calibration.status, 'FAIL');
  assert.deepEqual(result.reportedGoals, historical.reportedGoals);
  assert.equal(result.performanceAdvisory.disposition, 'REPORTED_NOT_RELEASE_BLOCKING');
  assert.equal(result.performanceAdvisory.minimumSamples, 10);
  assert.match(result.performanceAdvisory.usability, /does not certify usability/);
  for (const row of result.performanceAdvisory.byStyle) {
    assert.deepEqual(row.measurement, data.report.byStyle.find(group => group.style === row.style).metrics.generationTiming.natural.twelveContacts);
    assert.equal(row.measurement.n, 1200);
    assert.equal(row.p95Reference.disposition, 'ADVISORY');
    assert.equal(row.p95Reference.comparison, 'ABOVE_REFERENCE');
    assert.equal(evidence(result, row.style).status, 'PASS');
    const oldGate = result.reportedGoals.byStyle.find(group => group.style === row.style).calibration.gates.find(gate => gate.name === 'twelveContactGenerationP95Ms');
    assert.equal(oldGate.status, 'FAIL', 'the original research latency verdict is not rewritten');
  }
  assert.deepEqual(data.report, original);
});

for (const value of [99, 100, 101, 1000000]) test(`truthful ${value}ms remains advisory without a hidden numeric threshold`, () => {
  const result = evaluate(setTiming(fixture(), { pro: value, advanced: value, intermediate: value }));
  assert.equal(result.status, 'PASS');
  assert.equal(result.performanceAdvisory.byStyle[0].measurement.p95, value);
  assert.equal(result.performanceAdvisory.byStyle[0].p95Reference.comparison, value < 100 ? 'WITHIN_REFERENCE' : 'ABOVE_REFERENCE');
});

for (const [name, corrupt] of [
  ['missing sample', d => { delete d.report.observations[0].generationMs; }],
  ['NaN sample', d => { d.report.observations[0].generationMs = NaN; }],
  ['infinite sample', d => { d.report.observations[0].generationMs = Infinity; }],
  ['negative sample', d => { d.report.observations[0].generationMs = -1; }],
  ['string sample', d => { d.report.observations[0].generationMs = '120'; }],
  ['fabricated sample count', d => { d.report.byStyle[0].metrics.generationTiming.natural.twelveContacts.n = 10; }],
  ['fabricated median', d => { d.report.byStyle[0].metrics.generationTiming.natural.twelveContacts.median = 1; }],
  ['fabricated p95', d => { d.report.byStyle[0].metrics.generationTiming.natural.twelveContacts.p95 = 1; }],
  ['hidden maximum', d => { d.report.byStyle[0].metrics.generationTiming.natural.twelveContacts.max = 1; }],
  ['missing timing summary', d => { delete d.report.byStyle[0].metrics.generationTiming.natural.twelveContacts; }],
  ['missing style summary', d => { d.report.byStyle.shift(); }],
  ['duplicate style summary', d => { d.report.byStyle.push(structuredClone(d.report.byStyle[0])); }],
]) test(`advisory timing still rejects ${name}`, () => {
  const data = setTiming(fixture()); corrupt(data);
  const result = evaluate(data);
  assert.equal(result.status, 'FAIL');
  assert.equal(evidence(result).status, 'FAIL');
});

test('timing sample minimum remains an evidence-completeness requirement', () => {
  const data = setTiming(fixture());
  for (const row of data.report.observations.filter(row => row.style === 'pro').slice(9)) {
    row.shots = row.sourceShots = row.validation.acceptedShots = row.modelSupport.checkedContacts = row.generatedFlightFeasibility.checkedFlights = 11;
    row.contacts = row.contacts.slice(0, 11);
  }
  setTiming(data);
  const result = evaluate(data);
  assert.equal(result.status, 'FAIL');
  assert.equal(evidence(result).status, 'FAIL');
  assert.equal(result.performanceAdvisory.byStyle[0].measurement.n, 9);
});

test('a non-twelve-contact observation must retain its own finite timing', () => {
  const data = setTiming(fixture()), row = data.report.observations[0];
  row.shots = row.sourceShots = row.validation.acceptedShots = row.modelSupport.checkedContacts = row.generatedFlightFeasibility.checkedFlights = 11;
  row.contacts = row.contacts.slice(0, 11);
  setTiming(data);
  const before = evaluate(data);
  assert.equal(before.status, 'PASS');
  assert.equal(before.performanceAdvisory.byStyle[0].measurement.n, 1199);
  row.generationMs = NaN;
  const result = evaluate(data);
  assert.equal(result.status, 'FAIL');
  assert.equal(evidence(result).status, 'FAIL');
  assert.deepEqual(result.performanceAdvisory.byStyle[0].measurement,
    before.performanceAdvisory.byStyle[0].measurement, 'twelve-contact eligibility and denominator remain unchanged');
  assert.ok(result.requiredChecks.filter(check => check.name !== evidence(result).name)
    .every(check => check.status === 'PASS'), 'only the affected style timing-evidence check fails');
});

for (const [name, corrupt] of [
  ['exactExaminedRegressionSchedule', d => { d.report.schedule[0].input.seed++; }],
  ['completeValidatedResults', d => { d.report.observations[0].physicallyValid = false; }],
  ['lineDrivePreChoiceEvidenceIntegrity', d => { delete d.report.observations[0].contacts[1].decisionEvidence; }],
  ['physicalModelAndFlightSummaries', d => { d.report.physicalValidity.invalidDocuments = 1; }],
  ['independentDeterministicResults', d => { d.determinism.comparisons[0].secondSha256 = 'b'.repeat(64); }],
  ['unchangedResearchMeasurementsReported', d => { d.report.calibration.status = 'PASS'; }],
]) test(`advisory revision retains mandatory ${name}`, () => {
  const data = setTiming(fixture()); corrupt(data);
  const historical = evaluateRallyReleaseAcceptanceV1(data.report, { determinism: data.determinism });
  const result = evaluate(data);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.requiredChecks.find(check => check.name === name).status, 'FAIL');
  assert.deepEqual(result.requiredChecks.filter(check => !check.name.endsWith('TimingEvidence')),
    historical.requiredChecks.filter(check => !check.name.endsWith('HostedTwelveContactP95')));
});
