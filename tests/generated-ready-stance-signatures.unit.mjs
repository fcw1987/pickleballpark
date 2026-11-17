import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_DEFAULT_FOOT_STATE_V1, defaultFeetAtV1 } from '../generated-foot-state.js';
import { probeSignatureCandidatesV1 } from '../rally-signatures.js';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2 } from '../play-planning-v2.js';
import { sampleActorFeetV2, sampleActorBoardPositionV2 } from '../play-actors-v2.js';
import { sampleFeetStateV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { compileDocument } from '../play-compiler.js';
import { validateDocument } from '../play-document.js';
import { validateRallyRules } from '../rally-rules.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

const marker = GENERATED_DEFAULT_FOOT_STATE_V1;
const ids = ['player1', 'player2', 'player3', 'player4'];
const outsideNVZ = p => p.x < 0 || p.x > 20 || p.y < 15 || p.y > 29;
const near = (actual, expected) => assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-8);

// Same represented wide feed as the historical signature matrix, explicitly
// opting in to the new source contract rather than changing that old fixture.
function readyFeed(intent, { far, right, leftHanded }) {
  const mirror = p => ({ x: right ? 20 - p.x : p.x, y: far ? 44 - p.y : p.y });
  const receiver = far ? 'player3' : 'player1', hitter = far ? 'player1' : 'player3';
  const map = id => far ? ({ player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' })[id] : id;
  const layout = {
    player1: { x: .5, y: 14.25 }, player2: { x: 15, y: 14.25 },
    player3: intent === 'erne' ? { x: 2, y: 32 } : { x: 7, y: 30 }, player4: { x: 15, y: 29.75 },
  };
  const initialLayout = Object.fromEntries(Object.entries(layout).map(([id, p]) => [map(id), mirror(p)]));
  initialLayout.ball = { ...initialLayout[hitter] };
  const first = model2Shot({ id: 'wide-ready-feed', hitter, receiver: 'auto', family: 'dink', intent: 'cross-court-dink',
    target: mirror(intent === 'erne' ? { x: -1.5, y: 17 } : { x: .1, y: 20 }), physics: { apexFeet: 6 },
    contactEvidence: { feet: defaultFeetAtV1(initialLayout[hitter], marker), feetEstablishedOutsideNVZ: true } });
  const document = model2Document({ id: 'ready-signature-feed', initialLayout, shots: [first], defaultFootState: structuredClone(marker) });
  if (leftHanded) document.players[receiver].handedness = 'left';
  const state = createPlanningStateV2({ ...document, ending: 'winner' }), trial = trialRecipeV2(state, first);
  assert.equal(trial.ok, true, trial.reason); commitPlanningTrialV2(state, trial);
  return { document, receiver, input: { incomingFlight: state.solved[0], pendingSegment: state.pendingSegment,
    pendingRecipe: state.pendingRecipe, players: document.players, positions: state.pendingSegment.previous.positions,
    footState: sampleFeetStateV1(state.pendingSegment, 0), opening: 'midrally', contactIndex: 1, eligibleIds: [receiver] } };
}

for (const intent of ['erne', 'around-the-post']) for (const far of [false, true]) for (const right of [false, true]) for (const leftHanded of [false, true]) {
  test(`opted-in ${intent} retains continuous ready-width feet (${far ? 'far' : 'near'}, ${right ? 'right' : 'left'} sideline, ${leftHanded ? 'left' : 'right'} hand)`, () => {
    const { document, receiver, input } = readyFeed(intent, { far, right, leftHanded });
    const before = JSON.stringify({ document, pending: input.pendingRecipe, footState: input.footState });
    const result = probeSignatureCandidatesV1(input), candidate = result.candidates.find(item => item.intent === intent);
    assert.ok(candidate, JSON.stringify(result)); assert.equal(candidate.playerId, receiver);
    assert.ok(Math.abs(Math.abs(candidate.feet.feet[0].x - candidate.feet.feet[1].x) - 1.44) < 1e-9);
    assert.equal(candidate.route.peak.valid, true); assert.equal(candidate.route.spacing.valid, true);
    assert.equal(candidate.route.peak.boundFeetPerSecond, 18);
    assert.equal(candidate.route.peak.boundAccelerationFeetPerSecondSquared, 30);
    if (intent === 'erne') assert.ok(candidate.feet.feet.every(outsideNVZ));
    else assert.ok(candidate.flight.events.some(event => event.type === 'net-crossing' && event.aroundPost));

    const completed = { ...structuredClone(document), shots: [candidate.pendingRecipe,
      { ...structuredClone(candidate.recipe), id: 'ready-signature-reply' }], ending: 'stop' };
    const source = JSON.stringify(completed); validateDocument(completed);
    const compiled = compileDocument(completed);
    assert.equal(compiled.validShotCount, 2, JSON.stringify(compiled.findings));
    assert.deepEqual(compiled.findings.filter(finding => finding.severity === 'error'), []);
    assert.equal(validateRallyRules(compiled.play, compiled.timeline).valid, true);
    const movement = inspectGeneratedMovementV1(compiled.timeline, { maxAccelerationFeetPerSecondSquared: 30 });
    assert.equal(movement.valid, true, JSON.stringify(movement));
    assert.equal(movement.boundFeetPerSecond, 18); assert.equal(movement.boundAccelerationFeetPerSecondSquared, 30);
    assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);

    let previous = null;
    for (const segment of compiled.timeline.segments) {
      assert.deepEqual(segment.defaultFootState, marker);
      for (const actor of ids) {
        for (const time of [0, segment.contactTime, segment.duration / 4, segment.duration / 2, segment.duration]) {
          const feet = sampleActorFeetV2(segment, actor, time), root = sampleActorBoardPositionV2(segment, actor, time);
          assert.ok(Math.abs(Math.hypot(feet[1].x - feet[0].x, feet[1].y - feet[0].y) - 1.44) < 1e-8);
          near({ x: (feet[0].x + feet[1].x) / 2, y: (feet[0].y + feet[1].y) / 2 }, root);
        }
        if (previous) {
          near(sampleActorBoardPositionV2(previous, actor, previous.duration), sampleActorBoardPositionV2(segment, actor, 0));
          const beforeFeet = sampleActorFeetV2(previous, actor, previous.duration).toSorted((a, b) => a.x - b.x);
          sampleActorFeetV2(segment, actor, 0).toSorted((a, b) => a.x - b.x).forEach((foot, index) => near(foot, beforeFeet[index]));
        }
      }
      previous = segment;
    }
    assert.equal(JSON.stringify(completed), source);
    assert.equal(JSON.stringify({ document, pending: input.pendingRecipe, footState: input.footState }), before);
  });
}
