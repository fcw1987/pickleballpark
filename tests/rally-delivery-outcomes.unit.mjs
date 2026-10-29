import test from 'node:test';
import assert from 'node:assert/strict';
import { solveFlightV2 } from '../play-physics-v2.js';
import { generationFlightApexCeilingFeetV2 } from '../rally-flight-planner.js';
import { assessGeneratedFlightFeasibilityV1 } from '../rally-flight-audit.js';
import { simulateRally } from '../rally-engine.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2, inspectPlanningTrialEventsV2 } from '../play-planning-v2.js';

const input=(seed,maxShots)=>({seed,players:Object.fromEntries(['player1','player2','player3','player4'].map((id,i)=>[id,
  {team:i<2?'green':'orange',handedness:'right',style:'pro',flavour:'balanced'}])),
  service:{server:'player1',receiver:'player3',court:'left',courtConvention:'server-perspective-v1'},options:{maxShots}});
function independent(result) {
  const compiled=compileDocument(result.document),rules=validateRallyRules(compiled.play,compiled.timeline);
  assert.equal(compiled.validShotCount,result.document.shots.length);
  assert.deepEqual(compiled.findings.filter(x=>x.severity==='error'),[]);
  assert.deepEqual(rules.violations,[]);
  return {compiled,rules};
}

test('fixed neutral delivery commits its first timing and early friendly body fault even at the shot limit',async()=>{
  const result=await simulateRally(input(1177,8));
  assert.equal(result.status,'complete',JSON.stringify(result.diagnostics));
  assert.equal(result.document.shots.length,8);
  assert.equal(result.outcome.reason,'body');assert.equal(result.outcome.struckActor,'player4');
  assert.equal(result.outcome.shotId,'shot-8');
  assert.ok(Math.abs(result.outcome.evidence.afterContactSeconds-.056527514)<1e-9);
  const last=result.decisions.at(-1);
  assert.equal(last.execution.quality,'neutral');assert.equal(last.resolution.solutionIndex,0);
  assert.equal(last.resolution.nominalSafety.clear,true);
  assert.deepEqual(last.draws.execution,{quality:.6246410687454045,error:.8334799539297819});
  assert.equal(last.resolution.choiceAttempts.filter(x=>x.executionDraws).length,1);
  assert.deepEqual(last.resolution.choiceAttempts.at(-1).repairs,[]);
  const {rules}=independent(result);
  assert.ok(rules.expectedOutcomes.some(x=>x.reason==='body'&&x.struckActor==='player4'));
});

test('a projected later opponent body collision permits an earlier legal paddle interception',async()=>{
  const request=input(1032,4);request.service.court='right';
  const result=await simulateRally(request);
  assert.equal(result.status,'censored',JSON.stringify(result.diagnostics));
  independent(result);
  const state=createPlanningStateV2(result.document);
  let projected;
  for(const [index,shot] of result.document.shots.entries()) {
    const trial=trialRecipeV2(state,shot,{capturePendingEvents:true});
    assert.equal(trial.ok,true,JSON.stringify(trial.findings));
    if(index===2) {
      projected=inspectPlanningTrialEventsV2(state,trial).physicalCandidates.find(x=>x.reason==='body'&&x.struckActor==='player3');
      assert.ok(projected,'full outgoing span projects the opponent torso');
    }
    if(index===3) {
      assert.ok(trial.resolvedPrevious.endTime<projected.absoluteTime,'legal incoming paddle contact precedes projected body');
      assert.equal(trial.terminalBeforeNextContact,undefined);
    }
    commitPlanningTrialV2(state,trial);
  }
});

