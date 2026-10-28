// Reproducible labeled recording of the actual default depth app. Never mutates saved plays.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {pixelAuthoringCases} from '../tests/fixtures/pixel-authoring-cases.mjs';
const out=process.env.STROKE_MATRIX_OUT||'release-results/reference-stroke-reel';await mkdir(out,{recursive:true});
const cases=pixelAuthoringCases().filter(c=>['forehand','backhand','short-hop'].includes(c.contactStyle));
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block',recordVideo:{dir:out,size:{width:1440,height:900}}}),page=await context.newPage(),errors=[],evidence=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4241');await page.waitForFunction(()=>window.playBuilder?.view==='3d'&&pickleboard.threeD?.worldAssetsReady);await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>{const label=document.createElement('div');label.id='stroke-review-label';label.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:10px 16px;background:#142329;color:white;font:600 18px system-ui;z-index:99999;border-radius:8px;pointer-events:none';document.body.append(label);});
 for(const [index,item] of cases.entries()){
  const record=await page.evaluate(async({item,index})=>{
   playBuilder.pause();playBuilder.loadDocument(item.document,{persist:false});const segment=playBuilder.compiled.timeline.segments.find(s=>s.shotSemantics),v=pickleboard.threeD,id=segment.shotSemantics.playerId;
   playBuilder.seek(segment.startTime+segment.contactTime);const actor=v.playerObjects.get(id),position=actor.position;
   v.cameraControls.setState({azimuth:Math.PI*.15,elevation:36,distance:6.5,target:{x:position.x,y:.7,z:position.z}});
   const label=document.getElementById('stroke-review-label');label.textContent=`${index+1} / ${item.family.toUpperCase()} · ${item.contactStyle} · ${item.handedness} hand${item.serveMethod?' · '+item.serveMethod+' serve':''}`;
   const start=Math.max(0,segment.contactTime-segment.shotSemantics.profile.duration*segment.shotSemantics.profile.contactRatio),end=Math.min(segment.duration,segment.contactTime+segment.shotSemantics.profile.duration*(1-segment.shotSemantics.profile.contactRatio));
   const begin=performance.now();await new Promise(resolve=>{function frame(now){const t=Math.min(1,(now-begin)/1300);playBuilder.seek(segment.startTime+start+(end-start)*t);if(t<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
   playBuilder.seek(segment.startTime+segment.contactTime);
   return {id:item.id,family:item.family,contactStyle:item.contactStyle,handedness:item.handedness,serveMethod:item.serveMethod,sourceStart:start,sourceEnd:end,contactError:actor.userData.paddleFaceWorld.distanceTo(v.ballObject.position),animation:actor.userData.animation};
  },{item,index});
  await page.screenshot({path:`${out}/${String(index+1).padStart(2,'0')}-${item.id}.png`});evidence.push(record);
 }
}finally{const video=page.video();await context.close();await video.saveAs(`${out}/supported-strokes.webm`);await browser.close();await writeFile(`${out}/evidence.json`,JSON.stringify({cases:evidence,errors},null,2));}
if(errors.length||evidence.some(e=>e.contactError>1e-7))throw Error('Recording contains renderer errors');
console.log(`Recorded ${evidence.length} labeled actual-depth stroke cases.`);
