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
export function solveFlightLaunchV2(input){
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
  const first=stage(from,vx,vy,vz,0,flightDuration,'flight'),events=[];
  let obstruction=null,netTime=null,netPoint=null;
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
  const launchSpeedMph=Math.hypot(vx,vy,vz)/(22/15),horizontalAverageSpeedMph=Math.hypot(target.x-from.x,target.y-from.y)/flightDuration/(22/15);
  return Object.freeze({from:Object.freeze(from),target:Object.freeze(target),apexFeet,vy,flightDuration,vx,vz,first,
    netTime,netPoint:netPoint&&Object.freeze(netPoint),
    obstruction:obstruction&&Object.freeze({...obstruction,position:Object.freeze(point(obstruction.position))}),
    events:Object.freeze(events),launchSpeedMph,horizontalAverageSpeedMph});
}

export function solveFlightV2(input){
  const launch=solveFlightLaunchV2(input);
  const {from,target,apexFeet,vy,flightDuration,vx,vz,first,launchSpeedMph,horizontalAverageSpeedMph}=launch;
  let netTime=launch.netTime,netPoint=launch.netPoint&&point(launch.netPoint);
  const obstruction=launch.obstruction&&{...launch.obstruction,position:netPoint};
  const stages=[],events=[...launch.events];
  let terminal=null;
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
  // Every solved flight has its incoming stage followed by rebound or net
  // drop. Cache their immutable boundaries and construct the public sample
  // directly, retaining the exact arithmetic and EPS comparisons below.
  const firstStage=stages[0],lastStage=stages.at(-1),stageBoundary=firstStage.endTime-EPS;
  const endBoundary=totalDuration-EPS,bounceBoundary=firstLandingTime-EPS;
  const sampleBoard=seconds=>{finite(seconds,'seconds');const t=clamp(seconds,0,totalDuration),selected=t<stageBoundary?firstStage:lastStage;
    const local=clamp(t-selected.startTime,0,selected.duration),bounce=Math.abs(firstLandingTime-t)<EPS;
    return Object.freeze({x:selected.from.x+selected.vx*local,y:selected.from.y+selected.vz*local,
      heightFeet:Math.max(R,selected.from.heightFeet+selected.vy*local-.5*G*local*local),
      phase:bounce?'bounce':t>=endBoundary?(terminal?'dead':'second-bounce'):selected.phase,bounced:t>=bounceBoundary});};
  const metadata=Object.freeze({physicsVersion:PHYSICS_VERSION,type:input.family,from:{x:from.x,y:from.y},to:target,
    contactHeightFeet:from.heightFeet,apexFeet,speedMph:launchSpeedMph,launchSpeedMph,launchVerticalFeetPerSecond:vy,horizontalAverageSpeedMph,
    netClearanceInches:netPoint?(netPoint.heightFeet-R-localNetHeightFeet(netPoint.x))*12:null,
    spin:Object.freeze({type:'flat',rpm:0}),bounce:Object.freeze({enabled:true,heightFeet:Math.pow(Math.sqrt(vy*vy+2*G*(from.heightFeet-R))*PHYSICS_V2.restitution,2)/(2*G)})});
  const sample=seconds=>{const p=sampleBoard(seconds);return Object.freeze({x:(p.x-10)*.3048,y:p.heightFeet*.3048,z:(p.y-22)*.3048,phase:p.phase,bounced:p.bounced});};
  return Object.freeze({physicsVersion:PHYSICS_VERSION,metadata,from:Object.freeze(from),target:Object.freeze(target),stages:Object.freeze(stages),events:Object.freeze(events.sort((a,b)=>a.time-b.time)),
    firstLandingTime,flightDuration:firstLandingTime,landing:Object.freeze(landing),secondBounceTime,totalDuration,netTime,netPoint,
    obstruction:obstruction&&Object.freeze(obstruction),terminal:terminal&&Object.freeze(terminal),launchSpeedMph,horizontalAverageSpeedMph,sampleBoard,sample});
}

