// Versioned physical planning shared by authored compilation and the rally engine.
// A trial clones only the pending tail; finalized prefix records are reused.
import { compilePlayTimeline, resolveShotSemantics, boardToWorld, STROKE_PROFILES } from './three-d-core.js';
import { REACH_MODEL } from './rally-tactics.js';
import { solveFlightV2, interceptFlightV2, solveServePreparationV2, PHYSICS_VERSION } from './play-physics-v2.js';
import { createModel2SegmentV2, createModel2SegmentFromSolvedV2, holdModel2TerminalSegmentV2 } from './play-timeline-v2.js';
import { inspectModel2SegmentV2, inspectModel2ContactV2, inspectBodyPathV2, resolveModel2OutcomeCandidates, derivedOutcomeForDecisionV2, analyzeModel2Outcome } from './play-outcome-v2.js';
import { teamForPlayer } from './rally-state.js';
import { sampleActorBoardPositionV2 } from './play-actors-v2.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1, sampleFeetStateV1 } from './rally-movement.js';

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

function prepareRecipe(state,recipe) {
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
      return {built:true,findings,recipe,contact,feet,stance,incoming,previousResolved,locks,previous,positions,kind,side,index};
  } catch(error) {
    findings.push(finding(recipe?.id??null,error.message,'feasibility'));
    return {built:false,findings,recipe,previousResolved};
  }
}

