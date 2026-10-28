import test from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS_VERSION, PHYSICS_V2, solveFlightV2, interceptFlightV2, localNetHeightFeet,
  compileSolvedLegV2, solveServePreparationV2 } from '../play-physics-v2.js';
import { compileDocument } from '../play-compiler.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';
import { terminalCueAtTime, terminalCueLabel } from '../terminal-cues.js';
import { validateModel2Rules } from '../play-outcome-v2.js';
import { isInNonVolleyZone } from '../court-geometry.js';
import { sampleActorFeetV2 } from '../play-actors-v2.js';

const near=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} should equal ${b}`);
const spec={physicsVersion:PHYSICS_VERSION,from:{x:6,y:5,heightFeet:2.2},target:{x:14,y:39},family:'drive',arc:'medium',pace:'firm',quality:'neutral',physics:{apexFeet:6}};

test('model2 flight satisfies gravity, ground radius and exact landing without independent speed guesses',()=>{
  const f=solveFlightV2(spec),s=f.stages[0],t=.2,dt=.001;
  const a=f.sampleBoard(t-dt),b=f.sampleBoard(t),c=f.sampleBoard(t+dt);
  near((c.heightFeet-2*b.heightFeet+a.heightFeet)/(dt*dt),-PHYSICS_V2.gravityFeetPerSecond2,1e-6);
  near(f.landing.x,14);near(f.landing.y,39);near(f.landing.heightFeet,PHYSICS_V2.ballRadiusFeet);
  near(f.sampleBoard(0).heightFeet,2.2);
  near(f.sampleBoard(s.vy/PHYSICS_V2.gravityFeetPerSecond2).heightFeet,6);
  assert.ok(s.vy/PHYSICS_V2.gravityFeetPerSecond2/f.firstLandingTime<.5);
  near(f.launchSpeedMph,Math.hypot(s.vx,s.vy,s.vz)/(22/15));
  assert.ok(f.launchSpeedMph>f.horizontalAverageSpeedMph);
});

test('default overhead launches downward and signed velocity cannot overconstrain an apex',()=>{
  const f=solveFlightV2({...spec,from:{x:6,y:14,heightFeet:7.5},target:{x:12,y:35},family:'overhead',physics:undefined});
  assert.equal(f.stages[0].vy,-24);assert.equal(f.metadata.apexFeet,7.5);
  assert.ok(f.sampleBoard(.001).heightFeet<7.5);
  assert.throws(()=>solveFlightV2({...spec,physics:{apexFeet:8,launchVerticalFeetPerSecond:-5}}),/either apex/);
  assert.throws(()=>solveFlightV2({...spec,physics:{launchVerticalFeetPerSecond:-81}}),/between/);
  assert.throws(()=>solveFlightV2({...spec,physics:{launchVerticalFeetPerSecond:80}}),/derived ballistic apex/);
  const bounded=solveFlightV2({...spec,physics:{launchVerticalFeetPerSecond:30}});
  assert.ok(bounded.metadata.apexFeet<=30);
});

test('bounce timing and heights follow incoming energy and preserve continuous boundary samples',()=>{
  const f=solveFlightV2(spec),t=f.firstLandingTime;
  const before=f.sampleBoard(t-1e-8),after=f.sampleBoard(t+1e-8);
  assert.ok(Math.hypot(before.x-after.x,before.y-after.y,before.heightFeet-after.heightFeet)<1e-5);
  const early=interceptFlightV2(f,{kind:'groundstroke',stance:{x:14,y:39},afterBounceSeconds:.15});
  const late=interceptFlightV2(f,{kind:'groundstroke',stance:{x:14,y:39},afterBounceSeconds:.35});
  assert.notEqual(early.point.y,late.point.y);assert.notEqual(early.point.heightFeet,late.point.heightFeet);
  near(early.point.heightFeet,f.sampleBoard(early.time).heightFeet);
  near(late.point.heightFeet,f.sampleBoard(late.time).heightFeet);
  assert.equal(f.events.filter(e=>e.type==='bounce').length,1);
  assert.equal(f.events.filter(e=>e.type==='second-bounce').length,1);
  assert.throws(()=>interceptFlightV2(f,{kind:'groundstroke',stance:{x:14,y:39},afterBounceSeconds:10}),/before the second/);
});

test('transition volley stays at actor depth and inherits actual incoming ball height',()=>{
  const f=solveFlightV2(spec),hit=interceptFlightV2(f,{kind:'volley',stance:{x:14,y:36}});
  near(hit.point.y,36);near(hit.point.heightFeet,f.sampleBoard(hit.time).heightFeet);
  assert.equal(hit.bounces,0);assert.ok(hit.time<f.firstLandingTime);
  assert.throws(()=>interceptFlightV2(f,{kind:'volley',stance:{x:14,y:36},contactOverride:{x:0,y:36}}),/actual incoming/);
});

test('net mesh collision drops on hitter side, touch stays live until the own-side landing',()=>{
  const f=solveFlightV2({...spec,from:{x:10,y:14,heightFeet:2.2},target:{x:10,y:30},physics:{apexFeet:2.2}});
  assert.equal(f.obstruction.kind,'net');assert.equal(f.netTime,null);
  assert.equal(f.events.some(e=>e.type==='net-crossing'),false);
  const touch=f.events.find(e=>e.type==='net-touch');assert.equal(touch.remainsLive,true);assert.ok(touch.time<f.terminal.time);
  for(let i=0;i<=128;i++)assert.ok(f.sampleBoard(f.totalDuration*i/128).y<22-PHYSICS_V2.ballRadiusFeet);
  near(f.terminal.position.heightFeet,PHYSICS_V2.ballRadiusFeet);
  assert.throws(()=>interceptFlightV2(f,{kind:'volley',stance:{x:10,y:30}}),/live flight/);
});

test('a tape kiss can remain live while local tape height and ball radius are respected',()=>{
  const input={...spec,from:{x:10,y:14,heightFeet:2.2},target:{x:10,y:30}};
  let low=2.2,high=8;
  const wanted=localNetHeightFeet(10)+PHYSICS_V2.ballRadiusFeet;
  for(let i=0;i<70;i++){
    const apexFeet=(low+high)/2,f=solveFlightV2({...input,physics:{apexFeet}}),s=f.stages[0],t=(22-s.from.y)/s.vz;
    const height=s.from.heightFeet+s.vy*t-.5*PHYSICS_V2.gravityFeetPerSecond2*t*t;
    if(height<wanted)low=apexFeet;else high=apexFeet;
  }
  const f=solveFlightV2({...input,physics:{apexFeet:high}});
  assert.equal(f.obstruction,null);assert.equal(f.terminal,null);
  assert.equal(f.events.find(e=>e.type==='net-touch').remainsLive,true);
  assert.ok(f.events.some(e=>e.type==='net-crossing'));
  near(localNetHeightFeet(0),3);near(localNetHeightFeet(10),34/12);near(localNetHeightFeet(20),3);
});

test('low ATP clears the outside of the full post while post/gap returns are obstructed',()=>{
  const input={...spec,from:{x:-2.5,y:18,heightFeet:2.2},target:{x:.5,y:32},physics:{apexFeet:2.2}};
  const f=solveFlightV2(input),cross=f.events.find(e=>e.type==='net-crossing');
  assert.equal(f.obstruction,null);assert.equal(cross.aroundPost,true);
  assert.ok(cross.position.x<-1.25-PHYSICS_V2.ballRadiusFeet);
  assert.ok(cross.position.heightFeet<localNetHeightFeet(cross.position.x));
  const blocked=solveFlightV2({...input,from:{x:-1.05,y:18,heightFeet:2.2},target:{x:-.55,y:32}});
  assert.ok(['post','net-gap'].includes(blocked.obstruction.kind));
});

test('passive drop serve keeps preparation bounce separate and conserves its energy loss',()=>{
  const p=solveServePreparationV2({point:{x:5,y:-1}}),g=PHYSICS_V2.gravityFeetPerSecond2;
  const v=g*p.fallDuration*PHYSICS_V2.restitution;
  near(p.contactHeightFeet,PHYSICS_V2.ballRadiusFeet+v*p.reboundDuration-.5*g*p.reboundDuration**2);
  near(p.sample(p.bounceTime).y,PHYSICS_V2.ballRadiusFeet*.3048);
  assert.equal(p.sample(p.bounceTime).phase,'preparation-bounce');
  near(p.sample(p.totalDuration).y,p.contactHeightFeet*.3048);
  assert.ok(p.contactHeightFeet>PHYSICS_V2.ballRadiusFeet);
});

test('inert compiled metadata reconstructs identical arbitrary scrubs without previous playback history',()=>{
  const solved=solveFlightV2(spec),end=interceptFlightV2(solved,{kind:'groundstroke',stance:{x:14,y:40},afterBounceSeconds:.15}).time;
  const inert=JSON.parse(JSON.stringify({physicsV2:{...spec,endTimeSeconds:end,endpoint:'next-contact'}}));
  const a=compileSolvedLegV2(inert),b=compileSolvedLegV2(JSON.parse(JSON.stringify(inert)));
  for(const t of [end,.05,end/2,0,end-.000001,.17,end])assert.deepEqual(a.sample(t),b.sample(t));
  assert.equal(a.bounces,1);assert.equal(a.endpoint,'next-contact');
  assert.throws(()=>compileSolvedLegV2({physicsV2:{...spec,physicsVersion:'unknown'}}),/shared-solver/);
  assert.throws(()=>solveFlightV2({...spec,physicsVersion:'future'}),/Unsupported physics/);
  assert.throws(()=>solveFlightV2({...spec,from:{...spec.from,heightFeet:NaN}}),/finite/);
});

test('an unreachable model winner finishes visibly without being labelled a fault',()=>{
  const {play,timeline,findings}=compileDocument(readModel2Fixture('unreachable'));
  assert.deepEqual(findings,[]);assert.equal(timeline.outcome.reason,'unreachable');
  assert.equal(timeline.events.some(event=>event.type==='fault'),false);
  assert.ok(timeline.events.some(event=>event.type==='second-bounce'));
  assert.ok(timeline.events.some(event=>event.type==='dead'));
  assert.doesNotMatch(terminalCueLabel(terminalCueAtTime(timeline,timeline.duration)),/Fault/);
  const rules=validateModel2Rules(play,timeline);
  assert.equal(rules.expectedFaults.length,0);assert.equal(rules.expectedOutcomes.length,1);
  assert.equal(rules.outcome.reach.unreachable,true);
});

test('a reset-history flag cannot manufacture an expected NVZ fault with both feet grounded outside',()=>{
  const document=readModel2Fixture('nvz-foot'),shot=document.shots[0];
  shot.contactEvidence.feet=shot.contactEvidence.feet.map(foot=>({...foot,y:14}));
  shot.contactEvidence.feetEstablishedOutsideNVZ=false;
  assert.ok(shot.contactEvidence.feet.every(foot=>!isInNonVolleyZone(foot)));
  document.outcome.ruleRef='11.A.3';
  document.outcome.evidence={position:{...shot.contactEvidence.feet[0],heightFeet:0},afterContactSeconds:0};
  const before=JSON.stringify(document),result=compileDocument(document);
  const rules=validateModel2Rules(result.play,result.timeline);
  assert.equal(JSON.stringify(document),before);
  assert.equal(result.validShotCount,0);assert.equal(rules.valid,false);
  assert.ok(rules.violations.some(item=>item.code==='unsupported-reset-history'&&item.classification==='UNEXPECTED'));
  assert.equal(rules.expectedFaults.length,0);
  assert.notEqual(rules.outcome?.reason,'nvz-foot');
});

test('an Erne may follow a grounded pre-contact kitchen exit while contact feet remain decisive',()=>{
  const document=readModel2Fixture('erne');
  document.initialLayout.player1={x:.5,y:18};
  document.shots[0].contactEvidence.feet=[{x:-1.02,y:18},{x:-.18,y:18}];
  document.shots[0].contactEvidence.feetEstablishedOutsideNVZ=true;
  const result=compileDocument(document),segment=result.timeline.segments[0];
  const startFeet=sampleActorFeetV2(segment,'player1',0);
  const resetFeet=sampleActorFeetV2(segment,'player1',segment.contactTime*.8);
  const contactFeet=sampleActorFeetV2(segment,'player1',segment.contactTime);
  assert.ok(startFeet.every(isInNonVolleyZone),'the represented grounded approach starts in the kitchen');
  assert.ok(resetFeet.every(foot=>!isInNonVolleyZone(foot)),'both grounded feet reset before the volley');
  assert.ok(contactFeet.every(foot=>!isInNonVolleyZone(foot)));
  assert.equal(result.validShotCount,document.shots.length);
  assert.deepEqual(result.findings,[]);
  assert.deepEqual(validateModel2Rules(result.play,result.timeline).violations,[]);

  const illegal=structuredClone(document);
  illegal.shots[0].contactEvidence.feet=[{x:0,y:18},{x:.84,y:18}];
  const rejected=compileDocument(illegal),rules=validateModel2Rules(rejected.play,rejected.timeline);
  assert.equal(rejected.validShotCount,0);
  assert.equal(rules.valid,false);
  assert.equal(rules.outcome.reason,'nvz-foot');
  assert.equal(rules.outcome.ruleRef,'11.A.1');
  assert.ok(rules.violations.some(item=>item.code==='undeclared-terminal'));
});

test('explicit first-contact feet cannot teleport a far initial actor during short preparation',()=>{
  const document=readModel2Fixture('nvz-foot');
  const stance=document.shots[0].contactEvidence.feet.reduce((at,foot)=>({x:at.x+foot.x/2,y:at.y+foot.y/2}),{x:0,y:0});
  assert.ok(Math.hypot(stance.x-document.initialLayout.ball.x,stance.y-document.initialLayout.ball.y)<3,'the feet-to-ball check alone permits this contact');
  document.initialLayout.player1={x:18,y:-6};
  const before=JSON.stringify(document),result=compileDocument(document);
  assert.equal(JSON.stringify(document),before);
  assert.equal(result.validShotCount,0);
  assert.ok(result.timeline.segments[0].contactTime<.25,'the actual first-volley preparation is short');
  assert.ok(result.findings.some(item=>item.kind==='feasibility'&&item.severity==='error'&&item.message.includes('initial actor')));
});
