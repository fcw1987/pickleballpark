import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { previewDocumentV2 } from '../play-compiler-v2.js';
import { validateRallyRules } from '../rally-rules.js';
import { normalizeRallyInputV1, createGenerationRecipeV1, createRallyRequestRecipeV1 } from '../rally-recipe.js';
import { samplePlayState } from '../three-d-core.js';
import { PHYSICS_V2, localNetHeightFeet } from '../play-physics-v2.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';
import { observeRallyV2, summarizeObservationsV2, evaluateCalibrationV2, heightAffordanceV2, assessContactSupportV2, CONTACT_SUPPORT_POLICY_V2 } from '../tools/rally-realism-metrics-v2.mjs';
import { createCohortSchedule, DEVELOPMENT_SEEDS, QUALIFICATION_SEEDS, HOLDOUT_DEFINITION_V1, HOLDOUT_SEEDS_V1,
  validateHoldoutDefinitionV1, validateHoldoutScheduleV1, describeCohortEvidenceV2, runRealismV2 } from '../tools/rally-realism-v2.mjs';

const copy = value => structuredClone(value);
function resultFor(document, status = document.ending === 'stop' ? 'censored' : 'complete') {
  return { status, document, outcome: document.outcome ?? null, decisions: [], stats: {}, recipe: null, diagnostics: {} };
}
function engineResultFor(input, document) {
  document = copy(document);
  const recipe = createGenerationRecipeV1(normalizeRallyInputV1(input));
  document.generation = recipe;
  return { ...resultFor(document), recipe };
}
function observed(id, overrides = {}) {
  const document = readModel2Fixture(id); validateDocument(document);
  const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
  const result = resultFor(document);
  return { document, compiled, rules, row: observeRallyV2({ document, compiled, rules, result, seed: 7,
    settings: { options: { lengthFeel: 'natural', winner: 'either' } }, generationMs: 12, ...overrides }) };
}

test('late momentum outcomes remain natural even when their shot is not the last contact', () => {
  const { document, compiled, row } = observed('earlier-momentum-overrides-later-fault');
  assert.notEqual(document.outcome.shotId, document.shots.at(-1).id);
  assert.equal(row.accepted, true); assert.equal(row.complete, true); assert.equal(row.censored, false);
  assert.equal(row.outcome.shotId, document.outcome.shotId);
  assert.ok(row.outcome.violationOccurrenceTime < row.outcome.evidenceObservedTime);
  assert.ok(row.outcome.physicalDeadTime < row.outcome.evidenceObservedTime);
  assert.equal(row.outcome.physicalDeadTime, compiled.timeline.outcome.physicalDeadTime);
  assert.equal(summarizeObservationsV2([row]).denominators.naturalCompleteRallies, 1);
});

test('source intent, incoming geometry and actual lower-surface clearance are observed independently', () => {
  const { row, compiled } = observed('long');
  assert.equal(row.contacts[0].intent, 'drive');
  const crossing = compiled.timeline.events.find(event => event.type === 'net-crossing');
  const x = crossing.position.x / PHYSICS_V2.feetToMeters + 10;
  const correct = (crossing.position.y / PHYSICS_V2.feetToMeters - PHYSICS_V2.ballRadiusFeet - localNetHeightFeet(x)) * 12;
  assert.equal(row.contacts[0].netClearanceInches, correct);
  assert.notEqual(correct, (crossing.position.y / PHYSICS_V2.feetToMeters - 34 / 12) * 12);
  assert.equal(row.contacts[0].heightAffordance, 'neutral');
  assert.equal(row.contacts[0].aboveLocalTape, false);
  assert.equal(observed('around-the-post').row.contacts[0].netClearanceInches, null, 'there is no tape at an around-post crossing');
  assert.equal(observed('around-the-post').row.contacts[0].aroundPostCrossing, true);
});

test('exhaustive height buckets do not infer incoming height from execution quality', () => {
  assert.deepEqual([0, 1.1999, 1.2, 2.7999, 2.8, 6.9999, 7, 30].map(heightAffordanceV2), ['low', 'low', 'neutral', 'neutral', 'high', 'high', 'overhead', 'overhead']);
  for (const value of [-1, NaN, Infinity]) assert.throws(() => heightAffordanceV2(value));
  const { document, compiled, rules } = observed('net');
  document.shots[0].quality = 'excellent';
  const row = observeRallyV2({ document, compiled, rules, result: resultFor(document), seed: 7 });
  assert.equal(row.contacts[0].executionQuality, 'excellent');
  assert.equal(row.contacts[0].heightAffordance, 'neutral');
});

test('body outcomes retain the distinct struck actor and faulting designated receiver', () => {
  const { row } = observed('serve-hits-receiver-partner');
  assert.equal(row.accepted, true);
  assert.equal(row.outcome.faultingActor, 'player3');
  assert.equal(row.outcome.struckActor, 'player4');
});

