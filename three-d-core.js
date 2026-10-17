// Pure, renderer-independent foundations for Pickleball Park playback.
import { COURT_DIMENSIONS } from './court-geometry.js';
export { COURT_DIMENSIONS } from './court-geometry.js';

export const FEET_TO_METERS = 0.3048;
export const CAMERA_PRESETS = Object.freeze({
    overhead:{label:'Overhead 3D',position:[5.5,12,9.5],target:[0,.35,0],fov:46},
    sideline:{label:'Sideline',position:[11,7,0],target:[0,.7,0],fov:50},
    'behind-green':{label:'Behind Green',position:[0,1.95,-10.2],target:[0,.8,1.4],fov:52},
    'behind-orange':{label:'Behind Orange',position:[0,1.95,10.2],target:[0,.8,-1.4],fov:52}
});

export function fitCameraPreset(name,aspect=16/9,hudFraction=0,envelope=null,{courtFirst=false,compactLandscape=false}={}){
    let preset=CAMERA_PRESETS[name]; if(name==='overhead'&&aspect<.9)preset={...preset,position:[1.4,12,9.5]};
    if(!preset)throw new RangeError(`Unknown camera preset: ${name}.`);
    // Builder composition follows the available playing surface, not scenery.
    // Keep the same elevated preset identity while fitting the long court axis
    // across wide screens. Other camera presets retain their existing views.
    if((courtFirst||compactLandscape)&&name==='overhead')preset={...preset,position:aspect>=1.35?[12,16,3.5]:[1.4,16,10],target:[0,.35,0]};
    const safeAspect=Number.isFinite(aspect)&&aspect>0?aspect:1,reserved=Number.isFinite(hudFraction)?Math.max(0,Math.min(.8,hudFraction)):0;
    const target=[...preset.target],direction=preset.position.map((v,i)=>v-target[i]),originalDistance=Math.hypot(...direction);
    const normal=direction.map(v=>v/originalDistance),horizontalLength=Math.hypot(normal[0],normal[2]);
    const right=[normal[2]/horizontalLength,0,-normal[0]/horizontalLength];
    const up=[normal[1]*right[2],normal[2]*right[0]-normal[0]*right[2],-normal[1]*right[0]];
    const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
    const points=envelope||[-4.4,4.4].flatMap(x=>[0,2.8].flatMap(y=>[-8.4,8.4].map(z=>[x,y,z]))),tangent=Math.tan(preset.fov*Math.PI/360);
    let distance=.1; for(const point of points){const relative=point.map((v,i)=>v-target[i]),near=dot(relative,normal);distance=Math.max(distance,near+Math.abs(dot(relative,right))/(tangent*safeAspect*.94),near+Math.abs(dot(relative,up))/(tangent*(1-reserved)*.94));}
    const position=target.map((v,i)=>v+normal[i]*distance);
    return Object.freeze({label:preset.label,position:Object.freeze(position),target:Object.freeze(target),fov:preset.fov,distanceScale:distance/originalDistance});
}

export function boardToWorld(point,heightFeet=0){
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(heightFeet))throw new TypeError('Board and height coordinates must be finite numbers.');
    return{x:(point.x-10)*FEET_TO_METERS,y:heightFeet*FEET_TO_METERS,z:(point.y-22)*FEET_TO_METERS};
}
export function worldToBoard(point){
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z))throw new TypeError('Finite world x/z coordinates are required.');
    return{x:point.x/FEET_TO_METERS+10,y:point.z/FEET_TO_METERS+22};
}

