import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanningStateV2,trialRecipeV2,commitPlanningTrialV2,inspectPlanningTrialSafetyV2,
  inspectPlanningTrialEventsV2,finishPlanningV2,createGenerationPlanningSessionV2,observeGenerationPlanningSessionV2,
  probeGenerationIncomingV2,probeGenerationReplyV2,commitGenerationRecipeV2,finishGenerationPlanningV2,
  replaceGenerationPendingMovementV2} from '../play-planning-v2.js';
import {inspectGeneratedMovementV1,inspectGeneratedSpacingV1,sampleFeetStateV1} from '../rally-movement.js';
import {sampleActorBoardPositionV2} from '../play-actors-v2.js';
import {MODEL2_CASES,readModel2Fixture} from './fixtures/model2/cases.mjs';
const json=JSON.stringify;
for(const {id} of MODEL2_CASES)test(`private generation session matches public ${id} planning and evidence`,()=>{
  const source=readModel2Fixture(id),before=json(source),state=createPlanningStateV2(source),session=createGenerationPlanningSessionV2(source);
  assert.deepEqual(Reflect.ownKeys(session),[]);assert.ok(Object.isFrozen(session));
  for(const recipe of source.shots){
    const view=observeGenerationPlanningSessionV2(session);assert.equal(observeGenerationPlanningSessionV2(session),view);
    const publicTrial=trialRecipeV2(state,recipe,{capturePendingEvents:true});
    const probe=probeGenerationIncomingV2(session,recipe);
    assert.equal(probe.ok,publicTrial.ok);assert.equal(probe.reason,publicTrial.reason);
    if(publicTrial.resolvedPrevious){
      assert.deepEqual(probe.movement,inspectGeneratedMovementV1(publicTrial.resolvedPrevious));
      assert.deepEqual(probe.spacing,inspectGeneratedSpacingV1(publicTrial.resolvedPrevious));
      assert.deepEqual(probe.footState,sampleFeetStateV1(publicTrial.resolvedPrevious,publicTrial.resolvedPrevious.duration));
      for(const actor of Object.keys(source.players))assert.deepEqual(probe.positions[actor],sampleActorBoardPositionV2(publicTrial.resolvedPrevious,actor,publicTrial.resolvedPrevious.duration));
    }
    const actors=Object.keys(source.players).filter(actor=>source.players[actor].team===source.players[recipe.hitter].team);
    const nominal=probeGenerationReplyV2(session,recipe,{incoming:probe.handle,actors,record:true});
    assert.equal(nominal.ok,publicTrial.ok);assert.equal(nominal.reason,publicTrial.reason);
    const safety=inspectPlanningTrialSafetyV2(state,publicTrial,{actors});
    assert.deepEqual(nominal.contactFindings,[...safety.contact.violations,...safety.contact.physicalCandidates,...safety.contact.momentumCandidates]);
    assert.deepEqual(nominal.bodyEvents,safety.bodyEvents);
    const events=inspectPlanningTrialEventsV2(state,publicTrial);
    const delivered=commitGenerationRecipeV2(session,recipe,{incoming:probe.handle});
    if(!delivered.routeValid){
      assert.equal(delivered.inspection,null);assert.equal(observeGenerationPlanningSessionV2(session),view);return;
    }
    assert.equal(json(delivered.inspection),json(events));
    assert.equal(delivered.committed,true);
    commitPlanningTrialV2(state,publicTrial);
    const observed=observeGenerationPlanningSessionV2(session);
    assert.notEqual(view,observed);assert.equal(json(observed.pendingRecipe),json(state.pendingRecipe));
    assert.deepEqual(observed.steps.at(-1).positions,state.steps.at(-1).positions);
    for(const t of [0,state.solved.at(-1).firstLandingTime,state.solved.at(-1).totalDuration])assert.deepEqual(observed.solved.at(-1).sampleBoard(t),state.solved.at(-1).sampleBoard(t));
  }
  const finish=finishGenerationPlanningV2(session,{ending:source.ending,outcome:source.outcome});
  const expected=finishPlanningV2(state,{ending:source.ending,outcome:source.outcome});
  for(const key of Object.keys(expected))assert.equal(json(finish[key]),json(expected[key]),key);
  assert.deepEqual(finish.recipes,state.recipes);assert.equal(json(source),before);
});

test('session observations, probes and original inputs cannot mutate private geometry',()=>{
  const source=readModel2Fixture('transition-volley'),session=createGenerationPlanningSessionV2(source),first=structuredClone(source.shots[0]);
  source.initialLayout.player1.x=999;source.players.player1.name='changed';
  assert.equal(commitGenerationRecipeV2(session,first).committed,true);
  const view=observeGenerationPlanningSessionV2(session),bytes=json(view),recipe=structuredClone(source.shots[1]);
  const probe=probeGenerationIncomingV2(session,recipe),probeBytes=json(probe);
  for(const mutate of [()=>view.pendingRecipe.target.x++,()=>view.pendingSegment.previous.positions.player1.x++,()=>view.solved[0].stages[0].from.x++,()=>probe.contact.x++,()=>probe.feet[0].x++])assert.throws(mutate,TypeError);
  recipe.target.x=999;first.target.x=999;
  assert.equal(json(view),bytes);assert.equal(json(probe),probeBytes);
  assert.throws(()=>observeGenerationPlanningSessionV2({}),/owned/);
});

