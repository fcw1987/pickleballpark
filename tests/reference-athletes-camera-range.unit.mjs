import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.min.js';
import {ReferenceAthleteResources,createReferenceAthlete,updateReferenceAthlete} from '../reference-athletes.js';
import {compileEffectiveCandidate} from '../rally-proposals.js';import {sampleActorPresentation} from '../three-d-presentation.js';
import {referenceAthleteGeometryKernel,readReferenceAtlasPixels} from './helpers/reference-athlete-geometry.mjs';
const atlasPixels=await readReferenceAtlasPixels(new URL('../assets/source/reference-athletes/athletes-armless-v2.png',import.meta.url)),paintedAudit=referenceAthleteGeometryKernel(THREE);
import {assertReferenceRig,referenceBoneLength} from './helpers/reference-rig-assertions.mjs';
import {pixelAuthoringCases,pixelTacticalBoundaryCases} from './fixtures/pixel-authoring-cases.mjs';

test('solid sewn sleeves and fixed arm bones cover the real depth-camera 20–75 degree and 7–55 metre range for every supported stroke',t=>{
 const metadata=JSON.parse(readFileSync(new URL('../assets/reference-athletes/metadata-v2.json',import.meta.url))),r=new ReferenceAthleteResources({metadata,image:{width:atlasPixels.width,height:atlasPixels.height}});
 const actors=Object.fromEntries(['left','right'].map(hand=>[hand,Array.from({length:4},(_,p)=>createReferenceAthlete(r,p<2?'team1':'team2',hand,p%2))]));let samples=0,maxReach=0,maxTorsoTranslation=0,maxHorizontalTorsoTranslation=0,maximumTorsoCase;
 try{
  for(const item of [...pixelAuthoringCases(),...pixelTacticalBoundaryCases()])for(let player=0;player<4;player++){
  const {timeline}=compileEffectiveCandidate(item.document),segment=timeline.segments.find(s=>s.shotSemantics),profile=segment.shotSemantics.profile,actor=actors[item.handedness][player];
  for(let sector=0;sector<8;sector++)for(const elevation of [20,38,55,75])for(const distance of [7,17,55]){
   // The same spherical placement, target, FOV and limits as DepthCameraControls.apply.
   const camera=new THREE.PerspectiveCamera(38,1,.1,100),azimuth=sector*Math.PI/4,e=elevation*Math.PI/180,target={x:0,y:.6,z:0};
   camera.position.set(Math.sin(azimuth)*Math.cos(e)*distance,.6+Math.sin(e)*distance,Math.cos(azimuth)*Math.cos(e)*distance);camera.lookAt(0,.6,0);camera.updateMatrixWorld(true);
   for(const offset of [-profile.duration*profile.contactRatio,-.15,-.06,-.03,0,.03,.06,.15,profile.duration*(1-profile.contactRatio)]){
    const localTime=Math.max(0,Math.min(segment.duration,segment.contactTime+offset));
    const sample=sampleActorPresentation({instructionalMovement:true,segment,timeline,playerId:segment.shotSemantics.playerId,localTime,handedness:item.handedness,cameraPosition:camera.position,cameraTarget:target});
    const delta=Math.abs(localTime-segment.contactTime),window=localTime<segment.contactTime?.18:.22,t=Math.max(0,1-delta/window);
    updateReferenceAthlete(actor,sample,camera,t*t*(3-2*t));
    const d=actor.userData,label=`${player}/${item.id}/${sector}/${elevation}/${distance}/${offset}`;
    assertReferenceRig(actor,label,camera);maxReach=Math.max(maxReach,d.rigPose.wristReach);
    const pelvis=d.visual.worldToLocal(d.upper.localToWorld(new THREE.Vector3(0,.65,0))).sub(new THREE.Vector3(0,.65,0)),translation=pelvis.length();maxHorizontalTorsoTranslation=Math.max(maxHorizontalTorsoTranslation,Math.hypot(pelvis.x,pelvis.z));if(translation>maxTorsoTranslation){maxTorsoTranslation=translation;maximumTorsoCase={label,pelvisOffset:pelvis.toArray()};}
    assert.ok(translation<=.17+1e-8,`${label}: actual pelvis load stays within .17m of its grounded base despite pivot compensation`);
    assert.ok(Math.abs(d.upper.rotation.x)<=.3&&Math.abs(d.head.rotation.x)<=.5,`${label}: actual torso/head lean remains anatomically bounded`);
    const pos=d.body.geometry.attributes.position,base=d.baseVertices;
    assert.deepEqual(pos.array,base,`${label}: no rigid shirt volume deformation`);
    if(offset===0){const painted=paintedAudit(actor,{pixels:atlasPixels,camera,viewportHeight:688});for(const y of painted.shoeBottoms)assert.ok(Math.abs(y-d.animation.jumpHeight)<1e-7,`${label}: actual-alpha soles match grounded stroke or overhead jump (${y}, ${d.animation.jumpHeight})`);for(const points of painted.projectedSoleGroundOffsets)for(const point of points)assert.ok(Math.abs(point.worldY-d.animation.jumpHeight)<1e-7,`${label}: actual rendered sole follows deterministic jump`);}
    samples++;
   }
  }
 }}finally{r.dispose();}
 t.diagnostic(JSON.stringify({samples,maxReach,maxTorsoTranslation,maxHorizontalTorsoTranslation,maximumTorsoCase}));
 assert.equal(samples,338688);assert.ok(maxReach>1.9*referenceBoneLength&&maxReach<2*referenceBoneLength,'authored cases exercise near-extension while respecting stricter .68m anatomical reach');
});

test('compact .34m arm bones support genuine near-extension contact without torso or camera compensation',()=>{
 const metadata=JSON.parse(readFileSync(new URL('../assets/reference-athletes/metadata-v2.json',import.meta.url))),r=new ReferenceAthleteResources({metadata,image:{width:atlasPixels.width,height:atlasPixels.height}});let count=0;
 try{for(const hand of ['left','right'])for(let sector=0;sector<8;sector++){
  const item=pixelAuthoringCases().find(c=>c.family==='drive'&&c.contactStyle==='forehand'&&c.handedness===hand),{timeline}=compileEffectiveCandidate(item.document),segment=timeline.segments.find(s=>s.shotSemantics),camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(Math.sin(sector*Math.PI/4)*12,5,Math.cos(sector*Math.PI/4)*12);camera.lookAt(0,.6,0);camera.updateMatrixWorld(true);
  const sample=sampleActorPresentation({instructionalMovement:true,segment,timeline,playerId:segment.shotSemantics.playerId,localTime:segment.contactTime,handedness:hand,cameraPosition:camera.position}),side=hand==='left'?1:-1,target={x:sample.worldPosition.x+side*(.265+.83),y:1.13,z:sample.worldPosition.z},actor=createReferenceAthlete(r,'team1',hand);
  updateReferenceAthlete(actor,{...sample,bodyFacing:{x:0,z:1},worldPosition:{...sample.worldPosition,y:0},paddle:{...sample.paddle,worldContactTarget:target}},camera,1);assertReferenceRig(actor,`${hand}/${sector}: near extension`,camera);assert.ok(actor.userData.rigPose.wristReach>1.9*referenceBoneLength&&actor.userData.rigPose.wristReach<2*referenceBoneLength);assert.ok(actor.userData.upper.position.length()<1e-8,'reachable near-straight arm needs no torso shift');assert.ok(paintedAudit(actor).paddleDistance(new THREE.Vector3(target.x,target.y,target.z))<=.037+1e-8);count++;
 }}finally{r.dispose();}assert.equal(count,16);
});
