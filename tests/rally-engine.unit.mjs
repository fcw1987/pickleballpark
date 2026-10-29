import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateRally, createRallySimulator, runNaturalAttemptV1 } from '../rally-engine.js';
import { createEngineDriverV1 } from '../rally-engine-driver.js';
import { normalizeRallyInputV1 } from '../rally-recipe.js';
import { validateDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { samplePlayState } from '../three-d-core.js';
import { eligibleHitters, resolveServiceContext } from '../rally-state.js';
import { isInNonVolleyZone } from '../court-geometry.js';

const IDS=['player1','player2','player3','player4'];
const clone=value=>structuredClone(value);
const plain=record=>JSON.stringify(record);
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<=1e-6,`${message}: ${actual} versus ${expected}`);
const noDocument=result=>{
  assert.equal(result.document,null);assert.equal(result.outcome,null);
  assert.equal(result.stats,null);assert.equal(result.outcomeClassification,null);
};

function validateResult(result) {
  assert.ok(['complete','censored'].includes(result.status),plain(result.diagnostics));
  const document=result.document,before=plain(document);
  assert.equal(validateDocument(document),document);
  const compiled=compileDocument(document),rules=validateRallyRules(compiled.play,compiled.timeline);
  assert.equal(compiled.validShotCount,document.shots.length,plain(compiled.findings));
  assert.deepEqual(compiled.findings.filter(item=>item.severity==='error'),[]);
  assert.equal(rules.valid,true,plain(rules.violations));assert.deepEqual(rules.violations,[]);
  const movement=inspectGeneratedMovementV1(compiled.timeline),spacing=inspectGeneratedSpacingV1(compiled.timeline);
  assert.equal(movement.valid,true,plain(movement));assert.ok(movement.maxPeakFeetPerSecond<=18+1e-6);
  assert.equal(spacing.valid,true,plain(spacing));assert.ok(spacing.minimumSeparationFeet>=2.5-1e-6);
  assert.equal(compiled.timeline.events.filter(event=>event.type==='contact').length,document.shots.length);
  assert.equal(result.decisions.length,document.shots.length);
  assert.deepEqual(result.recipe,document.generation);
  assert.equal(document.generation.generatorVersion,'rally-engine-v1');
  for(const id of IDS)assert.deepEqual(Object.keys(document.players[id]).sort(),['handedness','team']);
  if(result.status==='complete'){
    assert.deepEqual(result.outcome,document.outcome);
    assert.ok(['winner','fault'].includes(result.outcome.type),'physical type must not be a causal quality label');
    const match=rules.expectedOutcomes.find(item=>['shotId','reason','winner','ruleRef','faultingActor','struckActor']
      .every(key=>(item[key]??null)===(result.outcome[key]??null)));
    assert.ok(match,'the outcome needs real independently validated evidence');
    for(const axis of ['x','y','heightFeet'])close(result.outcome.evidence.position[axis],match.position[axis],`outcome ${axis}`);
    close(result.outcome.evidence.afterContactSeconds,match.afterContactSeconds,'outcome time');
    assert.equal(compiled.timeline.events.filter(event=>event.type==='dead').length,1);
    assert.ok(result.outcomeClassification===null||result.outcomeClassification.version==='rally-causation-v1');
  }else{
    assert.equal(document.ending,'stop');assert.equal(document.outcome,undefined);
    assert.equal(result.outcome,null);assert.equal(result.outcomeClassification,null);
    assert.deepEqual(rules.expectedOutcomes,[]);assert.equal(compiled.timeline.outcome,null);
  }
  const segments=compiled.timeline.segments.filter(segment=>segment.shotSemantics),service=resolveServiceContext(document);
  for(let index=0;index<document.shots.length;index++){
    const shot=document.shots[index],decision=result.decisions[index],segment=segments[index];
    assert.equal(decision.shotId,shot.id);assert.equal(decision.situation.contactIndex,index);
    const eligible=eligibleHitters({players:document.players,service,contactIndex:index,previousHitter:document.shots[index-1]?.hitter??null});
    assert.ok(eligible.includes(shot.hitter),'a tactical preference cannot override service or team eligibility');
    const selected=decision.candidates.find(candidate=>candidate.id===decision.chosen.id);
    assert.ok(selected,'the chosen intent must come from the pre-choice candidate set');
    assert.equal(selected.intent,shot.intent);assert.equal(selected.family,shot.family);
    assert.ok(selected.weight>0&&selected.probability>0);
    close(decision.candidates.reduce((sum,candidate)=>sum+candidate.probability,0),1,'candidate probabilities');
    for(const candidate of decision.candidates){
      assert.ok(Number.isFinite(candidate.weight)&&candidate.weight>=0);
      assert.ok(Number.isFinite(candidate.probability)&&candidate.probability>=0&&candidate.probability<=1);
      assert.ok(Array.isArray(candidate.reasons)&&candidate.reasons.length>0);
    }
    for(const key of ['chosen','execution','draws','outcome','resolution'])assert.equal(Object.hasOwn(decision.situation,key),false,`pre-choice snapshot must exclude ${key}`);
    assert.ok(shot.narration.label.length>0&&shot.narration.label.length<=40);
    assert.ok(shot.narration.why.length>0&&shot.narration.why.length<=160);
    assert.doesNotMatch(shot.narration.label+shot.narration.why,/[<>\u0000-\u001f]|https?:\/\//i);
    assert.equal(segment.step.label,shot.narration.label);assert.equal(segment.step.description,shot.narration.why);
    assert.equal(shot.authoring.ownership,'automatic');
    assert.ok(shot.authoring.fields.every(field=>Object.hasOwn(shot,field)));
    assert.deepEqual(shot.generation,{seed:document.generation.selection.selectedSeed,generatorVersion:'rally-engine-v1'});
    const at=segment.startTime+segment.contactTime;
    close(decision.situation.contactTimeSeconds,at,'recorded contact time');
    assert.ok(decision.situation.sampleTimeSeconds<=at+1e-6,'pre-choice sample cannot occur after contact');
    const sampled=samplePlayState(compiled.timeline,decision.situation.sampleTimeSeconds);
    if(index>0)assert.ok(segment.shotSemantics.contact.point.heightFeet<=8.5+1e-6,'a grounded contact cannot claim an unreachable overhead height');
    for(const actor of IDS)for(const axis of ['x','y'])close(decision.situation.positions[actor][axis],sampled.positions[actor][axis],`decision ${index+1}/${actor}/${axis}`);
    for(const axis of ['x','y','heightFeet']){
      close(decision.situation.contact[axis],segment.shotSemantics.contact.point[axis],`decision ${index+1} contact ${axis}`);
      close(decision.resolution.actualContact[axis],segment.shotSemantics.contact.point[axis],`resolved contact ${axis}`);
    }
    assert.deepEqual(decision.resolution.actualFeet,shot.contactEvidence.feet);
    if(shot.contactTiming?.beforeBounceSeconds!==undefined){
      assert.ok(index>0);assert.equal(shot.contactMode,'volley');
      assert.equal(segment.shotSemantics.contact.kind,'volley');
      const prior=segments[index-1],incoming=prior.trajectory.solved;
      close(incoming.firstLandingTime-prior.step.shot.physicsV2.endTimeSeconds,shot.contactTiming.beforeBounceSeconds,'pre-bounce intercept time');
      assert.ok(shot.contactEvidence.feet.every(foot=>!isInNonVolleyZone(foot)),'a volley over the NVZ still needs grounded feet outside it');
    }
    const outside=shot.contactEvidence.feet.every(foot=>!isInNonVolleyZone(foot));
    assert.equal(decision.situation.hitterFootState.outsideNVZ,outside);
    assert.equal(decision.situation.hitterFootState.grounded,true);
    assert.equal(decision.situation.hitterFootState.establishedOutsideNVZ,shot.contactEvidence.feetEstablishedOutsideNVZ);
  }
  assert.equal(plain(document),before,'validation and observation must preserve generated source');
  return compiled;
}

for(const seed of [0,1,2,3,7])test(`real natural seed ${seed} has complete independently valid physical and decision evidence`,async()=>{
  const input={seed},before=plain(input),result=await simulateRally(input);
  assert.equal(result.status,'complete',plain(result.diagnostics));validateResult(result);
  assert.equal(plain(input),before);assert.equal(result.diagnostics.attempts,1);
  assert.equal(result.recipe.selection.attempts,1);assert.equal(result.recipe.selection.selectedAttempt,0);
});

for(const team of ['green','orange'])for(const court of ['right','left'])for(const hand of ['right','left']){
  test(`real generation respects ${team} ${court} service with ${hand}-handed players`,async()=>{
    const players=Object.fromEntries(IDS.map((id,index)=>[id,{team:index<2?'green':'orange',handedness:hand,style:'advanced',flavour:'balanced'}]));
    const server=team==='green'?(hand==='right'?'player1':'player2'):(hand==='right'?'player3':'player4');
    const receiver=team==='green'?(hand==='right'?'player3':'player4'):(hand==='right'?'player1':'player2');
    const input={seed:0,players,service:{server,receiver,court,courtConvention:'server-perspective-v1'}},before=plain(input);
    const normalized=normalizeRallyInputV1(input);
    const result=await simulateRally(input);assert.equal(result.status,'complete',plain(result.diagnostics));
    const compiled=validateResult(result),document=result.document;
    assert.deepEqual(document.generation.input,{players:normalized.players,layout:normalized.layout,service:normalized.service,options:normalized.options});
    assert.equal(plain(input),before);assert.equal(document.shots[0].hitter,server);
    assert.equal(document.initialLayout[server].x,(team==='green')===(court==='right')?5:15);
    assert.ok(team==='green'?document.initialLayout[server].y<0:document.initialLayout[server].y>44);
    assert.ok(document.shots.length>=3,'this fixed service probe exercises the return and third bounce');
    assert.equal(document.shots[1].hitter,receiver);
    for(const [index,priorLeg]of [[1,1],[2,2]]){
      const contact=compiled.timeline.events.find(event=>event.type==='contact'&&event.rallyLeg===index+1);
      const bounce=compiled.timeline.events.find(event=>event.type==='bounce'&&event.rallyLeg===priorLeg);
      assert.ok(bounce&&bounce.time<contact.time);
      assert.notEqual(compiled.timeline.segments[index].shotSemantics.contact.kind,'volley');
    }
  });
}

test('a real Pro lob probe contacts the descending ball within the grounded 8.5-foot cap',async()=>{
  const players=Object.fromEntries(IDS.map((id,index)=>[id,{team:index<2?'green':'orange',handedness:'right',style:'pro',flavour:'balanced'}]));
  const result=await simulateRally({seed:46,players,service:{server:'player3',receiver:'player1',court:'left',courtConvention:'server-perspective-v1'}});
  assert.equal(result.status,'complete',plain(result.diagnostics));
  const compiled=validateResult(result),segments=compiled.timeline.segments;
  const tall=segments.findIndex((segment,index)=>index>0&&segment.shotSemantics.contact.point.heightFeet>=8.49);
  assert.ok(tall>0,'the fixed probe must exercise the real grounded overhead boundary');
  const contact=segments[tall].shotSemantics.contact.point;
  assert.ok(contact.heightFeet<=8.5+1e-6);
  const incoming=segments[tall-1].trajectory,t=incoming.totalDuration;
  assert.ok(incoming.solved.sampleBoard(t+1e-5).heightFeet<incoming.solved.sampleBoard(t-1e-5).heightFeet,'the incoming solver must reach that contact while descending');
});

test('a controlled soft pop-up creates a physically supported ordinary NVZ air attack',async()=>{
  const players=Object.fromEntries(IDS.map((id,index)=>[id,{team:index<2?'green':'orange',handedness:'right',style:'pro',flavour:'balanced'}]));
  // Keep a neutral middle exchange alive, then perturb one actual soft shot.
  // This controlled geometry fixture is excluded from natural calibration.
  // .15 lies in the Pro attackable interval for both ordinary and settled
  // soft risk; the fixture still proves the resulting physical reply.
  let executionDraw=0;
  const simulate=createEngineDriverV1((input,controls)=>runNaturalAttemptV1(input,{
    ...controls,random:{...controls.random,intent:()=>.65,target:()=>.5,
      execution:()=>executionDraw++===12?.15:.999}
  }),{yieldControl:async()=>{}});
  const result=await simulate({seed:0,players,options:{maxShots:8},service:{server:'player1',receiver:'player3',court:'right',courtConvention:'server-perspective-v1'}});
  assert.equal(result.status,'censored',plain(result.diagnostics));
  const compiled=validateResult(result);
  assert.equal(result.decisions[6].resolution.physicalTransformation.kind,'soft-popup');
  assert.equal(result.decisions[7].situation.attackable,true);
  assert.equal(result.decisions[7].situation.contactSelection.evidence.chosen.preference.heightClass,'attack');
  const contacts=compiled.timeline.segments.filter((segment,index)=>index>0&&segment.shotSemantics.contact.kind==='volley'
    &&isInNonVolleyZone(segment.shotSemantics.contact.point)&&result.document.shots[index].contactTiming?.beforeBounceSeconds!==undefined);
  assert.ok(contacts.length>0,'the fixed generated probe must include a genuine volley over the NVZ');
  for(const segment of contacts){
    assert.ok(segment.shotSemantics.contact.point.heightFeet>0);
    assert.ok(segment.shotSemantics.contact.feet.every(foot=>!isInNonVolleyZone(foot)));
    assert.equal(segment.step.shot.contact.feetEstablishedOutsideNVZ,true);
    assert.ok(!['erne','around-the-post'].includes(segment.step.shot.authoring.intent),'ordinary volley geometry must not borrow a signature override');
  }
});

test('repeat requests and different yield schedules produce identical source, traces and outcomes',async()=>{
  let frequent=0,rare=0;
  const often=createRallySimulator({workChunk:1,yieldControl:async()=>{frequent++;}});
  const seldom=createRallySimulator({workChunk:65536,yieldControl:async()=>{rare++;}});
  const input={seed:0};
  const [baseline,repeated,dense,sparse]=await Promise.all([simulateRally(input),simulateRally(input),often(input),seldom(input)]);
  assert.equal(baseline.status,'complete');assert.deepEqual(repeated,baseline);
  assert.deepEqual(dense,baseline);assert.deepEqual(sparse,baseline);
  assert.ok(frequent>rare&&rare>=2,'both final-validation boundaries remain yieldable');
});

test('progress observers cannot change normalized input, decisions or another request',async()=>{
  const baseline=await simulateRally({seed:0}),input={seed:0},observed=[];
  input.onProgress=progress=>{
    observed.push({...progress});assert.equal(Object.isFrozen(progress),true);
    input.seed=99;
    if(observed.length%2)throw Error('observer failure');
    return Promise.reject(Error('async observer failure'));
  };
  const result=await simulateRally(input);
  assert.ok(observed.length>0);assert.equal(input.seed,99);assert.deepEqual(result,baseline);
});

test('concurrent real requests stay isolated and returned documents/traces are detached',async()=>{
  const [left,right,same]=await Promise.all([simulateRally({seed:0}),simulateRally({seed:7}),simulateRally({seed:0})]);
  assert.equal(left.status,'complete');assert.equal(right.status,'complete');assert.deepEqual(same,left);
  assert.notEqual(left.document,right.document);assert.notEqual(left.decisions,same.decisions);
  const sameBefore=plain(same),rightBefore=plain(right);
  left.document.title='Caller edit';left.decisions[0].chosen.intent='caller-analysis-edit';
  assert.equal(plain(same),sameBefore);assert.equal(plain(right),rightBefore);
  assert.notEqual(right.recipe.seed,same.recipe.seed);
});

test('the one-contact shot cap returns a valid censored prefix without an invented winner',async()=>{
  const result=await simulateRally({seed:0,options:{maxShots:1}});
  assert.equal(result.status,'censored',plain(result.diagnostics));validateResult(result);
  assert.equal(result.document.shots.length,1);assert.equal(result.diagnostics.attempts,1);
  assert.equal(result.document.outcome,undefined);assert.equal(result.outcome,null);
});

test('impossible length conditioning exhausts exactly 64 deterministic attempts without selecting a document',async()=>{
  const input={seed:0,options:{lengthFeel:'epic',maxShots:1}},a=await simulateRally(input),b=await simulateRally(input);
  assert.equal(a.status,'unsatisfied',plain(a.diagnostics));noDocument(a);assert.deepEqual(a,b);
  assert.equal(a.diagnostics.attempts,64);assert.equal(a.diagnostics.attemptedSeeds.length,64);
  assert.equal(new Set(a.diagnostics.attemptedSeeds).size,64);
  assert.equal(a.diagnostics.attemptSummaries.length,64);
  assert.ok(a.diagnostics.attemptSummaries.every(attempt=>attempt.selected===false&&attempt.shots===1));
  assert.equal(a.recipe.selection,null);
});

test('an infeasible bounded search reports a reproducible failure rather than a fabricated point',async()=>{
  const normalized=normalizeRallyInputV1({seed:0}),layout=clone(normalized.layout);
  layout.player1={x:5,y:14};
  const input={seed:0,layout},source=plain(input),left=await simulateRally(input),right=await simulateRally(input);
  assert.equal(left.status,'failed',plain(left.diagnostics));noDocument(left);assert.deepEqual(left,right);
  assert.equal(plain(input),source);assert.equal(left.diagnostics.attempts,1);
  assert.ok(left.diagnostics.rejections>0&&left.diagnostics.rejections<=65536);
  assert.equal(left.recipe.selection,null);assert.deepEqual(left.recipe.input.layout,layout);
  assert.ok(typeof left.diagnostics.code==='string'&&left.diagnostics.code.length>0);
  assert.ok(left.diagnostics.producer.failures.length>0);
  assert.ok(left.diagnostics.producer.failures.every(item=>typeof item.reason==='string'&&item.reason.length>0));
});

test('malformed engine inputs reject before work or pre-cancellation can hide them',async()=>{
  const controller=new AbortController();controller.abort();let accessorRead=false;
  const accessor={seed:0,get onProgress(){accessorRead=true;return()=>{};}};
  const defaults=normalizeRallyInputV1({seed:0}),badLayout=clone(defaults.layout),badPlayers=clone(defaults.players);
  badLayout.player2.x=29;badPlayers.player3.style='unversioned-level';
  for(const input of [undefined,{}, {seed:-1},{seed:2**32},{seed:NaN},{seed:1.5},{seed:0,extra:true},
    {seed:0,options:{maxShots:0}},{seed:0,options:{maxShots:100}},{seed:0,options:{lengthFeel:'exact'}},
    {seed:0,options:{signatureShots:'yes'}},{seed:0,onProgress:1},{seed:0,signal:{}},accessor,
    {seed:-1,signal:controller.signal},{seed:0,service:{server:'player1',receiver:'player2'}},
    {seed:0,layout:badLayout},{seed:0,players:badPlayers},
    {seed:0,service:{server:'player1',receiver:'player3',courtConvention:'legacy'}}]){
    await assert.rejects(simulateRally(input),TypeError);
  }
  assert.equal(accessorRead,false);
});

test('pre-cancellation performs no generation or progress and installs no result',async()=>{
  const controller=new AbortController();controller.abort();
  const result=await simulateRally({seed:0,signal:controller.signal,onProgress:()=>assert.fail('pre-cancelled progress')});
  assert.equal(result.status,'cancelled');noDocument(result);assert.equal(result.diagnostics.attempts,0);
  assert.deepEqual(result.diagnostics.attemptedSeeds,[]);assert.equal(result.recipe.selection,null);
});

test('cancellation during actual search retains partial decisions and suppresses late progress',async()=>{
  const controller=new AbortController(),seen=[];
  const result=await simulateRally({seed:0,signal:controller.signal,onProgress:progress=>{
    seen.push(progress);if(progress.phase==='search'&&progress.shots>=2)controller.abort();
  }});
  assert.equal(result.status,'cancelled');noDocument(result);assert.equal(result.diagnostics.phase,'search');
  assert.equal(result.decisions.length,2);assert.equal(result.diagnostics.partialTrace.status,'retained');
  const count=seen.length;await new Promise(resolve=>setImmediate(resolve));assert.equal(seen.length,count);
});

test('cancellation during a real conditioned retry never installs the preceding rejected attempt',async()=>{
  const controller=new AbortController(),seen=[];
  const result=await simulateRally({seed:0,options:{lengthFeel:'epic',maxShots:1},signal:controller.signal,onProgress:progress=>{
    seen.push(progress);if(progress.phase==='retry')controller.abort();
  }});
  assert.equal(result.status,'cancelled');noDocument(result);assert.equal(result.diagnostics.phase,'retry');
  assert.equal(result.diagnostics.attempts,2);assert.equal(result.diagnostics.attemptSummaries.length,1);
  assert.equal(result.diagnostics.attemptSummaries[0].selected,false);
  const count=seen.length;await new Promise(resolve=>setImmediate(resolve));assert.equal(seen.length,count);
});

for(const boundary of [1,2])test(`cancellation at final-validation boundary ${boundary} retains trace without a selected result`,async()=>{
  const controller=new AbortController(),seen=[];let validations=0;
  const result=await simulateRally({seed:0,signal:controller.signal,onProgress:progress=>{
    seen.push(progress);if(progress.phase==='validating'&&++validations===boundary)controller.abort();
  }});
  assert.equal(result.status,'cancelled');noDocument(result);assert.equal(result.diagnostics.phase,'validating');
  assert.ok(result.decisions.length>=3);assert.equal(result.diagnostics.partialTrace.status,'retained');
  assert.equal(validations,boundary);
  const count=seen.length;await new Promise(resolve=>setImmediate(resolve));assert.equal(seen.length,count);
});
