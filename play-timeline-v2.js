// Opt-in timeline adapter. The legacy compiler/sampler retains its own path.
import { PHYSICS_VERSION, compileSolvedLegV2, compileSolvedLegFromFlightV2, solveServePreparationV2, physicsBoardToWorld } from './play-physics-v2.js';
import { analyzeModel2Outcome } from './play-outcome-v2.js';

const EPS=1e-8;
const priority={'preparation-bounce':0,contact:1,'net-touch':2,'net-crossing':3,bounce:4,out:5,'second-bounce':6,body:7,fault:8,dead:9,end:10};
const event=source=>Object.freeze({...source,position:Object.freeze({...source.position})});
const center=feet=>({x:(feet[0].x+feet[1].x)/2,y:(feet[0].y+feet[1].y)/2});

// Shared segment construction for the compiler and bounded incremental planner.
// index is the one-based contact index, so first-contact preparation stays exact.
export function createModel2SegmentV2({previous,step,nextStep,index,startTime=0,model2Momentum=[]},
  {resolveShotSemantics,boardToWorld}={}) {
  return model2Segment({previous,step,nextStep,index,startTime,model2Momentum},{resolveShotSemantics,boardToWorld},compileSolvedLegV2);
}

export function createModel2SegmentFromSolvedV2(input,adapters,solved){
  return model2Segment(input,adapters,shot=>compileSolvedLegFromFlightV2(shot,solved));
}
function model2Segment({previous,step,nextStep,index,startTime=0,model2Momentum=[]},{resolveShotSemantics,boardToWorld},compileLeg){
  if(!step?.shot||typeof resolveShotSemantics!=='function'||typeof boardToWorld!=='function')throw new TypeError('A model 2 shot and core semantics adapters are required.');
  const shotSemantics=resolveShotSemantics(step.shot,previous.positions);
  const nextShotSemantics=nextStep?.shot?resolveShotSemantics(nextStep.shot,step.positions):null;
  const servePreparation=step.shot.servePreparation?solveServePreparationV2({point:shotSemantics.contact.point,...step.shot.servePreparation}):null;
  const contactTime=servePreparation?.totalDuration??(index===1?shotSemantics.profile.duration*shotSemantics.profile.contactRatio:0);
  const trajectory=compileLeg(step.shot),duration=contactTime+trajectory.totalDuration;
  return {modelVersion:2,index,previous,step,nextStep,trajectory,servePreparation,shotSemantics,nextShotSemantics,
    startTime,duration,originalDuration:duration,endTime:startTime+duration,contactTime,
    trajectoryStartTime:contactTime,trajectoryEndTime:duration,rallyLeg:index,
    endpoint:trajectory.endpoint,ballStart:servePreparation?.release||trajectory.start,ballEnd:trajectory.end,model2Momentum};
}

// Apply the same visible terminal hold to an owned segment in batch and
// incremental finalization. Actor originalDuration is deliberately retained.
export function holdModel2TerminalSegmentV2(last,decision) {
  const lastBase=last.startTime+last.contactTime;
  const deadTime=decision.physicalDeadTime??decision.evidenceObservedTime??decision.time;
  const observed=decision.evidenceObservedTime??decision.time;
  const end=Math.max(lastBase+.3,deadTime,observed),duration=Math.max(last.startTime,end);
  const holdTime=Math.max(0,deadTime-lastBase),original=last.trajectory;
  const held=original.sample(Math.min(original.totalDuration,holdTime));
  last.duration=duration-last.startTime;last.endTime=duration;
  last.trajectoryEndTime=last.duration;last.ballEnd=held;
  last.trajectory=Object.freeze({...original,totalDuration:last.duration-last.contactTime,end:held,bounceEnd:held,
    sample:seconds=>original.sample(Math.min(seconds,holdTime)),sampleBoard:seconds=>original.sampleBoard(Math.min(seconds,holdTime))});
  return {duration,deadTime,observed,lastBase,held};
}

