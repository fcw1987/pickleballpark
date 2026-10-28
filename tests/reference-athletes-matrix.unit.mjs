import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.min.js';
import {ReferenceAthleteResources,createReferenceAthlete,updateReferenceAthlete} from '../reference-athletes.js';
import {compileEffectiveCandidate} from '../rally-proposals.js';
import {sampleActorPresentation,VIEW_DIRECTIONS} from '../three-d-presentation.js';
import {referenceAthleteGeometryKernel,readReferenceAtlasPixels} from './helpers/reference-athlete-geometry.mjs';
import {assertReferenceRig as assertRig} from './helpers/reference-rig-assertions.mjs';
import {pixelAuthoringCases,pixelTacticalBoundaryCases} from './fixtures/pixel-authoring-cases.mjs';

const atlasPixels=await readReferenceAtlasPixels(new URL('../assets/source/reference-athletes/athletes-armless-v2.png',import.meta.url)),paintedAudit=referenceAthleteGeometryKernel(THREE);
const metadata=JSON.parse(readFileSync(new URL('../assets/reference-athletes/metadata-v2.json',import.meta.url)));
// The production renderer's geometry, matrices, atlas dimensions and materials;
// texture decoding/WebGL rasterization are covered by the browser suite.
function resources(){return new ReferenceAthleteResources({metadata,image:{width:atlasPixels.width,height:atlasPixels.height}});}
function cameraAt(index){const angle=index*Math.PI/4,camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(Math.sin(angle)*12,5+index*.3,Math.cos(angle)*12);camera.lookAt(0,.8,0);camera.updateMatrixWorld(true);return camera;}

test('detailed renderer: all 80 supported combinations and 18 tactical boundaries meet real contact through every camera sector with grounded strokes, bounded overhead jumps and fixed arm bones',()=>{
 const r=resources();let contacts=0;
 try{for(const item of [...pixelAuthoringCases(),...pixelTacticalBoundaryCases()]){
  const before=JSON.stringify(item.document),{timeline}=compileEffectiveCandidate(item.document),segment=timeline.segments.find(s=>s.shotSemantics);
  assert.ok(segment,item.id);const actor=createReferenceAthlete(r,'team1',item.handedness);
  for(let i=0;i<VIEW_DIRECTIONS.length;i++){
   const camera=cameraAt(i),sampleAt=offset=>sampleActorPresentation({instructionalMovement:true,segment,timeline,playerId:segment.shotSemantics.playerId,localTime:segment.contactTime+offset,handedness:item.handedness,cameraPosition:camera.position});
   const contact=sampleAt(0);updateReferenceAthlete(actor,contact,camera,1);assertRig(actor,item.id,camera);
   const target=new THREE.Vector3(...['x','y','z'].map(k=>segment.trajectory.start[k]));
   assert.ok(actor.userData.paddleFaceWorld.distanceTo(target)<1e-7,`${item.id}/${i}: actual paddle misses ball`);contacts++;
   assert.equal(actor.userData.animation.backhand,segment.shotSemantics.strokeSide==='backhand',`${item.id}: stroke side`);
   assert.equal(actor.userData.animation.family,item.contactStyle==='short-hop'&&!['serve','overhead'].includes(item.family)?'short-hop':item.family,`${item.id}: family`);
   const soles=()=>{const d=actor.userData,base=d.baseVertices,pos=d.body.geometry.attributes.position;return Array.from({length:pos.count},(_,n)=>n).filter(n=>base[n*3+1]===-.5).map(n=>new THREE.Vector3().fromBufferAttribute(pos,n).applyMatrix4(d.body.matrixWorld));};
   const feet=soles();assert.ok(feet.length>0);
   const painted=paintedAudit(actor,{pixels:atlasPixels,camera,viewportHeight:688});
   assert.ok(painted.paddleDistance(target)<=.037+1e-8,`${item.id}/${i}: physical ball must overlap actual paddle triangles`);
   for(const y of painted.shoeBottoms)assert.ok(Math.abs(y-actor.userData.animation.jumpHeight)<1e-8,`${item.id}/${i}: painted shoes match the actual deterministic jump height`);
   for(const points of painted.projectedSoleGroundOffsets)for(const p of points)assert.ok(Math.abs(p.worldY-actor.userData.animation.jumpHeight)<1e-8,`${item.id}/${i}: painted sole height follows actual root jump`);
   const vertices=Array.from(actor.userData.body.geometry.attributes.position.array);
   updateReferenceAthlete(actor,contact,camera,1);assert.deepEqual(Array.from(actor.userData.body.geometry.attributes.position.array),vertices,`${item.id}: repeat seek`);
   for(const offset of [-.03,.03]){const sample=sampleAt(offset);assert.equal(sample.planted,true,`${item.id}: contact window must stay planted`);updateReferenceAthlete(actor,sample,camera,.9);assertRig(actor,item.id,camera);soles().forEach((p,n)=>{assert.ok(Math.hypot(p.x-feet[n].x,p.z-feet[n].z)<1e-7,`${item.id}: planted sole XZ moved`);assert.ok(Math.abs((p.y-feet[n].y)-(actor.userData.animation.jumpHeight-(item.family==='overhead'?.4:0)))<1e-7,`${item.id}: sole height must match the jump, not a detached shoe`);});}
   // Exercise every key and interpolation of the production renderer's stroke clock.
   const keys=[];
   for(const phase of [0,.45,.5,1,1.5,2,2.5,3]){
    const profile=contact.profile,c=profile.contactRatio,f=profile.recoverRatio;
    const ratio=phase<=1?phase*c:phase<=2?c+(phase-1)*(f-c):f+(phase-2)*(1-f);
    updateReferenceAthlete(actor,{...contact,strokeTime:ratio*profile.duration},camera,0);assertRig(actor,`${item.id}/${phase}`,camera);
    if([.45,1,2,3].includes(phase))keys.push(actor.userData.paddleFaceWorld.toArray().map(n=>n.toFixed(7)).join(','));
   }
   assert.equal(new Set(keys).size,4,`${item.id}/${i}: prepare/contact/follow/recover must have distinct visible paddle positions`);
  }
  assert.equal(JSON.stringify(item.document),before,`${item.id}: source document changed`);
 }}finally{r.dispose();}
 assert.equal(contacts,784);
});

