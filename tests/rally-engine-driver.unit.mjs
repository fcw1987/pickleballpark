import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngineDriverV1, ENGINE_DRIVER_LIMITS, yieldRallyTurnV1 } from '../rally-engine-driver.js';
import { deriveRallySeedV1 } from '../rally-random.js';
import { compileDocument } from '../play-compiler.js';
import { previewDocumentV2 } from '../play-compiler-v2.js';
import { MODEL2_AUTHORING_FIELDS } from '../play-document.js';
import { classifyOutcomeV1 } from '../rally-quality.js';
import { isInNonVolleyZone } from '../court-geometry.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

const immediate = () => Promise.resolve();
const clone = value => structuredClone(value);

// These are fixture producers, not a replacement policy engine. They copy the
// actual M1 compiler's feet, then cross the same independent final validators.
function fixtureResult(document, attemptSeed = 7) {
  document = clone(document);
  // These older authored fixtures predate generation envelopes. Preserve their
  // real trajectories while labeling the scripted terminal mistakes as errors.
  const authored = compileDocument(document);
  for (const [index, shot] of document.shots.entries()) {
    const solved = authored.timeline.segments[index].trajectory.solved;
    if (shot.family === 'dink' && solved.launchSpeedMph > 25) {
      shot.family = 'drive'; shot.intent = 'drive'; shot.quality = 'error';
      shot.physics = { launchVerticalFeetPerSecond: solved.stages[0].vy };
    } else if (shot.family === 'drive' && solved.launchSpeedMph < 22) {
      shot.quality = 'error'; shot.physics = { launchVerticalFeetPerSecond: solved.stages[0].vy };
    }
  }
  const compiled = compileDocument(document);
  assert.equal(compiled.validShotCount, document.shots.length);
  for (const [index, shot] of document.shots.entries()) {
    const feet = clone(compiled.timeline.segments[index].shotSemantics.contact.feet);
    shot.contactEvidence = { ...shot.contactEvidence, feet, feetEstablishedOutsideNVZ: feet.every(foot => !isInNonVolleyZone(foot)) };
    shot.generation = { seed: attemptSeed, generatorVersion: 'rally-engine-v1' };
    shot.authoring = { ownership: 'automatic', fields: MODEL2_AUTHORING_FIELDS.filter(field => Object.hasOwn(shot, field)) };
  }
  return { status: document.ending === 'stop' ? 'censored' : 'complete', document,
    outcome: clone(document.outcome ?? null),
    decisions: document.shots.map((shot, index) => ({ id: `fixture-decision-${index}`, shotId: shot.id, intent: shot.intent,
      candidates: [{ id: 'fixture', intent: shot.intent, weight: 1, normalizedWeight: 1 }], situation: { fixtureOnly: true } })),
    stats: { shots: document.shots.length }, diagnostics: { rejections: 0 },
    outcomeClassification: document.outcome ? classifyOutcomeV1({ outcome: document.outcome }) : null };
}
const net = seed => fixtureResult(readModel2Fixture('net'), seed);
function completedFixture(shots) {
  const document = model2Document({ id: `driver-${shots}-fixture`, title: 'Driver fixture only', ending: 'fault',
    shots: Array.from({ length: shots }, (_, index) => model2Shot({ id: `driver-contact-${index}`, hitter: index % 2 ? 'player3' : 'player1',
      target: { x: 7, y: index % 2 ? 14 : 30 } })) });
  document.shots.at(-1).physics = { launchVerticalFeetPerSecond: 0 };
  const preview = previewDocumentV2(document);
  assert.equal(preview.derivedOutcome?.reason, 'net');
  document.outcome = preview.derivedOutcome;
  return document;
}

test('complete results cross the real public validators and attach exact selected provenance', async () => {
  const source = net(7), before = JSON.stringify(source);
  const simulate = createEngineDriverV1(async () => source, { yieldControl: immediate });
  const result = await simulate({ seed: 7 });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.outcome, result.document.outcome);
  assert.deepEqual(result.recipe, result.document.generation);
  assert.equal(result.recipe.selection.attempts, 1);
  assert.equal(result.recipe.selection.selectedSeed, 7);
  assert.equal(result.diagnostics.validation.acceptedShots, 1);
  assert.equal(result.diagnostics.validation.expectedOutcomes, 1);
  assert.equal(result.diagnostics.validation.movement.valid, true);
  assert.equal(result.diagnostics.validation.spacing.valid, true);
  assert.equal(JSON.stringify(source), before, 'the attempt producer source is never mutated');
});

