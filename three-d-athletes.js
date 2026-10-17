// Original court-scale, faceted athletes. Local +Z is forward; the player root
// is always the authored ground position. Every animated part has real depth.
import * as THREE from './vendor/three.module.min.js';
import { POSE_LIBRARY } from './three-d-animation.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Bevelled octagonal cross sections, deliberately shaped at waist, ribs and
// shoulders rather than stacked boxes or capsule primitives.
function tailoredVolume(rings) {
    const positions = [], indices = [];
    const outline = [[-.72,-1],[.72,-1],[1,-.62],[1,.62],[.72,1],[-.72,1],[-1,.62],[-1,-.62]];
    for (const [y, width, depth] of rings) for (const [x,z] of outline) positions.push(x*width/2,y,z*depth/2);
    for (let r=0;r<rings.length-1;r++) for(let i=0;i<8;i++) {
        const a=r*8+i,b=r*8+(i+1)%8,c=b+8,d=a+8;
        indices.push(a,d,b,b,d,c);
    }
    for(let i=1;i<7;i++) { indices.push(0,i,i+1);const k=(rings.length-1)*8;indices.push(k,k+i+1,k+i); }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    return geometry;
}

export class AthleteResources {
    constructor() { this.materials=new Map();this.geometries=new Set();this.extraMaterials=new Set();this.geometryCache=new Map(); }
    material(color) {
        if(!this.materials.has(color))this.materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.92,metalness:0,flatShading:true}));
        return this.materials.get(color);
    }
    geometry(geometry) {
        const cacheable=['BoxGeometry','CylinderGeometry','SphereGeometry','CircleGeometry'].includes(geometry.type);
        const key=cacheable?`${geometry.type}:${JSON.stringify(geometry.parameters)}`:geometry.userData.cacheKey;
        if(key&&this.geometryCache.has(key)){geometry.dispose();return this.geometryCache.get(key);}
        if(key)this.geometryCache.set(key,geometry);this.geometries.add(geometry);return geometry;
    }
    coloredMaterial() {
        if(!this.vertexMaterial){this.vertexMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0,flatShading:true});this.extraMaterials.add(this.vertexMaterial);}
        return this.vertexMaterial;
    }
    dispose() { for(const g of this.geometries)g.dispose();for(const m of this.materials.values())m.dispose();for(const m of this.extraMaterials)m.dispose();this.geometries.clear();this.materials.clear();this.extraMaterials.clear();this.geometryCache.clear();this.vertexMaterial=null; }
}

