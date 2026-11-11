import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDocument } from '../play-compiler.js';
import { sampleActorBoardPositionV2, sampleActorFeetV2 } from '../play-actors-v2.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';
import { createGenerationPlanningSessionV2, probeGenerationIncomingV2, probeGenerationReplyV2, commitGenerationRecipeV2 } from '../play-planning-v2.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

const ids = { player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2', auto: 'auto' };
const rotate = p => ({ x: 20 - p.x, y: 44 - p.y });
const center = feet => ({ x: (feet[0].x + feet[1].x) / 2, y: (feet[0].y + feet[1].y) / 2 });
const close = (a, b) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-9, JSON.stringify({ actual: a, expected: b }));
const errors = result => result.findings.filter(item => item.severity === 'error');
function fixture(name, mirrored = false) {
  const document = readModel2Fixture(name);
  if (!mirrored) return document;
  document.initialLayout = Object.fromEntries(Object.entries(document.initialLayout).map(([id, p]) => [ids[id] ?? id, rotate(p)]));
  for (const shot of document.shots) {
    shot.hitter = ids[shot.hitter]; shot.receiver = ids[shot.receiver];
    shot.target = rotate(shot.target);
    if (shot.movement.target) shot.movement.target = rotate(shot.movement.target);
    if (shot.contactEvidence) shot.contactEvidence.feet = shot.contactEvidence.feet.map(rotate);
  }
  return document;
}

// Dot the ball/body displacement against anatomical right while facing the
// outgoing target. This tests the physical side, independently of label names.
function physicalRightOffset(segment, actor) {
  const contact = segment.shotSemantics.contact.point;
  const target = segment.step.shot.intendedTarget;
  const dx = target.x - contact.x, dy = target.y - contact.y, length = Math.hypot(dx, dy);
  const stance = sampleActorBoardPositionV2(segment, actor, segment.contactTime);
  return ((contact.x - stance.x) * -dy + (contact.y - stance.y) * dx) / length;
}

for (const name of ['transition-volley', 'variable-bounced-contact']) for (const mirrored of [false, true]) {
  for (const handedness of ['right', 'left']) for (const contactStyle of ['forehand', 'backhand']) {
    test(`inferred model2 ${name} feet honor ${mirrored ? 'green' : 'orange'} ${handedness} ${contactStyle}`, () => {
      const document = fixture(name, mirrored), reply = document.shots[1];
      document.players[reply.hitter].handedness = handedness;
      reply.contactStyle = contactStyle;
      const before = JSON.stringify(document), result = compileDocument(document), segment = result.timeline.segments[1];
      assert.equal(result.validShotCount, 2, JSON.stringify(result.findings));
      assert.deepEqual(errors(result), []);
      const physicalSign = (handedness === 'right' ? 1 : -1) * (contactStyle === 'forehand' ? 1 : -1);
      assert.ok(Math.abs(physicalRightOffset(segment, reply.hitter) - physicalSign * .8) < 1e-9);
      const feet = segment.shotSemantics.contact.feet, stance = center(feet);
      close(sampleActorBoardPositionV2(segment, reply.hitter, segment.contactTime), stance);
      close(center(sampleActorFeetV2(segment, reply.hitter, segment.contactTime)), stance);
      const previous = result.timeline.segments[0];
      close(sampleActorBoardPositionV2(previous, reply.hitter, previous.duration), stance);
      assert.equal(segment.shotSemantics.contact.strokeSide, contactStyle);
      assert.equal(JSON.stringify(document), before, 'compilation must not rewrite source');
      const neutral = compileDocument(fixture(name, mirrored));
      assert.deepEqual(segment.shotSemantics.contact.point, neutral.timeline.segments[1].shotSemantics.contact.point,
        'handedness does not move the incoming ball contact');
    });
  }

  test(`explicit model2 ${name} feet and a matching pin survive hand/side changes (${mirrored})`, () => {
    const document = fixture(name, mirrored), base = compileDocument(document), reply = document.shots[1];
    const feet = structuredClone(base.timeline.segments[1].shotSemantics.contact.feet), stance = center(feet);
    reply.contactEvidence = { feet, feetEstablishedOutsideNVZ: true };
    document.shots[0].playerMovement = { [reply.hitter]: { intent: 'manual', target: stance, pinned: true } };
    document.players[reply.hitter].handedness = 'left';
    reply.contactStyle = 'forehand';
    const before = JSON.stringify(document), result = compileDocument(document);
    assert.equal(result.validShotCount, 2, JSON.stringify(result.findings));
    assert.deepEqual(errors(result), []);
    assert.deepEqual(result.timeline.segments[1].shotSemantics.contact.feet, feet);
    close(result.play.steps[1].positions[reply.hitter], stance);
    assert.equal(JSON.stringify(document), before);
  });

  test(`inferred model2 ${name} left-hand feet cannot override an incompatible authored pin (${mirrored})`, () => {
    const document = fixture(name, mirrored), base = compileDocument(document), reply = document.shots[1];
    const pinned = center(base.timeline.segments[1].shotSemantics.contact.feet);
    document.shots[0].playerMovement = { [reply.hitter]: { intent: 'manual', target: pinned, pinned: true } };
    document.players[reply.hitter].handedness = 'left';
    reply.contactStyle = 'forehand';
    const before = JSON.stringify(document), result = compileDocument(document);
    assert.equal(result.validShotCount, 0);
    assert.ok(errors(result).some(item => /authored pin/.test(item.message)));
    assert.deepEqual(document.shots[0].playerMovement[reply.hitter].target, pinned);
    assert.equal(JSON.stringify(document), before);
  });

  test(`first model2 ${name} contact retains its explicit starting layout (${mirrored})`, () => {
    const document = fixture(name, mirrored), first = document.shots[0];
    document.players[first.hitter].handedness = 'left'; first.contactStyle = 'backhand';
    const before = JSON.stringify(document), result = compileDocument(document);
    assert.equal(result.validShotCount, 2, JSON.stringify(result.findings));
    close(center(result.timeline.segments[0].shotSemantics.contact.feet), document.initialLayout[first.hitter]);
    assert.equal(JSON.stringify(document), before);
  });
}


