import test from 'node:test';
import assert from 'node:assert/strict';
import { solveFlightV2, sampleFlightVelocityV2, PHYSICS_V2 } from '../play-physics-v2.js';

for (const mirror of [false, true]) test(`incoming velocity follows the actual solved pre/post-bounce stages (${mirror?'orange':'green'})`,()=>{
  const y=n=>mirror?44-n:n;
  const flight=solveFlightV2({from:{x:6,y:y(14),heightFeet:2.2},target:{x:13,y:y(38)},family:'drive',physics:{apexFeet:5}});
  for(const time of [.1,flight.firstLandingTime-.01,flight.firstLandingTime+.1]){
    const velocity=sampleFlightVelocityV2(flight,time), h=1e-5, a=flight.sampleBoard(time-h), b=flight.sampleBoard(time+h);
    assert.ok(Math.abs((b.x-a.x)/(2*h)-velocity.xFeetPerSecond)<1e-7);
    assert.ok(Math.abs((b.y-a.y)/(2*h)-velocity.yFeetPerSecond)<1e-7);
    assert.ok(Math.abs((b.heightFeet-a.heightFeet)/(2*h)-velocity.heightFeetPerSecond)<1e-7);
    assert.equal(velocity.speedMph,Math.hypot(velocity.xFeetPerSecond,velocity.yFeetPerSecond,velocity.heightFeetPerSecond)/(22/15));
    assert.ok(Object.isFrozen(velocity));
  }
  const before=sampleFlightVelocityV2(flight,flight.firstLandingTime-1e-6), after=sampleFlightVelocityV2(flight,flight.firstLandingTime);
  assert.equal(after.phase,'post-bounce');
  assert.ok(Math.abs(after.xFeetPerSecond/before.xFeetPerSecond-PHYSICS_V2.horizontalRetention)<1e-12);
  assert.ok(after.heightFeetPerSecond>0&&before.heightFeetPerSecond<0);
  assert.notEqual(sampleFlightVelocityV2(flight,flight.firstLandingTime+.1).speedMph,flight.launchSpeedMph);
});

test('velocity observations reject unsupported flights and times without mutating source',()=>{
  const input={from:{x:6,y:14,heightFeet:2.2},target:{x:13,y:38},family:'drive'}, before=JSON.stringify(input),flight=solveFlightV2(input);
  for(const time of [-1,NaN,Infinity,flight.totalDuration+.01])assert.throws(()=>sampleFlightVelocityV2(flight,time));
  assert.throws(()=>sampleFlightVelocityV2({},0));
  assert.equal(JSON.stringify(input),before);
});