// Inverse of this same constant-gravity solver. Policy can choose a landing
// and ball-surface clearance without approximating a separate flight or also
// imposing an incompatible mph/apex. The returned flight remains authoritative.
export function solveFlightForClearanceV2(input,clearanceFeet){
  if(input.physics!==undefined)throw new TypeError('Choose a clearance or explicit launch physics, not both.');
  finite(clearanceFeet,'clearanceFeet');
  if(clearanceFeet< -2||clearanceFeet>24)throw new RangeError('Clearance must be between -2 and 24 feet.');
  const from=input.from||{},target=input.target||{};
  for(const[name,n]of Object.entries({x:from.x,y:from.y,heightFeet:from.heightFeet,targetX:target.x,targetY:target.y}))finite(n,name);
  const fraction=(22-from.y)/(target.y-from.y);
  if(!(fraction>0&&fraction<1))throw new RangeError('A clearance flight must cross the net plane.');
  const x=from.x+(target.x-from.x)*fraction;
  if(x<0||x>20)throw new RangeError('Use explicit launch physics outside the net sidelines.');
  const height=localNetHeightFeet(x)+R+clearanceFeet;
  const durationSquared=2*(height-from.heightFeet*(1-fraction)-R*fraction)/(G*fraction*(1-fraction));
  if(!(durationSquared>0))throw new RangeError('The requested clearance lies below the coherent ballistic flight.');
  const duration=Math.sqrt(durationSquared);
  const launch=(R-from.heightFeet+.5*G*durationSquared)/duration;
  return solveFlightV2({...input,physics:{launchVerticalFeetPerSecond:launch}});
}

