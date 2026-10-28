import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_DOCUMENT_ENUMS } from '../play-document.js';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { PIXEL_STROKE_FAMILIES, computePixelStroke, pixelContactSoles } from '../pixel-strokes.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hands=['left','right'], sides=['forehand','backhand'];

test('pixel choreography covers every authored and legacy catalog shot vocabulary',()=>{
 const required=new Set([...PLAY_DOCUMENT_ENUMS.families,...PICKLEBOARD_PLAYS.flatMap(play=>play.steps.flatMap(step=>step.shot?[step.shot.type,step.shot.stroke]:[]))]);
 for(const type of required)assert.ok(PIXEL_STROKE_FAMILIES.includes(type),`${type} needs explicit choreography`);
});

test('all pixel stroke phases keep fixed arm lengths for both stroke sides and physical hands',()=>{
 for(const type of PIXEL_STROKE_FAMILIES)for(const handedness of hands)for(const strokeSide of sides)for(let frame=0;frame<=120;frame++){
  const phase=frame/40,pose=computePixelStroke({type,handedness,strokeSide,phase,moving:true,time:frame/60});
  const label=`${type}/${handedness}/${strokeSide}/${phase}`;
  assert.ok(pose.reachable,`${label}: wrist reach ${pose.reach}`);
  assert.ok(Math.abs(distance(pose.shoulder,pose.elbow)-4.5)<1e-8,`${label}: upper arm length`);
  assert.ok(Math.abs(distance(pose.elbow,pose.wrist)-4.5)<1e-8,`${label}: forearm length`);
  assert.ok(Math.abs(distance(pose.wrist,pose.paddle)-4)<1e-8,`${label}: handle length`);
 }
});

test('handed contact solves preserve the exact ball point at multiple display scales',()=>{
 for(const type of PIXEL_STROKE_FAMILIES)for(const handedness of hands)for(const strokeSide of sides)for(const scale of [1,2,3]){
  const contact={x:81.125,y:103.75},options={type,handedness,strokeSide,scale};
  const soles=pixelContactSoles(contact,options),pose=computePixelStroke({...options,phase:'contact'});
  assert.ok(Math.abs(soles.x+pose.paddle.x*scale-contact.x)<1e-10);
  assert.ok(Math.abs(soles.y+pose.paddle.y*scale-contact.y)<1e-10);
 }
});

test('stroke contact plants both soles while travelling ready stance changes feet over time',()=>{
 for(const type of PIXEL_STROKE_FAMILIES)for(const handedness of hands)for(const strokeSide of sides){
  const options={type,handedness,strokeSide,phase:'contact',moving:true};
  const a=computePixelStroke({...options,time:.13}),b=computePixelStroke({...options,time:.3});
  assert.equal(a.planted,true);assert.deepEqual(a.feet,b.feet);
 }
 assert.notDeepEqual(computePixelStroke({type:'ready',moving:true,time:.13}).feet,computePixelStroke({type:'ready',moving:true,time:.3}).feet);
});
