import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
// Intentional compact chibi anatomy, independently measured from the mesh.
export const referenceBoneLength=.34;
export const rigEndpoints=part=>[-.5,.5].map(y=>new THREE.Vector3(0,y,0).applyMatrix4(part.outer.matrixWorld));
export function sourcePoint(mesh,[u,v]){
 const uv=mesh.geometry.attributes.uv,pos=mesh.geometry.attributes.position,index=mesh.geometry.index,point=new THREE.Vector3(u,v,0),triangle=new THREE.Triangle(),weights=new THREE.Vector3();
 for(let i=0;i<index.count;i+=3){const ids=[0,1,2].map(j=>index.getX(i+j));[triangle.a,triangle.b,triangle.c].forEach((p,j)=>p.set(uv.getX(ids[j]),uv.getY(ids[j]),0));triangle.getBarycoord(point,weights);if(weights.toArray().every(w=>w>=-1e-7)){const result=new THREE.Vector3();ids.forEach((id,j)=>result.addScaledVector(new THREE.Vector3().fromBufferAttribute(pos,id),weights.getComponent(j)));return mesh.localToWorld(result);}}
 throw Error('Source cuff UV is outside its actual textured sleeve mesh');
}
export function assertReferenceRig(actor,label,camera){
 actor.updateMatrixWorld(true);const d=actor.userData,rig=d.rigPose,world=p=>d.visual.localToWorld(p.clone()),working=d.arms[0],upper=rigEndpoints(working.parts[0]),fore=rigEndpoints(working.parts[1]);
 assert.ok(Math.abs(world(rig.shoulder).distanceTo(upper[1])-referenceBoneLength)<1e-8,`${label}: anatomical shoulder to actual elbow has fixed upper bone`);
 assert.ok(Math.abs(fore[0].distanceTo(fore[1])-referenceBoneLength)<1e-8,`${label}: actual fixed forearm`);
 assert.ok(upper[1].distanceTo(fore[0])<1e-8,`${label}: actual elbow connection`);
 assert.ok(upper[0].distanceTo(world(rig.skinStart))<1e-8,`${label}: exposed upper arm starts inside moving sleeve`);
 assert.ok(Math.abs(world(rig.shoulder).distanceTo(upper[0])-referenceBoneLength*rig.cuffFraction)<1e-8,`${label}: sleeve covers first part of fixed upper arm`);
 assert.ok(fore[1].distanceTo(working.hand.getWorldPosition(new THREE.Vector3()))<1e-8,`${label}: actual working hand connection`);
 assert.ok(working.hand.getWorldPosition(new THREE.Vector3()).distanceTo(d.paddle.children[2].getWorldPosition(new THREE.Vector3()))<.006,`${label}: hand holds actual grip center`);
 assert.ok(rig.wristReach<=2*referenceBoneLength+1e-8,`${label}: no bone extension (${rig.wristReach})`);
 assert.equal(d.volumetric,true,`${label}: render actual world-facing volumes`);
 const expectedSide=d.handedness==='left'?1:0;
 assert.equal(rig.workingSide,expectedSide,`${label}: anatomical working side cannot switch with camera view`);
 assert.ok(d.sleeves.every(s=>s.visible||d.bodyBatch.parts.some(p=>p.source===s)),`${label}: both solid sleeves are actually rendered through the full orbit`);
 const off=d.arms[1],oa=rigEndpoints(off.parts[0]),ob=rigEndpoints(off.parts[1]);
 assert.ok(Math.abs(world(rig.offSleeveAnchor).distanceTo(oa[1])-referenceBoneLength)<1e-8,`${label}: both arms share the same fixed anatomical upper bone`);
 assert.ok(Math.abs(ob[0].distanceTo(ob[1])-referenceBoneLength)<1e-8,`${label}: fixed offhand forearm`);
 assert.ok(oa[1].distanceTo(ob[0])<1e-8&&ob[1].distanceTo(off.hand.getWorldPosition(new THREE.Vector3()))<1e-8,`${label}: actual offhand joints`);
 const sleeve=d.sleeves[rig.workingSide],cuff=new THREE.Vector3(0,.5,0).applyMatrix4(sleeve.matrixWorld),pivot=new THREE.Vector3(0,-.5,0).applyMatrix4(sleeve.matrixWorld);
 assert.ok(cuff.distanceTo(upper[0])<1e-8,`${label}: actual solid white cuff meets actual skin in 3D`);
 assert.ok(pivot.distanceTo(world(rig.shoulder))<1e-8&&world(rig.sleeveAnchor).distanceTo(world(rig.shoulder))<1e-8,`${label}: physical sleeve remains sewn to anatomical shoulder`);
 for(const arm of d.arms)for(const part of arm.parts){
  assert.ok(part.outer.material.depthTest&&part.outer.material.depthWrite,`${label}: solid limb participates in depth occlusion`);
  assert.ok(part.inner.position.distanceTo(part.outer.position)<1e-8,`${label}: limb color cannot slide toward camera`);
 }
 const position=d.body.geometry.attributes.position,base=d.baseVertices;
 assert.deepEqual(position.array,base,`${label}: rigid torso volume must not stretch to reach contact`);
 assert.ok(position.array.every(Number.isFinite)&&d.sleeves.every(s=>s.geometry.attributes.position.array.every(Number.isFinite)),`${label}: finite body and sleeve geometry`);
 assert.ok(d.paddle.getWorldPosition(new THREE.Vector3()).distanceTo(d.paddleFaceWorld)<1e-10,`${label}: contact diagnostic is the actual paddle mesh`);
 for(const [name,side]of [['left',1],['right',-1]]){
  const leg=d.legs[name],hip=d.upper.localToWorld(new THREE.Vector3(side*.125,.65,0)),actual=world(leg.hip);
  assert.ok(actual.distanceTo(hip)<1e-8,`${label}: ${name} hip remains sewn to the real shifted torso`);
  const thigh=[-.5,.5].map(y=>new THREE.Vector3(0,y,0).applyMatrix4(leg.thigh.matrixWorld)),shin=[-.5,.5].map(y=>new THREE.Vector3(0,y,0).applyMatrix4(leg.shin.matrixWorld));
  assert.ok(thigh[0].distanceTo(hip)<1e-8&&thigh[1].distanceTo(shin[0])<1e-8,`${label}: actual thigh and shin meet at fixed connected joints`);
  assert.ok(Math.abs(thigh[0].distanceTo(thigh[1])-.32)<1e-8,`${label}: ${name} actual thigh retains its fixed .32m length`);
  assert.ok(Math.abs(shin[0].distanceTo(shin[1])-.31)<1e-8,`${label}: ${name} actual shin retains its fixed .31m length`);
 }
}
