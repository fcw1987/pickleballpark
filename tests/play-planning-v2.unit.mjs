import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDocument } from '../play-compiler.js';
import { samplePlayBall, samplePlayState } from '../three-d-core.js';
import { sampleActorBoardPositionV2 } from '../play-actors-v2.js';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2,
  planningPlayV2, inspectPendingLegV2, finishPlanningV2 } from '../play-planning-v2.js';
import { MODEL2_CASES, readModel2Fixture } from './fixtures/model2/cases.mjs';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

const json=value=>JSON.stringify(value);
const snapshot=state=>json({play:state.play,recipes:state.recipes,findings:state.findings,
  locks:[...state.locks],revision:state.revision,cursor:state.cursor});
function plan(document) {
  const state=createPlanningStateV2(document);
  for(const recipe of document.shots){
    const before=snapshot(state),source=json(recipe),trial=trialRecipeV2(state,recipe);
    assert.equal(snapshot(state),before,'a trial may not alter live planning state');
    assert.equal(json(recipe),source,'a trial may not alter its source recipe');
    assert.equal(trial.ok,true,json(trial.findings));
    commitPlanningTrialV2(state,trial);
  }
  return state;
}

for(const {id} of MODEL2_CASES) {
  test(`shared incremental planning preserves ${id} geometry, actors and terminal evidence`,()=>{
    const document=readModel2Fixture(id),source=json(document),compiled=compileDocument(document),state=plan(document);
    const result=finishPlanningV2(state,{ending:document.ending,outcome:document.outcome,compileTimeline:true});
    assert.equal(json(result.play),json(compiled.play));
    assert.equal(json(result.timeline),json(compiled.timeline));
    assert.equal(result.analysis.violations.length,0);
    if(document.ending!=='stop')assert.deepEqual(result.derivedOutcome,document.outcome);
    const times=new Set([0,compiled.timeline.duration,...compiled.timeline.events.flatMap(event=>[
      Math.max(0,event.time-1e-6),event.time,Math.min(compiled.timeline.duration,event.time+1e-6)])]);
    for(const time of times){
      assert.deepEqual(samplePlayBall(result.timeline,time),samplePlayBall(compiled.timeline,time));
      const sample=samplePlayState(compiled.timeline,time);
      const raw=result.rawSegments.find(segment=>time<segment.endTime-1e-9)||result.rawSegments.at(-1);
      for(const actor of Object.keys(document.players))assert.deepEqual(
        sampleActorBoardPositionV2(raw,actor,time-raw.startTime),sample.positions[actor],`${id}/${actor}/${time}`);
    }
    assert.equal(json(document),source);
  });
}

test('two and three contacts finalize only the pending tail, preserving earlier records',()=>{
  const document=readModel2Fixture('opening-third-volley'),state=createPlanningStateV2(document);
  const first=trialRecipeV2(state,document.shots[0]);commitPlanningTrialV2(state,first);
  const unresolved=state.steps[1],second=trialRecipeV2(state,document.shots[1]);
  assert.notEqual(second.previousResolved,unresolved);
  assert.equal(unresolved.shot.physicsV2.endpoint,'terminal');
  assert.equal(second.previousResolved.shot.physicsV2.endpoint,'next-contact');
  commitPlanningTrialV2(state,second);
  const finalizedStep=state.steps[1],finalizedSegment=state.finalizedSegments[0],frozenBytes=json(finalizedStep);
  const third=trialRecipeV2(state,document.shots[2]);commitPlanningTrialV2(state,third);
  assert.equal(state.steps[1],finalizedStep);
  assert.equal(state.finalizedSegments[0],finalizedSegment);
  assert.equal(json(finalizedStep),frozenBytes);
  assert.equal(state.finalizedSegments.length,2);
  assert.equal(state.pendingSegment.rallyLeg,3);
  assert.equal(state.cursor,state.finalizedSegments.at(-1).endTime);
});