for (const name of ['transition-volley', 'variable-bounced-contact']) for (const mirrored of [false, true]) {
  for (const hand of ['right', 'left']) for (const wantedSide of ['forehand', 'backhand']) {
    test(`model2 auto resolves ${name} ${mirrored ? 'green' : 'orange'} ${hand} ${wantedSide} from the actual incoming contact`, () => {
      const document = fixture(name, mirrored), reply = document.shots[1];
      const contact = compileDocument(document).timeline.segments[1].shotSemantics.contact.point;
      const direction = (document.players[reply.hitter].team === 'green' ? -1 : 1) * (hand === 'right' ? 1 : -1);
      document.players[reply.hitter].handedness = hand;
      document.initialLayout[reply.hitter].x = contact.x - direction * (wantedSide === 'forehand' ? 2 : -2);
      reply.contactStyle = 'auto';
      const before = JSON.stringify(document), result = compileDocument(document), semantics = result.timeline.segments[1].shotSemantics;
      assert.equal(result.validShotCount, 2, JSON.stringify(result.findings));
      assert.equal(semantics.strokeSide, wantedSide);
      assert.ok(physicalRightOffset(result.timeline.segments[1], reply.hitter) * (hand === 'right' ? 1 : -1) * (wantedSide === 'forehand' ? 1 : -1) > 0);
      if (reply.family === 'return') assert.equal(semantics.stroke, wantedSide, 'the return animation and preparation use the resolved side too');
      assert.equal(semantics.artAction, wantedSide === 'backhand' ? 'backhand' : reply.family === 'return' ? 'forehand' : 'block');
      assert.equal(JSON.stringify(document), before);
      const explicit = structuredClone(document); explicit.shots[1].contactStyle = wantedSide;
      const other = compileDocument(explicit).timeline.segments[1];
      assert.deepEqual(semantics.contact, other.shotSemantics.contact);
    });
  }

  test(`auto uses authoritative contact feet instead of a contradictory previous root for ${name} (${mirrored})`, () => {
    for (const hand of ['right', 'left']) {
      const document = fixture(name, mirrored), base = compileDocument(document), reply = document.shots[1];
      const contact = base.timeline.segments[1].shotSemantics.contact;
      const feet = structuredClone(contact.feet), direction = mirrored ? -1 : 1;
      document.initialLayout[reply.hitter].x = contact.point.x + direction * 2;
      document.players[reply.hitter].handedness = hand;
      reply.contactStyle = 'auto'; reply.contactEvidence = { feet, feetEstablishedOutsideNVZ: true };
      const before = JSON.stringify(document), result = compileDocument(document), actual = result.timeline.segments[1].shotSemantics;
      assert.equal(result.validShotCount, 2, JSON.stringify(result.findings));
      assert.equal(actual.strokeSide, hand === 'right' ? 'forehand' : 'backhand');
      assert.deepEqual(actual.contact.feet, feet);
      assert.equal(JSON.stringify(document), before);
    }
  });
}