function buildRecipe(state,recipe) {
  const prepared=prepareRecipe(state,recipe);
  return prepared.built?materializeRecipe(state,recipe,prepared):prepared;
}
function materializeRecipe(state,recipe,prepared) {
  const {document}=state;
  const {findings,contact,feet,stance,incoming,previousResolved,locks,previous,positions,kind,side,index}=prepared;
  try {
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
// Incoming reuse compares a private detached data tree instead of serializing
// the same physical projection again. Unknown structures never establish reuse.
function inspectionDataKeys(value) {
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
  if((array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)
    ||Object.getOwnPropertySymbols(value).length||'toJSON' in value)return null;
  const keys=Object.keys(value);
  if(Object.getOwnPropertyNames(value).length!==keys.length+(array?1:0)
    ||array&&(keys.length!==value.length||keys.some((key,index)=>key!==String(index))))return null;
  return keys;
}
function captureInspectionData(value,active=new WeakSet()) {
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){
    if(!Number.isFinite(value)||Object.is(value,-0))throw new TypeError('Uncacheable inspection input.');
    return value;
  }
  if(typeof value!=='object'||active.has(value))throw new TypeError('Uncacheable inspection input.');
  const keys=inspectionDataKeys(value);
  if(!keys)throw new TypeError('Uncacheable inspection input.');
  active.add(value);
  const values=keys.map(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!Object.hasOwn(descriptor,'value'))throw new TypeError('Uncacheable inspection input.');
    return captureInspectionData(descriptor.value,active);
  });
  active.delete(value);
  return Object.freeze({array:Array.isArray(value),keys:Object.freeze(keys),values:Object.freeze(values)});
}
function matchesInspectionData(value,proof) {
  if(proof===null||typeof proof!=='object')return Object.is(value,proof);
  if(!value||typeof value!=='object'||Array.isArray(value)!==proof.array)return false;
  const keys=inspectionDataKeys(value);
  if(!keys||keys.length!==proof.keys.length)return false;
  for(let index=0;index<keys.length;index++){
    if(keys[index]!==proof.keys[index])return false;
    const descriptor=Object.getOwnPropertyDescriptor(value,keys[index]);
    if(!Object.hasOwn(descriptor,'value')||!matchesInspectionData(descriptor.value,proof.values[index]))return false;
  }
  return true;
}
function proofField(value,key) {
  if(value===null)return null;
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor){if(key in value)throw new TypeError('Uncacheable inspection input.');return null;}
  if(!Object.hasOwn(descriptor,'value')||descriptor.value===undefined)throw new TypeError('Uncacheable inspection input.');
  return descriptor.value;
}
function previousInspectionProof(state,segment,index,prior,solved,{typed=false,match=null,capture=false}={}) {
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
    const projection={header,firstService,index,terminal:false,solved:ownedFlights.get(solved),prior:priorContext,
      segment:{modelVersion:segment.modelVersion,index:segment.index,startTime:segment.startTime,endTime:segment.endTime,
        duration:segment.duration,originalDuration:segment.originalDuration,contactTime:segment.contactTime,
        rallyLeg:segment.rallyLeg,previousPositions:segment.previous.positions,stepId:segment.step.id,
        positions:segment.step.positions,shot:segment.step.shot,
        actor:segment.shotSemantics.playerId,contact:segment.shotSemantics.contact,model2Momentum:segment.model2Momentum,
        nextContact:next?{playerId:next.playerId,contact:next.contact,sourceContact:segment.nextStep.shot.contact}:null}};
    if(!typed)return strictInspectionJSON(projection);
    if(match&&matchesInspectionData(projection,match))return match;
    return capture?captureInspectionData(projection):null;
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
        const proof=capturePreviousInspection||mayReuse?previousInspectionProof(working,segment,index-1,prior,solved,
          {typed:true,match:mayReuse?reusable.previousAudit.proof:null,capture:capturePreviousInspection}):null;
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

export function inspectPendingLegV2(state,{terminal=true,ending=terminal?'winner':'stop',outcome=null}={}) {
  assertState(state);
  return inspectPendingLeg(state,{terminal,ending,outcome});
}

function inspectPendingLeg(state,{terminal,ending,outcome=null}) {
  if(!state.pendingSegment)return {decision:null,derivedOutcome:null,violations:[],physicalCandidates:[],momentumCandidates:[],segment:null};
  const play=planningPlay(state,{ending,outcome});
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

// Observe contact and body safety against one query-time source verification.
// This grants no acceptance token or commit authority; later queries still
// verify the mutable trial inputs independently.
export function inspectPlanningTrialSafetyV2(state,trial,{actors}={}) {
  const next=verifiedTrialNext(state,trial);
  const contact=inspectModel2ContactV2(next.play,next.pendingSegment,{index:next.solved.length-1,
    prior:previousContext(next),solved:next.solved.at(-1)});
  const bodyEvents=contact.violations.length||contact.physicalCandidates.length||contact.momentumCandidates.length?[]:
    inspectBodyPathV2(next.pendingSegment,next.solved.at(-1),actors);
  return {contact,bodyEvents};
}

export function finishPlanningV2(state,{ending=state.play.ending,outcome=null,deriveOutcome=true,compileTimeline=false}={}) {
  assertState(state);
  const analysis=inspectPendingLegV2(state,{terminal:ending!=='stop',ending,outcome});
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

// Generator sessions never expose their mutable planning state or probe geometry.
const generationSessions=new WeakMap(),generationIncoming=new WeakMap(),generationFlightViews=new WeakMap(),generationPositionViews=new WeakMap();
const generationSafeSamplers=new WeakMap();
function sessionRecord(session){
  const record=generationSessions.get(session);
  if(!record)throw new TypeError('An owned model 2 generation session is required.');
  return record;
}
function assertGenerationRevision(state,revision){
  if(state.revision!==revision)throw new TypeError('The generation session changed during this operation.');
}
function detachedGenerationData(value,seen=new Map()){
  if(value===null||typeof value!=='object'){
    if(typeof value==='function')return generationSafeSamplers.get(value)||Object.freeze((...args)=>detachedGenerationData(value(...args)));
    return value;
  }
  if(ownedFlights.has(value))return generationFlightView(value);
  if(seen.has(value))return seen.get(value);
  const result=Array.isArray(value)?[]:{};seen.set(value,result);
  for(const [key,item]of Object.entries(value))result[key]=detachedGenerationData(item,seen);
  return Object.freeze(result);
}
function generationFlightView(flight){
  let view=generationFlightViews.get(flight);
  if(!view){
    // These two authoritative samplers return fresh frozen primitive records.
    // Their closures read immutable numeric stages, never mutable metadata.
    generationSafeSamplers.set(flight.sample,Object.freeze(seconds=>flight.sample(seconds)));
    generationSafeSamplers.set(flight.sampleBoard,Object.freeze(seconds=>flight.sampleBoard(seconds)));
    const data={};for(const [key,value]of Object.entries(flight))data[key]=detachedGenerationData(value);
    view=Object.freeze(data);generationFlightViews.set(flight,view);
  }
  return view;
}
function generationSegment(input,solved){
  const segment=createModel2SegmentFromSolvedV2(input,adapters,solved);
  generationSafeSamplers.set(segment.trajectory.sample,Object.freeze(seconds=>segment.trajectory.sample(seconds)));
  generationSafeSamplers.set(segment.trajectory.sampleBoard,Object.freeze(seconds=>segment.trajectory.sampleBoard(seconds)));
  return segment;
}
function generationPositions(positions){
  let view=generationPositionViews.get(positions);
  if(!view){view=detachedGenerationData(positions);generationPositionViews.set(positions,view);}
  return view;
}
export function createGenerationPlanningSessionV2(source){
  const session=Object.freeze({});
  generationSessions.set(session,{state:createPlanningStateV2(source),view:null,viewRevision:-1,header:null});
  return session;
}
export function observeGenerationPlanningSessionV2(session){
  const record=sessionRecord(session),state=record.state,revision=state.revision;
  if(record.viewRevision!==revision){
    const sourceHeader={...state.play};delete sourceHeader.steps;
    const header=record.header||detachedGenerationData(sourceHeader);
    const view=Object.freeze({pendingSegment:detachedGenerationData(state.pendingSegment),pendingRecipe:detachedGenerationData(state.pendingRecipe),
      steps:Object.freeze(state.steps.map(step=>Object.freeze({positions:generationPositions(step.positions)}))),
      solved:Object.freeze(state.solved.map(generationFlightView)),play:header});
    assertGenerationRevision(state,revision);
    record.header=header;record.view=view;record.viewRevision=revision;
  }
  return record.view;
}

function generationPlainData(value,active=new WeakSet()){
  if(value===null)return true;
  if(typeof value!=='object')return ['string','number','boolean','undefined'].includes(typeof value);
  if(active.has(value))return false;
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value),keys=Object.keys(value);
  if((array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)
    ||Object.getOwnPropertySymbols(value).length||Object.getOwnPropertyNames(value).length!==keys.length+(array?1:0))return false;
  active.add(value);
  for(const key of keys){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!Object.hasOwn(descriptor,'value')||!generationPlainData(descriptor.value,active)){active.delete(value);return false;}
  }
  active.delete(value);return true;
}
function generationRequestDependencies(state,recipe,pendingRecipe){
  try{
    if(!generationPlainData(pendingRecipe)||!generationPlainData(recipe.contactEvidence)||!generationPlainData(recipe.contactTiming)
      ||!generationPlainData(recipe.contactOverride)||!generationPlainData(recipe.target)
      ||Object.values(Object.getOwnPropertyDescriptors(recipe)).some(descriptor=>!Object.hasOwn(descriptor,'value')))return null;
    const values=[recipe.id,model2ContactKind(recipe),recipe.hitter,recipe.contactStyle==='backhand'?'backhand':'forehand',
      recipe.contactTiming?.afterBounceSeconds,recipe.contactTiming?.beforeBounceSeconds,
      recipe.contactOverride?.x,recipe.contactOverride?.y,Boolean(recipe.contactOverride),Boolean(pendingRecipe)];
    if(!state.solved.length)values.push(recipe.family,recipe.serveMethod,stroke(recipe));
    const feet=recipe.contactEvidence?.feet;
    values.push(Boolean(feet),recipe.contactEvidence?.feetEstablishedOutsideNVZ??true,Boolean(recipe.contactEvidence?.momentum));
    if(feet){
      values.push(feet.length);
      for(const foot of feet){
        const keys=Object.keys(foot);if(keys.some(key=>!['x','y','heightFeet'].includes(key)))return null;
        values.push(keys.join(','),foot.x,foot.y,foot.heightFeet);
      }
    }else values.push(recipe.target.x,recipe.target.y);
    const command=value=>{
      if(!value){values.push(null);return;}
      const keys=Object.keys(value);if(keys.some(key=>!['intent','pinned','target'].includes(key)))throw new TypeError();
      values.push(keys.join(','),value.intent,value.pinned);
      if(value.target){const keys=Object.keys(value.target);if(keys.some(key=>!['x','y'].includes(key)))throw new TypeError();values.push(keys.join(','),value.target.x,value.target.y);}
      else values.push(null);
    };
    if(pendingRecipe){
      values.push(Object.keys(pendingRecipe).join(','),Boolean(pendingRecipe.playerMovement));
      command(pendingRecipe.movement);
      const commands=pendingRecipe.playerMovement||{},keys=Object.keys(commands);values.push(keys.join(','));
      for(const id of keys){if(!IDS.includes(id))return null;command(commands[id]);}
    }
    return values;
  }catch{return null;}
}
function equalGenerationDependencies(a,b){return Boolean(a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index])));}
function generationWorking(state,recipe,pendingRecipe,incomingHandle){
  let working=state,prepared;
  const old=generationIncomingRecord(state,incomingHandle);
  try{
    // Preserve the movement-only source guard even when geometry is reusable.
    if(pendingRecipe){
      if(!state.pendingRecipe)throw new TypeError('There is no pending recipe to repair.');
      const invariant=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['movement','playerMovement'].includes(key)));
      if(JSON.stringify(invariant(pendingRecipe))!==JSON.stringify(invariant(state.pendingRecipe)))throw new TypeError('A pending repair may change only movement and playerMovement.');
    }
    const dependencies=generationRequestDependencies(state,recipe,pendingRecipe);
    if(old?.prepared?.built&&old.solved===state.solved.at(-1)&&old.priorSolved===previousContext(state)?.solved
      &&equalGenerationDependencies(dependencies,old.requestDependencies)){
      working=old.working;
      const positions=copy(old.prepared.previous.positions);positions[recipe.hitter]=movementTarget(recipe.movement,old.prepared.stance);
      for(const[id,command]of Object.entries(recipe.playerMovement||{}))positions[id]=movementTarget(command,old.prepared.previous.positions[id]);
      prepared={...old.prepared,recipe,findings:[...old.prepared.findings],locks:new Map(working.locks),positions};
      return {working,prepared,previous:{...old.previous,reused:true},dependencies};
    }
    if(pendingRecipe)working=patchPendingMovement(state,copy(pendingRecipe),{trialDraft:true});
    prepared=prepareRecipe(working,recipe);
    return {working,prepared,previous:null,dependencies};
  }catch(error){prepared={built:false,recipe,findings:[finding(recipe?.id??null,error.message,'feasibility')]};}
  return {working,prepared,previous:null,dependencies:null};
}

