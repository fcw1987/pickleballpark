import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationPlanningSessionV2, observeGenerationPlanningSessionV2, commitGenerationRecipeV2,
  probeGenerationIncomingV2, probeGenerationReplyV2, createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2 } from '../play-planning-v2.js';
import { inspectGeneratedMovementV1 } from '../rally-movement.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

test('private incoming proofs and fresh commits both reject excessive acceleration without changing authored acceptance or session state', () => {
  const first = model2Shot({contactEvidence: {feet: [{x: 7.58, y: 14}, {x: 8.42, y: 14}], feetEstablishedOutsideNVZ: true}});
  const second = model2Shot({id: 'reply', hitter: 'player3', family: 'volley', intent: 'volley', target: {x: 7, y: 17},
    contactTiming: {beforeBounceSeconds: .1},
    contactEvidence: {feet: [{x: 6.58, y: 29.75}, {x: 7.42, y: 29.75}], feetEstablishedOutsideNVZ: true}});
  const document = model2Document({shots: [first, second]});
  document.initialLayout.player3 = {x: 7, y: 29.75}; document.initialLayout.player4 = {x: 18, y: 30};
  const bytes = JSON.stringify(document), authored = createPlanningStateV2(document);
  commitPlanningTrialV2(authored, trialRecipeV2(authored, first));
  const authoredTrial = trialRecipeV2(authored, second);
  assert.equal(authoredTrial.ok, true);
  assert.equal(inspectGeneratedMovementV1(authoredTrial.resolvedPrevious).valid, true, 'the same authored geometry is speed-safe');

  const session = createGenerationPlanningSessionV2(document);
  assert.equal(commitGenerationRecipeV2(session, first).committed, true);
  const before = observeGenerationPlanningSessionV2(session), probe = probeGenerationIncomingV2(session, second);
  assert.equal(probe.ok, true, 'rules and contact geometry pass independently of generation dynamics');
  assert.equal(probe.movement.valid, false); assert.match(probe.movement.reason, /acceleration/);
  assert.ok(probe.movement.maxAccelerationFeetPerSecondSquared > 34);
  assert.equal(probe.movement.boundAccelerationFeetPerSecondSquared, 30);
  assert.equal(probe.spacing.valid, true);
  for (const incoming of [undefined, probe.handle]) {
    const nominal = probeGenerationReplyV2(session, second, {incoming, actors: ['player3', 'player4']});
    assert.equal(nominal.ok, true); assert.equal(nominal.routeValid, false);
    assert.equal(nominal.previousInspectionReused, Boolean(incoming));
    const delivered = commitGenerationRecipeV2(session, second, {incoming});
    assert.equal(delivered.ok, true); assert.equal(delivered.routeValid, false);
    assert.equal(delivered.inspection, null);
    assert.equal(observeGenerationPlanningSessionV2(session), before, 'failed admission must not advance or rewrite the private session');
  }
  assert.equal(JSON.stringify(document), bytes);
});
