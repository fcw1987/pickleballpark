import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_DEFAULT_FOOT_STATE_V1, validateDefaultFootStateV1, defaultFootHalfWidthFeetV1, defaultFeetAtV1 } from '../generated-foot-state.js';
import { createStarterDocument, validateDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { sampleActorBoardPositionV2, sampleActorFeetV2 } from '../play-actors-v2.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { compilePlayTimeline } from '../three-d-core.js';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2, replacePendingMovementV2, inspectPendingLegV2, finishPlanningV2,
  createGenerationPlanningSessionV2, observeGenerationPlanningSessionV2, probeGenerationIncomingV2, probeGenerationReplyV2,
  commitGenerationRecipeV2, replaceGenerationPendingMovementV2, inspectGenerationPendingLegV2, finishGenerationPlanningV2 } from '../play-planning-v2.js';
import { MODEL2_CASES, readModel2Fixture } from './fixtures/model2/cases.mjs';

const marker = GENERATED_DEFAULT_FOOT_STATE_V1;
const clone = structuredClone, json = JSON.stringify;
const ids = ['player1', 'player2', 'player3', 'player4'];
const sortFeet = feet => feet.toSorted((a, b) => a.x - b.x || a.y - b.y);
const near = (a, b) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-9, `${json(a)} != ${json(b)}`);
const representedMarker = segment => assert.deepEqual(segment.defaultFootState, marker);

test('the explicit generated ready-stance contract is fixed, inert and optional', () => {
  assert.deepEqual(marker, { version: 'generated-ready-stance-v1' });
  assert.ok(Object.isFrozen(marker));
  assert.equal(validateDefaultFootStateV1(undefined), undefined);
  assert.equal(validateDefaultFootStateV1(marker), marker);
  assert.equal(defaultFootHalfWidthFeetV1(undefined), .42);
  assert.equal(defaultFootHalfWidthFeetV1(marker), .72);
  assert.ok(Math.abs(2 * defaultFootHalfWidthFeetV1(marker) * .3048 - .438912) < 1e-12);
  const position = { x: 10, y: 14.25 }, before = json(position);
  assert.deepEqual(defaultFeetAtV1(position, marker), [{ x: 9.28, y: 14.25 }, { x: 10.72, y: 14.25 }]);
  assert.deepEqual(defaultFeetAtV1(position), [{ x: 9.58, y: 14.25 }, { x: 10.42, y: 14.25 }]);
  assert.equal(json(position), before);
  let getterReads = 0;
  const accessor = Object.defineProperty({}, 'version', { enumerable: true, get() { getterReads++; return marker.version; } });
  const hidden = Object.defineProperty({}, 'version', { value: marker.version });
  for (const value of [null, false, [], 'generated-ready-stance-v1', {}, { version: 'unknown' },
    { ...marker, halfWidthFeet: .72 }, Object.assign(Object.create({ inherited: true }), marker),
    { ...marker, [Symbol('hidden')]: true }, accessor, hidden]) {
    assert.throws(() => validateDefaultFootStateV1(value), /defaultFootState/);
    assert.throws(() => defaultFootHalfWidthFeetV1(value), /defaultFootState/);
  }
  assert.equal(getterReads, 0, 'metadata validation must not run an accessor');
});

test('document validation accepts only an explicit supported model-2 foot-state contract', () => {
  const source = readModel2Fixture('transition-volley'); source.defaultFootState = clone(marker);
  const before = json(source); assert.equal(validateDocument(source), source); assert.equal(json(source), before);
  for (const value of [null, undefined, {}, { version: 'generated-ready-stance-v2' }, { ...marker, halfWidthFeet: .72 }]) {
    assert.throws(() => validateDocument({ ...source, defaultFootState: value }), /defaultFootState/);
  }
  assert.throws(() => validateDocument({ ...createStarterDocument(), defaultFootState: marker }), /requires model 2/);
  let getterReads = 0;
  const accessor = Object.defineProperty({ ...source }, 'defaultFootState', { enumerable: true,
    get() { getterReads++; return marker; } });
  assert.throws(() => validateDocument(accessor), /inert JSON/);
  const nested = { ...source, defaultFootState: Object.defineProperty({}, 'version', { enumerable: true,
    get() { getterReads++; return marker.version; } }) };
  assert.throws(() => validateDocument(nested), /defaultFootState/);
  assert.equal(getterReads, 0);
  assert.throws(() => createPlanningStateV2({ ...source, defaultFootState: { version: 'unknown' } }), /defaultFootState/);
  const compiled = compileDocument(source);
  assert.throws(() => compilePlayTimeline({ ...compiled.play, defaultFootState: { version: 'unknown' } }), /defaultFootState/);
});