test('censoring requires the actual shot limit and never claims a winner', async () => {
  const simulate = createEngineDriverV1(async (_, { attemptSeed }) => fixtureResult(readModel2Fixture('erne'), attemptSeed), { yieldControl: immediate });
  const result = await simulate({ seed: 7, options: { maxShots: 1 } });
  assert.equal(result.status, 'censored'); assert.equal(result.document.ending, 'stop');
  assert.equal(result.outcome, null); assert.equal(result.outcomeClassification, null);
  assert.equal(result.diagnostics.validation.expectedOutcomes, 0);
  assert.equal((await simulate({ seed: 7, options: { maxShots: 2 } })).status, 'failed');
});

test('winner selection uses distinct deterministic attempts without changing their policy', async () => {
  const seeds = [], progress = [];
  const simulate = createEngineDriverV1(async (_, { attemptIndex, attemptSeed, checkpoint }) => {
    seeds.push(attemptSeed); await checkpoint({ shots: 1, workDelta: 2 });
    const result = attemptIndex ? fixtureResult(readModel2Fixture('body'), attemptSeed) : net(attemptSeed);
    result.diagnostics.rejections = attemptIndex ? 3 : 2;
    return result;
  }, { yieldControl: immediate, workChunk: 1 });
  const result = await simulate({ seed: 9, options: { winner: 'green' }, onProgress: record => progress.push(record) });
  assert.equal(result.status, 'complete'); assert.equal(result.outcome.winner, 'green');
  assert.deepEqual(seeds, [9, deriveRallySeedV1(9, 1)]);
  assert.deepEqual(result.diagnostics.attemptedSeeds, seeds);
  assert.equal(result.diagnostics.attempts, 2); assert.equal(result.recipe.selection.selectedAttempt, 1);
  assert.equal(result.diagnostics.work, 4); assert.equal(result.diagnostics.rejections, 5);
  assert.ok(progress.some(record => record.phase === 'retry'));
  assert.ok(progress.every(Object.isFrozen));
});

test('short, long and epic accept independently valid source lengths in their bands', async () => {
  for (const [lengthFeel, count] of [['short', 3], ['long', 12], ['epic', 25]]) {
    const document = completedFixture(count);
    const result = await createEngineDriverV1(async (_, { attemptSeed }) => fixtureResult(document, attemptSeed), { yieldControl: immediate })({ seed: 11, options: { lengthFeel } });
    assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
    assert.equal(result.document.shots.length, count); assert.equal(result.diagnostics.attempts, 1);
  }
});

test('conditioned exhaustion reports all 64 attempts without a fabricated selection', async () => {
  let calls = 0;
  const simulate = createEngineDriverV1(async (_, { attemptSeed, checkpoint }) => { calls++; await checkpoint({ workDelta: 1, shots: 1 }); return net(attemptSeed); }, { yieldControl: immediate });
  const result = await simulate({ seed: 3, options: { lengthFeel: 'long', maxShots: 1 } });
  assert.equal(calls, 64); assert.equal(result.status, 'unsatisfied');
  assert.equal(result.document, null); assert.equal(result.outcome, null); assert.equal(result.recipe.selection, null);
  assert.equal(result.diagnostics.attempts, 64); assert.equal(new Set(result.diagnostics.attemptedSeeds).size, 64);
  assert.equal(result.diagnostics.attemptSummaries.length, 64);
  assert.ok(result.diagnostics.attemptSummaries.every(row => row.selected === false));
});

test('search and independent validation failures stop selection immediately', async () => {
  let calls = 0;
  const search = await createEngineDriverV1(async () => { calls++; return { status: 'failed', diagnostics: { code: 'fixture-search-exhausted', rejections: 8 } }; }, { yieldControl: immediate })({ seed: 3, options: { winner: 'green' } });
  assert.equal(search.status, 'failed'); assert.equal(search.diagnostics.code, 'fixture-search-exhausted'); assert.equal(calls, 1);
  const invalid = net(3); invalid.document.outcome.evidence.afterContactSeconds += .1; invalid.outcome = clone(invalid.document.outcome);
  calls = 0;
  const result = await createEngineDriverV1(async () => { calls++; return invalid; }, { yieldControl: immediate })({ seed: 3, options: { winner: 'green' } });
  assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.code, 'final-validation');
  assert.equal(result.document, null); assert.equal(result.recipe.selection, null); assert.equal(calls, 1);
  assert.ok(result.diagnostics.validation.compilerErrors.length > 0);
  assert.deepEqual(result.decisions, invalid.decisions, 'validation failure retains the rejected attempt trace as analysis');
  assert.notEqual(result.decisions, invalid.decisions);
  assert.equal(result.diagnostics.partialTrace.status, 'retained');
});

