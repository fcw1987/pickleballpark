// Pure presentation sampling for image-based actors in the 3D replay.
// The Play timeline remains the sole source of positions, action timing and contact.

import { FEET_TO_METERS, boardToWorld } from './three-d-core.js';
import { sampleStrokePose } from './three-d-animation.js';

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
    const progress=easeInOut((localTime-startTime)/Math.max(.001,endTime-startTime));
    const length=Math.hypot(end.x-start.x,end.z-start.z);
    return {start,end,length,progress,distance:length*progress,
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
function routeFoot(route, left) {
    const {start,end,length,distance,direction,courtForward}=route;
    const count=Math.max(2,Math.ceil(length/.26/2)*2),step=length/count;
    if(length<.025)return {x:end.x+(left?.23:-.23)*courtForward,y:0,z:end.z+.015*courtForward};
    const index=Math.min(count-1,Math.floor(distance/step));
    const swinging=(index%2===0)===left,phase=clamp01(distance/step-index);
    const last=swinging?index-2:index-1;
    const landed=k=>k<0?0:k>=count-2?length:Math.min(length,(k+1.5)*step);
    const previous=landed(last),next=swinging?landed(index):previous;
    const blend=swinging?easeInOut(phase):0;
    const along=distance>=length-1e-9?length:previous+(next-previous)*blend;
    return {x:start.x+direction.x*along+(left?.23:-.23)*courtForward,
        y:swinging&&distance<length-1e-9?Math.sin(Math.PI*phase)*Math.min(.075,length*.16):0,
        z:start.z+direction.z*along+.015*courtForward};
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
    artFamily = 'green', timeline = null, seconds = null, instructionalMovement = false
}) {
    if (!segment || !Number.isFinite(localTime)) throw new TypeError('A segment and finite localTime are required.');
    if (!['left', 'right'].includes(handedness)) throw new TypeError('Handedness must be left or right.');
    const route = instructionalMovement?actorRoute(segment,playerId,localTime,handedness):null;
    const worldPosition = sampleActorWorldPosition(segment,playerId,localTime,handedness,instructionalMovement);
    const from = segment.previous.positions[playerId];
    const to = segment.step.positions[playerId];
    const distance = Math.hypot(to.x - from.x, to.y - from.y) * FEET_TO_METERS;
    const isStriker = segment.shotSemantics?.playerId === playerId;
    const isIncomingStriker = segment.nextShotSemantics?.playerId === playerId;
    let bodyFacing;
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
    return Object.freeze({
        playerId, worldPosition, bodyFacing: Object.freeze(bodyFacing), viewDirection: direction,
        action: state.action, phase: state.phase, frameIndex: state.frameIndex,
        locomotionFrame: state.locomotionFrame, planted: state.planted, handedness,
        artFamily, artAction: state.action,
        shotType: activeSemantics?.shotType || null, strokeSide: activeSemantics?.strokeSide || null,
        ...(instructionalMovement && activeShot?.authoring?.family === 'overhead' ? {instructionalFamily:'overhead'} : {}),
        strokeIntensity: activeSemantics?.profile.intensity || 0,
        strokePose, strokeTime, profile, timeSeconds: seconds ?? segment.startTime + localTime,
        travelDistance, travelPhase: travelDistance / .58 * Math.PI * 2, travelSpeed,
        travelDirection: route?Object.freeze(route.direction):null,
        footTargets: route?Object.freeze({left:Object.freeze(routeFoot(route,true)),right:Object.freeze(routeFoot(route,false))}):null,
        splitStep: instructionalMovement?Math.max(
            !isStriker&&segment.shotSemantics?Math.max(0,1-Math.abs(localTime-segment.contactTime)/.11):0,
            segment.nextShotSemantics&&segment.nextShotSemantics.playerId!==playerId?Math.max(0,1-(segment.duration-localTime)/.11):0):0,
        atlasKey: `${artFamily}/${handedness}/${direction}/${state.action}/${state.phase}`,
        paddle: Object.freeze({ anchorId: `${handedness}-paddle-face`, worldContactTarget: contactTarget })
    });
}
