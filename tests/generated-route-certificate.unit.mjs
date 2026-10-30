import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2, inspectPendingLegV2, finishPlanningV2 } from '../play-planning-v2.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { certifyGeneratedRouteExclusionV1, matchesGeneratedRouteCertificateV1 } from '../generated-route-certificate-v1.js';
import { compileDocument } from '../play-compiler.js';
import { solveFlightV2 } from '../play-physics-v2.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';
const players={player1:{team:'green'},player2:{team:'green'},player3:{team:'orange'},player4:{team:'orange'}};
const synthetic=(x,lead=0)=>({play:{modelVersion:2,players},segment:{modelVersion:2,contactTime:lead,shotSemantics:{playerId:'player3'},previous:{positions:{player1:{x,y:0},player2:{x:x+5,y:0}}}},solved:{secondBounceTime:1,stages:[{startTime:0,endTime:1,vx:0,vz:0}],sampleBoard:()=>({x:0,y:0,heightFeet:0})}});
const cert=({play,segment,solved})=>certifyGeneratedRouteExclusionV1(play,segment,solved);
test('continuous endpoint envelope excludes all times and preserves zero-reaction generous reach',()=>{
 const c=cert(synthetic(13));assert.ok(c);assert.equal(c.parameters.peakFeetPerSecond,18);assert.equal(c.parameters.endpointFeetPerSecond,9);assert.ok(c.actors[0].continuousLowerBoundFeet<1);
 assert.equal(cert(synthetic(12)),null,'reachable endpoint boundary is never certified');
 assert.equal(cert(synthetic(13,.2)),null,'contact lead-in is available route travel');
 const momentum=synthetic(40);momentum.segment.model2Momentum=[{actor:'player1'}];assert.equal(cert(momentum),null);
 const changed=structuredClone(c);changed.parameters.peakFeetPerSecond=17;assert.equal(matchesGeneratedRouteCertificateV1(changed,c),false);
});
test('certificate samples retain continuous margin against between-grid crossing',()=>{
 const f=synthetic(20);f.solved.stages[0].vx=10000;f.solved.sampleBoard=t=>({x:10000*t,y:0});assert.equal(cert(f),null);
});
test('public compiler recomputes certificate and rejects altered proofs and geometry',()=>{
 const document=readModel2Fixture('unreachable');let result=compileDocument(document);
 const segment=(result.timeline.rawSegments||result.timeline.segments).filter(s=>s.shotSemantics).at(-1);
 const c=certifyGeneratedRouteExclusionV1(result.play,segment,solveFlightV2(segment.step.shot.physicsV2));assert.ok(c);
 const actor=[...c.actors].sort((a,b)=>a.continuousLowerBoundFeet-b.continuousLowerBoundFeet||a.actor.localeCompare(b.actor))[0].actor;
 document.outcome={...document.outcome,type:'fault',reason:'second-bounce',faultingActor:actor,evidence:{...document.outcome.evidence,generatedRouteCertificate:c}};
 result=compileDocument(document);assert.deepEqual(result.findings.filter(f=>f.severity==='error'),[]);assert.equal(result.timeline.outcome.reason,'second-bounce');assert.equal(result.timeline.outcome.ruleRef,'10.B.1');assert.equal(result.timeline.outcome.reach.model,'illustrative-reach-v1');
 const earlier=readModel2Fixture('net');earlier.outcome={...document.outcome,shotId:earlier.outcome.shotId};
 assert.ok(compileDocument(earlier).findings.some(f=>f.severity==='error'),'certificate never overrides an earlier net fault');
 const reachable=readModel2Fixture('second-bounce');reachable.outcome.evidence.generatedRouteCertificate=structuredClone(c);
 assert.ok(compileDocument(reachable).findings.some(f=>f.severity==='error'),'a failed or reachable search cannot borrow a certificate');
 const bad=structuredClone(document);bad.outcome.evidence.generatedRouteCertificate.actors[0].continuousLowerBoundFeet+=.001;
 assert.ok(compileDocument(bad).findings.some(f=>f.severity==='error'));
 const moved=structuredClone(document);moved.initialLayout[c.actors[0].actor].x-=.01;
 assert.ok(compileDocument(moved).findings.some(f=>f.severity==='error'));
});

test('owned planning inspects explicit certificates without changing its default result or source',()=>{
 const d=readModel2Fixture('unreachable'),state=createPlanningStateV2(d);
 for(const recipe of d.shots)commitPlanningTrialV2(state,trialRecipeV2(state,recipe));
 const inspected=inspectPendingLegV2(state),c=certifyGeneratedRouteExclusionV1(state.play,inspected.segment,inspected.solved);assert.ok(c);
 const actor=[...c.actors].sort((a,b)=>a.continuousLowerBoundFeet-b.continuousLowerBoundFeet||a.actor.localeCompare(b.actor))[0].actor;
 const outcome={...d.outcome,type:'fault',reason:'second-bounce',faultingActor:actor,evidence:{...d.outcome.evidence,generatedRouteCertificate:c}};
 const before=JSON.stringify(state.play),checked=inspectPendingLegV2(state,{outcome});
 assert.equal(checked.derivedOutcome.reason,'second-bounce');assert.equal(finishPlanningV2(state,{outcome}).derivedOutcome.reason,'second-bounce');
 assert.equal(inspectPendingLegV2(state).derivedOutcome.reason,'unreachable');assert.equal(JSON.stringify(state.play),before);
 const forged=structuredClone(outcome);forged.evidence.generatedRouteCertificate.actors[0].continuousLowerBoundFeet++;
 assert.equal(inspectPendingLegV2(state,{outcome:forged}).derivedOutcome.reason,'unreachable');
});