test('failed partial decisions are bounded detached analysis and never a selected document', async () => {
  const decisions = [{ id: 'partial-1', shotId: 'shot-1', candidates: [{ intent: 'serve', weight: 1 }], execution: { quality: 'neutral' } },
    { id: 'partial-2', shotId: 'shot-2', candidates: [{ intent: 'deep-return', weight: 1 }], execution: { quality: 'low' } }];
  const simulate = createEngineDriverV1(async () => ({ status: 'failed', decisions,
    diagnostics: { code: 'fixture-partial-search-failure', rejections: 8 } }), { yieldControl: immediate });
  const result = await simulate({ seed: 7 });
  assert.equal(result.status, 'failed'); assert.equal(result.document, null); assert.equal(result.outcome, null);
  assert.equal(result.outcomeClassification, null); assert.equal(result.recipe.selection, null);
  assert.deepEqual(result.decisions, decisions); assert.notEqual(result.decisions, decisions);
  assert.deepEqual(result.diagnostics.partialTrace, { status: 'retained', source: 'producer', count: 2 });
  decisions[0].execution.quality = 'error';
  assert.equal(result.decisions[0].execution.quality, 'neutral');
  result.decisions[1].candidates[0].weight = 5;
  assert.equal(decisions[1].candidates[0].weight, 1);
});

test('unsafe or oversized failure traces are explicitly unavailable without running their data', async () => {
  let accessed = false;
  const accessor = []; Object.defineProperty(accessor, '0', { enumerable: true, get() { accessed = true; throw Error('callback detail must not escape'); } });
  const unsafe = [[{ id: 'bad', callback() {} }], [{ id: 'error-object', error: new Error('callback detail must not escape') }], accessor];
  for (const decisions of [...unsafe, Array.from({ length: 100 }, (_, i) => ({ id: `too-many-${i}` }))]) {
    const result = await createEngineDriverV1(async () => ({ status: 'failed', decisions, diagnostics: { code: 'fixture-failure' } }), { yieldControl: immediate })({ seed: 7 });
    assert.equal(result.status, 'failed'); assert.deepEqual(result.decisions, []);
    assert.equal(result.diagnostics.partialTrace.status, 'unavailable');
    assert.doesNotMatch(JSON.stringify(result), /callback detail must not escape/);
  }
  assert.equal(accessed, false);
});

test('source/outcome, fresh-engine provenance and exact movement invariants remain independent', async () => {
  for (const [mutate, code] of [
    [value => { value.outcome.winner = 'green'; }, 'complete-outcome'],
    [value => { delete value.document.shots[0].contactEvidence; }, 'engine-feet'],
    [value => { value.document.shots[0].generation.seed = 8; }, 'engine-shot-provenance'],
    [value => { value.document.shots[0].authoring.fields.push('contactOverride'); }, 'engine-shot-ownership']
  ]) {
    const fixture = net(7); mutate(fixture);
    const result = await createEngineDriverV1(async () => fixture, { yieldControl: immediate })({ seed: 7 });
    assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.code, code);
  }
  const tooFast = fixtureResult(readModel2Fixture('opening-third-volley'), 7);
  const result = await createEngineDriverV1(async () => tooFast, { yieldControl: immediate })({ seed: 7 });
  assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.code, 'generated-movement');
});

