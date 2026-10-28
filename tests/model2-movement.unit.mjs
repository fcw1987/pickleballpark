import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDocument } from '../play-compiler.js';
import { inspectActorMovementV2, MOVEMENT_V2, sampleActorBoardPositionV2 } from '../play-actors-v2.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';

const manual = target => ({ intent: 'manual', target, pinned: false });
const errors = result => result.findings.filter(item => item.severity === 'error');
const movementErrors = result => errors(result).filter(item => item.kind === 'feasibility' && /sampled route|movement allowance/.test(item.message));

test('a terminal net leg rejects the reproduced 48-foot manual route and preserves its source', () => {
  const document = readModel2Fixture('net');
  document.shots[0].playerMovement = { player4: manual({ x: 28, y: -8 }) };
  const source = JSON.stringify(document), result = compileDocument(document), segment = result.timeline.segments[0];
  const actual = sampleActorBoardPositionV2(segment, 'player4', segment.duration);
  assert.deepEqual(actual, { x: 28, y: -8 });
  assert.ok(Math.hypot(actual.x - 18, actual.y - 39) > 48);
  assert.ok(segment.duration < .865);
  assert.equal(result.validShotCount, 0);
  assert.equal(movementErrors(result).length, 1);
  assert.equal(JSON.stringify(document), source);
});

test('an incomplete stop leg is subject to the same actual movement bound', () => {
  const document = readModel2Fixture('erne');
  assert.equal(document.ending, 'stop');
  document.shots[0].playerMovement = { player4: manual({ x: 28, y: -8 }) };
  const result = compileDocument(document);
  assert.equal(result.validShotCount, 0);
  assert.equal(movementErrors(result).length, 1);
  assert.equal(errors(result).length, 1, 'the failure is movement rather than a fabricated terminal outcome');
});

test('a brief post-contact release cannot borrow the whole leg duration', () => {
  const document = readModel2Fixture('net');
  document.shots[0].movement = manual({ x: 16.5, y: 14 });
  const result = compileDocument(document), segment = result.timeline.segments[0];
  const wholeLegBudget = MOVEMENT_V2.speedFeetPerSecond * segment.duration + MOVEMENT_V2.toleranceFeet;
  assert.ok(9.5 < wholeLegBudget, 'an endpoint-only whole-leg check would accept this route');
  const audit = inspectActorMovementV2(result.timeline, 'player1');
  assert.equal(audit.valid, false);
  assert.ok(audit.fromTime > segment.contactTime + .12, 'violation is within the real release route');
  assert.ok(audit.toTime < segment.duration);
  assert.ok(audit.distanceFeet > audit.allowedFeet);
  assert.equal(result.validShotCount, 0);
  assert.equal(movementErrors(result).length, 1);
});

test('a short global momentum interval cannot teleport the player after the volley', () => {
  const document = readModel2Fixture('nvz-momentum-after-dead');
  const momentum = document.shots[0].contactEvidence.momentum;
  momentum.afterContactSeconds = .04;
  momentum.feet = [{ x: 16.58, y: 15 }, { x: 17.42, y: 15 }];
  document.outcome.evidence = { position: { x: 16.58, y: 15, heightFeet: 0 }, afterContactSeconds: .04 };
  const result = compileDocument(document), audit = inspectActorMovementV2(result.timeline, 'player1');
  assert.equal(audit.valid, false);
  assert.ok(audit.toTime - audit.fromTime <= .04 + 1e-9);
  assert.ok(audit.distanceFeet > 10);
  assert.equal(result.validShotCount, 0);
  assert.equal(movementErrors(result).length, 1);
});

test('an early terminal event validates the partial sampled route, not its unreached destination', () => {
  const document = readModel2Fixture('body');
  document.initialLayout.player3 = { x: 7, y: 18 };
  document.shots[0].playerMovement = { player4: manual({ x: 28, y: -8 }) };
  document.outcome.evidence = {
    position: { x: 7, y: 17.2786089238846, heightFeet: 4.0461463907361805 },
    afterContactSeconds: .13751556943769383,
  };
  const result = compileDocument(document), segment = result.timeline.segments[0];
  assert.deepEqual(errors(result), []);
  assert.equal(result.validShotCount, 1);
  assert.ok(segment.duration < segment.originalDuration);
  const actual = sampleActorBoardPositionV2(segment, 'player4', segment.duration);
  assert.ok(actual.y > 32, 'the intended -8ft destination is never reached');
  assert.ok(Math.hypot(28 - 18, -8 - 39) > MOVEMENT_V2.speedFeetPerSecond * segment.duration + MOVEMENT_V2.toleranceFeet);
  assert.equal(inspectActorMovementV2(result.timeline, 'player4').valid, true);
});

test('a feasible final-leg move remains accepted', () => {
  const document = readModel2Fixture('net');
  document.shots[0].playerMovement = { player4: manual({ x: 20, y: 38 }) };
  const result = compileDocument(document);
  assert.deepEqual(errors(result), []);
  assert.equal(result.validShotCount, 1);
  assert.equal(inspectActorMovementV2(result.timeline, 'player4').valid, true);
});

test('movement tolerance is not granted again at a segment boundary', () => {
  const makeSegment = (start, from, to, id) => ({
    modelVersion: 2, startTime: start, duration: .005, originalDuration: .005, contactTime: 0,
    previous: { positions: { player4: { x: from, y: 0 } } },
    step: { id, positions: { player4: { x: to, y: 0 } } }, model2Momentum: [],
  });
  const first = makeSegment(0, 0, 2.5, 'first');
  const second = makeSegment(.005, 2.5, 5, 'second');
  assert.equal(inspectActorMovementV2({ duration: .005, segments: [first] }, 'player4').valid, true);
  const audit = inspectActorMovementV2({ duration: .01, segments: [first, second] }, 'player4');
  assert.equal(audit.valid, false);
  assert.equal(audit.stepId, 'second');
  assert.ok(audit.distanceFeet > audit.allowedFeet);
});
