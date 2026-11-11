import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulateRally} from '../rally-engine.js';
import {validateDocument} from '../play-document.js';
import {compileDocument} from '../play-compiler.js';
import {validateRallyRules} from '../rally-rules.js';
import {inspectGeneratedMovementV1,inspectGeneratedSpacingV1} from '../rally-movement.js';
import {assertCurrentProceduralResult,assertFixedExecutionPairs,assertFreshPhysicalResult} from './helpers/rally-procedural-proof.mjs';
const rows=JSON.parse(readFileSync(new URL('./fixtures/model2/m2-qualification-failures-v1.json',import.meta.url),'utf8'));
for(const row of rows)test(`examined regression ${row.id} independently completes after causal repair`,async()=>{
 const before=JSON.stringify(row.input),result=await simulateRally(structuredClone(row.input));
 assert.equal(result.status,'complete',JSON.stringify(result.diagnostics));
 assert.equal(JSON.stringify(row.input),before);validateDocument(result.document);
 const compiled=compileDocument(result.document),rules=validateRallyRules(compiled.play,compiled.timeline);
 assert.equal(compiled.validShotCount,result.document.shots.length,JSON.stringify(compiled.findings));
 assert.deepEqual(compiled.findings.filter(f=>f.severity==='error'),[]);assert.deepEqual(rules.violations,[]);
 assert.equal(inspectGeneratedMovementV1(compiled.timeline).valid,true);
 assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid,true);
 assert.deepEqual(result.outcome,result.document.outcome);
 // The original wide/post geometry and four-contact v1 proof are frozen in
 // rally-historical-causality.unit.mjs. Current motion has a separate exact
 // reviewed projection, while execution remains the original unaltered stream.
 assertCurrentProceduralResult(result,row.id);assertFixedExecutionPairs(result);assertFreshPhysicalResult(result);
 if(row.wide)assert.deepEqual(result.decisions[row.wide.contactIndex].draws.execution,row.wide.executionDraws);
 if(row.id==='holdout:intermediate:balanced:50439'){
  const d=result.decisions[8];
  assert.equal(d.execution.riskContext.kind,'settled-soft');
  assert.equal(d.execution.quality,'attackable');
  assert.ok(d.execution.draw>d.execution.probabilities.error,'the same draw is now above the measured settled-soft error threshold');
  assert.equal(result.decisions[9].situation.attackable,true);
 }
 if(row.originalFailure==='no-feasible-contact'){
  assert.equal(result.document.shots.length,5);
  assert.equal(result.outcome.reason,'long');assert.equal(result.outcome.shotId,'shot-5');
  assert.equal(result.outcome.evidence.generatedRouteCertificate,undefined);
  assert.equal(compiled.timeline.events.filter(event=>event.type==='contact').length,5,'the actual fifth contact is independently represented');
 }
});
