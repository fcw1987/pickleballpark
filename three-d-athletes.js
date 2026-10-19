// Original court-scale, soft sculpted athletes. Local +Z is forward; the player root
// is always the authored ground position. Every animated part has real depth.
import * as THREE from './vendor/three.module.min.js';
import { POSE_LIBRARY, sampleStrokePose } from './three-d-animation.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Sculpted rounded cross sections, shaped at waist, ribs, cheeks and shoulders.
// Twelve shared contour points keep silhouettes soft without costly subdivision.
function tailoredVolume(rings,openEnds=false) {
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
    if(!openEnds)for(let i=1;i<sides-1;i++) { indices.push(0,i,i+1);const k=(rings.length-1)*sides;indices.push(k,k+i+1,k+i); }
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
function volume(r,parent,name,color,rings,x=0,y=0,z=0,openEnds=false) { const geometry=tailoredVolume(rings,openEnds);geometry.userData.cacheKey=`tailored:${openEnds}:${JSON.stringify(rings)}`;return mesh(r,geometry,color,name,parent,x,y,z); }
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
    const sources=[];visual.traverse(object=>{if(object.isMesh&&object.name!=='PaddleFace'&&!object.userData.renderHandleOnly)sources.push(object);});
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
const LEG_RING_CIRCLE=Array.from({length:8},(_,side)=>[Math.cos(side*Math.PI/4),Math.sin(side*Math.PI/4)]);
// One swept skin surface follows the existing leg anchors. Shared rings avoid
// overlapping knee caps; the old thigh/knee/shin objects remain audit handles.
function makeLegSkin(r,root,name,skin) {
    const rings=7,sides=8,indices=[];
    for(let ring=0;ring<rings-1;ring++)for(let side=0;side<sides;side++) {
        const a=ring*sides+side,b=ring*sides+(side+1)%sides,c=b+sides,d=a+sides;
        indices.push(a,b,d,b,c,d);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(indices.length*3),3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(indices.length*3),3));
    const object=mesh(r,geometry,skin,`${name}LegSkin`,root);
    object.userData.sweep={indices,centers:Array.from({length:rings},()=>new THREE.Vector3()),radii:[.094,.073,.068,.065,.063,.061,.045],points:new Float32Array(rings*sides*3),normals:new Float32Array(rings*sides*3),tangent:new THREE.Vector3(),axisX:new THREE.Vector3(),axisZ:new THREE.Vector3(),cornerA:new THREE.Vector3(),cornerB:new THREE.Vector3()};
    return object;
}
function updateLegSkin(object,hip,knee,ankle) {
    const d=object.userData.sweep,{centers,radii,tangent,axisX,axisZ,cornerA,cornerB}=d;
    centers[0].copy(hip);centers[6].copy(ankle);
    cornerA.copy(hip).lerp(knee,.8);cornerB.copy(knee).lerp(ankle,.2);
    for(let ring=1;ring<=5;ring++) {
        const t=(ring-1)/4,u=1-t;
        centers[ring].copy(cornerA).multiplyScalar(u*u).addScaledVector(knee,2*u*t).addScaledVector(cornerB,t*t);
    }
    for(let ring=0;ring<7;ring++) {
        const previous=Math.max(0,ring-1),next=Math.min(6,ring+1);
        tangent.subVectors(centers[next],centers[previous]).normalize();
        axisX.set(1,0,0).addScaledVector(tangent,-tangent.x).normalize();axisZ.crossVectors(tangent,axisX).normalize();
        const slope=(radii[next]-radii[previous])/Math.max(.001,centers[next].distanceTo(centers[previous]));
        for(let side=0;side<8;side++) {
            const c=LEG_RING_CIRCLE[side][0],s=LEG_RING_CIRCLE[side][1],offset=(ring*8+side)*3;
            const x=axisX.x*c+axisZ.x*s,y=axisX.y*c+axisZ.y*s,z=axisX.z*c+axisZ.z*s;
            d.points[offset]=centers[ring].x+x*radii[ring];d.points[offset+1]=centers[ring].y+y*radii[ring];d.points[offset+2]=centers[ring].z+z*radii[ring];
            const nx=x-tangent.x*slope,ny=y-tangent.y*slope,nz=z-tangent.z*slope,scale=1/Math.sqrt(nx*nx+ny*ny+nz*nz);
            d.normals[offset]=nx*scale;d.normals[offset+1]=ny*scale;d.normals[offset+2]=nz*scale;
        }
    }
    const p=object.geometry.attributes.position.array,n=object.geometry.attributes.normal.array;
    for(let i=0;i<d.indices.length;i++) {
        const source=d.indices[i]*3,target=i*3;
        p[target]=d.points[source];p[target+1]=d.points[source+1];p[target+2]=d.points[source+2];
        n[target]=d.normals[source];n[target+1]=d.normals[source+1];n[target+2]=d.normals[source+2];
    }
    // The expanded batch and source geometry stay identical for dimensional QA.
    if(d.batchPart){d.batchPart.positions.set(p);d.batchPart.normals.set(n);}
}
function makeLeg(r,root,name,skin,cream,navy,accent) {
    const thigh=limb(r,root,`${name}Thigh`,skin,.066,.094,.39);
    const shorts=limb(r,root,`${name}Shorts`,navy,.108,.12,.27);
    const knee=oval(r,root,`${name}Knee`,skin,0,0,0,.074,.074,.073);
    const shin=limb(r,root,`${name}Shin`,skin,.045,.061,.34);
    for(const handle of [thigh,knee,shin]){handle.visible=false;handle.userData.renderHandleOnly=true;}
    const legSkin=makeLegSkin(r,root,name,skin),side=name==='Left'?1:-1;
    updateLegSkin(legSkin,v(side*.13,.875,0),v(side*.205,.48,.185),v(side*.218,.095,.015));
    const sock=limb(r,root,`${name}Sock`,cream,.048,.049,.105);
    const foot=new THREE.Group();foot.name=`${name}Foot`;root.add(foot);
    volume(r,foot,`${name}Sneaker`,cream,[[0,.115,.24],[.032,.137,.278],[.073,.131,.255],[.105,.102,.17],[.119,.081,.10]],0,0,.052);
    volume(r,foot,`${name}Sole`,'#d4ddd3',[[.009,.138,.281],[.036,.138,.281]],0,0,.052);
    for(const sign of [-1,1]) {
        const stripe=patch(r,foot,`${name}ShoeStripe`,accent,[[-.062,.048],[.028,.048],[.062,.08],[-.028,.08]],.007);
        stripe.rotation.y=sign*Math.PI/2;stripe.position.set(sign*.065,0,.07);
    }
    box(r,foot,`${name}Laces`,navy,[.052,.009,.047],[0,.107,.075]);
    return {thigh,shorts,knee,shin,sock,foot,legSkin};
}
function makeArm(r,root,name,skin,jersey,cream) {
    // Proximal skin stays under the sleeve rather than capping the shoulder.
    const upper=mesh(r,new THREE.CylinderGeometry(.057,.066,.173,8,1).translate(0,.0585,0),skin,`${name}UpperArm`,root);
    const sleeve=volume(r,root,`${name}Sleeve`,jersey,[[-.0725,.107,.143],[-.037,.180,.182],[.027,.178,.175],[.0725,.160,.160]],0,0,0,true);
    const cuff=limb(r,root,`${name}Cuff`,cream,.079,.081,.023);
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
    volume(r,upper,'TaperedJersey',colors.jersey,[[.875,.365,.245],[.94,.395,.265],[1.13,.43,.285],[1.29,.51,.29],[1.33,.558,.282],[1.36,.53,.26],[1.405,.39,.21]]);
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
    for(const leg of Object.values(legs))leg.legSkin.userData.sweep.batchPart=bodyBatch.parts.find(part=>part.source===leg.legSkin);
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
function strokeFamily(sample) {
    // Visual compatibility for schema-valid overhead/short-hop documents. The
    // profile still supplies the original event timing and contact ratio.
    if(sample.instructionalFamily==='overhead')return 'overhead';
    const type=sample.shotType;
    if(['lob','overhead','serve','drive','drop','dink','volley','block','reset','short-hop'].includes(type))return type;
    return sample.action||'ready';
}
function paddleKey(phase,family,side,target,back) {
    if(phase==='ready')return v(side*.17,1.105,.43);
    const compact=['block','volley','reset'].includes(family),soft=['drop','dink','short-hop'].includes(family);
    const sign=back?-side:side;
    if(phase==='prepare'){
        if(compact)return v(sign*.22,Math.max(.85,target.y+.04),.30);
        if(family==='overhead')return v(sign*.34,1.80,-.12);
        if(family==='lob')return v(sign*.40,Math.max(.45,target.y-.18),.08);
        if(soft)return v(sign*.36,Math.max(.48,target.y-.06),.12);
        if(family==='serve')return v(sign*.43,.64,-.12);
        return v(sign*(back?.39:.51),Math.max(.72,Math.min(1.08,target.y+.14)),back?.04:-.13);
    }
    if(phase==='contact')return target.clone();
    if(compact)return target.clone().add(v(-sign*.035,.055,family==='volley'?.12:.065));
    if(family==='overhead')return v(-sign*.35,1.02,.47);
    if(family==='lob')return v(sign*.17,1.70,.48);
    if(soft)return target.clone().add(v(-sign*.10,.25,.18));
    return v(-sign*.40,family==='serve'?1.29:1.43,.42);
}
// Cubic Hermite interpolation uses one shared velocity at contact. The paddle
// accelerates through the ball rather than easing to a stop at every phase key.
function strokeFace(sample,family,side,target,back) {
    const p=sample.profile,t=sample.strokeTime;
    if(!p||t===null||t===undefined)return paddleKey('ready',family,side,target,back);
    const times=[0,p.duration*p.prepareRatio,p.duration*p.contactRatio,p.duration*p.recoverRatio,p.duration];
    const keys=['ready','prepare','contact','follow','ready'].map(phase=>paddleKey(phase,family,side,target,back));
    let index=0;while(index<3&&t>times[index+1])index++;
    const duration=times[index+1]-times[index],u=clamp((t-times[index])/duration),u2=u*u,u3=u2*u;
    const tangent=i=>i===0||i===4?v():keys[i+1].clone().sub(keys[i-1]).multiplyScalar(1/(times[i+1]-times[i-1]));
    return keys[index].clone().multiplyScalar(2*u3-3*u2+1)
        .addScaledVector(tangent(index),duration*(u3-2*u2+u))
        .addScaledVector(keys[index+1],-2*u3+3*u2)
        .addScaledVector(tangent(index+1),duration*(u3-u2));
}
function elbowPoint(shoulder,wrist,side) {
    const delta=wrist.clone().sub(shoulder),distance=Math.max(.001,delta.length()),axis=delta.clone().normalize();
    const upper=.29,lower=.285,reach=clamp(distance,Math.abs(upper-lower)+.001,upper+lower-.002);
    const along=(upper*upper-lower*lower+reach*reach)/(2*reach),height=Math.sqrt(Math.max(.0002,upper*upper-along*along));
    const bend=v(side*.55,-.85,-.18);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
    return shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,height);
}
function updateArm(arm,shoulder,wrist,side) {
    const elbow=elbowPoint(shoulder,wrist,side);
    alignSegment(arm.upper,shoulder,elbow,.29);alignSegment(arm.forearm,elbow,wrist,.27);
    const sleeveEnd=shoulder.clone().lerp(elbow,.48),cuffStart=shoulder.clone().lerp(elbow,.44);
    // Only the cloth root moves inward; anatomical and contact anchors stay fixed.
    const sleeveStart=shoulder.clone();sleeveStart.x*=.74;
    alignSegment(arm.sleeve,sleeveStart,sleeveEnd,.145);alignSegment(arm.cuff,cuffStart,sleeveEnd,.023);
    arm.hand.position.copy(wrist);arm.hand.quaternion.copy(arm.forearm.quaternion);
}

