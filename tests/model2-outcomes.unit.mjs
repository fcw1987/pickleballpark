import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDocument } from '../play-compiler.js';
import { validateDocument } from '../play-document.js';
import { compilePlayTimeline, samplePlayBall, samplePlayState, worldToBoard, FEET_TO_METERS } from '../three-d-core.js';
import { sampleActorWorldPosition } from '../three-d-presentation.js';
import { sampleActorBoardPositionV2, sampleActorFeetV2 } from '../play-actors-v2.js';
import { localNetHeightFeet, PHYSICS_V2 } from '../play-physics-v2.js';
import { validateRallyRules } from '../rally-rules.js';
import { compileEffectiveCandidate } from '../rally-proposals.js';
import { MODEL2_CASES, readModel2Fixture } from './fixtures/model2/cases.mjs';
import { model2ScenarioDrafts } from './fixtures/model2/scenarios.mjs';

const errorFindings = result => result.findings.filter(item => item.severity === 'error');
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clone = value => structuredClone(value);

for (const { id, reason } of MODEL2_CASES) {
  test(`model2 ${id} retains every contact and complete physical playback without unexpected violations`, () => {
    const document = readModel2Fixture(id), bytes = JSON.stringify(document);
    validateDocument(document);
    const result = compileDocument(document), { timeline } = result;
    const rules = validateRallyRules(result.play, timeline);
    assert.equal(result.validShotCount, document.shots.length, JSON.stringify(result.findings));
    assert.deepEqual(errorFindings(result), []);
    assert.deepEqual(rules.violations, []);
    assert.equal(result.play.modelVersion, 2);
    assert.equal(result.play.physicsVersion, 'play-physics-v2');
    assert.equal(timeline.events.filter(event => event.type === 'contact').length, document.shots.length);
    assert.equal(new Set(timeline.events.map(event => event.id)).size, timeline.events.length);
    assert.ok(timeline.events.every((event, index) => ['x', 'y', 'z'].every(axis => Number.isFinite(event.position[axis])) && Number.isFinite(event.time)
      && (!index || event.time >= timeline.events[index - 1].time)));
    if (reason) {
      assert.equal(rules.outcome.reason, reason);
      assert.equal(rules.outcome.winner, document.outcome.winner);
      assert.equal(rules.outcome.faultingActor, document.outcome.faultingActor);
      assert.equal(document.outcome.type, reason === 'unreachable' ? 'winner' : 'fault', 'physical result category is independent of the final hitter');
      assert.equal(rules.expectedOutcomes.length, 1);
      assert.equal(rules.expectedFaults.length, reason === 'unreachable' ? 0 : 1);
      assert.equal(timeline.events.filter(event => event.type === 'fault').length, reason === 'unreachable' ? 0 : 1);
      assert.equal(timeline.events.filter(event => event.type === 'dead').length, 1);
      assert.ok(timeline.duration >= rules.outcome.evidenceObservedTime);
    } else {
      assert.equal(rules.outcome, null);
      assert.deepEqual(rules.expectedFaults, []);
    }
    for (const event of timeline.events) {
      const before = samplePlayBall(timeline, Math.max(0, event.time - 1e-7)), at = samplePlayBall(timeline, event.time), after = samplePlayBall(timeline, Math.min(timeline.duration, event.time + 1e-7));
      assert.ok(distance(before, at) < 2e-5, `continuous before ${event.id}`);
      assert.ok(distance(after, at) < 2e-5, `continuous after ${event.id}`);
      if (['contact', 'bounce', 'second-bounce', 'net-touch', 'out'].includes(event.type)) assert.ok(distance(at, event.position) < 2e-5, `event follows physical ball ${event.id}`);
    }
    for (let index = 1; index < timeline.segments.length; index++) {
      const previous = timeline.segments[index - 1], current = timeline.segments[index];
      for (const player of ['player1', 'player2', 'player3', 'player4']) {
        const hand = document.players[player].handedness;
        const before = sampleActorWorldPosition(previous, player, previous.duration, hand, true);
        const after = sampleActorWorldPosition(current, player, 0, hand, true);
        assert.ok(distance(before, after) < 1e-6, `actor continuity ${player}/${current.step.id}`);
      }
    }
    const replay = compilePlayTimeline(JSON.parse(JSON.stringify(result.play)));
    assert.deepEqual(replay.events, timeline.events, 'JSON-preserved model and physics metadata must reconstruct the same events');
    for (const fraction of [0, .25, .5, .75, 1]) assert.deepEqual(samplePlayBall(replay, replay.duration * fraction), samplePlayBall(timeline, timeline.duration * fraction));
    assert.equal(JSON.stringify(document), bytes, 'compilation may not rewrite authored evidence');
  });
  test(`model2 ${id} rejects its physical negative counterpart without an intentional-fault bypass`, () => {
    const document = readModel2Fixture(id);
    const negative = model2ScenarioDrafts().find(item => item.id === id).negative;
    negative(document);
    assert.equal(document.intentionalFault, false);
    let result;
    try { result = compileDocument(document); }
    catch (error) { assert.ok(error instanceof TypeError || error instanceof RangeError); return; }
    assert.ok(errorFindings(result).length > 0, `${id} was accepted without evidence: ${JSON.stringify(result)}`);
    assert.ok(result.validShotCount < document.shots.length, 'a contradictory terminal declaration must not be accepted as a complete point');
    assert.ok(validateRallyRules(result.play, result.timeline).violations.length > 0 || errorFindings(result).some(item => item.kind === 'feasibility'));
  });
}

