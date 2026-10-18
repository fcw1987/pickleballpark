// Original court-scale, soft sculpted athletes. Local +Z is forward; the player root
// is always the authored ground position. Every animated part has real depth.
import * as THREE from './vendor/three.module.min.js';
import { POSE_LIBRARY } from './three-d-animation.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Sculpted rounded cross sections, shaped at waist, ribs, cheeks and shoulders.
// Twelve shared contour points keep silhouettes soft without costly subdivision.
function tailoredVolume(rings) {
    const positions = [], indices = [];
    const sides=12, outline=Array.from({length:sides},(_,i)=>{
        const a=i*Math.PI*2/sides,x=Math.cos(a),z=Math.sin(a);
        return [Math.sign(x)*Math.abs(x)**.86,Math.sign(z)*Math.abs(z)**.86];
    });
    for (const [y, width, depth] of rings) for (const [x,z] of outline) positions.push(x*width/2,y,z*depth/2);
    for (let r=0;r<rings.length-1;r++) for(let i=0;i<sides;i++) {
        const a=r*sides+i,b=r*sides+(i+1)%sides,c=b+sides,d=a+sides;
        indices.push(a,d,b,b,d,c);
    }
    for(let i=1;i<sides-1;i++) { indices.push(0,i,i+1);const k=(rings.length-1)*sides;indices.push(k,k+i+1,k+i); }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    return geometry;
}

