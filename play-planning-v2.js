// Versioned physical planning shared by authored compilation and the rally engine.
// A trial clones only the pending tail; finalized prefix records are reused.
import { compilePlayTimeline, resolveShotSemantics, boardToWorld, STROKE_PROFILES } from './three-d-core.js';
import { REACH_MODEL } from './rally-tactics.js';
import { solveFlightV2, interceptFlightV2, solveServePreparationV2, PHYSICS_VERSION } from './play-physics-v2.js';
import { createModel2SegmentV2, holdModel2TerminalSegmentV2 } from './play-timeline-v2.js';
import { inspectModel2SegmentV2, resolveModel2OutcomeCandidates, derivedOutcomeForDecisionV2, analyzeModel2Outcome } from './play-outcome-v2.js';
import { teamForPlayer } from './rally-state.js';

export const PLANNING_VERSION = 'play-planning-v2';
const copy=value=>structuredClone(value);
const IDS=['player1','player2','player3','player4'];
const xy=p=>({x:p.x,y:p.y});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finding=(shotId,message,kind='rule',severity='error')=>Object.freeze({kind,severity,shotId,message});
const records=new WeakMap(),trials=new WeakMap();
const adapters={resolveShotSemantics,boardToWorld};
export function model2ContactKind(recipe){
  if(recipe.family==='serve')return 'serve';
  if(recipe.contactStyle==='short-hop')return 'short-hop';
  if(recipe.contactMode)return recipe.contactMode==='volley'?'volley':'groundstroke';
  return ['volley','overhead'].includes(recipe.family)||recipe.family==='reset'?'volley':'groundstroke';
}
function plant(point,target,side='forehand'){
  const dx=target.x-point.x,dy=target.y-point.y,length=Math.hypot(dx,dy)||1,forward={x:dx/length,y:dy/length};
  const hand=side==='backhand'?-1:1;
  return{x:point.x-forward.x*.8+forward.y*.8*hand,y:point.y-forward.y*.8-forward.x*.8*hand};
}
function footCenter(feet){return{x:(feet[0].x+feet[1].x)/2,y:(feet[0].y+feet[1].y)/2};}
function feetAt(stance){return[{x:stance.x-.42,y:stance.y},{x:stance.x+.42,y:stance.y}];}
function movementTarget(command,at){
  if(command.intent==='manual')return copy(command.target);
  if(command.intent==='advance')return{x:at.x,y:at.y<22?Math.min(14,at.y+4):Math.max(30,at.y-4)};
  if(command.intent==='recover')return{x:at.x+(10-at.x)*.25,y:at.y<22?Math.max(1,at.y-3):Math.min(43,at.y+3)};
  return xy(at);
}
function stroke(recipe){if(recipe.contactStyle==='short-hop')return'short-hop';if(recipe.family==='return')return recipe.contactStyle==='backhand'?'backhand':'forehand';return recipe.family;}


function assertState(state) {
  if(!records.has(state))throw new TypeError('An owned model 2 planning state is required.');
}

export function createPlanningStateV2(source) {
  if(source?.modelVersion!==2||source.physicsVersion!==PHYSICS_VERSION)throw new TypeError('Explicit model 2 and supported physics version required.');
  // Header only: decision histories and an existing source prefix are not copied
  // for each trial. Authored compilation feeds its recipes through the same API.
  const document={id:source.id,title:source.title,modelVersion:2,physicsVersion:PHYSICS_VERSION,
    initialLayout:copy(source.initialLayout),players:copy(source.players),opening:source.opening,
    ending:source.ending??'winner',outcome:source.outcome?copy(source.outcome):null,
    intentionalFault:source.intentionalFault??false,assistance:copy(source.assistance),
    ...(source.service?{service:copy(source.service)}:{})};
  const steps=[{id:'setup',label:'Starting Positions',description:'Model 2 starting state.',durationMs:0,positions:copy(document.initialLayout)}];
  const play={id:document.id,name:document.title,description:'Model 2 physical play',mode:'doubles',modelVersion:2,physicsVersion:PHYSICS_VERSION,
    players:copy(document.players),rally:{openingBouncesSatisfied:document.opening==='midrally',...(document.service?{service:copy(document.service)}:{})},
    ending:document.ending,outcome:document.outcome?copy(document.outcome):null,intentionalFault:document.intentionalFault,assistance:copy(document.assistance),steps};
  const state={version:PLANNING_VERSION,document,play,steps,solved:[],locks:new Map(),findings:[],recipes:[],revision:0,
    finalizedSegments:[],finalizedInspections:[],cursor:0,momentum:[],pendingSegment:null,pendingRecipe:null,pendingLocksBefore:new Map()};
  records.set(state,true);return state;
}