test('a stopping net collision drops on the hitter side and never becomes a phantom crossing or next contact', () => {
  const { timeline } = compileDocument(readModel2Fixture('net'));
  assert.equal(timeline.events.filter(event => event.type === 'contact').length, 1);
  assert.equal(timeline.events.filter(event => event.type === 'net-crossing').length, 0);
  assert.equal(timeline.events.filter(event => event.type === 'net-touch').length, 1);
  for (let i = 0; i <= 50; i++) assert.ok(samplePlayBall(timeline, timeline.duration * i / 50).board.y < 22);
  assert.ok(samplePlayBall(timeline, timeline.duration).y <= .04);
});

test('second bounce stays distinct from the first bounce and the unreachable judgment carries conservative reach evidence', () => {
  for (const id of ['second-bounce', 'unreachable']) {
    const { timeline } = compileDocument(readModel2Fixture(id));
    const bounce = timeline.events.filter(event => event.type === 'bounce');
    const second = timeline.events.filter(event => event.type === 'second-bounce');
    assert.equal(bounce.length, 1); assert.equal(second.length, 1);
    assert.ok(second[0].time > bounce[0].time);
  }
  const { timeline } = compileDocument(readModel2Fixture('unreachable'));
  assert.equal(timeline.outcome.faultingActor, null);
  const reach = timeline.outcome.reach;
  assert.equal(reach.unreachable, true);
  assert.equal(reach.speedFeetPerSecond, 14);
  assert.equal(reach.reactionSeconds, .12);
  assert.equal(reach.paddleReachFeet, 3);
  assert.deepEqual(reach.players.map(player => player.actor).sort(), ['player3', 'player4']);
  for (const player of reach.players) {
    assert.equal(player.reachable, false);
    assert.ok(player.continuousLowerBoundFeet > 0);
    assert.ok(player.minSampledClearanceFeet >= player.continuousLowerBoundFeet);
    assert.ok(player.availableSeconds > 0);
  }
});

test('a late momentum observation preserves the earlier faulty volley and overrides the opposing later fault', () => {
  const document = readModel2Fixture('earlier-momentum-overrides-later-fault');
  const { timeline } = compileDocument(document), outcome = timeline.outcome;
  assert.equal(outcome.shotId, 'earlier-volley');
  assert.equal(outcome.faultingActor, 'player1');
  assert.equal(outcome.winner, 'orange');
  const firstContact = timeline.events.find(event => event.type === 'contact' && event.rallyLeg === 1);
  const laterContact = timeline.events.find(event => event.type === 'contact' && event.rallyLeg === 2);
  const dead = timeline.events.find(event => event.type === 'dead');
  assert.equal(outcome.violationOccurrenceTime, firstContact.time);
  assert.ok(outcome.violationOccurrenceTime < laterContact.time);
  assert.ok(outcome.evidenceObservedTime > dead.time);
  assert.ok(timeline.duration >= outcome.evidenceObservedTime);
  assert.equal(document.ending, 'winner', 'the final hitter wins because the opposing earlier volley was faulty');
  assert.equal(document.outcome.type, 'fault', 'that result is still physically a fault');
});