export class AthleteResources {
    constructor() { this.materials=new Map();this.geometries=new Set();this.extraMaterials=new Set();this.geometryCache=new Map(); }
    material(color) {
        if(!this.materials.has(color))this.materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.92,metalness:0,flatShading:false}));
        return this.materials.get(color);
    }
    geometry(geometry) {
        const cacheable=['BoxGeometry','CylinderGeometry','SphereGeometry','CircleGeometry'].includes(geometry.type);
        const key=cacheable?`${geometry.type}:${JSON.stringify(geometry.parameters)}`:geometry.userData.cacheKey;
        if(key&&this.geometryCache.has(key)){geometry.dispose();return this.geometryCache.get(key);}
        if(key)this.geometryCache.set(key,geometry);this.geometries.add(geometry);return geometry;
    }
    coloredMaterial() {
        if(!this.vertexMaterial){this.vertexMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0,flatShading:false});this.extraMaterials.add(this.vertexMaterial);}
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
    return mesh(r,new THREE.CylinderGeometry(top,bottom,length,8,1),color,name,parent);
}
function alignSegment(object,a,b,originalLength) {
    object.position.copy(a).add(b).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(UP,b.clone().sub(a).normalize());
    object.scale.y=a.distanceTo(b)/originalLength;
}
// Static cloth and face details share a draw call per articulated body part.
// Baked vertex colors retain shaped eyes and outfit graphics without textures.
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
    const positions=[],normals=[],colors=[],parts=[],drawIndices=[];
    for(const source of sources) {
        const geometry=source.geometry,p=geometry.attributes.position,n=geometry.attributes.normal,c=geometry.attributes.color,index=geometry.index,start=positions.length/3;
        const localPositions=[],localNormals=[],canonicalVertices=new Map();
        const keyFloats=new Float32Array(9),keyBits=new Uint32Array(keyFloats.buffer);
        for(let i=0;i<(index?index.count:p.count);i++) {
            const vertex=index?index.getX(i):i;
            localPositions.push(p.getX(vertex),p.getY(vertex),p.getZ(vertex));localNormals.push(n.getX(vertex),n.getY(vertex),n.getZ(vertex));
            const red=c?c.getX(vertex):source.material.color.r,green=c?c.getY(vertex):source.material.color.g,blue=c?c.getZ(vertex):source.material.color.b;
            colors.push(red,green,blue);
            // Reuse exact GPU attribute bits only inside this articulated part.
            // Keep expanded attributes and semantic start/count for rig auditing.
            keyFloats.set([p.getX(vertex),p.getY(vertex),p.getZ(vertex),n.getX(vertex),n.getY(vertex),n.getZ(vertex),red,green,blue]);
            const key=keyBits.join(',');let canonical=canonicalVertices.get(key);
            if(canonical===undefined){canonical=i;canonicalVertices.set(key,canonical);}
            drawIndices.push(start+canonical);
        }
        positions.push(...localPositions);normals.push(...localNormals);
        parts.push({source,start,count:localPositions.length/3,positions:new Float32Array(localPositions),normals:new Float32Array(localNormals),matrix:new THREE.Matrix4(),normalMatrix:new THREE.Matrix3()});source.visible=false;source.castShadow=false;
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setIndex(drawIndices);
    const batch=new THREE.Mesh(r.geometry(geometry),r.coloredMaterial());batch.name='AthleteBodyBatch';batch.frustumCulled=false;batch.castShadow=true;batch.receiveShadow=true;visual.add(batch);
    return {batch,parts,inverse:new THREE.Matrix4(),point:new THREE.Vector3(),normal:new THREE.Vector3()};
}
function updateBodyBatch(body,visual) {
    const position=body.batch.geometry.attributes.position,normal=body.batch.geometry.attributes.normal;
    const targetPosition=position.array,targetNormal=normal.array;
    body.inverse.copy(visual.matrixWorld).invert();
    for(const part of body.parts) {
        part.matrix.multiplyMatrices(body.inverse,part.source.matrixWorld);part.normalMatrix.getNormalMatrix(part.matrix);
        const m=part.matrix.elements,n=part.normalMatrix.elements,sourcePosition=part.positions,sourceNormal=part.normals;
        let target=part.start*3;
        // Match Vector3.applyMatrix4/applyNormalMatrix arithmetic while writing
        // directly into GPU attributes: no per-vertex object or accessor calls.
        for(let i=0;i<sourcePosition.length;i+=3,target+=3) {
            const x=sourcePosition[i],y=sourcePosition[i+1],z=sourcePosition[i+2];
            const w=1/(m[3]*x+m[7]*y+m[11]*z+m[15]);
            targetPosition[target]=(m[0]*x+m[4]*y+m[8]*z+m[12])*w;
            targetPosition[target+1]=(m[1]*x+m[5]*y+m[9]*z+m[13])*w;
            targetPosition[target+2]=(m[2]*x+m[6]*y+m[10]*z+m[14])*w;
            const sx=sourceNormal[i],sy=sourceNormal[i+1],sz=sourceNormal[i+2];
            const nx=n[0]*sx+n[3]*sy+n[6]*sz,ny=n[1]*sx+n[4]*sy+n[7]*sz,nz=n[2]*sx+n[5]*sy+n[8]*sz;
            const inverseLength=1/(Math.sqrt(nx*nx+ny*ny+nz*nz)||1);
            targetNormal[target]=nx*inverseLength;targetNormal[target+1]=ny*inverseLength;targetNormal[target+2]=nz*inverseLength;
        }
    }
    position.needsUpdate=true;normal.needsUpdate=true;
}
// Small shaped patches read as cloth panels, hair locks and soft facial features.
function patch(r,parent,name,color,points,depth=.008) {
    const shape=new THREE.Shape();shape.moveTo(...points[0]);
    for(const point of points.slice(1))shape.lineTo(...point);
    shape.closePath();
    return mesh(r,new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1}),color,name,parent);
}
// Facial markings follow the cheek curvature rather than protruding as spheres.
// Thin projected shapes keep whites visible at the corners of tapered human eyes.
function facePatch(r,parent,name,color,points,x,y,layer=0) {
    const shape=new THREE.Shape();shape.moveTo(...points[0]);
    for(const point of points.slice(1))shape.lineTo(...point);shape.closePath();
    const object=mesh(r,new THREE.ShapeGeometry(shape),color,name,parent),position=object.geometry.attributes.position;
    for(let i=0;i<position.count;i++) {
        const faceX=position.getX(i)+x;
        position.setZ(i,position.getZ(i)+.170-2.5*faceX*faceX+layer);
    }
    object.geometry.computeVertexNormals();object.position.set(x,y,0);return object;
}
function oval(r,parent,name,color,x,y,z,width,height,depth) {
    const object=mesh(r,new THREE.SphereGeometry(1,8,4),color,name,parent,x,y,z);
    object.scale.set(width,height,depth);return object;
}
function makeLeg(r,root,name,skin,cream,navy,accent) {
    const thigh=limb(r,root,`${name}Thigh`,skin,.066,.094,.39);
    const shorts=limb(r,root,`${name}Shorts`,navy,.108,.12,.27);
    const knee=oval(r,root,`${name}Knee`,skin,0,0,0,.074,.074,.073);
    const shin=limb(r,root,`${name}Shin`,skin,.045,.061,.34);
    const sock=limb(r,root,`${name}Sock`,cream,.048,.049,.105);
    const foot=new THREE.Group();foot.name=`${name}Foot`;root.add(foot);
    volume(r,foot,`${name}Sneaker`,cream,[[0,.115,.24],[.032,.137,.278],[.073,.131,.255],[.105,.102,.17],[.119,.081,.10]],0,0,.052);
    volume(r,foot,`${name}Sole`,'#d4ddd3',[[.009,.138,.281],[.036,.138,.281]],0,0,.052);
    for(const sign of [-1,1]) {
        const stripe=patch(r,foot,`${name}ShoeStripe`,accent,[[-.062,.048],[.028,.048],[.062,.08],[-.028,.08]],.007);
        stripe.rotation.y=sign*Math.PI/2;stripe.position.set(sign*.065,0,.07);
    }
    box(r,foot,`${name}Laces`,navy,[.052,.009,.047],[0,.107,.075]);
    return {thigh,shorts,knee,shin,sock,foot};
}
function makeArm(r,root,name,skin,jersey,cream) {
    const upper=limb(r,root,`${name}UpperArm`,skin,.057,.074,.29);
    const sleeve=volume(r,root,`${name}Sleeve`,jersey,[[-.098,.17,.18],[-.058,.235,.215],[.029,.194,.187],[.0725,.166,.166]]);
    const cuff=limb(r,root,`${name}Cuff`,cream,.084,.086,.023);
    const forearm=limb(r,root,`${name}Forearm`,skin,.039,.057,.27);
    const hand=oval(r,root,`${name}Hand`,skin,0,0,0,.042,.058,.034);
    // A thumb overlaps the palm and grip; it follows the existing wrist handle.
    const thumb=oval(r,hand,`${name}Thumb`,skin,.75,-.12,.48,.58,.55,.65);
    return {upper,sleeve,cuff,forearm,hand};
}

