import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExaminedRegressionScheduleV1, compareRallyResultsV1, deterministicResultProjectionV1, runRequiredRegressionV1,
 recordRegressionRepeatV1, finalizeRegressionReportV1, persistRegressionInterruptionV1 } from '../tools/rally-regression-v1.mjs';
import { createCohortSchedule } from '../tools/rally-realism-v2.mjs';

test('required regression is the complete examined input schedule with separate immutable identity',()=>{
 const jobs=createExaminedRegressionScheduleV1(),original=createCohortSchedule({cohort:'holdout'});
 assert.equal(jobs.length,3600);assert.equal(new Set(jobs.map(j=>j.id)).size,3600);
 assert.deepEqual(jobs.map(j=>j.input),original.map(j=>j.input));
 assert.ok(jobs.every(j=>j.cohort==='examined-regression'&&j.id===`examined-regression:${j.style}:balanced:${j.seed}`));
 for(const style of['pro','advanced','intermediate']){
  const rows=jobs.filter(j=>j.style===style);assert.equal(rows.length,1200);
  assert.equal(rows[0].seed,50000);assert.equal(rows.at(-1).seed,51199);
  for(const [server,court]of[['player1','right'],['player1','left'],['player3','right'],['player3','left']])assert.equal(rows.filter(j=>j.input.service.server===server&&j.input.service.court===court).length,300);
 }
 assert.ok(Object.isFrozen(jobs[0].input.options));assert.throws(()=>{jobs[0].input.seed=42;},TypeError);
});

test('determinism covers all delivered fields and tolerates only observational diagnostics',()=>{
 const first={status:'complete',document:{id:'point',shots:[]},outcome:{reason:'net'},decisions:[{draw:.2}],stats:{shots:1},recipe:{seed:0},outcomeClassification:{kind:'unknown'},diagnostics:{elapsed:2}},second=structuredClone(first);
 second.diagnostics.elapsed=20;assert.equal(compareRallyResultsV1('j',first,second).firstSha256,compareRallyResultsV1('j',first,second).secondSha256);
 for(const key of Object.keys(deterministicResultProjectionV1(first))){const changed=structuredClone(second);changed[key]=null;const c=compareRallyResultsV1('j',first,changed);assert.notEqual(c.firstSha256,c.secondSha256,key);}
 const reordered={...second,document:{shots:[],id:'point'}};const c=compareRallyResultsV1('j',first,reordered);assert.equal(c.firstSha256,c.secondSha256);
});

test('runner refuses absent, aliased and existing output paths before any generation',async()=>{
 await assert.rejects(runRequiredRegressionV1({}),/Distinct/);
 await assert.rejects(runRequiredRegressionV1({output:'same',archive:'same'}),/Distinct/);
 await assert.rejects(runRequiredRegressionV1({output:'package.json',archive:'never-written.jsonl'}),/Refusing existing/);
});

test('required workflow invokes examined regression without weakening its gate or consuming qualification',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/quality.yml',import.meta.url),'utf8');
 const block=workflow.split('  rally-calibration:')[1].split('  quality-gate:')[0];
 assert.match(block,/name: Rally physical regression/);assert.match(block,/tools\/rally-regression-v1\.mjs/);
 assert.match(block,/--require-clean/);assert.doesNotMatch(block,/--cohort holdout|continue-on-error|--require-calibration/);
 assert.match(workflow,/needs: \[checks, chromium, webkit, package, rally-calibration\]/);
});

test('cancelling the last independent repeat passes its signal and preserves the original observation',async()=>{
 const controller=new AbortController(),persisted=[];
 const record={job:{id:'last',input:{seed:5}},result:{status:'complete',document:{id:'preserved'}}};
 await assert.rejects(recordRegressionRepeatV1(record,{signal:controller.signal,
  generate:async input=>{assert.equal(input.signal,controller.signal);controller.abort();return{status:'cancelled'};},
  persist:async value=>persisted.push(structuredClone(value))}),error=>error.name==='AbortError'&&error.phase==='independent-repeat');
 assert.equal(persisted.length,1);assert.equal(persisted[0].result.document.id,'preserved');
 assert.equal(persisted[0].interruption.repeatedResult.status,'cancelled');assert.equal(persisted[0].determinism,undefined);
});

test('an interrupted collector starts no new independent repeat',async()=>{
 const controller=new AbortController();controller.abort();let generated=0,persisted=0;
 await assert.rejects(recordRegressionRepeatV1({job:{id:'next',input:{seed:6}},result:{status:'complete'}},
  {signal:controller.signal,generate:async()=>generated++,persist:async()=>persisted++}),/interrupted/);
 assert.equal(generated,0);assert.equal(persisted,1);
});

test('interruption during final archive hashing cannot publish acceptance',async()=>{
 const controller=new AbortController();let published=0;
 await assert.rejects(finalizeRegressionReportV1({releaseAcceptance:{status:'PASS'}},{signal:controller.signal,
  hashArchive:async()=>{controller.abort();return'abc';},publish:async()=>published++}),
  error=>error.name==='AbortError'&&error.phase==='archive-hashing');
 assert.equal(published,0);
});

test('interruption during final report writing cannot return a successful completion',async()=>{
 const controller=new AbortController();let published=0;
 await assert.rejects(finalizeRegressionReportV1({releaseAcceptance:{status:'PASS'}},{signal:controller.signal,
  hashArchive:async()=>'abc',publish:async()=>{published++;controller.abort();}}),
  error=>error.name==='AbortError'&&error.phase==='report-publication');
 assert.equal(published,1,'the runner must replace this run’s own output with its interrupted failure report');
});

test('final publication cancellation leaves a failed report and exact partial archive on disk',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'rally-interruption-'));
 const output=join(directory,'report.json'),archive=join(directory,'records.jsonl'),controller=new AbortController();
 const bytes='{"preserved":"first result"}\n';await writeFile(archive,bytes);let outputCreated=false;
 try{
  await assert.rejects((async()=>{
   try{await finalizeRegressionReportV1({releaseAcceptance:{status:'PASS'}},{signal:controller.signal,
    hashArchive:async()=>'abc',publish:async value=>{await writeFile(output,JSON.stringify(value),{flag:'wx'});outputCreated=true;controller.abort();}});}
   catch(error){await persistRegressionInterruptionV1({output,archive,sourceRevision:'source',persistedRecords:1,error,outputCreated});throw error;}
  })(),/interrupted/);
  const report=JSON.parse(await readFile(output,'utf8'));assert.equal(report.status,'INTERRUPTED');
  assert.equal(report.releaseAcceptance.status,'FAIL');assert.equal(report.persistedRecords,1);
  assert.equal(await readFile(archive,'utf8'),bytes);
 }finally{await rm(directory,{recursive:true,force:true});}
});
