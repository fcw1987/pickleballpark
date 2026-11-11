import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runNaturalAttemptV1, RALLY_ENGINE_LIMITS} from '../rally-engine.js';
import {createEngineDriverV1} from '../rally-engine-driver.js';
import {assertFreshPhysicalResult} from './helpers/rally-procedural-proof.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/model2/generated-time-refinement-witnesses-v1.json',import.meta.url),'utf8'));
for(const row of fixture.cases)test(`bounded contact search retains actual prior draws and makes a real supported reply: ${row.id}`,async()=>{
  let executionCalls=0;
  const simulate=createEngineDriverV1((input,controls)=>runNaturalAttemptV1(input,{...controls,
    random:{...controls.random,execution:()=>{executionCalls++;return controls.random.execution();}}}),{yieldControl:async()=>{}});
  const before=JSON.stringify(row.input),result=await simulate(row.input);
  assert.equal(result.status,'complete',JSON.stringify(result.diagnostics));
  assertFreshPhysicalResult(result);
  assert.deepEqual(result.decisions.slice(0,row.prefixDraws.length).map(d=>d.draws),row.prefixDraws);
  assert.equal(executionCalls,2*result.document.shots.length,'nominal time search cannot sample and discard an execution');
  assert.ok(result.document.shots.length>row.prefixDraws.length,'a new independently represented reply is required');
  const refinements=result.diagnostics.producer.contactTimeRefinements??[];
  const refinement=refinements.find(item=>item.contactIndex===row.prefixDraws.length);
  if(row.originalCode==='no-feasible-contact'){
    assert.ok(refinement,'the two between-sample contacts still require real time refinement');
    assert.equal(refinement.intervalsPerPhase,64);
    // Current contact-facing support admits ordinary contact proposals first,
    // but their nominal intents exhaust before this still-required time pass.
    assert.equal(refinement.trigger,'nominal-opportunities-exhausted');
  }else{
    // These three historical nominal-exhaustion witnesses now have a supported
    // non-attacking drive in the first pass. Do not run an unnecessary fallback
    // merely to preserve the older mechanism's diagnostic.
    assert.equal(refinement,undefined,'a supported first-pass reply needs no time fallback');
  }
  for(const item of refinements){
    assert.equal(item.intervalsPerPhase,64);
    assert.ok(['no-supported-contact','nominal-opportunities-exhausted'].includes(item.trigger));
  }
  assert.equal(RALLY_ENGINE_LIMITS.maxContactTimePasses,2);assert.equal(RALLY_ENGINE_LIMITS.maxContactPairs,4);
  for(const d of result.decisions)assert.equal(d.resolution.choiceAttempts.filter(a=>a.executionDraws).length,1);
  assert.equal(JSON.stringify(row.input),before);
});