test('global momentum foot-point evidence reaches the line at its recorded time across later segments and reverse samples', () => {
  const document = readModel2Fixture('earlier-momentum-overrides-later-fault');
  const { timeline } = compileDocument(document);
  const contactTime = timeline.events.find(event => event.type === 'contact' && event.rallyLeg === 1).time;
  const evidence = document.shots[0].contactEvidence, momentum = evidence.momentum;
  for (const fraction of [0, .25, .6, .99, 1, .99, .6, .25, 0]) {
    const time = contactTime + momentum.afterContactSeconds * fraction;
    const segment = timeline.segments.find(segment => time < segment.endTime - 1e-9) || timeline.segments.at(-1);
    const local = time - segment.startTime;
    const position = sampleActorBoardPositionV2(segment, 'player1', local), feet = sampleActorFeetV2(segment, 'player1', local);
    assert.ok(Math.abs(position.y - (14 + fraction)) < 1e-9);
    assert.equal(position.x, 7);
    assert.deepEqual(samplePlayState(timeline, time).positions.player1, position);
    for (let i = 0; i < 2; i++) {
      assert.ok(Math.abs(feet[i].y - (14 + fraction)) < 1e-9);
      assert.equal(feet[i].x, evidence.feet[i].x);
      if (fraction < 1) assert.ok(feet[i].y < 15);
    }
  }
});

test('a physical live net touch crosses legally and a later body collision cannot supersede an earlier out landing', () => {
  const net = readModel2Fixture('long');
  net.ending = 'stop'; delete net.outcome;
  Object.assign(net.shots[0], { family: 'dink', intent: 'dink', quality: 'neutral', target: { x: 7, y: 30 } });
  const h = 2.2, radius = PHYSICS_V2.ballRadiusFeet, gravity = PHYSICS_V2.gravityFeetPerSecond2;
  const crossingFraction = .5, desired = localNetHeightFeet(7) + radius;
  const t2 = 2 * (desired - h * (1 - crossingFraction) - radius * crossingFraction) / (gravity * crossingFraction * (1 - crossingFraction));
  const t = Math.sqrt(t2), vy = (radius - h + .5 * gravity * t2) / t;
  net.shots[0].physics = { apexFeet: h + vy * vy / (2 * gravity) };
  const live = compileDocument(net);
  assert.deepEqual(errorFindings(live), []);
  const touch = live.timeline.events.find(event => event.type === 'net-touch');
  assert.ok(touch);
  assert.ok(live.timeline.events.some(event => event.type === 'net-crossing'));
  assert.equal(live.timeline.events.filter(event => event.type === 'fault' || event.type === 'dead').length, 0);
  assert.ok(samplePlayBall(live.timeline, live.timeline.duration).board.y > 22);
  const out = readModel2Fixture('long');
  out.initialLayout.player3 = { x: 7, y: 50 };
  const result = compileDocument(out);
  assert.deepEqual(errorFindings(result), []);
  assert.equal(result.timeline.outcome.reason, 'long');
  assert.equal(result.timeline.outcome.faultingActor, 'player1');
});

test('outcome categories and intentional-fault labels cannot certify unsupported success or causality', () => {
  for (const type of ['winner', 'forced-error', 'unforced-error']) {
    const document = readModel2Fixture('net'); document.outcome.type = type;
    const result = compileDocument(document);
    assert.ok(errorFindings(result).length > 0, type);
    assert.equal(result.validShotCount, 0, type);
  }
  const document = readModel2Fixture('net'); document.intentionalFault = true;
  assert.throws(() => validateDocument(document), /intentionalFault/);
});

