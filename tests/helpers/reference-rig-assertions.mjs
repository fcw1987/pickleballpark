import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const measured=JSON.parse(readFileSync(new URL('../fixtures/reference-sleeve-measurements.json',import.meta.url)));
import * as THREE from '../../vendor/three.module.min.js';
export const referenceBoneLength=.42;
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
 const expectedSide=((d.handedness==='left'?-1:1)*(d.animation.frame===3?1:-1)*d.animation.mirror)<0?0:1,source=measured[d.player][d.animation.frame][expectedSide];
 assert.equal(rig.workingSide,expectedSide,`${label}: correct original source arm for handedness and view`);assert.deepEqual(rig.sourceCuffUV,source.uv,`${label}: measured source cuff, not cheek/neck substitute`);
 assert.equal(d.sleeves[expectedSide].visible,source.visible,`${label}: preserve source near/far sleeve visibility`);
 const off=d.arms[1],oa=rigEndpoints(off.parts[0]),ob=rigEndpoints(off.parts[1]);
 assert.ok(Math.abs(oa[0].distanceTo(oa[1])-Math.hypot(.09,.20))<1e-8,`${label}: fixed offhand upper arm`);
 assert.ok(Math.abs(ob[0].distanceTo(ob[1])-Math.hypot(.11,.07,.07))<1e-8,`${label}: fixed offhand forearm`);
 assert.ok(oa[1].distanceTo(ob[0])<1e-8&&ob[1].distanceTo(off.hand.getWorldPosition(new THREE.Vector3()))<1e-8,`${label}: actual offhand joints`);
 if(camera){
  const cuff=sourcePoint(d.sleeves[rig.workingSide],rig.sourceCuffUV).project(camera),skin=upper[0].clone().project(camera);
  // Float32 UV and position interpolation remains within .005px at 1000px.
  assert.ok(Math.hypot(cuff.x-skin.x,cuff.y-skin.y)<1e-5,`${label}: original moving white cuff meets actual skin in projection (${Math.hypot(cuff.x-skin.x,cuff.y-skin.y)} visible=${d.sleeves[rig.workingSide].visible})`);
  const pivot=world(rig.sleeveAnchor).project(camera),shoulder=world(rig.shoulder).project(camera);
  assert.ok(Math.hypot(pivot.x-shoulder.x,pivot.y-shoulder.y)<1e-8,`${label}: anatomical shoulder remains sewn to source shoulder`);
 }
 for(const arm of d.arms)for(const part of arm.parts){assert.equal(part.outer.material.side,THREE.BackSide,`${label}: ink hull cannot cover skin with front cap`);assert.ok(part.inner.position.distanceTo(part.outer.position)>.0349,`${label}: skin stays on view-facing surface`);}
 const position=d.body.geometry.attributes.position,base=d.baseVertices;
 for(let n=0;n<position.count;n++)if(base[n*3+1]>-.19)for(let k=0;k<3;k++)assert.ok(position.array[n*3+k]===base[n*3+k],`${label}: original head and torso geometry unchanged`);
 assert.ok(position.array.every(Number.isFinite)&&d.sleeves.every(s=>s.geometry.attributes.position.array.every(Number.isFinite)),`${label}: finite body and sleeve geometry`);
 assert.ok(d.paddle.getWorldPosition(new THREE.Vector3()).distanceTo(d.paddleFaceWorld)<1e-10,`${label}: contact diagnostic is the actual paddle mesh`);
}