const SHOT_DEFAULTS=Object.freeze({
    serve:{speedMph:28,apexFeet:7,netClearanceInches:24,spin:{type:'topspin',rpm:650}},
    return:{speedMph:30,apexFeet:7.5,netClearanceInches:24,spin:{type:'topspin',rpm:700}},
    drop:{speedMph:18,apexFeet:7.5,netClearanceInches:16,spin:{type:'backspin',rpm:550}},
    drive:{speedMph:38,apexFeet:5.75,netClearanceInches:8,spin:{type:'topspin',rpm:950}},
    block:{speedMph:16,apexFeet:4.75,netClearanceInches:10,spin:{type:'backspin',rpm:350}},
    dink:{speedMph:12,apexFeet:5.1,netClearanceInches:10,spin:{type:'backspin',rpm:300}},
    volley:{speedMph:22,apexFeet:4.8,netClearanceInches:8,spin:{type:'flat',rpm:250}},
    'short-hop':{speedMph:14,apexFeet:5.2,netClearanceInches:11,spin:{type:'backspin',rpm:300}},
    reset:{speedMph:13,apexFeet:5.6,netClearanceInches:13,spin:{type:'backspin',rpm:250}},
    lob:{speedMph:20,apexFeet:13,netClearanceInches:70,spin:{type:'topspin',rpm:500}},
    overhead:{speedMph:36,apexFeet:8.5,netClearanceInches:18,spin:{type:'topspin',rpm:850}},
    flat:{speedMph:24,apexFeet:6,netClearanceInches:14,spin:{type:'flat',rpm:250}}
});

export const STROKE_PROFILES=Object.freeze({
    serve:{duration:.95,contactRatio:.48,prepareRatio:.34,recoverRatio:.82,intensity:.9},forehand:{duration:.72,contactRatio:.44,prepareRatio:.28,recoverRatio:.78,intensity:1},backhand:{duration:.76,contactRatio:.46,prepareRatio:.3,recoverRatio:.8,intensity:.9},
    drop:{duration:.82,contactRatio:.48,prepareRatio:.32,recoverRatio:.8,intensity:.52},drive:{duration:.68,contactRatio:.42,prepareRatio:.27,recoverRatio:.76,intensity:1.15},block:{duration:.52,contactRatio:.38,prepareRatio:.22,recoverRatio:.68,intensity:.35},
    dink:{duration:.68,contactRatio:.5,prepareRatio:.34,recoverRatio:.82,intensity:.38},volley:{duration:.48,contactRatio:.4,prepareRatio:.24,recoverRatio:.72,intensity:.62},'short-hop':{duration:.54,contactRatio:.46,prepareRatio:.28,recoverRatio:.76,intensity:.45},reset:{duration:.58,contactRatio:.46,prepareRatio:.28,recoverRatio:.8,intensity:.3},lob:{duration:.86,contactRatio:.44,prepareRatio:.27,recoverRatio:.8,intensity:.78},overhead:{duration:.7,contactRatio:.46,prepareRatio:.28,recoverRatio:.78,intensity:1.2}
});
const ART_ACTIONS=Object.freeze({serve:'serve',drop:'drop',drive:'drive',block:'block',dink:'drop',volley:'block','short-hop':'drop',reset:'block',lob:'lob',overhead:'overhead'});
const lerp=(a,b,t)=>a+(b-a)*t,clamp01=v=>Math.max(0,Math.min(1,v));
const distanceFeet=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const flightDuration=(a,b,speed,min=.55,max=3)=>Math.max(min,Math.min(max,distanceFeet(a,b)/(speed*1.4666667)));

function inferStroke(shot){if(shot.stroke)return shot.stroke;return STROKE_PROFILES[shot.type]?shot.type:'forehand';}
function inferContactKind(shot,stroke){if(shot.contact?.kind)return shot.contact.kind;if(stroke==='serve')return'serve';if(['volley','block','overhead'].includes(stroke))return'volley';if(stroke==='short-hop')return'short-hop';return'groundstroke';}

