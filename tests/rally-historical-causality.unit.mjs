import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateDocument} from '../play-document.js';
import {compileDocument} from '../play-compiler.js';
import {validateRallyRules} from '../rally-rules.js';
import {PHYSICS_V2, localNetHeightFeet} from '../play-physics-v2.js';
import {inspectGeneratedMovementV1, inspectGeneratedSpacingV1} from '../rally-movement.js';
import {assessGeneratedFlightFeasibilityV1} from '../rally-flight-audit.js';
import {applyExecutionV1, resolveDeliveredFlightV1} from '../rally-quality.js';
import {createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2, inspectPlanningTrialEventsV2} from '../play-planning-v2.js';
import {isInNonVolleyZone} from '../court-geometry.js';
import {runNaturalAttemptV1} from '../rally-engine.js';
import {normalizeRallyInputV1} from '../rally-recipe.js';
import {createRallyRandomV1} from '../rally-random.js';
import {assertFreshPhysicalResult, assertCurrentProceduralResult} from './helpers/rally-procedural-proof.mjs';

const bundle = JSON.parse(readFileSync(new URL('./fixtures/model2/procedural-historical-a4b6b82-v1.json', import.meta.url), 'utf8'));
const archived = JSON.parse(readFileSync(new URL('./fixtures/model2/m2-qualification-failures-v1.json', import.meta.url), 'utf8'));
const popupRows = JSON.parse(readFileSync(new URL('./fixtures/model2/dink-popup-archived.json', import.meta.url), 'utf8')).rows;
const byId = id => {const row = bundle.cases.find(item => item.id === id); assert.ok(row, id); return row;};
const witness = (row, index = row.document.shots.length - 1) => row.witnesses.find(item => item.index === index).decision;
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function replay(row) {
  const document = structuredClone(row.document), before = JSON.stringify(document);
  validateDocument(document);
  const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, document.shots.length);
  assert.deepEqual(compiled.findings.filter(item => item.severity === 'error'), []);
  assert.equal(rules.valid, true); assert.deepEqual(rules.violations, []);
  // Historical authored replay retains its original speed-only obligation.
  // New acceleration/trainer admission is deliberately not retroactive.
  assert.equal(inspectGeneratedMovementV1(compiled.timeline).valid, true);
  assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
  if (row.outcome) {
    assert.deepEqual(row.outcome, document.outcome);
    const physical = rules.expectedOutcomes.find(item => ['shotId', 'reason', 'winner', 'ruleRef', 'faultingActor', 'struckActor']
      .every(key => (item[key] ?? null) === (row.outcome[key] ?? null)));
    assert.ok(physical); near(physical.afterContactSeconds, row.outcome.evidence.afterContactSeconds);
    for (const axis of ['x', 'y', 'heightFeet']) near(physical.position[axis], row.outcome.evidence.position[axis]);
  } else assert.deepEqual(rules.expectedOutcomes, []);
  assert.equal(JSON.stringify(document), before);
  return {document, compiled, rules};
}
function delivered(row, index = row.document.shots.length - 1) {
  const decision = witness(row, index), shot = row.document.shots[index], nominal = decision.resolution.nominalSafety.nominal;
  const team = row.document.players[shot.hitter].team, style = row.input.players?.[shot.hitter]?.style ?? 'advanced';
  const applied = applyExecutionV1({execution: decision.execution, target: nominal.target, contact: nominal.contact,
    team, physics: nominal.physics, family: shot.family, intent: shot.intent, style, route: 'over-net',
    pace: nominal.pace, arc: nominal.arc, draws: decision.draws.perturbation});
  const input = {candidate: {...decision.chosen, pace: nominal.pace, arc: nominal.arc}, contact: nominal.contact,
    team, execution: decision.execution, applied, style, route: 'over-net'};
  const result = resolveDeliveredFlightV1(input);
  for (const axis of ['x', 'y']) near(result.applied.target[axis], shot.target[axis]);
  assert.equal(result.applied.quality, shot.quality);
  assert.equal(decision.resolution.solutionIndex, 0);
  assert.equal(decision.resolution.choiceAttempts.filter(item => item.executionDraws).length, 1);
  return {decision, shot, input, result};
}

