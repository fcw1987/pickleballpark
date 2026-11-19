// The approved GLB supplies the mesh and upper-body poses. The play sampler owns
// world position, anatomical hand, feet, shot target and time, including seeks.
import * as THREE from './vendor/three.module.min.js';
import { fitGrip, paddleFrame, readyAim, strokePhase, strokeShape } from './emerald-motion.js';

const MODEL_URL = new URL('./assets/athletes/emerald-cap.glb', import.meta.url);
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const upperBody = new Set(['Torso','Head','UpperArmR','ForearmR','HandR','UpperArmL','ForearmL','HandL']);
const sockets = ['PaddleFace','PaddleBack','FaceNormal','GripCenter'];
const strokes = {
    Dink: { times: [0, .29, .70, 1.01, 1.59], face: 'PaddleFace' },
    Backhand: { times: [0, .34, .80, 1.09, 1.65], face: 'PaddleBack' }
};
let modelBytes;
const position = matrix => new THREE.Vector3().setFromMatrixPosition(matrix);
const rotation = matrix => new THREE.Quaternion().setFromRotationMatrix(matrix);
const smooth = t => { t=THREE.MathUtils.clamp(t,0,1); return t*t*(3-2*t); };

function release(scene) {
    const geometries=new Set(), materials=new Set(), skeletons=new Set();
    scene.traverse(node => {
        if (node.geometry) geometries.add(node.geometry);
        if (node.material) for (const material of [].concat(node.material)) materials.add(material);
        if (node.skeleton) skeletons.add(node.skeleton);
    });
    for (const resource of [...skeletons, ...geometries, ...materials]) resource.dispose();
}

export async function loadEmeraldAthlete(signal) {
    // Each court owns fresh skin, materials and GPU state. Only validated source
    // bytes survive exits. Failure leaves the original illustrated player usable.
    const request=new AbortController();
    const abort=()=>request.abort();
    signal.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(abort,8000);
    let gltf;
    try {
        if (signal.aborted) return null;
        const [{GLTFLoader}, bytes]=await Promise.all([
            import('./vendor/three-addons/loaders/GLTFLoader.js'),
            modelBytes || fetch(MODEL_URL,{signal:request.signal}).then(response=>{
                if (!response.ok) throw new Error('Emerald Cap model unavailable');
                return response.arrayBuffer();
            })
        ]);
        if (request.signal.aborted) return null;
        gltf=await new GLTFLoader().parseAsync(bytes,new URL('.',MODEL_URL).href);
        if (request.signal.aborted) { release(gltf.scene); return null; }
        const actor=createEmeraldAthlete(gltf);
        modelBytes=bytes;
        return actor;
    } catch {
        if (gltf) release(gltf.scene);
        return null;
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort',abort);
    }
}

// Measure the actual flat rubber outsole in bind space, once. Its centroid is
// the same physical point the foot-placement sampler places on the court.
function soleOffsets(model, bind) {
    const shoes=model.getObjectByName('Court_shoes').children.find(mesh=>mesh.material.name==='Rubber');
    const {position:vertices,skinIndex}=shoes.geometry.attributes;
    const rings={FootR:[],FootL:[]};
    for (let i=0;i<vertices.count;i++) {
        const foot=shoes.skeleton.bones[skinIndex.getX(i)].name;
        rings[foot].push(shoes.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(shoes.matrixWorld));
    }
    const offsets={};
    for (const [foot,points] of Object.entries(rings)) {
        const floor=Math.min(...points.map(p=>p.y));
        const ring=new Map(points.filter(p=>p.y<floor+1e-5).map(p=>[p.toArray().map(n=>n.toFixed(6)).join(','),p]));
        const center=new THREE.Vector3();
        for (const p of ring.values()) center.add(p);
        offsets[foot]=center.divideScalar(ring.size).applyMatrix4(bind[foot].clone().invert());
    }
    return offsets;
}