export function normalizeShotMetadata(shot={}){
    if(!shot.from||!shot.to)throw new TypeError('A shot requires finite from and to points.');boardToWorld(shot.from);boardToWorld(shot.to);
    const type=SHOT_DEFAULTS[shot.type]?shot.type:'flat',defaults=SHOT_DEFAULTS[type],trajectory=shot.trajectory3d||{},flight=shot.flight||{},spin=flight.spin||trajectory.spin||shot.spin||defaults.spin;
    const normalized={type,from:{...shot.from},to:{...shot.to},speedMph:flight.speedMph??trajectory.speedMph??defaults.speedMph,apexFeet:flight.apexFeet??trajectory.apexFeet??defaults.apexFeet,netClearanceInches:flight.netClearanceInches??trajectory.netClearanceInches??defaults.netClearanceInches,contactHeightFeet:shot.contact?.heightFeet??trajectory.contactHeightFeet??2.5,spin:{type:['topspin','backspin','flat'].includes(spin.type)?spin.type:'flat',rpm:Number.isFinite(spin.rpm)?Math.max(0,spin.rpm):0},bounce:{enabled:trajectory.bounce?.enabled??shot.bounce?.enabled??true,heightFeet:flight.bounceHeightFeet??trajectory.bounce?.heightFeet??shot.bounce?.heightFeet??1.1}};
    for(const key of['speedMph','apexFeet','netClearanceInches','contactHeightFeet'])if(!Number.isFinite(normalized[key])||normalized[key]<0)throw new TypeError(`Invalid shot ${key}.`);if(normalized.speedMph<=0)throw new RangeError('Shot speed must be greater than zero.');return normalized;
}

// Standalone illustrative API retained for compatibility. Compiled rallies use explicit bounce counts.
export function createTrajectory(shot){
    const metadata=normalizeShotMetadata(shot),start=boardToWorld(metadata.from,metadata.contactHeightFeet),landing=boardToWorld(metadata.to,COURT_DIMENSIONS.ballDiameterMeters/FEET_TO_METERS/2),duration=flightDuration(metadata.from,metadata.to,metadata.speedMph),bounceDuration=metadata.bounce.enabled?.42:0,totalDuration=duration+bounceDuration;
    const required=COURT_DIMENSIONS.netCenterHeightFeet+metadata.netClearanceInches/12,crosses=(metadata.from.y-22)*(metadata.to.y-22)<0;if(crosses&&metadata.apexFeet<required)throw new RangeError(`Shot apex ${metadata.apexFeet}ft cannot provide ${metadata.netClearanceInches}in net clearance.`);
    const kick=metadata.spin.type==='topspin'?1.22:metadata.spin.type==='backspin'?.55:.9,length=Math.hypot(landing.x-start.x,landing.z-start.z)||1,bounceEnd={x:landing.x+(landing.x-start.x)/length*.85*kick,y:landing.y,z:landing.z+(landing.z-start.z)/length*.85*kick};
    const flightPoint=p=>{const t=clamp01(p),baseline=lerp(start.y,landing.y,t),lift=Math.max(0,metadata.apexFeet*FEET_TO_METERS-(start.y+landing.y)/2);return{x:lerp(start.x,landing.x,t),y:baseline+4*t*(1-t)*lift,z:lerp(start.z,landing.z,t)}};
    const sample=seconds=>{const time=Math.max(0,Math.min(totalDuration,seconds));if(time<=duration||!bounceDuration){const p=duration?time/duration:1;return{...flightPoint(p),phase:time>=duration?'landed':'flight',bounced:false}}const t=(time-duration)/bounceDuration;return{x:lerp(landing.x,bounceEnd.x,t),y:landing.y+Math.sin(Math.PI*t)*metadata.bounce.heightFeet*FEET_TO_METERS,z:lerp(landing.z,bounceEnd.z,t),phase:t>=1?'complete':'bounce',bounced:true}};
    const netProgress=crosses?(22-metadata.from.y)/(metadata.to.y-metadata.from.y):null,netCrossingHeightMeters=netProgress===null?null:flightPoint(netProgress).y;if(crosses&&netCrossingHeightMeters<required*FEET_TO_METERS-1e-6)throw new RangeError('Constructed trajectory does not clear the net.');
    return Object.freeze({metadata,start,landing,bounceEnd,flightDuration:duration,bounceDuration,totalDuration,netCrossingHeightMeters,sample});
}