export function updateAthlete(root,sample,camera,contactWeight=0) {
    const d=root.userData,{visual,upper,head,legs,arms,paddle}=d,side=d.handedness==='right'?-1:1;
    root.position.set(sample.worldPosition.x,0,sample.worldPosition.z);
    const facing=sample.bodyFacing||{x:0,z:d.team==='team1'?1:-1};visual.rotation.y=Math.atan2(facing.x,facing.z);
    const action=sample.action||'ready',phase=sample.phase||'ready',family=strokeFamily(sample);
    const back=sample.strokeSide==='backhand'||family==='backhand';
    const compact=['block','volley','reset'].includes(family),soft=['drop','dink','short-hop'].includes(family);
    const poseFamily=compact?'block':soft?'drop':family;
    const pose=sample.strokePose&&sample.profile?sampleStrokePose(poseFamily,sample.profile,sample.strokeTime):sample.strokePose;
    const strokeActivity=pose?(pose.from==='ready'?smooth(pose.progress):pose.to==='ready'?1-smooth(pose.progress):1):0;
    // Locomotion continues during preparation, then ends when the route settles.
    const travel=clamp((sample.travelSpeed??(action==='shuffle'?1.2:0))/1.9),clock=sample.timeSeconds||0;
    const gait=sample.travelPhase??clock*9,stance=(sample.splitStep||0)*.025;
    let bodyDrop=blendChannel(pose,'Hips','position','y')-.048-stance-(compact?.012:.025)*strokeActivity;
    const contactHeight=sample.paddle?.worldContactTarget?.y;
    if(Number.isFinite(contactHeight)){
        const lowLoad=Math.min(0,contactHeight+.69-1.325);
        bodyDrop=Math.min(bodyDrop,-.048+lowLoad*strokeActivity);
        if(family==='overhead')bodyDrop+=.14*strokeActivity;
    }
    const mirror=back&&poseFamily!=='backhand'?-1:1;
    const weightShift=side*mirror*blendChannel(pose,'Hips','rotation','y')*.14;
    // Rotate around the pelvis, not the ground origin. This keeps the head and
    // shoulders over the support base while the torso coils above planted feet.
    upper.rotation.set(.055-blendChannel(pose,'Torso','rotation','x')*.55,
        blendChannel(pose,'Torso','rotation','y')*(-side)*mirror,blendChannel(pose,'Torso','rotation','z')*(-side));
    const pivot=v(0,.88,0),rotatedPivot=pivot.clone().applyEuler(upper.rotation);
    upper.position.copy(pivot).sub(rotatedPivot).add(v(weightShift,bodyDrop,blendChannel(pose,'Hips','position','z')));
    upper.updateMatrixWorld(true);visual.updateMatrixWorld(true);
    for(const [name,s] of [['left',1],['right',-1]]) {
        const leg=legs[name],swing=Math.sin(gait+(s===1?0:Math.PI))*travel;
        const footTarget=sample.footTargets?.[name];
        const ankle=footTarget?visual.worldToLocal(v(footTarget.x,footTarget.y,footTarget.z)):
            v(s*(.23+stance),Math.max(0,swing)*.075,swing*.19+.015);
        const hip=visual.worldToLocal(upper.localToWorld(v(s*.13,.875,0)));
        const shinEnd=ankle.clone().add(v(0,.095,0));
        const legAxis=shinEnd.clone().sub(hip),legDistance=Math.max(.001,legAxis.length());legAxis.divideScalar(legDistance);
        const thighLength=.445,shinLength=.425,reach=clamp(legDistance,.021,thighLength+shinLength-.001);
        const along=(thighLength*thighLength-shinLength*shinLength+reach*reach)/(2*reach);
        const kneeBend=v(0,0,1).addScaledVector(legAxis,-legAxis.z).normalize();
        const knee=hip.clone().addScaledVector(legAxis,along).addScaledVector(kneeBend,Math.sqrt(Math.max(0,thighLength*thighLength-along*along)));
        alignSegment(leg.thigh,hip,knee,.39);alignSegment(leg.shorts,hip,hip.clone().lerp(knee,.66),.27);leg.knee.position.copy(knee);
        alignSegment(leg.shin,knee,shinEnd,.34);updateLegSkin(leg.legSkin,hip,knee,shinEnd);
        alignSegment(leg.sock,ankle.clone().add(v(0,.07,0)),ankle.clone().add(v(0,.175,0)),.105);
        leg.foot.position.copy(ankle);
        // Shoes retain court-facing orientation while the torso tracks the shot.
        const courtYaw=sample.footTargets?(sample.worldPosition.z<0?0:Math.PI)-visual.rotation.y:0;
        leg.foot.rotation.set(0,courtYaw+s*.08,0);
    }
    const contact=sample.paddle?.worldContactTarget;
    const target=contact?visual.worldToLocal(v(contact.x,contact.y,contact.z)):v(side*.36,.8,.37);
    let face=pose?strokeFace(sample,family,side,target,back):v(side*.17,1.105+bodyDrop,.43);
    // Contact is already a curve key; this correction is only for legacy callers
    // with a target but no sampled stroke. Never alter the authoritative ball.
    if(contact&&contactWeight>0&&!pose)face.lerp(target,contactWeight);
    const shoulder=visual.worldToLocal(upper.localToWorld(v(side*.258,1.325,0)));
    let radial=face.clone().sub(shoulder).normalize();
    const lobFinish=sample.profile?clamp((sample.strokeTime/sample.profile.duration-sample.profile.contactRatio)/(sample.profile.recoverRatio-sample.profile.contactRatio)):0;
    const authoredOpen=family==='lob'?.64-.48*smooth(lobFinish):soft?.28:family==='serve'?.13:compact?.07:.045;
    const open=.045+(authoredOpen-.045)*strokeActivity;
    const paddleNormal=v(side*.08,open,1).normalize();
    let direction=v(0,1,0).lerp(radial,(compact?.22:family==='lob'?.32:.68)*strokeActivity).normalize();
    direction.addScaledVector(paddleNormal,-direction.dot(paddleNormal)).normalize();
    const maxReach=.573,grip=.235;
    // Keep the wrist inside the fixed two-segment arm envelope. A low paddle
    // tip can point below its grip; forcing the long axis upward stretches the
    // forearm. Solve the permitted angle in the paddle plane continuously.
    let delta=face.clone().sub(shoulder),normalDistance=delta.dot(paddleNormal);
    let planar=delta.clone().addScaledVector(paddleNormal,-normalDistance);
    const planarLength=planar.length();
    if(normalDistance*normalDistance+(planarLength-grip)**2>maxReach*maxReach){
        let low=0,high=1;
        for(let i=0;i<12;i++){
            const middle=(low+high)/2;
            if((normalDistance*middle)**2+(planarLength*middle-grip)**2<=maxReach*maxReach)low=middle;else high=middle;
        }
        face.copy(shoulder).addScaledVector(delta,low);
    }
    delta=face.clone().sub(shoulder);normalDistance=delta.dot(paddleNormal);
    planar=delta.clone().addScaledVector(paddleNormal,-normalDistance);
    if(planar.lengthSq()>1e-10){
        const optimal=planar.clone().normalize();
        const needed=(delta.lengthSq()+grip*grip-maxReach*maxReach)/(2*grip);
        if(direction.dot(delta)<needed){
            const angle=Math.acos(clamp(needed/planar.length(),-1,1));
            const signed=Math.atan2(paddleNormal.dot(new THREE.Vector3().crossVectors(optimal,direction)),optimal.dot(direction));
            const allowed=clamp(signed,-angle,angle);
            direction.copy(optimal).multiplyScalar(Math.cos(allowed))
                .addScaledVector(new THREE.Vector3().crossVectors(paddleNormal,optimal),Math.sin(allowed)).normalize();
        }
    }
    const paddleX=new THREE.Vector3().crossVectors(direction,paddleNormal).normalize();
    paddleNormal.crossVectors(paddleX,direction).normalize();
    paddle.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(paddleX,direction,paddleNormal));paddle.position.copy(face);
    const wrist=face.clone().addScaledVector(direction,-.235);
    updateArm(d.handedness==='right'?arms.right:arms.left,shoulder,wrist,side);
    const supportShoulder=visual.worldToLocal(upper.localToWorld(v(-side*.258,1.325,0)));
    // A single-handed backhand keeps the free hand clear as a counterbalance.
    // There is no floating second hand masquerading as a two-handed grip.
    const supportWrist=visual.worldToLocal(upper.localToWorld(v(-side*(.23+(back?.13*strokeActivity:0)),1.02,.28-(back?.20*strokeActivity:0))));
    updateArm(d.handedness==='right'?arms.left:arms.right,supportShoulder,supportWrist,-side);
    head.rotation.set(clamp((face.y-1.2)*-.15,-.14,.15),clamp(face.x*.20,-.20,.20),0);
    root.updateMatrixWorld(true);updateBodyBatch(d.bodyBatch,visual);d.paddleFaceWorld.copy(face).applyMatrix4(visual.matrixWorld);d.shoulderWorld.copy(shoulder).applyMatrix4(visual.matrixWorld);
    d.animation={...sample,frame:pose?`${pose.from}:${pose.to}`:action,poseProgress:pose?.progress??0,contactWeight,bodyYaw:visual.rotation.y,volumetric:true,
        strokeFamily:family,backhand:back,wristReach:shoulder.distanceTo(wrist),paddleFaceNormal:paddleNormal.toArray(),
        supportFeet:Object.fromEntries(Object.entries(legs).map(([name,leg])=>[name,leg.foot.getWorldPosition(new THREE.Vector3()).toArray()]))};
}

// The replay can switch renderers without changing its presentation contract.
export { AthleteResources as PixelActorResources, createAthlete as createPixelActor, updateAthlete as updatePixelActor };