export function compilePlayTimelineV2(play,{resolveShotSemantics,boardToWorld}={}){
  if(play.modelVersion!==2||play.physicsVersion!==PHYSICS_VERSION)throw new TypeError('Unsupported model 2 timeline version.');
  if(!play.steps?.length||typeof resolveShotSemantics!=='function'||typeof boardToWorld!=='function')throw new TypeError('A model 2 Play and core semantics adapters are required.');
  const segments=[],events=[],momentum=[];let cursor=0,rallyLeg=0;
  for(let index=1;index<play.steps.length;index++){
    const previous=play.steps[index-1],step=play.steps[index],nextStep=play.steps[index+1];
    if(!step.shot)throw new TypeError('Model 2 timelines require explicit shot stages.');
    const segment=createModel2SegmentV2({previous,step,nextStep,index,startTime:cursor}, {resolveShotSemantics,boardToWorld});
    const {shotSemantics,nextShotSemantics,servePreparation,contactTime,trajectory,duration}=segment;
    rallyLeg++;
    segments.push(segment);
    const base=cursor+contactTime,prefix=`${play.id}:${step.id}`;
    if(servePreparation)events.push(event({id:`${prefix}:preparation-bounce`,type:'preparation-bounce',time:cursor+servePreparation.bounceTime,actor:shotSemantics.playerId,position:servePreparation.ground,rallyLeg}));
    events.push(event({id:`${prefix}:contact`,type:'contact',time:base,actor:shotSemantics.playerId,position:trajectory.start,rallyLeg}));
    for(const physical of trajectory.physicalEvents){
      const {position,time,...details}=physical;
      events.push(event({...details,id:`${prefix}:${physical.type}`,time:base+time,actor:null,position:physicsBoardToWorld(position),rallyLeg}));
    }
    events.push(event({id:`${prefix}:end`,type:'end',time:cursor+duration,actor:nextShotSemantics?.playerId||null,position:trajectory.end,rallyLeg}));
    const evidence=step.shot.authoring?.contactEvidence?.momentum;
    if(evidence)momentum.push(Object.freeze({actor:shotSemantics.playerId,shotId:step.id,contactTime:base,time:base+evidence.afterContactSeconds,
      feet:Object.freeze(evidence.feet.map(p=>Object.freeze({...p}))),fromFeet:shotSemantics.contact.feet,
      from:Object.freeze(center(shotSemantics.contact.feet)),to:Object.freeze(center(evidence.feet)),balanced:evidence.balanced}));
    cursor+=duration;
  }
  for(const segment of segments)segment.model2Momentum=momentum;
  const raw={play,modelVersion:2,physicsVersion:PHYSICS_VERSION,segments,events,duration:cursor,model2Momentum:momentum};
  const analysis=analyzeModel2Outcome(play,raw),decision=analysis.decision;
  let visibleEvents=[...events],duration=cursor;
  if(decision&&play.ending!=='stop'&&segments.length){
    const last=segments.at(-1);
    const terminal=holdModel2TerminalSegmentV2(last,decision);
    const {deadTime,observed,lastBase,held}=terminal;
    duration=terminal.duration;
    const faultSegment=segments.find(s=>s.step.id===decision.shotId)||last;
    const faultPosition=physicsBoardToWorld(decision.evidencePosition||decision.position);
    visibleEvents=visibleEvents.filter(e=>e.time<=deadTime+EPS&&(e.type!=='end'||e.rallyLeg!==last.rallyLeg));
    const details={reason:decision.reason,actor:decision.faultingActor??decision.actor??null,
      violationOccurrenceTime:decision.violationOccurrenceTime??decision.time,evidenceObservedTime:observed,
      shotId:decision.shotId,rallyLeg:faultSegment.rallyLeg};
    const prefix=`${play.id}:${decision.shotId}`;
    if(['long','wide'].includes(decision.reason))visibleEvents.push(event({...details,id:`${prefix}:out`,type:'out',time:decision.time,position:faultPosition}));
    if(decision.reason==='body')visibleEvents.push(event({...details,id:`${prefix}:body`,type:'body',time:decision.time,position:faultPosition}));
    if(decision.reason!=='unreachable')visibleEvents.push(event({...details,id:`${prefix}:fault`,type:'fault',time:observed,position:faultPosition}));
    const deadPoint=last.trajectory.sample(Math.max(0,deadTime-lastBase));
    visibleEvents.push(event({...details,id:`${prefix}:dead`,type:'dead',time:deadTime,position:deadPoint}));
    visibleEvents.push(event({id:`${play.id}:${last.step.id}:end`,type:'end',time:duration,actor:null,position:held,rallyLeg:last.rallyLeg}));
  }
  for(const segment of segments){segment.model2Momentum=momentum;Object.freeze(segment);}
  visibleEvents.sort((a,b)=>a.time-b.time||(priority[a.type]??20)-(priority[b.type]??20)||a.id.localeCompare(b.id));
  return Object.freeze({play,modelVersion:2,physicsVersion:PHYSICS_VERSION,segments:Object.freeze(segments),events:Object.freeze(visibleEvents),
    duration,originalDuration:cursor,model2Momentum:Object.freeze(momentum),outcome:decision&&play.ending!=='stop'?Object.freeze(decision):null});
}