test('declared labels, absent expected evidence and partial compilation cannot claim a natural point', () => {
  const { document, compiled, rules } = observed('net');
  const base = { document, compiled, rules, result: resultFor(document), seed: 7 };
  const missing = observeRallyV2({ ...base, rules: { ...rules, expectedOutcomes: [] } });
  assert.equal(missing.complete, false); assert.equal(missing.accepted, false);
  const wrong = copy(base.result); wrong.outcome.winner = 'green';
  assert.equal(observeRallyV2({ ...base, result: wrong }).accepted, false);
  assert.equal(observeRallyV2({ ...base, compiled: { ...compiled, validShotCount: 0 } }).accepted, false);
  assert.equal(observeRallyV2({ ...base, rules: { ...rules, valid: false, violations: [{ code: 'unexpected' }] } }).accepted, false);
  assert.equal(observeRallyV2({ ...base, result: { ...base.result, status: 'failed' } }).accepted, false);
  assert.equal(summarizeObservationsV2([missing]).denominators.observedNaturalContacts, 0);
});

test('censored and conditioned rallies never enter natural calibration or its timing cohort', () => {
  const censored = observed('erne').row;
  assert.equal(censored.accepted, true); assert.equal(censored.censored, true);
  const conditioned = observed('net', { settings: { options: { lengthFeel: 'short', winner: 'either' } } }).row;
  const summary = summarizeObservationsV2([censored, conditioned]);
  assert.equal(summary.denominators.naturalCompleteRallies, 0);
  assert.equal(summary.denominators.conditionedCompleteRallies, 1);
  assert.equal(summary.denominators.censoredRallies, 1);
  assert.equal(summary.metrics.naturalShotCount.n, 0);
  assert.equal(summary.metrics.generationTiming.conditioned.all.n, 1);
  assert.equal(summary.metrics.generationTiming.censored.all.n, 1);
  assert.equal(summary.metrics.ernesPerGame.status, 'NOT_APPLICABLE');
});

test('fifth-shot drive opportunities include counters, with the blocked subset separately identified', () => {
  const template = observed('net').row;
  const contact = (family, ordinal, intent = family, pace = 'soft') => ({ ordinal, family, intent, pace, hittingTeam: ordinal % 2 ? 'green' : 'orange', hitter: ordinal % 2 ? 'player1' : 'player3', contact: { heightFeet: 2 }, teams: [], hitterUp: false, opponentNotUp: false, netClearanceInches: 4 });
  const make = fourth => ({ ...copy(template), shots: 5, sourceShots: 5, servingTeam: 'green', outcome: { ...template.outcome, shotId: 'not-third', winner: 'orange' }, contacts: [contact('serve', 1), contact('return', 2), contact('drive', 3), contact('volley', 4, fourth), contact('drop', 5)] });
  const summary = summarizeObservationsV2([make('counter'), make('block')]);
  assert.equal(summary.denominators.fifthAfterDrive, 2);
  assert.equal(summary.denominators.fifthAfterBlockedDrive, 1);
  assert.equal(summary.metrics.fifthAfterDrive.drop.numerator, 2);
  assert.equal(summary.metrics.fifthAfterBlockedDrive.drop.numerator, 1);
});

test('unmeasured conditional and performance gates stay insufficient rather than passing zero divided by zero', () => {
  const summary = summarizeObservationsV2([observed('net').row]);
  const gates = evaluateCalibrationV2(summary, { style: 'pro', expectedRallies: 1, minConditionalSamples: 1, minPerformanceSamples: 1 });
  assert.equal(gates.gates.find(gate => gate.name === 'fifthAfterDriveDrop').status, 'INSUFFICIENT_SAMPLE');
  assert.equal(gates.gates.find(gate => gate.name === 'twelveContactGenerationMedianMs').status, 'INSUFFICIENT_SAMPLE');
  assert.equal(gates.gates.find(gate => gate.name === 'meanShots').status, 'FAIL');
  assert.equal(evaluateCalibrationV2(summary, { style: 'beginner' }).status, 'NOT_APPLICABLE');
});

test('development and qualification schedules are disjoint, frozen and balanced across serving team/court', () => {
  assert.equal(DEVELOPMENT_SEEDS.length, 60); assert.equal(QUALIFICATION_SEEDS.length, 300);
  assert.equal(DEVELOPMENT_SEEDS.some(seed => QUALIFICATION_SEEDS.includes(seed)), false);
  for (const [cohort, expected] of [['development', 15], ['qualification', 75]]) {
    const jobs = createCohortSchedule({ cohort, styles: ['advanced'] }), counts = {};
    for (const job of jobs) { const k = `${job.input.service.server}:${job.input.service.court}`; counts[k] = (counts[k] ?? 0) + 1; }
    assert.deepEqual(Object.values(counts), [expected, expected, expected, expected]);
  }
  assert.throws(() => createCohortSchedule({ cohort: 'qualification', seeds: [7] }), /Frozen/);
  assert.throws(() => createCohortSchedule({ cohort: 'custom', seeds: [7, 7] }), /unique/);
});

