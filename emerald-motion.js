import * as THREE from './vendor/three.module.min.js';

const {clamp, smoothstep} = THREE.MathUtils;
const vec = (x, y, z) => new THREE.Vector3(x, y, z);

// Distances are metres from the working shoulder. The same grip and blade
// move through pickup, load, impact and finish for either anatomical hand.
const dink = { load: [.025,-.15,.18], finish: [-.01,-.065,.27], low: -.16, high: .38, open: .34, coil: .13 };
const drive = { load: [.13,-.13,-.10], finish: [-.16,.08,.205], low: -.18, high: .74, open: .025, coil: .54 };
const block = { load: [.035,-.035,.165], finish: [-.015,-.018,.245], low: .68, high: .78, open: .06, coil: .08 };
const lob = { load: [.105,-.245,.075], finish: [.075,.19,.265], low: -.78, high: 1.48, open: .82, coil: .26 };
const overhead = { load: [.18,.135,.035], finish: [-.14,-.18,.175], low: 1.32, high: -.48, open: -.48, coil: .46 };
const serve = { load: [.12,-.235,-.09], finish: [-.12,.16,.205], low: -.82, high: 1.03, open: .3, coil: .39 };
const shapes = { dink, drop: dink, reset: dink, 'short-hop': dink, drive, forehand: drive, backhand: drive,
    flat: drive, return: drive, volley: block, block, lob, overhead, serve };

export const strokeShape = family => shapes[family] || drive;

const headWeights = [.62, .30, .08];
const paddleWeights = [.23, .46, .31];

// Elapsed-time samples make the cue causal and identical on a seek, a camera
// orbit or a dropped frame. No renderer clock or coverage cone drives the rig.
export function readyAim(trail, position, yaw, mirror, courtForward) {
    let head = 0, pitch = 0, paddle = 0;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    for (let i = 0; i < (trail?.length || 0); i++) {
        const ball = trail[i], dx = ball.x-position.x, dz = ball.z-position.z;
        const forward = dx*sin + dz*cos, lateral = (dx*cos-dz*sin)*mirror;
        const ahead = smoothstep(forward, -.25, .8);
        const bearing = Math.atan2(lateral, Math.max(.45,forward)) * ahead;
        head += headWeights[i] * .72 * Math.tanh(bearing/.72);
        pitch += headWeights[i] * clamp(Math.atan2(ball.y-position.y-1.14,Math.max(.62,Math.hypot(dx,dz))),-.15,.30);
        paddle += paddleWeights[i] * .40 * Math.tanh(bearing/.68) * smoothstep(ball.z*courtForward,-.08,.66);
    }
    return {head, pitch, paddle};
}

// A continuous tangent through impact keeps the paddle travelling through the
// ball. The pickup, backswing reversal and end of the follow-through ease out.
export function strokePhase(r, p, c, f) {
    const stops = [0,p,c,f,1];
    let i = 0;
    while (i < 3 && r > stops[i+1]) i++;
    const u = clamp((r-stops[i])/(stops[i+1]-stops[i]),0,1);
    const h = u*u*(3-2*u), weights = [0,0,0,0];
    weights[i] = 1-h;
    weights[(i+1)%4] += h;
    const tangent = i === 1 ? (u*u*u-u*u)*(c-p)/(f-p) : i === 2 ? u*(1-u)**2*(f-c)/(f-p) : 0;
    weights[1] -= tangent;
    weights[3] += tangent;
    return {i, blend: i === 1 ? u*u : i === 2 ? 1-(1-u)**2 : h, weights, engaged: 1-weights[0]};
}

function basis(shaft, normal) {
    const y = shaft.clone().normalize();
    const x = y.clone().cross(normal).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,x.clone().cross(y)));
}

export function paddleFrame(local) {
    const offset = name => new THREE.Vector3().setFromMatrixPosition(local[name]);
    const front = offset('PaddleFace'), back = offset('PaddleBack'), grip = offset('GripCenter');
    const rest = basis(front.clone().lerp(back,.5).sub(grip),front.clone().sub(back)).invert();
    const orient = (shaft,normal,reverse=false) => basis(shaft,reverse ? normal.clone().negate() : normal).multiply(rest);
    const forward = vec(0,0,1), up = vec(0,1,0);
    return (shape,phase,backhand,shoulder,target,aim,split) => {
        const side = backhand ? 1 : -1, face = backhand ? back : front;
        const tip = vec(-.46,.76,.49).applyAxisAngle(forward,-aim.paddle).applyAxisAngle(up,aim.paddle);
        const normal = vec(.23,.18,.96).applyAxisAngle(up,aim.paddle);
        const readyRotation = orient(tip,normal);
        const readyGrip = shoulder.clone().add(vec(.065+.23*aim.paddle,-.145+.018*split,.268));
        const surface = (gripPoint,q) => face.clone().sub(grip).applyQuaternion(q).add(gripPoint);
        const ready = surface(readyGrip,readyRotation);
        if (!target || !phase.engaged) return {point:ready, rotation:readyRotation, face};

        const overheadSwing = shape === overhead;
        const loadGrip = shoulder.clone().add(vec(side*(shape.load[0]+(backhand ? .14 : 0)),shape.load[1],
            backhand ? Math.max(.16,shape.load[2]) : shape.load[2]));
        const finishGrip = shoulder.clone().add(vec(side*shape.finish[0],shape.finish[1],shape.finish[2]));
        const loadRotation = orient(vec(side*(overheadSwing?1.55:.9),shape.low,overheadSwing?-.52:-.32),vec(0,shape.open,1),backhand);
        const hitRotation = orient(overheadSwing ? vec(side*.16,1,.22) : vec(side,.20,.19),vec(0,shape.open,1),backhand);
        const across = shape===drive || shape===serve;
        const finishRotation = orient(vec(side*(across ? -.88 : overheadSwing ? .48 : .72),shape.high,.62),vec(-side*.32,shape.open,1),backhand);
        const rotations = [readyRotation,loadRotation,hitRotation,finishRotation];
        const w = phase.weights;
        const point = ready.multiplyScalar(w[0]).addScaledVector(surface(loadGrip,loadRotation),w[1])
            .addScaledVector(target,w[2]).addScaledVector(surface(finishGrip,finishRotation),w[3]);
        return {point, rotation:rotations[phase.i].clone().slerp(rotations[(phase.i+1)%4],phase.blend), face};
    };
}

// Turn the rigid hand/paddle only as far as necessary to keep the wrist within
// the arm's two-link reach. The shoulder, wrist and face form a triangle.
export function fitGrip(shoulder, point, rotation, face, length) {
    const ray = point.clone().sub(shoulder), distance = ray.length();
    const blade = face.clone().applyQuaternion(rotation), radius = blade.length();
    if (ray.distanceTo(blade) > length && distance > 1e-6) {
        const axis = ray.divideScalar(distance), from = blade.clone().divideScalar(radius);
        const angle = Math.acos(clamp(from.dot(axis),-1,1));
        const allowed = Math.acos(clamp((distance*distance+radius*radius-length*length)/(2*distance*radius),-1,1));
        if (angle > allowed && angle > .00001) {
            const turn = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(from,axis),(angle-allowed)/angle);
            rotation.premultiply(turn);
            blade.applyQuaternion(turn);
        }
    }
    return point.clone().sub(blade);
}
