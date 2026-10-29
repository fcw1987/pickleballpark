import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngineDriverV1} from '../rally-engine-driver.js';
import {runNaturalAttemptV1} from '../rally-engine.js';

function controlled({targetAfterExecution=.5}={}){
 const events=[];let executions=0;
 const run=createEngineDriverV1((input,controls)=>runNaturalAttemptV1(input,{...controls,random:{...controls.random,
  intent:()=>{events.push('intent');return .5},target:()=>{events.push('target');return executions?targetAfterExecution:.5},
  execution:()=>{events.push('execution');executions++;return .999},narration:()=>{events.push('narration');return .5}}}),{yieldControl:async()=>{}});
 return {run,events,get executions(){return executions}};
}

test('a supported nominal target and route precede the single execution draw pair',async()=>{
 const c=controlled(),result=await c.run({seed:0,options:{maxShots:1}});
 assert.equal(result.status,'censored',JSON.stringify(result.diagnostics));
 assert.equal(c.executions,2);
 const first=c.events.indexOf('execution');
 assert.ok(c.events.slice(0,first).filter(x=>x==='target').length>=2,'nominal target draws come before quality');
 assert.ok(c.events.slice(0,first).includes('intent'));
 assert.deepEqual(c.events.slice(first,first+4),['execution','execution','target','target']);
 const attempts=result.decisions[0].resolution.choiceAttempts;
 assert.equal(attempts.filter(a=>a.executionDraws).length,1);
 assert.deepEqual(attempts.at(-1).executionDraws,result.decisions[0].draws.execution);
 assert.equal(result.stats.generatedFlightFeasibility.status,'PASS');
});

test('exhausted unsafe nominal serves consume no quality or error draws',async()=>{
 const c=controlled(),result=await c.run({seed:31,layout:{player1:{x:5,y:1},player2:{x:15,y:-1},player3:{x:15,y:42},player4:{x:5,y:30},ball:{x:4.2,y:2}}});
 assert.equal(result.status,'failed');assert.equal(result.document,null);assert.equal(result.outcome,null);
 assert.equal(result.diagnostics.code,'bounded-feasible-intents-exhausted');
 assert.equal(c.executions,0);assert.equal(c.events.includes('execution'),false);
 assert.deepEqual(result.decisions,[]);
});

test('a construction exception after execution cannot redraw quality or try another intent',async()=>{
 // Inject an unsupported perturbation only after a feasible nominal. Production
 // streams are finite; this seam checks the construction-failure state machine,
 // not a natural-rate observation or a promised physically feasible shot.
 const c=controlled({targetAfterExecution:NaN}),result=await c.run({seed:0,options:{maxShots:1}});
 assert.equal(result.status,'failed');assert.equal(result.diagnostics.code,'unsupported-execution');
 assert.equal(result.document,null);assert.equal(result.outcome,null);assert.equal(c.executions,2);
 const failure=result.diagnostics.producer.executionFailure;
 assert.equal(failure.execution.quality,'neutral');assert.deepEqual(failure.executionDraws,{quality:.999,error:.999});
 assert.equal(failure.choiceAttempts.filter(a=>a.executionDraws).length,1);
 assert.equal(c.events.filter(x=>x==='intent').length,1,'no intent redraw can filter the execution');
 assert.deepEqual(result.decisions,[]);
});
