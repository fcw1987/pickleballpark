// Deterministic, board-feet physics. Model 1 never enters this module.
import { COURT_DIMENSIONS } from './court-geometry.js';
export const PHYSICS_VERSION = 'play-physics-v2';
export const PHYSICS_V2 = Object.freeze({ gravityFeetPerSecond2:32.174, feetToMeters:.3048,
  ballRadiusFeet:COURT_DIMENSIONS.ballDiameterMeters/.3048/2, postInsideLeft:-1,
  postInsideRight:21, postDiameterFeet:.25, netLeft:-.875, netRight:20.875,
  restitution:.68, horizontalRetention:.72 });
const G=PHYSICS_V2.gravityFeetPerSecond2,R=PHYSICS_V2.ballRadiusFeet,EPS=1e-8;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const point=p=>({x:p.x,y:p.y,heightFeet:p.heightFeet});
const finite=(n,name)=>{if(!Number.isFinite(n))throw new TypeError(`${name} must be finite.`);return n;};
export const physicsBoardToWorld=p=>({x:(p.x-10)*.3048,y:p.heightFeet*.3048,z:(p.y-22)*.3048});
export const physicsWorldToBoard=p=>({x:p.x/.3048+10,y:p.z/.3048+22,heightFeet:p.y/.3048});
export function localNetHeightFeet(x){return 34/12+(2/12)*Math.min(1,Math.pow((x-10)/10,2));}
const APEX=Object.freeze({serve:7,return:7,drive:4.5,drop:6,dink:4,volley:4.2,reset:4.1,lob:18,overhead:7.5});
function stage(from,vx,vy,vz,startTime,duration,phase){return Object.freeze({from:Object.freeze(point(from)),vx,vy,vz,startTime,duration,endTime:startTime+duration,phase});}
function sampleStage(s,seconds){const t=clamp(seconds-s.startTime,0,s.duration);return{x:s.from.x+s.vx*t,y:s.from.y+s.vz*t,heightFeet:Math.max(R,s.from.heightFeet+s.vy*t-.5*G*t*t)};}
const event=(type,time,position,details={})=>Object.freeze({type,time,position:Object.freeze(point(position)),...details});