for (const row of bundle.cases) test(`exact historical source replays unchanged: ${row.id}`, () => {
  assert.equal(bundle.sourceRevision, 'a4b6b823f4da8178106fe0c84f3261fc5b49d01f');
  assert.equal(row.provenance.sourceRevision, bundle.sourceRevision);
  assert.equal(sha(row.document), row.provenance.documentSha256);
  replay(row);
});

for (const original of archived.filter(row => row.wide)) test(`original fixed wide error preserves incidental post-route causality: ${original.id}`, () => {
  const row = byId(original.id), {decision, input, result} = delivered(row, original.wide.contactIndex);
  assert.equal(decision.chosen.id, original.wide.chosenId);
  assert.equal(decision.execution.quality, 'error'); assert.equal(decision.execution.errorReason, 'wide');
  assert.deepEqual(decision.draws.execution, original.wide.executionDraws);
  assert.deepEqual(decision.draws.target, original.wide.targetDraws);
  assert.deepEqual(decision.draws.perturbation, original.wide.perturbationDraws);
  assert.deepEqual(decision.resolution.target, original.wide.target);
  assert.equal(result.guidance.incidentalAroundPost, true); assert.equal(result.guidance.nominalRoute, 'over-net');
  assert.notEqual(decision.chosen.intent, 'around-the-post');
  assert.equal(result.flight.obstruction, null); assert.ok(result.flight.launchSpeedMph <= 25);
  for (const execution of [{quality: 'neutral', errorReason: null}, {quality: 'error', errorReason: 'net'}]) {
    const negative = {...input, execution, applied: {...input.applied, quality: execution.quality, intendedError: execution.errorReason}};
    assert.throws(() => resolveDeliveredFlightV1(negative), /Delivered flight unavailable/);
  }
});

test('historical four-contact endpoint certificate proves second bounce without fabricating a fifth contact or a human-unreachable winner', () => {
  const row = byId('holdout:intermediate:balanced:51077'), {compiled, rules} = replay(row);
  assert.equal(row.document.shots.length, 4); assert.equal(compiled.timeline.events.filter(event => event.type === 'contact').length, 4);
  assert.equal(row.outcome.reason, 'second-bounce'); assert.equal(row.outcome.type, 'fault');
  assert.equal(row.outcome.ruleRef, '10.B.1'); assert.equal(row.outcome.faultingActor, 'player1');
  const certificate = row.outcome.evidence.generatedRouteCertificate;
  assert.equal(certificate.version, 'generated-contact-endpoint-route-v1');
  assert.ok(certificate.actors.every(actor => actor.continuousLowerBoundFeet > 0));
  assert.equal(rules.expectedOutcomes[0].reach.unreachable, false);
  assert.deepEqual(rules.expectedOutcomes[0].generatedRouteCertificate.actors.map(actor => actor.actor), certificate.actors.map(actor => actor.actor));
  const invalid = structuredClone(row.document); invalid.outcome.evidence.generatedRouteCertificate.actors[0].continuousLowerBoundFeet += .01;
  assert.ok(compileDocument(invalid).findings.some(item => item.severity === 'error'));
});

