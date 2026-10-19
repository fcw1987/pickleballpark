// Numeric companion to visual review. Samples simulation time, never reports physical FPS.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { runtimeFileset } from './stamp-build.mjs';
import { strokeReviewCases } from '../tests/fixtures/stroke-review-cases.mjs';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4176',out=resolve(process.env.CAPTURE_DIR||'docs/stroke-review/baseline');
const root=process.env.RUNTIME_ROOT||process.cwd(),before=runtimeFileset(root).digest;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:900,height:700},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto(`${base}/?workspace=builder&stroke-acceptance=1`);await page.waitForFunction(()=>pickleboard?.threeD&&pickleboard?.plays&&window.playBuilder&&!playBuilder.busy);await page.evaluate(()=>playBuilder.setWorkspace('planner'));
const report=[];
const cases=process.env.STROKE_CASES?strokeReviewCases.filter(c=>process.env.STROKE_CASES.split(',').includes(c.id)):strokeReviewCases;
for(const c of cases){
 const sourceDocument=c.fixture?JSON.parse(readFileSync(c.fixture,'utf8')):null;
 await page.evaluate(async({c,sourceDocument})=>{
  const b=pickleboard;if(b.threeD.active)b.threeD.exit();
  let p=JSON.parse(JSON.stringify(b.plays.plays.get(c.playId))),suppliedTimeline=null;
  if(sourceDocument){const document=structuredClone(sourceDocument);for(const settings of Object.values(document.players))settings.handedness=c.hand;const {compileEffectiveCandidate}=await import('./rally-proposals.js');const compiled=compileEffectiveCandidate(document);if(compiled.validShotCount!==document.shots.length)throw new Error('Fixture does not compile all exact authored shots');p=structuredClone(compiled.play);suppliedTimeline=compiled.timeline;}
  if(c.authored==='drive-backhand'){p.id=`stroke-review-${c.id}`;const s=p.steps.find(s=>s.id===c.stepId);s.shot.stroke='backhand';s.shot.contact.strokeSide='backhand';}
  if(c.authored==='overhead-backhand'){p.id=`stroke-review-${c.id}`;const s=p.steps.find(s=>s.id===c.stepId);s.shot.contact.strokeSide='backhand';s.shot.contact.heightFeet=7;}
  if(sourceDocument){const doc=structuredClone(sourceDocument);for(const settings of Object.values(doc.players))settings.handedness=c.hand;playBuilder.loadDocument(doc);}else{b.plays.loadDefinition(p,suppliedTimeline);for(const t of Object.values(b.tokens))if(t.handedness)t.handedness=c.hand;}
  for(const t of Object.values(b.tokens))if(t.handedness&&t.handedness!==c.hand)throw new Error('Token hand mismatch after load');
 },{c,sourceDocument});
 await page.locator('#play3dView').click();await page.waitForFunction(()=>pickleboard.threeD.active);
 const metrics=await page.evaluate(c=>{
  const v=pickleboard.threeD,s=v.timeline.segments.find(s=>s.step.id===c.stepId),a=v.playerObjects.get(s.shotSemantics.playerId),contact=s.startTime+s.contactTime;
  v.cancelRenderWork();v.session.pause();
  const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
  const snap=(t,singleApply=false)=>{const sampleTime=Math.max(0,Math.min(v.timeline.duration,t));if(!singleApply)v.session.seek(sampleTime);v.applyAtTime(sampleTime);a.updateMatrixWorld(true);const d=a.userData;if(d.handedness!==c.hand||pickleboard.tokens[s.shotSemantics.playerId].handedness!==c.hand)throw new Error(`Actual actor/token hand mismatch ${c.id}`);
   const dominant=d.arms[d.handedness],wrist=dominant.hand.getWorldPosition(a.position.clone()),grip=a.getObjectByName('PaddleGrip').getWorldPosition(a.position.clone());
   const reach=wrist.distanceTo(d.shoulderWorld);
   return {t:sampleTime,effectiveHandedness:d.handedness,tokenHandedness:pickleboard.tokens[s.shotSemantics.playerId].handedness,wristReach:reach,gripError:wrist.distanceTo(grip),root:a.position.toArray(),paddle:d.paddleFaceWorld.toArray(),ball:v.ballObject.position.toArray(),feet:Object.fromEntries(Object.entries(d.legs).map(([k,l])=>[k,l.foot.getWorldPosition(a.position.clone()).toArray()])),bodyYaw:d.visual.rotation.y,torsoYaw:d.upper.rotation.y,phase:d.animation.phase,action:d.animation.action,planted:d.animation.planted,footwork:d.animation.footwork||d.animation.gait||null,supportFeet:d.animation.supportFeet||null,footTargets:d.animation.footTargets||null};};
  const times=Array.from({length:61},(_,i)=>Math.max(0,Math.min(v.timeline.duration,contact-.5+i/60)));
  const ordered=times.map(t=>snap(t));const order=times.map((t,i)=>({t,i})).sort((a,b)=>(a.i*37%61)-(b.i*37%61));
  let seekError=0;for(const {t,i} of order){const q=snap(t),p=ordered[i];seekError=Math.max(seekError,dist(q.root,p.root),dist(q.paddle,p.paddle),dist(q.ball,p.ball),...Object.keys(q.feet).map(k=>dist(q.feet[k],p.feet[k])));}
  const directOrdered=times.map(t=>snap(t,true));let singleApplySeekError=0;for(const {t,i} of order){const q=snap(t,true),p=directOrdered[i];singleApplySeekError=Math.max(singleApplySeekError,dist(q.root,p.root),dist(q.paddle,p.paddle),dist(q.ball,p.ball),...Object.keys(q.feet).map(k=>dist(q.feet[k],p.feet[k])));}
  const at=snap(contact),near=ordered.filter(q=>Math.abs(q.t-contact)<.061);
  const feet=Object.fromEntries(['left','right'].map(side=>{const points=near.map(q=>q.feet[side]);return [side,{contactWindowDrift:Math.max(...points.map(p=>dist(p,at.feet[side]))),minOriginY:Math.min(...points.map(p=>p[1])),maxOriginY:Math.max(...points.map(p=>p[1]))}];}));
  let maxPaddleStep=0,maxRootStep=0,maxFootStep=0;for(let i=1;i<ordered.length;i++){const a=ordered[i-1],b=ordered[i];maxPaddleStep=Math.max(maxPaddleStep,dist(a.paddle,b.paddle));maxRootStep=Math.max(maxRootStep,dist(a.root,b.root));for(const side of ['left','right'])maxFootStep=Math.max(maxFootStep,dist(a.feet[side],b.feet[side]));}
  const finite=ordered.every(q=>[...q.root,...q.paddle,...q.ball,...Object.values(q.feet).flat()].every(Number.isFinite));
  return {case:c,semantics:s.shotSemantics,contactTime:contact,at,finite,contactError:dist(at.paddle,at.ball),seekError,singleApplySeekError,feet,maxWristReach:Math.max(...ordered.map(q=>q.wristReach)),maxGripError:Math.max(...ordered.map(q=>q.gripError)),simulationSampleStep:1/60,maxPaddleStep,maxRootStep,maxFootStep,ordered};
 },c);
 const boundaries=await page.evaluate(()=>{const v=pickleboard.threeD;const point=o=>o.getWorldPosition(o.position.clone()).toArray(),dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));const sample=t=>{v.session.seek(Math.max(0,Math.min(v.timeline.duration,t)));v.applyAtTime(v.clock.elapsed);return Object.fromEntries([...v.playerObjects].map(([id,a])=>[id,{root:a.position.toArray(),paddle:a.userData.paddleFaceWorld.toArray(),head:point(a.userData.head),feet:Object.fromEntries(Object.entries(a.userData.legs).map(([side,l])=>[side,point(l.foot)]))}]));};return v.timeline.segments.slice(0,-1).map(s=>{const time=s.endTime,pre=sample(time-1e-6),post=sample(time+1e-6),early=sample(time-1/120),late=sample(time+1/120),at=sample(time);return {time,fromStep:s.step.id,toStep:v.timeline.segments[s.index]?.step.id,actors:Object.fromEntries(Object.keys(pre).map(id=>{const p=pre[id],q=post[id],e=early[id],l=late[id],a=at[id];return [id,{jumpMeters:{root:dist(p.root,q.root),paddle:dist(p.paddle,q.paddle),head:dist(p.head,q.head),leftFoot:dist(p.feet.left,q.feet.left),rightFoot:dist(p.feet.right,q.feet.right)},footVelocityBefore:Object.fromEntries(['left','right'].map(side=>[side,dist(e.feet[side],a.feet[side])*120])),footVelocityAfter:Object.fromEntries(['left','right'].map(side=>[side,dist(l.feet[side],a.feet[side])*120])),before:p,at:a,after:q}];}))};});});
 metrics.boundaries=boundaries;
 report.push(metrics);
}
// Real wall-clock rate/pose freeze checks: renderer scheduling is observed independently.
const timing=await page.evaluate(async()=>{
 const v=pickleboard.threeD;
 const one=async rate=>{v.cancelRenderWork();v.session.pause();v.session.seek(.08);v.applyAtTime(.08);v.setPlaybackRate(rate);const start=v.clock.elapsed,wall=performance.now();v.session.play();v.startRenderLoop();await new Promise(r=>setTimeout(r,320));v.session.pause();v.cancelRenderWork();const elapsed=v.clock.elapsed-start,ms=performance.now()-wall;return {rate,elapsed,wallSeconds:ms/1000,ratio:elapsed/(ms/1000)};};
 const rates=[];for(const rate of [.25,1])rates.push(await one(rate));
 const snapshot=()=>JSON.stringify({elapsed:v.clock.elapsed,ball:v.ballObject.position.toArray(),actors:[...v.playerObjects.values()].map(a=>({root:a.position.toArray(),paddle:a.userData.paddleFaceWorld.toArray(),feet:Object.values(a.userData.legs).map(l=>l.foot.position.toArray())}))});
 const freezeBefore=snapshot();await new Promise(r=>setTimeout(r,100));const frozen=freezeBefore===snapshot();
 const callbacks=[];let previous;await new Promise(resolve=>{const frame=t=>{if(previous!==undefined)callbacks.push(t-previous);previous=t;if(callbacks.length>=24)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});
 return {rates,frozen,rafIntervalsMs:callbacks,rafMedianMs:[...callbacks].sort((a,b)=>a-b)[Math.floor(callbacks.length/2)],note:'Observed browser rAF cadence on this host; no physical device/display FPS claim.'};
});
await context.close();await browser.close();
const failures=[];for(const r of report){if(!r.finite)failures.push(`${r.case.id}: nonfinite geometry`);if(r.contactError>.02)failures.push(`${r.case.id}: visible contact error ${r.contactError}`);if(r.maxWristReach>.64)failures.push(`${r.case.id}: arm exceeds plausible reach ${r.maxWristReach}`);if(r.maxGripError>.06)failures.push(`${r.case.id}: hand/grip gap ${r.maxGripError}`);if(r.singleApplySeekError>1e-7)failures.push(`${r.case.id}: single applyAtTime history changes geometry ${r.singleApplySeekError}`);if(r.seekError>1e-7)failures.push(`${r.case.id}: seek history changes geometry ${r.seekError}`);}
if(!timing.frozen)failures.push('paused geometry changes');
for(const r of timing.rates)if(Math.abs(r.ratio-r.rate)>.25)failures.push(`rate ${r.rate}: wall-clock ratio ${r.ratio}`);
for(const r of report)for(const b of r.boundaries)for(const [id,a] of Object.entries(b.actors))for(const [part,jump] of Object.entries(a.jumpMeters))if(jump>.01)failures.push(`${r.case.id}: ${b.fromStep}→${b.toStep} ${id} ${part} jumps ${jump}m across ±1us`);
const after=runtimeFileset(root).digest;if(before!==after)failures.push('runtime changed during capture');
await writeFile(join(out,'stroke-acceptance.json'),JSON.stringify({launcherNode:process.version,base,runtimeRoot:root,runtimeDigest:before,runtimeDigestAfter:after,runtimeUnchanged:before===after,criteria:{boundaryJumpMaxMeters:.01,boundarySampling:'Every adjacent timeline segment, all four actors; ±1 microsecond discontinuity and ±1/120 second foot speed around boundary.',contactErrorMaxMeters:.02,seekHistoryMaxMeters:1e-7,rateRatioTolerance:.25,footMetrics:'Measured through ±60ms contact. Origin height is not sole-ground gap; independent visual ground review required.',continuity:'Adjacent1/60s simulation samples; reported for visual review, no aesthetic-coordinate assertions'},timing,cases:report,errors,failures},null,2));
const boundaryMax={root:0,paddle:0,head:0,leftFoot:0,rightFoot:0};for(const r of report)for(const b of r.boundaries)for(const a of Object.values(b.actors))for(const [part,jump] of Object.entries(a.jumpMeters))boundaryMax[part]=Math.max(boundaryMax[part],jump);
await writeFile(join(out,'stroke-acceptance-summary.json'),JSON.stringify({runtimeDigest:before,runtimeUnchanged:before===after,cases:report.length,failures,errors,maxContactErrorMeters:Math.max(...report.map(r=>r.contactError)),maxSeekErrorMeters:Math.max(...report.map(r=>r.seekError)),maxSingleApplySeekErrorMeters:Math.max(...report.map(r=>r.singleApplySeekError)),maxArmReachMeters:Math.max(...report.map(r=>r.maxWristReach)),maxGripErrorMeters:Math.max(...report.map(r=>r.maxGripError)),maxContactFootDriftMeters:Math.max(...report.flatMap(r=>Object.values(r.feet).map(f=>f.contactWindowDrift))),boundaryMaxMeters:boundaryMax,timing},null,2));
console.log(JSON.stringify({out,cases:report.length,failures,errors,rateRatios:timing.rates.map(r=>r.ratio)}));
if(errors.length||failures.length)process.exitCode=1;
