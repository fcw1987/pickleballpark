// Isolated actual-runtime evidence. No runtime edits, restamps or benchmark claims.
import {createHash} from 'node:crypto';
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runtimeFileset } from './stamp-build.mjs';
import { strokeReviewCases } from '../tests/fixtures/stroke-review-cases.mjs';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4176';
const root=process.env.RUNTIME_ROOT||process.cwd();
const out=resolve(process.env.CAPTURE_DIR||'docs/stroke-review/baseline');
const cases=process.env.STROKE_CASES?strokeReviewCases.filter(c=>process.env.STROKE_CASES.split(',').includes(c.id)):strokeReviewCases;
const dense=process.env.STROKE_DENSE==='1';
const videoEnabled=process.env.STROKE_VIDEO!=='0';
await mkdir(out,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'stroke-motion-'));
const digestBefore=runtimeFileset(root).digest;
const sourceReference=process.env.RUNTIME_SOURCE_REVISION;
if(sourceReference){if(!/^[a-f0-9]{40}$/.test(sourceReference))throw new Error('Snapshot source must be an exact commit');for(const file of runtimeFileset(root).files){const bytes=execFileSync('git',['show',`${sourceReference}:${file.path}`],{maxBuffer:20*1024*1024});if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`Snapshot does not match declared source: ${file.path}`);}}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:900,height:700},deviceScaleFactor:1,serviceWorkers:'block',...(videoEnabled?{recordVideo:{dir:temp,size:{width:900,height:700}}}:{})});
const page=await context.newPage(),errors=[],result=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto(`${base}/?workspace=builder&stroke-review=1`);
await page.waitForFunction(()=>window.pickleboard?.plays&&window.pickleboard?.threeD&&window.playBuilder&&!playBuilder.busy);
await page.evaluate(()=>playBuilder.setWorkspace('planner'));
const runtimeDefaults=await page.evaluate(()=>({clock:{...pickleboard.plays.clock},rate:pickleboard.plays.session?.rate,rateUI:document.querySelector('#threeDRate')?.value,raf:'browser requestAnimationFrame, actual callback intervals sampled separately; Playwright video capture cadence is not physical display FPS'}));
for(const c of cases){
 const sourceDocument=c.fixture?JSON.parse(readFileSync(c.fixture,'utf8')):null;
 const meta=await page.evaluate(async({c,sourceDocument})=>{
  const board=pickleboard;
  if(board.threeD.active)board.threeD.exit();
  let play=JSON.parse(JSON.stringify(board.plays.plays.get(c.playId))),suppliedTimeline=null,authoringDocument=null;
  if(sourceDocument){authoringDocument=structuredClone(sourceDocument);for(const settings of Object.values(authoringDocument.players))settings.handedness=c.hand;const {compileEffectiveCandidate}=await import('./rally-proposals.js');const compiled=compileEffectiveCandidate(authoringDocument);if(compiled.validShotCount!==authoringDocument.shots.length)throw new Error('Fixture does not compile all exact authored shots');play=structuredClone(compiled.play);suppliedTimeline=compiled.timeline;}
  let step=play.steps.find(s=>s.id===c.stepId);
  if(c.authored==='drive-backhand'){
   play.id=`stroke-review-${c.id}`;play.name='Authored backhand drive review';
   step.shot.stroke='backhand';step.shot.contact.strokeSide='backhand';
  }
  if(c.authored==='overhead-backhand'){play.id=`stroke-review-${c.id}`;play.name='Authored backhand overhead review';step.shot.contact.strokeSide='backhand';step.shot.contact.heightFeet=7;}
  if(authoringDocument){playBuilder.loadDocument(authoringDocument);play=structuredClone(board.plays.activePlay);step=play.steps.find(s=>s.id===c.stepId);}else{board.plays.loadDefinition(play,suppliedTimeline);for(const token of Object.values(board.tokens))if(token.handedness)token.handedness=c.hand;}
  for(const [id,token]of Object.entries(board.tokens))if(token.handedness&&token.handedness!==c.hand)throw new Error(`Token hand mismatch after load: ${id} ${token.handedness} expected ${c.hand}`);
  return {play,shot:step.shot,authoringDocument};
 },{c,sourceDocument});
 await page.locator('#play3dView').click();
 await page.waitForFunction(()=>pickleboard.threeD?.active&&pickleboard.threeD.playerObjects.size===4);
 const sequence=await page.evaluate(({c,meta,dense})=>{
  const v=pickleboard.threeD,s=v.timeline.segments.find(x=>x.step.id===c.stepId),actor=v.playerObjects.get(s.shotSemantics.playerId);
  v.cancelRenderWork();v.session.pause();
  const t=s.startTime+s.contactTime;
  v.session.seek(t);v.applyAtTime(t);
  if(actor.userData.handedness!==c.hand||pickleboard.tokens[s.shotSemantics.playerId].handedness!==c.hand)throw new Error(`Effective actor hand mismatch after enter/contact: ${c.id}`);
  const yaw=actor.userData.visual.rotation.y,anchor=actor.position.clone();
  const side=c.hand==='right'?-1:1;
  const x=(['return','overhead'].includes(c.stepId)?1:side)*2.65,z=4.1;
  const camera={position:[anchor.x+x*Math.cos(yaw)+z*Math.sin(yaw),(c.fixture?2.3:1.72),anchor.z-x*Math.sin(yaw)+z*Math.cos(yaw)],target:[anchor.x,.96,anchor.z],fov:c.fixture?36:34};
  window.__strokeCamera=camera;
  const offsets=dense?Array.from({length:c.stepId==='return'?43:28},(_,i)=>(c.stepId==='return'?-.6:-.5)+i/30):[-.46,-.32,-.23,-.14,-.07,0,.07,.15,.27,.44];
  return {effectiveHandedness:actor.userData.handedness,effectiveTokenHandedness:pickleboard.tokens[s.shotSemantics.playerId].handedness,contactTime:t,timelineEvents:v.timeline.events,segmentStart:s.startTime,segmentEnd:s.endTime,duration:v.timeline.duration,semantics:s.shotSemantics,offsets:offsets.map(x=>({offset:x,time:Math.max(0,Math.min(v.timeline.duration,t+x))})),camera};
 },{c,meta,dense});
 const draw=async(time,close=true)=>page.evaluate(({time,close,hand})=>{
  const v=pickleboard.threeD;v.cancelRenderWork();v.session.seek(time);v.applyAtTime(time);v.updateUI();for(const [id,actor]of v.playerObjects)if((actor.userData.handedness!==hand||pickleboard.tokens[id].handedness!==hand))throw new Error(`Actor/token hand diverged at ${time}`);
  if(close){const c=window.__strokeCamera;v.camera.clearViewOffset();v.camera.aspect=v.elements.canvas.clientWidth/v.elements.canvas.clientHeight;v.camera.fov=c.fov||34;v.camera.position.set(...c.position);v.camera.lookAt(...c.target);v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld(true);}
  v.updateBallReadability();v.renderer.render(v.scene,v.camera);
 },{time,close,hand:c.hand});
 // Fixed three-quarter camera, includes full body and ground, every phase from actual timeline.
 const style=await page.addStyleTag({content:'.three-d-hud,.builder-planner .builder-inspector { visibility:hidden!important; }'});
 const frames=[];
 for(let i=0;i<sequence.offsets.length;i++){
  const sample=sequence.offsets[i];await draw(sample.time);
  const filename=`${c.id}-${String(i).padStart(2,'0')}.png`;
  await page.locator('#threeDCanvas').screenshot({path:join(out,filename)});
  frames.push({...sample,file:filename,...await page.evaluate(id=>{
   const v=pickleboard.threeD,a=v.playerObjects.get(id),d=a.userData,p=a.position.clone();
   if(d.handedness!==pickleboard.tokens[id].handedness)throw new Error('Actor/token handedness differs');return {effectiveHandedness:d.handedness,tokenHandedness:pickleboard.tokens[id].handedness,phase:d.animation.phase,action:d.animation.action,root:a.position.toArray(),paddle:d.paddleFaceWorld.toArray(),ball:v.ballObject.position.toArray(),feet:Object.fromEntries(Object.entries(d.legs).map(([k,l])=>[k,l.foot.getWorldPosition(p.clone()).toArray()])),torsoRotation:d.upper.rotation.toArray().slice(0,3)};
  },sequence.semantics.playerId)});
 }
 if(videoEnabled&&['moving-return-right','forehand-drive-right','backhand-drive-right','lob-right','forehand-drive-left','backhand-drive-left','lob-left'].includes(c.id)){
  await draw(Math.max(0,sequence.contactTime-(c.stepId==='return'?.6:.45)));
  await page.evaluate(()=>{const v=pickleboard.threeD;window.__strokeChunks=[];window.__strokeRecorder=new MediaRecorder(v.renderer.domElement.captureStream(30),{mimeType:'video/webm'});window.__strokeRecorder.ondataavailable=e=>window.__strokeChunks.push(e.data);window.__strokeRecorder.start();v.setPlaybackRate(.25);v.session.play();v.startRenderLoop();});
  await page.waitForTimeout(c.stepId==='return'?6000:3600);
  const clip=await page.evaluate(async()=>{pickleboard.threeD.cancelRenderWork();pickleboard.threeD.session.pause();const r=window.__strokeRecorder;const done=new Promise(resolve=>r.onstop=resolve);r.stop();await done;const bytes=new Uint8Array(await new Blob(window.__strokeChunks,{type:'video/webm'}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);return btoa(binary);});
  await writeFile(join(out,`${c.id}-slow.webm`),Buffer.from(clip,'base64'));
 }
 await style.evaluate(e=>e.remove());
 await page.evaluate(()=>pickleboard.threeD.setCamera('overhead'));
 await draw(sequence.contactTime,false);
 await page.screenshot({path:join(out,`${c.id}-court.png`)});
 await page.setViewportSize({width:402,height:874});
 await page.evaluate(()=>pickleboard.threeD.setCamera('overhead'));
 await draw(sequence.contactTime,false);
 await page.screenshot({path:join(out,`${c.id}-phone.png`)});
 await page.setViewportSize({width:900,height:700});
 result.push({case:c,...meta,...sequence,frames});
 console.log(`captured ${c.id}`);
}
const video=page.video();await context.close();
if(video)await video.saveAs(join(out,'stroke-slow-motion.webm'));
await browser.close();await rm(temp,{recursive:true,force:true});
const digestAfter=runtimeFileset(root).digest;
const report={launcherNode:process.version,base,runtimeRoot:root,head:sourceReference||execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),snapshotSourceVerified:Boolean(sourceReference),stampedSourceRevision:JSON.parse(readFileSync(join(root,'version.json'),'utf8')).sourceRevision,runtimeDigest:digestBefore,runtimeDigestAfter:digestAfter,runtimeUnchanged:digestBefore===digestAfter,viewport:[900,700],phoneViewport:[402,874],runtimeDefaults,video:{enabled:videoEnabled,rate:.25,cadence:'Full film uses Playwright recorder default; individual canvas clips request30fps MediaRecorder from actual rendered frames; neither is physical display FPS measurement'},camera:'Fixed 3/4 custom inspection camera; ordinary overhead screenshots retained',cases:result,errors};
await writeFile(join(out,'stroke-report.json'),JSON.stringify(report,null,2));
// Offline contact sheets contain the actual screenshots; unlabelled board supports blind recognition.
execFileSync('python3',[resolve('tools/stroke-sheets.py'),out]);
console.log(JSON.stringify({out,cases:result.length,runtimeUnchanged:report.runtimeUnchanged,errors}));
if(!report.runtimeUnchanged||errors.length)process.exitCode=1;