function buildRecipe(state,recipe) {
  const {steps,solved,document}=state,index=solved.length,locks=new Map(state.locks),findings=[];
  let previousResolved=null;
  try {

      const kind=model2ContactKind(recipe),previous=copy(steps.at(-1)),side=recipe.contactStyle==='backhand'?'backhand':'forehand';
      previousResolved=index?previous:null;
      let contact,incoming=null;
      if(index){
        incoming=interceptFlightV2(solved[index-1],{kind,stance:previous.positions[recipe.hitter],contactOverride:recipe.contactOverride,afterBounceSeconds:recipe.contactTiming?.afterBounceSeconds,beforeBounceSeconds:recipe.contactTiming?.beforeBounceSeconds});
        contact=copy(incoming.point);
        previous.shot.physicsV2.endTimeSeconds=incoming.time;previous.shot.physicsV2.endpoint='next-contact';
        previous.shot.to=xy(contact);previous.shot.flight.bounces=incoming.bounces;previous.positions.ball=xy(contact);
      }else{
        const source=recipe.contactOverride||document.initialLayout.ball;
        if(recipe.contactOverride&&distance(source,document.initialLayout.ball)>.025)throw new RangeError('The starting ball must coincide with the first contactOverride.');
        contact={...xy(source),heightFeet:recipe.family==='serve'&&recipe.serveMethod==='drop'?solveServePreparationV2({point:source}).contactHeightFeet:recipe.family==='overhead'?7.5:kind==='short-hop'?.8:2.2};
      }
      const initialStance=index?plant(contact,recipe.target,side):xy(document.initialLayout[recipe.hitter]);
      const feet=recipe.contactEvidence?.feet?copy(recipe.contactEvidence.feet):feetAt(initialStance),stance=footCenter(feet);
      if(distance(stance,contact)>3+.001)findings.push(finding(recipe.id,'Both feet must support a contact within the 3 ft paddle reach model.','feasibility'));
      if(locks.has(recipe.hitter)&&distance(locks.get(recipe.hitter),stance)>.05)findings.push(finding(recipe.id,'The contact cannot move an actor away from an authored pin.','feasibility'));
      if(index){
        const origin=steps[index-1].positions[recipe.hitter],available=incoming.time;
        if(distance(origin,stance)>Math.max(0,available-.12)*14+3+.001)findings.push(finding(recipe.id,'The hitter cannot reach this incoming contact in the represented reaction and travel time.','feasibility'));
        // Endpoint stance, ball and the next stroke share one boundary.
        previous.positions[recipe.hitter]=xy(stance);
      }else{
        const profile=STROKE_PROFILES[stroke(recipe)];
        const available=recipe.family==='serve'&&recipe.serveMethod==='drop'
          ?solveServePreparationV2({point:contact}).totalDuration:profile.duration*profile.contactRatio;
        const travelBudget=Math.max(0,available-REACH_MODEL.reactionSeconds)*REACH_MODEL.speedFeetPerSecond+REACH_MODEL.paddleReachFeet;
        if(distance(document.initialLayout[recipe.hitter],stance)>travelBudget+.001)findings.push(finding(recipe.id,'The initial actor cannot reach the first contact stance in the actual preparation, reaction and travel time.','feasibility'));
      }
      const positions=copy(previous.positions);positions[recipe.hitter]=movementTarget(recipe.movement,stance);
      for(const[id,command]of Object.entries(recipe.playerMovement||{}))positions[id]=movementTarget(command,previous.positions[id]);
      const spec={physicsVersion:PHYSICS_VERSION,from:copy(contact),target:copy(recipe.target),family:recipe.family,
        arc:recipe.arc,pace:recipe.pace,quality:recipe.quality,...(recipe.physics?{physics:copy(recipe.physics)}:{})};
      const flight=solveFlightV2(spec);
      spec.endTimeSeconds=document.ending==='stop'?flight.firstLandingTime:flight.totalDuration;spec.endpoint=document.ending==='stop'?'bounce':'terminal';
      const shot={from:xy(contact),to:xy(flight.sampleBoard(spec.endTimeSeconds)),intendedTarget:copy(recipe.target),type:stroke(recipe),stroke:stroke(recipe),playerId:recipe.hitter,
        contact:{kind,point:copy(contact),heightFeet:contact.heightFeet,strokeSide:side,feet,
          feetEstablishedOutsideNVZ:recipe.contactEvidence?.feetEstablishedOutsideNVZ??true,momentumEntersNonVolleyZone:Boolean(recipe.contactEvidence?.momentum)},
        ...(recipe.contactEvidence?{contactEvidence:copy(recipe.contactEvidence)}:{}),
        flight:{bounces:1,speedMph:flight.launchSpeedMph,apexFeet:flight.metadata.apexFeet,netClearanceInches:flight.metadata.netClearanceInches??0,
          bounceHeightFeet:flight.metadata.bounce.heightFeet,spin:{type:'flat',rpm:0}},physicsV2:spec,authoring:{...copy(recipe),recipeId:recipe.id}};
      // Drop-serve release/bounce lives before the rally contact, never in the
      // opening bounce count; the timeline uses this opt-in evidence explicitly.
      if(recipe.family==='serve'&&recipe.serveMethod==='drop')shot.servePreparation={method:'drop',releaseHeightFeet:3.5,reboundDuration:.3};
      positions.ball=xy(flight.sampleBoard(spec.endTimeSeconds));
      const step={id:recipe.id,label:recipe.narration?.label||`${index+1}. ${recipe.intent||recipe.family}`,
        description:recipe.narration?.why||`Model 2 ${recipe.family}.`,durationMs:850,positions,shot};
      for(const[id,command]of [[recipe.hitter,recipe.movement],...Object.entries(recipe.playerMovement||{})]){
        if(command.pinned)locks.set(id,xy(positions[id]));else locks.delete(id);
      }
      for(const id of IDS){
        const command=id===recipe.hitter?recipe.movement:recipe.playerMovement?.[id];
        if(command?.waypoints?.length)findings.push(finding(recipe.id,'Movement waypoints are retained; this model uses the final bounded movement destination.','unsupported','warning'));
      }

    return {built:true,findings,recipe:copy(recipe),contact,feet,stance,incoming,flight,step,previousResolved,locks};
  } catch(error) {
    findings.push(finding(recipe?.id??null,error.message,'feasibility'));
    return {built:false,findings,recipe,previousResolved};
  }
}

