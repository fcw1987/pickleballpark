// Bounded controller integration soak and local action timings. UI journeys
// are reviewed separately; callback cadence is not displayed frame rate.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import os from 'node:os';
import {chromium,webkit} from '@playwright/test';
import {automaticRepairScenario} from '../tests/fixtures/smart-coach-scenarios.mjs';

const output=process.argv[2];if(!output)throw Error('Provide an output JSON path.');
const url=process.env.PREVIEW_URL||'http://127.0.0.1:4184/';
const rounds=20,results=[],repair=await automaticRepairScenario();
for(const [name,engine]of Object.entries({chromium,webkit})){
  const browser=await engine.launch();
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const started=performance.now();await page.goto(url);
  await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&pickleboard.threeD?.renderer);
  const readyMs=performance.now()-started;
  const run=await page.evaluate(async({rounds,repair})=>{
    const b=playBuilder,samples=[],resources=[];
    const check=(value,message)=>{if(!value)throw Error(message);};
    const timed=async(label,fn)=>{const start=performance.now(),result=await fn();check(result?.ok!==false,`${label}: ${result?.error}`);samples.push({label,ms:performance.now()-start});return result;};
    for(let round=0;round<rounds;round++){
      await b.action('new');
      await timed('one Add',()=>b.action('addShot',{seed:round*11}));
      await b.action('undo');check(b.document.shots.length===0,'single Add Undo');
      await timed('five rapid Adds',()=>Promise.all(Array.from({length:5},(_,i)=>b.action('addShot',{seed:round*11+i}))).then(values=>({ok:values.every(v=>v.ok)})));
      check(b.document.shots.length===5&&b.compiled.validShotCount===5,'rapid Add count/validity');
      const five=JSON.stringify(b.document);
      await b.action('selectShot',b.document.shots[2].id);
      await timed('family change',()=>b.action('editShot',{field:'family',value:b.document.shots[2].family==='drop'?'drive':'drop'}));
      await b.action('undo');check(JSON.stringify(b.document)===five,'family change Undo changed intent');
      await b.action('deleteShot',b.document.shots[2].id);await b.action('undo');check(JSON.stringify(b.document)===five,'delete/Undo changed intent');
      await b.action('redo');await b.action('undo');check(JSON.stringify(b.document)===five,'Redo/Undo changed intent');
      for(let seek=0;seek<20;seek++)b.seek(b.session.duration*seek/19);
      await b.action('help');pickleboard.closeInfoModal();
      const menu=b.ui.element.querySelector('.builder-main-menu');menu.open=true;menu.open=false;
      await b.switchView('2d');await b.switchView('3d');
      await b.setWorkspace('planner');await b.setWorkspace('builder');check(JSON.stringify(b.document)===five,'Planner round trip changed intent');
      b.loadDocument(repair);const broken=JSON.stringify(b.document);
      await timed('Coach repair',()=>b.action('coachFix'));check(b.compiled.validShotCount===b.document.shots.length,'Coach left invalid rally');
      await b.action('undo');check(JSON.stringify(b.document)===broken,'Coach Undo changed source');await b.action('redo');
      const fixed=JSON.stringify(b.document);b.save();check(JSON.stringify(b.store.loadLast())===fixed,'saved document differs');
      resources.push({...pickleboard.threeD.renderer.info.memory});
    }
    for(const count of[1,7,20,99]){
      let callbacks=0,last=performance.now(),maxGap=0;
      const interval=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;callbacks++;},16);
      try{await timed(`Random ${count}`,()=>b.action('randomRally',{count,seed:12648430}));}finally{clearInterval(interval);}
      check(b.document.shots.length===count&&b.compiled.validShotCount===count,'Random exactness/validity');
      samples.at(-1).responsiveness={callbacks,maxGapMs:maxGap};
      if(count===99)check(callbacks>0,'99-hit generation did not yield to other callbacks');
    }
    const full=JSON.stringify(b.document);
    for(let i=0;i<200;i++){await b.action('selectShot',b.document.shots[i%99].id);b.seek((i%100)/99*b.session.duration);}
    check(JSON.stringify(b.document)===full,'selection/seeking mutated source');
    b.pause();b.save();
    return {rounds,samples,resources,document:b.document,chapters:b.chapters.length,playing:b.session.playing};
  },{rounds,repair});
  assert.equal(run.chapters,99);assert.equal(run.playing,false);
  await page.reload();await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy);
  assert.deepEqual(await page.evaluate(()=>playBuilder.document),run.document);
  assert.deepEqual(errors,[]);
  const warm=run.resources.slice(5);assert.ok(warm.every(item=>item.geometries===warm[0].geometries&&item.textures===warm[0].textures),'retained renderer resources grew after warmup');
  delete run.document;
  results.push({browser:name,version:browser.version(),viewport:[390,844],dpr:2,readyMs,...run,reload99:true,pageErrors:errors});
  await browser.close();
}
await writeFile(output,JSON.stringify({method:'controller integration; 16 ms timer responsiveness, not displayed FPS',platform:os.platform(),cpu:os.cpus()[0]?.model,rounds,seed:12648430,results},null,2)+'\n');
console.log(`Smart session soak passed for ${results.length} browsers; ${rounds} rounds each. Evidence: ${output}`);