export function resolveShotSemantics(shot,previousPositions={}){
    if(!shot)return null;const players=Object.keys(previousPositions).filter(id=>id.startsWith('player')),fallback=players.map(id=>({id,distance:distanceFeet(previousPositions[id],shot.from)})).sort((a,b)=>a.distance-b.distance)[0]?.id,playerId=shot.playerId||fallback;
    if(!playerId||!previousPositions[playerId]||!playerId.startsWith('player'))throw new TypeError(`Unknown striking player: ${playerId||'none'}.`);
    const stroke=inferStroke(shot),profile=STROKE_PROFILES[stroke];if(!profile)throw new TypeError(`Unsupported stroke: ${stroke}.`);
    const source=shot.contact?.point||shot.contact3d||shot.from,heightFeet=shot.contact?.heightFeet??source.heightFeet??shot.trajectory3d?.contactHeightFeet??2.5;if(!Number.isFinite(source.x)||!Number.isFinite(source.y)||!Number.isFinite(heightFeet)||heightFeet<0)throw new TypeError('3D contact coordinates and height must be finite nonnegative values.');
    const point=Object.freeze({x:source.x,y:source.y,heightFeet}),kind=inferContactKind(shot,stroke);if(!['serve','groundstroke','volley','short-hop'].includes(kind))throw new TypeError(`Unsupported contact kind: ${kind}.`);
    const strokeSide=shot.contact?.strokeSide||shot.contact?.side||(stroke==='backhand'?'backhand':'forehand');if(!['forehand','backhand'].includes(strokeSide))throw new TypeError(`Unsupported contact side: ${strokeSide}.`);
    let artAction=['forehand','backhand'].includes(stroke)?stroke:ART_ACTIONS[stroke];if(strokeSide==='backhand'&&['dink','volley','short-hop','reset','block'].includes(stroke))artAction='backhand';
    const contact=Object.freeze({kind,strokeSide,point,feet:Object.freeze((shot.contact?.feet||[]).map(p=>Object.freeze({...p}))),momentumEntersNonVolleyZone:shot.contact?.momentumEntersNonVolleyZone??null});
    return Object.freeze({playerId,stroke,shotType:shot.type||stroke,strokeSide,artAction,visualStroke:artAction,profile,contact,contact3d:point});
}

