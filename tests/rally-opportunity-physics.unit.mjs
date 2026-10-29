import test from 'node:test';
import assert from 'node:assert/strict';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2 } from '../play-planning-v2.js';
import { interceptFlightV2 } from '../play-physics-v2.js';
import { contactFeetV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1, sampleFeetStateV1 } from '../rally-movement.js';
import { sampleActorBoardPositionV2 } from '../play-actors-v2.js';
import { assessReach } from '../rally-tactics.js';
import { isInNonVolleyZone } from '../court-geometry.js';
import { resolveFlightParametersV1 } from '../rally-targets.js';
import { contactOpportunityPreferenceV1, compareContactOpportunityPreferencesV1, rankContactOpportunitiesV1 } from '../rally-contact-selection.js';

const ids = ['player1', 'player2', 'player3', 'player4'];
const players = Object.fromEntries(ids.map((id, index) => [id, { team: index < 2 ? 'green' : 'orange', handedness: 'right' }]));
const hold = () => ({ intent: 'hold', pinned: false });
const manual = target => ({ intent: 'manual', target: { x: target.x, y: target.y }, pinned: false });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function controlledIncoming({ mirrored, receiverDepth }) {
  const at = point => mirrored ? { ...point, x: 20 - point.x, y: 44 - point.y } : { ...point };
  const hitter = mirrored ? 'player1' : 'player3', receiver = mirrored ? 'player3' : 'player1';
  const partner = mirrored ? 'player4' : 'player2', hitterPartner = mirrored ? 'player2' : 'player4';
  const initialLayout = {
    [hitter]: at({ x: 3.2, y: 30 }), [hitterPartner]: at({ x: 15, y: 30 }),
    [receiver]: at({ x: 8.8, y: receiverDepth }), [partner]: at({ x: 15, y: receiverDepth }), ball: at({ x: 6, y: 30 }),
  };
  const target = at({ x: 6, y: 6 }), team = players[hitter].team;
  const feet = contactFeetV1({ contact: { ...initialLayout.ball, heightFeet: 2.2 }, target, team,
    handedness: 'right', contactStyle: 'forehand', kind: 'volley', position: initialLayout[hitter] });
  assert.equal(feet.reachable, true); assert.equal(feet.legalVolleyFeet, true);
  const incoming = model2Shot({ id: 'controlled-incoming', family: 'volley', intent: 'counter', hitter, target,
    contactMode: 'volley', pace: 'firm', arc: 'low', physics: { launchVerticalFeetPerSecond: 18 },
    contactEvidence: { feet: feet.feet, feetEstablishedOutsideNVZ: feet.feetEstablishedOutsideNVZ },
    playerMovement: Object.fromEntries(ids.filter(id => id !== hitter).map(id => [id, hold()])) });
  const document = model2Document({ id: `physical-opportunity-${mirrored}-${receiverDepth}`, players, initialLayout, shots: [incoming], ending: 'winner' });
  const state = createPlanningStateV2(document), trial = trialRecipeV2(state, incoming);
  assert.equal(trial.ok, true, JSON.stringify(trial.findings)); commitPlanningTrialV2(state, trial);
  assert.equal(state.solved[0].obstruction, null);
  return { state, document, receiver, partner, at };
}

// Every boolean and metric passed to selection comes from the real interceptor,
// shared trial builder, sampled feet, exact route audit or solver reply probe.
function physicalOpportunity(fixture, { opportunityId, sourceIndex, time }) {
  const { state, receiver, at } = fixture, flight = state.solved[0], team = players[receiver].team;
  const contact = interceptFlightV2(flight, { kind: 'volley', stance: state.steps[0].positions[receiver], beforeBounceSeconds: flight.firstLandingTime - time });
  const target = at({ x: 10, y: 30 }), origin = state.steps[0].positions[receiver];
  const feet = contactFeetV1({ contact: contact.point, target, team, handedness: 'right',
    contactStyle: 'forehand', kind: 'volley', position: origin, availableSeconds: time });
  const parameters = resolveFlightParametersV1({ candidate: { family: 'reset', intent: 'reset', pace: 'soft', arc: 'high' }, contact: contact.point, target, team });
  const pendingRecipe = structuredClone(state.pendingRecipe);
  pendingRecipe.playerMovement[receiver] = manual(feet.stance);
  const reply = model2Shot({ id: `reply-${opportunityId}`, family: 'reset', intent: 'reset', hitter: receiver, target,
    contactMode: 'volley', contactTiming: { beforeBounceSeconds: flight.firstLandingTime - time },
    physics: parameters.physics, contactEvidence: { feet: feet.feet, feetEstablishedOutsideNVZ: feet.feetEstablishedOutsideNVZ } });
  const trial = trialRecipeV2(state, reply, { pendingRecipe });
  assert.ok(trial.resolvedPrevious, JSON.stringify(trial.findings));
  const segment = trial.resolvedPrevious, movement = inspectGeneratedMovementV1(segment), spacing = inspectGeneratedSpacingV1(segment);
  const stance = sampleActorBoardPositionV2(segment, receiver, segment.duration), sampledFeet = sampleFeetStateV1(segment, segment.duration)[receiver];
  assert.ok(distance(stance, feet.stance) < 1e-10, 'the compared stance is the actual resolved contact endpoint');
  const facts = { opportunityId, sourceIndex, actorId: receiver, kind: 'volley', contact: trial.contact, availableSeconds: contact.time,
    stance, recoveryPosition: stance, feasibleReplyIds: parameters.flight.obstruction ? [] : ['reset'],
    attackingReplyAvailable: parameters.attacking,
    audit: { legal: trial.ok, routeValid: movement.valid && spacing.valid,
      feetValid: feet.reachable && feet.legalVolleyFeet && sampledFeet.grounded && sampledFeet.feet.every(foot => !isInNonVolleyZone(foot)),
      peakFeetPerSecond: movement.maxPeakFeetPerSecond,
      minimumSpacingFeet: spacing.minimumSeparationFeet ?? spacing.separationFeet } };
  return { facts, trial, movement, spacing, feet, reach: assessReach(origin, trial.contact, contact.time) };
}