test('the reserved holdout is an immutable complete 3600-job schedule with balanced service roles', () => {
  const definitionBytes = readFileSync(new URL('../tools/rally-holdout-v1.json', import.meta.url), 'utf8');
  const definition = JSON.parse(definitionBytes), jobs = createCohortSchedule({ cohort: 'holdout' });
  assert.deepEqual(HOLDOUT_DEFINITION_V1, definition);
  assert.equal(HOLDOUT_SEEDS_V1.length, 1200); assert.equal(HOLDOUT_SEEDS_V1[0], 50000); assert.equal(HOLDOUT_SEEDS_V1.at(-1), 51199);
  assert.equal(jobs.length, 3600); assert.equal(new Set(jobs.map(job => job.id)).size, 3600);
  assert.equal(validateHoldoutScheduleV1(jobs), true);
  for (const style of definition.styles) {
    const rows = jobs.filter(job => job.style === style), counts = {};
    assert.equal(rows.length, 1200); assert.deepEqual(rows.map(job => job.seed), HOLDOUT_SEEDS_V1);
    for (const row of rows) {
      const role = row.input.service, id = `${role.server}:${role.receiver}:${role.court}`;
      counts[id] = (counts[id] ?? 0) + 1;
      assert.equal(role.courtConvention, 'server-perspective-v1'); assert.equal(row.input.seed, row.seed);
      assert.deepEqual(row.input.options, definition.options);
      assert.ok(Object.values(row.input.players).every(player => player.style === style && player.flavour === 'balanced'));
    }
    assert.deepEqual(counts, { 'player1:player3:right': 300, 'player1:player3:left': 300, 'player3:player1:right': 300, 'player3:player1:left': 300 });
  }
  assert.equal(HOLDOUT_SEEDS_V1.some(seed => DEVELOPMENT_SEEDS.includes(seed) || QUALIFICATION_SEEDS.includes(seed)), false);
  assert.throws(() => { HOLDOUT_DEFINITION_V1.options.maxShots = 12; }, TypeError);
  assert.throws(() => { HOLDOUT_SEEDS_V1.push(51200); }, TypeError);
  assert.throws(() => { jobs[0].input.service.court = 'left'; }, TypeError);
  assert.throws(() => { jobs.push(jobs[0]); }, TypeError);
  assert.equal(readFileSync(new URL('../tools/rally-holdout-v1.json', import.meta.url), 'utf8'), definitionBytes);
});

test('holdout definition and schedule validation reject replacements, extensions and conditional work', () => {
  for (const patch of [
    { seedStart: 49999 }, { seedCountPerStyle: 1199 }, { seedCountPerStyle: 1201 }, { seedCountPerStyle: Infinity },
    { styles: ['pro'] }, { styles: ['pro', 'intermediate', 'advanced'] }, { styles: ['pro', 'advanced', 'beginner'] },
    { serviceRotation: [...HOLDOUT_DEFINITION_V1.serviceRotation].reverse() }, { flavour: 'bangers' },
    { options: { ...HOLDOUT_DEFINITION_V1.options, maxShots: 12 } }, { options: { ...HOLDOUT_DEFINITION_V1.options, winner: 'green' } },
    { status: 'COMPLETE' }, { purpose: 'Extend the count after seeing results' }, { unrecognized: true },
  ]) assert.throws(() => validateHoldoutDefinitionV1({ ...copy(HOLDOUT_DEFINITION_V1), ...patch }), /immutable reservation/);
  assert.throws(() => createCohortSchedule({ cohort: 'holdout', seeds: [50000] }), /Frozen/);
  assert.throws(() => createCohortSchedule({ cohort: 'holdout', styles: ['pro'] }), /every reserved style/);
  assert.throws(() => createCohortSchedule({ cohort: 'holdout', flavour: 'bangers' }), /balanced flavour/);
  const jobs = createCohortSchedule({ cohort: 'holdout' });
  assert.throws(() => validateHoldoutScheduleV1(jobs.slice(1)), /exact complete/);
  assert.throws(() => validateHoldoutScheduleV1([...jobs, jobs[0]]), /exact complete/);
  for (const mutate of [
    row => { row.seed = 51200; row.input.seed = 51200; },
    row => { row.input.service.receiver = 'player4'; },
    row => { row.input.options.maxShots = 12; },
    row => { row.input.options.lengthFeel = 'short'; },
  ]) {
    const changed = [...jobs], replacement = copy(jobs[0]); mutate(replacement); changed[0] = replacement;
    assert.throws(() => validateHoldoutScheduleV1(changed), /exact complete/);
  }
});

