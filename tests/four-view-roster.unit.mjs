import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.min.js';
import {ReferenceAthleteResources,createReferenceAthlete,updateReferenceAthlete} from '../reference-athletes.js';

const metadata=JSON.parse(readFileSync(new URL('../assets/reference-athletes/metadata-v2.json',import.meta.url)));
test('the default roster binds the original painted body and sleeve frames through direction and handedness changes',()=>{
 const image={width:1254,height:1254},resources=new ReferenceAthleteResources({image,metadata});
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,4,8);camera.lookAt(0,1,0);
 const directions=[['front',0,1],['front-right',1,1],['right',2,1],['back-right',3,1],['back',3,1],['back-left',3,-1],['left',2,-1],['front-left',1,-1]];
 try{
  for(let player=0;player<4;player++){
   const actor=createReferenceAthlete(resources,player<2?'team1':'team2','right',player%2);
   for(const handedness of ['left','right'])for(const [viewDirection,frame,mirror] of directions){
    actor.userData.handedness=handedness;
    updateReferenceAthlete(actor,{worldPosition:{x:0,y:0,z:-3},viewDirection,action:'ready',planted:true},camera);
    const d=actor.userData;
    assert.equal(d.animation.frame,frame);assert.equal(d.animation.mirror,mirror);
    assert.equal(d.body.material.map,resources.texture(player,frame));
    assert.equal(d.body.visible,true);assert.equal(d.body.material.map.image,image);
    for(const [i,sleeve] of d.sleeves.entries())assert.equal(sleeve.material.map,resources.texture(player,frame,i));
    assert.equal(d.rigPose.workingSide,(handedness==='left'?-1:1)*(frame===3?1:-1)*mirror<0?0:1);
   }
  }
 }finally{resources.dispose();}
});