test('contact height and timing are sampled from the actual incoming bounce and transition depth', () => {
  const document = readModel2Fixture('variable-bounced-contact');
  const baseline = compileDocument(document), incoming = baseline.timeline.segments[0], reply = baseline.timeline.segments[1];
  const contact = reply.shotSemantics.contact.point;
  const sampled = incoming.trajectory.sampleBoard(incoming.trajectory.totalDuration);
  assert.ok(Math.abs(sampled.heightFeet - contact.heightFeet) < 1e-9);
  assert.ok(Math.hypot(sampled.x - contact.x, sampled.y - contact.y) < 1e-9);
  const ownQuality = clone(document); ownQuality.shots[1].quality = 'attackable';
  assert.equal(compileDocument(ownQuality).timeline.segments[1].shotSemantics.contact.point.heightFeet, contact.heightFeet);
  const later = clone(document); later.shots[1].contactTiming.afterBounceSeconds = .35;
  const laterResult = compileDocument(later);
  assert.deepEqual(errorFindings(laterResult), []);
  assert.notEqual(laterResult.timeline.segments[1].shotSemantics.contact.point.heightFeet, contact.heightFeet);
  const transition = compileDocument(readModel2Fixture('transition-volley')).timeline.segments[1];
  assert.equal(transition.shotSemantics.contact.kind, 'volley');
  assert.equal(transition.shotSemantics.contact.point.y, 36);
  assert.equal(transition.previous.shot.flight.bounces, 0);
});

test('signature shots prove surface feet and post clearance instead of bypassing the net by their names', () => {
  const erne = compileDocument(readModel2Fixture('erne')).timeline.segments[0];
  assert.ok(erne.shotSemantics.contact.point.x < 0);
  assert.ok(erne.shotSemantics.contact.feet.every(foot => foot.x < 0));
  const atp = compileDocument(readModel2Fixture('around-the-post')).timeline;
  const crossing = atp.events.find(event => event.type === 'net-crossing');
  assert.ok(crossing);
  assert.ok(worldToBoard(crossing.position).x < -1.25);
  assert.ok(crossing.position.y / FEET_TO_METERS < 34 / 12, 'ATP travels below the ordinary net tape');
});

test('serve-body exceptions keep the struck player separate from the player who faults', () => {
  const ownPartner = readModel2Fixture('serve-hits-server-partner');
  assert.equal(ownPartner.outcome.struckActor, 'player2');
  assert.equal(ownPartner.outcome.faultingActor, 'player1');
  assert.equal(ownPartner.outcome.ruleRef, '7.E.4');
  assert.equal(ownPartner.outcome.winner, 'orange');
  const receivingPartner = readModel2Fixture('serve-hits-receiver-partner');
  assert.equal(receivingPartner.outcome.struckActor, 'player4');
  assert.equal(receivingPartner.outcome.faultingActor, 'player4');
  assert.equal(receivingPartner.outcome.ruleRef, '7.E.5');
  assert.equal(receivingPartner.outcome.winner, 'green');
});

test('legacy position assistance cannot move model2 feet, body evidence, ball or terminal timing', () => {
  for (const id of ['body', 'nvz-foot', 'nvz-momentum-after-dead']) {
    const document = readModel2Fixture(id), before = JSON.stringify(document);
    const base = compileDocument(document);
    document.assistance.autoShading = true; document.assistance.showGuides = true;
    const expected = clone(base.play); expected.assistance = clone(document.assistance);
    const assisted = compileEffectiveCandidate(document);
    assert.deepEqual(assisted.play, expected);
    assert.deepEqual(assisted.timeline.events, base.timeline.events);
    assert.deepEqual(assisted.coverage, []);
    assert.equal(assisted.validShotCount, document.shots.length);
    assert.deepEqual(errorFindings(assisted), []);
    assert.ok(assisted.findings.some(item => item.severity === 'warning' && /authored geometry/.test(item.message)));
    document.assistance.autoShading = false; document.assistance.showGuides = false;
    assert.equal(JSON.stringify(document), before);
  }
});
