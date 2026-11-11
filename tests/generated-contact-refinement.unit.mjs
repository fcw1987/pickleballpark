import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateRally, runNaturalAttemptV1 } from '../rally-engine.js';
import { createEngineDriverV1, ENGINE_DRIVER_LIMITS } from '../rally-engine-driver.js';
import { createRallyRandomV1 } from '../rally-random.js';
import { solveFlightV2 } from '../play-physics-v2.js';
import { resolveFlightParametersV1 } from '../rally-targets.js';
import { generationDistanceBudgetV1 } from '../generated-motion-limits.js';
import { GENERATED_DEFAULT_FOOT_STATE_V1 } from '../generated-foot-state.js';
import { groundedSoleClearsNVZV1 } from '../generated-grounded-sole.js';
import { assessGeneratedTrainerSupportV1 } from '../generated-trainer-support.js';
import { GENERATED_CONTACT_REFINEMENT_V1, generatedRetrievalProbeTargetsV1,
  refineGeneratedContactProposalsV1 } from '../generated-contact-refinement.js';

const players = style => Object.fromEntries([1, 2, 3, 4].map(number => ['player' + number, {
  team: number < 3 ? 'green' : 'orange', handedness: 'right', style, flavour: 'balanced',
}]));
const input = (seed, style = 'pro', court = 'left') => ({
  seed, players: players(style),
  service: { server: 'player3', receiver: 'player1', court, courtConvention: 'server-perspective-v1' },
  options: { lengthFeel: 'natural', winner: 'either', signatureShots: true, maxShots: 99 },
});

// The earlier 50587 case now succeeds before fallback. This real current input
// still needs bounded refinement and an emergency return on contact 26.
const refinementInput = () => input(51074, 'pro', 'right');

// A fixed incoming overhead and one coarse time, reduced from the 50587
// failure. No archive, historical JSONL, browser or mutable source is required.
function lowContactFixture(transform = 'none') {
  const point = value => ({
    ...value,
    x: transform === 'none' ? value.x : 20 - value.x,
    y: transform === 'rotate' ? 44 - value.y : value.y,
  });
  const records = players('pro');
  if (transform === 'reflect') for (const player of Object.values(records)) player.handedness = 'left';
  if (transform === 'rotate') for (const player of Object.values(records)) {
    player.team = player.team === 'green' ? 'orange' : 'green';
  }
  const origins = Object.fromEntries(Object.entries({
    player1: { x: 13.427896776, y: 5.146557039 },
    player2: { x: 5.87997096, y: 9 },
    player3: { x: 5.565695617, y: 29.938893325 },
    player4: { x: 15.565695617, y: 29.75 },
  }).map(([id, value]) => [id, point(value)]));
  const incoming = solveFlightV2({
    physicsVersion: 'play-physics-v2',
    from: point({ x: 12.562957711129862, y: 5.875858357610962, heightFeet: 7.499998991898224 }),
    target: point({ x: 11.62499764, y: 30.070004193 }),
    family: 'overhead', arc: 'low', pace: 'firm', quality: 'excellent',
    physics: { launchVerticalFeetPerSecond: -10.717940807 },
    endTimeSeconds: .4216212150152569, endpoint: 'bounce',
  });
  const time = .4456787280152569;
  return {
    input: { players: records }, incoming, origins, defaultFootState: GENERATED_DEFAULT_FOOT_STATE_V1,
    pairs: [{ id: 'player4', kind: 'groundstroke', contactStyle: 'backhand',
      contact: incoming.sampleBoard(time), time, availableSeconds: time }],
  };
}

test('contact refinement is finite, fail-closed at its input bound, and uses mirrored target regions', () => {
  const fixture = lowContactFixture();
  assert.throws(() => refineGeneratedContactProposalsV1({
    ...fixture, pairs: Array(GENERATED_CONTACT_REFINEMENT_V1.maximumInputPairs + 1).fill(fixture.pairs[0]),
  }), /finite proposal bound/);
  const empty = refineGeneratedContactProposalsV1({ ...fixture, pairs: [] });
  assert.deepEqual(empty.pairs, []);
  assert.equal(empty.work, 0);
  const near = generatedRetrievalProbeTargetsV1('green');
  const far = generatedRetrievalProbeTargetsV1('orange');
  assert.equal(near.length, 6);
  assert.deepEqual(near.map(target => ({ x: target.x, y: 44 - target.y })), far);
  assert.throws(() => generatedRetrievalProbeTargetsV1('unknown'), /actual court team/);
});

