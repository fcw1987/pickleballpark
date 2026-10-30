import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRallyReleaseAcceptanceV1 } from '../tools/rally-release-acceptance-v1.mjs';
import { createCohortSchedule } from '../tools/rally-realism-v2.mjs';
import { distribution } from '../tools/rally-realism-metrics.mjs';
import { evaluateCalibrationV2, METRICS_VERSION_V2 } from '../tools/rally-realism-metrics-v2.mjs';

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
const evaluate = ({ report, determinism }) => evaluateRallyReleaseAcceptanceV1(report, { determinism });
test('owner-approved contract reports research failures and slow median without blocking release', () => {
  const data = fixture(), original = structuredClone(data.report), result = evaluate(data);
  assert.equal(result.status, 'PASS');
  assert.equal(result.reportedGoals.calibration.status, 'FAIL');
  assert.deepEqual(result.reportedGoals.byStyle[0].calibration, data.report.byStyle[0].calibration);
  assert.equal(result.reportedGoals.byStyle[0].calibration.gates.filter(gate => gate.status === 'FAIL').length, 6);
  assert.equal(result.reportedGoals.referenceDeviceMedianGoalMs.exclusiveMaximum, 50);
  assert.deepEqual(data.report, original);
});
for (const [name, corrupt] of [
  ['missing contact observations', d => { delete d.report.observations[0].contacts; }],
  ['missing line-drive snapshot', d => { delete d.report.observations[0].contacts[1].decisionEvidence; }],
  ['unmatched line-drive snapshot', d => { d.report.observations[0].contacts[1].decisionEvidence.matched = false; }],
  ['mismatched line-drive snapshot time', d => { d.report.observations[0].contacts[1].decisionEvidence.sampleTimeSeconds++; }],
  ['mismatched actual contact time', d => { d.report.observations[0].contacts[1].time++; }],
  ['missing actual contact geometry', d => { delete d.report.observations[0].contacts[1].contact; }],
  ['corrupt actual geometry', d => { d.report.observations[0].contacts[1].positions.player1.y = NaN; }],
  ['mismatched actual hitter geometry', d => { d.report.observations[0].contacts[1].positions.player1.y = 5; }],
  ['unknown incoming affordance', d => { d.report.observations[0].contacts[1].incomingAttackable = null; }],
  ['nonboolean incoming affordance', d => { d.report.observations[0].contacts[1].incomingAttackable = 'true'; }],
  ['missing observation', d => d.report.observations.pop()],
  ['duplicate observation', d => { d.report.observations[1] = d.report.observations[0]; }],
  ['style corruption', d => { d.report.observations[0].style = 'advanced'; }],
  ['physical invalidity', d => { d.report.observations[0].physicallyValid = false; }],
  ['unknown status', d => { d.report.observations[0].status = 'UNKNOWN'; }],
  ['censored result', d => { d.report.observations[0].censored = true; }],
  ['compiler error', d => { d.report.observations[0].validation.compilerErrors.push({ message: 'broken' }); }],
  ['model invalidity', d => { d.report.observations[0].modelSupport = { status: 'FAIL', violations: [] }; }],
  ['flight invalidity', d => { d.report.observations[0].generatedFlightFeasibility = { status: 'FAIL', violations: [] }; }],
  ['wrong seed', d => { d.report.schedule[0].input.seed++; }],
  ['wrong service', d => { d.report.schedule[0].input.service.court = 'left'; }],
  ['wrong options', d => { d.report.schedule[0].input.options.maxShots = 98; }],
  ['missing determinism', d => { delete d.determinism; }],
  ['failed determinism', d => { d.determinism.status = 'FAIL'; }],
  ['unequal independent hash', d => { d.determinism.comparisons[0].secondSha256 = 'b'.repeat(64); }],
  ['missing independent comparison', d => { d.determinism.comparisons.pop(); }],
  ['duplicate independent comparison', d => { d.determinism.comparisons[1] = d.determinism.comparisons[0]; }],
  ['fabricated timing samples', d => { d.report.byStyle[0].metrics.generationTiming.natural.twelveContacts.n = 10; }],
  ['unknown report status', d => { d.report.status = 'UNKNOWN'; }],
  ['missing research report', d => { delete d.report.calibration; }],
  ['missing research goal', d => { d.report.byStyle[0].calibration.gates.pop(); }],
  ['widened research band', d => { d.report.byStyle[0].calibration.gates.find(g => g.band).band.maximum = 999; }],
  ['falsely promoted research verdict', d => { d.report.calibration.status = 'PASS'; }],
]) test(`release rejects ${name}`, () => { const d = fixture(); corrupt(d); assert.equal(evaluate(d).status, 'FAIL'); });
test('hosted p95 at 100ms fails its strict boundary', () => {
  const d = fixture();
  d.report.observations.filter(row => row.style === 'pro').forEach(row => { row.generationMs = 100; });
  d.report.byStyle[0].metrics.generationTiming.natural.twelveContacts = distribution(Array(1200).fill(100));
  assert.equal(evaluate(d).status, 'FAIL');
});
test('fewer than ten exact twelve-contact timing samples fails', () => {
  const d = fixture();
  d.report.observations.filter(row => row.style === 'pro').slice(9).forEach(row => {
    row.shots = row.sourceShots = row.validation.acceptedShots = row.modelSupport.checkedContacts = row.generatedFlightFeasibility.checkedFlights = 11;
  });
  d.report.byStyle[0].metrics.generationTiming.natural.twelveContacts = distribution(Array(9).fill(75));
  assert.equal(evaluate(d).status, 'FAIL');
});

test('zero or insufficient line-drive frequency stays a reported goal', () => {
  for (const count of [0, 1]) {
    const d = fixture();
    for (const row of d.report.observations) row.contacts.forEach(contact => { contact.family = 'drop'; });
    if (count) d.report.observations[0].contacts[1].family = 'drive';
    for (const group of d.report.byStyle) {
      group.denominators.lineDrives = count;
      group.denominators.lineDrivesWithAttackabilityEvidence = count;
      group.calibration = evaluateCalibrationV2(group, { style: group.style, expectedRallies: 1200,
        minConditionalSamples: 10, minPerformanceSamples: 10 });
    }
    const result = evaluate(d);
    assert.equal(result.status, 'PASS');
    assert.equal(result.reportedGoals.byStyle[0].calibration.gates.find(g => g.name === 'lineDriveAffordanceEvidence').status,
      'INSUFFICIENT_SAMPLE');
  }
});
