// Versioned physical planning shared by authored compilation and the rally engine.
// A trial clones only the pending tail; finalized prefix records are reused.
import { compilePlayTimeline, resolveShotSemantics, boardToWorld, STROKE_PROFILES } from './three-d-core.js';
import { REACH_MODEL } from './rally-tactics.js';
import { solveFlightV2, interceptFlightV2, solveServePreparationV2, PHYSICS_VERSION } from './play-physics-v2.js';
import { createModel2SegmentV2, holdModel2TerminalSegmentV2 } from './play-timeline-v2.js';
import { inspectModel2SegmentV2, inspectModel2ContactV2, inspectBodyPathV2, resolveModel2OutcomeCandidates, derivedOutcomeForDecisionV2, analyzeModel2Outcome } from './play-outcome-v2.js';
import { teamForPlayer } from './rally-state.js';

export const PLANNING_VERSION = 'play-planning-v2';
const copy=value=>structuredClone(value);
const IDS=['player1','player2','player3','player4'];
const xy=p=>({x:p.x,y:p.y});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finding=(shotId,message,kind='rule',severity='error')=>Object.freeze({kind,severity,shotId,message});
const records=new WeakMap(),trials=new WeakMap(),ownedFlights=new WeakMap();
let nextOwnedFlight=0;
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
      ownedFlights.set(flight,++nextOwnedFlight);
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

function patchPendingMovement(state,pendingRecipe,{trialDraft=false}={}) {
  if(!state.pendingRecipe)throw new TypeError('There is no pending recipe to repair.');
  const invariant=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['movement','playerMovement'].includes(key)));
  if(JSON.stringify(invariant(pendingRecipe))!==JSON.stringify(invariant(state.pendingRecipe)))throw new TypeError('A pending repair may change only movement and playerMovement.');
  const steps=state.steps.slice(),original=steps.at(-1);
  // A trial immediately deep-clones this private draft in buildRecipe. Copy
  // only branches replaced here; standalone tail replacement still detaches
  // the entire step before exposing it through the live planning state.
  const step=trialDraft?{...original,shot:{...original.shot}}:copy(original),previous=steps.at(-2),stance=footCenter(step.shot.contact.feet);
  const positions=copy(previous.positions);positions[pendingRecipe.hitter]=movementTarget(pendingRecipe.movement,stance);
  for(const[id,command]of Object.entries(pendingRecipe.playerMovement||{}))positions[id]=movementTarget(command,previous.positions[id]);
  positions.ball=copy(step.positions.ball);step.positions=positions;
  step.shot.authoring={...(trialDraft?pendingRecipe:copy(pendingRecipe)),recipeId:pendingRecipe.id};
  steps[steps.length-1]=step;
  const locks=new Map(state.pendingLocksBefore);
  for(const[id,command]of [[pendingRecipe.hitter,pendingRecipe.movement],...Object.entries(pendingRecipe.playerMovement||{})]){
    if(command.pinned)locks.set(id,xy(positions[id]));else locks.delete(id);
  }
  return {...state,steps,play:{...state.play,steps},locks,pendingRecipe:trialDraft?pendingRecipe:copy(pendingRecipe)};
}

function segmentFor(previous,step,nextStep,index,startTime,momentum) {
  return createModel2SegmentV2({previous,step,nextStep,index,startTime,model2Momentum:momentum},adapters);
}