test('the real low-contact witness and its side/hand mirrors preserve actual feet, route and pose', () => {
  for (const transform of ['none', 'reflect', 'rotate']) {
    const fixture = lowContactFixture(transform), before = JSON.stringify(fixture);
    const result = refineGeneratedContactProposalsV1(fixture);
    assert.equal(JSON.stringify(fixture), before);
    assert(result.found > 0 && result.found <= GENERATED_CONTACT_REFINEMENT_V1.maximumResults);
    assert(result.seeds.length <= GENERATED_CONTACT_REFINEMENT_V1.maximumSeeds);
    assert(Number.isInteger(result.work) && result.work > 0 && result.work < ENGINE_DRIVER_LIMITS.maxWorkPerAttempt);
    for (const pair of result.pairs) {
      const player = fixture.input.players[pair.id], origin = fixture.origins[pair.id];
      assert.equal(pair.contactStyle, 'backhand');
      assert(Math.hypot(pair.feet.stance.x - origin.x, pair.feet.stance.y - origin.y)
        <= generationDistanceBudgetV1(pair.time) + 1e-7);
      assert(Math.hypot(pair.contact.x - pair.feet.stance.x, pair.contact.y - pair.feet.stance.y) <= 3);
      assert(Math.abs(pair.feet.feet[0].x - pair.feet.feet[1].x - 1.44) < 1e-10);
      assert(pair.feet.feet.every(groundedSoleClearsNVZV1));
      const reply = resolveFlightParametersV1({
        candidate: { family: 'drive', pace: 'firm', arc: 'medium', intent: 'drive' },
        contact: pair.contact, target: pair.refinementTarget, team: player.team, style: player.style,
        materialization: 'first',
      });
      const support = assessGeneratedTrainerSupportV1({
        contact: pair.contact, feet: pair.feet.feet, stance: pair.feet.stance,
        handedness: player.handedness, strokeSide: pair.contactStyle,
        family: 'drive', kind: pair.kind, outgoingFlight: reply.flight,
        incomingFlight: fixture.incoming, incomingTimeSeconds: pair.time, nearCourt: origin.y < 22,
      });
      assert(support.supported && support.feasible);
      assert.equal(support.input.handedness, transform === 'reflect' ? 'left' : 'right');
      const left = support.input.feet.left.x, right = support.input.feet.right.x;
      assert(origin.y < 22 ? left > right : left < right);
    }
  }
});

test('an ordinary three-contact opening never invokes fallback or emergency policy', async () => {
  const request = input(50000);
  request.options.maxShots = 3;
  const result = await simulateRally(request);
  assert.equal(result.status, 'censored');
  assert.equal(result.decisions.length, 3);
  assert.equal(result.diagnostics.producer?.angularRefinements, undefined);
  assert(result.decisions.every(decision => !decision.policyContext.emergencyRetrieval));
});

test('the three low-contact generation cases pass every independent physical gate', async () => {
  for (const request of [input(50587), input(50950, 'pro', 'right'), input(50491, 'intermediate')]) {
    const result = await simulateRally(request);
    assert.equal(result.status, 'complete');
    const audit = result.diagnostics.validation;
    assert(audit.contactSupport.valid && audit.movement.valid && audit.spacing.valid);
    assert(audit.groundedSoles.valid && audit.trainerSupport.valid);
    assert.equal(audit.generatedFlightFeasibility.status, 'PASS');
    assert(result.diagnostics.work <= ENGINE_DRIVER_LIMITS.maxWorkPerAttempt);
  }
});