// Exact row.job.input values copied from the four original private replay contexts.
// Keep acceptance reproducible without a runtime dependency on ignored archives.
const archivedInputs=[{"name":"pro-1032","input":{"seed":1032,"players":{"player1":{"team":"green","handedness":"right","style":"pro","flavour":"balanced"},"player2":{"team":"green","handedness":"right","style":"pro","flavour":"balanced"},"player3":{"team":"orange","handedness":"right","style":"pro","flavour":"balanced"},"player4":{"team":"orange","handedness":"right","style":"pro","flavour":"balanced"}},"service":{"server":"player1","receiver":"player3","court":"right","courtConvention":"server-perspective-v1"},"options":{"lengthFeel":"natural","winner":"either","signatureShots":true,"maxShots":99}}},{"name":"pro-1177","input":{"seed":1177,"players":{"player1":{"team":"green","handedness":"right","style":"pro","flavour":"balanced"},"player2":{"team":"green","handedness":"right","style":"pro","flavour":"balanced"},"player3":{"team":"orange","handedness":"right","style":"pro","flavour":"balanced"},"player4":{"team":"orange","handedness":"right","style":"pro","flavour":"balanced"}},"service":{"server":"player1","receiver":"player3","court":"left","courtConvention":"server-perspective-v1"},"options":{"lengthFeel":"natural","winner":"either","signatureShots":true,"maxShots":99}}},{"name":"advanced-1032","input":{"seed":1032,"players":{"player1":{"team":"green","handedness":"right","style":"advanced","flavour":"balanced"},"player2":{"team":"green","handedness":"right","style":"advanced","flavour":"balanced"},"player3":{"team":"orange","handedness":"right","style":"advanced","flavour":"balanced"},"player4":{"team":"orange","handedness":"right","style":"advanced","flavour":"balanced"}},"service":{"server":"player1","receiver":"player3","court":"right","courtConvention":"server-perspective-v1"},"options":{"lengthFeel":"natural","winner":"either","signatureShots":true,"maxShots":99}}},{"name":"advanced-1136","input":{"seed":1136,"players":{"player1":{"team":"green","handedness":"right","style":"advanced","flavour":"balanced"},"player2":{"team":"green","handedness":"right","style":"advanced","flavour":"balanced"},"player3":{"team":"orange","handedness":"right","style":"advanced","flavour":"balanced"},"player4":{"team":"orange","handedness":"right","style":"advanced","flavour":"balanced"}},"service":{"server":"player1","receiver":"player3","court":"right","courtConvention":"server-perspective-v1"},"options":{"lengthFeel":"natural","winner":"either","signatureShots":true,"maxShots":99}}}];

for(const row of archivedInputs) test(`${row.name} exact archived input completes with bounded selected nominals and fixed execution draws`,async()=>{
  const result=await simulateRally(row.input);
  assert.equal(result.status,'complete',JSON.stringify(result.diagnostics));
  const {compiled,rules}=independent(result);
  assert.equal(rules.valid,true);
  const audit=assessGeneratedFlightFeasibilityV1({document:result.document,compiled});
  assert.equal(audit.status,'PASS',JSON.stringify(audit));
  assert.equal(result.stats.generatedFlightFeasibility.status,'PASS');
  for(const decision of result.decisions) {
    const nominal=decision.resolution.nominalSafety.nominal;
    const solved=solveFlightV2({from:nominal.contact,target:nominal.target,family:nominal.family,
      quality:nominal.quality,physics:nominal.physics,pace:nominal.pace,arc:nominal.arc});
    const ceiling=generationFlightApexCeilingFeetV2({family:nominal.family,intent:decision.chosen.intent,
      quality:nominal.quality,contactHeightFeet:nominal.contact.heightFeet,style:row.input.players[result.document.shots.find(shot=>shot.id===decision.shotId).hitter].style});
    assert.ok(solved.metadata.apexFeet<=ceiling+1e-6,`${decision.shotId}: ${solved.metadata.apexFeet} > ${ceiling}`);
    const fixed=decision.resolution.choiceAttempts.filter(attempt=>attempt.executionDraws);
    assert.equal(fixed.length,1,decision.shotId);
    assert.deepEqual(fixed[0].executionDraws,decision.draws.execution);
    assert.equal(fixed[0].repairs.some(repair=>repair.stage==='execution-route'),false,decision.shotId);
  }
  if(row.name==='pro-1177') {
    const last=result.decisions.at(-1);
    assert.equal(result.outcome.reason,'body');assert.equal(result.outcome.struckActor,'player4');
    assert.ok(Math.abs(result.outcome.evidence.afterContactSeconds-.056527514)<1e-9);
    assert.equal(last.execution.quality,'neutral');assert.equal(last.resolution.solutionIndex,0);
  }
});
