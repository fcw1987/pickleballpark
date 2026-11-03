import test from 'node:test';
import assert from 'node:assert/strict';
import { probeSignatureCandidatesV1, SIGNATURE_LIMITS } from '../rally-signatures.js';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2 } from '../play-planning-v2.js';
import { solveFlightV2, interceptFlightV2, sampleFlightVelocityV2, PHYSICS_V2 } from '../play-physics-v2.js';
import { inspectBodyPathV2, inspectModel2SegmentV2, resolveModel2OutcomeCandidates } from '../play-outcome-v2.js';
import { sampleActorFeetV2 } from '../play-actors-v2.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { compileDocument } from '../play-compiler.js';
import { validateDocument } from '../play-document.js';
import { validateRallyRules } from '../rally-rules.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';
const clone = value => structuredClone(value);
const errors = result => result.findings.filter(item => item.severity === 'error');
const outsideNVZ = p => p.x < 0 || p.x > 20 || p.y < 15 || p.y > 29;

function feed(intent, { far = false, right = false, leftHanded = false, distant = false } = {}) {
  const mirror = p => ({ x: right ? 20 - p.x : p.x, y: far ? 44 - p.y : p.y });
  const receiver = far ? 'player3' : 'player1', hitter = far ? 'player1' : 'player3';
  const map = id => far ? ({ player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' })[id] : id;
  const layout = {
    player1: distant ? { x: 19, y: 0 } : { x: .5, y: 14.25 }, player2: { x: 15, y: 14.25 },
    player3: intent === 'erne' ? { x: 2, y: 32 } : { x: 7, y: 30 }, player4: { x: 15, y: 29.75 },
  };
  const initialLayout = Object.fromEntries(Object.entries(layout).map(([id, p]) => [map(id), mirror(p)]));
  initialLayout.ball = { ...initialLayout[hitter] };
  const target = mirror(intent === 'erne' ? { x: -1.5, y: 17 } : { x: .1, y: 20 });
  const first = model2Shot({ id: 'wide-feed', hitter, receiver: 'auto', family: 'dink', intent: 'cross-court-dink', target, physics: { apexFeet: 6 },
    contactEvidence: { feet: [{ x: initialLayout[hitter].x - .42, y: initialLayout[hitter].y }, { x: initialLayout[hitter].x + .42, y: initialLayout[hitter].y }], feetEstablishedOutsideNVZ: true } });
  const document = model2Document({ id: 'signature-feed', initialLayout, shots: [first] });
  if (leftHanded) document.players[receiver].handedness = 'left';
  const state = createPlanningStateV2({ ...document, ending: 'winner' });
  const trial = trialRecipeV2(state, first); assert.equal(trial.ok, true, trial.reason); commitPlanningTrialV2(state, trial);
  const footState = Object.fromEntries(Object.entries(initialLayout).filter(([id]) => id !== 'ball').map(([id, p]) => [id, {
    feet: [{ x: p.x - .42, y: p.y }, { x: p.x + .42, y: p.y }], grounded: true,
    feetEstablishedOutsideNVZ: outsideNVZ(p),
  }]));
  return { document, state, receiver, input: { incomingFlight: state.solved[0], pendingSegment: state.pendingSegment,
    pendingRecipe: state.pendingRecipe, players: document.players, positions: state.pendingSegment.previous.positions,
    footState, opening: 'midrally', contactIndex: 1, eligibleIds: [receiver] } };
}

for (const intent of ['erne', 'around-the-post']) for (const far of [false, true]) for (const right of [false, true]) for (const leftHanded of [false, true]) {
  test(`${intent} probes an actual ${far ? 'far' : 'near'} ${right ? 'right' : 'left'} path with a ${leftHanded ? 'left' : 'right'} hand and survives independent compilation`, () => {
    const { input, document, receiver } = feed(intent, { far, right, leftHanded });
    const source = JSON.stringify({ document, pending: input.pendingRecipe, footState: input.footState });
    const result = probeSignatureCandidatesV1(input), candidate = result.candidates.find(item => item.intent === intent);
    assert.ok(candidate, JSON.stringify(result)); assert.equal(candidate.playerId, receiver);
    assert.equal(candidate.route.peak.valid, true); assert.equal(candidate.route.spacing.valid, true);
    assert.ok(candidate.route.peak.maxPeakFeetPerSecond <= 18 + 1e-6);
    assert.ok(far ? candidate.contact.y - PHYSICS_V2.ballRadiusFeet >= 22 - 1e-7 : candidate.contact.y + PHYSICS_V2.ballRadiusFeet <= 22 + 1e-7);
    const intercept = interceptFlightV2(input.incomingFlight, { kind: candidate.kind, stance: candidate.feet.stance,
      contactOverride: candidate.contactOverride, ...(intent === 'around-the-post' ? { afterBounceSeconds: candidate.recipe.contactTiming.afterBounceSeconds } : {}) });
    assert.ok(Math.abs(intercept.time - candidate.time) < 1e-7);
    for (const axis of ['x', 'y', 'heightFeet']) assert.ok(Math.abs(intercept.point[axis] - candidate.contact[axis]) < 1e-6, `actual shared intercept ${axis}`);
    if (intent === 'erne') {
      assert.ok(candidate.contact.x < 0 || candidate.contact.x > 20); assert.ok(candidate.time < input.incomingFlight.firstLandingTime);
      assert.ok(candidate.feet.feet.every(outsideNVZ)); assert.equal(candidate.route.groundedResetVerified, true);
    } else {
      assert.ok(candidate.time > input.incomingFlight.firstLandingTime && candidate.time < input.incomingFlight.secondBounceTime);
      assert.ok(candidate.flight.events.some(event => event.type === 'net-crossing' && event.aroundPost));
    }
    const completed = { ...clone(document), shots: [candidate.pendingRecipe, { ...clone(candidate.recipe), id: 'signature-reply' }], ending: 'stop' };
    validateDocument(completed);
    const compiled = compileDocument(completed), rules = validateRallyRules(compiled.play, compiled.timeline);
    assert.equal(compiled.validShotCount, 2, JSON.stringify(compiled.findings)); assert.deepEqual(errors(compiled), []); assert.deepEqual(rules.violations, []);
    const segments = compiled.timeline.segments.filter(segment => segment.shotSemantics);
    for (const segment of segments) {
      assert.equal(inspectGeneratedMovementV1(segment).valid, true);
      assert.equal(inspectGeneratedSpacingV1(segment).valid, true);
      assert.deepEqual(inspectBodyPathV2(segment, segment.trajectory.solved, Object.keys(document.players)), [], 'the exact represented torso sweep has no earlier body contact');
      const inspected = inspectModel2SegmentV2(compiled.play, segment, { index: segment.rallyLeg - 1, terminal: false, solved: segment.trajectory.solved });
      assert.deepEqual(inspected.violations, []); assert.deepEqual(inspected.physicalCandidates, []); assert.deepEqual(inspected.momentumCandidates, []);
      const resolution = resolveModel2OutcomeCandidates(inspected.physicalCandidates, inspected.momentumCandidates);
      assert.equal(resolution.physical, null); assert.deepEqual(resolution.ordered, []);
    }
    if (intent === 'erne') assert.ok(sampleActorFeetV2(segments[0], receiver, segments[0].duration - 1e-4).every(outsideNVZ), 'both grounded feet clear the NVZ before contact');
    assert.equal(candidate.flightPlannerVersion, 'rally-flight-planner-v2');
    assert.equal(candidate.flightPlannerDiagnostics.solverCalls, candidate.flightPlannerDiagnostics.trials.length);
    assert.ok(candidate.flightPlannerDiagnostics.solverCalls <= SIGNATURE_LIMITS.maxSolverCallsPerTarget);
    assert.ok(result.work.launchTrials >= candidate.flightPlannerDiagnostics.solverCalls);
    assert.equal(candidate.flightEvidence.route, intent === 'erne' ? 'over-net' : 'around-the-post');
    assert.equal(candidate.flightEvidence.minimumSpeedMph, intent === 'erne' ? 0 : 22);
    assert.deepEqual(Object.keys(candidate.recipe.physics), ['launchVerticalFeetPerSecond']);
    assert.equal(typeof candidate.recipe.physics.launchVerticalFeetPerSecond, 'number');
    // Replay the actual JSON source independently, using its rounded contact
    // and saved vertical velocity; planner metadata cannot establish its speed.
    const sourceRecipe = JSON.parse(JSON.stringify(candidate.recipe));
    const sourceContact = Object.fromEntries(Object.entries(segments[1].shotSemantics.contact.point).map(([axis, value]) => [axis, Number(value.toFixed(9))]));
    const replay = solveFlightV2({ from: sourceContact, ...sourceRecipe });
    const velocity = sampleFlightVelocityV2(replay, 0);
    const speedMph = Math.hypot(velocity.xFeetPerSecond, velocity.yFeetPerSecond, velocity.heightFeetPerSecond) / (22 / 15);
    assert.ok(speedMph <= (intent === 'erne' ? 45 : 38));
    if (intent === 'around-the-post') assert.ok(speedMph >= 22);
    assert.equal(replay.obstruction, null);
    for (const fraction of [0, .25, .5, .75, 1]) for (const axis of ['x', 'y', 'heightFeet']) {
      assert.ok(Math.abs(replay.sampleBoard(replay.firstLandingTime * fraction)[axis] - candidate.flight.sampleBoard(candidate.flight.firstLandingTime * fraction)[axis]) < 1e-6, `replayed ${axis}`);
    }
    assert.ok(Math.abs(replay.firstLandingTime - candidate.flight.firstLandingTime) < 1e-6);
    assert.ok(replay.events.some(event => event.type === 'net-crossing' && Boolean(event.aroundPost) === (intent === 'around-the-post')));
    assert.equal(JSON.stringify({ document, pending: input.pendingRecipe, footState: input.footState }), source);
    assert.ok(result.work.contactTrials <= 2 * 13);
    assert.ok(result.work.targetTrials <= result.work.contactTrials * SIGNATURE_LIMITS.maxTargetTrials);
    assert.ok(result.work.launchTrials <= result.work.targetTrials * SIGNATURE_LIMITS.maxSolverCallsPerTarget);
    assert.ok(result.work.launchTrials > 0);
  });
}

test('signature candidates are deterministic across hands and do not install unavailable airborne/reset history', () => {
  for (const far of [false, true]) for (const leftHanded of [false, true]) {
    const { input } = feed('erne', { far, leftHanded });
    const a = probeSignatureCandidatesV1(input), b = probeSignatureCandidatesV1(input);
    assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.ok(a.candidates.some(candidate => candidate.intent === 'erne'));
    const airborne = { ...input, footState: clone(input.footState) }; airborne.footState[input.eligibleIds[0]].grounded = false;
    assert.equal(probeSignatureCandidatesV1(airborne).candidates.length, 0);
    const reset = { ...input, footState: clone(input.footState) }; reset.footState[input.eligibleIds[0]].feetEstablishedOutsideNVZ = false;
    assert.equal(probeSignatureCandidatesV1(reset).candidates.length, 0);
  }
});

test('signature requests preserve explicit player style and finite bounded failure evidence', () => {
  for (const style of ['pro', 'advanced', 'intermediate', 'beginner']) {
    const { input, receiver } = feed('around-the-post'); input.players[receiver].style = style;
    const result = probeSignatureCandidatesV1(input), candidate = result.candidates.find(item => item.intent === 'around-the-post');
    assert.ok(candidate, JSON.stringify(result));
    assert.equal(candidate.flightEvidence.speedCeilingMph, style === 'pro' ? 45 : 38);
    const velocity = sampleFlightVelocityV2(candidate.flight, 0);
    assert.ok(Math.hypot(velocity.xFeetPerSecond, velocity.yFeetPerSecond, velocity.heightFeetPerSecond) / (22 / 15) <= (style === 'pro' ? 45 : 38));
  }
  const { input, receiver } = feed('erne', { distant: true }), before = JSON.stringify(input.pendingRecipe);
  const result = probeSignatureCandidatesV1(input);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.exclusions.filter(item => item.playerId === receiver).map(item => [item.intent, item.code]), [
    ['erne', 'no-supported-contact-and-route'], ['around-the-post', 'no-supported-contact-and-route'],
  ]);
  assert.ok(Object.values(result.work).every(value => Number.isInteger(value) && value >= 0));
  assert.ok(result.work.contactTrials <= 13);
  assert.ok(result.work.targetTrials <= result.work.contactTrials * SIGNATURE_LIMITS.maxTargetTrials);
  assert.ok(result.work.launchTrials <= result.work.targetTrials * SIGNATURE_LIMITS.maxSolverCallsPerTarget);
  assert.equal(JSON.stringify(input.pendingRecipe), before); assert.equal('outcome' in result, false);
});

test('opening bounce restrictions and service identity cannot be bypassed by an Erne label', () => {
  const { input } = feed('erne');
  const opening = { ...input, opening: 'serve', contactIndex: 1, service: { server: 'player3', receiver: 'player2' } };
  assert.equal(probeSignatureCandidatesV1(opening).candidates.length, 0, 'the wrong receiving player cannot claim the contact');
  const designated = probeSignatureCandidatesV1({ ...opening, service: { server: 'player3', receiver: 'player1' } });
  assert.equal(designated.candidates.some(candidate => candidate.intent === 'erne'), false);
  assert.ok(designated.exclusions.some(item => item.code === 'opening-bounce-required'));
});

test('ordinary in-court paths, blocked flights, and an unreachable route do not become signature shots', () => {
  const { input } = feed('erne');
  const blocked = { ...input, incomingFlight: { ...input.incomingFlight, obstruction: { kind: 'net' } } };
  assert.equal(probeSignatureCandidatesV1(blocked).candidates.length, 0);
  const distant = feed('erne', { distant: true }); assert.equal(probeSignatureCandidatesV1(distant.input).candidates.length, 0);
  const plain = feed('around-the-post');
  plain.document.shots[0].target = { x: 7, y: 20 };
  const state = createPlanningStateV2({ ...plain.document, ending: 'winner' }); commitPlanningTrialV2(state, trialRecipeV2(state, plain.document.shots[0]));
  assert.equal(probeSignatureCandidatesV1({ ...plain.input, incomingFlight: state.solved[0], pendingSegment: state.pendingSegment, pendingRecipe: state.pendingRecipe }).candidates.length, 0);
});

test('a bounced out ball and a ball still inside the post cannot be rescued by an ATP label', () => {
  const { input } = feed('erne');
  const out = probeSignatureCandidatesV1(input);
  assert.equal(out.candidates.some(candidate => candidate.intent === 'around-the-post'), false, 'its first landing is out before any bounced response');
  const { document, input: original } = feed('around-the-post');
  document.shots[0].target = { x: .7, y: 19 };
  const state = createPlanningStateV2({ ...document, ending: 'winner' }); commitPlanningTrialV2(state, trialRecipeV2(state, document.shots[0]));
  const result = probeSignatureCandidatesV1({ ...original, incomingFlight: state.solved[0], pendingSegment: state.pendingSegment, pendingRecipe: state.pendingRecipe });
  for (const candidate of result.candidates.filter(item => item.intent === 'around-the-post')) {
    assert.ok(candidate.contact.x < -1.25 - PHYSICS_V2.ballRadiusFeet || candidate.contact.x > 21.25 + PHYSICS_V2.ballRadiusFeet);
    assert.ok(candidate.flight.events.some(event => event.type === 'net-crossing' && event.aroundPost));
  }
});

test('M1 signature fixtures retain their original supported geometry, with negative counterparts rejected', () => {
  for (const id of ['erne', 'around-the-post']) {
    const original = readModel2Fixture(id), before = JSON.stringify(original), positive = compileDocument(original);
    assert.deepEqual(errors(positive), []);
    const negative = clone(original);
    if (id === 'erne') negative.shots[0].contactEvidence.feet[1].x = .1;
    else negative.shots[0].target.x = 5;
    assert.ok(errors(compileDocument(negative)).length > 0);
    assert.equal(JSON.stringify(original), before);
  }
});

test('disabled, mismatched and malformed probe inputs never install a guessed candidate', () => {
  assert.deepEqual(probeSignatureCandidatesV1({ signatureShots: false }).candidates, []);
  const { input } = feed('erne');
  const mismatched = solveFlightV2({ from: { x: 7, y: 32, heightFeet: 2.2 }, target: { x: 7, y: 17 }, family: 'dink', physics: { apexFeet: 6 } });
  assert.throws(() => probeSignatureCandidatesV1({ ...input, incomingFlight: mismatched }), /belong/);
  assert.throws(() => probeSignatureCandidatesV1({ ...input, eligibleIds: ['player1', 'player1'] }), /unique/);
  assert.equal('outcome' in probeSignatureCandidatesV1(input), false);
});

test('matching endpoints do not permit substituting a different incoming arc or pending source', () => {
  const { input } = feed('erne');
  const differentArc = solveFlightV2({ from: input.incomingFlight.from, target: input.incomingFlight.target, family: 'dink', physics: { apexFeet: 7 } });
  assert.throws(() => probeSignatureCandidatesV1({ ...input, incomingFlight: differentArc }), /arc|samples/);
  const changedSource = clone(input.pendingRecipe); changedSource.target.x += 1;
  assert.throws(() => probeSignatureCandidatesV1({ ...input, pendingRecipe: changedSource }), /only pending movement/);
});