function contactStep(recipe,prepared){
  const {contact,feet,kind,side}=prepared;
  return {shot:{from:xy(contact),type:stroke(recipe),stroke:stroke(recipe),playerId:recipe.hitter,
    contact:{kind,point:copy(contact),heightFeet:contact.heightFeet,strokeSide:side,feet,
      feetEstablishedOutsideNVZ:recipe.contactEvidence?.feetEstablishedOutsideNVZ??true,
      momentumEntersNonVolleyZone:Boolean(recipe.contactEvidence?.momentum)}}};
}
function generationIncomingRecord(state,handle){
  if(handle===undefined)return null;
  const record=generationIncoming.get(handle);
  if(!record||record.state!==state||record.revision!==state.revision)throw new TypeError('An incoming probe belongs to a different or stale generation session.');
  return record;
}
function incomingDependencies(recipe,prepared){
  // The session revision binds the header, service, prior flights, prefix and
  // momentum. Only contact geometry and the repaired endpoint can vary here.
  const values=[prepared.incoming?.time,prepared.incoming?.bounces,recipe.hitter,prepared.kind,prepared.side,
    prepared.contact.x,prepared.contact.y,prepared.contact.heightFeet,
    recipe.contactEvidence?.feetEstablishedOutsideNVZ??true,Boolean(recipe.contactEvidence?.momentum)];
  for(const foot of prepared.feet)values.push(foot.x,foot.y,foot.heightFeet);
  values.push(prepared.feet.length);
  for(const id of [...IDS,'ball']){
    const position=prepared.previousResolved?.positions[id];values.push(position?.x,position?.y,position?.heightFeet);
  }
  return values;
}
function generationPrevious(state,working,recipe,prepared,incomingHandle){
  const old=generationIncomingRecord(state,incomingHandle),index=working.solved.length;
  if(!index)return {segment:null,inspection:null,reused:false,dependencies:null,cursor:working.cursor};
  const dependencies=incomingDependencies(recipe,prepared),prior=previousContext(working),solved=working.solved.at(-1);
  const segment=generationSegment({previous:working.steps[index-1],step:prepared.previousResolved,
    nextStep:contactStep(recipe,prepared),index,startTime:working.cursor,model2Momentum:working.momentum},working.solved.at(-1));
  const reused=Boolean(old&&old.solved===solved&&old.priorSolved===prior?.solved&&old.dependencies?.length===dependencies.length
    &&dependencies.every((value,index)=>Object.is(value,old.dependencies[index])));
  const inspection=reused?old.inspection:inspectModel2SegmentV2(working.play,segment,{index:index-1,prior,terminal:false,solved});
  return {segment,inspection,reused,dependencies,cursor:segment.endTime};
}

