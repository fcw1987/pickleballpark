import test from 'node:test';
import assert from 'node:assert/strict';
import {DepthCameraControls} from '../depth-camera.js';

const controls=distance=>{const c=Object.create(DepthCameraControls.prototype);c.state={distance,elevation:50,azimuth:0,target:{x:0,y:.3,z:0}};c.autoFit=true;c.pointers=new Map();c.mode='orbit';c.apply=()=>{};return c;};
test('manual park zoom stops at 40 metres without restricting orbit, tilt or pan',()=>{
 const c=controls(29);c.zoomBy(10);assert.equal(c.state.distance,40);
 c.setState({azimuth:Math.PI*4,elevation:75,target:{x:8,z:-9}});
 assert.equal(c.state.azimuth,Math.PI*4);assert.equal(c.state.elevation,75);assert.deepEqual(c.state.target,{x:8,y:.3,z:-9});assert.equal(c.state.distance,40);
 c.zoomBy(.01);assert.equal(c.state.distance,7);
});
test('a narrow preset fit beyond the manual cap does not jump inward on zoom-out or orbit',()=>{
 const c=controls(53.5);c.zoomBy(1.2);assert.equal(c.state.distance,53.5);
 c.setState({azimuth:Math.PI/2});assert.equal(c.state.distance,53.5);
 c.zoomBy(.8);assert.ok(Math.abs(c.state.distance-42.8)<1e-8);
 c.zoomBy(.8);assert.ok(c.state.distance<40);c.zoomBy(10);assert.equal(c.state.distance,40);
});