test('private pending repairs preserve movement-only guard and failed deliveries leave revision view unchanged',()=>{
  const source=readModel2Fixture('transition-volley'),session=createGenerationPlanningSessionV2(source);
  assert.equal(commitGenerationRecipeV2(session,source.shots[0]).committed,true);
  const view=observeGenerationPlanningSessionV2(session),bad=structuredClone(source.shots[0]);bad.target.x++;
  assert.throws(()=>replaceGenerationPendingMovementV2(session,bad),/only movement/);
  const recipe=structuredClone(source.shots[1]);recipe.contactOverride={x:999,y:999};
  const result=commitGenerationRecipeV2(session,recipe);assert.equal(result.ok,false);
  assert.equal(observeGenerationPlanningSessionV2(session),view);
});

test('private incoming handles reject forgery, cross-session and stale revisions',()=>{
  const source=readModel2Fixture('transition-volley'),a=createGenerationPlanningSessionV2(source),b=createGenerationPlanningSessionV2(source);
  for(const session of [a,b])assert.equal(commitGenerationRecipeV2(session,source.shots[0]).committed,true);
  const recipe=source.shots[1],probe=probeGenerationIncomingV2(a,recipe);
  for(const incoming of [{},Object.freeze({}),probe]){
    assert.throws(()=>probeGenerationReplyV2(a,recipe,{incoming}),/different or stale/);
    assert.throws(()=>commitGenerationRecipeV2(a,recipe,{incoming}),/different or stale/);
  }
  assert.throws(()=>probeGenerationReplyV2(b,recipe,{incoming:probe.handle}),/different or stale/);
  assert.throws(()=>commitGenerationRecipeV2(b,recipe,{incoming:probe.handle}),/different or stale/);
  replaceGenerationPendingMovementV2(a,source.shots[0]);
  assert.throws(()=>probeGenerationReplyV2(a,recipe,{incoming:probe.handle}),/different or stale/);
  assert.throws(()=>commitGenerationRecipeV2(a,recipe,{incoming:probe.handle}),/different or stale/);
});

test('private incoming reuse is exact for contact and repaired endpoint dependencies',()=>{
  const source=readModel2Fixture('transition-volley'),session=createGenerationPlanningSessionV2(source);
  commitGenerationRecipeV2(session,source.shots[0]);
  const recipe=structuredClone(source.shots[1]),probe=probeGenerationIncomingV2(session,recipe);
  const reused=probeGenerationReplyV2(session,recipe,{incoming:probe.handle,actors:['player3','player4']});
  assert.equal(reused.previousInspectionReused,true);
  const changes=[value=>{value.hitter='player4';},value=>{value.contactStyle='backhand';},
    value=>{value.contactTiming={beforeBounceSeconds:.2};value.contactMode='volley';},
    value=>{value.contactEvidence={feet:[{x:7,y:30},{x:8,y:30}],feetEstablishedOutsideNVZ:true};}];
  for(const change of changes){
    const altered=structuredClone(recipe);change(altered);
    const cached=probeGenerationReplyV2(session,altered,{incoming:probe.handle,actors:['player3','player4']}),fresh=probeGenerationReplyV2(session,altered,{actors:['player3','player4']});
    assert.equal(cached.previousInspectionReused,false);
    assert.equal(json({...cached,previousInspectionReused:false}),json(fresh));
  }
  const pending=structuredClone(source.shots[0]);pending.playerMovement={player2:{intent:'manual',pinned:false,target:{x:18,y:10}}};
  const cached=probeGenerationReplyV2(session,recipe,{incoming:probe.handle,pendingRecipe:pending,actors:['player3','player4']});
  assert.equal(cached.previousInspectionReused,false);
  const fresh=probeGenerationReplyV2(session,recipe,{pendingRecipe:pending,actors:['player3','player4']});
  assert.equal(json(cached),json(fresh));
});

test('incoming probe does not solve unrelated outgoing launch physics',()=>{
  const source=readModel2Fixture('transition-volley'),session=createGenerationPlanningSessionV2(source);
  commitGenerationRecipeV2(session,source.shots[0]);
  const recipe=structuredClone(source.shots[1]);recipe.physics={apexFeet:NaN};
  const before=observeGenerationPlanningSessionV2(session),incoming=probeGenerationIncomingV2(session,recipe);
  assert.equal(incoming.ok,true);assert.ok(incoming.movement);assert.ok(incoming.spacing);
  const nominal=probeGenerationReplyV2(session,recipe,{incoming:incoming.handle,actors:['player3','player4']});
  assert.equal(nominal.ok,false);assert.match(nominal.reason,/finite/);
  assert.equal(observeGenerationPlanningSessionV2(session),before);
});

test('delivered unsupported geometry is inspected synchronously and never committed',()=>{
  const source=readModel2Fixture('around-the-post'),session=createGenerationPlanningSessionV2(source);
  const recipe=structuredClone(source.shots[0]);
  recipe.intent='drive';recipe.family='drive';recipe.contactOverride={x:-1.05,y:18};
  source.initialLayout.ball={x:-1.05,y:18};
  const isolated=createGenerationPlanningSessionV2(source),before=observeGenerationPlanningSessionV2(isolated);
  recipe.target={x:-.55,y:32};recipe.physics={apexFeet:2.2};
  const result=commitGenerationRecipeV2(isolated,recipe);
  assert.equal(result.ok,true);assert.equal(result.committed,false);
  assert.ok(result.inspection.violations.length||result.inspection.physicalCandidates.some(candidate=>candidate.unsupportedReason));
  assert.equal(observeGenerationPlanningSessionV2(isolated),before);
});
