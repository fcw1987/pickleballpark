import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {DepthCameraControls} from '../depth-camera.js';

const actionEnvelope=()=>{
 const points=[];
 for(const x of[-3.748,3.748])for(const y of[0,2])for(const z of[-7.4,7.4])points.push(new THREE.Vector3(x,y,z));
 return points;
};
function fixture({width=1416,height=675,reserved=0,points=actionEnvelope()}={}){
 const c=Object.create(DepthCameraControls.prototype),surface={clientWidth:width,clientHeight:height,getBoundingClientRect:()=>({left:0,right:width,top:0,bottom:height})};
 const hud=reserved?{getClientRects:()=>[{}],getBoundingClientRect:()=>({left:0,right:width,top:height-reserved+16,bottom:height})}:null;
 globalThis.document={querySelector:()=>null};globalThis.window={};
 c.viewer={camera:new THREE.PerspectiveCamera(),elements:{root:{querySelector:()=>hud}},renderer:{domElement:surface}};
 c.surface=surface;c.pointers=new Map();c.mode='orbit';c.envelope=()=>points;c.reset();return c;
}
function assertFitted(c,points){
 const height=c.surface.clientHeight,reserved=c.viewer.cameraFraming.reservedPixels;
 for(const point of points){
  const ndc=point.clone().project(c.viewer.camera);
  assert.ok(Math.abs(ndc.x)<=.96000001,`horizontal fit ${ndc.x}`);
  const cssY=(1-ndc.y)*height/2;
  assert.ok(cssY>=(height-reserved)*.02-1e-7,`top fit ${cssY}`);
  assert.ok(cssY<=(height-reserved)*.98+1e-7,`HUD fit ${cssY}`);
 }
}

test('entry and every named preset fit the action instead of imposing the old distant overview',()=>{
 for(const [width,height]of[[1416,675],[374,524],[820,199]]){
  const points=actionEnvelope(),c=fixture({width,height,points});
  assert.ok(c.state.distance<24,`${width}px entry must be substantially closer than 27/29m`);
  for(const preset of['overhead','sideline','behind-green','behind-orange']){c.reset(preset);assertFitted(c,points);}
 }
});
test('preset fitting uses the HUD-safe height and includes high lob geometry in both directions',()=>{
 const points=[...actionEnvelope(),new THREE.Vector3(0,8,-5),new THREE.Vector3(0,8,5)];
 for(const [width,height,reserved]of[[1280,800,190],[390,844,250],[844,390,100]]){
  const c=fixture({width,height,reserved,points});
  for(const preset of['overhead','sideline','behind-green','behind-orange']){c.reset(preset);assertFitted(c,points);}
 }
});
test('a narrow sideline fit can exceed the manual cap while a tiny scene respects the near bound',()=>{
 const c=fixture({width:390,height:844});c.reset('sideline');assert.ok(c.state.distance>40);assert.ok(c.state.distance<=55);assertFitted(c,c.envelope());
 const near=fixture({points:[new THREE.Vector3(0,0,0)]});assert.equal(near.state.distance,7);
});
test('manual camera distance, orbit, target and tilt survive later framing refreshes',()=>{
 const c=fixture();c.setState({distance:12,azimuth:Math.PI+1,elevation:32,target:{x:1,y:.8,z:-2}});const before=c.getState();
 c.envelope=()=>[new THREE.Vector3(0,15,-10)];c.surface.clientWidth=390;c.surface.clientHeight=844;c.apply();
 assert.deepEqual(c.getState(),before);c.reset();assert.equal(c.autoFit,true);assert.notEqual(c.state.distance,before.distance);
});