function routes(defaultFootState = marker) {
  const segments = [], hitters = ['player1', 'player3', 'player2', 'player4'];
  let positions = Object.fromEntries(ids.map((id, i) => [id, { x: i % 2 ? 15 : 5, y: i < 2 ? 14 : 30 }]));
  for (let index = 0; index < hitters.length; index++) {
    const next = Object.fromEntries(ids.map(id => [id, { x: positions[id].x + .8, y: positions[id].y }]));
    const hitter = hitters[index], nextHitter = hitters[index + 1];
    const segment = { modelVersion: 2, index: index + 1, startTime: index * 2, endTime: index * 2 + 2,
      duration: 2, originalDuration: 2, contactTime: index ? 0 : .3,
      previous: { positions: clone(positions) }, step: { id: `stance-${index}`, positions: next },
      shotSemantics: { playerId: hitter, contact: { feet: defaultFeetAtV1(positions[hitter], marker) } },
      nextShotSemantics: nextHitter ? { playerId: nextHitter, contact: { feet: defaultFeetAtV1(next[nextHitter], marker) } } : null,
      model2Momentum: [], ...(defaultFootState !== undefined ? { defaultFootState } : {}) };
    segments.push(segment); positions = next;
  }
  return { segments, duration: segments.at(-1).endTime };
}

test('all four generated roots and both foot tracks stay continuous through hitter, next-hitter and off-ball roles', () => {
  const timeline = routes(), before = json(timeline);
  for (let index = 0; index < timeline.segments.length; index++) {
    const segment = timeline.segments[index], previous = timeline.segments[index - 1];
    for (const actor of ids) {
      for (const time of [0, segment.contactTime, .5, 1, 1.5, segment.duration]) {
        const feet = sortFeet(sampleActorFeetV2(segment, actor, time)), at = sampleActorBoardPositionV2(segment, actor, time);
        assert.ok(Math.abs(feet[1].x - feet[0].x - 1.44) < 1e-9);
        near({ x: (feet[0].x + feet[1].x) / 2, y: (feet[0].y + feet[1].y) / 2 }, at);
      }
      if (previous) {
        near(sampleActorBoardPositionV2(previous, actor, previous.duration), sampleActorBoardPositionV2(segment, actor, 0));
        const priorFeet = sortFeet(sampleActorFeetV2(previous, actor, previous.duration));
        sortFeet(sampleActorFeetV2(segment, actor, 0)).forEach((foot, footIndex) => near(foot, priorFeet[footIndex]));
      }
    }
  }
  const result = inspectGeneratedMovementV1(timeline, { maxAccelerationFeetPerSecondSquared: 30 });
  assert.equal(result.valid, true, json(result)); assert.equal(result.boundFeetPerSecond, 18);
  assert.equal(result.boundAccelerationFeetPerSecondSquared, 30); assert.equal(inspectGeneratedSpacingV1(timeline).valid, true);
  assert.equal(json(timeline), before);
  const lost = clone(timeline); delete lost.segments[1].defaultFootState;
  const rejected = inspectGeneratedMovementV1(lost, { maxAccelerationFeetPerSecondSquared: 30 });
  assert.equal(rejected.valid, false); assert.match(rejected.reason, /jumps/);
});

test('explicit narrow, staggered and momentum feet remain authoritative under the new default', () => {
  const segment = routes().segments[0];
  segment.shotSemantics.contact.feet = [{ x: 5.12, y: 14.1 }, { x: 4.88, y: 13.9 }];
  segment.nextShotSemantics.contact.feet = [{ x: 5.7, y: 30.3 }, { x: 5.9, y: 29.7 }];
  segment.model2Momentum = [{ actor: 'player2', contactTime: .4, time: 1.2,
    from: { x: 15, y: 14 }, to: { x: 15.2, y: 14.3 },
    fromFeet: [{ x: 14.8, y: 13.9 }, { x: 15.2, y: 14.1 }],
    feet: [{ x: 15.1, y: 14.4 }, { x: 15.3, y: 14.2 }] }];
  const old = clone(segment); delete old.defaultFootState;
  const before = json(segment);
  for (const actor of ['player1', 'player3']) for (const time of [0, .3, .6, 1.2, 2]) {
    assert.deepEqual(sampleActorFeetV2(segment, actor, time), sampleActorFeetV2(old, actor, time));
    assert.deepEqual(sampleActorBoardPositionV2(segment, actor, time), sampleActorBoardPositionV2(old, actor, time));
  }
  for (const time of [.4, .8, 1.2, 2]) assert.deepEqual(sampleActorFeetV2(segment, 'player2', time), sampleActorFeetV2(old, 'player2', time));
  assert.equal(json(segment), before);
  const authored = readModel2Fixture('transition-volley'); authored.defaultFootState = clone(marker);
  authored.shots[0].contactEvidence = { feet: [{ x: 6.9, y: 7.8 }, { x: 7.1, y: 8.2 }], feetEstablishedOutsideNVZ: true };
  const bytes = json(authored), compiled = compileDocument(authored);
  assert.deepEqual(compiled.timeline.segments[0].shotSemantics.contact.feet, authored.shots[0].contactEvidence.feet);
  assert.equal(json(authored), bytes, 'compilation must not rewrite an explicit authored stance');
});

