import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeliveredFlightV1, applyExecutionV1 } from '../rally-quality.js';
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

// The third archive entry is a sampled wide error: preserve it separately,
// then regenerate its actual opportunity with a low quality (no new draws).
const archivedError = structuredClone(fixtures[2]);
fixtures[2].execution = { ...fixtures[2].execution, quality: 'low', errorReason: null };
fixtures[2].applied = applyExecutionV1({ execution: fixtures[2].execution, contact: fixtures[2].contact,
  team: fixtures[2].team, target: {"x": 5.527985711, "y": 34.990986555}, physics: {"launchVerticalFeetPerSecond": -2.579309586},
  family: 'volley', pace: 'firm', arc: 'low', draws: {"lateral": 0.0470567368902266, "depth": 0.48913028300739825} });
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
function verify(input, result) {
  const independently = solveFlightV2({ from: input.contact, ...result.applied, family: input.candidate.family, quality: input.execution.quality });
  near(independently.launchSpeedMph,result.flight.launchSpeedMph);
  near(result.guidance.actual.launchSpeedMph,result.flight.launchSpeedMph);
  for (const axis of ['x','y']) near(result.flight.landing[axis],result.applied.target[axis]);
  const start=result.flight.sampleBoard(0), end=result.flight.sampleBoard(result.flight.firstLandingTime);
  for (const axis of ['x','y','heightFeet']) near(start[axis],input.contact[axis]);
  near(end.heightFeet,result.flight.landing.heightFeet);
  assert.ok(result.guidance.trials.length<=11);
  assert.ok(Object.isFrozen(result.guidance.actual.landing));
  assert.equal(result.flight.obstruction,null);
}
test('actual archived over-ceiling post-quality attacks receive coherent same-target repairs',()=>{
  assert.equal(fixtures.length,3);
  for(const input of fixtures){
    const before=JSON.stringify(input), result=resolveDeliveredFlightV1(input);
    if(input !== fixtures[2]) assert.ok(result.guidance.source.launchSpeedMph>45);
    assert.ok(result.flight.launchSpeedMph<=45);
    if(input !== fixtures[2]) assert.equal(result.guidance.repaired,true);
    assert.deepEqual(result.applied.target,input.applied.target);
    assert.ok(result.guidance.actual.netClearanceInches>=result.guidance.source.netClearanceInches);
    assert.equal(JSON.stringify(input),before);
    assert.deepEqual(resolveDeliveredFlightV1(input).guidance,result.guidance);
    verify(input,result);
  }
});
test('mirrored attacks and low/high contacts repair or reject with finite bounded evidence',()=>{
  for(const original of fixtures) for(const heightFeet of [.6,2.2,4.5,8.5]) for(const mirror of [false,true]) {
    const input=structuredClone(original);
    input.contact.heightFeet=heightFeet;
    if(mirror){ input.contact.y=44-input.contact.y;input.applied.target.y=44-input.applied.target.y;input.team='orange'; }
    input.applied.physics={launchVerticalFeetPerSecond: original.applied.physics.launchVerticalFeetPerSecond};
    try { const r=resolveDeliveredFlightV1(input);assert.ok(r.flight.launchSpeedMph<=45);verify(input,r); }
    catch(error){ assert.ok(error instanceof RangeError);assert.ok(error.guidance);assert.equal(error.guidance.accepted,false);assert.ok(error.guidance.trials.length<=11); }
  }
});
test('sampled net/long/wide errors preserve source geometry and report exceptional actual measurements',()=>{
  for(const team of ['green','orange']) for(const errorReason of ['net','long','wide']) {
    const contact={x:7,y:team==='green'?14:30,heightFeet:4.1},execution={quality:'error',errorReason};
    const applied=applyExecutionV1({contact,team,execution,target:{x:7,y:team==='green'?35:9},physics:{launchVerticalFeetPerSecond:-4},family:'volley',pace:'firm',arc:'low',draws:{lateral:.6,depth:.5}});
    const input={candidate:{family:'volley',intent:'speed-up'},contact,team,execution,applied};
    const r=resolveDeliveredFlightV1(input), original=solveFlightV2({from:contact,...applied,family:'volley'});
    assert.equal(r.applied,applied);near(r.flight.launchSpeedMph,original.launchSpeedMph);
    assert.deepEqual(r.flight.landing,original.landing);assert.equal(r.guidance.speedCeilingMph,null);
    assert.equal(r.guidance.trials.length,1);assert.ok(r.guidance.limitations.some(x=>x.includes('Sampled error')));
    if(errorReason==='net') assert.equal(r.flight.terminal.reason,'net');
    if(errorReason==='long') assert.ok(r.flight.landing.y<0||r.flight.landing.y>44);
    if(errorReason==='wide') assert.ok(r.flight.landing.x<0||r.flight.landing.x>20);
  }
});
test('illustrative diagnostics do not enforce every family range or rewrite popups',()=>{
  const contact={x:7,y:14,heightFeet:2.2},execution={quality:'attackable',errorReason:null};
  const applied=applyExecutionV1({contact,execution,team:'green',target:{x:7,y:29},family:'dink',pace:'soft',arc:'medium',draws:{lateral:.5,depth:.5}});
  const r=resolveDeliveredFlightV1({candidate:{family:'dink',intent:'middle-dink'},contact,execution,team:'green',applied});
  assert.equal(r.applied,applied);assert.equal(r.guidance.trials.length,1);assert.ok(r.flight.metadata.netClearanceInches>=14);
  assert.equal(r.guidance.diagnostics.length,3);assert.equal(r.guidance.accepted,true);
});
test('actual archived 49.77 mph sampled error remains an independently solved visible exception',()=>{
  const r=resolveDeliveredFlightV1(archivedError);
  assert.ok(r.flight.launchSpeedMph>49);
  assert.equal(r.guidance.repaired,false);
  assert.deepEqual(r.applied.target,archivedError.applied.target);
  assert.ok(r.guidance.diagnostics.some(d=>d.metric==='speedMph'&&d.withinRange===false));
});
test('unavailable coherent attack rejects with bounded immutable evidence rather than fabricated result',()=>{
  const input={candidate:{intent:'counter',family:'volley'},contact:{x:7,y:14,heightFeet:30},team:'green',
    execution:{quality:'neutral'},applied:{target:{x:7,y:52},physics:{launchVerticalFeetPerSecond:-80},pace:'firm',arc:'low'}};
  assert.throws(()=>resolveDeliveredFlightV1(input),error=>{
    assert.ok(error instanceof RangeError);assert.equal(error.guidance.accepted,false);
    assert.ok(error.guidance.trials.length<=11);assert.ok(Object.isFrozen(error.guidance.trials));
    assert.ok(error.guidance.source.launchSpeedMph>45);return true;
  });
});
