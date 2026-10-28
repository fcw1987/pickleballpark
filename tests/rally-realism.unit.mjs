import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createStarterDocument, documentFromTemplate, validateDocument } from '../play-document.js';
import { compileEffectiveCandidate } from '../rally-proposals.js';
import { validateRallyRules } from '../rally-rules.js';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { FEET_TO_METERS } from '../three-d-core.js';
import { observeRally, summarizeObservations, distribution } from '../tools/rally-realism-metrics.mjs';
import { runRealism, parseSeeds } from '../tools/rally-realism.mjs';

function observe(document, result = {}, compiled = compileEffectiveCandidate(document), rules = validateRallyRules(compiled.play, compiled.timeline)) {
  return observeRally({ document, compiled, rules, result, seed: 7, settings: { length: document.shots.length }, generationMs: 4 });
}

test('fixed-count stops are censored, with honest natural/outcome denominators', () => {
  const document = createStarterDocument(), before = JSON.stringify(document);
  const row = observe(document), { metrics, denominators } = summarizeObservations([row]);
  assert.equal(row.censored, true);
  assert.equal(row.outcome, null);
  assert.equal(denominators.censoredRallies, 1);
  assert.equal(denominators.naturalRallies, 0);
  assert.equal(metrics.observedShotCount.mean, 3);
  assert.equal(metrics.naturalShotCount.mean, null);
  for (const name of ['naturalNineShotsOrFewer', 'naturalThirtyShotsOrMore', 'receivingTeamWins', 'serveFaults', 'thirdShotKeptInPlay']) {
    assert.equal(metrics[name].value, null, name);
    assert.equal(metrics[name].denominator, 0, name);
  }
  assert.deepEqual(metrics.thirdDriveShareOfDriveDrop, { value: 0, numerator: 0, denominator: 1, unit: 'fraction' });
  assert.deepEqual(metrics.lobShare, { value: 0, numerator: 0, denominator: 3, unit: 'fraction' });
  assert.equal(JSON.stringify(document), before);
});

test('line attainment and dink runs come from compiled contacts, with a conditional rally cohort', () => {
  const dink = documentFromTemplate(PICKLEBOARD_PLAYS.find(p => p.id === 'dink-exchange'));
  const row = observe(dink), report = summarizeObservations([row, observe(createStarterDocument())]);
  assert.equal(row.firstAllFourUpShot, 1);
  assert.equal(row.longestDinkRun, 2);
  assert.equal(report.metrics.allFourUpBeforeCensoring.numerator, 1);
  assert.equal(report.metrics.allFourUpBeforeCensoring.denominator, 2);
  assert.equal(report.metrics.longestDinkRunAmongLineRallies.n, 1);
  assert.equal(report.metrics.longestDinkRunAmongLineRallies.median, 2);
  assert.equal(report.metrics.teamSplitAfterSixth.value, null, 'no eligible post-sixth team contacts');
});

test('measured clearance is the compiled crossing height, not its declared minimum', () => {
  const document = createStarterDocument(), compiled = compileEffectiveCandidate(document);
  const row = observe(document, {}, compiled);
  const crossing = compiled.timeline.events.find(e => e.type === 'net-crossing');
  assert.equal(row.contacts[0].netClearanceInches, (crossing.position.y / FEET_TO_METERS - 34 / 12) * 12);
  assert.notEqual(row.contacts[0].netClearanceInches, compiled.timeline.segments[0].trajectory.metadata.netClearanceInches);
  assert.equal(row.contacts[0].contact.heightFeet, compiled.timeline.segments[0].shotSemantics.contact.point.heightFeet);
});

test('a declared winner alone cannot turn a model1 demonstration into a natural observation', () => {
  const document = createStarterDocument(); document.ending = 'winner';
  const result = { outcome: { winner: 'green', type: 'winner', shotId: document.shots.at(-1).id }, censored: false };
  assert.equal(observe(document, result).censored, true);
  const compiled = compileEffectiveCandidate(document);
  const withTerminal = { ...compiled, timeline: { ...compiled.timeline, events: [...compiled.timeline.events,
    { type: 'dead', rallyLeg: 3, time: compiled.timeline.duration }] } };
  const row = observe(document, result, withTerminal);
  assert.equal(row.censored, false);
  assert.equal(summarizeObservations([row]).metrics.naturalShotCount.mean, 3);
  assert.equal(observe(document, { ...result, censored: true }, withTerminal).censored, true);
  assert.equal(observe(document, { ...result, incomplete: true }, withTerminal).censored, true);
  assert.equal(observe(document, result, withTerminal, { violations: [{ code: 'unexpected-rule-error' }] }).censored, true);
});

test('partial compilation is excluded rather than counted as a short valid rally', () => {
  const document = createStarterDocument(), compiled = compileEffectiveCandidate(document);
  const row = observe(document, {}, { ...compiled, validShotCount: 2 });
  const report = summarizeObservations([row]);
  assert.equal(report.denominators.invalidRallies, 1);
  assert.equal(report.denominators.observedContacts, 0);
});

test('empty, missing and even-sized statistics stay explicit', () => {
  assert.deepEqual(distribution([null, undefined, NaN]), { n: 0, mean: null, min: null, median: null, p95: null, max: null });
  assert.equal(distribution([4, 1, 2, 3]).median, 2.5);
  assert.equal(summarizeObservations([]).metrics.lobShare.value, null);
});