// Generator-only tail repair. Reuse the finalized prefix and flight solution;
// invalidate outstanding trials just as a committed contact would.
export function replacePendingMovementV2(state,pendingRecipe) {
  assertState(state);
  const next=patchPendingMovement(state,pendingRecipe),index=state.solved.length;
  next.recipes=state.recipes.slice();next.recipes[index-1]=copy(pendingRecipe);
  next.pendingSegment=segmentFor(next.steps[index-1],next.steps[index],null,index,state.cursor,state.momentum);
  next.revision=state.revision+1;
  Object.assign(state,next);return state;
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

// Exact private JSON proof, not a hash or a public trial's mutable data.
// No coercion, accessors, sparse/undefined values, functions, exotic objects or
// cycles can alias a different physical input into the same proof.
function strictInspectionJSON(value) {
  return JSON.stringify(value,function(key,item){
    const descriptor=Object.getOwnPropertyDescriptor(this,key);
    if(descriptor&&(!Object.hasOwn(descriptor,'value')||!Object.is(descriptor.value,item)))throw new TypeError('Uncacheable inspection input.');
    if(item===null)return item;
    const type=typeof item;
    if(type==='number'){if(!Number.isFinite(item)||Object.is(item,-0))throw new TypeError('Uncacheable inspection input.');return item;}
    if(type==='string'||type==='boolean')return item;
    if(type!=='object')throw new TypeError('Uncacheable inspection input.');
    const array=Array.isArray(item),prototype=Object.getPrototypeOf(item);
    if((!array&&prototype!==Object.prototype&&prototype!==null)||Object.getOwnPropertySymbols(item).length
      ||Object.getOwnPropertyNames(item).length!==Object.keys(item).length+(array?1:0))throw new TypeError('Uncacheable inspection input.');
    return item;
  });
}
function proofField(value,key) {
  if(value===null)return null;
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor){if(key in value)throw new TypeError('Uncacheable inspection input.');return null;}
  if(!Object.hasOwn(descriptor,'value')||descriptor.value===undefined)throw new TypeError('Uncacheable inspection input.');
  return descriptor.value;
}
function previousInspectionProof(state,segment,index,prior,solved) {
  try {
    if(!ownedFlights.has(solved)||(prior&&!ownedFlights.has(prior.solved)))return null;
    // Only the immediately inspected tail and the prior fields actually read
    // by verifySegment are included. Owned immutable solvers use private IDs;
    // fresh trajectory wrappers and future outgoing art/flight are not inputs.
    const descriptors=Object.getOwnPropertyDescriptors(state.play);
    if(Object.values(descriptors).some(item=>!Object.hasOwn(item,'value')))return null;
    const header=Object.fromEntries(Object.entries(descriptors).filter(([key])=>key!=='steps').map(([key,item])=>[key,item.value]));
    const first=state.play.steps.find(step=>step.shot)?.shot,next=segment.nextShotSemantics;
    const firstService=first?{family:proofField(first,'family'),type:proofField(first,'type'),playerId:proofField(first,'playerId'),hitter:proofField(first,'hitter'),
      kind:proofField(proofField(first,'contact'),'kind'),receiver:proofField(first,'receiver'),authoredReceiver:proofField(proofField(first,'authoring'),'receiver')}:null;
    const priorShot=prior?proofField(proofField(prior.segment,'step'),'shot'):null;
    const priorContext=prior?{solved:ownedFlights.get(prior.solved),actor:proofField(proofField(prior.segment,'shotSemantics'),'playerId'),
      endTimeSeconds:proofField(proofField(priorShot,'physicsV2'),'endTimeSeconds'),receiver:proofField(proofField(priorShot,'authoring'),'receiver')}:null;
    return strictInspectionJSON({header,firstService,index,terminal:false,solved:ownedFlights.get(solved),prior:priorContext,
      segment:{modelVersion:segment.modelVersion,index:segment.index,startTime:segment.startTime,endTime:segment.endTime,
        duration:segment.duration,originalDuration:segment.originalDuration,contactTime:segment.contactTime,
        rallyLeg:segment.rallyLeg,previousPositions:segment.previous.positions,stepId:segment.step.id,
        positions:segment.step.positions,shot:segment.step.shot,
        actor:segment.shotSemantics.playerId,contact:segment.shotSemantics.contact,model2Momentum:segment.model2Momentum,
        nextContact:next?{playerId:next.playerId,contact:next.contact,sourceContact:segment.nextStep.shot.contact}:null}});
  }catch{return null;}
}
function copyInspection(inspection) {
  return {solved:inspection.solved,violations:copy(inspection.violations),
    physicalCandidates:copy(inspection.physicalCandidates),momentumCandidates:copy(inspection.momentumCandidates)};
}
function freezeInspectionData(value) {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(freezeInspectionData);Object.freeze(value);
  }
  return value;
}
function privateInspection(inspection) {
  const result=copyInspection(inspection);
  for(const field of ['violations','physicalCandidates','momentumCandidates'])freezeInspectionData(result[field]);
  return Object.freeze(result);
}

