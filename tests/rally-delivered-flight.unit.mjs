import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeliveredFlightV1, applyExecutionV1 } from '../rally-quality.js';
import { planRallyFlightV1 } from '../rally-flight-planner.js';
import { solveFlightV2 } from '../play-physics-v2.js';
// Actual contacts and delivered source recipes from development-63016b5.jsonl;
// Pro 25 shot 13, Pro 50 shot 15, Advanced 50 shot 12. No archive runtime dependency.
const fixtures = [
  {
    "candidate": {
      "id": "speed-up",
      "intent": "speed-up",
      "family": "volley"
    },
    "contact": {
      "x": 9.126060327,
      "y": 17.199999999,
      "heightFeet": 3.954945992
    },
    "team": "green",
    "execution": {
      "quality": "low",
      "errorReason": null
    },
    "applied": {
      "target": {
        "x": 14.829505373,
        "y": 36.267670328
      },
      "physics": {
        "launchVerticalFeetPerSecond": -8.194495443
      },
      "pace": "firm",
      "arc": "low",
      "quality": "low"
    },
    "style": "pro"
  },
  {
    "candidate": {
      "id": "speed-up",
      "intent": "speed-up",
      "family": "volley"
    },
    "contact": {
      "x": 10.553998031,
      "y": 26.799999994,
      "heightFeet": 4.071399984
    },
    "team": "orange",
    "execution": {
      "quality": "low",
      "errorReason": null
    },
    "applied": {
      "target": {
        "x": 4.800801314,
        "y": 8.984889935
      },
      "physics": {
        "launchVerticalFeetPerSecond": -9.565884085
      },
      "pace": "firm",
      "arc": "low",
      "quality": "low"
    },
    "style": "pro"
  },
  {
    "candidate": {
      "id": "speed-up",
      "intent": "speed-up",
      "family": "volley"
    },
    "contact": {
      "x": 12.563403453,
      "y": 17.20000001,
      "heightFeet": 3.944010194
    },
    "team": "green",
    "execution": {
      "quality": "error",
      "errorReason": "long"
    },
    "applied": {
      "target": {
        "x": 5.165631101,
        "y": 46.467390849
      },
      "physics": {
        "launchVerticalFeetPerSecond": -2.579309586
      },
      "pace": "firm",
      "arc": "low",
      "quality": "error"
    },
    "style": "advanced"
  }
];