function fixtureAdapter(generate) {
  return { name: 'fixture', version: 'fixture-v1', generate, validate: validateDocument,
    compile: compileEffectiveCandidate, rules: validateRallyRules };
}

test('explicit corpus calls each seed once; archives replay without generation and expose missing observations', async () => {
  let calls = 0, tick = 0; const archive = [];
  const adapter = fixtureAdapter(async () => { calls++; return { document: createStarterDocument(), censored: true }; });
  const options = { adapter, seeds: [7, 9], settings: [{ length: 3 }], clock: () => ++tick };
  const report = await runRealism({ ...options, onRecord: async row => archive.push(row) });
  assert.equal(report.status, 'PASS'); assert.equal(calls, 2); assert.deepEqual(archive.map(r => r.seed), [7, 9]);
  const replay = await runRealism({ ...options, records: archive });
  assert.equal(calls, 2, 'archive analysis must not invoke the generator');
  assert.equal(replay.generationReplayedFromArchive, true);
  assert.deepEqual(replay.summary, report.summary);
  const partial = await runRealism({ ...options, records: archive.slice(0, 1) });
  assert.equal(partial.status, 'INCOMPLETE'); assert.equal(partial.scheduledRallies, 2); assert.equal(partial.attemptedRallies, 1);
  await assert.rejects(runRealism({ ...options, records: [archive[0], archive[0]] }), /unique/);
});

test('source mutation and duplicate corpus weights cannot silently bias a report', async () => {
  const adapter = fixtureAdapter(async () => ({ document: createStarterDocument() }));
  adapter.compile = document => { document.title = 'changed'; return compileEffectiveCandidate(document); };
  const report = await runRealism({ adapter, seeds: [1], settings: [{ length: 3 }] });
  assert.equal(report.status, 'INVALID'); assert.match(report.failures[0].message, /mutated/);
  await assert.rejects(runRealism({ adapter, seeds: [1, 1], settings: [{ length: 3 }] }), /Duplicate seeds/);
  await assert.rejects(runRealism({ adapter, seeds: [1], settings: [{ length: 3 }, { length: 3 }] }), /Duplicate settings/);
  await assert.rejects(runRealism({ adapter, seeds: [1], settings: [{ length: 3, style: 'a' }, { style: 'a', length: 3 }] }), /Duplicate settings/);
  await assert.rejects(runRealism({ adapter, seeds: [1], settings: [{ length: NaN }] }), /finite plain JSON/);
  assert.deepEqual(parseSeeds('0:2'), [0, 1, 2]); assert.deepEqual(parseSeeds('0xffffffff,7'), [4294967295, 7]);
  for (const text of ['-1', '4294967296', '2:1', '1,', '0:10000', ':2', '0:']) assert.throws(() => parseSeeds(text));
});

test('an existing report is rejected before invoking an expensive generator', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rally-realism-preflight-'));
  try {
    const output = join(directory, 'keep.json'), marker = join(directory, 'generated'), adapter = join(directory, 'adapter.mjs');
    writeFileSync(output, 'keep exact bytes');
    writeFileSync(adapter, `import {writeFileSync} from 'node:fs'; export default {name:'probe',version:'probe-v1',validate(){},compile(){},rules(){},generate(){writeFileSync(${JSON.stringify(marker)},'ran'); throw Error('should not run')}};`);
    const child = spawnSync(process.execPath, ['tools/rally-realism.mjs', '--seeds', '7', '--lengths', '12', '--adapter', adapter, '--output', output], { encoding: 'utf8' });
    assert.equal(child.status, 1); assert.match(child.stderr, /Refusing existing output before generation/);
    assert.equal(existsSync(marker), false); assert.equal(readFileSync(output, 'utf8'), 'keep exact bytes');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('cancellation is explicitly incomplete and does not manufacture an outcome', async () => {
  const controller = new AbortController(); controller.abort();
  const report = await runRealism({ adapter: fixtureAdapter(() => { throw Error('must not run'); }), seeds: [7], settings: [{ length: 3 }], signal: controller.signal });
  assert.equal(report.status, 'INCOMPLETE'); assert.equal(report.attemptedRallies, 0);
  assert.equal(report.summary.metrics.receivingTeamWins.value, null);
});

test('a bounded partial result stays incomplete, including after archive replay', async () => {
  const archive = [], adapter = fixtureAdapter(async () => ({ document: createStarterDocument(), incomplete: true }));
  const options = { adapter, seeds: [7], settings: [{ length: 12 }] };
  const report = await runRealism({ ...options, onRecord: async row => archive.push(row) });
  assert.equal(report.status, 'INCOMPLETE'); assert.equal(report.summary.denominators.incompleteRallies, 1);
  assert.equal(report.observations[0].outcome, null);
  assert.equal((await runRealism({ ...options, records: archive })).status, 'INCOMPLETE');
  const exhausted = await runRealism({ ...options, adapter: fixtureAdapter(async () => ({ incomplete: true, reason: 'budget exhausted' })) });
  assert.equal(exhausted.status, 'INCOMPLETE'); assert.equal(exhausted.failures[0].message, 'budget exhausted');
});

test('archive failure aborts without retrying generation or creating phantom attempts', async () => {
  let calls = 0;
  const adapter = fixtureAdapter(async () => { calls++; return { document: createStarterDocument() }; });
  await assert.rejects(runRealism({ adapter, seeds: [7], settings: [{ length: 3 }], onRecord: async () => { throw Error('archive disk failure'); } }), /archive disk failure/);
  assert.equal(calls, 1);
});
