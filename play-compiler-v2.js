// Model 2 is isolated from the legacy authored/template compiler.
import { compilePlayTimeline, STROKE_PROFILES } from './three-d-core.js';
import { REACH_MODEL } from './rally-tactics.js';
import { solveFlightV2, interceptFlightV2, solveServePreparationV2, PHYSICS_VERSION } from './play-physics-v2.js';
import { validateModel2Rules, analyzeModel2Outcome } from './play-outcome-v2.js';
import { inspectActorMovementV2 } from './play-actors-v2.js';

const copy=value=>structuredClone(value);
const IDS=['player1','player2','player3','player4'];
const xy=p=>({x:p.x,y:p.y});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finding=(shotId,message,kind='rule',severity='error')=>Object.freeze({kind,severity,shotId,message});
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

function constructPlay(document){
  if(document.modelVersion!==2||document.physicsVersion!==PHYSICS_VERSION)throw new TypeError('Explicit model 2 and supported physics version required.');
  const steps=[{id:'setup',label:'Starting Positions',description:'Model 2 starting state.',durationMs:0,positions:copy(document.initialLayout)}];
  const findings=[],solved=[],locks=new Map();
  const play={id:document.id,name:document.title,description:'Model 2 physical play',mode:'doubles',modelVersion:2,physicsVersion:PHYSICS_VERSION,
    players:copy(document.players),rally:{openingBouncesSatisfied:document.opening==='midrally',...(document.service?{service:copy(document.service)}:{})},
    ending:document.ending,outcome:document.outcome?copy(document.outcome):null,intentionalFault:document.intentionalFault,assistance:copy(document.assistance),steps};
  for(const [index,recipe]of document.shots.entries()){
    try{
      const kind=model2ContactKind(recipe),previous=steps.at(-1),side=recipe.contactStyle==='backhand'?'backhand':'forehand';
      let contact,incoming=null;
      if(index){
        incoming=interceptFlightV2(solved[index-1],{kind,stance:previous.positions[recipe.hitter],contactOverride:recipe.contactOverride,afterBounceSeconds:recipe.contactTiming?.afterBounceSeconds});
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
      const flight=solveFlightV2(spec);solved.push(flight);
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
      steps.push({id:recipe.id,label:recipe.narration?.label||`${index+1}. ${recipe.intent||recipe.family}`,
        description:recipe.narration?.why||`Model 2 ${recipe.family}.`,durationMs:850,positions,shot});
      for(const[id,command]of [[recipe.hitter,recipe.movement],...Object.entries(recipe.playerMovement||{})]){
        if(command.pinned)locks.set(id,xy(positions[id]));else locks.delete(id);
      }
      for(const id of IDS){
        const command=id===recipe.hitter?recipe.movement:recipe.playerMovement?.[id];
        if(command?.waypoints?.length)findings.push(finding(recipe.id,'Movement waypoints are retained; this model uses the final bounded movement destination.','unsupported','warning'));
      }
    }catch(error){findings.push(finding(recipe.id,error.message,'feasibility'));break;}
  }
  return{play,findings,accepted:steps.length-1};
}

function compile(document,{preview=false}={}){
  const {play,findings,accepted}=constructPlay(document),timeline=compilePlayTimeline(play);
  for(const id of IDS){
    const movement=inspectActorMovementV2(timeline,id);
    if(!movement.valid)findings.push(finding(movement.stepId,`${id}: ${movement.reason}`,'feasibility'));
  }
  const analysis=analyzeModel2Outcome(play,timeline),rules=validateModel2Rules(play,timeline);
  if(!preview)for(const item of rules.violations)findings.push(finding(item.stepId||item.shotId||null,item.message,item.category==='model'?'feasibility':'rule'));
  return Object.freeze({play:Object.freeze(play),timeline,findings:Object.freeze(findings),validShotCount:!preview&&findings.some(item=>item.severity==='error')?0:accepted,coverage:Object.freeze([]),
    ...(preview?{derivedOutcome:analysis.derivedOutcome}:{} )});
}
export function compileDocumentV2(document){return compile(document);}
// Generator/testing helper only. Public compileDocument still validates the
// complete document, including independently derived outcome evidence.
export function previewDocumentV2(document){return compile(document,{preview:true});}
