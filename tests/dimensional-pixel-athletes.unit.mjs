import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {ReferenceAthleteResources,createReferenceAthlete,updateReferenceAthlete} from '../reference-athletes.js';

const resources=()=>new ReferenceAthleteResources({image:{width:1,height:1},metadata:{}});
const sample={worldPosition:{x:0,y:0,z:-3},bodyFacing:{x:0,z:1},viewDirection:'front',action:'ready',planted:true};
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const cameraAt=(angle,elevation)=>{const camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(Math.sin(angle)*7,Math.tan(elevation)*7,Math.cos(angle)*7-3);camera.lookAt(0,.8,-3);camera.updateMatrixWorld(true);return camera;};

// Unlike the retired camera-facing cards, every visible body/paddle vertex and
// joint is invariant under orbit. Only projection and natural occlusion change.
test('dimensional athletes retain exactly one world pose through arbitrary camera orbit and former atlas boundaries',()=>{
 const r=resources();try{for(const hand of ['left','right']){
  const actor=createReferenceAthlete(r,'team1',hand),snapshots=[];
  for(const angle of [0,.00001,Math.PI/8-.00001,Math.PI/8+.00001,Math.PI/2,Math.PI,Math.PI*1.7])for(const elevation of [.08,.35,.8,1.3]){
   const camera=cameraAt(angle,elevation);updateReferenceAthlete(actor,{...sample,viewDirection:angle>Math.PI?'back':'front'},camera);
   const d=actor.userData;snapshots.push([...d.visual.matrixWorld.elements,...d.paddle.matrixWorld.elements,...d.arms[0].hand.matrixWorld.elements,...d.bodyBatch.batch.geometry.attributes.position.array]);
   assert.equal(d.visual.rotation.x,0);assert.equal(d.visual.rotation.z,0);assert.equal(d.visual.rotation.y,0);
  }
  for(const snapshot of snapshots)assert.deepEqual(snapshot,snapshots[0]);
 }}finally{r.dispose();}
});

test('all four original trainers use closed opaque colored depth, compact proportions and bounded render geometry',()=>{
 const r=resources();try{for(let player=0;player<4;player++){
  const actor=createReferenceAthlete(r,player<2?'team1':'team2','right',player%2);updateReferenceAthlete(actor,sample,cameraAt(0,.4));const d=actor.userData,batch=d.bodyBatch.batch;
  assert.equal(d.volumetric,true);assert.equal(batch.material.vertexColors,true);assert.equal(batch.material.transparent,false);assert.equal(batch.material.map,null);
  assert.ok(batch.geometry.attributes.position.count<10000,'bounded body upload including ink hulls and all details');
  const rendered=[];actor.traverse(o=>{if(o.isMesh&&o.visible)rendered.push(o);});assert.ok(rendered.length<=6,'one body draw plus actual solid paddle parts');
  const named=d.bodyBatch.parts.map(p=>p.source.name);for(const name of ['PixelHead','HairCrown','PixelJersey','LeftSole','RightSole','WorkingPalm'])assert.ok(named.includes(name));
  const bounds=new THREE.Box3().setFromBufferAttribute(batch.geometry.attributes.position),size=bounds.getSize(v());assert.ok(size.y>=1.7&&size.y<1.9,'court-scale three-head character');
  const head=d.face.geometry;head.computeBoundingBox();const hs=head.boundingBox.getSize(v());assert.ok(hs.z>.4&&hs.x>.5&&hs.y>.45,'real broad head volume, not four artwork planes');assert.ok(size.y/hs.y>2.8&&size.y/hs.y<4.0,'compact chibi silhouette');
  for(const part of d.bodyBatch.parts){assert.notEqual(part.source.geometry.type,'PlaneGeometry');assert.equal(part.source.visible,false);assert.equal(part.source.material.map,null);}
  const eye=actor.getObjectByName('EyePixel');assert.ok(eye,'actual pixel face detail exists');
 }}finally{r.dispose();}
});

test('ready grip is upright in front of the torso with elbows near the ribs and coherent shorter bones',()=>{
 const r=resources();try{for(const hand of ['left','right']){
  const actor=createReferenceAthlete(r,'team1',hand);updateReferenceAthlete(actor,sample,cameraAt(0,.4));const d=actor.userData,rig=d.rigPose;
  assert.ok(d.paddle.position.z>.35&&d.paddle.position.y>.9,'paddle held forward at waist/chest');
  assert.ok(v(0,1,0).applyQuaternion(d.paddle.quaternion).distanceTo(v(0,1,0))<1e-12,'paddle upright');
  assert.equal(rig.upperArmLength,.34);assert.equal(rig.forearmLength,.34);assert.ok(Math.abs(rig.elbow.x)<.4,'elbow does not project into a sideways chicken-wing pose');
  assert.ok(rig.elbow.y<rig.shoulder.y&&rig.elbow.y>.65,'relaxed elbow below sewn shoulder');
  for(const arm of d.arms){const mesh=arm.parts[1].outer,position=mesh.geometry.attributes.position;for(let i=0;i<position.count;i++){const point=d.upper.worldToLocal(v().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld));assert.ok(!(point.y>.76&&point.y<1.08&&Math.abs(point.x)<.21&&Math.abs(point.z)<.14),'exposed ready forearm must stay outside the solid central jersey volume');}}
  for(const [name,leg] of Object.entries(d.legs)){const hip=d.upper.localToWorld(v(name==='left'?.125:-.125,.65,0));assert.ok(d.visual.localToWorld(leg.hip.clone()).distanceTo(hip)<1e-12);assert.ok(Math.abs(leg.hip.distanceTo(leg.knee)-.32)<1e-8&&Math.abs(leg.knee.distanceTo(leg.ankle.clone().add(v(0,.135,0)))-.31)<1e-8,'short coherent chibi leg bones');}
 }}finally{r.dispose();}
});

test('reused actor changes physical handedness without allocating or retaining stale sleeve ownership',()=>{
 const r=resources(),actor=createReferenceAthlete(r,'team1','right');try{
  const count=[r.geometries.size,r.materials.size,r.textures.size];
  for(let i=0;i<100;i++){actor.userData.handedness=i%2?'left':'right';updateReferenceAthlete(actor,{...sample,timeSeconds:i*.1},cameraAt(i*.2,.5));const d=actor.userData;assert.equal(d.sleeves[d.rigPose.workingSide],d.arms[0].sleeve);assert.equal(Math.sign(d.rigPose.shoulder.x),i%2?1:-1);assert.deepEqual([r.geometries.size,r.materials.size,r.textures.size],count);}
 }finally{r.dispose();}assert.equal(r.pixelGeometryCache.size,0);assert.equal(r.pixelMaterial,null);
});
