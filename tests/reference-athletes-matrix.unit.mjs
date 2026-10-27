import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.min.js';
import {ReferenceAthleteResources,createReferenceAthlete,updateReferenceAthlete} from '../reference-athletes.js';
import {compileEffectiveCandidate} from '../rally-proposals.js';
import {sampleActorPresentation,VIEW_DIRECTIONS} from '../three-d-presentation.js';
import {pixelAuthoringCases,pixelTacticalBoundaryCases} from './fixtures/pixel-authoring-cases.mjs';

const metadata=JSON.parse(readFileSync(new URL('../assets/reference-athletes/metadata-v2.json',import.meta.url)));
// The production renderer's geometry, matrices, atlas dimensions and materials;
// texture decoding/WebGL rasterization are covered by the browser suite.
function resources(){return new ReferenceAthleteResources({metadata,image:{width:1400,height:1300}});}
function endpoints(part){return [-.5,.5].map(y=>new THREE.Vector3(0,y,0).applyMatrix4(part.outer.matrixWorld));}
function assertRig(actor,label,camera){
 actor.updateMatrixWorld(true);
 if(camera){
  const d=actor.userData,project=p=>d.visual.localToWorld(p.clone()).project(camera);
  const sleeve=project(d.rigPose.sleeveAnchor),shoulder=project(d.rigPose.shoulder);
  assert.ok(Math.hypot(sleeve.x-shoulder.x,sleeve.y-shoulder.y)<1e-8,`${label}: visible shoulder must stay on artwork sleeve`);
 }
 for(const [index,arm] of actor.userData.arms.entries()){
  const [a,b]=arm.parts.map(endpoints);
  for(const part of arm.parts)assert.ok(part.inner.position.z-part.outer.position.z>.014,`${label}: skin must project in front of enclosing ink cylinder`);
  assert.ok(Math.abs(a[0].distanceTo(a[1])-(index?Math.hypot(.09,.20):.47))<1e-8,`${label}: upper arm length`);
  assert.ok(Math.abs(b[0].distanceTo(b[1])-(index?Math.hypot(.11,.07,.07):.47))<1e-8,`${label}: forearm length`);
  assert.ok(a[1].distanceTo(b[0])<1e-8,`${label}: elbow connection`);
  assert.ok(b[1].distanceTo(arm.hand.getWorldPosition(new THREE.Vector3()))<1e-8,`${label}: hand connection`);
 }
 assert.ok(actor.userData.rigPose.wristReach<=.940001,`${label}: bounded natural arm reach`);
 const position=actor.userData.body.geometry.attributes.position,base=actor.userData.baseVertices;
 for(let n=0;n<position.count;n++)if(base[n*3+1]>-.19){for(let k=0;k<3;k++)assert.ok(position.array[n*3+k]===base[n*3+k],`${label}: original upper-body shape must not stretch`);}
 assert.ok(actor.userData.body.geometry.attributes.position.array.every(Number.isFinite),`${label}: finite artwork vertices`);
 const paddle=actor.userData.paddle.getWorldPosition(new THREE.Vector3());
 assert.ok(paddle.distanceTo(actor.userData.paddleFaceWorld)<1e-10,`${label}: diagnostic is the actual paddle mesh`);
}
function cameraAt(index){const angle=index*Math.PI/4,camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(Math.sin(angle)*12,5+index*.3,Math.cos(angle)*12);camera.lookAt(0,.8,0);camera.updateMatrixWorld(true);return camera;}

test('detailed renderer: all 80 supported combinations and 18 tactical boundaries meet real contact through every camera sector with fixed feet and fixed arm bones',()=>{
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
   const vertices=Array.from(actor.userData.body.geometry.attributes.position.array);
   updateReferenceAthlete(actor,contact,camera,1);assert.deepEqual(Array.from(actor.userData.body.geometry.attributes.position.array),vertices,`${item.id}: repeat seek`);
   for(const offset of [-.03,.03]){const sample=sampleAt(offset);assert.equal(sample.planted,true,`${item.id}: contact window must stay planted`);updateReferenceAthlete(actor,sample,camera,.9);assertRig(actor,item.id,camera);soles().forEach((p,n)=>assert.ok(p.distanceTo(feet[n])<1e-7,`${item.id}: planted artwork sole moved`));}
   // Exercise every key and interpolation of the production renderer's stroke clock.
   const keys=[];
   for(const phase of [0,.5,1,1.5,2,2.5,3]){
    const profile=contact.profile,c=profile.contactRatio,f=profile.recoverRatio;
    const ratio=phase<=1?phase*c:phase<=2?c+(phase-1)*(f-c):f+(phase-2)*(1-f);
    updateReferenceAthlete(actor,{...contact,strokeTime:ratio*profile.duration},camera,0);assertRig(actor,`${item.id}/${phase}`,camera);
    if(Number.isInteger(phase))keys.push(actor.userData.paddleFaceWorld.toArray().map(n=>n.toFixed(7)).join(','));
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
  for(let i=0;i<8;i++)for(const phase of [0,2]){
   const camera=cameraAt(i),points=[item,back].map((c,n)=>{
    const {timeline}=compileEffectiveCandidate(c.document),segment=timeline.segments.find(s=>s.shotSemantics);
    const sample=sampleActorPresentation({instructionalMovement:true,segment,timeline,playerId:segment.shotSemantics.playerId,localTime:segment.contactTime,handedness:c.handedness,cameraPosition:camera.position});
    const ratio=phase===0?0:sample.profile.recoverRatio;
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