export function createAthlete(resources,team,handedness,variant=handedness==='left'?1:0) {
    const r=resources||new AthleteResources(),root=new THREE.Group();root.name=`Athlete-${team}-${handedness}`;
    const green=team==='team1'||team==='green',alternate=variant%2!==0;
    const colors={jersey:green?'#23866a':'#ed8549',light:green?'#95d4ad':'#ffd68a',dark:green?'#19654f':'#bd573d',cream:'#fff8e7',navy:'#344957',skin:alternate?'#bc805c':'#efbb96',hair:alternate?'#3e3030':'#70503c'};
    const visual=new THREE.Group();visual.name='AthleteOrientation';root.add(visual);
    const upper=new THREE.Group();upper.name='AthleteTorso';visual.add(upper);
    volume(r,upper,'TaperedJersey',colors.jersey,[[.875,.365,.245],[.94,.395,.265],[1.13,.43,.285],[1.29,.51,.29],[1.36,.53,.26],[1.405,.39,.21]]);
    volume(r,upper,'JerseyHem',colors.dark,[[.878,.37,.25],[.933,.395,.267]]);
    // Bold diagonal athletic color blocking, with an original court-line badge.
    const chest=patch(r,upper,'ChestColorBlock',colors.light,[[-.227,1.29],[.226,1.18],[.215,1.085],[-.218,1.195]],.009);chest.position.z=.146;
    for(const side of [-1,1]) {
        const panel=patch(r,upper,'SideJerseyPanel',colors.dark,[[0,.95],[.047,.96],[.056,1.19],[.016,1.25]].map(([x,y])=>[x*side,y]),.01);
        panel.position.set(side*.185,0,.115);
    }
    oval(r,upper,'ChestClubMark',colors.cream,-.115,1.312,.14,.036,.039,.01);
    const badge=patch(r,upper,'ChestMarkPixel',colors.dark,[[-.018,-.016],[.018,-.016],[.018,-.007],[-.009,-.007],[-.009,.017],[-.018,.017]],.005);badge.position.set(-.115,1.312,.154);
    for(const x of [-.052,.04]) {
        box(r,upper,'BackNumberTop',colors.cream,[.057,.022,.014],[x,1.27,-.151]);
        box(r,upper,'BackNumberStem',colors.cream,[.022,.108,.014],[x+.017,1.225,-.152]);
        box(r,upper,'BackNumberBase',colors.cream,[.057,.022,.014],[x,1.17,-.151]);
    }
    volume(r,upper,'ShortsWaist',colors.navy,[[.80,.38,.25],[.91,.40,.26]]);
    const neck=limb(r,upper,'Neck',colors.skin,.071,.082,.105);neck.position.set(0,1.424,0);
    // A .40-unit head makes a readable youthful 4.7-head silhouette. The neck,
    // shoulders and articulated arm solver retain their authored contact anchors.
    const head=new THREE.Group();head.name='Head';head.position.set(0,1.455,0);upper.add(head);
    volume(r,head,'FacetedFace',colors.skin,[[0,.15,.16],[.038,.24,.235],[.098,.316,.285],[.195,.351,.309],[.285,.334,.299],[.343,.268,.25],[.365,.18,.18]],0,0,.012);
    for(const side of [-1,1]) {
        oval(r,head,'Ear',colors.skin,side*.175,.186,.002,.035,.053,.033);
        oval(r,head,'EarInner',alternate?'#a56c53':'#db9a7c',side*.196,.184,.016,.008,.026,.014);
        const eyeX=side*.074,irisX=eyeX-.004,expression=alternate?-.002:.001;
        const almond=[[-.052,0],[-.032,.021],[.004,.026],[.034,.018],[.052,.001],[.029,-.018],[-.009,-.021],[-.035,-.012]];
        facePatch(r,head,'EyeWhite',colors.cream,almond.map(([x,y])=>[x*side,y]),eyeX,.230);
        facePatch(r,head,'Eye',green?'#427263':'#79604a',[[0,.023],[.016,.018],[.023,.006],[.020,-.013],[.008,-.020],[-.009,-.020],[-.021,-.011],[-.022,.007],[-.015,.020]],irisX,.231,.002);
        facePatch(r,head,'Pupil','#302b2d',[[-.010,.019],[.009,.019],[.012,.007],[.010,-.013],[0,-.017],[-.011,-.010]],irisX,.231,.004);
        facePatch(r,head,'EyeHighlight','#ffffff',[[-.003,0],[0,.004],[.003,.002],[.002,-.004],[-.003,-.003]],irisX-.006,.241,.006);
        const lid=[[-.054,.001],[-.034,.025],[.004,.031],[.036,.023],[.055,.001],[.049,.001],[.031,.017],[.002,.024],[-.031,.019],[-.049,-.001]];
        facePatch(r,head,'UpperEyelid',colors.hair,lid.map(([x,y])=>[x*side,y]),eyeX,.230,.007);
        facePatch(r,head,'Eyebrow',colors.hair,[[-.044,0],[-.017,.009],[.026,.006],[.040,-.002],[.027,-.004],[-.016,.003],[-.043,-.005]].map(([x,y])=>[x*side,y]),eyeX,.283+expression*side,.003);
    }
    oval(r,head,'Nose',colors.skin,0,.172,.174,.024,.033,.026);
    const mouth=patch(r,head,'Mouth','#975c50',[[-.036,.003],[-.015,-.007],[.014,-.007],[.036,.006],[.022,.001],[-.014,-.001]],.004);mouth.position.set(0,.092,.157);
    // Hair is a fitted sculpted crown and shaped fringe, with no franchise motifs.
    volume(r,head,'Hair',colors.hair,[[.253,.348,.303],[.321,.354,.31],[.385,.285,.253],[.414,.15,.15]],0,0,-.022);
    for(const side of [-1,1]) {
        const lock=patch(r,head,'SideHair',colors.hair,[[0,.20],[.037,.16],[.053,.28],[.015,.33]].map(([x,y])=>[x*side,y]),.054);
        lock.position.set(side*.142,0,-.045);
    }
    if(!alternate) {
        volume(r,head,'ClubCap',colors.jersey,[[.321,.368,.329],[.383,.326,.295],[.422,.204,.20],[.432,.11,.11]],0,0,-.014);
        volume(r,head,'CapBrim',colors.cream,[[0,.312,.198],[.018,.32,.205],[.026,.29,.175]],0,.321,.158);
        const seam=patch(r,head,'CapPanel',colors.light,[[-.027,.337],[.027,.337],[.025,.414],[-.025,.414]],.006);seam.position.z=.147;
        const fringe=patch(r,head,'HairFringe',colors.hair,[[-.12,.315],[-.07,.263],[-.035,.307],[.018,.266],[.054,.324]],.035);fringe.position.z=.132;
    } else {
        volume(r,head,'Headband',colors.cream,[[.289,.361,.316],[.325,.361,.316]],0,0,-.014);
        if(green) {
            volume(r,head,'Visor',colors.jersey,[[0,.354,.228],[.023,.36,.236]],0,.29,.165);
            const pony=volume(r,head,'ShortPonytail',colors.hair,[[-.11,.072,.07],[-.025,.12,.10],[.085,.148,.13],[.16,.089,.08]],0,.212,-.211);pony.rotation.x=-.43;
            oval(r,head,'HairTie',colors.light,0,.313,-.177,.068,.035,.045);
        }
        const fringe=patch(r,head,'HairSweep',colors.hair,[[-.17,.332],[-.136,.267],[-.095,.31],[-.047,.279],[.016,.323],[.081,.286],[.135,.33],[.067,.39],[-.078,.389]],.055);fringe.position.z=.123;
        const crown=patch(r,head,'HairSweepCrown',colors.hair,[[-.155,.354],[-.183,.412],[-.096,.401],[-.111,.452],[-.033,.423],[.023,.438],[.099,.396],[.143,.352]],.145);crown.position.z=-.093;
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
    root.userData={team,handedness,variant,groundY:0,volumetricAthlete:true,pixelActor:false,visual,upper,head,legs,arms,paddle,shadow,bodyBatch,resources:r,paddleFaceWorld:new THREE.Vector3(),shoulderWorld:new THREE.Vector3(),height:1.89,animation:{}};
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
    // In this rig +X pitch tips the chest toward local +Z (the net). The
    // renderer-independent pose library uses the opposite pitch convention.
    upper.rotation.set(.06-blendChannel(pose,'Torso','rotation','x')*.65,blendChannel(pose,'Torso','rotation','y')*(-side)*1.25,blendChannel(pose,'Torso','rotation','z')*(-side));
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