for (const mirrored of [false, true]) {
  test(`an earlier higher physically feasible opportunity beats a later floor contact (${mirrored ? 'orange' : 'green'})`, () => {
    const fixture = controlledIncoming({ mirrored, receiverDepth: 8 }), before = JSON.stringify(fixture.state.recipes);
    const early = physicalOpportunity(fixture, { opportunityId: 'higher-early', sourceIndex: 0, time: .8 });
    const late = physicalOpportunity(fixture, { opportunityId: 'floor-late', sourceIndex: 1, time: fixture.state.solved[0].firstLandingTime * .99 });
    for (const opportunity of [early, late]) {
      assert.equal(opportunity.trial.ok, true, JSON.stringify(opportunity.trial.findings));
      assert.equal(opportunity.reach.reachable, true); assert.equal(opportunity.movement.valid, true);
      assert.equal(opportunity.spacing.valid, true); assert.equal(opportunity.facts.audit.feetValid, true);
      assert.ok(opportunity.facts.audit.peakFeetPerSecond <= 18); assert.ok(opportunity.facts.audit.minimumSpacingFeet >= 2.5);
    }
    assert.ok(early.facts.availableSeconds < late.facts.availableSeconds);
    assert.ok(early.facts.contact.heightFeet > 5); assert.ok(late.facts.contact.heightFeet < 1.2);
    const result = rankContactOpportunitiesV1({ players, positions: fixture.state.steps[0].positions,
      eligible: [fixture.receiver, fixture.partner], candidates: [late.facts, early.facts] });
    assert.equal(result.chosen.opportunityId, 'higher-early'); assert.equal(result.ranked.length, 2);
    assert.equal(result.comparisons[0].reason, 'better-supported-height-class');
    assert.equal(JSON.stringify(fixture.state.recipes), before, 'physical trials do not rewrite the controlled source');
  });

  test(`an attractive cheap-reachable early contact fails the actual peak audit and yields to a feasible later contact (${mirrored ? 'orange' : 'green'})`, () => {
    const fixture = controlledIncoming({ mirrored, receiverDepth: 2.2 });
    const early = physicalOpportunity(fixture, { opportunityId: 'too-fast-early', sourceIndex: 0, time: .8 });
    const late = physicalOpportunity(fixture, { opportunityId: 'feasible-late', sourceIndex: 1, time: fixture.state.solved[0].firstLandingTime * .99 });
    assert.equal(early.trial.ok, true, JSON.stringify(early.trial.findings));
    assert.equal(early.reach.reachable, true, 'the coarse conservative reach check alone cannot accept the actual route');
    assert.equal(early.facts.audit.feetValid, true); assert.equal(early.spacing.valid, true);
    assert.equal(early.movement.valid, false); assert.ok(early.movement.maxPeakFeetPerSecond > 18);
    assert.match(early.movement.reason, /peak speed bound/); assert.equal(early.facts.audit.routeValid, false);
    assert.equal(late.trial.ok, true, JSON.stringify(late.trial.findings));
    assert.equal(late.reach.reachable, true); assert.equal(late.movement.valid, true); assert.equal(late.spacing.valid, true);
    const proposal = opportunity => ({ opportunityId: opportunity.facts.opportunityId,
      preference: contactOpportunityPreferenceV1({ contact: opportunity.facts.contact, stance: opportunity.facts.stance,
        origin: fixture.state.steps[0].positions[fixture.receiver], team: players[fixture.receiver].team,
        feasibleReplyIds: opportunity.facts.feasibleReplyIds, attackingReplyAvailable: opportunity.facts.attackingReplyAvailable,
        availableSeconds: opportunity.facts.availableSeconds }) });
    assert.ok(compareContactOpportunityPreferencesV1(proposal(early), proposal(late)) < 0, 'geometry makes the unaudited early proposal look preferable');
    const result = rankContactOpportunitiesV1({ players, positions: fixture.state.steps[0].positions,
      eligible: [fixture.receiver, fixture.partner], candidates: [early.facts, late.facts] });
    assert.equal(result.chosen.opportunityId, 'feasible-late');
    assert.equal(result.excluded[0].opportunityId, 'too-fast-early'); assert.equal(result.excluded[0].reason, 'actual-route-infeasible');
  });
}