export function createEmeraldAthlete(gltf) {
    const model=gltf.scene, root=new THREE.Group(), visual=new THREE.Group();
    const bones=[], bind={}, local={}, pose={}, tracks={};
    model.updateMatrixWorld(true);
    model.traverse(node=>{
        if (node.isSkinnedMesh) node.frustumCulled=false;
        if (!node.isBone) return;
        bones.push(node);
        bind[node.name]=node.matrixWorld.clone();
        local[node.name]=node.matrix.clone();
        pose[node.name]=node.matrixWorld.clone();
    });
    for (const name of [...upperBody,...sockets,'Pelvis','ThighR','ThighL','ShinR','ShinL','FootR','FootL']) {
        if (!bind[name]) throw new Error('Missing approved Emerald Cap joint '+name);
    }
    for (const name of Object.keys(strokes)) {
        const clip=gltf.animations.find(clip=>clip.name===name);
        tracks[name]={};
        for (const track of clip.tracks) {
            const [bone,property]=track.name.split('.');
            if (property==='quaternion' && upperBody.has(bone)) tracks[name][bone]=track.createInterpolant();
        }
    }
    const soles=soleOffsets(model,bind);
    root.add(visual);visual.add(model);
    root.userData={
        emeraldCap:true,volumetric:true,team:'team1',player:0,visual,model,
        paddleMesh:model.getObjectByName('Paddle').children.find(m=>m.material.name==='Paddle'),
        grip:model.getObjectByName('GripCenter'),paddleFaceWorld:new THREE.Vector3(),
        dispose:()=>release(model)
    };
    const readyJoints=Object.fromEntries(bones.map(b=>[b.name,tracks.Dink[b.name]
        ? new THREE.Quaternion().fromArray(tracks.Dink[b.name].evaluate(0)) : b.quaternion.clone()]));
    function sampleBones(stroke,time,engaged,shift,torsoTurn,headTurn) {
        const keys=tracks[stroke];
        for (const bone of bones) {
            const n=bone.name, matrix=pose[n].copy(local[n]);
            if (keys[n]) {
                const q=new THREE.Quaternion().fromArray(keys[n].evaluate(time));
                matrix.compose(bone.position,readyJoints[n].clone().slerp(q,engaged),ONE);
            }
            if (bone.parent.isBone) matrix.premultiply(pose[bone.parent.name]);
            else matrix.setPosition(position(matrix).add(shift));
            const turn = n === 'Torso' ? torsoTurn : n === 'Head' ? headTurn : null;
            if (turn) {
                const pivot = position(matrix);
                matrix.premultiply(turn).setPosition(pivot);
            }
        }
    }
    const bladeFrame = paddleFrame(local);
    const length = (mid, end) => position(local[mid]).length() + position(local[end]).length();
    const armLength = length('ForearmR','HandR');
    const lateral = new THREE.Vector3(1,0,0);

    function segment(parent,child,start,end) {
        const localAxis=position(local[child]);
        const length=localAxis.length();
        localAxis.normalize();
        const q=rotation(pose[parent]);
        const desired=end.clone().sub(start);
        const stretch=desired.length()/length;
        const turn=new THREE.Quaternion().setFromUnitVectors(localAxis.clone().applyQuaternion(q),desired.normalize());
        const transform=pose[parent].compose(start,turn.multiply(q),ONE);
        // Scale along the bone only when an authored target exceeds neutral
        // reach. The child gets its own absolute frame, including an unstretched
        // hand/foot, so the grip, paddle and shoes always retain their shape.
        if (Math.abs(stretch-1)>1e-7) {
            const {x,y,z}=localAxis,s=stretch-1;
            transform.multiply(new THREE.Matrix4().set(1+s*x*x,s*x*y,s*x*z,0,s*y*x,1+s*y*y,s*y*z,0,
                s*z*x,s*z*y,1+s*z*z,0,0,0,0,1));
        }
    }
    function placeChain(a,b,c,target,pole,endRotation) {
        const start=position(pose[a]),axis=target.clone().sub(start);
        const distance=Math.max(1e-6,axis.length());axis.divideScalar(distance);
        const first=position(local[b]).length(),second=position(local[c]).length();
        const stretch=Math.max(1,distance/(first+second));
        const upper=first*stretch,lower=second*stretch;
        const along=THREE.MathUtils.clamp((upper*upper-lower*lower+distance*distance)/(2*distance),-upper,upper);
        pole.addScaledVector(axis,-pole.dot(axis));
        if (pole.lengthSq()<1e-8) pole.set(1,0,0).addScaledVector(axis,-axis.x);
        const joint=start.clone().addScaledVector(axis,along).addScaledVector(pole.normalize(),Math.sqrt(Math.max(0,upper*upper-along*along)));
        segment(a,b,start,joint);segment(b,c,joint,target);
        pose[c].compose(target,endRotation,ONE);
    }

    root.userData.applyPose=(sample,contactWeight,trail)=>{
        const d=root.userData, facing=sample.pickupFacing || sample.bodyFacing || {x:0,z:1}, yaw=Math.atan2(facing.x,facing.z);
        const mirror=d.handedness==='left'?-1:1;
        root.position.copy(sample.worldPosition);
        visual.rotation.y=yaw;
        model.scale.x=mirror;
        const active=sample.profile && !['ready','shuffle'].includes(sample.action);
        const name=active && sample.strokeSide==='backhand'?'Backhand':'Dink';
        const stroke=strokes[name];
        const r=active?THREE.MathUtils.clamp(sample.strokeTime/sample.profile.duration,0,1):0;
        const family=active?(sample.instructionalFamily||sample.shotType||sample.action):'ready';
        const shape = strokeShape(family);
        const c=sample.profile?.contactRatio??.5, f=sample.profile?.recoverRatio??.8;
        const p=sample.profile?.prepareRatio??.25, stops=[0,p,c,f,1];
        const phase=strokePhase(r,p,c,f), interval=phase.i;
        const t=THREE.MathUtils.lerp(stroke.times[interval],stroke.times[interval+1],
            (r-stops[interval])/Math.max(1e-7,stops[interval+1]-stops[interval]));
        const canonical=world=>{
            const p=new THREE.Vector3(world.x-root.position.x,world.y-root.position.y,world.z-root.position.z).applyAxisAngle(UP,-yaw);
            p.x*=mirror;return p;
        };
        const target=active && sample.paddle?.worldContactTarget?canonical(sample.paddle.worldContactTarget):null;
        const split = smooth(sample.splitStep || 0), backhand = name==='Backhand', side = backhand ? 1 : -1;
        const aim = readyAim(trail,root.position,yaw,mirror,sample.courtForward ?? (root.position.z<=0?1:-1));
        const high = target ? smooth((target.y-1.06)/.52) : 0;
        const low = target ? smooth((.90-target.y)/.50) : 0;
        const load = Math.max(0,phase.weights[1]), finish = Math.max(0,phase.weights[3]);
        const reach = target ? smooth(r/c)*(1-smooth((r-c)/(1-c))) : 0;
        const transfer = target ? new THREE.Vector3(target.x+.17,0,target.z-.16).multiplyScalar(.48).clampLength(0,.18)
            .multiplyScalar(reach) : new THREE.Vector3();
        // Keep the striking side clear of the wide cap on high contacts.
        transfer.x += .10*high*reach;
        const feet = sample.footTargets;
        const stepLift = Math.max(feet?.right?.y || 0,feet?.left?.y || 0);
        const unweight=(sample.splitLift || 0)*(1-phase.engaged);
        transfer.y = unweight - .071*split - .047*load - .45*stepLift + (.102*high-.126*low)*reach;
        const twist = side*shape.coil*(load-.68*finish);
        const torsoTurn = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(.09*load+.15*low*reach,twist,-.48*high*reach,'YXZ'));
        const headTurn = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
            -aim.pitch*(1-.48*phase.engaged)-.10*high*reach,aim.head*(1-.70*phase.engaged)-.75*twist,.19*high*reach,'YXZ'));
        sampleBones(name,t,phase.engaged,transfer,torsoTurn,headTurn);

        const shoulder = position(pose.UpperArmR);
        const radius = position(local[stroke.face]).length()+armLength*.98;
        const horizontal = target ? Math.hypot(target.x-shoulder.x,target.z-shoulder.z) : 0;
        const height = Math.sqrt(Math.max(.04,radius*radius-horizontal*horizontal));
        // The original authoring model supports a jump. Grounded model-2 foot
        // evidence, including momentum after a fault, always stays on its plane.
        const landing = Math.min(.95,f+.09);
        const flight = r<c ? r/c : Math.max(0,(landing-r)/(landing-c));
        const jump = high && sample.modelVersion!==2
            ? Math.min(.88,Math.max(0,target.y-shoulder.y-height+.025))*Math.sin(flight*Math.PI/2)**2 : 0;
        visual.position.y=jump;
        if (target) target.y-=visual.position.y;
        const blade=bladeFrame(shape,phase,backhand,shoulder,target,aim,split);
        const wrist=fitGrip(shoulder,blade.point,blade.rotation,blade.face,armLength*.992);
        const wristDelta=wrist.clone().sub(shoulder);
        const excess=Math.max(0,wristDelta.length()-armLength);
        // Do not chase a distant contact during pickup or recovery.
        const allowed = high ? armLength : armLength + excess*smooth(contactWeight || 0);
        wrist.copy(shoulder).add(wristDelta.clampLength(.066,allowed));
        placeChain('UpperArmR','ForearmR','HandR',wrist,new THREE.Vector3(-.70,-.54,-.40),blade.rotation);
        for (const socket of sockets) pose[socket].multiplyMatrices(pose.HandR,local[socket]);

        const other = position(pose.UpperArmL);
        const guide = new THREE.Vector3(-.045+.07*aim.paddle,-.125+.18*high*load,.225);
        guide.x += .065*phase.engaged; guide.z-=.08*finish;
        placeChain('UpperArmL','ForearmL','HandL',guide.add(other),new THREE.Vector3(.70,-.48,-.34),rotation(pose.HandL));
        for (const side of ['R','L']) {
            const target=sample.footTargets?.[(side==='R')===(mirror===1)?'right':'left'];
            if (!target) continue;
            const foot='Foot'+side, q=rotation(bind[foot]);
            const ankle=canonical(target);
            // A swing foot pitches slightly on lift. Both soles finish flat,
            // and the leg releases from the court together with the body on a hop.
            const lift = Math.max(0,target.y-root.position.y);
            q.premultiply(new THREE.Quaternion().setFromAxisAngle(lateral,-Math.min(.16,lift*1.8)));
            ankle.y += unweight+Math.min(.06,jump*.12);
            ankle.sub(soles[foot].clone().applyQuaternion(q));
            placeChain('Thigh'+side,'Shin'+side,foot,ankle,new THREE.Vector3(side==='R'?-.13:.13,-.03,.34),q);
        }
        for (const bone of bones) {
            bone.matrixAutoUpdate=false;
            bone.matrix.copy(pose[bone.name]);
            if (bone.parent.isBone) bone.matrix.premultiply(pose[bone.parent.name].clone().invert());
            bone.matrixWorldNeedsUpdate=true;
        }
        root.updateMatrixWorld(true);
        model.getObjectByName(stroke.face).getWorldPosition(d.paddleFaceWorld);
        d.animation={action:sample.action,phase:sample.phase,frame:sample.frameIndex||0,family,
            viewDirection:sample.viewDirection,bodyFacing:{...facing},backhand:name==='Backhand',
            planted:sample.planted,jumpHeight:jump,source:'approved-emerald-cap-glb'};
    };
    return root;
}