test('detailed forehand and backhand preparation and follow-through remain visibly distinct for both hands and all camera sectors',()=>{
 const r=resources(),cases=pixelAuthoringCases();let comparisons=0;
 try{for(const item of cases.filter(c=>c.contactStyle==='forehand')){
  const back=cases.find(c=>c.family===item.family&&c.handedness===item.handedness&&c.serveMethod===item.serveMethod&&c.contactStyle==='backhand');
  const actors=[item,back].map(()=>createReferenceAthlete(r,'team1',item.handedness));
  for(let i=0;i<8;i++)for(const phase of [.45,2]){
   const camera=cameraAt(i),points=[item,back].map((c,n)=>{
    const {timeline}=compileEffectiveCandidate(c.document),segment=timeline.segments.find(s=>s.shotSemantics);
    const sample=sampleActorPresentation({instructionalMovement:true,segment,timeline,playerId:segment.shotSemantics.playerId,localTime:segment.contactTime,handedness:c.handedness,cameraPosition:camera.position});
    const ratio=phase<1?phase*sample.profile.contactRatio:sample.profile.recoverRatio;
    updateReferenceAthlete(actors[n],{...sample,strokeTime:ratio*sample.profile.duration},camera,0);
    assertRig(actors[n],c.id,camera);
    // Compare choreography relative to its own actor: authored sides also have
    // different contact plants, which must not supply a false visible difference.
    return actors[n].userData.paddle.position.clone();
   });
   assert.ok(points[0].distanceTo(points[1])>.1,`${item.id}/${i}/${phase}: collapsed forehand/backhand choreography`);comparisons++;
  }
 }}finally{r.dispose();}
 assert.equal(comparisons,320);
});


