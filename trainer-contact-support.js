import {HUMAN_ATHLETE_PROFILE_V1 as HUMAN} from './human-athlete-profile.js';

// Numeric geometry for the active instructional trainer, not a physiological
// reach test, pickleball rule check, or permission to alter an authored contact.
// All vectors are plain {x,y,z} values. No input is changed and no mesh is made.
export const TRAINER_SUPPORT_LIMITS = Object.freeze({
 profileVersion: HUMAN.version,
 maximumArmReach: HUMAN.upperArmLength + HUMAN.forearmLength - 1e-6,
 minimumArmReach: Math.abs(HUMAN.upperArmLength - HUMAN.forearmLength) + 1e-6,
 maximumLegReach: HUMAN.thighLength + HUMAN.shinLength - 1e-6,
 minimumLegReach: Math.abs(HUMAN.thighLength - HUMAN.shinLength) + 1e-6,
 minimumHipHeight: .36,
 maximumHipHeight: HUMAN.maximumHipHeight,
 maximumHipHorizontalOffset: HUMAN.maximumHipHorizontalOffset,
});
const L = TRAINER_SUPPORT_LIMITS;
const v = (x=0,y=0,z=0) => ({x,y,z});
const copy = p => v(p.x,p.y,p.z);
const add = (a,b) => v(a.x+b.x,a.y+b.y,a.z+b.z);
const sub = (a,b) => v(a.x-b.x,a.y-b.y,a.z-b.z);
const scale = (a,s) => v(a.x*s,a.y*s,a.z*s);
const addScaled = (a,b,s) => v(a.x+b.x*s,a.y+b.y*s,a.z+b.z*s);
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const length = a => Math.sqrt(dot(a,a));
const distance = (a,b) => length(sub(a,b));
const unit = a => scale(a,1/(length(a)||1));
const cross = (a,b) => v(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const smooth = n => {const t=clamp(n,0,1);return t*t*(3-2*t);};
const finite = p => p && ['x','y','z'].every(key=>Number.isFinite(p[key]));
const planar = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const angleDelta = angle => Math.atan2(Math.sin(angle),Math.cos(angle));
const rotateY = (p,yaw) => v(p.x*Math.cos(yaw)+p.z*Math.sin(yaw),p.y,-p.x*Math.sin(yaw)+p.z*Math.cos(yaw));
const rotateX = (p,angle) => v(p.x,p.y*Math.cos(angle)-p.z*Math.sin(angle),p.y*Math.sin(angle)+p.z*Math.cos(angle));

// The exact projection onto the intersection of two equal closed balls.
// A sphere projection suffices when only one constraint is active. Otherwise
// the closest point is on the intersection circle. Disjoint balls have no
// feasible point: return their midpoint and an explicit error, never a promise.
function legProjection(point,a,b,radius) {
 const da=distance(point,a),db=distance(point,b);
 if(da<=radius&&db<=radius)return copy(point);
 for(const centre of [a,b]){
  const delta=sub(point,centre),candidate=addScaled(centre,delta,radius/(length(delta)||1));
  if(distance(candidate,a)<=radius+1e-12&&distance(candidate,b)<=radius+1e-12)return candidate;
 }
 const separation=sub(b,a),d=length(separation),axis=scale(separation,1/(d||1));
 if(d<1e-12)return add(a,v(0,radius,0));
 const middle=scale(add(a,b),.5);
 if(d>2*radius)return middle;
 let radial=sub(point,middle);radial=addScaled(radial,axis,-dot(radial,axis));
 if(dot(radial,radial)<1e-16){
  radial=addScaled(v(0,1,0),axis,-axis.y);
  if(dot(radial,radial)<1e-16)radial=v(1,0,0);
 }
 return addScaled(middle,unit(radial),Math.sqrt(Math.max(0,radius*radius-d*d/4)));
}
export function constrainTrainerLegPelvis(point,a,b,radius=L.maximumLegReach) {
 if(![point,a,b].every(finite)||!Number.isFinite(radius)||radius<=0)throw new TypeError('Finite points and a positive radius are required.');
 const projected=legProjection(point,a,b,radius);
 const error=Math.max(0,distance(projected,a)-radius,distance(projected,b)-radius);
 return {point:projected,feasible:error<=1e-12,error,intersectionError:Math.max(0,distance(a,b)/2-radius)};
}

// Extracted from the renderer's shared-pelvis solve. Ankles are the shin end
// points, already raised from the sole by the actual ankle axis. Hip offsets
// include the pelvis yaw. Everything is in the trainer's visual-local frame.
// The final leg projection is exact; the bounded alternating arm solve does
// not establish global reachability. Residuals stay visible in the result.
export function solveTrainerSupport({pelvis,shoulderOffset,wrist,ankles,hipOffsets}) {
 if(![pelvis,shoulderOffset,wrist].every(finite)||!Array.isArray(ankles)||ankles.length!==2||!ankles.every(finite)||!Array.isArray(hipOffsets)||hipOffsets.length!==2||!hipOffsets.every(finite))throw new TypeError('Finite pelvis, shoulder, wrist and two ankle/hip-offset vectors are required.');
 const centres=ankles.map((ankle,i)=>sub(ankle,hipOffsets[i]));
 const armCentre=sub(wrist,shoulderOffset),desiredWrist=copy(wrist);
 let point=legProjection(pelvis,centres[0],centres[1],L.maximumLegReach),iterations=0;
 for(let i=0;i<32;i++){
  const delta=sub(point,armCentre),d=length(delta);
  if(d<=L.maximumArmReach+1e-9)break;
  point=addScaled(armCentre,delta,L.maximumArmReach/d);
  const horizontal=Math.hypot(point.x,point.z);
  if(horizontal>L.maximumHipHorizontalOffset){point.x*=L.maximumHipHorizontalOffset/horizontal;point.z*=L.maximumHipHorizontalOffset/horizontal;}
  point.y=clamp(point.y,L.minimumHipHeight,L.maximumHipHeight);
  point=legProjection(point,centres[0],centres[1],L.maximumLegReach);
  iterations++;
 }
 const shoulder=add(point,shoulderOffset),reach=sub(wrist,shoulder),desiredArmReach=length(reach);
 const solvedWrist=desiredArmReach>L.maximumArmReach||desiredArmReach<L.minimumArmReach
  ?addScaled(shoulder,unit(reach),clamp(desiredArmReach,L.minimumArmReach,L.maximumArmReach)):copy(wrist);
 const reachCorrection=sub(solvedWrist,desiredWrist),reachError=length(reachCorrection);
 const legDistances=centres.map(centre=>distance(point,centre));
 // Same unequal-bone triangle as production. This reports the rendered shin
 // error even if the requested stance makes the two leg balls disjoint.
 const legErrors=legDistances.map(d=>{
  const r=clamp(Math.max(.001,d),L.minimumLegReach,L.maximumLegReach);
  const along=(HUMAN.thighLength**2-HUMAN.shinLength**2+r*r)/(2*r);
  const height=Math.sqrt(Math.max(0,HUMAN.thighLength**2-along*along));
  return Math.abs(Math.hypot(d-along,height)-HUMAN.shinLength);
 });
 const legError=Math.max(...legErrors),armReach=distance(shoulder,solvedWrist);
 const armError=Math.max(0,L.minimumArmReach-armReach,armReach-L.maximumArmReach);
 const boundsError=Math.max(0,Math.hypot(point.x,point.z)-L.maximumHipHorizontalOffset,L.minimumHipHeight-point.y,point.y-L.maximumHipHeight);
 const legIntersectionError=Math.max(0,distance(centres[0],centres[1])/2-L.maximumLegReach);
 const reason=legError>1e-7||legIntersectionError>1e-12?'stance exceeds fixed leg reach'
  :boundsError>1e-7?'stance exceeds bounded pelvis support'
  :armError>1e-7?'degenerate arm support'
  :reachError>1e-5?'contact exceeds this grounded pose':null;
 return {pelvis:point,shoulder,wrist:solvedWrist,desiredWrist,reachCorrection,reachError,legError,feasible:reason===null,reason,
  diagnostics:{iterations,desiredArmReach,armReach,armError,legDistances,legErrors,legIntersectionError,boundsError}};
}

// The same forward-sector adjustment and +/-75-degree stance turn used by
// production. This is contact-facing only, before preparation/recovery blends.
export function trainerContactFacing({rawFacing,root,contact,family,strokeSide}) {
 const net=root.z<0?1:-1;
 const facing=unit(v(rawFacing?.x||0,0,rawFacing?.z??net));
 if(family==='ready'||!contact)return facing;
 const dx=contact.x-root.x,dz=contact.z-root.z;
 if(Math.hypot(dx,dz)<=.10)return facing;
 const rawYaw=Math.atan2(facing.x,facing.z),bearing=Math.atan2(dx,dz),delta=angleDelta(bearing-rawYaw);
 const turned=rawYaw+Math.sign(delta)*Math.max(0,Math.abs(delta)-(strokeSide==='backhand'?Math.PI/6:Math.PI/3));
 const courtYaw=net===1?0:Math.PI,yaw=courtYaw+clamp(angleDelta(turned-courtYaw),-Math.PI*5/12,Math.PI*5/12);
 return v(Math.sin(yaw),0,Math.cos(yaw));
}

const FAMILIES=new Set(['serve','return','forehand','backhand','drive','drop','dink','volley','block','reset','short-hop','lob','overhead']);
// Derived from trainer-hands.js PALM_CENTRE + PALM_AXIS * -.045. Retaining
// the actual grip offset is essential: the grip origin is not the wrist.
const WRIST_X=.056+.045/Math.sqrt(1+.12**2);
const WRIST_Y=-.011-.045*.12/Math.sqrt(1+.12**2);
const WRIST_Z=.029,GRIP_TO_FACE=.2025;
const unsupported=reason=>({supported:false,feasible:null,reason,profileVersion:HUMAN.version});

// Evaluate one impact (phase 1) with stationary Model-2 plant loading. World
// feet are LEFT/RIGHT sole targets in metres, not rule-space board coordinates.
// Omitted context explicitly means this one supported pose. If supplied, other
// phases/models, travel, jumps, nonstandard loads or foot orientations are
// rejected rather than silently treated as supported. This does not judge
// anatomical limits, collisions, momentum, shot legality or future recovery.
export function evaluateTrainerContactSupport(options={}) {
 const {root,contact,feet,handedness='right',strokeSide='forehand',family,bodyFacing,outgoingVelocity,incomingVelocity}=options;
 if(!planar(root)||!Number.isFinite(root.y??0)||!finite(contact)||!finite(feet?.left)||!finite(feet?.right))return unsupported('finite world root, contact and left/right sole targets are required');
 if(!['left','right'].includes(handedness)||!['forehand','backhand'].includes(strokeSide)||!FAMILIES.has(family))return unsupported('unsupported handedness, stroke side or stroke family');
 if(bodyFacing&&(!planar(bodyFacing)||Math.hypot(bodyFacing.x,bodyFacing.z)<1e-12))return unsupported('a finite nonzero planar body facing is required');
 if((options.modelVersion!==undefined&&options.modelVersion!==2)||(options.phase!==undefined&&options.phase!==1))return unsupported('only Model-2 contact phase 1 is supported');
 if(!Number.isFinite(options.travelSpeed??0)||Math.abs(root.y??0)>=1e-8||Object.values(feet).some(p=>!finite(p)||Math.abs(p.y)>=1e-8)||options.grounded===false||options.planted===false||Math.abs(options.travelSpeed??0)>1e-8)return unsupported('only stationary grounded plant contacts are supported');
 const courtYaw=root.z<0?0:Math.PI,footwork=options.coachingFootwork;
 if(footwork){
  if(!['plant','evidence'].includes(footwork.mode)||!Number.isFinite(footwork.load??.5)||Math.abs((footwork.load??.5)-.5)>1e-12||['pelvisDrop','splitStepLift','splitLoad'].some(key=>!Number.isFinite(footwork[key]??0)||Math.abs(footwork[key]??0)>1e-12))return unsupported('only the standard stationary Model-2 plant load is supported');
  for(const side of ['left','right']){
   if(!Number.isFinite(footwork.footPitch?.[side]??0)||Math.abs(footwork.footPitch?.[side]??0)>1e-12||(footwork.footYaw?.[side]!==undefined&&(!Number.isFinite(footwork.footYaw[side])||Math.abs(angleDelta(footwork.footYaw[side]-courtYaw))>1e-12))||(footwork.feet?.[side]&&(!finite(footwork.feet[side])||distance(footwork.feet[side],feet[side])>1e-8)))return unsupported('only grounded court-facing plant feet are supported');
  }
 }
 if((outgoingVelocity&&!finite(outgoingVelocity))||(incomingVelocity&&!finite(incomingVelocity))||(!outgoingVelocity&&incomingVelocity))return unsupported('finite outgoing velocity is required when flight kinematics are supplied');
 const hand=handedness==='left'?1:-1,backhand=strokeSide==='backhand'||family==='backhand',strokeSign=hand*(backhand?-1:1);
 const facing=trainerContactFacing({rawFacing:bodyFacing,root,contact,family,strokeSide}),yaw=Math.atan2(facing.x,facing.z);
 const origin=v(root.x,root.y||0,root.z),toLocal=p=>rotateY(sub(p,origin),-yaw),toWorld=p=>add(rotateY(p,yaw),origin);
 const face=toLocal(contact),compact=['drop','dink','short-hop','volley','block','reset'].includes(family);
 const low=Math.max(0,1.03-contact.y),activity=Math.sin(Math.PI/3)**2;
 const torsoLean=family!=='overhead'?Math.min(HUMAN.maximumForwardHingeRadians,low*.70)*activity:0;
 const pelvis=v(0,HUMAN.hipHeight-Math.min(.24,low*.45)*activity-.055-.5*.018,0);
 const shoulderOffset=rotateX(v(hand*HUMAN.shoulderHalfWidth,HUMAN.shoulderHeight-HUMAN.hipHeight,HUMAN.shoulderForward),torsoLean);
 const pelvisTurn=-angleDelta(yaw-courtYaw)*.55;
 const hipOffsets=[1,-1].map(side=>rotateY(v(side*HUMAN.hipHalfWidth,0,0),pelvisTurn));
 const ankles=['left','right'].map(side=>add(toLocal(feet[side]),v(0,HUMAN.ankleHeight,0)));
 const highRoll=-hand*Math.atan(WRIST_X/(GRIP_TO_FACE-WRIST_Y));
 let angle=family==='serve'?strokeSign*Math.PI:family==='overhead'?highRoll:family==='lob'?strokeSign*2.15:strokeSign*2.25;
 if(!['serve','overhead'].includes(family))angle+=(highRoll-angle)*smooth((contact.y-origin.y-1.10)/.60);
 const open=family==='lob'?.45:compact?.12:.035;
 let normal=unit(v(0,open,1)),radial=unit(v(Math.sin(angle),Math.cos(angle),-open*Math.cos(angle)));
 const impulse=outgoingVelocity?sub(outgoingVelocity,incomingVelocity||v()):null;
 if(impulse&&dot(impulse,impulse)>1e-12){
  normal=unit(rotateY(unit(impulse),-yaw));
  radial=addScaled(radial,normal,-dot(radial,normal));
  if(dot(radial,radial)<1e-12){
   radial=addScaled(v(hand,0,0),normal,-hand*normal.x);
   if(dot(radial,radial)<1e-12)radial=addScaled(v(0,0,1),normal,-normal.z);
  }
  radial=unit(radial);
 }
 const paddleX=unit(cross(radial,normal));normal=unit(cross(paddleX,radial));
 const wristOffset=add(add(scale(paddleX,-hand*WRIST_X),scale(radial,WRIST_Y)),scale(normal,WRIST_Z));
 const wrist=add(addScaled(face,radial,-GRIP_TO_FACE),wristOffset);
 const support=solveTrainerSupport({pelvis,shoulderOffset,wrist,ankles,hipOffsets});
 const solvedFace=add(face,support.reachCorrection);
 return {supported:true,feasible:support.feasible,reason:support.reason,profileVersion:HUMAN.version,facing,yaw,torsoLean,pelvisTurn,
  reachError:support.reachError,legError:support.legError,diagnostics:support.diagnostics,
  local:{...support,face:solvedFace,desiredFace:face,ankles,hipOffsets,shoulderOffset,paddleX,paddleRadial:radial,paddleNormal:normal},
  world:{pelvis:toWorld(support.pelvis),shoulder:toWorld(support.shoulder),wrist:toWorld(support.wrist),desiredWrist:toWorld(support.desiredWrist),face:toWorld(solvedFace),desiredFace:copy(contact)}};
}