test('emergency retrieval reports its fixed target honestly and consumes one execution pair per contact', async () => {
  const request = refinementInput(), refinements = [];
  let executionCalls = 0, snapshot;
  const simulate = createEngineDriverV1(async (normalized, context) => {
    const random = { ...context.random, execution: () => {
      executionCalls++;
      return context.random.execution();
    } };
    const result = await runNaturalAttemptV1(normalized, { ...context, random, checkpoint: update => {
      if (update.contactRefinement) refinements.push({ stage: update.contactRefinement, work: update.workDelta });
      return context.checkpoint(update);
    } });
    snapshot = context.random.snapshot();
    return result;
  });
  const result = await simulate(request);
  assert.equal(result.status, 'complete');
  assert.equal(executionCalls, result.decisions.length * 2);
  assert.equal(snapshot.draws.execution, executionCalls);
  assert.deepEqual(refinements.map(item => item.stage), ['before', 'after']);
  assert(refinements[1].work > 0 && refinements[1].work <= ENGINE_DRIVER_LIMITS.maxWorkPerAttempt);
  const expected = createRallyRandomV1(request.seed);
  for (const decision of result.decisions) assert.deepEqual(decision.draws.execution, {
    quality: expected.execution(), error: expected.execution(),
  });
  const emergency = result.decisions.find(decision => decision.policyContext.emergencyRetrieval);
  assert(emergency);
  const evidence = emergency.policyContext.emergencyRetrieval;
  assert.equal(evidence.trigger, 'ordinary-bounded-nominal-options-exhausted');
  assert.equal(emergency.situation.attackable, false);
  assert.equal(emergency.draws.target, null);
  assert.equal(emergency.resolution.nominalTargetSelection.targetDrawsUsed, false);
  const depth = emergency.situation.hittingTeam === 'green' ? 44 - evidence.target.y : evidence.target.y;
  assert(evidence.target.x >= evidence.targetRegion.minimumX && evidence.target.x <= evidence.targetRegion.maximumX);
  assert(depth >= evidence.targetRegion.minimumBaselineDepth && depth <= evidence.targetRegion.maximumBaselineDepth);
  const repeated = await simulateRally(request);
  assert.deepEqual(repeated.document, result.document);
  assert.deepEqual(repeated.decisions, result.decisions);
});

for (const stage of ['before', 'after']) {
  test('cancellation at the ' + stage + ' refinement guard propagates without execution or a winner', async () => {
    const controller = new AbortController(), observed = [];
    let snapshot;
    const simulate = createEngineDriverV1(async (normalized, context) => {
      try {
        return await runNaturalAttemptV1(normalized, { ...context, checkpoint: update => {
          if (update.contactRefinement) observed.push(update.contactRefinement);
          if (update.contactRefinement === stage) controller.abort();
          return context.checkpoint(update);
        } });
      } finally { snapshot = context.random.snapshot(); }
    });
    const result = await simulate({ ...refinementInput(), signal: controller.signal });
    assert.equal(result.status, 'cancelled');
    assert.deepEqual(observed, stage === 'before' ? ['before'] : ['before', 'after']);
    assert.equal(result.document, null);
    assert.equal(result.outcome, null);
    assert.equal(snapshot.draws.execution, result.decisions.length * 2);
  });

  test('work exhaustion at the ' + stage + ' refinement guard remains a bounded failure', async () => {
    const observed = [];
    let snapshot;
    const simulate = createEngineDriverV1(async (normalized, context) => {
      try {
        return await runNaturalAttemptV1(normalized, { ...context, checkpoint: update => {
          if (update.contactRefinement) observed.push(update.contactRefinement);
          return context.checkpoint(update.contactRefinement === stage
            ? { ...update, workDelta: ENGINE_DRIVER_LIMITS.maxWorkPerAttempt } : update);
        } });
      } finally { snapshot = context.random.snapshot(); }
    });
    const result = await simulate(refinementInput());
    assert.equal(result.status, 'failed');
    assert.equal(result.diagnostics.code, 'work-budget-exhausted');
    assert.deepEqual(observed, stage === 'before' ? ['before'] : ['before', 'after']);
    assert.equal(result.document, null);
    assert.equal(result.outcome, null);
    assert.equal(snapshot.draws.execution, result.decisions.length * 2);
  });
}