function arc(start,end,apexFeet){const lift=Math.max(0,apexFeet*FEET_TO_METERS-(start.y+end.y)/2);return p=>{const t=clamp01(p);return{x:lerp(start.x,end.x,t),y:lerp(start.y,end.y,t)+4*t*(1-t)*lift,z:lerp(start.z,end.z,t)}};}
function compileServePreparation(shot,semantics){
    const source=shot.servePreparation;if(!source)return null;
    if(semantics.contact.kind!=='serve'||source.method!=='drop')throw new TypeError('servePreparation is only supported for a drop serve.');
    const releaseHeightFeet=source.releaseHeightFeet??3.5,reboundDuration=source.reboundDuration??.34;
    if(!Number.isFinite(releaseHeightFeet)||releaseHeightFeet!==3.5)throw new RangeError('A drop serve must use the modelVersion 1 fixed 3.5ft release height.');
    if(!Number.isFinite(reboundDuration)||reboundDuration<.25||reboundDuration>.5)throw new RangeError('Drop-serve reboundDuration must be between 0.25 and 0.5 seconds.');
    const radiusFeet=COURT_DIMENSIONS.ballDiameterMeters/FEET_TO_METERS/2,contactHeightFeet=semantics.contact.point.heightFeet;
    if(contactHeightFeet<=radiusFeet)throw new RangeError('Drop-serve contact must occur above the preparatory bounce.');
    const gravity=32.174,fallDuration=Math.sqrt(2*(releaseHeightFeet-radiusFeet)/gravity),riseVelocity=(contactHeightFeet-radiusFeet+.5*gravity*reboundDuration*reboundDuration)/reboundDuration,totalDuration=fallDuration+reboundDuration;
    const release=boardToWorld(semantics.contact.point,releaseHeightFeet),ground=boardToWorld(semantics.contact.point,radiusFeet),contact=boardToWorld(semantics.contact.point,contactHeightFeet);
    const sample=seconds=>{const time=Math.max(0,Math.min(totalDuration,seconds));if(time<=fallDuration){const height=Math.max(radiusFeet,releaseHeightFeet-.5*gravity*time*time);return{...boardToWorld(semantics.contact.point,height),phase:Math.abs(time-fallDuration)<1e-9?'preparation-bounce':'serve-release',preparationBounced:time>=fallDuration}}const t=time-fallDuration,height=Math.max(radiusFeet,radiusFeet+riseVelocity*t-.5*gravity*t*t);return{...boardToWorld(semantics.contact.point,height),phase:time>=totalDuration?'contact':'serve-rise',preparationBounced:true}};
    return Object.freeze({method:'drop',release,ground,contact,releaseHeightFeet,fallDuration,reboundDuration,totalDuration,bounceTime:fallDuration,sample});
}
function compileLeg(shot,semantics,next){
    const metadata=normalizeShotMetadata({...shot,from:{x:semantics.contact.point.x,y:semantics.contact.point.y},trajectory3d:{...(shot.trajectory3d||{}),contactHeightFeet:semantics.contact.point.heightFeet}}),declared=shot.flight?.bounces;if(declared!==undefined&&![0,1].includes(declared))throw new RangeError('A rally leg must declare zero or one bounce.');
    const bounces=declared??(next?.contact.kind==='volley'?0:1),start=boardToWorld(semantics.contact.point,semantics.contact.point.heightFeet),radiusFeet=COURT_DIMENSIONS.ballDiameterMeters/FEET_TO_METERS/2,landing=boardToWorld(shot.to,radiusFeet),nextContact=next?boardToWorld(next.contact.point,next.contact.point.heightFeet):null,directEnd=nextContact||boardToWorld(shot.to,shot.flight?.endHeightFeet??radiusFeet),firstEnd=bounces?landing:directEnd;
    const firstDuration=flightDuration(semantics.contact.point,shot.to,metadata.speedMph),firstArc=arc(start,firstEnd,metadata.apexFeet);let reboundDuration=0;if(bounces&&nextContact){const d=distanceFeet(shot.to,next.contact.point);reboundDuration=next.contact.kind==='short-hop'?Math.max(.12,Math.min(.28,d/7+.1)):Math.max(.24,Math.min(.7,d/Math.max(8,metadata.speedMph*.7)+.24));}
    const reboundArc=nextContact ? (next.contact.kind==='short-hop' ? p => {
        const t=clamp01(p),rise=nextContact.y-landing.y;
        // Low contact on the rise: downward acceleration without an invented apex before contact.
        return {x:lerp(landing.x,nextContact.x,t),y:landing.y+rise*(1.25*t-.25*t*t),z:lerp(landing.z,nextContact.z,t)};
    } : arc(landing,nextContact,Math.max(metadata.bounce.heightFeet,next.contact.point.heightFeet+.25))) : null,totalDuration=firstDuration+reboundDuration;
    const sample=seconds=>{const time=Math.max(0,Math.min(totalDuration,seconds));if(time<firstDuration-1e-9)return{...firstArc(time/firstDuration),phase:'flight',bounced:false};if(!reboundDuration)return{...firstEnd,phase:bounces?'bounce':'complete',bounced:Boolean(bounces)};const p=(time-firstDuration)/reboundDuration;return{...reboundArc(p),phase:p>=1?'incoming-contact':'post-bounce',bounced:true}};
    const crosses=(semantics.contact.point.y-22)*(shot.to.y-22)<0,netProgress=crosses?(22-semantics.contact.point.y)/(shot.to.y-semantics.contact.point.y):null,netTime=netProgress===null?null:firstDuration*netProgress,netPoint=netTime===null?null:firstArc(netProgress),required=(COURT_DIMENSIONS.netCenterHeightFeet+metadata.netClearanceInches/12)*FEET_TO_METERS;if(netPoint&&netPoint.y<required-1e-6)throw new RangeError('Constructed rally leg does not clear the net.');
    const end=nextContact||firstEnd;return Object.freeze({metadata,start,landing,bounceEnd:end,flightDuration:firstDuration,bounceDuration:reboundDuration,totalDuration,netCrossingHeightMeters:netPoint?.y??null,netTime,netPoint,bounces,end,endpoint:nextContact?'next-contact':bounces?'bounce':'flight-end',sample});
}

