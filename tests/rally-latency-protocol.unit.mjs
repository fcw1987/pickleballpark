import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateLatencyProtocolV1} from '../tools/run-rally-latency-diagnostic-v1.mjs';
const protocol=()=>readFile(new URL('../tools/rally-latency-diagnostic-v1.json',import.meta.url),'utf8').then(JSON.parse);

test('diagnostic declares every archived input and exactly two balanced blocks before sampling',async()=>{
 const p=await protocol();assert.equal(validateLatencyProtocolV1(p),p);
 assert.equal(p.inputs.length,114);assert.equal(p.measurement.timedFirstGenerations,912);
 assert.equal(p.measurement.independentRepeats,456);assert.equal(p.measurement.totalRallyCalls,1368);
 assert.deepEqual(p.blocks[1].order,[...p.blocks[0].order].reverse());
 for(const key of['warmupExclusions','sampleExclusions'])assert.equal(p.measurement[key],0);
 for(const key of['forcedGC','removedYields','latencySubtraction'])assert.equal(p.measurement[key],false);
});
for(const[name,change]of[
 ['replacement input',p=>p.inputs[0].input.seed++],['sample removal',p=>p.inputs.pop()],
 ['changed block order',p=>p.blocks[1].order.reverse()],['changed runtime',p=>p.currentRuntimeRevision='0'.repeat(40)]
])test(`diagnostic rejects ${name}`,async()=>{const p=await protocol();change(p);assert.throws(()=>validateLatencyProtocolV1(p));});

test('diagnostic workflow cannot replace or automatically invoke release Quality',async()=>{
 const text=await readFile(new URL('../.github/workflows/m2-latency-diagnostic.yml',import.meta.url),'utf8');
 assert.match(text,/not release acceptance/);assert.match(text,/branches: \[diagnostic\/m2-latency-four-cell-v1\]/);
 assert.match(text,/runs-on: ubuntu-24\.04/);assert.match(text,/node-version: 24\.22\.1/);
 assert.doesNotMatch(text,/pull_request:|workflow_run:|continue-on-error|rally-regression-v1\.mjs|matrix:/);
 assert.match(text,/if: always\(\)/);assert.match(text,/if-no-files-found: error/);
});