function appendGenerationInspection(findings,recipe,prepared,previous){
  if(!previous.inspection)return;
  const inspection=previous.inspection;
  for(const issue of inspection.violations)findings.push(finding(issue.stepId||issue.shotId||recipe.id,issue.message,issue.category==='model'?'feasibility':'rule'));
  if(inspection.physicalCandidates.length)findings.push(finding(prepared.previousResolved.id,'The pending flight has a decisive physical event before the proposed next contact.','rule'));
}
function generationStatus(prepared){
  return {ok:prepared.built&&!prepared.findings.some(item=>item.severity==='error'),reason:prepared.findings[0]?.message??'',findings:prepared.findings};
}
export function probeGenerationIncomingV2(session,recipe,{pendingRecipe}={}){
  const state=sessionRecord(session).state,revision=state.revision;
  const {working,prepared}=generationWorking(state,recipe,pendingRecipe);
  assertGenerationRevision(state,revision);
  const basePrepared={...prepared,findings:[...prepared.findings]};
  let previous=null,movement=null,spacing=null;
  if(prepared.built){
    previous=generationPrevious(state,working,recipe,prepared);
    appendGenerationInspection(prepared.findings,recipe,prepared,previous);
    if(previous.segment){movement=inspectGeneratedMovementV1(previous.segment);spacing=inspectGeneratedSpacingV1(previous.segment);}
  }
  const handle=Object.freeze({}),requestDependencies=generationRequestDependencies(state,recipe,pendingRecipe);
  const segment=previous?.segment;
  const result=Object.freeze({...detachedGenerationData({...generationStatus(prepared),movement,spacing,contact:prepared.contact,feet:prepared.feet,
    positions:segment?Object.fromEntries(IDS.map(id=>[id,sampleActorBoardPositionV2(segment,id,segment.duration)])):undefined,
    footState:segment?sampleFeetStateV1(segment,segment.duration):undefined,
    sampleTimeSeconds:segment?.endTime,contactTimeSeconds:segment?.endTime}),handle});
  assertGenerationRevision(state,revision);
  generationIncoming.set(handle,{state,revision,dependencies:previous?.dependencies,inspection:previous?.inspection,
    solved:working.solved.at(-1),priorSolved:previousContext(working)?.solved,working,prepared:basePrepared,previous,
    requestDependencies,movement,spacing});
  return result;
}
function generationReplyConstruction(session,recipe,{incoming,pendingRecipe}={}){
  const state=sessionRecord(session).state,revision=state.revision;generationIncomingRecord(state,incoming);
  const {working,prepared,previous:cachedPrevious}=generationWorking(state,recipe,pendingRecipe,incoming);
  assertGenerationRevision(state,revision);
  if(!prepared.built)return {state,revision,working,construction:prepared,previous:null,pending:null};
  const construction=materializeRecipe(working,recipe,prepared);
  assertGenerationRevision(state,revision);
  if(!construction.built)return {state,revision,working,construction,previous:null,pending:null};
  const previous=cachedPrevious||generationPrevious(state,working,recipe,prepared,incoming);
  appendGenerationInspection(construction.findings,recipe,prepared,previous);
  const index=working.solved.length,pending=generationSegment({previous:construction.previousResolved||working.steps.at(-1),
    step:construction.step,nextStep:null,index:index+1,startTime:previous.cursor,model2Momentum:working.momentum},construction.flight);
  const extra=momentumFor(pending);if(extra)pending.model2Momentum=[...working.momentum,extra];
  assertGenerationRevision(state,revision);
  return {state,revision,working,construction,previous,pending};
}
export function probeGenerationReplyV2(session,recipe,{incoming,pendingRecipe,actors,record=false}={}){
  const {state,revision,working,construction,previous,pending}=generationReplyConstruction(session,recipe,{incoming,pendingRecipe});
  const status=generationStatus(construction);
  const routeValid=generationRouteValid(sessionRecord(session).state,incoming,previous);
  let contact=null,bodyEvents=[];
  if(status.ok&&pending){
    const prior=previous?.segment?{segment:previous.segment,solved:working.solved.at(-1)}:previousContext(working);
    const play=working.solved.length?working.play:{...working.play,steps:[...working.steps,construction.step]};
    contact=inspectModel2ContactV2(play,pending,{index:working.solved.length,prior,solved:construction.flight});
    if(!contact.violations.length&&!contact.physicalCandidates.length&&!contact.momentumCandidates.length)bodyEvents=inspectBodyPathV2(pending,construction.flight,actors);
  }
  const result={...status,previousInspectionReused:previous?.reused??false,routeValid,
    contactFindings:contact?[...contact.violations,...contact.physicalCandidates,...contact.momentumCandidates]:[],bodyEvents,
    representedFlightSeconds:construction.flight?.totalDuration};
  if(record&&pending)result.nominal={contact:construction.contact,family:recipe.family,quality:recipe.quality,target:xy(recipe.target),physics:copy(recipe.physics),pace:recipe.pace,arc:recipe.arc,
    actorRoute:{startTime:pending.startTime,duration:pending.duration,originalDuration:pending.originalDuration,contactTime:pending.contactTime,
      hitter:pending.shotSemantics.playerId,feet:pending.shotSemantics.contact.feet,previousPositions:pending.previous.positions,
      positions:pending.step.positions,momentum:pending.model2Momentum,endTimeSeconds:pending.step.shot.physicsV2.endTimeSeconds}};
  const detached=detachedGenerationData(result);
  assertGenerationRevision(state,revision);
  return detached;
}
function generationRouteValid(state,incoming,previous){
  const cached=previous?.reused?generationIncomingRecord(state,incoming):null;
  if(cached?.movement&&cached?.spacing)return cached.movement.valid&&cached.spacing.valid;
  return previous?.segment?inspectGeneratedMovementV1(previous.segment).valid&&inspectGeneratedSpacingV1(previous.segment).valid:true;
}
export function commitGenerationRecipeV2(session,recipe,{incoming,pendingRecipe}={}){
  const {state,revision,working,construction,previous,pending}=generationReplyConstruction(session,recipe,{incoming,pendingRecipe});
  const status=generationStatus(construction),routeValid=generationRouteValid(state,incoming,previous);
  if(!status.ok||!routeValid)return detachedGenerationData({ok:status.ok,reason:status.reason,routeValid,
    previousInspectionReused:previous?.reused??false,contact:construction.contact,feet:construction.feet,inspection:null});
  const index=working.solved.length,steps=working.steps.slice();
  if(index)steps[steps.length-1]=construction.previousResolved;
  steps.push(construction.step);
  const play={...working.play,steps},prior=previous?.segment?{segment:previous.segment,solved:working.solved.at(-1)}:previousContext(working);
  const current=inspectModel2SegmentV2(play,pending,{index,prior,terminal:false,solved:construction.flight});
  const history=working.finalizedInspections.filter(Boolean);
  if(previous?.inspection)history.push(previous.inspection);
  const physicalCandidates=[...history.flatMap(item=>item.physicalCandidates),...current.physicalCandidates];
  const momentumCandidates=[...history.flatMap(item=>item.momentumCandidates),...current.momentumCandidates];
  const {decision}=resolveModel2OutcomeCandidates(physicalCandidates,momentumCandidates);
  const inspection={...current,physicalCandidates,momentumCandidates,decision,derivedOutcome:derivedOutcomeForDecisionV2(decision),segment:pending,
    violations:[...history.flatMap(item=>item.violations),...current.violations]};
  const supported=!inspection.violations.length&&!physicalCandidates.some(candidate=>candidate.unsupportedReason);
  if(supported){
    const finalizedPrevious=index?{...previous.segment,nextStep:construction.step,
      nextShotSemantics:resolveShotSemantics(construction.step.shot,previous.segment.step.positions)}:null;
    const acceptedRecipe=copy(recipe),recipes=[...working.recipes,acceptedRecipe];
    if(pendingRecipe)recipes[recipes.length-2]=copy(pendingRecipe);
    // No state field changes until all route, source and physical checks pass.
    assertGenerationRevision(state,revision);
    Object.assign(state,{steps,play,solved:[...working.solved,construction.flight],locks:construction.locks,
      findings:[...working.findings,...construction.findings],recipes,revision:state.revision+1,
      cursor:previous.cursor,finalizedSegments:index?[...working.finalizedSegments,finalizedPrevious]:working.finalizedSegments,
      finalizedInspections:index?[...working.finalizedInspections,previous.inspection]:working.finalizedInspections,
      momentum:pending.model2Momentum,pendingSegment:pending,pendingRecipe:acceptedRecipe,pendingLocksBefore:new Map(working.locks)});
  }
  assertGenerationRevision(state,supported?revision+1:revision);
  return detachedGenerationData({ok:true,reason:'',routeValid,previousInspectionReused:previous?.reused??false,committed:supported,
    contact:construction.contact,feet:construction.feet,inspection});
}

export function replaceGenerationPendingMovementV2(session,pendingRecipe){
  const state=sessionRecord(session).state,revision=state.revision;
  const next=patchPendingMovement(state,pendingRecipe),index=state.solved.length;
  next.recipes=state.recipes.slice();next.recipes[index-1]=copy(pendingRecipe);
  next.pendingSegment=segmentFor(next.steps[index-1],next.steps[index],null,index,state.cursor,state.momentum);
  next.revision=revision+1;
  assertGenerationRevision(state,revision);
  Object.assign(state,next);
  return observeGenerationPlanningSessionV2(session);
}
export function inspectGenerationPendingLegV2(session,options){
  const state=sessionRecord(session).state,revision=state.revision;
  const result=detachedGenerationData(inspectPendingLegV2(state,options));
  assertGenerationRevision(state,revision);return result;
}
export function finishGenerationPlanningV2(session,options){
  const state=sessionRecord(session).state,revision=state.revision;
  const result=detachedGenerationData({...finishPlanningV2(state,options),recipes:state.recipes});
  assertGenerationRevision(state,revision);return result;
}