for (const mirrored of [false, true]) for (const hand of ['right', 'left']) {
  test(`initial model2 auto uses the declared ${mirrored ? 'orange' : 'green'} ${hand} stance and keeps a stable centered choice`, () => {
    for (const lateral of [-1.7, -.149, 0, .149, 1.7]) {
      const document = model2Document({ shots: [model2Shot({ family: 'return', contactStyle: 'auto', target: { x: 7, y: 27 } })] });
      let hitter = 'player1';
      if (mirrored) {
        document.initialLayout = Object.fromEntries(Object.entries(document.initialLayout).map(([id, p]) => [ids[id] ?? id, rotate(p)]));
        hitter = 'player3'; document.shots[0].hitter = hitter;
        document.shots[0].target = rotate(document.shots[0].target);
      }
      document.players[hitter].handedness = hand;
      document.initialLayout[hitter].x = document.initialLayout.ball.x - lateral;
      const before = JSON.stringify(document), result = compileDocument(document), segment = result.timeline.segments[0];
      const direction = (mirrored ? 1 : -1) * (hand === 'right' ? 1 : -1);
      const expected = Math.abs(lateral) < .15 || lateral * direction >= 0 ? 'forehand' : 'backhand';
      assert.equal(result.validShotCount, 1, JSON.stringify(result.findings));
      assert.equal(segment.shotSemantics.strokeSide, expected);
      assert.equal(segment.shotSemantics.stroke, expected);
      assert.equal(segment.shotSemantics.artAction, expected);
      close(center(segment.shotSemantics.contact.feet), document.initialLayout[hitter]);
      assert.equal(JSON.stringify(document), before);
    }
  });
}

test('lateral reflection and opposite handedness preserve automatic physical contacts', () => {
  const original = fixture('variable-bounced-contact');
  original.initialLayout.player3.x = 11; original.shots[1].contactStyle = 'auto';
  const reflected = structuredClone(original), flip = p => ({ x: 20 - p.x, y: p.y });
  for (const id of Object.keys(reflected.initialLayout)) reflected.initialLayout[id] = flip(reflected.initialLayout[id]);
  for (const player of Object.values(reflected.players)) player.handedness = 'left';
  for (const shot of reflected.shots) shot.target = flip(shot.target);
  const a = compileDocument(original), b = compileDocument(reflected);
  assert.equal(a.validShotCount, 2); assert.equal(b.validShotCount, 2);
  const sa = a.timeline.segments[1], sb = b.timeline.segments[1];
  assert.equal(sa.shotSemantics.strokeSide, 'backhand');
  assert.equal(sb.shotSemantics.strokeSide, 'backhand');
  close(center(sb.shotSemantics.contact.feet), flip(center(sa.shotSemantics.contact.feet)));
  close(sb.shotSemantics.contact.point, flip(sa.shotSemantics.contact.point));
});

test('generation incoming reuse cannot alias automatic and explicit forehand requests', () => {
  for (const [firstStyle, secondStyle] of [['auto', 'forehand'], ['forehand', 'auto']]) {
    const document = fixture('variable-bounced-contact'); document.initialLayout.player3.x = 11;
    const session = createGenerationPlanningSessionV2(document);
    const initial = commitGenerationRecipeV2(session, document.shots[0]);
    assert.equal(initial.committed, true);
    const first = { ...document.shots[1], contactStyle: firstStyle };
    const incoming = probeGenerationIncomingV2(session, first);
    assert.equal(incoming.ok, true, JSON.stringify(incoming.findings));
    const second = { ...document.shots[1], contactStyle: secondStyle };
    const reply = probeGenerationReplyV2(session, second, { incoming: incoming.handle, actors: [], record: true });
    assert.equal(reply.ok, true);
    assert.equal(reply.previousInspectionReused, false);
    const independent = compileDocument({ ...document, shots: [document.shots[0], second] });
    assert.deepEqual(reply.nominal.actorRoute.feet, independent.timeline.segments[1].shotSemantics.contact.feet);
    assert.notDeepEqual(reply.nominal.actorRoute.feet, incoming.feet);
  }
});