test('cohort evidence distinguishes reservation purpose from examined qualification without asserting blindness', () => {
  const holdout = describeCohortEvidenceV2(createCohortSchedule({ cohort: 'holdout' }));
  assert.equal(holdout.purpose, 'reserved-frozen-candidate-holdout');
  assert.equal(holdout.reservationDefinition.status, 'RESERVED_NOT_RUN');
  assert.equal(holdout.examinationState, 'NOT_ESTABLISHED_BY_COLLECTOR'); assert.equal(holdout.unseenClaim, 'NOT_ASSERTED');
  assert.match(holdout.note, /not current run history/); assert.match(holdout.note, /retuning are not unseen/);
  const regression = describeCohortEvidenceV2(createCohortSchedule({ cohort: 'qualification' }));
  assert.equal(regression.purpose, 'examined-qualification-regression-data');
  assert.equal(regression.unseenClaim, 'NOT_ASSERTED'); assert.match(regression.note, /1000–1299 have been examined/);
  const help = spawnSync(process.execPath, ['tools/rally-realism-v2.mjs', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /holdout/); assert.match(help.stdout, /does not establish whether results remain unseen/);
});

test('runner archives no-document results and replay does not call generation', async () => {
  const jobs = createCohortSchedule({ cohort: 'custom', styles: ['advanced'], seeds: [7, 8, 9] });
  const records = []; let calls = 0;
  const report = await runRealismV2({ jobs, generate: async input => ({ status: ['unsatisfied', 'failed', 'cancelled'][calls++], document: null, outcome: null, recipe: createRallyRequestRecipeV1(normalizeRallyInputV1(input)), decisions: [{ id: 'trace-kept' }], diagnostics: { reason: 'bounded', attempts: 1, attemptedSeeds: [input.seed] } }), onRecord: async record => records.push(record) });
  assert.equal(calls, 3); assert.equal(records.length, 3);
  assert.equal(report.corpus.attemptedRallies, 3);
  assert.equal(report.summary.resultStatuses.unsatisfied, 1);
  assert.equal(records[0].result.document, null);
  assert.equal(records[0].result.decisions[0].id, 'trace-kept');
  const replay = await runRealismV2({ jobs, records, generate: () => { throw Error('must not run'); } });
  assert.equal(replay.generationReplayedFromArchive, true);
  assert.deepEqual(replay.summary, report.summary);
  const historical=copy(records);
  for(const record of historical) record.result.recipe.flightPlannerVersion='rally-flight-planner-v1';
  const before=JSON.stringify(historical);
  const oldReplay=await runRealismV2({jobs,records:historical,generate:()=>{throw Error('must not regenerate old request');}});
  assert.deepEqual(oldReplay.summary,report.summary);
  assert.deepEqual(oldReplay.versions.sourceVersions.flightPlannerVersion,['rally-flight-planner-v1']);
  assert.equal(JSON.stringify(historical),before);
  await assert.rejects(runRealismV2({ jobs, records: [records[0], records[0]] }), /unique/);
});

test('all attempted valid and censored results remain archived with exact original source', async () => {
  const jobs = createCohortSchedule({ cohort: 'custom', styles: ['advanced'], seeds: [7, 8] });
  const records = []; let calls = 0;
  const docs = [readModel2Fixture('net'), readModel2Fixture('erne')];
  const before = docs.map(document => JSON.stringify(document));
  const report = await runRealismV2({ jobs, generate: async input => engineResultFor(input, docs[calls++]), onRecord: async row => records.push(row) });
  assert.equal(report.physicalValidity.status, 'PASS');
  assert.equal(report.status, 'INCOMPLETE');
  assert.equal(report.summary.denominators.validDocuments, 2);
  assert.deepEqual(records.map(record => { const doc = copy(record.result.document); delete doc.generation; return JSON.stringify(doc); }), before);
});

test('pre-cancellation reports missing scheduled jobs without manufacturing generation attempts', async () => {
  const controller = new AbortController(); controller.abort();
  const report = await runRealismV2({ jobs: createCohortSchedule({ cohort: 'custom', styles: ['pro'], seeds: [7] }), signal: controller.signal, generate: () => { throw Error('must not run'); } });
  assert.equal(report.status, 'INCOMPLETE'); assert.equal(report.corpus.attemptedRallies, 0);
  assert.equal(report.corpus.missingJobs.length, 1); assert.equal(report.physicalValidity.status, 'NOT_EVALUATED');
});

test('archive write failure aborts without repeating generation', async () => {
  let calls = 0;
  await assert.rejects(runRealismV2({ jobs: createCohortSchedule({ cohort: 'custom', styles: ['pro'], seeds: [7, 8] }), generate: async input => { calls++; return engineResultFor(input, readModel2Fixture('net')); }, onRecord: async () => { throw Error('archive disk failed'); } }), /archive disk/);
  assert.equal(calls, 1);
});

test('CLI refuses existing output before loading or invoking the engine', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rally-realism-v2-'));
  try {
    const path = join(directory, 'keep.json'); writeFileSync(path, 'retain bytes');
    const child = spawnSync(process.execPath, ['tools/rally-realism-v2.mjs', '--output', path], { encoding: 'utf8' });
    assert.equal(child.status, 1); assert.match(child.stderr, /Refusing existing output/);
    assert.equal(readFileSync(path, 'utf8'), 'retain bytes');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('engine cohort provenance must match the normalized scheduled recipe', async () => {
  const jobs = createCohortSchedule({ cohort: 'custom', styles: ['pro'], seeds: [7] });
  const records = [];
  const report = await runRealismV2({ jobs, generate: async input => { const result = engineResultFor(input, readModel2Fixture('net')); result.recipe = createGenerationRecipeV1(normalizeRallyInputV1({ ...input, seed: 8 })); return result; }, onRecord: async row => records.push(row) });
  assert.equal(report.status, 'INVALID');
  assert.match(report.failures[0].message, /recipe|provenance/);
  assert.equal(records.length, 1);
  assert.equal(records[0].result.recipe.seed, 8);
});

test('bounded unsatisfied requests retain null selection and cannot masquerade as a selected origin', async () => {
  const jobs = createCohortSchedule({ cohort: 'custom', styles: ['pro'], seeds: [7] });
  const result = input => ({ status: 'unsatisfied', document: null, outcome: null, decisions: [], recipe: createRallyRequestRecipeV1(normalizeRallyInputV1(input)), diagnostics: { attempts: 1, attemptedSeeds: [7], reason: 'selection exhausted' } });
  const records = [];
  const report = await runRealismV2({ jobs, generate: async input => result(input), onRecord: async record => records.push(record) });
  assert.equal(report.status, 'INCOMPLETE'); assert.equal(report.physicalValidity.status, 'NOT_EVALUATED');
  assert.equal(records[0].result.recipe.selection, null);
  assert.equal(report.observations[0].attempts, 1);
  const wrong = await runRealismV2({ jobs, generate: async input => ({ ...result(input), recipe: createGenerationRecipeV1(normalizeRallyInputV1(input)) }) });
  assert.equal(wrong.status, 'INVALID'); assert.match(wrong.failures[0].message, /request recipe/);
});

test('attackability uses matched pre-choice feasible-flight evidence rather than height or quality labels', () => {
  const { document, compiled, rules } = observed('long');
  const segment = compiled.timeline.segments[0], time = segment.startTime + segment.contactTime;
  const sampled = samplePlayState(compiled.timeline, time);
  const decision = { shotId: document.shots[0].id, situation: { policyVersion: 'rally-policy-v1', hitter: document.shots[0].hitter, contactIndex: 0, contact: copy(segment.shotSemantics.contact.point), positions: copy(sampled.positions), sampleTimeSeconds: time, contactTimeSeconds: time, attackable: false, affordances: { attack: false } } };
  const result = { ...resultFor(document), decisions: [decision] };
  const row = observeRallyV2({ document, compiled, rules, result, seed: 7 });
  assert.equal(row.contacts[0].incomingAttackable, false);
  const summary = summarizeObservationsV2([row]);
  assert.equal(summary.metrics.lineDrivesWithoutAttackableBall.value, 1);
  const wrong = copy(result); wrong.decisions[0].situation.contact.x += .1;
  assert.equal(observeRallyV2({ document, compiled, rules, result: wrong, seed: 7 }).contacts[0].incomingAttackable, null);
  const wrongPosition = copy(result); wrongPosition.decisions[0].situation.positions.player3.y += .07431752199869202;
  assert.equal(observeRallyV2({ document, compiled, rules, result: wrongPosition, seed: 7 }).contacts[0].incomingAttackable, null);
  const absent = observeRallyV2({ document, compiled, rules, result: resultFor(document), seed: 7 });
  const mixed = evaluateCalibrationV2(summarizeObservationsV2([row, absent]), { style: 'pro', expectedRallies: 2, minConditionalSamples: 1 });
  assert.equal(mixed.gates.find(gate => gate.name === 'lineDriveAffordanceEvidence').status, 'INSUFFICIENT_SAMPLE');
});


test('first-serve evidence samples the real start pose while contact metrics retain actual contact-time positions', () => {
  const document = readModel2Fixture('serve-hits-receiver-partner');
  const initial = document.initialLayout.player2;
  document.shots[0].playerMovement = { player2: { intent: 'manual', pinned: false, target: { x: initial.x, y: initial.y - 1 } } };
  validateDocument(document);
  const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.deepEqual(compiled.findings.filter(item => item.severity === 'error'), []);
  const segment = compiled.timeline.segments[0], contactTime = segment.startTime + segment.contactTime;
  const start = samplePlayState(compiled.timeline, segment.startTime), atContact = samplePlayState(compiled.timeline, contactTime);
  assert.notDeepEqual(start.positions.player2, atContact.positions.player2, 'the test must actually distinguish the two physical times');
  const decision = { shotId: document.shots[0].id, situation: { policyVersion: 'rally-policy-v1', hitter: document.shots[0].hitter, contactIndex: 0,
    contact: copy(segment.shotSemantics.contact.point), positions: copy(start.positions), sampleTimeSeconds: segment.startTime,
    contactTimeSeconds: contactTime, attackable: false, affordances: { attack: false } } };
  const result = { ...resultFor(document), decisions: [decision] };
  const row = observeRallyV2({ document, compiled, rules, result, seed: 7 });
  assert.equal(row.contacts[0].incomingAttackable, false);
  assert.deepEqual(row.contacts[0].positions.player2, atContact.positions.player2, 'contact metrics may not be replaced by pre-choice positions');
  assert.deepEqual(row.contacts[0].decisionEvidence, { sampleTimeSeconds: segment.startTime, contactTimeSeconds: contactTime, matched: true });
  for (const mutate of [
    value => { value.decisions[0].situation.sampleTimeSeconds = contactTime; value.decisions[0].situation.positions = copy(atContact.positions); },
    value => { value.decisions[0].situation.contactTimeSeconds = segment.startTime; },
    value => { value.decisions[0].situation.sampleTimeSeconds = segment.startTime + .01; value.decisions[0].situation.positions = copy(samplePlayState(compiled.timeline, segment.startTime + .01).positions); },
    value => { delete value.decisions[0].situation.sampleTimeSeconds; }
  ]) {
    const invalid = copy(result); mutate(invalid);
    assert.equal(observeRallyV2({ document, compiled, rules, result: invalid, seed: 7 }).contacts[0].incomingAttackable, null);
  }
});

test('later contact evidence cannot use an earlier convenient pose or a wrong declared contact time', () => {
  const { document, compiled, rules } = observed('variable-bounced-contact');
  assert.ok(document.shots.length > 1);
  const index = 1, segment = compiled.timeline.segments[index], time = segment.startTime + segment.contactTime;
  const decision = { shotId: document.shots[index].id, situation: { policyVersion: 'rally-policy-v1', hitter: document.shots[index].hitter, contactIndex: index,
    contact: copy(segment.shotSemantics.contact.point), positions: copy(samplePlayState(compiled.timeline, time).positions), sampleTimeSeconds: time,
    contactTimeSeconds: time, attackable: false, affordances: { attack: false } } };
  const result = { ...resultFor(document), decisions: [decision] };
  assert.equal(observeRallyV2({ document, compiled, rules, result, seed: 7 }).contacts[index].incomingAttackable, false);
  const wrong = copy(result); wrong.decisions[0].situation.sampleTimeSeconds = 0; wrong.decisions[0].situation.positions = copy(samplePlayState(compiled.timeline, 0).positions);
  assert.equal(observeRallyV2({ document, compiled, rules, result: wrong, seed: 7 }).contacts[index].incomingAttackable, null);
  const wrongContact = copy(result); wrongContact.decisions[0].situation.contactTimeSeconds += .01;
  assert.equal(observeRallyV2({ document, compiled, rules, result: wrongContact, seed: 7 }).contacts[index].incomingAttackable, null);
});


function unsupportedGroundedDocument() {
  const document = model2Document({ ending: 'winner', generation: createGenerationRecipeV1(normalizeRallyInputV1({ seed: 7 })),
    shots: [model2Shot({ id: 'support-lob', hitter: 'player1', family: 'lob', intent: 'lob', target: { x: 7, y: 39 }, arc: 'high', physics: { apexFeet: 18 } }),
      model2Shot({ id: 'support-high-contact', hitter: 'player3', family: 'overhead', intent: 'overhead', contactMode: 'volley', target: { x: 7, y: 7 }, pace: 'firm', arc: 'low' })] });
  document.outcome = previewDocumentV2(document).derivedOutcome;
  validateDocument(document);
  return document;
}

test('initiated line attacks, controlled counters and family-drive subset remain separate additive diagnostics', () => {
  const base = observed('net').row;
  const contact = (intent, family, above, available, matched = true, hitterUp = true) => ({ intent, family, aboveLocalTape: above, incomingAttackable: available,
    decisionEvidence: { matched }, hitterUp, ordinal: 4, hittingTeam: 'green', contact: { heightFeet: 2 }, teams: [], opponentNotUp: false, netClearanceInches: 1 });
  const row = { ...base, contacts: [contact('drive', 'drive', true, true), contact('speed-up', 'volley', false, true),
    contact('put-away', 'volley', true, null, false), contact('counter', 'volley', false, true), contact('block', 'reset', false, false),
    contact('third-shot-drive', 'drive', true, true, true, false)] };
  const summary = summarizeObservationsV2([row]);
  const initiated = summary.diagnostics.lineInitiatedAttacks;
  assert.equal(initiated.contacts, 3); assert.equal(initiated.matchedPreChoiceContacts, 2);
  assert.equal(initiated.missingPreChoiceContacts, 1); assert.equal(initiated.aboveLocalTapeContacts, 2);
  assert.equal(initiated.matchedAboveTapeAndAffordanceContacts, 1);
  assert.equal(summary.diagnostics.lineControlledCounters.contacts, 1);
  assert.equal(summary.diagnostics.familyDriveSubset.contacts, 1);
  assert.equal(summary.denominators.lineDrives, 1, 'existing calibrated family-drive denominator stays unchanged');
  assert.equal(summary.metrics.lineDrivesWithoutAttackableBall.denominator, 1);
  const calibration = evaluateCalibrationV2(summary, { style: 'pro', expectedRallies: 1, minConditionalSamples: 1 });
  const changedDiagnostic = { ...summary, diagnostics: { deliberatelyChanged: true }, modelSupport: { status: 'FAIL' } };
  assert.deepEqual(evaluateCalibrationV2(changedDiagnostic, { style: 'pro', expectedRallies: 1, minConditionalSamples: 1 }), calibration);
  assert.equal(calibration.gates.some(gate => /Initiated|Support/.test(gate.name)), false);
});

test('grounded engine contact-height support is versioned, applies to every family and preserves tolerance', () => {
  const make = (heightFeet, family = 'dink') => ({ ordinal: 1, shotId: 'height', family, intent: family, contact: { heightFeet }, groundedEvidence: true });
  assert.equal(CONTACT_SUPPORT_POLICY_V2.version, 'rally-contact-support-v1');
  assert.equal(assessContactSupportV2([make(8.5), make(8.5 + .5e-6)], { generated: true }).status, 'PASS');
  const high = assessContactSupportV2([make(8.5 + 2e-6), make(16, 'lob')], { generated: true });
  assert.equal(high.status, 'FAIL'); assert.equal(high.unsupportedContacts, 2);
  assert.deepEqual(high.violations.map(item => item.family), ['dink', 'lob']);
  assert.equal(assessContactSupportV2([make(16)], { generated: false }).status, 'NOT_APPLICABLE');
  assert.equal(assessContactSupportV2([], { generated: true }).status, 'NOT_EVALUATED');
});

test('a real compiled high contact can pass M1 rules while failing grounded generator support', () => {
  const document = unsupportedGroundedDocument(), source = JSON.stringify(document);
  const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, 2); assert.deepEqual(compiled.findings.filter(item => item.severity === 'error'), []);
  assert.equal(rules.valid, true);
  const row = observeRallyV2({ document, compiled, rules, result: resultFor(document), seed: 7 });
  assert.equal(row.physicallyValid, true); assert.equal(row.accepted, true);
  assert.equal(row.modelSupport.status, 'FAIL'); assert.equal(row.modelSupport.unsupportedContacts, 1);
  assert.ok(row.modelSupport.violations[0].heightFeet > 16);
  assert.equal(row.modelSupport.violations[0].shotId, 'support-high-contact');
  assert.equal(JSON.stringify(document), source, 'a diagnostic cannot rewrite or reject source imports');
  const manual = copy(document); delete manual.generation;
  validateDocument(manual);
  assert.equal(observeRallyV2({ document: manual, compiled, rules, result: resultFor(manual), seed: 7 }).modelSupport.status, 'NOT_APPLICABLE');
});

test('runner distinguishes generator-model support failure from independent rule validity', async () => {
  const jobs = createCohortSchedule({ cohort: 'custom', styles: ['advanced'], seeds: [7] });
  const report = await runRealismV2({ jobs, generate: async input => engineResultFor(input, unsupportedGroundedDocument()) });
  assert.equal(report.status, 'MODEL_SUPPORT_FAIL');
  assert.equal(report.physicalValidity.status, 'PASS');
  assert.equal(report.modelSupport.status, 'FAIL');
  assert.equal(report.modelSupport.unsupportedContacts, 1);
  assert.equal(report.failures.length, 0, 'support failure is not fabricated as an official-rule or search failure');
});

test('missing output audit stays unevaluated and all attempted statuses remain in original denominators', async () => {
  const jobs = createCohortSchedule({ cohort: 'custom', styles: ['advanced'], seeds: [7, 8, 9] });
  let index = 0;
  const report = await runRealismV2({ jobs, generate: async input => ({
    status: ['failed', 'unsatisfied', 'cancelled'][index++], document: null, outcome: null, decisions: [],
    recipe: createRallyRequestRecipeV1(normalizeRallyInputV1(input)),
    diagnostics: { attempts: 1, attemptedSeeds: [input.seed] },
  }) });
  assert.equal(report.corpus.attemptedRallies, 3);
  assert.equal(report.generatedFlightFeasibility.status, 'NOT_EVALUATED');
  assert.equal(report.generatedFlightFeasibility.checkedFlights, 0);
  assert.equal(report.generatedFlightFeasibility.statusCounts.NOT_EVALUATED, 3);
  assert.equal(report.summary.denominators.attemptedRallies, 3);
  assert.equal(report.summary.denominators.invalidOrMissing, 3);
  assert.equal(report.physicalValidity.status, 'NOT_EVALUATED');
  assert.ok(report.observations.every(row => row.generatedFlightFeasibility.status === 'NOT_EVALUATED'));
});

test('physical validity and natural denominators survive a separate generated flight failure', async () => {
  const jobs = createCohortSchedule({ cohort: 'custom', styles: ['advanced'], seeds: [7] });
  const report = await runRealismV2({ jobs, generate: async input => engineResultFor(input, readModel2Fixture('net')) });
  assert.equal(report.physicalValidity.status, 'PASS');
  assert.equal(report.generatedFlightFeasibility.status, 'FAIL');
  assert.equal(report.status, 'GENERATED_FLIGHT_FEASIBILITY_FAIL');
  assert.equal(report.summary.denominators.naturalCompleteRallies, 1);
  assert.equal(report.summary.denominators.invalidOrMissing, 0);
  assert.equal(report.generatedFlightFeasibility.families.dink.checkedFlights, 1);
  assert.equal(report.generatedFlightFeasibility.families.dink.failedFlights, 1);
  assert.equal(report.observations[0].accepted, true);
  assert.equal(report.versions.policyVersion, 'rally-policy-v2');
  assert.equal(report.versions.flightPlannerVersion, 'rally-flight-planner-v2');
});

test('archive replay reports actual mixed provenance without upgrading historical origins', async () => {
  const jobs = createCohortSchedule({ cohort: 'custom', styles: ['advanced'], seeds: [7, 8] }), records = [];
  await runRealismV2({ jobs, generate: async input => engineResultFor(input, readModel2Fixture('net')), onRecord: async record => records.push(record) });
  const legacy = records[0].result;
  for (const generation of [legacy.recipe, legacy.document.generation]) { generation.policyVersion = 'rally-policy-v1'; delete generation.flightPlannerVersion; }
  const before = JSON.stringify(records);
  const report = await runRealismV2({ jobs, records });
  assert.equal(report.physicalValidity.status, 'PASS');
  assert.equal(report.versions.policyVersion, null);
  assert.deepEqual(report.versions.sourceVersions.policyVersion, ['rally-policy-v1', 'rally-policy-v2']);
  assert.deepEqual(report.versions.sourceVersions.flightPlannerVersion, [null, 'rally-flight-planner-v2']);
  assert.equal(report.summary.denominators.naturalCompleteRallies, 2);
  assert.equal(JSON.stringify(records), before);
});

test('pre-choice evidence must match actual saved policy identity for old and current generated origins', () => {
  const { document, compiled, rules } = observed('long');
  document.generation = copy(createGenerationRecipeV1(normalizeRallyInputV1({ seed: 7 })));
  const segment = compiled.timeline.segments[0], time = segment.startTime + segment.contactTime;
  const decision = { shotId: document.shots[0].id, situation: { policyVersion: 'rally-policy-v2', hitter: document.shots[0].hitter, contactIndex: 0,
    contact: copy(segment.shotSemantics.contact.point), positions: copy(samplePlayState(compiled.timeline, time).positions),
    sampleTimeSeconds: time, contactTimeSeconds: time, attackable: false, affordances: { attack: false } } };
  const result = { ...resultFor(document), decisions: [decision] };
  const observe = () => observeRallyV2({ document, compiled, rules, result, seed: 7 }).contacts[0].incomingAttackable;
  assert.equal(observe(), false);
  decision.situation.policyVersion = 'rally-policy-v1'; assert.equal(observe(), null);
  document.generation.policyVersion = 'rally-policy-v1'; delete document.generation.flightPlannerVersion;
  assert.equal(observe(), false);
});

test('partial feasibility checking never reports an aggregate PASS for missing attempts', () => {
  const { document, compiled, rules } = observed('net');
  document.generation = copy(createGenerationRecipeV1(normalizeRallyInputV1({ seed: 7 })));
  document.shots[0].family = 'drive';
  const rebuilt = compileDocument(document), rebuiltRules = validateRallyRules(rebuilt.play, rebuilt.timeline);
  const row = observeRallyV2({ document, compiled: rebuilt, rules: rebuiltRules, result: resultFor(document), seed: 7 });
  assert.equal(row.generatedFlightFeasibility.status, 'PASS');
  const absent = { ...copy(row), accepted: false, complete: false, contacts: [], generatedFlightFeasibility: {
    status: 'NOT_EVALUATED', checkedFlights: 0, violations: [], flights: [],
  } };
  const summary = summarizeObservationsV2([row, absent]);
  assert.equal(summary.generatedFlightFeasibility.status, 'NOT_EVALUATED');
  assert.equal(summary.generatedFlightFeasibility.checkedRallies, 1);
  assert.equal(summary.generatedFlightFeasibility.statusCounts.NOT_EVALUATED, 1);
});

test('scheduled but unattempted jobs keep aggregate generated flight feasibility unevaluated', async () => {
  const jobs = createCohortSchedule({ cohort: 'custom', styles: ['advanced'], seeds: [7, 8] });
  const records = [];
  await runRealismV2({ jobs, generate: async input => {
    const result = engineResultFor(input, readModel2Fixture('net'));
    result.document.shots[0].family = 'drive';
    return result;
  }, onRecord: async record => records.push(record) });
  const replay = await runRealismV2({ jobs, records: records.slice(0, 1) });
  assert.equal(replay.status, 'INCOMPLETE');
  assert.equal(replay.generatedFlightFeasibility.status, 'NOT_EVALUATED');
  assert.equal(replay.generatedFlightFeasibility.checkedRallies, 1);
  assert.equal(replay.generatedFlightFeasibility.missingScheduledRallies, 1);
  assert.equal(replay.byStyle[0].generatedFlightFeasibility.status, 'NOT_EVALUATED');
});