export function trialRecipeV2(state,recipe,{pendingRecipe,inspect=true,buildOnly=false,capturePreviousInspection=false,reusePreviousTrial,capturePendingEvents=false}={}) {
  assertState(state);
  let working=state,construction;
  try {
    if(pendingRecipe)working=patchPendingMovement(state,pendingRecipe,{trialDraft:true});
    construction=buildRecipe(working,recipe);
  } catch(error) {
    construction={built:false,recipe,findings:[finding(recipe?.id??null,error.message,'feasibility')]};
  }
  const result={...construction,ok:construction.built&&!construction.findings.some(item=>item.severity==='error'),
    reason:construction.findings[0]?.message??'',resolvedPrevious:null,pendingSegment:null,previousInspectionReused:false,
    acceptedPendingRecipe:pendingRecipe?copy(working.pendingRecipe):null};
  if(construction.built){
    const index=working.solved.length,steps=working.steps.slice();
    if(index)steps[steps.length-1]=construction.previousResolved;
    steps.push(construction.step);
    let cursor=working.cursor,inspection=null,previousAudit=null;
    const finalizedSegments=working.finalizedSegments.slice(),finalizedInspections=working.finalizedInspections.slice();
    if(index&&!buildOnly){
      const segment=segmentFor(steps[index-1],steps[index],construction.step,index,cursor,working.momentum);
      result.resolvedPrevious=segment;cursor=segment.endTime;finalizedSegments.push(segment);
      if(inspect){
        const prior=previousContext(working),solved=working.solved.at(-1);
        const reusable=trials.get(reusePreviousTrial);
        const mayReuse=reusable?.owner===state&&reusable.revision===state.revision&&reusable.previousAudit;
        const proof=capturePreviousInspection||mayReuse?previousInspectionProof(working,segment,index-1,prior,solved):null;
        if(proof!==null&&reusable?.owner===state&&reusable.revision===state.revision&&reusable.previousAudit?.proof===proof){
          inspection=copyInspection(reusable.previousAudit.inspection);result.previousInspectionReused=true;
        }else inspection=inspectModel2SegmentV2(working.play,segment,{index:index-1,prior,terminal:false,solved});
        if(capturePreviousInspection&&proof!==null)previousAudit={proof,inspection:privateInspection(inspection)};
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
    // These two private fields may share a detached snapshot while a trial is
    // uncommitted. Commit separates them before either enters the live state.
    const acceptedRecipe=copy(recipe);
    const next={...working,steps,play:{...working.play,steps},solved:[...working.solved,construction.flight],locks:construction.locks,
      findings:[...working.findings,...result.findings],recipes:[...working.recipes,acceptedRecipe],
      revision:state.revision+1,cursor,finalizedSegments,finalizedInspections,momentum,pendingSegment:pending,
      pendingRecipe:acceptedRecipe,pendingLocksBefore:new Map(working.locks)};
    if(pendingRecipe)next.recipes[next.recipes.length-2]=copy(pendingRecipe);
    // Opt in only for callers that inspect uncommitted outgoing geometry.
    // Bind the exposed nested segment to its original physical inputs without
    // copying or registering the private next state as a public planning state.
    const pendingEventsProof=capturePendingEvents&&pending?previousInspectionProof(next,pending,index,previousContext(next),construction.flight):null;
    trials.set(result,{owner:state,revision:state.revision,next,previousAudit,pendingEventsProof});
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
  Object.assign(state,record.next,{pendingRecipe:copy(record.next.pendingRecipe)});return state;
}

export function planningPlayV2(state,{ending=state.play.ending,outcome=state.play.outcome}={}) {
  assertState(state);
  return planningPlay(state,{ending,outcome});
}

function planningPlay(state,{ending,outcome}) {
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
  return inspectPendingLeg(state,{terminal,ending});
}

function inspectPendingLeg(state,{terminal,ending}) {
  if(!state.pendingSegment)return {decision:null,derivedOutcome:null,violations:[],physicalCandidates:[],momentumCandidates:[],segment:null};
  const play=planningPlay(state,{ending,outcome:null});
  const index=state.solved.length,segment=segmentFor(play.steps[index-1],play.steps[index],null,index,state.cursor,state.momentum);
  const inspection=inspectModel2SegmentV2(play,segment,{index:index-1,prior:previousContext(state),terminal,solved:state.solved.at(-1)});
  const history=state.finalizedInspections.filter(Boolean);
  const physicalCandidates=[...history.flatMap(item=>item.physicalCandidates),...inspection.physicalCandidates];
  const momentumCandidates=[...history.flatMap(item=>item.momentumCandidates),...inspection.momentumCandidates];
  const {decision}=resolveModel2OutcomeCandidates(physicalCandidates,momentumCandidates);
  return {...inspection,physicalCandidates,momentumCandidates,decision,derivedOutcome:derivedOutcomeForDecisionV2(decision),segment,
    violations:[...history.flatMap(item=>item.violations),...inspection.violations]};
}

// Inspect the complete outgoing physical span without classifying terminal reach.
// terminal:false alone defaults to a first-bounce stop in the legacy API.
export function inspectPendingEventsV2(state) {
  return inspectPendingLegV2(state,{terminal:false,ending:'winner'});
}

export function inspectPlanningTrialEventsV2(state,trial) {
  return inspectPendingLeg(verifiedTrialNext(state,trial),{terminal:false,ending:'winner'});
}

function verifiedTrialNext(state,trial) {
  assertState(state);
  const record=trials.get(trial);
  if(!record||record.owner!==state||record.revision!==state.revision)throw new TypeError('A trial belongs to a different or stale planning state.');
  if(!trial.ok||!record.next?.pendingSegment)throw new TypeError('A valid built planning trial with a pending segment is required.');
  const next=record.next,index=next.solved.length-1;
  const proof=previousInspectionProof(next,next.pendingSegment,index,previousContext(next),next.solved.at(-1));
  if(record.pendingEventsProof===null||proof!==record.pendingEventsProof)throw new TypeError('The planning trial inspection inputs were mutated or are unsupported.');
  return next;
}

export function inspectPlanningTrialBodyV2(state,trial,{actors}={}) {
  const next=verifiedTrialNext(state,trial);
  return inspectBodyPathV2(next.pendingSegment,next.solved.at(-1),actors);
}

export function inspectPlanningTrialContactV2(state,trial) {
  const next=verifiedTrialNext(state,trial);
  return inspectModel2ContactV2(next.play,next.pendingSegment,{index:next.solved.length-1,
    prior:previousContext(next),solved:next.solved.at(-1)});
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
