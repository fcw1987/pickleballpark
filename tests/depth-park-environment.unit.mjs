import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {createReferenceWorld} from '../reference-world.js';

// Rendering is covered in browser tests. Keep the actual scene graph, geometry,
// transforms and resource events here; only browser image/canvas I/O is stubbed.
async function withWorld(run){
 const previousDocument=globalThis.document,previousRAF=globalThis.requestAnimationFrame;
 const context=new Proxy({}, {get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
 globalThis.document={createElement:()=>({getContext:()=>context})};
 globalThis.requestAnimationFrame=()=>{throw new Error('Park props must use the playback clock');};
 class TextureLoader{load(url,onLoad){const texture=new THREE.Texture();queueMicrotask(()=>onLoad(texture));return texture;}}
 const world=createReferenceWorld({...THREE,TextureLoader});
 try{await world.ready;await run(world);}finally{
  world.dispose();
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  if(previousRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previousRAF;
 }
}

test('seven tree crowns clear actual pond and bench footprints',()=>withWorld(world=>{
 const park=world.group.getObjectByName('ReferenceDepthPark');
 park.updateMatrixWorld(true);
 const trees=park.children.filter(object=>object.isSprite),benches=new Set();
 park.traverse(object=>{if(object.name==='Bench golden seat slat')benches.add(object.parent);});
 const pond=park.children.find(object=>object.children.length===4&&object.children.every(child=>child.geometry?.type==='ShapeGeometry'));
 assert.equal(trees.length,7);assert.equal(benches.size,2);assert.ok(pond,'locate the actual pond geometry');
 const protectedBounds=[pond,...benches].map(object=>new THREE.Box3().setFromObject(object));
 for(const tree of trees){
  const center=tree.getWorldPosition(new THREE.Vector3()),radius=tree.getWorldScale(new THREE.Vector3()).x/2;
  for(const bounds of protectedBounds){
   const dx=Math.max(bounds.min.x-center.x,0,center.x-bounds.max.x),dz=Math.max(bounds.min.z-center.z,0,center.z-bounds.max.z);
   assert.ok(Math.hypot(dx,dz)>radius+.3048,`Tree at ${tree.position.toArray()} must leave at least one foot beyond its crown`);
  }
 }
}));

test('landmark has opposing readable faces aligned with the court width in world space',()=>withWorld(world=>{
 world.group.updateMatrixWorld(true);
 const sign=world.group.getObjectByName('Grand Pickleball Park landmark');
 const front=sign.getObjectByName('Grand PICKLEBALL PARK face'),back=sign.getObjectByName('Grand PICKLEBALL PARK reverse face');
 const normal=object=>new THREE.Vector3(0,0,1).transformDirection(object.matrixWorld);
 const width=new THREE.Vector3(1,0,0).transformDirection(front.matrixWorld);
 assert.ok(normal(front).distanceTo(new THREE.Vector3(0,0,1))<1e-10);
 assert.ok(normal(front).dot(normal(back))<-.999999);
 assert.ok(width.distanceTo(new THREE.Vector3(1,0,0))<1e-10);
 assert.ok(Math.abs(front.geometry.parameters.width*front.getWorldScale(new THREE.Vector3()).x-28*.3048)<1e-10);
 assert.ok(Math.abs(sign.getWorldPosition(new THREE.Vector3()).z+36*.3048)<1e-10);
 const before=front.matrixWorld.toArray();
 world.updateCamera(new THREE.PerspectiveCamera());world.group.updateMatrixWorld(true);
 assert.deepEqual(front.matrixWorld.toArray(),before,'camera updates must not turn the landmark into a billboard');
}));

test('cloth follows explicit time, stays outside the static cache, and disposes once with its world',()=>withWorld(world=>{
 const cloth=world.dynamicGroup.getObjectByName('Portland city flag — billowed cloth');
 assert.ok(cloth);assert.equal(world.dynamicGroup.children.length,1);
 assert.equal(world.group.getObjectById(cloth.id),undefined,'animated geometry cannot enter the static world cache');
 assert.equal(world.dynamicGroup.scale.x,.3048);
 const position=cloth.geometry.attributes.position,initial=Array.from(position.array);
 world.updateAtTime(1.25);const moved=Array.from(position.array),version=position.version;
 assert.notDeepEqual(moved,initial,'playback changes the cloth');
 world.updateAtTime(1.25);
 assert.equal(position.version,version,'paused rendering must not reupload identical cloth vertices');
 world.updateAtTime(3.5);world.updateAtTime(1.25);
 assert.deepEqual(Array.from(position.array),moved,'seeking back gives the same cloth independently of update history');
 world.updateAtTime(0);assert.deepEqual(Array.from(position.array),initial);
 for(let i=0;i<position.count;i++)if(Math.abs(position.getX(i)+2.5)<1e-8){
  assert.equal(position.getZ(i),0,'hoist stays attached to the mast');
 }
 const resources=new Set();
 for(const root of [world.group,world.dynamicGroup])root.traverse(object=>{
  // Sprite's quad is a Three.js module singleton shared across all worlds;
  // its geometry lifetime is not owned by this park.
  if(object.geometry&&!object.isSprite)resources.add(object.geometry);
  for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){
   resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);
  }
 });
 const counts=new Map([...resources].map(resource=>[resource,0]));
 for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));
 world.dispose();world.dispose();
 assert.ok(resources.size>100,'observe the full constructed world, including shared materials and textures');
 assert.deepEqual([...counts].filter(([,count])=>count!==1).map(([resource,count])=>({type:resource.type,count})),[],'every owned scene resource disposes exactly once');
 assert.equal(world.dynamicGroup.children.length,0);assert.equal(world.group.children.length,0);
 const disposedVersion=position.version;world.updateAtTime(10);assert.equal(position.version,disposedVersion);
}));
