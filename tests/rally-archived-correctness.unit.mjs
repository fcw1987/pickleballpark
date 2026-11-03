import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulateRally} from '../rally-engine.js';
import {validateDocument} from '../play-document.js';
import {compileDocument} from '../play-compiler.js';
import {validateRallyRules} from '../rally-rules.js';
import {inspectGeneratedMovementV1,inspectGeneratedSpacingV1} from '../rally-movement.js';
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
 if(row.wide){
  const d=result.decisions[row.wide.contactIndex];assert.equal(d.chosen.id,row.wide.chosenId);
  assert.equal(d.execution.quality,'error');assert.equal(d.execution.errorReason,'wide');
  for(const [key,expected]of[['execution',row.wide.executionDraws],['target',row.wide.targetDraws],['perturbation',row.wide.perturbationDraws]])assert.deepEqual(d.draws[key],expected);
  assert.deepEqual(d.resolution.target,row.wide.target);
  assert.equal(d.resolution.deliveredGuidance.incidentalAroundPost,true);
  assert.equal(d.resolution.deliveredGuidance.nominalRoute,'over-net');
  assert.equal(d.chosen.intent==='around-the-post',false,'execution error is not a tactical signature');
  assert.ok(result.outcome.reason!=='unreachable','the actual earliest fault remains authoritative');
 }
 if(row.originalFailure==='no-feasible-contact'){
  assert.equal(result.document.shots.length,4,'the certificate adds no invented contact');
  assert.equal(result.outcome.reason,'second-bounce');assert.equal(result.outcome.type,'fault');
  assert.equal(result.outcome.ruleRef,'10.B.1');assert.equal(result.outcome.faultingActor,'player1');
  const c=result.outcome.evidence.generatedRouteCertificate;assert.equal(c.version,'generated-contact-endpoint-route-v1');
  assert.ok(c.actors.every(a=>a.continuousLowerBoundFeet>0));
  assert.equal(rules.expectedOutcomes[0].reach.unreachable,false,'the broader reach model retains its uncertainty');
  assert.deepEqual(rules.expectedOutcomes[0].generatedRouteCertificate.actors.map(a=>a.actor),c.actors.map(a=>a.actor));
 }
});