function patchPendingMovement(state,pendingRecipe) {
  if(!state.pendingRecipe)throw new TypeError('There is no pending recipe to repair.');
  const invariant=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['movement','playerMovement'].includes(key)));
  if(JSON.stringify(invariant(pendingRecipe))!==JSON.stringify(invariant(state.pendingRecipe)))throw new TypeError('A pending repair may change only movement and playerMovement.');
  const steps=state.steps.slice(),step=copy(steps.at(-1)),previous=steps.at(-2),stance=footCenter(step.shot.contact.feet);
  const positions=copy(previous.positions);positions[pendingRecipe.hitter]=movementTarget(pendingRecipe.movement,stance);
  for(const[id,command]of Object.entries(pendingRecipe.playerMovement||{}))positions[id]=movementTarget(command,previous.positions[id]);
  positions.ball=copy(step.positions.ball);step.positions=positions;
  step.shot.authoring={...copy(pendingRecipe),recipeId:pendingRecipe.id};
  steps[steps.length-1]=step;
  const locks=new Map(state.pendingLocksBefore);
  for(const[id,command]of [[pendingRecipe.hitter,pendingRecipe.movement],...Object.entries(pendingRecipe.playerMovement||{})]){
    if(command.pinned)locks.set(id,xy(positions[id]));else locks.delete(id);
  }
  return {...state,steps,play:{...state.play,steps},locks,pendingRecipe:copy(pendingRecipe)};
}