test('malformed recipes and controls reject before pre-cancellation can hide them', async () => {
  let called = false; const simulate = createEngineDriverV1(async () => { called = true; return net(7); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(simulate({ seed: -1, signal: controller.signal }), /seed/);
  await assert.rejects(simulate({ seed: 7, onProgress: true }), /onProgress/);
  await assert.rejects(simulate({ seed: 7, signal: {} }), /AbortSignal/);
  assert.equal(called, false);
  assert.throws(() => createEngineDriverV1(() => {}, { workChunk: 0 }), /workChunk/);
  assert.throws(() => createEngineDriverV1(() => {}, { arbitrary: 1 }), /unsupported/);
});

test('pre-abort and cancellation during search return no successful document or late progress', async () => {
  const before = new AbortController(); before.abort(); let calls = 0, progress = 0;
  const simulate = createEngineDriverV1(async (_, { checkpoint }) => { calls++; await checkpoint({ shots: 1 }); return net(7); }, { yieldControl: immediate });
  const result = await simulate({ seed: 7, signal: before.signal, onProgress() { progress++; } });
  assert.equal(result.status, 'cancelled'); assert.equal(result.diagnostics.attempts, 0); assert.equal(result.recipe.selection, null);
  assert.deepEqual(result.decisions, []); assert.equal(result.diagnostics.partialTrace.reason, 'not-provided');
  assert.equal(calls, 0); assert.equal(progress, 0);
  const during = new AbortController(); const phases = []; let resumed = false;
  const active = createEngineDriverV1(async (_, { checkpoint }) => { await checkpoint({ shots: 1 }); resumed = true; return net(7); }, { yieldControl: immediate });
  const cancelled = await active({ seed: 7, signal: during.signal, onProgress: event => { phases.push(event.phase); if (event.phase === 'search') during.abort(); } });
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.document, null); assert.equal(resumed, false);
  assert.deepEqual(phases, ['attempt', 'search']);
});

test('cancellation retains an explicitly attached partial trace without late progress', async () => {
  const controller = new AbortController(), trace = [{ id: 'cancelled-contact', chosen: { intent: 'serve' } }], phases = [];
  const simulate = createEngineDriverV1(async (_, { checkpoint }) => {
    try { await checkpoint({ shots: 1 }); }
    catch (error) { error.partialDecisions = trace; throw error; }
    throw Error('cancelled generation must not resume');
  }, { yieldControl: immediate });
  const result = await simulate({ seed: 7, signal: controller.signal,
    onProgress: record => { phases.push(record.phase); if (record.phase === 'search') controller.abort(); } });
  assert.equal(result.status, 'cancelled'); assert.equal(result.document, null); assert.equal(result.outcome, null);
  assert.equal(result.outcomeClassification, null); assert.equal(result.recipe.selection, null);
  assert.deepEqual(result.decisions, trace); assert.notEqual(result.decisions, trace);
  assert.deepEqual(result.diagnostics.partialTrace, { status: 'retained', source: 'error', count: 1 });
  trace[0].chosen.intent = 'dink'; assert.equal(result.decisions[0].chosen.intent, 'serve');
  assert.deepEqual(phases, ['attempt', 'search']);
});

test('cancellation during conditioned retry prevents the next attempt from running', async () => {
  const controller = new AbortController(); let calls = 0; const phases = [];
  const simulate = createEngineDriverV1(async (_, { attemptSeed }) => { calls++; return net(attemptSeed); }, { yieldControl: immediate });
  const result = await simulate({ seed: 7, options: { winner: 'green' }, signal: controller.signal,
    onProgress: event => { phases.push(event.phase); if (event.phase === 'retry') controller.abort(); } });
  assert.equal(result.status, 'cancelled'); assert.equal(calls, 1); assert.equal(result.diagnostics.attempts, 2);
  assert.equal(phases.at(-1), 'retry'); assert.equal(result.recipe.selection, null);
});

test('queued cancellation around synchronous final validation wins before installation', async () => {
  const controller = new AbortController(); let yields = 0, validating = 0;
  const simulate = createEngineDriverV1(async () => net(7), { yieldControl: () => ++yields === 1 ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, 0)) });
  const result = await simulate({ seed: 7, signal: controller.signal, onProgress: event => {
    if (event.phase === 'validating' && ++validating === 1) setTimeout(() => controller.abort(), 0);
  } });
  assert.equal(validating, 2, 'the real public validators ran before the queued abort was serviced');
  assert.equal(result.status, 'cancelled'); assert.equal(result.document, null); assert.equal(result.outcome, null);
});

test('work budgets and invalid producer results fail explicitly without another attempt', async () => {
  const simulate = createEngineDriverV1(async (_, { checkpoint }) => {
    await checkpoint({ workDelta: ENGINE_DRIVER_LIMITS.maxWorkPerAttempt }); await checkpoint({ workDelta: 1 }); return net(7);
  }, { yieldControl: immediate });
  const exhausted = await simulate({ seed: 7, options: { winner: 'green' } });
  assert.equal(exhausted.status, 'failed'); assert.equal(exhausted.diagnostics.code, 'work-budget-exhausted');
  assert.equal(exhausted.diagnostics.attempts, 1); assert.equal(exhausted.diagnostics.work, ENGINE_DRIVER_LIMITS.maxWorkPerAttempt);
  const invalid = await createEngineDriverV1(async () => ({ status: 'winner' }), { yieldControl: immediate })({ seed: 7 });
  assert.equal(invalid.status, 'failed'); assert.equal(invalid.diagnostics.code, 'attempt-status');
});