test('movement-only pending repair records exact accepted source and matches final compilation',()=>{
  const first=model2Shot({id:'first'}),second=model2Shot({id:'second',hitter:'player3',target:{x:7,y:14}});
  const document=model2Document({ending:'stop',shots:[first,second]}),state=createPlanningStateV2(document);
  commitPlanningTrialV2(state,trialRecipeV2(state,first));
  const pendingRecipe=structuredClone(first);
  pendingRecipe.playerMovement={player2:{intent:'manual',pinned:false,target:{x:14,y:14}}};
  const trial=trialRecipeV2(state,second,{pendingRecipe});
  assert.equal(trial.ok,true,json(trial.findings));
  assert.deepEqual(trial.acceptedPendingRecipe,pendingRecipe);
  assert.equal(first.playerMovement,undefined);
  commitPlanningTrialV2(state,trial);
  const accepted={...document,shots:[pendingRecipe,second]};
  assert.deepEqual(state.recipes,accepted.shots);
  assert.equal(json(finishPlanningV2(state,{ending:'stop'}).play),json(compileDocument(accepted).play));
});

test('pending repair cannot rewrite target, hitter, physics or a finalized prefix',()=>{
  const document=readModel2Fixture('opening-third-volley'),state=createPlanningStateV2(document);
  for(const recipe of document.shots.slice(0,2))commitPlanningTrialV2(state,trialRecipeV2(state,recipe));
  const before=snapshot(state),prefix=state.steps[1];
  for(const change of [recipe=>{recipe.target.x+=1;},recipe=>{recipe.hitter='player4';},recipe=>{recipe.physics={apexFeet:20};}]){
    const pendingRecipe=structuredClone(state.pendingRecipe);change(pendingRecipe);
    const trial=trialRecipeV2(state,document.shots[2],{pendingRecipe});
    assert.equal(trial.ok,false);assert.match(trial.reason,/only movement/);
    assert.throws(()=>commitPlanningTrialV2(state,trial),/only movement/);
    assert.equal(snapshot(state),before);assert.equal(state.steps[1],prefix);
  }
});

test('stale trials and concurrent request states cannot commit into each other',()=>{
  const document=readModel2Fixture('net'),left=createPlanningStateV2(document),right=createPlanningStateV2(document);
  const a=trialRecipeV2(left,document.shots[0]),b=trialRecipeV2(left,document.shots[0]),foreign=trialRecipeV2(right,document.shots[0]);
  assert.throws(()=>commitPlanningTrialV2(right,a),/different or stale/);
  commitPlanningTrialV2(left,a);
  assert.throws(()=>commitPlanningTrialV2(left,b),/different or stale/);
  assert.throws(()=>commitPlanningTrialV2(left,foreign),/different or stale/);
  assert.equal(right.steps.length,1);
});

test('a failed interception never mutates the pending flight or turns search failure into a next contact',()=>{
  const document=readModel2Fixture('net'),state=plan(document),before=snapshot(state);
  const trial=trialRecipeV2(state,model2Shot({id:'phantom',hitter:'player3',target:{x:7,y:14}}));
  assert.equal(trial.ok,false);
  assert.throws(()=>commitPlanningTrialV2(state,trial));
  assert.equal(snapshot(state),before);assert.equal(state.recipes.length,1);
  const ending=inspectPendingLegV2(state);
  assert.equal(ending.derivedOutcome.reason,'net');
  assert.deepEqual(ending.derivedOutcome,document.outcome);
});

test('a censored finish keeps an in-play first landing without inventing a winner',()=>{
  const document=readModel2Fixture('transition-volley'),state=plan({...document,ending:'winner'});
  const before=snapshot(state),result=finishPlanningV2(state,{ending:'stop'});
  assert.equal(snapshot(state),before);
  assert.equal(result.play.ending,'stop');assert.equal(result.play.outcome,null);
  assert.equal(result.play.steps.at(-1).shot.physicsV2.endpoint,'bounce');
  assert.equal(result.decision,null);assert.equal(result.derivedOutcome,null);
  assert.equal(json(result.play),json(compileDocument(document).play));
  assert.equal(planningPlayV2(state).ending,'winner','finishing a snapshot must not rewrite the owned state');
});