// Apex is an input. Launch/average speeds are derived, not independent and
// potentially incompatible constraints. Restitution approximates surface losses;
// aerodynamic drag and spin forces are deliberately outside this model version.
export function solveFlightV2(input){
  if(input.physicsVersion!==undefined&&input.physicsVersion!==PHYSICS_VERSION)throw new RangeError('Unsupported physics version.');
  const from=point(input.from||{}),target={...input.target};
  for(const[name,n]of Object.entries(from))finite(n,`from.${name}`);
  finite(target.x,'target.x');finite(target.y,'target.y');
  if(from.heightFeet<R-EPS)throw new RangeError('A ball center must begin above its radius.');
  const base=APEX[input.family]??6,arcOffset=input.arc==='high'?.6:input.arc==='low'?-.5:0;
  const qualityOffset=input.quality==='attackable'?.8:input.quality==='low'?-.35:0;
  const paceOffset=input.pace==='soft'?.35:input.pace==='firm'?-.2:0;
  if(input.physics?.apexFeet!==undefined&&input.physics?.launchVerticalFeetPerSecond!==undefined)throw new TypeError('Choose either apex or signed vertical launch speed, not both.');
  let apexFeet,vy;
  const signed=input.physics?.launchVerticalFeetPerSecond??(input.family==='overhead'&&input.physics?.apexFeet===undefined?(input.pace==='soft'?-12:input.pace==='firm'?-24:-18):undefined);
  if(signed!==undefined){
    finite(signed,'launchVerticalFeetPerSecond');if(signed<-80||signed>80)throw new RangeError('Vertical launch speed must be between -80 and 80 ft/s.');
    vy=signed;apexFeet=from.heightFeet+Math.max(0,vy)**2/(2*G);
  }else{
    apexFeet=input.physics?.apexFeet??Math.max(from.heightFeet,base+arcOffset+qualityOffset+paceOffset);
    finite(apexFeet,'apexFeet');
    if(apexFeet<from.heightFeet-EPS||apexFeet>30)throw new RangeError('The ballistic apex must be at least the contact height and at most 30 feet.');
    vy=Math.sqrt(Math.max(0,2*G*(apexFeet-from.heightFeet)));
  }
  if(!Number.isFinite(apexFeet)||apexFeet>30)throw new RangeError('The derived ballistic apex must be at most 30 feet.');
  const flightDuration=(vy+Math.sqrt(vy*vy+2*G*(from.heightFeet-R)))/G;
  if(!(flightDuration>.001))throw new RangeError('A positive flight time is required.');
  const vx=(target.x-from.x)/flightDuration,vz=(target.y-from.y)/flightDuration;
  const first=stage(from,vx,vy,vz,0,flightDuration,'flight'),stages=[],events=[];
  let obstruction=null,netTime=null,netPoint=null,terminal=null;
  if((from.y-22)*(target.y-22)<0){
    netTime=(22-from.y)/vz;netPoint=sampleStage(first,netTime);
    const x=netPoint.x,tape=localNetHeightFeet(x),bottom=tape-2.5;
    const around=x<-1.25-R||x>21.25+R;
    const post=(x+R>=-1.25&&x-R<=-1)||(x+R>=21&&x-R<=21.25);
    if(post&&netPoint.heightFeet-R<=3)obstruction={kind:'post',time:netTime,position:netPoint};
    else if(!around&&(x<PHYSICS_V2.netLeft||x>PHYSICS_V2.netRight)&&netPoint.heightFeet-R<tape)obstruction={kind:'net-gap',time:netTime,position:netPoint};
    else if(!around&&netPoint.heightFeet+R<bottom)obstruction={kind:'under-net',time:netTime,position:netPoint};
    else if(!around&&netPoint.heightFeet-R<tape-EPS)obstruction={kind:'net',time:netTime,position:netPoint};
    else if(!around&&Math.abs(netPoint.heightFeet-R-tape)<=EPS)events.push(event('net-touch',netTime,netPoint,{remainsLive:true}));
    if(!obstruction)events.push(event('net-crossing',netTime,netPoint,{aroundPost:around}));
  }
  let firstLandingTime,landing,secondBounceTime=null;
  if(obstruction?.kind==='net'){
    const direction=Math.sign(vz),t=Math.max(0,(22-direction*(R+.01)-from.y)/vz),hit=sampleStage(first,t);
    stages.push(stage(from,vx,vy,vz,0,t,'flight'));
    const fall=Math.sqrt(2*Math.max(0,hit.heightFeet-R)/G);
    stages.push(stage(hit,0,0,0,t,fall,'net-drop'));
    events.push(event('net-touch',t,hit,{remainsLive:true,blocked:true}));
    firstLandingTime=t+fall;landing=sampleStage(stages.at(-1),firstLandingTime);
    events.push(event('bounce',firstLandingTime,landing));terminal={reason:'net',time:firstLandingTime,position:landing};
    netTime=null;netPoint=null;
  }else{
    stages.push(first);firstLandingTime=flightDuration;landing=sampleStage(first,flightDuration);
    events.push(event('bounce',flightDuration,landing));
    const reboundV=Math.sqrt(vy*vy+2*G*(from.heightFeet-R))*PHYSICS_V2.restitution;
    const rebound=stage(landing,vx*PHYSICS_V2.horizontalRetention,reboundV,vz*PHYSICS_V2.horizontalRetention,flightDuration,2*reboundV/G,'post-bounce');
    stages.push(rebound);secondBounceTime=rebound.endTime;
    events.push(event('second-bounce',secondBounceTime,sampleStage(rebound,secondBounceTime)));
  }
  const totalDuration=stages.at(-1).endTime;
  const sampleBoard=seconds=>{finite(seconds,'seconds');const t=clamp(seconds,0,totalDuration),selected=stages.find(s=>t<s.endTime-EPS)||stages.at(-1),at=sampleStage(selected,t);
    const bounce=events.find(e=>e.type==='bounce'&&Math.abs(e.time-t)<EPS);
    return Object.freeze({...at,phase:bounce?'bounce':t>=totalDuration-EPS?(terminal?'dead':'second-bounce'):selected.phase,bounced:t>=firstLandingTime-EPS});};
  const launchSpeedMph=Math.hypot(vx,vy,vz)/(22/15),horizontalAverageSpeedMph=Math.hypot(target.x-from.x,target.y-from.y)/flightDuration/(22/15);
  const metadata=Object.freeze({physicsVersion:PHYSICS_VERSION,type:input.family,from:{x:from.x,y:from.y},to:target,
    contactHeightFeet:from.heightFeet,apexFeet,speedMph:launchSpeedMph,launchSpeedMph,launchVerticalFeetPerSecond:vy,horizontalAverageSpeedMph,
    netClearanceInches:netPoint?(netPoint.heightFeet-R-localNetHeightFeet(netPoint.x))*12:null,
    spin:Object.freeze({type:'flat',rpm:0}),bounce:Object.freeze({enabled:true,heightFeet:Math.pow(Math.sqrt(vy*vy+2*G*(from.heightFeet-R))*PHYSICS_V2.restitution,2)/(2*G)})});
  const sample=seconds=>{const p=sampleBoard(seconds);return Object.freeze({...physicsBoardToWorld(p),phase:p.phase,bounced:p.bounced});};
  return Object.freeze({physicsVersion:PHYSICS_VERSION,metadata,from:Object.freeze(from),target:Object.freeze(target),stages:Object.freeze(stages),events:Object.freeze(events.sort((a,b)=>a.time-b.time)),
    firstLandingTime,flightDuration:firstLandingTime,landing:Object.freeze(landing),secondBounceTime,totalDuration,netTime,netPoint,
    obstruction:obstruction&&Object.freeze(obstruction),terminal:terminal&&Object.freeze(terminal),launchSpeedMph,horizontalAverageSpeedMph,sampleBoard,sample});
}