// Every subsequent contact is sampled from the actual incoming solution.
export function interceptFlightV2(flight,{kind,stance,contactOverride,afterBounceSeconds,beforeBounceSeconds}){
  let time;
  if(beforeBounceSeconds!==undefined){
    finite(beforeBounceSeconds,'beforeBounceSeconds');
    if(kind!=='volley'||contactOverride||afterBounceSeconds!==undefined||beforeBounceSeconds<.001||beforeBounceSeconds>5)throw new RangeError('A bounded pre-bounce time requires an unambiguous volley contact.');
  }
  if(kind==='volley'){
    const y=contactOverride?.y??(stance.y<22?Math.min(14.75,stance.y):Math.max(29.25,stance.y)),first=flight.stages[0];
    if(Math.abs(first.vz)<EPS)throw new RangeError('A volley requires an incoming depth crossing.');
    time=beforeBounceSeconds===undefined?(y-flight.from.y)/first.vz:flight.firstLandingTime-beforeBounceSeconds;
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

// Analytic derivative of the same solved stages used for position samples.
// Pressure observes the incoming speed at interception, including bounce loss,
// rather than treating its launch speed as the later contact speed.
export function sampleFlightVelocityV2(flight,seconds){
  if(flight?.physicsVersion!==PHYSICS_VERSION||!Array.isArray(flight.stages)||!flight.stages.length)throw new TypeError('A supported solved flight is required.');
  finite(seconds,'seconds');
  if(seconds<0||seconds>flight.totalDuration+EPS)throw new RangeError('Velocity time must lie inside the solved flight.');
  const time=clamp(seconds,0,flight.totalDuration),selected=flight.stages.find(s=>time<s.endTime-EPS)||flight.stages.at(-1);
  const local=clamp(time-selected.startTime,0,selected.duration);
  const x=selected.vx,y=selected.vz,height=selected.vy-G*local;
  return Object.freeze({version:'play-velocity-v2',timeSeconds:time,phase:selected.phase,
    xFeetPerSecond:x,yFeetPerSecond:y,heightFeetPerSecond:height,
    speedMph:Math.hypot(x,y,height)/(22/15)});
}

// Stable real roots on a normalized finite interval. This is only an analytic
// sampling aid; interception, feet and actual routes still decide feasibility.
function reachBoundaryRoots(a,b,c){
  const scale=Math.max(Math.abs(a),Math.abs(b),Math.abs(c),1);a/=scale;b/=scale;c/=scale;
  const tolerance=32*Number.EPSILON;
  if(Math.abs(a)<=tolerance)return Math.abs(b)<=tolerance?[]:[-c/b];
  let discriminant=b*b-4*a*c;
  if(discriminant<0&&discriminant>=-tolerance*(b*b+Math.abs(4*a*c)))discriminant=0;
  if(discriminant<0)return[];
  const root=Math.sqrt(discriminant),q=-.5*(b+(b<0?-root:root));
  return q===0?[-b/(2*a)]:[q/a,c/q];
}

/**
 * Absolute candidate times from the actual solved horizontal stages. Minima
 * of distance minus reaction-adjusted reach, reach-boundary roots and interior
 * midpoints expose narrow windows without uniform time sampling. No time is a
 * claim of a legal paddle contact. The caller supplies its existing reach model.
 */
export function flightReachCriticalTimesV2(flight,origin,reachModel){
  if(flight?.physicsVersion!==PHYSICS_VERSION||!Array.isArray(flight.stages)||!flight.stages.length)throw new TypeError('A supported solved flight is required.');
  finite(origin?.x,'origin.x');finite(origin?.y,'origin.y');
  const reaction=finite(reachModel?.reactionSeconds,'reactionSeconds'),speed=finite(reachModel?.speedFeetPerSecond,'speedFeetPerSecond'),paddle=finite(reachModel?.paddleReachFeet,'paddleReachFeet');
  if(reaction<0||speed<0||paddle<0||!Number.isFinite(speed*speed))throw new RangeError('A finite nonnegative reach model is required.');
  finite(flight.totalDuration,'totalDuration');
  if(!(flight.totalDuration>0))throw new RangeError('A positive solved flight duration is required.');
  let physicalEnd=flight.totalDuration;
  for(const boundary of [flight.terminal,flight.obstruction])if(boundary){
    finite(boundary.time,'physical end time');
    if(boundary.time<0)throw new RangeError('A physical end time must be nonnegative.');
    physicalEnd=Math.min(physicalEnd,boundary.time);
  }
  const times=[],add=time=>{if(Number.isFinite(time)&&time>0&&time<physicalEnd)times.push(time);};
  let priorEnd=0;
  for(const current of flight.stages){
    for(const[name,value]of Object.entries({x:current?.from?.x,y:current?.from?.y,vx:current?.vx,vz:current?.vz,startTime:current?.startTime,duration:current?.duration,endTime:current?.endTime}))finite(value,`stage.${name}`);
    if(current.startTime<0||current.duration<=0||current.startTime<priorEnd-EPS||Math.abs(current.endTime-current.startTime-current.duration)>EPS)throw new RangeError('Ordered positive solved stages are required.');
    priorEnd=current.endTime;
    const start=current.startTime,end=Math.min(current.endTime,physicalEnd);
    if(!(end>start))continue;
    const dx=current.from.x-origin.x,dy=current.from.y-origin.y,vx=current.vx,vz=current.vz;
    const horizontal=Math.hypot(vx,vz),squared=horizontal*horizontal,dot=dx*vx+dy*vz;
    if(![dx,dy,squared,dot].every(Number.isFinite))throw new RangeError('Finite horizontal reach geometry is required.');
    const localEnd=end-start,cuts=[0,localEnd];
    if(reaction>start&&reaction<end)cuts.push(reaction-start);
    cuts.sort((a,b)=>a-b);
    const closest=squared>0?-dot/squared:null;
    // For |v| > running speed, the sole post-reaction stationary minimum is
    // after closest approach. The cross product gives perpendicular distance
    // without subtracting nearly equal squared distances.
    const perpendicular=horizontal>0?Math.abs(dx*(vz/horizontal)-dy*(vx/horizontal)):0;
    const stationary=speed===0?closest:horizontal>speed&&squared>0
      ?closest+speed*perpendicular/(horizontal*Math.sqrt((horizontal-speed)*(horizontal+speed))):null;
    const edgeInset=Math.min(1e-7,localEnd/4);
    add(start+edgeInset);add(end-edgeInset);
    if(reaction>start&&reaction<end)add(reaction);
    if(closest!==null&&closest>=0&&closest<=localEnd)add(start+closest);
    if(stationary!==null&&start+stationary>=reaction&&stationary>=0&&stationary<=localEnd)add(start+stationary);
    for(let index=1;index<cuts.length;index++){
      const low=cuts[index-1],high=cuts[index],width=high-low;
      const running=start+(low+high)/2>=reaction?speed:0;
      const radius=paddle+speed*Math.max(0,start+low-reaction),x=dx+vx*low,y=dy+vz*low;
      const a=(squared-running*running)*width*width,b=2*(x*vx+y*vz-radius*running)*width,c=x*x+y*y-radius*radius;
      if(![a,b,c].every(Number.isFinite))throw new RangeError('Finite reach-boundary coefficients are required.');
      const roots=reachBoundaryRoots(a,b,c).filter(root=>Number.isFinite(root)&&root>=0&&root<=1).map(root=>low+root*width).sort((a,b)=>a-b);
      const intervals=[low,...roots,high];
      for(const root of roots)add(start+root);
      for(let part=1;part<intervals.length;part++)if(intervals[part]>intervals[part-1]){
        const middle=(intervals[part-1]+intervals[part])/2,radiusAtMiddle=paddle+speed*Math.max(0,start+middle-reaction);
        if(Math.hypot(dx+vx*middle,dy+vz*middle)<=radiusAtMiddle)add(start+middle);
      }
    }
  }
  return Object.freeze([...new Set(times)].sort((a,b)=>a-b));
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