test('observers, yield schedules and concurrent requests cannot change successful data', async () => {
  const producer = async (_, { attemptSeed, random, checkpoint }) => {
    const result = net(attemptSeed); result.document.id += `-${attemptSeed}`;
    result.decisions[0].draw = random.intent();
    await checkpoint({ shots: 1 }); await checkpoint({ shots: 1 });
    return result;
  };
  const first = createEngineDriverV1(producer, { yieldControl: immediate, workChunk: 1 });
  const second = createEngineDriverV1(producer, { yieldControl: immediate, workChunk: 17 });
  const solo = await first({ seed: 7 });
  const observed = await second({ seed: 7, onProgress(event) { assert.ok(Object.isFrozen(event)); throw Error('observer only'); } });
  assert.deepEqual(observed, solo);
  const [left, right] = await Promise.all([first({ seed: 7 }), first({ seed: 8 })]);
  assert.deepEqual(left, solo); assert.deepEqual(right, await first({ seed: 8 }));
  assert.notEqual(right.decisions[0].draw, left.decisions[0].draw);
  assert.doesNotMatch(JSON.stringify(solo.diagnostics), /generationMs|durationMs|yieldCount/);
});

test('the default yield is a macroturn rather than an already-resolved promise', async () => {
  const order = [];
  const yielded = yieldRallyTurnV1().then(() => order.push('yield'));
  Promise.resolve().then(() => { order.push('micro1'); queueMicrotask(() => order.push('micro2')); });
  await yielded;
  assert.deepEqual(order, ['micro1', 'micro2', 'yield']);
});

test('independent engine validation rejects unsupported grounded heights without changing M1 rule acceptance', async () => {
  const document = model2Document({ shots: [
    model2Shot({ id: 'lob', family: 'lob', intent: 'lob', hitter: 'player1', target: { x: 7, y: 40 }, physics: { apexFeet: 18 } }),
    model2Shot({ id: 'high-response', family: 'overhead', intent: 'overhead', hitter: 'player3', contactMode: 'volley', target: { x: 12, y: 4 } })
  ] });
  const fixture = fixtureResult(document, 7);
  const compiled = compileDocument(fixture.document);
  assert.ok(compiled.timeline.segments[1].shotSemantics.contact.point.heightFeet > 8.5);
  const result = await createEngineDriverV1(async () => fixture, { yieldControl: immediate })({ seed: 7, options: { maxShots: 2 } });
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics.code, 'engine-contact-height', JSON.stringify(result.diagnostics));
  assert.equal(result.document, null);
  assert.equal(result.diagnostics.validation.maximumHeightFeet, 8.5);
});

test('fresh serialized envelope failure is explicit despite fabricated planner acceptance', async () => {
  const source = fixtureResult(readModel2Fixture('net'));
  // This authored dink error is publicly legal, but 29.28mph exceeds its 25mph
  // fresh-generation ceiling. The audit must read the compiled serialized leg.
  source.document.shots[0].family = 'dink';
  source.document.shots[0].intent = 'cross-court-dink';
  source.stats.generatedFlightFeasibility = { status: 'PASS', speedMph: 1 };
  source.diagnostics.flightPlanner = { accepted: true, speedMph: 1 };
  const before = JSON.stringify(source);
  const result = await createEngineDriverV1(async () => source, { yieldControl: immediate })({ seed: 7 });
  assert.equal(result.status, 'failed'); assert.equal(result.document, null); assert.equal(result.outcome, null);
  assert.equal(result.diagnostics.code, 'generated-flight-feasibility');
  const audit = result.diagnostics.validation.generatedFlightFeasibility;
  assert.equal(audit.status, 'FAIL'); assert.equal(audit.checkedFlights, 1);
  assert.equal(audit.violations[0].code, 'launch-speed-above-envelope');
  assert.ok(audit.flights[0].launchSpeedMph > 29);
  assert.deepEqual(result.decisions, source.decisions);
  assert.equal(JSON.stringify(source), before);
});

test('selected output records bounded independent audit summaries without saved traces', async () => {
  const result = await createEngineDriverV1(async () => net(7), { yieldControl: immediate })({ seed: 7 });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.stats.generatedFlightFeasibility, {
    version: 'rally-generated-flight-feasibility-v2', status: 'PASS', checkedFlights: 1,
  });
  assert.equal(result.diagnostics.validation.generatedFlightFeasibility.status, 'PASS');
  assert.equal(Object.hasOwn(result.document, 'generatedFlightFeasibility'), false);
  assert.equal(Object.hasOwn(result.document.generation, 'flights'), false);
});