test('historical neutral eighth delivery retains the first-timing friendly body collision at the original shot cap', () => {
  const row = byId('pro-1177-eight'), {rules} = replay(row), {decision} = delivered(row);
  assert.equal(row.input.options.maxShots, 8); assert.equal(row.document.shots.length, 8);
  assert.equal(row.outcome.reason, 'body'); assert.equal(row.outcome.struckActor, 'player4');
  assert.equal(row.document.shots[7].hitter, 'player4', 'the original friendly collision is the hitter striking their own represented torso');
  near(row.outcome.evidence.afterContactSeconds, .056527514);
  assert.equal(decision.execution.quality, 'neutral'); assert.equal(decision.resolution.nominalSafety.clear, true);
  assert.deepEqual(decision.draws.execution, {quality: .6246410687454045, error: .8334799539297819});
  assert.deepEqual(decision.resolution.choiceAttempts.at(-1).repairs, []);
  assert.ok(rules.expectedOutcomes.some(row => row.reason === 'body' && row.struckActor === 'player4'));
  const invalid = structuredClone(row.document); invalid.outcome.struckActor = 'player3'; invalid.outcome.faultingActor = 'player3';
  assert.ok(compileDocument(invalid).findings.some(row => row.severity === 'error'));
});

test('historical neutral reset still strikes the mesh inside ordinary shape bounds without error relabeling or timing replacement', () => {
  const row = byId('neutral-reset-net'), {compiled} = replay(row), {decision, result} = delivered(row);
  assert.equal(row.document.shots.length, 7); assert.equal(row.outcome.reason, 'net'); assert.equal(row.outcome.shotId, 'shot-7');
  assert.equal(decision.chosen.family, 'reset'); assert.equal(decision.execution.quality, 'neutral'); assert.equal(decision.execution.errorReason, null);
  assert.deepEqual(decision.draws.execution, {quality: .8444628245197237, error: .3883689953945577});
  assert.deepEqual(decision.resolution.choiceAttempts.at(-1).repairs, []);
  assert.equal(result.flight.obstruction.kind, 'net'); assert.ok(result.flight.launchSpeedMph <= 24); assert.ok(result.flight.metadata.apexFeet <= 5.5);
  assert.equal(assessGeneratedFlightFeasibilityV1({document: row.document, compiled}).status, 'PASS');
  const invalid = structuredClone(row.document); invalid.outcome.evidence.afterContactSeconds += .01;
  assert.ok(compileDocument(invalid).findings.some(row => row.severity === 'error'));
});

test('historical legal interception precedes the projected opponent body collision', () => {
  const row = byId('pro-1032-intercept'), state = createPlanningStateV2(row.document); let projected;
  for (const [index, shot] of row.document.shots.entries()) {
    const trial = trialRecipeV2(state, shot, {capturePendingEvents: true}); assert.equal(trial.ok, true);
    if (index === 2) {projected = inspectPlanningTrialEventsV2(state, trial).physicalCandidates.find(item => item.reason === 'body' && item.struckActor === 'player3'); assert.ok(projected);}
    if (index === 3) {assert.ok(trial.resolvedPrevious.endTime < projected.absoluteTime); assert.equal(trial.terminalBeforeNextContact, undefined);}
    commitPlanningTrialV2(state, trial);
  }
});

test('historical fifth air contact is sampled from the actual flight rather than forced to bounce at an actor plane', () => {
  const row = byId('pro-2-fifth-air'), {compiled} = replay(row), prior = compiled.timeline.segments[3], reply = compiled.timeline.segments[4];
  assert.equal(witness(row, 2).chosen.family, 'drive'); assert.equal(reply.shotSemantics.contact.kind, 'volley');
  assert.ok(row.document.shots[4].contactTiming.beforeBounceSeconds > 0);
  near(prior.trajectory.solved.firstLandingTime - prior.trajectory.totalDuration, row.document.shots[4].contactTiming.beforeBounceSeconds);
  const actual = prior.trajectory.solved.sampleBoard(prior.trajectory.totalDuration);
  for (const axis of ['x', 'y', 'heightFeet']) near(actual[axis], reply.shotSemantics.contact.point[axis]);
});

