// The approved GLB supplies the mesh and upper-body poses. The play sampler owns
// world position, anatomical hand, feet, shot target and time, including seeks.
import * as THREE from './vendor/three.module.min.js';

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
    function sampleBones(stroke,time,shift,sideBend=0) {
        const keys=tracks[stroke];
        for (const bone of bones) {
            const n=bone.name, matrix=pose[n].copy(local[n]);
            if (keys[n]) matrix.compose(bone.position,new THREE.Quaternion().fromArray(keys[n].evaluate(time)),ONE);
            if (bone.parent.isBone) matrix.premultiply(pose[bone.parent.name]);
            else matrix.setPosition(position(matrix).add(shift));
            if (n === 'Torso' && sideBend) {
                const waist = position(matrix);
                matrix.premultiply(new THREE.Matrix4().makeRotationZ(-sideBend)).setPosition(waist);
            }
        }
    }
    const zero=new THREE.Vector3(),calibration={};
    for (const [name,stroke] of Object.entries(strokes)) {
        sampleBones(name,stroke.times[2],zero);
        calibration[name]=position(pose[stroke.face]);
    }

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

    root.userData.applyPose=(sample,contactWeight)=>{
        const d=root.userData, facing=sample.bodyFacing || {x:0,z:1}, yaw=Math.atan2(facing.x,facing.z);
        const mirror=d.handedness==='left'?-1:1;
        root.position.copy(sample.worldPosition);
        visual.rotation.y=yaw;
        model.scale.x=mirror;
        const active=sample.profile && !['ready','shuffle'].includes(sample.action);
        const name=active && sample.strokeSide==='backhand'?'Backhand':'Dink';
        const stroke=strokes[name];
        const r=active?THREE.MathUtils.clamp(sample.strokeTime/sample.profile.duration,0,1):0;
        const family=active?(sample.instructionalFamily||sample.shotType||sample.action):'ready';
        const c=sample.profile?.contactRatio??.5, f=sample.profile?.recoverRatio??.8;
        const stops=[0,sample.profile?.prepareRatio??.25,c,f,1];
        let interval=0;
        while (interval<3 && r>stops[interval+1]) interval++;
        const t=THREE.MathUtils.lerp(stroke.times[interval],stroke.times[interval+1],
            (r-stops[interval])/Math.max(1e-7,stops[interval+1]-stops[interval]));
        const phase=r<=c?r/c:r<=f?1+(r-c)/(f-c):2+(r-f)/(1-f);
        const jump=family==='overhead' && sample.modelVersion!==2 && phase<=2?.4*Math.sin(Math.PI*phase/2)**2:0;
        visual.position.y=jump;
        const canonical=world=>{
            const p=new THREE.Vector3(world.x-root.position.x,world.y-root.position.y-jump,world.z-root.position.z).applyAxisAngle(UP,-yaw);
            p.x*=mirror;return p;
        };
        const target=active && sample.paddle?.worldContactTarget?canonical(sample.paddle.worldContactTarget):null;
        const weight=target?THREE.MathUtils.clamp(contactWeight,0,1):0;
        // At overhead height the cap needs room beside the striking arm. Lean
        // away from the raised hand and straighten the stance over planted feet.
        const overheadReach = target && family === 'overhead' ? smooth((target.y - .95) / .42) : 0;
        const shift=new THREE.Vector3(0,-.035*(sample.splitStep||0),0);
        if (weight) {
            // A small weight transfer reduces the arm extension on high/wide
            // strokes. The tactical root and both authored foot plants stay put.
            const toward=target.clone().sub(calibration[name]);
            toward.y=THREE.MathUtils.clamp(toward.y,-.09,.10 + .10 * overheadReach);
            toward.x=THREE.MathUtils.clamp(toward.x,-.09,.09);
            toward.z=THREE.MathUtils.clamp(toward.z,-.08,.08);
            shift.addScaledVector(toward,weight);
        }
        sampleBones(name,t,shift,.54 * overheadReach * weight);
        if (weight) {
            const shoulder=position(pose.UpperArmR);
            const face=position(pose[stroke.face]);
            const desired=overheadReach ? face.clone().lerp(target,weight) : face.clone().addScaledVector(target.clone().sub(calibration[name]).sub(shift),weight);
            const wrist=position(pose.HandR),blade=face.clone().sub(wrist);
            const ray=desired.clone().sub(shoulder);
            const align=smooth((ray.length()-.32)/.29)*weight;
            const turn=new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(blade.clone().normalize(),ray.normalize()),align);
            const handRotation=turn.clone().multiply(rotation(pose.HandR));
            const elbowPole=position(pose.ForearmR).sub(shoulder);
            placeChain('UpperArmR','ForearmR','HandR',desired.sub(blade.applyQuaternion(turn)),elbowPole,handRotation);
            for (const socket of sockets) pose[socket].multiplyMatrices(pose.HandR,local[socket]);
        }
        for (const side of ['R','L']) {
            const target=sample.footTargets?.[(side==='R')===(mirror===1)?'right':'left'];
            if (!target) continue;
            const foot='Foot'+side, q=rotation(bind[foot]);
            const ankle=canonical(target);
            ankle.y+=jump;
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
