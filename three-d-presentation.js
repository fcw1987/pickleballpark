import { COURT_ATHLETES } from './court-athlete-roster.js';
// Pure presentation sampling for image-based actors in the 3D replay.
// The Play timeline remains the sole source of positions, action timing and contact.

import { FEET_TO_METERS, boardToWorld } from './three-d-core.js';
import { teamForPlayer } from './rally-state.js';
import { sampleStrokePose } from './three-d-animation.js';
import { sampleActorBoardPositionV2, sampleActorFeetV2, PLANTED_LIMIT_FEET } from './play-actors-v2.js';

export const VIEW_DIRECTIONS = Object.freeze([
    'front', 'front-right', 'right', 'back-right',
    'back', 'back-left', 'left', 'front-left'
]);

const clamp01 = value => Math.max(0, Math.min(1, value));
const easeInOut = value => {
    const t = clamp01(value);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

function normalizeHorizontal(vector, fallback = { x: 0, z: 1 }) {
    const length = Math.hypot(vector?.x || 0, vector?.z || 0);
    return length > 1e-9 ? { x: vector.x / length, z: vector.z / length } : { ...fallback };
}

function shotFacing(shot, fallback) {
    return shot ? normalizeHorizontal({ x: shot.to.x - shot.from.x, z: shot.to.y - shot.from.y }, fallback) : fallback;
}

function contactPlant(semantics, shot, handedness, fallback) {
    const contact = boardToWorld(semantics.contact.point);
    const facing = shotFacing(shot, fallback);
    const hand = (handedness === 'right' ? 1 : -1) * (semantics.strokeSide === 'backhand' ? -1 : 1);
    // High backhand contact stays close above the head; a groundstroke-sized
    // cross-body offset would require a longer arm than the rig possesses.
    // Existing documents can explicitly author an overhead family while the
    // compiler emits a short-hop stroke. Preserve its high contact and clock;
    // only the opted-in 3D presentation uses the authored overhead support base.
    const overhead = semantics.stroke === 'overhead' || shot?.authoring?.family === 'overhead';
    const lateral = overhead ? (semantics.strokeSide === 'backhand' ? 0 : .258) : semantics.strokeSide === 'backhand' ? .16 : .30;
    const forward = overhead ? .05 : .30;
    return { x: contact.x - facing.x * forward + facing.z * lateral * hand, y: 0,
        z: contact.z - facing.z * forward - facing.x * lateral * hand };
}

/** Select one of eight actor views from world facing and the camera position. */
export function selectCameraRelativeDirection(bodyFacing, actorPosition, cameraPosition, cameraTarget = { x: 0, z: 0 }) {
    const facing = normalizeHorizontal(bodyFacing);
    // Pixel planes use one camera-forward basis. Using a separate actor-to-camera ray
    // made a translating receiver cross atlas sectors even though neither body nor camera turned.
    const towardCamera = normalizeHorizontal({
        x: cameraPosition.x - cameraTarget.x,
        z: cameraPosition.z - cameraTarget.z
    }, { x: -facing.x, z: -facing.z });
    const dot = facing.x * towardCamera.x + facing.z * towardCamera.z;
    const cross = facing.x * towardCamera.z - facing.z * towardCamera.x;
    const sector = Math.round(Math.atan2(cross, dot) / (Math.PI / 4));
    return VIEW_DIRECTIONS[(sector + 8) % 8];
}

// A bounded, stateless movement leg. Arrive before the forward swing, hold
// through contact, then accelerate out of recovery. Sampling never integrates dt.
function actorRoute(segment, playerId, localTime, handedness) {
    const fromBoard=segment.previous.positions[playerId],toBoard=segment.step.positions[playerId];
    if(!fromBoard||!toBoard)throw new TypeError(`Missing positions for ${playerId}.`);
    const from=boardToWorld(fromBoard),to=boardToWorld(toBoard);
    const fallback={x:0,z:fromBoard.y<22?1:-1};
    let start=from,end=to,startTime=0,endTime=segment.duration;
    if(segment.shotSemantics?.playerId===playerId&&segment.trajectory){
        const plant=contactPlant(segment.shotSemantics,segment.step.shot,handedness,fallback);
        const release=segment.contactTime+Math.min(.18,segment.shotSemantics.profile.duration*.25);
        if(localTime<=release){
            start=segment.contactTime<=1e-9?plant:from;end=plant;
            endTime=Math.max(.001,segment.contactTime-.13);
        }else{start=plant;startTime=release;}
    }else if(segment.nextShotSemantics?.playerId===playerId&&segment.nextStep?.shot){
        end=contactPlant(segment.nextShotSemantics,segment.nextStep.shot,handedness,fallback);
        endTime=Math.max(.001,segment.duration-.13);
    }
    const clock=clamp01((localTime-startTime)/Math.max(.001,endTime-startTime));
    const progress=easeInOut(clock);
    const length=Math.hypot(end.x-start.x,end.z-start.z);
    return {start,end,length,progress,clock,seconds:endTime-startTime,distance:length*progress,
        direction:normalizeHorizontal({x:end.x-start.x,z:end.z-start.z},fallback),
        position:{x:start.x+(end.x-start.x)*progress,y:0,z:start.z+(end.z-start.z)*progress},
        courtForward:fallback.z};
}

/** Return the timeline-derived actor position without changing tactical state. */
function legacyContactPlant(semantics, shot, handedness, fallback) {
    const contact = boardToWorld(semantics.contact.point);
    const facing = shotFacing(shot, fallback);
    const hand = handedness === 'right' ? 1 : -1;
    return { x: contact.x - facing.x * 0.32 + facing.z * 0.32 * hand, y: 0,
        z: contact.z - facing.z * 0.32 - facing.x * 0.32 * hand };
}


export function sampleActorWorldPosition(segment, playerId, localTime, handedness = 'right', instructionalMovement = false) {
    if(segment?.modelVersion===2){const at=sampleActorBoardPositionV2(segment,playerId,localTime);return Object.freeze(boardToWorld(at,0));}
    if(instructionalMovement)return Object.freeze(actorRoute(segment,playerId,localTime,handedness).position);
    const fromBoard=segment.previous.positions[playerId],toBoard=segment.step.positions[playerId];
    if(!fromBoard||!toBoard)throw new TypeError(`Missing positions for ${playerId}.`);
    const from=boardToWorld(fromBoard),to=boardToWorld(toBoard);
    const progress=segment.duration?clamp01(localTime/segment.duration):1;
    if(segment.shotSemantics?.playerId===playerId&&segment.trajectory){
        const plant=legacyContactPlant(segment.shotSemantics,segment.step.shot,handedness,{x:0,z:fromBoard.y<22?1:-1});
        const release=segment.contactTime+0.1;
        if(segment.contactTime<=1e-9&&localTime<=release)return Object.freeze(plant);
        const settle=Math.max(0.04,segment.contactTime-0.12);
        const start=localTime<=release?from:plant,end=localTime<=release?plant:to;
        const blend=localTime<=release?easeInOut(localTime/settle):easeInOut((localTime-release)/Math.max(0.001,segment.duration-release));
        return Object.freeze({x:start.x+(end.x-start.x)*blend,y:0,z:start.z+(end.z-start.z)*blend});
    }
    if(segment.nextShotSemantics?.playerId===playerId&&segment.nextStep?.shot){
        const plant=legacyContactPlant(segment.nextShotSemantics,segment.nextStep.shot,handedness,{x:0,z:fromBoard.y<22?1:-1});
        const blend=easeInOut(progress);
        return Object.freeze({x:from.x+(plant.x-from.x)*blend,y:0,z:from.z+(plant.z-from.z)*blend});
    }
    const blend=easeInOut(progress);
    return Object.freeze({x:from.x+(to.x-from.x)*blend,y:0,z:from.z+(to.z-from.z)*blend});
}


// Alternating world-space footsteps. During stance the shoe is anchored to one
// point on the route; only the swing shoe travels. Both feet settle at endpoints,
// so segment boundaries and arbitrary reverse seeks need no pose history.
function stepAlong(length, distance, left) {
    if(length<.025)return {along:length, lift:0};
    const count=Math.max(2,Math.ceil(length/.26/2)*2),step=length/count;
    const index=Math.min(count-1,Math.floor(distance/step));
    const swinging=(index%2===0)===left,phase=clamp01(distance/step-index);
    const last=swinging?index-2:index-1;
    const landed=k=>k<0?0:k>=count-2?length:Math.min(length,(k+1.5)*step);
    const previous=landed(last),next=swinging?landed(index):previous;
    const blend=swinging?easeInOut(phase):0;
    const along=distance>=length-1e-9?length:previous+(next-previous)*blend;
    const lift=swinging&&distance<length-1e-9?Math.sin(Math.PI*phase)*Math.min(.075,length*.16):0;
    return {along,lift};
}

function routeFoot({start,length,distance,direction,courtForward}, left) {
    const {along,lift}=stepAlong(length,distance,left);
    return {x:start.x+direction.x*along+(left?.23:-.23)*courtForward,y:lift,
        z:start.z+direction.z*along+.015*courtForward};
}

// Only the articulated shoes need a gait between the recorded footprints.
// The root, contact hold, momentum and ball still use the compiled timeline.
function model2MovementLeg(segment, id, localTime) {
    const duration=segment.originalDuration??segment.duration;
    let start=0,end=duration;
    if(segment.shotSemantics?.playerId===id && segment.shotSemantics.contact.feet.length===2){
        const release=Math.min(duration,segment.contactTime+.12);
        if(localTime<segment.contactTime)end=segment.contactTime;
        else if(localTime<=release)return null;
        else start=release;
    }
    const from=boardToWorld(sampleActorBoardPositionV2(segment,id,start));
    const to=boardToWorld(sampleActorBoardPositionV2(segment,id,end));
    const delta={x:to.x-from.x,z:to.z-from.z};
    return {start:from,end:to,length:Math.hypot(delta.x,delta.z),direction:normalizeHorizontal(delta),
        seconds:end-start,clock:clamp01((localTime-start)/Math.max(.001,end-start))};
}

// Keep the swing on a clear path around the planted shoe during a crossover
// or drop step. Interpolating straight through the support shoe clips both soles.
function swingFoot(from,to,plant,phase,maxLift) {
    const t=easeInOut(phase),dx=to.x-from.x,dz=to.z-from.z;
    let x=from.x+dx*t,z=from.z+dz*t;
    const ax=from.x-plant.x,az=from.z-plant.z,bx=to.x-plant.x,bz=to.z-plant.z;
    const closest=clamp01(-(ax*dx+az*dz)/Math.max(1e-9,dx*dx+dz*dz));
    const clearance=Math.min(.205,Math.hypot(ax,az),Math.hypot(bx,bz));
    if(Math.hypot(ax+dx*closest,az+dz*closest)<clearance-1e-6){
        const angle=Math.atan2(az,ax)+t*Math.atan2(ax*bz-az*bx,ax*bx+az*bz);
        const radius=Math.max(clearance,Math.hypot(x-plant.x,z-plant.z));
        x=plant.x+radius*Math.cos(angle);z=plant.z+radius*Math.sin(angle);
    }
    return {x,z,y:Math.min(maxLift,.22*Math.hypot(dx,dz))*Math.sin(Math.PI*phase)**2,
        yaw:from.yaw+(to.yaw-from.yaw)*t};
}

function articulatedFootwork(leg,baseFeet,position,forward,hand,chasing,brake) {
    const {start,end,length,direction,clock,seconds}=leg;
    const side=direction.x*forward,depth=direction.z*forward;
    let travelYaw=Math.atan2(side,depth);
    if(chasing && Math.abs(side)<Math.abs(depth)*.35)travelYaw=(hand==='right'?-1:1)*Math.abs(travelYaw);
    // Open the hips for sustained lateral travel. A nearby ball needs a
    // square shuffle with the destination-side foot leading in both directions.
    const crossover=easeInOut((length-.9)/.65)*easeInOut((Math.abs(side)-.5)/.35);
    const openYaw=chasing?travelYaw:Math.max(-1.48,Math.min(1.48,travelYaw))*crossover;
    const turn=u=>openYaw*easeInOut(u/.24)*(brake?1-easeInOut((u-.64)/.29):1);
    const running=chasing || crossover>.5 || Math.abs(depth)>.65;
    let stride=.32;
    if(chasing)stride=.47;
    else if(crossover>.5)stride=.38;
    else if(running)stride=.49;
    const count=Math.max(2,2*Math.ceil(length/(2*stride)));
    // A short push-off and a two-foot plant at the end leave the last steps
    // smaller as the compiled route decelerates into the next contact.
    const push=Math.min(.12,.060/seconds),settle=Math.min(.15,.085/seconds);
    // Space steps halfway between equal time and equal travel. Equal travel
    // alone rushes the middle of a sprint; equal time can overstride the rig.
    const elapsed=clamp01((clock-push)/(1-push-settle));
    const beat=(elapsed+easeInOut(elapsed))*.5*count;
    const index=Math.min(count-1,Math.floor(beat)),phase=beat-index;
    const leadLeft=chasing?travelYaw>=0:side>=0;
    const swing=(index%2===0)===leadLeft?'left':'right',stance=swing==='left'?'right':'left';
    function anchor(foot,k) {
        const midStance=clamp01((k+1.5)/count);
        // On the first half the beat fraction equals t² + t/2. The second
        // half mirrors it, so every plant has a deterministic court point.
        const halfTime=Math.sqrt(.0625+Math.min(midStance,1-midStance))-.25;
        const u=k<0?0:k>=count-2?1:push+(1-push-settle)*(midStance<.5?halfTime:1-halfTime);
        const p=easeInOut(u),angle=turn(u),c=Math.cos(angle),s=Math.sin(angle);
        const lateral=(baseFeet[foot].x-position.x)*(1-(running?.25:0)*Math.sin(Math.PI*u)**2);
        const fore=baseFeet[foot].z-position.z;
        return {x:start.x+(end.x-start.x)*p+lateral*c+fore*s,
            z:start.z+(end.z-start.z)*p+fore*c-lateral*s,y:0,yaw:(forward>0?0:Math.PI)+angle};
    }
    const plant=anchor(stance,index-1);
    return {feet:{[stance]:plant,[swing]:swingFoot(anchor(swing,index-2),anchor(swing,index),plant,phase,running?.085:.045)},
        yaw:turn(clock)*(chasing?1:.48)};
}

function actionState(segment, playerId, localTime, distance, instructionalMovement = false) {
    const semantics = segment.shotSemantics;
    if (semantics?.playerId === playerId) {
        const contactOffset = semantics.profile.duration * semantics.profile.contactRatio;
        const strokeTime = Math.max(0, Math.min(semantics.profile.duration,
            contactOffset + localTime - segment.contactTime));
        if (strokeTime >= semantics.profile.duration) {
            return { action: 'ready', phase: 'ready', frameIndex: 0, planted: true, locomotionFrame: null };
        }
        const pose = sampleStrokePose(semantics.artAction, semantics.profile, strokeTime);
        const plantStart = Math.max(0, segment.contactTime - semantics.profile.duration * 0.13);
        return {
            action: semantics.artAction,
            phase: pose.phase,
            frameIndex: pose.phase === 'prepare' ? (pose.progress < 0.55 ? 0 : 1) :
                pose.phase === 'contact' ? 2 : pose.phase === 'follow-through' ? 3 : 4,
            planted: localTime >= plantStart && localTime <= segment.contactTime + (instructionalMovement?Math.min(.18,semantics.profile.duration*.25):.12),
            locomotionFrame: null
        };
    }
    const incoming = segment.nextShotSemantics;
    if (incoming?.playerId === playerId) {
        const remaining = Math.max(0, segment.duration - localTime);
        const contactOffset = incoming.profile.duration * incoming.profile.contactRatio;
        if (remaining <= contactOffset + 1e-9) {
            const strokeTime = Math.max(0, contactOffset - remaining);
            const pose = sampleStrokePose(incoming.artAction, incoming.profile, strokeTime);
            return { action: incoming.artAction, phase: pose.phase,
                frameIndex: pose.phase === 'prepare' ? (pose.progress < 0.55 ? 0 : 1) : 2,
                planted: remaining <= incoming.profile.duration * 0.13, locomotionFrame: null };
        }
    }
    if (segment.step.shot && localTime < segment.contactTime && distance < 0.25) {
        return { action: 'ready', phase: 'split-step', frameIndex: 1, planted: true, locomotionFrame: null };
    }
    if (distance < 0.06) {
        return { action: 'ready', phase: 'ready', frameIndex: 0, planted: true, locomotionFrame: null };
    }
    const progress = segment.duration ? clamp01(localTime / segment.duration) : 1;
    // Segment endpoints are stable poses. Locomotion describes current movement,
    // rather than merely remembering that the two logical positions differ.
    if (progress <= 1e-6 || progress >= 1 - 1e-6) {
        return { action: 'ready', phase: 'ready', frameIndex: 0, planted: true, locomotionFrame: null };
    }
    const stepCount = Math.max(2, Math.round(distance / 0.5));
    return {
        action: 'shuffle', phase: 'locomotion', frameIndex: Math.floor(progress * stepCount * 2) % 4,
        planted: false, locomotionFrame: Math.floor(progress * stepCount * 2) % 4
    };
}

/**
 * Deterministically sample one sprite actor from a compiled Play segment.
 * The returned paddle contact target is the authoritative trajectory start; renderers
 * must align the selected frame's visible authored anchor to it and must not move the ball.
 */
export function sampleActorPresentation({
    segment, playerId, localTime, cameraPosition, cameraTarget = { x: 0, y: 0, z: 0 }, handedness,
    artFamily = 'green', timeline = null, seconds = null, instructionalMovement = false, articulatedMotion = false
}) {
    if (!segment || !Number.isFinite(localTime)) throw new TypeError('A segment and finite localTime are required.');
    if (!['left', 'right'].includes(handedness)) throw new TypeError('Handedness must be left or right.');
    const route = instructionalMovement&&segment.modelVersion!==2?actorRoute(segment,playerId,localTime,handedness):null;
    const worldPosition = sampleActorWorldPosition(segment,playerId,localTime,handedness,instructionalMovement);
    const from = segment.previous.positions[playerId];
    const to = segment.step.positions[playerId];
    const distance = Math.hypot(to.x - from.x, to.y - from.y) * FEET_TO_METERS;
    const isStriker = segment.shotSemantics?.playerId === playerId;
    const isIncomingStriker = segment.nextShotSemantics?.playerId === playerId;
    let bodyFacing, pickupFacing;
    if (isStriker && segment.trajectory) {
        // Use the outgoing flight tangent. Facing the contact point itself becomes
        // undefined as the planted actor reaches it and can flip between sprite views.
        const afterContact = segment.trajectory.sample(Math.min(0.06, segment.trajectory.flightDuration));
        const outgoing=normalizeHorizontal({x:afterContact.x-segment.trajectory.start.x,z:afterContact.z-segment.trajectory.start.z});
        const profile=segment.shotSemantics.profile;
        const release=segment.contactTime+profile.duration*(profile.recoverRatio-profile.contactRatio);
        const recover=instructionalMovement?easeInOut((localTime-release)/Math.max(.001,profile.duration*(1-profile.recoverRatio))):0;
        const court={x:0,z:from.y<22?1:-1};
        bodyFacing=normalizeHorizontal({x:outgoing.x*(1-recover),z:outgoing.z*(1-recover)+court.z*recover},court);
        if (articulatedMotion && segment.startTime===0 && localTime<segment.contactTime) {
            const turn=easeInOut(localTime/segment.contactTime);
            pickupFacing=normalizeHorizontal({x:outgoing.x*turn,z:outgoing.z*turn+court.z*(1-turn)},court);
        }
    } else if (isIncomingStriker && segment.trajectory) {
        const incoming = instructionalMovement?{x:0,z:from.y<22?1:-1}:normalizeHorizontal({x:segment.trajectory.start.x-segment.trajectory.end.x,z:segment.trajectory.start.z-segment.trajectory.end.z});
        const authoredNext = timeline?.play?.steps?.[segment.index + 1]?.shot;
        const shot = authoredNext || segment.nextStep?.shot;
        const outgoing = shot ? normalizeHorizontal({
            x: (shot.to.x - shot.from.x) * FEET_TO_METERS,
            z: (shot.to.y - shot.from.y) * FEET_TO_METERS
        }, incoming) : incoming;
        const preparation = segment.nextShotSemantics.profile.duration * segment.nextShotSemantics.profile.contactRatio;
        const blend = easeInOut((localTime - (segment.duration - preparation)) / Math.max(0.001, preparation));
        bodyFacing = normalizeHorizontal({ x: incoming.x + (outgoing.x - incoming.x) * blend,
            z: incoming.z + (outgoing.z - incoming.z) * blend }, outgoing);
    } else {
        // Ready and lateral movement retain court-facing posture.
        bodyFacing = { x: 0, z: from.y < 22 ? 1 : -1 };
    }
    let state = actionState(segment, playerId, localTime, distance, instructionalMovement);
    if(state.action==='ready'&&localTime>0&&localTime<segment.duration){
        const previous=sampleActorWorldPosition(segment,playerId,Math.max(0,localTime-0.02),handedness,instructionalMovement);
        if(Math.hypot(worldPosition.x-previous.x,worldPosition.z-previous.z)>0.00001){
            const origin=boardToWorld(from),traveled=Math.hypot(worldPosition.x-origin.x,worldPosition.z-origin.z);
            state={action:'shuffle',phase:'locomotion',frameIndex:Math.floor(traveled/0.18)%2,locomotionFrame:Math.floor(traveled/0.18)%2,planted:false};
        }
    }
    const direction = selectCameraRelativeDirection(bodyFacing, worldPosition, cameraPosition || cameraTarget, cameraTarget);
    const contactTarget = segment.trajectory ? (isStriker ? Object.freeze({ ...segment.trajectory.start }) :
        isIncomingStriker ? Object.freeze({ ...segment.trajectory.end }) : null) : null;
    const activeSemantics = isStriker ? segment.shotSemantics : isIncomingStriker ? segment.nextShotSemantics : null;
    const activeShot = isStriker ? segment.step.shot : isIncomingStriker ? segment.nextStep?.shot : null;
    const profile = activeSemantics?.profile || null;
    const strokeTime = profile ? Math.max(0, Math.min(profile.duration,
        profile.duration * profile.contactRatio + (isStriker ? localTime - segment.contactTime : localTime - segment.duration))) : null;
    const strokePose = profile && !['ready', 'shuffle'].includes(state.action) ?
        sampleStrokePose(activeSemantics.artAction, profile, strokeTime) : null;
    const origin = boardToWorld(from);
    const travelDistance = route?route.distance:Math.hypot(worldPosition.x-origin.x,worldPosition.z-origin.z);
    const before = sampleActorWorldPosition(segment, playerId, Math.max(0, localTime - .015), handedness,instructionalMovement);
    const after = sampleActorWorldPosition(segment, playerId, Math.min(segment.duration, localTime + .015), handedness,instructionalMovement);
    const sampleInterval = Math.min(segment.duration, localTime + .015) - Math.max(0, localTime - .015);
    const travelSpeed = sampleInterval > 0 ? Math.hypot(after.x - before.x, after.z - before.z) / sampleInterval : 0;
    const model2Feet = segment.modelVersion === 2 ? sampleActorFeetV2(segment, playerId, localTime).sort((a,b)=>a.x-b.x) : null;
    const near = segment.previous.positions[playerId].y < 22;
    const forward=near?1:-1;
    const readyFoot=side=>({x:worldPosition.x+side*.23*forward,y:0,z:worldPosition.z+.015*forward});
    let feet = model2Feet ? {left:boardToWorld(model2Feet[near?1:0],0), right:boardToWorld(model2Feet[near?0:1],0)} :
        route ? (articulatedMotion?{left:readyFoot(1),right:readyFoot(-1)}:{left:routeFoot(route,true),right:routeFoot(route,false)}) : null;
    const recordedFeet = articulatedMotion && segment.model2Momentum?.some(
        item=>item.actor===playerId && item.contactTime<=segment.startTime+localTime+1e-9);
    const lob=segment.shotSemantics?.shotType==='lob';
    const terminalChase=!segment.nextShotSemantics && ['unreachable','second-bounce'].includes(timeline?.outcome?.reason);
    const chasing=articulatedMotion && !isStriker && lob && (to.y-from.y)*(near?1:-1)<-2 &&
        (isIncomingStriker && segment.nextShotSemantics.contact.kind!=='volley' || terminalChase);
    if(articulatedMotion && feet && !recordedFeet){
        const leg=route || model2MovementLeg(segment,playerId,localTime);
        if(leg?.length>=.025 && leg.seconds>0){
            const gait=articulatedFootwork(leg,feet,worldPosition,forward,handedness,chasing,!(chasing && terminalChase));
            feet=gait.feet;
            if(chasing || gait.yaw){
                const facing=pickupFacing || bodyFacing,yaw=Math.atan2(facing.x,facing.z)+gait.yaw;
                pickupFacing={x:Math.sin(yaw),z:Math.cos(yaw)};
            }
        }
    }
    let splitStep=instructionalMovement ? Math.max(
        !isStriker&&segment.shotSemantics ? Math.max(0,1-Math.abs(localTime-segment.contactTime)/.11) : 0,
        segment.nextShotSemantics&&!isIncomingStriker ? Math.max(0,1-(segment.duration-localTime)/.11) : 0) : 0;
    let splitLift=0;
    if(articulatedMotion){
        const roster=timeline?.play?.players,team=teamForPlayer(playerId,roster);
        const opponent=shot=>shot && teamForPlayer(shot.playerId,roster)!==team;
        const current=segment.contactTime-localTime;
        const next=timeline?.segments?.[segment.index];
        const untilHit=opponent(segment.shotSemantics) && current>=-.18 ? current :
            opponent(segment.nextShotSemantics) ? segment.duration-localTime+(next?.contactTime || 0) : Infinity;
        // The split straddles the opponent's contact. Land on flexed knees as
        // the ball leaves the paddle, ready to push off the planted foot.
        splitStep=Math.max(0,1-Math.abs(untilHit+.055)/.12);
        if(!recordedFeet && untilHit>-.055 && untilHit<.12){
            const grounded=1-clamp01(Math.max(feet?.left.y||0,feet?.right.y||0)/.045);
            splitLift=.05*Math.sin(Math.PI*(untilHit+.055)/.175)**2*grounded*(1-clamp01(travelSpeed/2));
        }
    }
    return Object.freeze({
        ...(segment.modelVersion === 2 ? { modelVersion: 2 } : {}),
        playerId, worldPosition, bodyFacing: Object.freeze(bodyFacing), viewDirection: direction,
        ...(articulatedMotion ? {courtForward:near?1:-1,splitLift} : {}),
        ...(instructionalMovement ? {chasingLob:chasing && localTime>=segment.contactTime,motionLeg:segment.rallyLeg,strokeLeg:isStriker?segment.rallyLeg:isIncomingStriker?segment.rallyLeg+1:null,
            unsupportedHighContact:activeSemantics?.contact.point.heightFeet>PLANTED_LIMIT_FEET &&
                (segment.modelVersion===2 || (isIncomingStriker?lob:(segment.previous.shot?.authoring?.family || segment.previous.shot?.type)==='lob'))} : {}),
        ...(pickupFacing ? {pickupFacing:Object.freeze(pickupFacing)} : {}),
        action: state.action, phase: state.phase, frameIndex: state.frameIndex,
        locomotionFrame: state.locomotionFrame, planted: state.planted, handedness,
        artFamily, artAction: state.action,
        shotType: activeSemantics?.shotType || null, strokeSide: activeSemantics?.strokeSide || null,
        ...(instructionalMovement && activeShot?.authoring?.family ? {instructionalFamily:activeShot.authoring.family} : {}),
        strokeIntensity: activeSemantics?.profile.intensity || 0,
        strokePose, strokeTime, profile, timeSeconds: seconds ?? segment.startTime + localTime,
        travelDistance, travelPhase: travelDistance / .58 * Math.PI * 2, travelSpeed,
        travelDirection: route?Object.freeze(route.direction):null,
        footTargets: feet ? Object.freeze({left:Object.freeze(feet.left),right:Object.freeze(feet.right)}) : null,
        splitStep,
        atlasKey: `${artFamily}/${handedness}/${direction}/${state.action}/${state.phase}`,
        paddle: Object.freeze({ anchorId: `${handedness}-paddle-face`, worldContactTarget: contactTarget })
    });
}

export function emeraldReachFindings(timeline) {
    if(!timeline)return [];
    return timeline.segments.filter(s=>s.shotSemantics &&
        (timeline.modelVersion===2 || (s.previous.shot?.authoring?.family || s.previous.shot?.type)==='lob') &&
        s.shotSemantics.contact.point.heightFeet>PLANTED_LIMIT_FEET).map(s=>({
        kind:'feasibility',severity:'warning',shotId:s.step.id,
        message:`Recorded contact at ${s.shotSemantics.contact.point.heightFeet.toFixed(1)} ft exceeds ${COURT_ATHLETES[Number(s.shotSemantics.playerId.slice(6))-1].name}’s planted paddle reach.`
    }));
}

// The court and this optional cue read one sampled actor and the compiler's
// actual events. Scrubbing, looping and hand changes therefore need no timer.
export function emeraldTeaching(timeline,sample,actor='player1') {
    if(!sample || !timeline)return null;
    const t=sample.timeSeconds,events=timeline.events,terminal=events.find(e=>e.type==='dead');
    const isLobBounce=e=>e.type==='bounce' && timeline.segments[e.rallyLeg-1]?.shotSemantics?.shotType==='lob';
    const stops=events.filter(e=>e.type==='contact' && e.actor===actor || isLobBounce(e) && (!terminal || e.time<terminal.time-.0001) || e.type==='dead');
    const next=stops.find(e=>e.time>t+.0001) || stops[0];
    const stepLabel=next?.type==='contact'?'contact':next?.type==='bounce'?'bounce':'ending';
    const state={nextTime:next?.time,button:next ? (next.time>t+.0001?'Next ':'First ')+stepLabel : 'Next contact'};
    if(terminal && t>=terminal.time-.0001){
        const out=['long','wide'].includes(terminal.reason);
        const outTitle=timeline.segments[terminal.rallyLeg-1]?.shotSemantics?.shotType==='lob'?'Lob out':'Ball out';
        return {...state,title:out?outTitle:terminal.reason==='second-bounce'||terminal.reason==='unreachable'?'Second bounce':'Point ended',
            cue:out?'The first landing is out. Let the ball go.':terminal.reason==='second-bounce'||terminal.reason==='unreachable'?'The ball bounced twice before a return.':'The rally has reached its recorded ending.'};
    }
    const contact=events.find(e=>e.type==='contact' && e.actor===actor && e.rallyLeg===sample.strokeLeg);
    if(contact && !['ready','shuffle'].includes(sample.action)){
        const family=sample.instructionalFamily || sample.shotType;
        const side=sample.strokeSide==='backhand'?'Backhand':'Forehand';
        const title=['dink','drive','drop','lob','return','volley'].includes(family)?side+' '+family:family[0].toUpperCase()+family.slice(1);
        if(sample.unsupportedHighContact)return {...state,title:title+' · out of reach',cue:'The recorded ball is above the planted paddle. These feet stay grounded.'};
        const at=Math.abs(contact.time-t)<.0001;
        const cue=t>contact.time+.0001?'Finish balanced and return the paddle in front.':
            family==='dink'?at?'Meet the ball in front with a quiet, open paddle.':'Set the paddle in front for a short lift.':
            family==='overhead'?'Set under the ball and strike in front of the hitting shoulder.':
            family==='drop'?'Get behind the ball and lift softly toward the kitchen.':
            at?'Meet the ball in front and finish in balance.':'Set the hitting face on the approaching ball.';
        return {...state,title:title+(at?' · contact':''),cue};
    }
    if(sample.chasingLob){
        const bounce=events.find(e=>e.rallyLeg===sample.motionLeg && isLobBounce(e) && e.time>=t-.0001);
        return {...state,title:'Lob recovery',cue:bounce?'Drop step, turn and run toward the bounce.':'Get behind the rebound and set the paddle in front.'};
    }
    return {...state,title:'Ready',cue:'Stay balanced with the paddle in front and watch the ball.'};
}