test('historical controlled popup establishes its exact supported bounced attack rather than borrowing an execution label', () => {
  const row = byId('controlled-popup'), {compiled} = replay(row), popup = witness(row, 6), next = witness(row, 7), reply = compiled.timeline.segments[7];
  assert.equal(popup.resolution.physicalTransformation.kind, 'dink-popup');
  assert.equal(popup.resolution.physicalTransformation.dinkPopup.receiverOpportunity.status, 'unestablished');
  assert.equal(popup.resolution.physicalTransformation.dinkPopup.receiverOpportunity.scope, 'at-delivery');
  assert.equal(popup.draws.execution.quality, .15); assert.deepEqual(popup.draws.perturbation, {lateral: .5, depth: .5});
  assert.equal(isInNonVolleyZone(row.document.shots[6].target), true);
  near(reply.shotSemantics.contact.point.heightFeet, 3.024246384);
  assert.equal(reply.shotSemantics.contact.kind, 'groundstroke'); assert.equal(next.situation.attackable, true);
  assert.ok(next.situation.contact.heightFeet - PHYSICS_V2.ballRadiusFeet - localNetHeightFeet(next.situation.contact.x) > .05);
  assert.deepEqual(next.situation.contactSelection.outgoingSafety.supportedReplyIds, ['drive', 'reset']);
  for (const key of ['legal', 'routeValid', 'feetValid']) assert.equal(next.situation.contactSelection.evidence.chosen.audit[key], true);
  near(reply.trajectory.solved.launchSpeedMph, 26.309017541);
  const selection = next.situation.contactSelection;
  assert.equal(selection.evidence.chosen.preference.heightClass, 'attack');
  assert.ok(selection.evidence.chosen.audit.peakFeetPerSecond <= 18);
  assert.ok(selection.evidence.chosen.audit.minimumSpacingFeet >= 2.5);
  assert.ok(next.situation.feet.every(foot => !isInNonVolleyZone(foot)));
  const kitchenVolleys = compiled.timeline.segments.filter((segment, index) => index > 0
    && segment.shotSemantics.contact.kind === 'volley' && isInNonVolleyZone(segment.shotSemantics.contact.point)
    && row.document.shots[index].contactTiming?.beforeBounceSeconds !== undefined);
  assert.ok(kitchenVolleys.length > 0);
  for (const segment of kitchenVolleys) {
    assert.ok(segment.shotSemantics.contact.feet.every(foot => !isInNonVolleyZone(foot)));
    assert.equal(segment.step.shot.contact.feetEstablishedOutsideNVZ, true);
    assert.ok(!['erne', 'around-the-post'].includes(segment.step.shot.authoring.intent));
  }

  const invalid = structuredClone(row.document); invalid.shots[7].contactTiming.afterBounceSeconds = 1.4;
  assert.ok(compileDocument(invalid).findings.some(item => item.severity === 'error'));
});

for (const original of popupRows) test(`historical policy-v3 opportunity retains its original phase, fixed draws and actual reply: ${original.name}`, () => {
  const row = byId(original.name), index = original.shotNumber - 1, decision = witness(row, index), next = witness(row, index + 1);
  assert.equal(row.document.shots.length, original.shotNumber + 1);
  assert.deepEqual(decision.draws.execution, original.draws.execution);
  if (original.name !== 'pro-1136-24') assert.deepEqual(decision.draws, original.draws);
  assert.equal(decision.execution.quality, 'attackable');
  assert.equal(decision.resolution.choiceAttempts.filter(attempt => attempt.executionDraws).length, 1);
  for (const key of ['legal', 'routeValid', 'feetValid']) assert.equal(next.situation.contactSelection.evidence.chosen.audit[key], true);
  if (original.name === 'advanced-1074-5') {
    assert.equal(decision.situation.opponentFormation, 'split'); assert.equal(decision.chosen.family, 'reset');
    assert.deepEqual(decision.resolution.target, {x: 10.337264468, y: 16.354239708});
    assert.equal(decision.resolution.physicalTransformation.dinkPopup, undefined); assert.equal(next.situation.attackable, false);
  } else {
    const popup = decision.resolution.physicalTransformation.dinkPopup;
    assert.equal(popup.version, 'rally-dink-popup-v1'); assert.equal(popup.receiverOpportunity.status, 'unestablished');
    assert.equal(popup.receiverOpportunity.scope, 'at-delivery');
    assert.equal(next.situation.attackable, true); assert.equal(next.situation.affordances.attack, true);
    assert.ok(next.situation.contact.heightFeet - PHYSICS_V2.ballRadiusFeet - localNetHeightFeet(next.situation.contact.x)
      > (original.name === 'pro-1136-24' ? 0 : .05));
    assert.ok(next.situation.contactSelection.outgoingSafety.supportedReplyIds.includes('drive'));
    if (original.name === 'pro-1002-14') assert.equal(next.situation.contactKind, 'groundstroke');
  }
});

