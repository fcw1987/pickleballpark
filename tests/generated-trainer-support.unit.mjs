import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assessGeneratedTrainerSupportV1, inspectGeneratedTrainerSupportV1, GENERATED_TRAINER_SUPPORT_V1 } from '../generated-trainer-support.js';
import { evaluateTrainerContactSupport } from '../trainer-contact-support.js';
import { inspectGeneratedContactSupportV1 } from '../generated-contact-support.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { sampleActorBoardPositionV2, sampleActorFeetV2 } from '../play-actors-v2.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { sampleActorPresentation } from '../three-d-presentation.js';
import { solveFlightV2 } from '../play-physics-v2.js';
import { createEngineDriverV1 } from '../rally-engine-driver.js';
import { MODEL2_AUTHORING_FIELDS } from '../play-document.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';
import { MODEL2_CASES, readModel2Fixture } from './fixtures/model2/cases.mjs';

const camera = {x: 8, y: 5, z: 10};
const closePoint = (a, b, label) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-10, label);
const secant = (flight, end) => {
  if (!flight) return null;
  const duration = flight.totalDuration ?? flight.flightDuration, dt = Math.min(.0001, duration / 4);
  const a = end ? duration - dt : 0, b = end ? duration : dt, from = flight.sample(a), to = flight.sample(b);
  return {x: (to.x - from.x) / (b - a), y: (to.y - from.y) / (b - a), z: (to.z - from.z) / (b - a)};
};
function contactArgs(timeline, players, index) {
  const segment = timeline.segments[index], semantics = segment.shotSemantics, actor = semantics.playerId, prior = timeline.segments[index - 1];
  return {contact: semantics.contact.point, feet: sampleActorFeetV2(segment, actor, segment.contactTime),
    stance: sampleActorBoardPositionV2(segment, actor, segment.contactTime), handedness: players[actor].handedness,
    strokeSide: semantics.strokeSide, family: segment.step.shot.authoring?.family ?? semantics.shotType,
    kind: semantics.contact.kind, nearCourt: segment.previous.positions[actor].y < 22,
    outgoingFlight: segment.trajectory, incomingFlight: prior?.trajectory ?? null, incomingTimeSeconds: prior?.trajectory.totalDuration ?? null};
}
function overheadDocument({distance = 2.5, near = true, hand = 'right'} = {}) {
  const document = model2Document({ending: 'stop', shots: [model2Shot({family: 'overhead', intent: 'overhead',
    contactEvidence: {feet: [{x: 7 + distance - .42, y: 14}, {x: 7 + distance + .42, y: 14}], feetEstablishedOutsideNVZ: true}})]});
  document.initialLayout.player1 = {x: 7 + distance, y: 14};
  document.initialLayout.player3 = {x: 15, y: 30}; document.initialLayout.player4 = {x: 18, y: 30};
  const transform = point => ({x: near ? hand === 'left' ? 20 - point.x : point.x : hand === 'left' ? point.x : 20 - point.x, y: near ? point.y : 44 - point.y});
  const ids = near ? {} : {player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2'};
  document.initialLayout = Object.fromEntries(Object.entries(document.initialLayout).map(([id, point]) => [ids[id] ?? id, transform(point)]));
  for (const shot of document.shots) { shot.hitter = ids[shot.hitter] ?? shot.hitter; shot.target = transform(shot.target); shot.contactEvidence.feet = shot.contactEvidence.feet.map(transform); }
  for (const player of Object.values(document.players)) player.handedness = hand;
  return document;
}
function provisional(document) {
  document = structuredClone(document); const shot = document.shots[0];
  shot.generation = {seed: 7, generatorVersion: 'rally-engine-v1'};
  shot.authoring = {ownership: 'automatic', fields: MODEL2_AUTHORING_FIELDS.filter(field => Object.hasOwn(shot, field))};
  return {status: 'censored', document, outcome: null, outcomeClassification: null, decisions: [{shotId: shot.id}], stats: {shots: 1},
    diagnostics: {validation: {trainerSupport: {valid: true, maximumReachErrorMetres: 0}}}};
}

test('the generation adapter uses the reviewed frozen pure trainer module without renderer or Three imports', () => {
  const module = readFileSync(new URL('../trainer-contact-support.js', import.meta.url));
  assert.equal(createHash('sha256').update(module).digest('hex'), GENERATED_TRAINER_SUPPORT_V1.supportModuleSha256);
  const adapter = readFileSync(new URL('../generated-trainer-support.js', import.meta.url), 'utf8');
  for (const text of [module.toString(), adapter]) assert.doesNotMatch(text, /from ['"][^'"]*(?:three[.]module|reference-athletes|three-d-presentation|three-d-playback)/);
});

test('compiled authored contacts retain exact presentation root, feet, selected hand, side, family and adjacent-flight secants', () => {
  let contacts = 0;
  for (const {id} of MODEL2_CASES) {
    const document = readModel2Fixture(id), source = JSON.stringify(document), timeline = compileDocument(document).timeline;
    for (const [index, segment] of timeline.segments.entries()) {
      const actor = segment.shotSemantics.playerId, args = contactArgs(timeline, document.players, index);
      const result = assessGeneratedTrainerSupportV1(args);
      assert.equal(result.supported, true, `${id}/${index}: ${result.reason}`);
      const sample = sampleActorPresentation({segment, timeline, playerId: actor, localTime: segment.contactTime,
        handedness: document.players[actor].handedness, instructionalMovement: true, cameraPosition: camera});
      closePoint(result.input.root, sample.worldPosition, 'actual root');
      closePoint(result.input.contact, sample.paddle.worldContactTarget, 'actual ball contact');
      for (const side of ['left', 'right']) closePoint(result.input.feet[side], sample.footTargets[side], 'anatomical sole mapping');
      assert.deepEqual(result.input.bodyFacing, sample.bodyFacing);
      assert.equal(result.input.handedness, document.players[actor].handedness);
      assert.equal(result.input.strokeSide, sample.strokeSide);
      const family = (sample.action === 'short-hop' || sample.shotType === 'short-hop') && !['serve', 'overhead'].includes(sample.instructionalFamily)
        ? 'short-hop' : sample.instructionalFamily || sample.shotType || sample.action;
      assert.equal(result.input.family, family);
      assert.deepEqual(result.input.outgoingVelocity, secant(segment.trajectory, false));
      assert.deepEqual(result.input.incomingVelocity, secant(timeline.segments[index - 1]?.trajectory, true));
      const expected = evaluateTrainerContactSupport({...result.input, root: sample.worldPosition, contact: sample.paddle.worldContactTarget,
        feet: sample.footTargets, bodyFacing: sample.bodyFacing, family});
      assert.equal(result.feasible, expected.feasible); closePoint(result.world.face, expected.world.face, 'exact impact support');
      assert.deepEqual(assessGeneratedTrainerSupportV1(args), result); contacts++;
    }
    assert.equal(JSON.stringify(document), source, 'authored source is never rewritten');
  }
  assert.equal(contacts, 23);
});

test('pre-execution incoming velocity uses the actual selected contact time, not a later bounce endpoint', () => {
  const incomingFlight = solveFlightV2({from: {x: 7, y: 38, heightFeet: 4}, target: {x: 7, y: 10}, family: 'lob', physics: {apexFeet: 12}});
  const time = incomingFlight.firstLandingTime / 2, contact = incomingFlight.sampleBoard(time), stance = {x: contact.x + .5, y: contact.y + .8};
  const outgoingFlight = solveFlightV2({from: contact, target: {x: 7, y: 14}, family: 'overhead', physics: {apexFeet: contact.heightFeet}});
  const args = {contact, stance, feet: [{x: stance.x - .42, y: stance.y}, {x: stance.x + .42, y: stance.y}], nearCourt: false,
    handedness: 'right', strokeSide: 'forehand', family: 'overhead', kind: 'volley', outgoingFlight};
  const result = assessGeneratedTrainerSupportV1({...args, incomingFlight, incomingTimeSeconds: time});
  assert.equal(result.supported, true);
  const dt = .0001, from = incomingFlight.sample(time - dt), to = incomingFlight.sample(time);
  closePoint(result.input.incomingVelocity, {x: (to.x - from.x) / dt, y: (to.y - from.y) / dt, z: (to.z - from.z) / dt}, 'selected incoming time');
  assert.ok(Math.abs(result.input.incomingVelocity.y - secant(incomingFlight, true).y) > 1);
  const mismatched = assessGeneratedTrainerSupportV1({...args, incomingFlight, incomingTimeSeconds: time + .1});
  assert.equal(mismatched.supported, false); assert.match(mismatched.reason, /incoming contact/);
});

test('a more favorable counterfactual hand cannot stand in for the selected physical hand', () => {
  const contact = {x: 7, y: 14, heightFeet: 1}, stance = {x: 4.5, y: 13};
  const args = {contact, stance, feet: [{x: 4.08, y: 13}, {x: 4.92, y: 13}], kind: 'volley', family: 'volley',
    strokeSide: 'forehand', nearCourt: true, outgoingFlight: solveFlightV2({from: contact, target: {x: 7, y: 30}, family: 'volley', physics: {apexFeet: 4}})};
  const right = assessGeneratedTrainerSupportV1({...args, handedness: 'right'}), left = assessGeneratedTrainerSupportV1({...args, handedness: 'left'});
  assert.equal(right.supported, true); assert.equal(right.feasible, false); assert.ok(right.reachError > .2);
  assert.equal(left.feasible, true); assert.equal(right.input.handedness, 'right'); assert.equal(left.input.handedness, 'left');
});

for (const near of [true, false]) for (const hand of ['left', 'right']) {
  test(`independent driver rejects necessary-envelope-safe but unsupported actual grounded pose (${near}/${hand})`, async () => {
    const document = overheadDocument({near, hand}), bytes = JSON.stringify(document), compiled = compileDocument(document);
    assert.equal(compiled.validShotCount, 1); assert.deepEqual(compiled.findings, []);
    assert.equal(validateRallyRules(compiled.play, compiled.timeline).valid, true);
    assert.equal(inspectGeneratedContactSupportV1(compiled.timeline).valid, true, 'the necessary envelope is not a complete pose proof');
    assert.equal(inspectGeneratedMovementV1(compiled.timeline, {maxAccelerationFeetPerSecondSquared: 30}).valid, true);
    assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
    const support = inspectGeneratedTrainerSupportV1({timeline: compiled.timeline, players: document.players});
    assert.equal(support.supported, true); assert.equal(support.valid, false);
    assert.equal(support.unsupportedContexts.length, 0); assert.equal(support.violations.length, 1);
    assert.ok(Math.abs(support.maximumReachErrorMetres - .0214617555187417) < 1e-10);
    const source = provisional(document), before = JSON.stringify(source); let attempts = 0;
    const result = await createEngineDriverV1(async () => { attempts++; return source; }, {yieldControl: async () => {}})({seed: 7, options: {maxShots: 1}});
    assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.code, 'unsupported-grounded-trainer-pose', JSON.stringify(result.diagnostics));
    assert.deepEqual(result.diagnostics.validation.trainerSupport, support);
    assert.equal(attempts, 1); assert.equal(result.document, null); assert.equal(result.outcome, null);
    assert.equal(JSON.stringify(source), before); assert.equal(JSON.stringify(document), bytes);
  });
}

test('unsupported context stays separate from a tested pose failure', () => {
  const document = overheadDocument({distance: .5}), timeline = compileDocument(document).timeline, args = contactArgs(timeline, document.players, 0);
  for (const changes of [{handedness: 'auto'}, {strokeSide: 'auto'}, {nearCourt: undefined}, {family: 'jump-smash'},
    {incomingFlight: args.outgoingFlight}, {outgoingFlight: null}, {stance: {...args.stance, heightFeet: 1}}]) {
    const result = assessGeneratedTrainerSupportV1({...args, ...changes});
    assert.equal(result.supported, false); assert.equal(result.feasible, null); assert.equal(result.code, 'unsupported-trainer-context');
  }
  const missingHand = inspectGeneratedTrainerSupportV1({timeline, players: {}});
  assert.equal(missingHand.valid, false); assert.equal(missingHand.supported, false);
  assert.equal(missingHand.violations.length, 0); assert.equal(missingHand.unsupportedContexts.length, 1);
  const segment = timeline.segments[0], actor = segment.shotSemantics.playerId, at = segment.startTime + segment.contactTime, from = args.stance;
  const moving = {...segment, model2Momentum: [{actor, contactTime: at, time: at + .1, from, to: {...from, x: from.x + .1},
    fromFeet: args.feet, feet: args.feet.map(foot => ({...foot, x: foot.x + .1}))}]};
  const momentum = inspectGeneratedTrainerSupportV1({timeline: {...timeline, segments: [moving]}, players: document.players});
  assert.equal(momentum.supported, false); assert.match(momentum.unsupportedContexts[0].reason, /moving momentum/);
  assert.throws(() => inspectGeneratedTrainerSupportV1({}), TypeError);
});

test('a supported real source receives an independent pose audit without producer metadata repair', async () => {
  const source = provisional(overheadDocument({distance: .5})), before = JSON.stringify(source);
  const result = await createEngineDriverV1(async () => source, {yieldControl: async () => {}})({seed: 7, options: {maxShots: 1}});
  assert.equal(result.status, 'censored', JSON.stringify(result.diagnostics));
  const expected = inspectGeneratedTrainerSupportV1({timeline: compileDocument(result.document).timeline, players: result.document.players});
  assert.deepEqual(result.diagnostics.validation.trainerSupport, expected);
  assert.equal(expected.valid, true); assert.equal(expected.checkedContacts, 1);
  assert.equal(JSON.stringify(source), before);
});
