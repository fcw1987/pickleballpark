import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2, replacePendingMovementV2 } from '../play-planning-v2.js';
import { planMovementV1, replanMovementV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1, sampleFeetStateV1 } from '../rally-movement.js';
import { sampleActorBoardPositionV2 } from '../play-actors-v2.js';
import { simulateRally } from '../rally-engine.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';

// Exact physical source prefix from qualification-9493af3.jsonl, pro:balanced:1043.
// Archived revision 9493af303c181a91f74f0fed3bc4c121ad822072; no cohort is rerun.
const archived = {"id":"rally-engine-95d72c5c-1043","title":"Generated rally \u00b7 seed 1043","modelVersion":2,"physicsVersion":"play-physics-v2","players":{"player1":{"team":"green","handedness":"right"},"player2":{"team":"green","handedness":"right"},"player3":{"team":"orange","handedness":"right"},"player4":{"team":"orange","handedness":"right"}},"initialLayout":{"player1":{"x":15,"y":2},"player2":{"x":5,"y":14},"player3":{"x":5,"y":45},"player4":{"x":15,"y":45},"ball":{"x":5.8,"y":44}},"service":{"server":"player3","receiver":"player1","court":"left","courtConvention":"server-perspective-v1"},"assistance":{"autoShading":false,"showGuides":false,"team":"green"},"opening":"serve","ending":"fault","intentionalFault":false,"shots":[{"id":"shot-1","family":"serve","hitter":"player3","receiver":"player1","contactStyle":"forehand","target":{"x":13.347703649,"y":5.538650318},"arc":"high","pace":"medium","movement":{"intent":"manual","target":{"x":5,"y":45},"pinned":false},"quality":"neutral","serveMethod":"volley","contactEvidence":{"feet":[{"x":4.58,"y":45},{"x":5.42,"y":45}],"feetEstablishedOutsideNVZ":true},"intent":"serve","physics":{"launchVerticalFeetPerSecond":12.009775772},"playerMovement":{"player1":{"intent":"manual","target":{"x":15,"y":2},"pinned":false},"player2":{"intent":"manual","target":{"x":5,"y":14},"pinned":false},"player4":{"intent":"manual","target":{"x":15,"y":45},"pinned":false}}},{"id":"shot-2","family":"return","hitter":"player1","receiver":"auto","contactStyle":"forehand","target":{"x":9.611074686,"y":32.3456625},"arc":"medium","pace":"soft","movement":{"intent":"manual","target":{"x":14.947805787,"y":11.133131803},"pinned":false},"quality":"attackable","contactMode":"bounced","contactTiming":{"afterBounceSeconds":0.08},"contactEvidence":{"feet":[{"x":15.42,"y":2},{"x":14.58,"y":2}],"feetEstablishedOutsideNVZ":true},"intent":"return","physics":{"launchVerticalFeetPerSecond":17.594369645},"playerMovement":{"player2":{"intent":"manual","target":{"x":4.947805787,"y":14.186390445},"pinned":false},"player3":{"intent":"manual","target":{"x":5.333594405,"y":44.830135615},"pinned":false},"player4":{"intent":"manual","target":{"x":15,"y":45},"pinned":false}}},{"id":"shot-3","family":"drop","hitter":"player3","receiver":"auto","contactStyle":"forehand","target":{"x":10.915317062,"y":17.18279081},"arc":"high","pace":"soft","movement":{"intent":"manual","target":{"x":5.233985739,"y":35.933334404},"pinned":false},"quality":"neutral","contactMode":"bounced","contactTiming":{"afterBounceSeconds":0.6},"contactEvidence":{"feet":[{"x":4.913594405,"y":44.830135615},{"x":5.753594405,"y":44.830135615}],"feetEstablishedOutsideNVZ":true},"intent":"third-shot-drop","physics":{"launchVerticalFeetPerSecond":16.11113129},"playerMovement":{"player1":{"intent":"manual","target":{"x":14.546767571,"y":10.996673978},"pinned":false},"player2":{"intent":"manual","target":{"x":5.256288777,"y":14.25},"pinned":false},"player4":{"intent":"manual","target":{"x":15.097201441,"y":36.002984195},"pinned":false}}}]};
const ids = ['player1','player2','player3','player4'];
const center = feet => ({ x: (feet[0].x + feet[1].x) / 2, y: (feet[0].y + feet[1].y) / 2 });
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
function prefix() {
  const state = createPlanningStateV2(archived);
  for (const shot of archived.shots.slice(0,2)) {
    const trial = trialRecipeV2(state,shot);
    assert.equal(trial.ok,true,JSON.stringify(trial.findings));
    commitPlanningTrialV2(state,trial);
  }
  return state;
}

