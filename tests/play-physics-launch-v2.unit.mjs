import test from 'node:test';
import assert from 'node:assert/strict';
import {solveFlightLaunchV2,solveFlightV2,PHYSICS_V2} from '../play-physics-v2.js';

const input={from:{x:6,y:5,heightFeet:2.2},target:{x:14,y:39},family:'drive',physics:{apexFeet:6}};
test('shared launch owns immutable initial-flight geometry and matches public launch arithmetic',()=>{
  for(const spec of [input,{...input,from:{x:10,y:14,heightFeet:2.2},target:{x:10,y:30},physics:{apexFeet:2.2}},
    {...input,from:{x:-2.5,y:18,heightFeet:2.2},target:{x:.5,y:32},physics:{apexFeet:2.2}},
    {...input,family:'overhead',physics:undefined,from:{x:6,y:14,heightFeet:7.5}}]){
    const before=JSON.stringify(spec),launch=solveFlightLaunchV2(spec),flight=solveFlightV2(spec);
    assert.equal(JSON.stringify(spec),before);
    assert.equal(Object.isFrozen(launch),true);
    for(const item of [launch.from,launch.target,launch.first,launch.first.from,launch.events,launch.netPoint,launch.obstruction,launch.obstruction?.position].filter(Boolean))assert.equal(Object.isFrozen(item),true);
    assert.notEqual(launch.from,spec.from);assert.notEqual(launch.target,spec.target);
    assert.equal(launch.launchSpeedMph,flight.launchSpeedMph);assert.equal(launch.horizontalAverageSpeedMph,flight.horizontalAverageSpeedMph);
    assert.equal(launch.apexFeet,flight.metadata.apexFeet);assert.equal(launch.vy,flight.metadata.launchVerticalFeetPerSecond);
    assert.equal(launch.first.duration,launch.flightDuration);
    assert.deepEqual(launch.obstruction,flight.obstruction);
    assert.equal(Object.isFrozen(flight.obstruction?.position??{}),false);
    if(!launch.obstruction){assert.equal(launch.netTime,flight.netTime);assert.deepEqual(launch.netPoint,flight.netPoint);assert.deepEqual(launch.events,flight.events.filter(e=>['net-touch','net-crossing'].includes(e.type)));}
  }
});
test('shared launch preserves solver input validation',()=>{
  for(const changes of [{physicsVersion:'future'},{from:{...input.from,x:NaN}},{target:{x:NaN,y:30}},
    {from:{...input.from,heightFeet:PHYSICS_V2.ballRadiusFeet-1}},{physics:{apexFeet:31}},
    {physics:{apexFeet:1}},{physics:{apexFeet:6,launchVerticalFeetPerSecond:0}},
    {physics:{launchVerticalFeetPerSecond:-81}},{physics:{launchVerticalFeetPerSecond:80}},
    {from:{...input.from,heightFeet:PHYSICS_V2.ballRadiusFeet},physics:{launchVerticalFeetPerSecond:0}}]){
    const spec={...input,...changes};let expected;try{solveFlightV2(spec);}catch(error){expected=error;}
    assert.ok(expected);assert.throws(()=>solveFlightLaunchV2(spec),{name:expected.name,message:expected.message});
  }
});