function mesh(resources,geometry,color,name,parent,x=0,y=0,z=0) {
    const object=new THREE.Mesh(resources.geometry(geometry),resources.material(color));
    object.name=name;object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
}
function box(r,parent,name,color,size,position) { return mesh(r,new THREE.BoxGeometry(...size),color,name,parent,...position); }
function volume(r,parent,name,color,rings,x=0,y=0,z=0) { const geometry=tailoredVolume(rings);geometry.userData.cacheKey=`tailored:${JSON.stringify(rings)}`;return mesh(r,geometry,color,name,parent,x,y,z); }
function limb(r,parent,name,color,top,bottom,length) {
    return mesh(r,new THREE.CylinderGeometry(top,bottom,length,7,1),color,name,parent);
}
function alignSegment(object,a,b,originalLength) {
    object.position.copy(a).add(b).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(UP,b.clone().sub(a).normalize());
    object.scale.y=a.distanceTo(b)/originalLength;
}
// Static cloth/face pixel details share a draw call per articulated body part.
// Baked vertex colors preserve the tiny cream stitches without texture fetches.
function mergeDetails(r,parent,name,exclude=[]) {
    const parts=parent.children.filter(o=>o.isMesh&&!exclude.includes(o.name)),positions=[],normals=[],colors=[];
    if(parts.length<2)return;
    for(const part of parts) {
        part.updateMatrix();const geometry=part.geometry.clone().applyMatrix4(part.matrix),p=geometry.attributes.position,n=geometry.attributes.normal,index=geometry.index;
        for(let i=0;i<(index?index.count:p.count);i++) {
            const vertex=index?index.getX(i):i;positions.push(p.getX(vertex),p.getY(vertex),p.getZ(vertex));normals.push(n.getX(vertex),n.getY(vertex),n.getZ(vertex));
            colors.push(part.material.color.r,part.material.color.g,part.material.color.b);
        }
        geometry.dispose();parent.remove(part);
        if(part.name!==name){const anchor=new THREE.Object3D();anchor.name=part.name;anchor.position.copy(part.position);anchor.userData.mergedDetail=true;parent.add(anchor);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const merged=new THREE.Mesh(r.geometry(geometry),r.coloredMaterial());merged.name=name;merged.castShadow=true;merged.receiveShadow=true;merged.userData.parts=parts.map(p=>p.name);parent.add(merged);
}
// One dynamic body draw per athlete. The small articulated source meshes remain
// as the rig's semantic handles; their vertices are transformed into this batch.
// PaddleFace stays independent so contact is the actual visible triangle surface.
function batchArticulatedBody(r,visual) {
    const sources=[];visual.traverse(object=>{if(object.isMesh&&object.name!=='PaddleFace')sources.push(object);});
    const positions=[],normals=[],colors=[],parts=[];
    for(const source of sources) {
        const geometry=source.geometry,p=geometry.attributes.position,n=geometry.attributes.normal,c=geometry.attributes.color,index=geometry.index,start=positions.length/3;
        const localPositions=[],localNormals=[];
        for(let i=0;i<(index?index.count:p.count);i++) {
            const vertex=index?index.getX(i):i;
            localPositions.push(p.getX(vertex),p.getY(vertex),p.getZ(vertex));localNormals.push(n.getX(vertex),n.getY(vertex),n.getZ(vertex));
            colors.push(c?c.getX(vertex):source.material.color.r,c?c.getY(vertex):source.material.color.g,c?c.getZ(vertex):source.material.color.b);
        }
        positions.push(...localPositions);normals.push(...localNormals);
        parts.push({source,start,count:localPositions.length/3,positions:localPositions,normals:localNormals,matrix:new THREE.Matrix4(),normalMatrix:new THREE.Matrix3()});source.visible=false;source.castShadow=false;
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const batch=new THREE.Mesh(r.geometry(geometry),r.coloredMaterial());batch.name='AthleteBodyBatch';batch.frustumCulled=false;batch.castShadow=true;batch.receiveShadow=true;visual.add(batch);
    return {batch,parts,inverse:new THREE.Matrix4(),point:new THREE.Vector3(),normal:new THREE.Vector3()};
}
function updateBodyBatch(body,visual) {
    const position=body.batch.geometry.attributes.position,normal=body.batch.geometry.attributes.normal;
    body.inverse.copy(visual.matrixWorld).invert();
    for(const part of body.parts) {
        part.matrix.multiplyMatrices(body.inverse,part.source.matrixWorld);part.normalMatrix.getNormalMatrix(part.matrix);
        for(let i=0;i<part.count;i++) {
            body.point.fromArray(part.positions,i*3).applyMatrix4(part.matrix);body.normal.fromArray(part.normals,i*3).applyNormalMatrix(part.normalMatrix);
            position.setXYZ(part.start+i,body.point.x,body.point.y,body.point.z);normal.setXYZ(part.start+i,body.normal.x,body.normal.y,body.normal.z);
        }
    }
    position.needsUpdate=true;normal.needsUpdate=true;
}
function makeLeg(r,root,name,skin,cream,navy,accent) {
    const thigh=limb(r,root,`${name}Thigh`,skin,.092,.072,.39);
    const shorts=limb(r,root,`${name}Shorts`,navy,.116,.10,.27);
    const knee=mesh(r,new THREE.SphereGeometry(.073,7,4),skin,`${name}Knee`,root);knee.scale.set(1,.95,.94);
    const shin=limb(r,root,`${name}Shin`,skin,.067,.045,.34);
    const sock=limb(r,root,`${name}Sock`,cream,.047,.048,.105);
    const foot=new THREE.Group();foot.name=`${name}Foot`;root.add(foot);
    volume(r,foot,`${name}Sneaker`,cream,[[0,.108,.23],[.035,.123,.26],[.09,.104,.20],[.113,.085,.12]],0,0,.047);
    box(r,foot,`${name}Sole`,'#d4dbcf',[.125,.027,.266],[0,.017,.045]);
    box(r,foot,`${name}ShoeStripe`,accent,[.129,.022,.075],[0,.062,.064]);
    box(r,foot,`${name}Laces`,navy,[.058,.009,.055],[0,.106,.065]);
    return {thigh,shorts,knee,shin,sock,foot};
}
function makeArm(r,root,name,skin,jersey,cream) {
    const upper=limb(r,root,`${name}UpperArm`,skin,.069,.054,.29);
    const sleeve=limb(r,root,`${name}Sleeve`,jersey,.097,.081,.145);
    const cuff=limb(r,root,`${name}Cuff`,cream,.082,.081,.023);
    const forearm=limb(r,root,`${name}Forearm`,skin,.056,.039,.27);
    const hand=mesh(r,new THREE.SphereGeometry(.052,7,4),skin,`${name}Hand`,root);hand.scale.set(.9,1.18,.8);
    return {upper,sleeve,cuff,forearm,hand};
}

export function createAthlete(resources,team,handedness,variant=handedness==='left'?1:0) {
    const r=resources||new AthleteResources(),root=new THREE.Group();root.name=`Athlete-${team}-${handedness}`;
    const green=team==='team1'||team==='green',alternate=variant%2!==0;
    const colors={jersey:green?'#267751':'#dc7337',light:green?'#79ad72':'#f6ad68',dark:green?'#1d563c':'#a84928',cream:'#f3eed8',navy:'#263e49',skin:alternate?'#b97850':'#e5ad82',hair:alternate?'#302d2a':'#62452f'};
    const visual=new THREE.Group();visual.name='AthleteOrientation';root.add(visual);
    const upper=new THREE.Group();upper.name='AthleteTorso';visual.add(upper);
    volume(r,upper,'TaperedJersey',colors.jersey,[[.88,.36,.23],[.99,.40,.25],[1.24,.48,.27],[1.34,.54,.25],[1.40,.43,.22]]);
    volume(r,upper,'JerseyHem',colors.dark,[[.88,.365,.235],[.928,.38,.24]]);
    // Small cream stitch blocks remain crisp without pixelating the whole view.
    for(const side of [-1,1]) {
        box(r,upper,'ShoulderPiping',colors.cream,[.13,.024,.242],[side*.185,1.354,0]);
        box(r,upper,'SideJerseyPanel',colors.light,[.035,.235,.025],[side*.2,1.12,.128]);
    }
    box(r,upper,'ChestClubMark',colors.cream,[.062,.061,.012],[-.112,1.269,.143]);
    box(r,upper,'ChestMarkPixel',colors.light,[.025,.021,.014],[-.102,1.279,.152]);
    // Two chunky original jersey digits on the back are readable from full court.
    for(const x of [-.052,.04]) {
        box(r,upper,'BackNumberTop',colors.cream,[.057,.022,.014],[x,1.27,-.142]);
        box(r,upper,'BackNumberStem',colors.cream,[.022,.108,.014],[x+.017,1.225,-.143]);
        box(r,upper,'BackNumberBase',colors.cream,[.057,.022,.014],[x,1.17,-.142]);
    }
    volume(r,upper,'ShortsWaist',colors.navy,[[.80,.37,.235],[.91,.39,.24]]);
    const neck=limb(r,upper,'Neck',colors.skin,.072,.083,.105);neck.position.set(0,1.424,0);
    const head=new THREE.Group();head.name='Head';head.position.set(0,1.455,0);upper.add(head);
    volume(r,head,'FacetedFace',colors.skin,[[0,.17,.17],[.045,.23,.225],[.18,.258,.246],[.275,.23,.225],[.303,.16,.17]],0,0,.007);
    for(const x of [-.127,.127])mesh(r,new THREE.SphereGeometry(.036,6,4),colors.skin,'Ear',head,x,.14,.005);
    box(r,head,'Nose',colors.skin,[.045,.063,.044],[0,.133,.139]);
    for(const x of [-.054,.054])box(r,head,'Eye',colors.hair,[.023,.019,.013],[x,.187,.133]);
    box(r,head,'Mouth',colors.hair,[.047,.011,.01],[0,.078,.13]);
    volume(r,head,'Hair',colors.hair,[[.22,.265,.25],[.29,.25,.245],[.323,.17,.17]],0,0,-.009);
    if(!alternate) {
        volume(r,head,'ClubCap',colors.jersey,[[.252,.272,.26],[.31,.251,.24],[.338,.14,.14]],0,0,-.005);
        volume(r,head,'CapBrim',colors.cream,[[0,.244,.16],[.023,.244,.16]],0,.252,.15);
        box(r,head,'CapBadge',colors.cream,[.044,.034,.013],[0,.284,.129]);
    } else {
        volume(r,head,'Headband',colors.cream,[[.219,.272,.253],[.254,.272,.253]],0,0,.001);
        if(green) {const pony=mesh(r,new THREE.SphereGeometry(.079,7,4),colors.hair,'ShortPonytail',head,0,.195,-.164);pony.scale.set(.8,1.1,1.3);}
        else box(r,head,'HairSweep',colors.hair,[.12,.041,.16],[-.045,.313,.025]);
    }
    const legs={left:makeLeg(r,visual,'Left',colors.skin,colors.cream,colors.navy,colors.jersey),right:makeLeg(r,visual,'Right',colors.skin,colors.cream,colors.navy,colors.jersey)};
    const arms={left:makeArm(r,visual,'Left',colors.skin,colors.jersey,colors.cream),right:makeArm(r,visual,'Right',colors.skin,colors.jersey,colors.cream)};
    const paddle=new THREE.Group();paddle.name='PaddleAttachment';visual.add(paddle);
    const faceShape=new THREE.Shape();faceShape.moveTo(-.084,-.115);faceShape.lineTo(.084,-.115);faceShape.lineTo(.123,-.067);faceShape.lineTo(.13,.091);faceShape.lineTo(.08,.147);faceShape.lineTo(-.08,.147);faceShape.lineTo(-.13,.091);faceShape.lineTo(-.123,-.067);faceShape.closePath();
    const paddleGeometry=new THREE.ExtrudeGeometry(faceShape,{depth:.022,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.009,bevelThickness:.004});paddleGeometry.translate(0,0,-.011);
    mesh(r,paddleGeometry,colors.navy,'PaddleFace',paddle);
    box(r,paddle,'PaddleStripe',colors.light,[.20,.041,.029],[0,.033,0]);
    box(r,paddle,'PaddleMark',colors.cream,[.055,.022,.031],[.033,.083,0]);
    const handle=limb(r,paddle,'PaddleGrip',colors.cream,.024,.024,.145);handle.position.y=-.194;
    for(const y of [-.15,-.18,-.21,-.24]){const wrap=limb(r,paddle,'GripWrap',colors.navy,.025,.025,.009);wrap.position.y=y;}
    mergeDetails(r,upper,'TaperedJersey');mergeDetails(r,head,'FacetedFace');
    mergeDetails(r,legs.left.foot,'LeftSneaker');mergeDetails(r,legs.right.foot,'RightSneaker');
    mergeDetails(r,paddle,'PaddleDetails',['PaddleFace']);
    const bodyBatch=batchArticulatedBody(r,visual);
    const shadowMaterial=new THREE.MeshBasicMaterial({color:'#263b37',transparent:true,opacity:.20,depthWrite:false});r.extraMaterials.add(shadowMaterial);
    const shadow=new THREE.Mesh(r.geometry(new THREE.CircleGeometry(.37,24)),shadowMaterial);shadow.name='AthleteContactShadow';shadow.rotation.x=-Math.PI/2;shadow.position.y=.008;shadow.scale.y=.61;root.add(shadow);
    root.userData={team,handedness,variant,groundY:0,volumetricAthlete:true,pixelActor:false,visual,upper,head,legs,arms,paddle,shadow,bodyBatch,resources:r,paddleFaceWorld:new THREE.Vector3(),shoulderWorld:new THREE.Vector3(),height:1.79,animation:{}};
    return root;
}

function mixChannel(pose,name,component,axis) { return pose?.[name]?.[component]?.[axis]||0; }
function blendChannel(pose,name,component,axis) {
    const a=POSE_LIBRARY[pose?.from]||POSE_LIBRARY.ready,b=POSE_LIBRARY[pose?.to]||a;
    return THREE.MathUtils.lerp(mixChannel(a,name,component,axis),mixChannel(b,name,component,axis),smooth(pose?.progress||0));
}
function paddleKey(name,action,side,target) {
    const ready=v(side*.17,1.105,.43);
    if(name==='ready'||name==='split-step')return ready;
    const phase=name.split('-').at(-1);
    const back=action==='backhand',compact=action==='block',low=action==='drop'||action==='serve';
    if(phase==='prepare')return compact?v(side*.15,1.2,.36):action==='overhead'?v(side*.41,1.91,-.12):back?v(-side*.37,1.04,.12):v(side*(low?.48:.62),low?.67:1.09,-.15);
    if(phase==='contact')return target.clone();
    if(phase==='follow')return compact?target.clone().add(v(-side*.06,.06,.07)):action==='overhead'?v(-side*.42,1.05,.50):action==='lob'?v(-side*.12,1.91,.44):v(-side*(back?-.45:.42),low?1.15:1.47,.43);
    return ready;
}
function elbowPoint(shoulder,wrist,side) {
    const delta=wrist.clone().sub(shoulder),distance=Math.max(.001,delta.length()),axis=delta.clone().normalize();
    const upper=.29,lower=.285,reach=Math.min(distance,upper+lower-.002);
    const along=(upper*upper-lower*lower+reach*reach)/(2*reach),height=Math.sqrt(Math.max(.0002,upper*upper-along*along));
    const bend=v(side*.55,-.85,-.18);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
    return shoulder.clone().addScaledVector(axis,Math.min(along,distance*.55)).addScaledVector(bend,height);
}
function updateArm(arm,shoulder,wrist,side) {
    const elbow=elbowPoint(shoulder,wrist,side);
    alignSegment(arm.upper,shoulder,elbow,.29);alignSegment(arm.forearm,elbow,wrist,.27);
    const sleeveEnd=shoulder.clone().lerp(elbow,.48),cuffStart=shoulder.clone().lerp(elbow,.44);
    alignSegment(arm.sleeve,shoulder,sleeveEnd,.145);alignSegment(arm.cuff,cuffStart,sleeveEnd,.023);
    arm.hand.position.copy(wrist);arm.hand.quaternion.copy(arm.forearm.quaternion);
}

export function updateAthlete(root,sample,camera,contactWeight=0) {
    const d=root.userData,{visual,upper,head,legs,arms,paddle}=d,side=d.handedness==='right'?-1:1;
    root.position.set(sample.worldPosition.x,0,sample.worldPosition.z);
    const facing=sample.bodyFacing||{x:0,z:d.team==='team1'?1:-1};visual.rotation.y=Math.atan2(facing.x,facing.z);
    const pose=sample.strokePose,action=sample.action||'ready',phase=sample.phase||'ready';
    const strokeActivity=pose?(pose.from==='ready'?smooth(pose.progress):pose.to==='ready'?1-smooth(pose.progress):1):0;
    const travel=action==='shuffle'?clamp((sample.travelSpeed||1.2)/1.9):0,clock=sample.timeSeconds||0;
    const gait=sample.travelPhase??clock*9,stance=phase==='split-step'?.045:0;
    const bodyDrop=blendChannel(pose,'Hips','position','y')-.048-stance-(action==='block'?.018:.045)*strokeActivity;
    const weightShift=side*blendChannel(pose,'Hips','rotation','y')*.25;
    upper.position.set(weightShift+Math.sin(gait)*travel*.018,bodyDrop+travel*Math.abs(Math.sin(gait))*.028,0);
    upper.rotation.set(blendChannel(pose,'Torso','rotation','x')*.8,blendChannel(pose,'Torso','rotation','y')*(-side)*1.25,blendChannel(pose,'Torso','rotation','z')*(-side));
    upper.updateMatrixWorld(true);visual.updateMatrixWorld(true);
    for(const [name,s] of [['left',1],['right',-1]]) {
        const leg=legs[name],swing=Math.sin(gait+(s===1?0:Math.PI))*travel;
        const ankle=v(s*(.218+stance),Math.max(0,swing)*.085,swing*.19+.015);
        const hip=v(s*.13+weightShift,.875+upper.position.y,0);
        const knee=v(s*(.205+stance*.6)+weightShift*.65,.48+upper.position.y*.4,.185+strokeActivity*.045-swing*.055);
        alignSegment(leg.thigh,hip,knee,.39);alignSegment(leg.shorts,hip,hip.clone().lerp(knee,.66),.27);leg.knee.position.copy(knee);
        alignSegment(leg.shin,knee,ankle.clone().add(v(0,.095,0)),.34);
        alignSegment(leg.sock,ankle.clone().add(v(0,.07,0)),ankle.clone().add(v(0,.175,0)),.105);
        leg.foot.position.copy(ankle);leg.foot.rotation.set(-Math.max(0,-swing)*.22,s*.08,0);
    }
    const contact=sample.paddle?.worldContactTarget;
    const target=contact?visual.worldToLocal(v(contact.x,contact.y,contact.z)):v(side*.36,.8,.37);
    const bounded=target.clone();const shoulderApprox=v(side*.265,1.33+upper.position.y,0),offset=bounded.clone().sub(shoulderApprox);
    if(offset.length()>.84)bounded.copy(shoulderApprox).add(offset.setLength(.84));
    let face;
    if(pose) {
        face=paddleKey(pose.from,action,side,bounded).lerp(paddleKey(pose.to,action,side,bounded),smooth(pose.progress));
    } else face=v(side*.17,1.105+upper.position.y,.43);
    // The renderer alone adjusts the arm at contact. The trajectory and player root
    // stay authoritative, including low contacts and left handed strokes.
    if(contact&&contactWeight>0)face.lerp(target,contactWeight);
    const shoulder=visual.worldToLocal(upper.localToWorld(v(side*.258,1.325,.0)));
    const direction=v(0,1,.13).normalize().lerp(face.clone().sub(shoulder).normalize(),Math.max(strokeActivity,contactWeight)).normalize();
    const paddleNormal=v(0,0,1).addScaledVector(direction,-direction.z).normalize();
    if(paddleNormal.lengthSq()<.01)paddleNormal.set(1,0,0);
    const paddleX=new THREE.Vector3().crossVectors(direction,paddleNormal).normalize();
    paddleNormal.crossVectors(paddleX,direction).normalize();
    paddle.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(paddleX,direction,paddleNormal));paddle.position.copy(face);
    const wrist=face.clone().addScaledVector(direction,-.235);
    updateArm(d.handedness==='right'?arms.right:arms.left,shoulder,wrist,side);
    const supportShoulder=visual.worldToLocal(upper.localToWorld(v(-side*.258,1.325,0)));
    const supportWrist=action==='backhand'?wrist.clone().add(v(-side*.11,.015,-.025)):v(-side*.18,.98+upper.position.y,.34+travel*Math.cos(gait)*.04);
    updateArm(d.handedness==='right'?arms.left:arms.right,supportShoulder,supportWrist,-side);
    head.rotation.set(clamp((face.y-1.2)*-.13,-.12,.15),clamp(face.x*.24,-.22,.22),0);
    root.updateMatrixWorld(true);updateBodyBatch(d.bodyBatch,visual);d.paddleFaceWorld.copy(face).applyMatrix4(visual.matrixWorld);d.shoulderWorld.copy(shoulder).applyMatrix4(visual.matrixWorld);
    d.animation={...sample,frame:pose?`${pose.from}:${pose.to}`:action,poseProgress:pose?.progress??0,contactWeight,bodyYaw:visual.rotation.y,volumetric:true};
}

// The replay can switch renderers without changing its presentation contract.
export { AthleteResources as PixelActorResources, createAthlete as createPixelActor, updateAthlete as updatePixelActor };
