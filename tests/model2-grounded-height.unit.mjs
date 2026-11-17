import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { GROUNDED_CONTACT_HEIGHT_FEET } from '../play-actors-v2.js';
import { GROUNDED_CONTACT_HEIGHT_FEET as GENERATOR_CEILING } from '../rally-movement.js';
import { solveFlightV2, PHYSICS_V2 } from '../play-physics-v2.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

const rotate = point => ({ x: 20 - point.x, y: 44 - point.y });
function lobReply({ mirrored = false, hand = 'right', height } = {}) {
  const document = model2Document({
    initialLayout: { player1: { x: 7, y: 14 }, player2: { x: 16, y: 5 },
      player3: { x: 7, y: height === undefined ? 30 : 40 }, player4: { x: 18, y: 39 }, ball: { x: 7, y: 14 } },
    shots: [model2Shot({ id: 'lob', family: 'lob', intent: 'lob', target: { x: 7, y: 42 }, physics: { apexFeet: 18 } }),
      model2Shot({ id: 'overhead', hitter: 'player3', family: 'overhead', intent: 'overhead', target: { x: 1, y: 5 } })]
  });
  if (mirrored) {
    const ids = { player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' };
    document.initialLayout = Object.fromEntries(Object.entries(document.initialLayout).map(([id, p]) => [ids[id] ?? id, rotate(p)]));
    for (const shot of document.shots) { shot.hitter = ids[shot.hitter]; shot.target = rotate(shot.target); }
  }
  for (const player of Object.values(document.players)) player.handedness = hand;
  if (height !== undefined) {
    const shot = document.shots[0];
    const incoming = solveFlightV2({ from: { ...document.initialLayout.ball, heightFeet: 2.2 }, target: shot.target,
      family: shot.family, physics: shot.physics, arc: shot.arc, pace: shot.pace, quality: shot.quality });
    const gravity = PHYSICS_V2.gravityFeetPerSecond2, velocity = incoming.stages[0].vy;
    const time = (velocity + Math.sqrt(velocity ** 2 - 2 * gravity * (height - incoming.from.heightFeet))) / gravity;
    document.shots[1].contactTiming = { beforeBounceSeconds: incoming.firstLandingTime - time };
  }
  return document;
}

test('authored validation and generation share one supported grounded-height constant', () => {
  assert.equal(GROUNDED_CONTACT_HEIGHT_FEET, 8.5);
  assert.equal(GENERATOR_CEILING, GROUNDED_CONTACT_HEIGHT_FEET);
});

for (const mirrored of [false, true]) for (const hand of ['right', 'left']) {
  test(`a grounded ${mirrored ? 'green' : 'orange'} ${hand} player cannot intercept a lob at 17.49 ft`, () => {
    const document = lobReply({ mirrored, hand }), before = JSON.stringify(document), result = compileDocument(document);
    assert.equal(result.validShotCount, 0);
    const contact = result.timeline.segments[1].shotSemantics.contact;
    assert.ok(Math.abs(contact.point.heightFeet - 17.49214474112685) < 1e-10);
    const findings = result.findings.filter(item => item.severity === 'error');
    assert.equal(findings.length, 1, JSON.stringify(findings));
    assert.equal(findings[0].kind, 'feasibility');
    const violations = validateRallyRules(result.play, result.timeline).violations;
    assert.equal(violations.length, 1); assert.equal(violations[0].code, 'grounded-contact-height');
    assert.equal(violations[0].category, 'model');
    assert.ok(contact.feet.every(foot => Number.isFinite(foot.x) && Number.isFinite(foot.y)));
    assert.equal(JSON.stringify(document), before, 'keep impossible source and the actual incoming contact, without moving the ball');
  });

  test(`descending lob contacts respect the grounded ceiling for ${mirrored ? 'green' : 'orange'} ${hand}`, () => {
    for (const height of [7, 8.5 - 1e-6, 8.5, 8.5 + 1e-6]) {
      const document = lobReply({ mirrored, hand, height }), before = JSON.stringify(document), result = compileDocument(document);
      assert.ok(Math.abs(result.timeline.segments[1].shotSemantics.contact.point.heightFeet - height) < 1e-10);
      assert.equal(result.timeline.segments[0].trajectory.metadata.apexFeet, 18, 'a high lob remains supported; its grounded interception is what is bounded');
      const violations = validateRallyRules(result.play, result.timeline).violations;
      const invalid = height > GROUNDED_CONTACT_HEIGHT_FEET;
      assert.equal(result.validShotCount, invalid ? 0 : 2, JSON.stringify(result.findings));
      assert.equal(violations.length, invalid ? 1 : 0, JSON.stringify(violations));
      if (invalid) assert.equal(violations[0].code, 'grounded-contact-height');
      assert.equal(JSON.stringify(document), before);
    }
  });
}
