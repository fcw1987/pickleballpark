import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulateRally } from '../rally-engine.js';
import { validateDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { inspectBodyPathV2 } from '../play-outcome-v2.js';
import { solveFlightV2 } from '../play-physics-v2.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { isInNonVolleyZone } from '../court-geometry.js';
const archived=JSON.parse(readFileSync(new URL('./fixtures/model2/self-body-return-63016b5.json',import.meta.url),'utf8'));
const ids=['player1','player2','player3','player4'];
const errors=compiled=>compiled.findings.filter(item=>item.severity==='error');
const clone=value=>structuredClone(value);

function auditNominals(result) {
  for(const decision of result.decisions) {
    const nominal=decision.resolution.nominalSafety.nominal;
    assert.ok(nominal,`${decision.shotId} must record independently replayable nominal geometry`);
    for(const key of ['contact','family','quality','target','physics','pace','arc','actorRoute']) assert.ok(Object.hasOwn(nominal,key),key);
    assert.equal(nominal.quality,'neutral');
    const route=nominal.actorRoute;
    for(const key of ['startTime','duration','originalDuration','contactTime','hitter','feet','previousPositions','positions','momentum','endTimeSeconds']) assert.ok(Object.hasOwn(route,key),key);
    const solved=solveFlightV2({from:nominal.contact,target:nominal.target,family:nominal.family,quality:nominal.quality,physics:nominal.physics,pace:nominal.pace,arc:nominal.arc});
    const segment={modelVersion:2,startTime:route.startTime,duration:route.duration,originalDuration:route.originalDuration,contactTime:route.contactTime,
      previous:{positions:route.previousPositions},step:{positions:route.positions,shot:{physicsV2:{endTimeSeconds:route.endTimeSeconds}}},
      shotSemantics:{playerId:route.hitter,contact:{feet:route.feet}},model2Momentum:route.momentum};
    const friendly=ids.filter(id=>result.document.players[id].team===result.document.players[route.hitter].team);
    assert.deepEqual(inspectBodyPathV2(segment,solved,friendly),[],`${decision.shotId}: recorded nominal flight must clear actual friendly routes`);
  }
}

function auditAccepted(result) {
  assert.ok(['complete','censored'].includes(result.status));
  const doc=result.document; validateDocument(doc);
  const compiled=compileDocument(doc),rules=validateRallyRules(compiled.play,compiled.timeline);
  assert.equal(compiled.validShotCount,doc.shots.length,JSON.stringify(compiled.findings));
  assert.deepEqual(errors(compiled),[]); assert.deepEqual(rules.violations,[]);
  assert.equal(rules.valid,true);
  const movement=inspectGeneratedMovementV1(compiled.timeline),spacing=inspectGeneratedSpacingV1(compiled.timeline);
  assert.equal(movement.valid,true,JSON.stringify(movement));assert.ok(movement.maxPeakFeetPerSecond<=18+1e-6);
  assert.equal(spacing.valid,true,JSON.stringify(spacing));assert.ok(spacing.minimumSeparationFeet>=2.5-1e-6);
  const segments=compiled.timeline.segments.filter(segment=>segment.shotSemantics);
  for(const [index,shot] of doc.shots.entries()) {
    const feet=shot.contactEvidence.feet;
    assert.equal(feet.length,2);assert.ok(feet.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    if(segments[index].shotSemantics.contact.kind==='volley') assert.ok(feet.every(p=>!isInNonVolleyZone(p)));

  }
  if(result.outcome) assert.ok(rules.expectedOutcomes.some(outcome=>outcome.reason===result.outcome.reason && outcome.shotId===result.outcome.shotId));
  auditNominals(result);
  return compiled;
}

test('archived seed 31 neutral return remains a genuine public-validator self-body fault',()=>{
  const before=JSON.stringify(archived);validateDocument(archived);
  const compiled=compileDocument(archived),rules=validateRallyRules(compiled.play,compiled.timeline);
  assert.deepEqual(errors(compiled),[]);assert.equal(compiled.validShotCount,2);assert.deepEqual(rules.violations,[]);
  const outcome=rules.expectedOutcomes.find(item=>item.reason==='body');
  assert.ok(outcome);assert.equal(outcome.shotId,'shot-2');assert.equal(outcome.faultingActor,'player1');assert.equal(outcome.struckActor,'player1');
  assert.ok(Math.abs(outcome.afterContactSeconds-.070978864)<1e-8);
  assert.equal(archived.shots[1].quality,'neutral');
  const segment=compiled.timeline.segments.filter(s=>s.shotSemantics)[1];
  assert.equal(inspectBodyPathV2(segment,solveFlightV2(segment.step.shot.physicsV2),['player1'])[0].struckActor,'player1');
  assert.equal(JSON.stringify(archived),before);
});

for(const style of ['pro','advanced','intermediate']) test(`seed 31 ${style} repairs nominal self-body geometry and independently validates`,async()=>{
  const input={seed:31,...clone(archived.generation.input)};
  for(const player of Object.values(input.players))player.style=style;
  const result=await simulateRally(input);
  assert.equal(result.status,'complete',JSON.stringify(result.diagnostics));
  auditAccepted(result);
  assert.ok(result.document.shots.length>archived.shots.length,'fixed development seed progresses beyond the archived avoidable return fault');
  const second=result.decisions[1];assert.notEqual(second.execution.quality,'error');
});

for(const [team,court,hand] of [['green','right','left'],['orange','right','left'],['green','left','right']]) test(`seed 31 mirrored ${team}/${court}/${hand} nominal routes remain independently clear`,async()=>{
  const players=Object.fromEntries(ids.map((id,index)=>[id,{team:index<2?'green':'orange',handedness:hand,style:'advanced',flavour:'balanced'}]));
  const result=await simulateRally({seed:31,players,service:{server:team==='green'?'player1':'player3',receiver:team==='green'?'player3':'player1',court}});
  assert.equal(result.status,'complete',JSON.stringify(result.diagnostics));
  auditAccepted(result);
});

test('an explicitly unsupported serve with feet inside the baseline fails without a fabricated point',async()=>{
  const layout={player1:{x:5,y:1},player2:{x:15,y:-1},player3:{x:15,y:42},player4:{x:5,y:30},ball:{x:4.2,y:2}};
  const input={seed:31,players:clone(archived.generation.input.players),layout,
    service:{server:'player1',receiver:'player3',court:'right',courtConvention:'server-perspective-v1'}};
  const before=JSON.stringify(input),result=await simulateRally(input);
  assert.equal(result.status,'failed');assert.equal(result.document,null);assert.equal(result.outcome,null);
  assert.equal(result.diagnostics.code,'bounded-feasible-intents-exhausted');
  assert.equal(result.diagnostics.producer.contactIndex,0);
  assert.equal(result.decisions.length,0);assert.equal(result.recipe.selection,null);
  assert.deepEqual(result.recipe.input.layout,layout);
  assert.ok(result.diagnostics.producer.failures.every(failure=>failure.reason==='The nominal reply contact does not pass independent model-2 contact rules.'));
  assert.equal(JSON.stringify(input),before);
});

// A quality label cannot exempt the physical hitter from the same archived sweep.
test('controlled execution-error counterpart retains the genuine body fault',()=>{
  const document=clone(archived);document.shots[1].quality='error';
  validateDocument(document);
  const compiled=compileDocument(document),rules=validateRallyRules(compiled.play,compiled.timeline);
  assert.equal(compiled.validShotCount,2);assert.deepEqual(errors(compiled),[]);assert.deepEqual(rules.violations,[]);
  const body=rules.expectedOutcomes.find(item=>item.reason==='body');
  assert.ok(body);assert.equal(body.struckActor,'player1');assert.equal(body.faultingActor,'player1');
  assert.ok(Math.abs(body.afterContactSeconds-.070978864)<1e-8);
});

test('Pro 53 selects an earlier legal contact instead of committing the interceptor/rule boundary gap',async()=>{
  const input={seed:53,...clone(archived.generation.input)};
  input.service={server:'player1',receiver:'player3',court:'left',courtConvention:'server-perspective-v1'};
  delete input.layout; // Use this service's ordinary cohort layout, not seed31's opposite-end setup.
  const result=await simulateRally(input);
  assert.equal(result.status,'complete',JSON.stringify(result.diagnostics));
  auditAccepted(result);
  const compiled=compileDocument(result.document);
  for(const prior of compiled.timeline.segments.slice(0,-1)) {
    assert.ok(prior.step.shot.physicsV2.endTimeSeconds<prior.trajectory.solved.secondBounceTime-1e-7,
      'every accepted next contact must satisfy the unchanged independent rule guard');
  }
});