function segmentFor(previous,step,nextStep,index,startTime,momentum) {
  return createModel2SegmentV2({previous,step,nextStep,index,startTime,model2Momentum:momentum},adapters);
}
function momentumFor(segment) {
  const evidence=segment.step.shot.authoring?.contactEvidence?.momentum;
  if(!evidence)return null;
  const feet=segment.shotSemantics.contact.feet,base=segment.startTime+segment.contactTime;
  const center=values=>({x:(values[0].x+values[1].x)/2,y:(values[0].y+values[1].y)/2});
  return Object.freeze({actor:segment.shotSemantics.playerId,shotId:segment.step.id,contactTime:base,time:base+evidence.afterContactSeconds,
    feet:Object.freeze(evidence.feet.map(p=>Object.freeze({...p}))),fromFeet:feet,
    from:Object.freeze(center(feet)),to:Object.freeze(center(evidence.feet)),balanced:evidence.balanced});
}
function previousContext(state) {
  const segment=state.finalizedSegments.at(-1);
  return segment?{segment,solved:state.solved.at(-2)}:null;
}

export function trialRecipeV2(state,recipe,{pendingRecipe,inspect=true,buildOnly=false}={}) {
  assertState(state);
  let working=state,construction;
  try {
    if(pendingRecipe)working=patchPendingMovement(state,pendingRecipe);
    construction=buildRecipe(working,recipe);
  } catch(error) {
    construction={built:false,recipe,findings:[finding(recipe?.id??null,error.message,'feasibility')]};
  }
  const result={...construction,ok:construction.built&&!construction.findings.some(item=>item.severity==='error'),
    reason:construction.findings[0]?.message??'',resolvedPrevious:null,pendingSegment:null,
    acceptedPendingRecipe:pendingRecipe?copy(working.pendingRecipe):null};
  if(construction.built){
    const index=working.solved.length,steps=working.steps.slice();
    if(index)steps[steps.length-1]=construction.previousResolved;
    steps.push(construction.step);
    let cursor=working.cursor,inspection=null;
    const finalizedSegments=working.finalizedSegments.slice(),finalizedInspections=working.finalizedInspections.slice();
    if(index&&!buildOnly){
      const segment=segmentFor(steps[index-1],steps[index],construction.step,index,cursor,working.momentum);
      result.resolvedPrevious=segment;cursor=segment.endTime;finalizedSegments.push(segment);
      if(inspect){
        inspection=inspectModel2SegmentV2(working.play,segment,{index:index-1,prior:previousContext(working),terminal:false,solved:working.solved.at(-1)});
        for(const issue of inspection.violations)result.findings.push(finding(issue.stepId||issue.shotId||recipe.id,issue.message,issue.category==='model'?'feasibility':'rule'));
        const decisive=resolveModel2OutcomeCandidates(inspection.physicalCandidates,inspection.momentumCandidates).decision;
        if(inspection.physicalCandidates.length){
          result.terminalBeforeNextContact=decisive;
          result.findings.push(finding(steps[index].id,'The pending flight has a decisive physical event before the proposed next contact.','rule'));
        }
      }
      finalizedInspections.push(inspection);
    }
    const pending=buildOnly?null:segmentFor(steps.at(-2),construction.step,null,index+1,cursor,working.momentum);
    const extra=pending?momentumFor(pending):null,momentum=extra?[...working.momentum,extra]:working.momentum;
    if(pending)pending.model2Momentum=momentum;result.pendingSegment=pending;
    const next={...working,steps,play:{...working.play,steps},solved:[...working.solved,construction.flight],locks:construction.locks,
      findings:[...working.findings,...result.findings],recipes:[...working.recipes,copy(recipe)],
      revision:state.revision+1,cursor,finalizedSegments,finalizedInspections,momentum,pendingSegment:pending,
      pendingRecipe:copy(recipe),pendingLocksBefore:new Map(working.locks)};
    if(pendingRecipe)next.recipes[next.recipes.length-2]=copy(pendingRecipe);
    trials.set(result,{owner:state,revision:state.revision,next});
  }else trials.set(result,{owner:state,revision:state.revision,next:null});
  result.ok=result.built&&!result.findings.some(item=>item.severity==='error');
  result.reason=result.findings[0]?.message??'';
  return Object.freeze(result);
}