const archivedError = structuredClone(fixtures[2]);
fixtures[2].execution = { quality: 'low', errorReason: null };
fixtures[2].applied = applyExecutionV1({ execution: fixtures[2].execution, contact: fixtures[2].contact,
  team: fixtures[2].team, target: {x:5.527985711,y:34.990986555}, physics: {launchVerticalFeetPerSecond:-2.579309586},
  family:'volley',pace:'firm',arc:'low',draws:{lateral:.0470567368902266,depth:.48913028300739825} });
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function verify(input,result) {
  const independent=solveFlightV2({from:input.contact,...result.applied,family:input.candidate.family,quality:input.execution.quality});
  near(independent.launchSpeedMph,result.flight.launchSpeedMph);
  near(result.guidance.actual.launchSpeedMph,result.flight.launchSpeedMph);
  for(const fraction of [0,.3,.7,1]) for(const axis of ['x','y','heightFeet'])
    near(independent.sampleBoard(independent.firstLandingTime*fraction)[axis],result.flight.sampleBoard(result.flight.firstLandingTime*fraction)[axis]);
  assert.ok(result.guidance.trials.length<=6);
  assert.ok(result.guidance.plannerDiagnostics.solverCalls<=6);
  assert.ok(Object.isFrozen(result.guidance.actual.landing));
  assert.ok(result.flight.launchSpeedMph<=result.guidance.speedCeilingMph);
}
test('archived over-ceiling post-quality attacks receive bounded coherent same-target plans',()=>{
  for(const input of fixtures) {
    const before=JSON.stringify(input),wasFrozen=Object.isFrozen(input.applied.target),result=resolveDeliveredFlightV1(input);
    assert.equal(Object.isFrozen(input.applied.target),wasFrozen);
    assert.ok(result.flight.launchSpeedMph<=45);assert.ok(result.flight.launchSpeedMph>=22);
    assert.deepEqual(result.applied.target,input.applied.target);
    assert.equal(JSON.stringify(input),before);assert.deepEqual(resolveDeliveredFlightV1(input).guidance,result.guidance);
    assert.equal(result.flight.obstruction,null);verify(input,result);
    assert.equal(result.applied,result.solutions[0].applied);
    assert.equal(result.flight,result.solutions[0].flight);
    for(const [index,solution] of result.solutions.entries()) {
      assert.equal(solution.guidance.selectionIndex,index);assert.equal(solution.guidance.trials,result.guidance.trials);
      near(solution.guidance.actual.launchSpeedMph,solution.flight.launchSpeedMph);verify(input,solution);
    }
  }
});
test('supported high-contact attacks succeed in both directions',()=>{
  for(const original of fixtures.slice(0,2)) for(const heightFeet of [4.5,8.5]) for(const mirror of [false,true]) {
    const input=structuredClone(original);input.contact.heightFeet=heightFeet;
    if(mirror){input.contact.y=44-input.contact.y;input.applied.target.y=44-input.applied.target.y;input.team=input.team==='green'?'orange':'green';}
    const before=JSON.stringify(input),nominal=planRallyFlightV1({from:input.contact,target:input.applied.target,
      family:input.candidate.family,intent:input.candidate.intent,style:input.style,quality:input.execution.quality,
      pace:input.applied.pace,arc:input.applied.arc,preferred:input.applied.physics,allowNetFault:false});
    assert.equal(nominal.status,'solved');assert.equal(nominal.flight.obstruction,null);assert.ok(nominal.diagnostics.solverCalls<=6);
    const result=resolveDeliveredFlightV1(input);assert.equal(result.flight.obstruction,null);verify(input,result);
    assert.ok(result.flight.launchSpeedMph>=22);assert.equal(JSON.stringify(input),before);
  }
});
test('unsupported low-contact nominal attacks retain independently solved delivered net faults',()=>{
  for(const original of fixtures.slice(0,2)) for(const heightFeet of [.6,2.2]) for(const mirror of [false,true]) {
    const input=structuredClone(original);input.contact.heightFeet=heightFeet;
    if(mirror){input.contact.y=44-input.contact.y;input.applied.target.y=44-input.applied.target.y;input.team=input.team==='green'?'orange':'green';}
    const before=JSON.stringify(input);
    const nominal=planRallyFlightV1({from:input.contact,target:input.applied.target,family:input.candidate.family,
      intent:input.candidate.intent,style:input.style,quality:input.execution.quality,pace:input.applied.pace,
      arc:input.applied.arc,preferred:input.applied.physics,allowNetFault:false});
    assert.equal(nominal.status,'unavailable');assert.ok(nominal.diagnostics.solverCalls<=6);
    const result=resolveDeliveredFlightV1(input);
    assert.deepEqual(result.applied.target,input.applied.target);assert.equal(result.applied.quality,'low');
    for(const solution of result.solutions){
      assert.equal(solution.flight.obstruction.kind,'net');
      const independent=solveFlightV2({from:input.contact,...solution.applied,family:'volley',quality:'low'});
      assert.deepEqual(solution.flight.obstruction,independent.obstruction);
      assert.ok(solution.flight.launchSpeedMph>=22);verify(input,solution);
    }
    assert.equal(JSON.stringify(input),before);
  }
});
const families=['serve','return','drive','drop','reset','dink','lob','volley','overhead'];
function fixture(family,quality,errorReason,team) {
  const y=family==='lob'?3:family==='serve'?0:14;
  const destination=family==='lob'&&errorReason==='net'?23:family==='overhead'&&errorReason==='net'?24:['drop','reset','dink'].includes(family)?27:family==='overhead'?32:38;
  const contact={x:7,y:team==='green'?y:44-y,heightFeet:family==='overhead'?7.5:family==='volley'?3.5:2.2};
  const target={x:13,y:team==='green'?destination:44-destination},execution={quality,errorReason};
  const applied=applyExecutionV1({contact,target,team,family,execution,draws:{lateral:.5,depth:.5}});
  return {candidate:{family,intent:family},contact,team,execution,applied};
}
test('all nine families jointly solve every quality and intended error in both directions',()=>{
  for(const family of families) for(const quality of ['neutral','low','excellent','attackable','error'])
    for(const errorReason of quality==='error'?['net','long','wide']:[null]) for(const team of ['green','orange']) {
      const input=fixture(family,quality,errorReason,team),before=JSON.stringify(input),result=resolveDeliveredFlightV1(input);
      verify(input,result);assert.equal(JSON.stringify(input),before);
      assert.deepEqual(result.applied.target,input.applied.target);assert.equal(result.applied.quality,quality);
      if(errorReason==='net')assert.equal(result.flight.obstruction.kind,'net');
      else assert.equal(result.flight.obstruction,null);
      if(errorReason==='long')assert.ok(result.applied.target.y<0||result.applied.target.y>44);
      if(errorReason==='wide')assert.ok(result.applied.target.x<0||result.applied.target.x>20);
      if(family==='lob')assert.ok(result.flight.metadata.apexFeet>=15);
      if(family==='overhead')assert.ok(result.flight.metadata.launchVerticalFeetPerSecond<=0);
    }
});
test('soft popups retain their intended NVZ target while reported shape is measured',()=>{
  for(const family of ['dink','drop','reset']) for(const team of ['green','orange']) {
    const input=fixture(family,'attackable',null,team),before=JSON.stringify(input),result=resolveDeliveredFlightV1(input);
    const dink=family==='dink';
    near(result.applied.target.y,team==='green'?(dink?28.825:28.2):(dink?15.175:15.8));
    assert.equal(result.applied.physicalTransformation.kind,dink?'dink-popup':'soft-popup');
    assert.equal(result.applied.physicalTransformation.version,'rally-execution-physical-v3');
    if(dink){assert.equal(result.applied.physicalTransformation.dinkPopup.version,'rally-dink-popup-v1');near(result.flight.metadata.apexFeet,6.4);}
    assert.ok(result.applied.target.y>=15&&result.applied.target.y<=29);
    assert.equal(JSON.stringify(input),before);
    assert.equal(result.guidance.accepted,true);assert.ok(result.guidance.evidence.preferredDepartures.length);
    assert.ok(result.flight.metadata.netClearanceInches>=14);verify(input,result);
  }
});
test('archived 49.77 mph sampled error replays the original explicit physics unchanged',()=>{
  const original=solveFlightV2({from:archivedError.contact,...archivedError.applied,family:archivedError.candidate.family,quality:'error'});
  near(original.launchSpeedMph,49.76620213634538);
  const repeated=solveFlightV2({from:archivedError.contact,target:archivedError.applied.target,physics:archivedError.applied.physics,family:'volley',pace:'firm',arc:'low',quality:'error'});
  assert.deepEqual(repeated.metadata,original.metadata);
  for(const fraction of [0,.2,.6,1])assert.deepEqual(repeated.sampleBoard(repeated.firstLandingTime*fraction),original.sampleBoard(original.firstLandingTime*fraction));
  const generated=resolveDeliveredFlightV1(archivedError);assert.ok(generated.flight.launchSpeedMph<=50);verify(archivedError,generated);
});
test('known infeasible geometry rejects with bounded immutable evidence and no invented ending',()=>{
  const input=fixture('dink','excellent',null,'green');input.contact={x:0,y:0,heightFeet:.13};input.applied={...input.applied,target:{x:20,y:44}};
  const before=JSON.stringify(input);
  assert.throws(()=>resolveDeliveredFlightV1(input),error=>{
    assert.ok(error instanceof RangeError);assert.equal(error.guidance.accepted,false);assert.ok(error.guidance.trials.length<=6);
    assert.ok(Object.isFrozen(error.guidance.trials));assert.equal(error.outcome,undefined);return true;
  });assert.equal(JSON.stringify(input),before);
});

test('named fast intents keep actual attacking pace while a generic volley can remain a placement',()=>{
  for(const intent of ['speed-up','counter','firm-volley','put-away','overhead'])for(const team of ['green','orange']) {
    const input=fixture('volley','neutral',null,team);input.candidate.intent=intent;
    const result=resolveDeliveredFlightV1(input);assert.ok(result.flight.launchSpeedMph>=22);assert.ok(result.flight.launchSpeedMph<=45);verify(input,result);
  }
  const input=fixture('volley','neutral',null,'green');input.applied={...input.applied,target:{x:12,y:27},preferredFlight:{speedMph:14}};
  const result=resolveDeliveredFlightV1(input);assert.ok(result.flight.launchSpeedMph<22);verify(input,result);
  const serialized=JSON.stringify(result.guidance);assert.equal(typeof serialized,'string');
  const inspect=value=>{if(value&&typeof value==='object')for(const item of Object.values(value))inspect(item);else assert.notEqual(typeof value,'function');};
  inspect(result.guidance);
});
