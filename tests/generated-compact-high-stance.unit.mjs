import test from 'node:test';
import assert from 'node:assert/strict';
import { contactFeetCandidatesV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { GENERATED_DEFAULT_FOOT_STATE_V1 } from '../generated-foot-state.js';
import { generatedContactRadiusFeetV1 } from '../generated-contact-support.js';
import { groundedSoleClearsNVZV1 } from '../generated-grounded-sole.js';
import { simulateRally, runNaturalAttemptV1 } from '../rally-engine.js';
import { createEngineDriverV1 } from '../rally-engine-driver.js';
import { createRallyRandomV1 } from '../rally-random.js';
import { compileDocument } from '../play-compiler.js';
import { inspectGeneratedTrainerSupportV1 } from '../generated-trainer-support.js';

for (const team of ['green', 'orange']) for (const handedness of ['left', 'right']) for (const contactStyle of ['forehand', 'backhand']) {
  test(`high contact search reserves a compact plant with real hand, side and sole boundaries (${team}/${handedness}/${contactStyle})`, () => {
    const sign = team === 'green' ? 1 : -1, hand = (handedness === 'right' ? 1 : -1) * (contactStyle === 'backhand' ? -1 : 1);
    const contact = { x: 10, y: team === 'green' ? 10 : 34, heightFeet: 7.5 };
    const args = { contact, target: { x: team === 'green' ? 18 : 2, y: team === 'green' ? 34 : 10 },
      team, handedness, contactStyle, kind: 'volley', position: { x: 10 + sign * hand * .8, y: contact.y - sign * .8 },
      availableSeconds: 1, defaultFootState: GENERATED_DEFAULT_FOOT_STATE_V1 };
    const before = JSON.stringify(args), candidates = contactFeetCandidatesV1(args);
    assert.ok(candidates.length <= 8);
    assert.ok(candidates.some(row => row.routeReachable && Math.abs(row.bodyClearanceFeet - .6) < 1e-7), 'compact support must not be crowded out by wider angle proposals');
    for (const row of candidates.filter(row => row.reachable && row.legalVolleyFeet)) {
      assert.ok(row.bodyClearanceFeet <= generatedContactRadiusFeetV1(contact.heightFeet) + 1e-7);
      assert.ok(row.feet.every(groundedSoleClearsNVZV1));
      assert.ok(sign * hand * (row.stance.x - contact.x) >= .15 - 1e-7);
      assert.ok(Math.abs(Math.abs(row.feet[0].x - row.feet[1].x) - 1.44) < 1e-8);
    }
    assert.equal(JSON.stringify(args), before);
  });
}

test('compact plants do not move an explicit initial serve layout', () => {
  const position = { x: 5, y: -1 }, result = contactFeetCandidatesV1({ contact: { x: 4.2, y: 0, heightFeet: 7.5 },
    target: { x: 15, y: 38 }, team: 'green', kind: 'serve', position, defaultFootState: GENERATED_DEFAULT_FOOT_STATE_V1 });
  assert.equal(result.length, 1); assert.deepEqual(result[0].stance, position);
});

for (const [style, seed, server, court] of [['advanced', 50121, 'player1', 'left'], ['intermediate', 50052, 'player1', 'right'],
  ['intermediate', 50121, 'player1', 'left'], ['intermediate', 50539, 'player3', 'left'], ['intermediate', 50719, 'player3', 'left']]) {
  test(`balanced high-contact regression completes without execution rerolls (${style}/${seed})`, async () => {
    const ids = ['player1', 'player2', 'player3', 'player4'], players = Object.fromEntries(ids.map((id, index) => [id,
      { team: index < 2 ? 'green' : 'orange', handedness: 'right', style, flavour: 'balanced' }]));
    const input = { seed, players, service: { server, receiver: server === 'player1' ? 'player3' : 'player1', court },
      options: { maxShots: 99, lengthFeel: 'natural', winner: 'either', signatureShots: true } };
    let executionCalls = 0;
    const simulate = createEngineDriverV1((normalized, context) => runNaturalAttemptV1(normalized, { ...context,
      random: { ...context.random, execution: () => { executionCalls++; return context.random.execution(); } } }));
    const before = JSON.stringify(input), result = await simulate(input);
    assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
    assert.equal(executionCalls, 2 * result.decisions.length);
    const random = createRallyRandomV1(seed);
    for (const decision of result.decisions) assert.deepEqual(decision.draws.execution, { quality: random.execution(), error: random.execution() });
    const timeline = compileDocument(result.document).timeline;
    assert.equal(inspectGeneratedMovementV1(timeline, { maxAccelerationFeetPerSecondSquared: 30 }).valid, true);
    assert.equal(inspectGeneratedSpacingV1(timeline).valid, true);
    assert.equal(inspectGeneratedTrainerSupportV1({ timeline, players }).valid, true);
    assert.equal(result.diagnostics.validation.groundedSoles.valid, true);
    assert.equal(result.diagnostics.validation.generatedFlightFeasibility.status, 'PASS');
    assert.ok(result.decisions.some(decision => decision.resolution.actualContact.heightFeet > 7 && (() => {
      const contact = decision.resolution.actualContact, feet = decision.resolution.actualFeet;
      return Math.hypot(contact.x - (feet[0].x + feet[1].x) / 2, contact.y - (feet[0].y + feet[1].y) / 2) < 1;
    })()), 'the actual accepted high contact must use an under-ball plant');
    assert.deepEqual((await simulateRally(input)).document, result.document);
    assert.equal(JSON.stringify(input), before);
  });
}