export function commitPlanningTrialV2(state,trial,{allowInvalid=false}={}) {
  assertState(state);
  const record=trials.get(trial);
  if(!record||record.owner!==state||record.revision!==state.revision)throw new TypeError('A trial belongs to a different or stale planning state.');
  if(!trial.ok&&!allowInvalid)throw new TypeError(trial.reason||'An invalid planning trial cannot be committed.');
  if(!record.next){
    if(!allowInvalid)throw new TypeError('A failed recipe cannot be committed.');
    if(trial.previousResolved&&state.steps.length>1){
      state.steps=state.steps.slice();state.steps[state.steps.length-1]=trial.previousResolved;state.play={...state.play,steps:state.steps};
    }
    state.findings.push(...trial.findings);state.revision++;
    return state;
  }
  Object.assign(state,record.next);return state;
}

export function planningPlayV2(state,{ending=state.play.ending,outcome=state.play.outcome}={}) {
  assertState(state);
  const steps=state.steps.slice();
  if(ending==='stop'&&steps.length>1){
    const step=copy(steps.at(-1)),solved=state.solved.at(-1),at=solved.sampleBoard(solved.firstLandingTime);
    step.shot.physicsV2.endTimeSeconds=solved.firstLandingTime;step.shot.physicsV2.endpoint='bounce';
    step.shot.to=xy(at);step.positions.ball=xy(at);steps[steps.length-1]=step;
  }
  return {...state.play,ending,outcome:outcome?copy(outcome):null,steps};
}

export function inspectPendingLegV2(state,{terminal=true,ending=terminal?'winner':'stop'}={}) {
  assertState(state);
  if(!state.pendingSegment)return {decision:null,derivedOutcome:null,violations:[],physicalCandidates:[],momentumCandidates:[],segment:null};
  const play=planningPlayV2(state,{ending,outcome:null});
  const index=state.solved.length,segment=segmentFor(play.steps[index-1],play.steps[index],null,index,state.cursor,state.momentum);
  const inspection=inspectModel2SegmentV2(play,segment,{index:index-1,prior:previousContext(state),terminal,solved:state.solved.at(-1)});
  const history=state.finalizedInspections.filter(Boolean);
  const physicalCandidates=[...history.flatMap(item=>item.physicalCandidates),...inspection.physicalCandidates];
  const momentumCandidates=[...history.flatMap(item=>item.momentumCandidates),...inspection.momentumCandidates];
  const {decision}=resolveModel2OutcomeCandidates(physicalCandidates,momentumCandidates);
  return {...inspection,physicalCandidates,momentumCandidates,decision,derivedOutcome:derivedOutcomeForDecisionV2(decision),segment,
    violations:[...history.flatMap(item=>item.violations),...inspection.violations]};
}

export function finishPlanningV2(state,{ending=state.play.ending,outcome=null,deriveOutcome=true,compileTimeline=false}={}) {
  assertState(state);
  const analysis=inspectPendingLegV2(state,{terminal:ending!=='stop',ending});
  const selected=outcome||(deriveOutcome&&ending!=='stop'?analysis.derivedOutcome:null);
  if(selected&&ending!=='stop')ending=teamForPlayer(state.steps.at(-1)?.shot?.playerId,state.play.players)===selected.winner?'winner':'fault';
  const play=planningPlayV2(state,{ending,outcome:selected});
  const segments=state.finalizedSegments.slice();
  if(analysis.segment){
    const last={...analysis.segment};
    if(analysis.decision&&ending!=='stop')holdModel2TerminalSegmentV2(last,analysis.decision);
    segments.push(last);
  }
  const result={play,decision:analysis.decision,derivedOutcome:analysis.derivedOutcome,analysis,rawSegments:segments,
    duration:segments.at(-1)?.endTime??0};
  if(compileTimeline){result.timeline=compilePlayTimeline(play);result.analysis=analyzeModel2Outcome(play,result.timeline);}
  return result;
}