test('public, optimized and batch planning preserve the same explicit default across every tail path', () => {
  const source = readModel2Fixture('transition-volley'); source.defaultFootState = clone(marker);
  const before = json(source), state = createPlanningStateV2(source), session = createGenerationPlanningSessionV2(source);
  assert.notEqual(state.document.defaultFootState, source.defaultFootState);
  assert.notEqual(state.play.defaultFootState, source.defaultFootState);
  for (const [index, recipe] of source.shots.entries()) {
    const trial = trialRecipeV2(state, recipe), incoming = probeGenerationIncomingV2(session, recipe);
    const reply = probeGenerationReplyV2(session, recipe, { incoming: incoming.handle, actors: ids, record: true });
    assert.equal(trial.ok, true, json(trial.findings)); assert.equal(incoming.ok, true); assert.equal(reply.ok, true);
    assert.deepEqual(reply.nominal.actorRoute.defaultFootState, marker);
    representedMarker(trial.pendingSegment);
    if (trial.resolvedPrevious) representedMarker(trial.resolvedPrevious);
    commitPlanningTrialV2(state, trial);
    assert.equal(commitGenerationRecipeV2(session, recipe, { incoming: incoming.handle }).committed, true);
    representedMarker(observeGenerationPlanningSessionV2(session).pendingSegment);
    assert.deepEqual(observeGenerationPlanningSessionV2(session).play.defaultFootState, marker);
    representedMarker(inspectPendingLegV2(state, { terminal: false }).segment);
    representedMarker(inspectGenerationPendingLegV2(session, { terminal: false }).segment);
    replacePendingMovementV2(state, recipe);
    replaceGenerationPendingMovementV2(session, recipe);
    representedMarker(state.pendingSegment); representedMarker(observeGenerationPlanningSessionV2(session).pendingSegment);
    if (index) assert.deepEqual(incoming.footState, Object.fromEntries(ids.map(actor => {
      const feet = sampleActorFeetV2(state.finalizedSegments.at(-1), actor, state.finalizedSegments.at(-1).duration);
      return [actor, { feet, grounded: true, feetEstablishedOutsideNVZ: feet.every(foot => foot.x < 0 || foot.x > 20 || foot.y < 15 || foot.y > 29) }];
    })));
  }
  const batch = compileDocument(source);
  const ordinary = finishPlanningV2(state, { ending: source.ending, compileTimeline: true });
  const optimized = finishGenerationPlanningV2(session, { ending: source.ending, compileTimeline: true });
  assert.equal(json(ordinary.play), json(batch.play)); assert.equal(json(optimized.play), json(batch.play));
  assert.equal(json(ordinary.timeline), json(batch.timeline)); assert.equal(json(optimized.timeline), json(batch.timeline));
  for (const segment of [...ordinary.rawSegments, ...optimized.rawSegments, ...batch.timeline.segments]) representedMarker(segment);
  assert.equal(json(source), before);
});

for (const { id } of MODEL2_CASES) test(`absent foot-state metadata stays absent and preserves historical source: ${id}`, () => {
  const source = readModel2Fixture(id), before = json(source), compiled = compileDocument(source), state = createPlanningStateV2(source);
  for (const value of [source, state.document, state.play, compiled.play, ...compiled.timeline.segments]) assert.equal(Object.hasOwn(value, 'defaultFootState'), false);
  for (const segment of compiled.timeline.segments) {
    const actor = ids.find(id => id !== segment.shotSemantics.playerId && id !== segment.nextShotSemantics?.playerId
      && !(segment.model2Momentum || []).some(item => item.actor === id));
    if (!actor) continue;
    const at = sampleActorBoardPositionV2(segment, actor, 0), feet = sortFeet(sampleActorFeetV2(segment, actor, 0));
    near(feet[0], { x: at.x - .42, y: at.y }); near(feet[1], { x: at.x + .42, y: at.y });
  }
  assert.equal(json(source), before);
});