test('historical Pro1136 preserves the reviewed policy-v3 popup, exact draws and legal low-margin contact separately from new generation', () => {
  const row = byId('pro-1136-24'), d = witness(row, 23), next = witness(row, 24);
  assert.deepEqual(d.draws, {intent: .12031104159541428, execution: {quality: .15117291663773358, error: .1903682027477771},
    target: {lateral: .7907168711535633, depth: .7805831038858742}, perturbation: {lateral: .9605169373098761, depth: .3910994636826217}, narration: .6104971736203879});
  assert.deepEqual(d.resolution.target, {x: 3.862926019, y: 15.147774866});
  assert.deepEqual(next.situation.contact, {x: 6.008715909, y: 17.2, heightFeet: 2.999368281});
  assert.equal(d.execution.quality, 'attackable'); assert.equal(next.situation.attackable, true);
  assert.ok(next.situation.contact.heightFeet - PHYSICS_V2.ballRadiusFeet - localNetHeightFeet(next.situation.contact.x) > 0);
  assert.equal(d.resolution.choiceAttempts.filter(item => item.executionDraws).length, 1);
});

for (const id of ['pro-1177-full', 'neutral-reset-net']) test(`current direct natural attempt consumes exactly one unaltered execution pair per committed contact: ${id}`, async () => {
  const historical = id === 'pro-1177-full' ? byId('pro-1177-eight') : byId(id);
  const input = normalizeRallyInputV1({...historical.input, options: {...historical.input.options, maxShots: 99}});
  const attemptSeed = id === 'neutral-reset-net' ? 1549107850 : 1177, attemptIndex = id === 'neutral-reset-net' ? 20 : 0;
  const random = createRallyRandomV1(attemptSeed), calls = [], observed = Object.fromEntries(['intent', 'target', 'execution', 'narration'].map(name => [name, () => {
    const value = random[name](); calls.push({name, value}); return value;
  }]));
  const result = await runNaturalAttemptV1(input, {attemptIndex, attemptSeed, random: {...random, ...observed}, checkpoint: async () => {}});
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics)); assertFreshPhysicalResult(result);
  const executionCalls = calls.filter(call => call.name === 'execution'); assert.equal(executionCalls.length, 2 * result.decisions.length);
  for (const [index, decision] of result.decisions.entries()) {
    assert.deepEqual(decision.draws.execution, {quality: executionCalls[index * 2].value, error: executionCalls[index * 2 + 1].value});
    const first = calls.indexOf(executionCalls[index * 2]);
    assert.deepEqual(calls.slice(first, first + 5).map(call => call.name), ['execution', 'execution', 'target', 'target', 'narration']);
    assert.deepEqual(decision.draws.perturbation, {lateral: calls[first + 2].value, depth: calls[first + 3].value});
    assert.equal(decision.draws.narration, calls[first + 4].value);
    assert.equal(decision.resolution.choiceAttempts.filter(item => item.executionDraws).length, 1);
    assert.equal(decision.resolution.solutionIndex, 0);
    assert.equal(decision.resolution.choiceAttempts.some(item => item.repairs.some(repair => repair.stage === 'execution-route')), false);
  }
  assertCurrentProceduralResult(result, id);
});