test('archived Pro 1043 return uses the actual extra .6 seconds to reach the line before the third contact', () => {
  const state = prefix(), source = JSON.stringify(archived), pending = state.pendingSegment;
  const second = archived.shots[1], third = archived.shots[2], feet = second.contactEvidence.feet;
  const plan = planMovementV1({ positions: pending.previous.positions, players: archived.players,
    hitter: second.hitter, contact: state.steps[2].shot.contact.point, target: second.target,
    durationSeconds: state.solved[1].firstLandingTime, contactFeet: feet, index: 1,
    service: archived.service, family: second.family, intent: second.intent,
    quality: second.quality, pace: second.pace, peakFeetPerSecond: 17.95 });
  const original = trialRecipeV2(state,third);
  assert.equal(original.ok,true,JSON.stringify(original.findings));
  const duration = original.resolvedPrevious.duration;
  assert.ok(Math.abs(duration - 1.73763576) < 1e-8);
  assert.ok(Math.abs(duration - state.solved[1].firstLandingTime - .6) < 1e-8);
  assert.ok(Math.abs(plan.positions.player1.y - 11.133131803) < 1e-7);
  const replanned = replanMovementV1({ plan, segment: pending, players: archived.players, durationSeconds: duration,
    arrival: { id: third.hitter, stance: center(third.contactEvidence.feet) }, peakFeetPerSecond: 17.95 });
  assert.equal(replanned.ok,true);
  assert.equal(replanned.positions.player1.y,14.25);
  assert.ok(distance(center(feet),replanned.positions.player1)*2/(duration-.12) < 18);
  const pendingRecipe = { ...second, movement: replanned.movement, playerMovement: replanned.playerMovement };
  const resolved = trialRecipeV2(state,third,{pendingRecipe});
  assert.equal(resolved.ok,true,JSON.stringify(resolved.findings));
  const segment = resolved.resolvedPrevious;
  assert.equal(sampleActorBoardPositionV2(segment,'player1',segment.duration).y,14.25);
  assert.deepEqual(sampleActorBoardPositionV2(segment,third.hitter,segment.duration),center(third.contactEvidence.feet));
  assert.equal(inspectGeneratedMovementV1(segment).valid,true);
  assert.equal(inspectGeneratedSpacingV1(segment).valid,true);
  for (const id of ['player3','player4']) {
    if (id !== third.hitter) assert.deepEqual(replanned.positions[id],pending.previous.positions[id],'serving side still waits for the return bounce');
  }
  const actualFeet = sampleFeetStateV1(segment,0), priorFeet = sampleFeetStateV1(pending,0);
  for (const id of ids) {
    assert.equal(actualFeet[id].grounded,priorFeet[id].grounded);
    assert.equal(actualFeet[id].feetEstablishedOutsideNVZ,priorFeet[id].feetEstablishedOutsideNVZ,'no provisional NVZ reset is installed');
    for (let foot = 0; foot < 2; foot++) assert.ok(distance(actualFeet[id].feet[foot],priorFeet[id].feet[foot]) < 1e-12);
  }
  assert.equal(JSON.stringify(archived),source);
});

test('pending-tail replacement preserves prefix identities, rejects nonmovement writes, and invalidates outstanding trials', () => {
  const state = prefix(), prefixStep = state.steps[1], prefixSegment = state.finalizedSegments[0];
  const solved = state.solved, inspections = state.finalizedInspections, before = JSON.stringify(state.recipes);
  const stale = trialRecipeV2(state,archived.shots[2]);
  const bad = structuredClone(state.pendingRecipe); bad.target.x += 1;
  assert.throws(() => replacePendingMovementV2(state,bad),/only movement/);
  assert.equal(JSON.stringify(state.recipes),before);
  const recipe = structuredClone(state.pendingRecipe); recipe.movement.target.x += .01;
  replacePendingMovementV2(state,recipe);
  assert.equal(state.steps[1],prefixStep); assert.equal(state.finalizedSegments[0],prefixSegment);
  assert.equal(state.solved,solved); assert.equal(state.finalizedInspections,inspections);
  assert.deepEqual(state.pendingRecipe,recipe); assert.deepEqual(state.recipes.at(-1),recipe);
  assert.deepEqual(state.pendingSegment.step.positions[recipe.hitter],recipe.movement.target);
  assert.throws(() => commitPlanningTrialV2(state,stale),/different or stale/);
});

for (const options of [{maxShots:2},{}]) test(`natural final tail bounds saved commands by actual ${options.maxShots ? 'stop bounce' : 'dead event'} time`, async () => {
  const result = await simulateRally({ seed: 0, options });
  assert.equal(result.status,options.maxShots ? 'censored' : 'complete',JSON.stringify(result.diagnostics));
  const compiled = compileDocument(result.document), timeline = compiled.timeline;
  assert.equal(validateRallyRules(compiled.play,timeline).valid,true);
  assert.equal(inspectGeneratedMovementV1(timeline).valid,true);
  assert.equal(inspectGeneratedSpacingV1(timeline).valid,true);
  const last = timeline.segments.at(-1), shot = result.document.shots.at(-1);
  const dead = timeline.events.find(event => event.type === 'dead')?.time ?? last.endTime;
  const duration = dead-last.startTime;
  for (const id of ids) {
    const origin = id === shot.hitter ? center(shot.contactEvidence.feet) : last.previous.positions[id];
    const command = id === shot.hitter ? shot.movement : shot.playerMovement[id];
    const seconds = id === shot.hitter ? Math.max(0,duration-last.contactTime-.12) : duration;
    assert.ok(distance(origin,command.target) <= 17.95*seconds/2+1e-7);
    const sampled = sampleActorBoardPositionV2(last,id,Math.min(last.duration,duration));
    assert.ok(distance(origin,sampled) <= distance(origin,command.target)+1e-7,'retained originalDuration can conservatively stop partway along a dead-clipped route');
  }
  assert.equal(JSON.stringify(result.document).includes('"goals"'),false,'unbounded request-local goals never enter SavedDocument');
  assert.deepEqual(result.document.initialLayout.player3,{x:15,y:42},'the declared receiver never receives an initial forward shift');
});
