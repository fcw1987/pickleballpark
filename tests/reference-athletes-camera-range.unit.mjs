import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.min.js';
import {ReferenceAthleteResources,createReferenceAthlete,updateReferenceAthlete} from '../reference-athletes.js';
import {compileEffectiveCandidate} from '../rally-proposals.js';import {sampleActorPresentation} from '../three-d-presentation.js';
import {referenceAthleteGeometryKernel,readReferenceAtlasPixels} from './helpers/reference-athlete-geometry.mjs';
const atlasPixels=await readReferenceAtlasPixels(new URL('../assets/reference-athletes/athletes-armless-v2.png',import.meta.url)),paintedAudit=referenceAthleteGeometryKernel(THREE);
import {assertReferenceRig,referenceBoneLength} from './helpers/reference-rig-assertions.mjs';
import {pixelAuthoringCases,pixelTacticalBoundaryCases} from './fixtures/pixel-authoring-cases.mjs';

test('articulated source sleeves and fixed arm bones cover the real depth-camera 20–75 degree and 7–55 metre range for every supported stroke',()=>{
 const metadata=JSON.parse(readFileSync(new URL('../assets/reference-athletes/metadata-v2.json',import.meta.url))),r=new ReferenceAthleteResources({metadata,image:{width:atlasPixels.width,height:atlasPixels.height}});
 const actors=Object.fromEntries(['left','right'].map(hand=>[hand,Array.from({length:4},(_,p)=>createReferenceAthlete(r,p<2?'team1':'team2',hand,p%2))]));let samples=0,maxReach=0;
 try{for(const item of [...pixelAuthoringCases(),...pixelTacticalBoundaryCases()])for(let player=0;player<4;player++){
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
    const pos=d.body.geometry.attributes.position,base=d.baseVertices;
    for(let n=0;n<pos.count;n++)if(base[n*3+1]>-.19)for(let k=0;k<3;k++)assert.ok(pos.array[n*3+k]===base[n*3+k],`${label}: no shirt deformation`);
    if(offset===0){const painted=paintedAudit(actor,{pixels:atlasPixels,camera,viewportHeight:688});for(const y of painted.shoeBottoms)assert.ok(Math.abs(y-d.animation.jumpHeight)<1e-7,`${label}: actual-alpha soles match grounded stroke or overhead jump (${y}, ${d.animation.jumpHeight})`);for(const points of painted.projectedSoleGroundOffsets)for(const point of points)assert.ok(Math.abs(point.worldY-d.animation.jumpHeight)<1e-7,`${label}: actual rendered sole follows deterministic jump`);}
    samples++;
   }
  }
 }}finally{r.dispose();}
 assert.equal(samples,338688);assert.ok(maxReach>.80&&maxReach<2*referenceBoneLength,'exercise the high-angle short-hop boundary that previously escaped the matrix');
});