test('reference resources dispose owned GPU objects exactly once and release collections while preserving shared source assets',()=>{
 const r=resources(),source=r.assets,actor=createReferenceAthlete(r,'team1','right');r.texture(0,0);
 const counts=new Map();for(const object of [...r.textures.values(),...r.materials,...r.geometries]){const original=object.dispose.bind(object);counts.set(object,0);object.dispose=()=>{counts.set(object,counts.get(object)+1);original();};}
 assert.ok(actor.userData.body&&counts.size>10);r.dispose();r.dispose();
 assert.ok([...counts.values()].every(n=>n===1));assert.equal(r.textures.size,0);assert.equal(r.materials.size,0);assert.equal(r.geometries.size,0);assert.equal(r.assets,source);assert.equal(r.disposed,true);assert.throws(()=>r.texture(0,0),/disposed/);
});

test('actual alpha shoes keep a stance foot through travel at every camera sector and allowed elevation',()=>{
 const r=resources();let samples=0,lifted=0;
 try{for(const handedness of ['left','right'])for(const player of [0,1,2,3]){
  const actor=createReferenceAthlete(r,player<2?'team1':'team2',handedness,player%2);
  for(let sector=0;sector<8;sector++)for(const elevation of [20,38,55,75])for(const distance of [7,17,55]){
   const camera=new THREE.PerspectiveCamera(38,1,.1,100),azimuth=sector*Math.PI/4,e=elevation*Math.PI/180;
   camera.position.set(Math.sin(azimuth)*Math.cos(e)*distance,.6+Math.sin(e)*distance,Math.cos(azimuth)*Math.cos(e)*distance);camera.lookAt(0,.6,0);camera.updateMatrixWorld(true);
   for(const phase of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5]){
    const sample={worldPosition:{x:0,y:0,z:0},bodyFacing:{x:0,z:1},viewDirection:VIEW_DIRECTIONS[sector],action:'shuffle',travelSpeed:1,travelPhase:phase,planted:false};
    updateReferenceAthlete(actor,sample,camera);const result=paintedAudit(actor,{pixels:atlasPixels,camera,viewportHeight:688}),label=`${player}/${handedness}/${sector}/${elevation}/${distance}/${phase}`;
    assert.ok(Math.abs(Math.min(...result.shoeBottoms))<1e-7,`${label}: a painted stance sole must meet ground (${result.shoeBottoms})`);
    assert.ok(result.shoeBottoms.every(y=>y>=-1e-7),`${label}: no painted shoe underground`);
    if(Math.max(...result.shoeBottoms)>.001)lifted++;
    for(const points of result.projectedSoleGroundOffsets)for(const point of points)assert.ok(point.worldY>=-1e-7,`${label}: rendered sole must not project below its ground`);
    assert.deepEqual(actor.userData.animation.bodyFacing,sample.bodyFacing);assert.equal(actor.userData.animation.viewDirection,sample.viewDirection);samples++;
   }
  }
 }}finally{r.dispose();}
 assert.equal(samples,3840);assert.ok(lifted>0,'retain actual single-leg lift while the other leg supports travel');
});


test('reference atlas UV views share one GPU source while retaining independent frame transforms and disposal',()=>{
 const r=resources(),textures=[];for(let player=0;player<4;player++)for(let frame=0;frame<4;frame++)textures.push(r.texture(player,frame));
 assert.equal(new Set(textures).size,16);assert.equal(new Set(textures.map(t=>t.source)).size,1);assert.equal(textures[0].source.data,r.assets.image);
 assert.equal(new Set(textures.map(t=>[...t.offset,...t.repeat].join('/'))).size,16);
 assert.ok(textures.every(t=>t.version>0));const old=textures[0].offset.clone();textures[1].offset.x+=.001;assert.deepEqual(textures[0].offset,old);
 const counts=new Map(textures.map(t=>[t,0]));for(const t of textures)t.addEventListener('dispose',()=>counts.set(t,counts.get(t)+1));
 r.dispose();r.dispose();assert.ok([...counts.values()].every(n=>n===1));assert.equal(r.textures.size,0);
});
