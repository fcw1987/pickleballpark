import test from 'node:test';
import assert from 'node:assert/strict';
import { boundMovementV1, inspectGeneratedMovementV1, contactFeetV1 } from '../rally-movement.js';
const limit={maxAccelerationFeetPerSecondSquared:30};
const positions={player1:{x:5,y:3},player2:{x:15,y:3},player3:{x:5,y:30},player4:{x:15,y:30}};
function segment({duration=.2,contactTime=0,to={player4:{x:15.75,y:30}},feet=[{x:4.58,y:3},{x:5.42,y:3}],momentum=[]}={}){
 return{modelVersion:2,startTime:0,endTime:duration,duration,originalDuration:duration,contactTime,previous:{positions:structuredClone(positions)},
  step:{id:'dynamics',positions:{...structuredClone(positions),...to}},shotSemantics:{playerId:'player1',contact:{feet}},model2Momentum:momentum};
}
test('new generation rejects speed-safe impulsive shuffles while historical speed-only inspection remains explicit',()=>{
 const route=segment(),before=JSON.stringify(route);
 assert.equal(inspectGeneratedMovementV1(route).valid,true);
 const result=inspectGeneratedMovementV1(route,limit);assert.equal(result.valid,false);assert.equal(result.actor,'player4');
 assert.ok(result.accelerationFeetPerSecondSquared>74.99);assert.match(result.reason,/acceleration/i);
 assert.equal(JSON.stringify(route),before);
 const slow=inspectGeneratedMovementV1(segment({duration:.5}),limit);assert.equal(slow.valid,true);assert.ok(Math.abs(slow.maxAccelerationFeetPerSecondSquared-12)<1e-6);
});
test('discretionary distance is bounded by both actual speed and acceleration phase duration',()=>{
 const target=boundMovementV1({x:0,y:0},{x:10,y:0},.2);assert.ok(Math.abs(target.x-.3)<1e-10);
 const actual=segment({to:{player4:{x:15+target.x,y:30}}});assert.equal(inspectGeneratedMovementV1(actual,limit).valid,true);
 const longer=boundMovementV1({x:0,y:0},{x:30,y:0},2);assert.equal(longer.x,18,'long routes retain18ft/s peak bound');
});
test('required arrival and post-contact recovery cannot borrow held contact time',()=>{
 const arrival=segment({duration:1,contactTime:.2,feet:[{x:5.58,y:3},{x:6.42,y:3}],to:{player1:{x:6,y:3},player4:positions.player4}});
 assert.equal(inspectGeneratedMovementV1(arrival).valid,true);assert.equal(inspectGeneratedMovementV1(arrival,limit).valid,false);
 const recovery=segment({duration:1,contactTime:.5,to:{player1:{x:7,y:3},player4:positions.player4}});
 assert.equal(inspectGeneratedMovementV1(recovery).valid,true);assert.equal(inspectGeneratedMovementV1(recovery,limit).valid,false);
 const feet=contactFeetV1({contact:{x:10,y:14.25,heightFeet:2.7},target:{x:10,y:32},team:'green',kind:'volley',position:{x:14.4,y:14.25},availableSeconds:.28});
 assert.equal(feet.reachable,true);assert.equal(feet.routeReachable,false,'static paddle reach is not an acceleration-feasible arrival');
});
test('linear momentum cannot hide an instantaneous velocity change between bounded phases',()=>{
 const momentum=[{actor:'player4',contactTime:.2,time:.3,from:{x:15,y:30},to:{x:15.5,y:30},
  fromFeet:[{x:14.58,y:30},{x:15.42,y:30}],feet:[{x:15.08,y:30},{x:15.92,y:30}]}];
 const route=segment({duration:1,to:{player4:positions.player4},momentum});
 assert.equal(inspectGeneratedMovementV1(route).valid,true);
 const result=inspectGeneratedMovementV1(route,limit);assert.equal(result.valid,false);assert.match(result.reason,/velocity/i);
});
test('dead-clipped paths keep their original easing duration and actual acceleration',()=>{
 const full=segment({duration:1,to:{player4:{x:20,y:30}}});
 const clipped={...full,duration:.1,endTime:.1};
 const result=inspectGeneratedMovementV1(clipped,limit);assert.equal(result.valid,true);assert.ok(Math.abs(result.maxAccelerationFeetPerSecondSquared-20)<1e-5);
 assert.equal(inspectGeneratedMovementV1({...clipped,originalDuration:.1},limit).valid,false);
});
test('optional generation dynamics bounds cannot be relaxed or made nonfinite',()=>{
 for(const value of[0,-1,30.001,NaN,Infinity])assert.throws(()=>inspectGeneratedMovementV1(segment(),{maxAccelerationFeetPerSecondSquared:value}),/acceleration/i);
});
