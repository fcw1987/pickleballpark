// Measured browser CPU work and callback cadence; never a displayed FPS claim.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.argv[2],url=process.argv[3]||'http://127.0.0.1:4173/';
if(!out)throw Error('Provide output directory');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[];
for(const [width,height]of [[402,874],[1440,900]]){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,serviceWorkers:'block'});
 const start=Date.now();await page.goto(url);await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&playBuilder.courtTools.THREE);const readyMs=Date.now()-start;
 const record=await page.evaluate(async()=>{
  const b=playBuilder,v=b.board.threeD;const t=performance.now();await b.action('editShot',{field:'target.x',value:6.125});const editMs=performance.now()-t;
  // Three uploads each immutable atlas lazily at its first facing/stroke use.
  // Warm the full timeline before testing the resource bound across repeats.
  const initialResources={...v.renderer.info.memory};
  for(let i=0;i<=80;i++){b.seek(b.session.duration*i/80);v.renderer.render(v.scene,v.camera);}
  b.seek(0);
  const before={document:JSON.stringify(b.document),history:JSON.stringify(b.history),resources:{...v.renderer.info.memory}};
  let saves=0,compiles=0,renders=0;const save=b.save.bind(b),install=b.installPlay.bind(b),render=v.renderer.render.bind(v.renderer);
  b.save=(...a)=>{saves++;return save(...a);};b.installPlay=(...a)=>{compiles++;return install(...a);};v.renderer.render=(...a)=>{renders++;return render(...a);};
  const delay=ms=>new Promise(r=>setTimeout(r,ms));await delay(100);const idleBefore=renders;await delay(500);const pausedRenders=renders-idleBefore;
  const seeking=[];for(let i=0;i<80;i++){const t=performance.now();b.seek(b.session.duration*i/79);seeking.push(performance.now()-t);}
  b.seek(0);b.session.setLoop(true);b.board.plays.timingScale=.01;const startIteration=b.session.iteration;
  b.play();await new Promise((resolve,reject)=>{const deadline=performance.now()+30000;function check(){if(b.session.iteration-startIteration>=50){resolve();return;}if(performance.now()>deadline){reject(Error('50 repetitions did not complete'));return;}requestAnimationFrame(check);}requestAnimationFrame(check);});
  b.pause();b.board.plays.timingScale=1;
  const after={document:JSON.stringify(b.document),history:JSON.stringify(b.history),resources:{...v.renderer.info.memory}};
  const repeated=b.session.iteration-startIteration;
  b.save=save;b.installPlay=install;v.renderer.render=render;
  const stats=values=>{const s=[...values].sort((a,b)=>a-b);return{n:s.length,median:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)};};
  const gl=v.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {editMs,seekMs:stats(seeking),pausedRenders,repeated,savesDuringViewing:saves,compilesDuringViewing:compiles,sourcePreserved:before.document===after.document,historyPreserved:before.history===after.history,initialResources,beforeResources:before.resources,afterResources:after.resources,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),buffer:[v.renderer.domElement.width,v.renderer.domElement.height],pixelRatio:v.renderer.getPixelRatio(),renderCalls:v.renderer.info.render.calls};
 });
 expect(record.sourcePreserved).toBe(true);expect(record.historyPreserved).toBe(true);expect(record.savesDuringViewing).toBe(0);expect(record.compilesDuringViewing).toBe(0);expect(record.afterResources).toEqual(record.beforeResources);expect(record.pausedRenders).toBe(0);
 const long=await page.evaluate(async()=>{
  const b=playBuilder,source=structuredClone(b.document);source.id='measurement-sixty-four';source.opening='midrally';source.initialLayout.ball={x:7,y:14};source.initialLayout.player1={x:7,y:14};source.initialLayout.player3={x:7,y:30};
  source.shots=Array.from({length:64},(_,i)=>({id:`dink-${i+1}`,family:'dink',hitter:i%2?'player3':'player1',receiver:i===63?'auto':i%2?'player1':'player3',contactStyle:'forehand',target:i%2?{x:7,y:14}:{x:7,y:30},arc:'medium',pace:'soft',movement:{intent:'hold',pinned:false}}));
  const start=performance.now();b.loadDocument(source);const compileMs=performance.now()-start;const values=[];
  for(let i=0;i<128;i++){const t=performance.now();b.seek(b.session.duration*i/127);values.push(performance.now()-t);}
  values.sort((a,b)=>a-b);return {shots:b.compiled.validShotCount,duration:b.session.duration,compileAndInstallMs:compileMs,seeks:values.length,seekMedianMs:values[64],seekP95Ms:values[Math.floor(values.length*.95)]};
 });expect(long.shots).toBe(64);
 results.push({viewport:[width,height],dpr:2,readyMs,...record,long});await page.close();
}
await browser.close();await writeFile(`${out}/performance.json`,JSON.stringify({environment:'Headless Playwright Chromium, fresh isolated storage, local static server; CPU timing includes JavaScript sampling and controls. Fifty repeats use timingScale 0.01, separate from normal-speed recordings.',results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