// Every subsequent contact is sampled from the actual incoming solution.
export function interceptFlightV2(flight,{kind,stance,contactOverride,afterBounceSeconds}){
  let time;
  if(kind==='volley'){
    const y=contactOverride?.y??(stance.y<22?Math.min(14.75,stance.y):Math.max(29.25,stance.y)),first=flight.stages[0];
    if(Math.abs(first.vz)<EPS)throw new RangeError('A volley requires an incoming depth crossing.');
    time=(y-flight.from.y)/first.vz;
    if(time<=EPS||time>=flight.firstLandingTime-EPS||flight.obstruction)throw new RangeError('A volley must intercept a live flight before its first bounce.');
  }else{
    if(flight.obstruction)throw new RangeError('A blocked flight cannot produce a subsequent rally contact.');
    const delay=afterBounceSeconds??(kind==='short-hop'?.12:.28);time=flight.firstLandingTime+delay;
    if(delay<=0||time>=flight.secondBounceTime-EPS)throw new RangeError('A bounced contact must be after the first and before the second bounce.');
  }
  const at=flight.sampleBoard(time);
  if(contactOverride&&Math.hypot(at.x-contactOverride.x,at.y-contactOverride.y)>.025)throw new RangeError('contactOverride must lie on the actual incoming trajectory.');
  return Object.freeze({time,point:Object.freeze(point(at)),bounces:kind==='volley'?0:1});
}

// Inert JSON is sufficient to reconstruct physics after a GuidedPlayEngine clone.
export function compileSolvedLegV2(shot){
  const spec=shot.physicsV2;
  if(!spec||spec.physicsVersion!==PHYSICS_VERSION)throw new TypeError('Model 2 shots require shared-solver physicsV2 metadata.');
  const solved=solveFlightV2(spec),endTime=spec.endTimeSeconds??solved.firstLandingTime;
  if(!Number.isFinite(endTime)||endTime<0||endTime>solved.totalDuration+EPS)throw new RangeError('Invalid model 2 leg endpoint time.');
  const bounces=solved.events.filter(e=>e.type==='bounce'&&e.time<=endTime+EPS).length,end=solved.sample(endTime),start=solved.sample(0);
  return Object.freeze({...solved,solved,start,landing:physicsBoardToWorld(solved.landing),end,bounceEnd:end,totalDuration:endTime,
    bounceDuration:Math.max(0,endTime-solved.firstLandingTime),flightDuration:solved.firstLandingTime,bounces,endpoint:spec.endpoint||'flight-end',
    netCrossingHeightMeters:solved.netPoint?solved.netPoint.heightFeet*.3048:null,netPoint:solved.netPoint&&physicsBoardToWorld(solved.netPoint),
    netTime:solved.netTime!==null&&solved.netTime<=endTime+EPS?solved.netTime:null,
    physicalEvents:Object.freeze(solved.events.filter(e=>e.time<=endTime+EPS)),sample:seconds=>solved.sample(clamp(seconds,0,endTime)),sampleBoard:seconds=>solved.sampleBoard(clamp(seconds,0,endTime))});
}

// A drop serve is a release and a passive rebound before paddle contact.
export function solveServePreparationV2({point:at,releaseHeightFeet=3.5,reboundDuration=.3}){
  if(releaseHeightFeet!==3.5||!Number.isFinite(reboundDuration)||reboundDuration<.05||reboundDuration>.4)throw new RangeError('Unsupported model 2 drop-serve preparation.');
  const fallDuration=Math.sqrt(2*(releaseHeightFeet-R)/G),reboundVelocity=G*fallDuration*PHYSICS_V2.restitution;
  const contactHeightFeet=R+reboundVelocity*reboundDuration-.5*G*reboundDuration*reboundDuration;
  if(contactHeightFeet<=R)throw new RangeError('Drop-serve contact must precede its second preparatory bounce.');
  const totalDuration=fallDuration+reboundDuration;
  const sample=seconds=>{const t=clamp(seconds,0,totalDuration),first=t<=fallDuration,heightFeet=first?releaseHeightFeet-.5*G*t*t:R+reboundVelocity*(t-fallDuration)-.5*G*(t-fallDuration)**2;
    return{...physicsBoardToWorld({...at,heightFeet}),phase:Math.abs(t-fallDuration)<EPS?'preparation-bounce':first?'serve-release':t>=totalDuration-EPS?'contact':'serve-rise',preparationBounced:!first};};
  return Object.freeze({method:'drop',release:physicsBoardToWorld({...at,heightFeet:releaseHeightFeet}),ground:physicsBoardToWorld({...at,heightFeet:R}),contact:physicsBoardToWorld({...at,heightFeet:contactHeightFeet}),
    releaseHeightFeet,contactHeightFeet,fallDuration,reboundDuration,totalDuration,bounceTime:fallDuration,sample});
}