const freezeEvent=e=>Object.freeze({...e,position:Object.freeze({...e.position})}),priority={'preparation-bounce':0,'net-crossing':1,bounce:2,end:3,contact:4};
export function compilePlayTimeline(play){
    if(!play?.steps?.length)throw new TypeError('A Play requires at least one step.');const segments=[],events=[];let cursor=0,rallyLeg=0,previousLeg=null;
    for(let index=1;index<play.steps.length;index++){
        const previous=play.steps[index-1],step=play.steps[index],shotSemantics=step.shot?resolveShotSemantics(step.shot,previous.positions):null,nextStep=play.steps[index+1],nextShotSemantics=nextStep?.shot?resolveShotSemantics(nextStep.shot,step.positions):null,servePreparation=shotSemantics?compileServePreparation(step.shot,shotSemantics):null,contactTime=shotSemantics?(servePreparation?.totalDuration??(previous.shot?0:shotSemantics.profile.duration*shotSemantics.profile.contactRatio)):null;
        let trajectory=null,duration,endpoint='movement';if(shotSemantics){rallyLeg++;trajectory=compileLeg(step.shot,shotSemantics,nextShotSemantics);duration=contactTime+trajectory.totalDuration;endpoint=trajectory.endpoint;}else duration=Math.max(.35,(step.durationMs||850)/1000);
        const segment={index,previous,step,nextStep,trajectory,servePreparation,shotSemantics,nextShotSemantics,startTime:cursor,duration,endTime:cursor+duration,contactTime,trajectoryStartTime:contactTime,trajectoryEndTime:trajectory?contactTime+trajectory.totalDuration:null,rallyLeg:shotSemantics?rallyLeg:null,endpoint,ballStart:servePreparation?.release||trajectory?.start||previousLeg?.end||boardToWorld(previous.positions.ball,1.2)};
        segment.ballEnd=trajectory?.end||(previousLeg?.end&&step.positions.ball.x===previous.positions.ball.x&&step.positions.ball.y===previous.positions.ball.y?previousLeg.end:boardToWorld(step.positions.ball,1.2));segments.push(Object.freeze(segment));
        if(trajectory){const prefix=`${play.id||'play'}:leg-${rallyLeg}`,base=cursor+contactTime;if(servePreparation)events.push(freezeEvent({id:`${prefix}:preparation-bounce`,type:'preparation-bounce',time:cursor+servePreparation.bounceTime,actor:shotSemantics.playerId,position:servePreparation.ground,rallyLeg}));events.push(freezeEvent({id:`${prefix}:contact`,type:'contact',time:base,actor:shotSemantics.playerId,position:trajectory.start,rallyLeg}));if(trajectory.netTime!==null)events.push(freezeEvent({id:`${prefix}:net-crossing`,type:'net-crossing',time:base+trajectory.netTime,actor:null,position:trajectory.netPoint,rallyLeg}));if(trajectory.bounces)events.push(freezeEvent({id:`${prefix}:bounce`,type:'bounce',time:base+trajectory.flightDuration,actor:null,position:trajectory.landing,rallyLeg}));events.push(freezeEvent({id:`${prefix}:end`,type:'end',time:cursor+duration,actor:nextShotSemantics?.playerId||null,position:trajectory.end,rallyLeg}));previousLeg=trajectory;}cursor+=duration;
    }
    events.sort((a,b)=>a.time-b.time||priority[a.type]-priority[b.type]||a.id.localeCompare(b.id));return Object.freeze({play,segments:Object.freeze(segments),events:Object.freeze(events),duration:cursor});
}

