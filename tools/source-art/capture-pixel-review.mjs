// Capture the actual app: identical authored lesson/contact time at every size.
// No screenshot-only CSS, compositing, or replacement UI is applied.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {createStaticServer} from '../../tests/helpers/static-server.mjs';
const out='release-results/pixel-final/screens';
await mkdir(out,{recursive:true});
let server;
const url=process.env.PREVIEW_URL||'http://127.0.0.1:4208/';
if(!process.env.PREVIEW_URL){server=createStaticServer();await new Promise(resolve=>server.listen(4208,'127.0.0.1',resolve));}
const browser=await chromium.launch();const evidence=[];const errors=[];
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:844}]){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await context.newPage();page.on('pageerror',error=>errors.push({viewport,message:error.message}));
  await page.goto(url);await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&pickleboard.pixelRenderer?.getDiagnostics());
  await page.evaluate(()=>document.fonts.ready);
  await page.clock.install({time:new Date('2026-10-27T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-27T12:00:01Z'));
  for(const lesson of ['dink-exchange','volley-block']){
   const sample=await page.evaluate(async lesson=>{
    const b=playBuilder;await b.action('template',lesson);
    await b.board.plays.pixelActors.load();
    const segment=b.compiled.timeline.segments.find(segment=>segment.shotSemantics);
    if(!segment)throw new Error(`No shot segment in ${lesson}`);
    const time=segment.startTime+segment.contactTime;
    b.seek(time);b.play();b.board.plays.applyAtTime(time);b.render();b.board.pixelRenderer.render(time*1000);
    return{lesson,title:b.document.title,shot:segment.shotSemantics.shotType||segment.step.shot.type,time,
      playing:b.session.playing,view:b.view,document:structuredClone(b.document),
      canvas:b.board.pixelRenderer.getDiagnostics(),
      reticleVisible:Boolean(document.querySelector('.builder-court-tools circle')),
      overflow:document.documentElement.scrollWidth>innerWidth};
   },lesson);
   const stem=`${lesson}-${viewport.width}x${viewport.height}`;
   await page.screenshot({path:`${out}/${stem}-playback.png`});
   await page.getByRole('button',{name:'Edit shot',exact:true}).click();
   // Editing pauses the playhead. Advance only enough browser frames for the
   // inspector's responsive layout and the canvas to share the new viewport.
   await page.clock.runFor(40);
   await page.screenshot({path:`${out}/${stem}-editor.png`});
   sample.editor=await page.evaluate(()=>({time:playBuilder.session.clock.elapsed,playing:playBuilder.session.playing,
     selectedShot:playBuilder.selectedShotId,inspectorVisible:!document.querySelector('.builder-inspector').classList.contains('builder-inspector-collapsed')}));
   evidence.push({viewport,...sample,files:[`${stem}-playback.png`,`${stem}-editor.png`]});
   await page.getByRole('button',{name:'Close editor',exact:true}).click();
   await page.clock.runFor(40);
  }
  await context.close();
 }
 await writeFile(`${out}/capture-evidence.json`,JSON.stringify({method:'Native authored lessons; playback at exact contact with browser clock frozen; editor pauses the same playhead and allows 40ms of browser layout/render frames before capture; no visual overrides',evidence,errors},null,2)+'\n');
 if(errors.length)throw new Error(JSON.stringify(errors));
 console.log(`Captured ${evidence.length*2} app screens, ${errors.length} page errors. Evidence: ${out}/capture-evidence.json`);
}finally{await browser.close();await new Promise(resolve=>server?server.close(resolve):resolve());}
