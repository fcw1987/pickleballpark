import test from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS_V2 } from '../play-physics-v2.js';
import { bodyContactEnvelopeMayIntersectV2, inspectModel2SegmentV2 } from '../play-outcome-v2.js';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2 } from '../play-planning-v2.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

const radius=.6+PHYSICS_V2.ballRadiusFeet;
function straightLeg(actorPosition={x:5,y:10}) {
  // The horizontal body geometry is analytic. These raw segment probes do not
  // claim that this own-side demonstration is a completed legal rally.
  const doc=model2Document({ending:'stop',initialLayout:{
    player1:{x:0,y:10},player2:{x:18,y:2},player3:actorPosition,player4:{x:18,y:40},ball:{x:0,y:10}},
    shots:[model2Shot({id:'straight',target:{x:10,y:10}})]});
  const state=createPlanningStateV2(doc),trial=trialRecipeV2(state,doc.shots[0]);
  assert.equal(trial.ok,true,JSON.stringify(trial.findings));commitPlanningTrialV2(state,trial);
  return {state,segment:state.pendingSegment,solved:state.solved[0]};
}
function bodyFor(state,segment,solved,actor='player3') {
  return inspectModel2SegmentV2(state.play,segment,{terminal:false,solved}).physicalCandidates.find(item=>item.reason==='body'&&item.struckActor===actor);
}

test('separated actor envelopes are rejected while a crossing retains its exact analytic collision',()=>{
  const far=straightLeg({x:18,y:10});
  assert.equal(bodyContactEnvelopeMayIntersectV2(far.segment,far.solved,far.solved.firstLandingTime,'player3'),false);
  assert.equal(bodyFor(far.state,far.segment,far.solved),undefined);
  const crossing=straightLeg(),event=bodyFor(crossing.state,crossing.segment,crossing.solved);
  assert.equal(bodyContactEnvelopeMayIntersectV2(crossing.segment,crossing.solved,crossing.solved.firstLandingTime,'player3'),true);
  const expected=(5-radius)*crossing.solved.firstLandingTime/10;
  assert.ok(Math.abs(event.afterContactSeconds-expected)<1e-10);
});

test('near-grazing torso contact is kept and its negative counterpart is still a miss',()=>{
  const delta=.001,hit=straightLeg({x:5,y:10+radius-delta}),miss=straightLeg({x:5,y:10+radius+delta});
  const event=bodyFor(hit.state,hit.segment,hit.solved);
  const expected=(5-Math.sqrt(radius**2-(radius-delta)**2))*hit.solved.firstLandingTime/10;
  assert.ok(event,'a broad phase may not discard a grazing contact');
  assert.ok(Math.abs(event.afterContactSeconds-expected)<1e-10);
  assert.equal(bodyContactEnvelopeMayIntersectV2(hit.segment,hit.solved,hit.solved.firstLandingTime,'player3'),true);
  assert.equal(bodyContactEnvelopeMayIntersectV2(miss.segment,miss.solved,miss.solved.firstLandingTime,'player3'),false);
  assert.equal(bodyFor(miss.state,miss.segment,miss.solved),undefined);
});

test('the ball envelope is clipped to the represented interception time',()=>{
  const {segment,solved}=straightLeg();
  assert.equal(bodyContactEnvelopeMayIntersectV2(segment,solved,solved.firstLandingTime*.25,'player3'),false);
  assert.equal(bodyContactEnvelopeMayIntersectV2(segment,solved,solved.firstLandingTime,'player3'),true);
});

test('a prior volley momentum route remains in the actor envelope and produces the same swept collision',()=>{
  const {state,segment,solved}=straightLeg({x:20,y:10}),duration=solved.firstLandingTime;
  assert.equal(bodyContactEnvelopeMayIntersectV2(segment,solved,duration,'player3'),false);
  const base=segment.startTime+segment.contactTime;
  const withMomentum={...segment,model2Momentum:[{actor:'player3',contactTime:base,time:base+duration/2,
    from:{x:20,y:10},to:{x:5,y:10}}]};
  assert.equal(bodyContactEnvelopeMayIntersectV2(withMomentum,solved,duration,'player3'),true);
  const event=bodyFor(state,withMomentum,solved);
  const expected=(20-radius)*duration/40;
  assert.ok(event);
  assert.ok(Math.abs(event.afterContactSeconds-expected)<1e-10);
});

test('contact plants are covered even when both ordinary route endpoints lie outside the ball envelope',()=>{
  const {segment,solved}=straightLeg();
  const positions={...segment.previous.positions,player1:{x:20,y:10}};
  const contact={...segment.shotSemantics.contact,feet:[{x:4.58,y:10},{x:5.42,y:10}]};
  const withPlant={...segment,previous:{...segment.previous,positions},step:{...segment.step,positions},
    shotSemantics:{...segment.shotSemantics,contact}};
  assert.equal(bodyContactEnvelopeMayIntersectV2(withPlant,solved,solved.firstLandingTime,'player1'),true);
  const withoutPlant={...withPlant,shotSemantics:{...withPlant.shotSemantics,playerId:'player2'}};
  assert.equal(bodyContactEnvelopeMayIntersectV2(withoutPlant,solved,solved.firstLandingTime,'player1'),false);
});