function segmentAt(timeline,time){return timeline.segments.find(s=>time<s.endTime-1e-9)||timeline.segments.at(-1)||null;}
export function samplePlayBall(timeline,seconds){
    if(!timeline?.segments||!Number.isFinite(seconds))throw new TypeError('A compiled timeline and finite time are required.');const time=Math.max(0,Math.min(timeline.duration,seconds)),segment=segmentAt(timeline,time);if(!segment){const board=timeline.play.steps[0].positions.ball,world=boardToWorld(board,1.2);return Object.freeze({...world,board:Object.freeze({...board}),phase:'ready',launched:false,rallyLeg:null,time});}
    const local=Math.max(0,Math.min(segment.duration,time-segment.startTime));let point,phase,launched=false;if(segment.trajectory){if(local<segment.contactTime-1e-9){if(segment.servePreparation){const sampled=segment.servePreparation.sample(local);point=sampled;phase=sampled.phase;}else{point=segment.trajectory.start;phase='waiting-contact';}}else{const sampled=segment.trajectory.sample(local-segment.trajectoryStartTime);point=sampled;phase=Math.abs(local-segment.contactTime)<1e-9?'contact':sampled.phase;launched=true;}}else{const p=segment.duration?clamp01(local/segment.duration):1,e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;point={x:lerp(segment.ballStart.x,segment.ballEnd.x,e),y:lerp(segment.ballStart.y,segment.ballEnd.y,e),z:lerp(segment.ballStart.z,segment.ballEnd.z,e)};phase='held';}
    return Object.freeze({x:point.x,y:point.y,z:point.z,board:Object.freeze(worldToBoard(point)),phase:time===0?'ready':timeline.events.some(event=>event.type==='bounce'&&Math.abs(event.time-time)<1e-9)?'bounce':phase,launched,rallyLeg:segment.rallyLeg,time});
}
export function samplePlayState(timeline,seconds,settings={}){
    if(!timeline?.segments||!Number.isFinite(seconds))throw new TypeError('A compiled timeline and finite time are required.');const time=Math.max(0,Math.min(timeline.duration,seconds)),segment=segmentAt(timeline,time),ball=samplePlayBall(timeline,time),positions={};
    if(settings.includePositions!==false){if(!segment)Object.assign(positions,timeline.play.steps[0].positions);else{const p=segment.duration?clamp01((time-segment.startTime)/segment.duration):1,e=settings.linearPositions?p:p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;for(const[id,target]of Object.entries(segment.step.positions)){const from=segment.previous.positions[id]||target;positions[id]={x:lerp(from.x,target.x,e),y:lerp(from.y,target.y,e)}}positions.ball={...ball.board};}}
    return Object.freeze({time,stepIndex:segment?.index||0,segment,ball,positions:Object.freeze(Object.fromEntries(Object.entries(positions).map(([id,p])=>[id,Object.freeze(p)])))});
}

export class PlaybackClock{constructor(){this.elapsed=0;this.playbackRate=1;this.playing=false;this.lastTimestamp=null}play(timestamp=performance.now()){if(this.playing)return;this.playing=true;this.lastTimestamp=timestamp}pause(){this.playing=false;this.lastTimestamp=null}restart(){this.elapsed=0;this.lastTimestamp=null}setRate(rate){if(![1,.5,.25].includes(rate))throw new RangeError('Unsupported playback rate.');this.playbackRate=rate}update(timestamp){if(!this.playing)return this.elapsed;if(this.lastTimestamp===null)this.lastTimestamp=timestamp;const delta=Math.max(0,timestamp-this.lastTimestamp)/1000;this.elapsed+=delta*this.playbackRate;this.lastTimestamp=timestamp;return this.elapsed}}
