import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();
await page.goto('http://127.0.0.1:4175/?workspace=planner');
await page.waitForFunction(()=>window.pickleboard?.plays);
await page.evaluate(()=>pickleboard.plays.load('third-shot-drop'));
await page.locator('#play3dView').click();
await page.waitForFunction(()=>pickleboard.threeD?.active);
const results=[];
for(const mode of ['full','no-fill','no-ground-shadows','no-village','no-actors','full']){
  const result=await page.evaluate(async mode=>{
    const v=pickleboard.threeD;
    const directionals=v.scene.children.filter(o=>o.isDirectionalLight);
    directionals[1].visible=mode!=='no-fill';
    for(const o of v.world.group.children){
      if(o.name.startsWith('Neighborhood'))o.visible=mode!=='no-village';
      if(o.name.startsWith('GardenGroundContact'))o.visible=!['no-village','no-ground-shadows'].includes(mode);
    }
    for(const o of v.playerObjects.values())o.visible=mode!=='no-actors';
    v.restart();v.togglePlay();await new Promise(r=>setTimeout(r,500));v.togglePlay();v.restart();
    const intervals=[];v.togglePlay();
    await new Promise(resolve=>{let first,prior;function tick(t){first??=t;if(prior!=null)intervals.push(t-prior);prior=t;if(t-first<4000)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
    v.togglePlay();intervals.sort((a,b)=>a-b);
    return{mode,count:intervals.length,median:intervals[Math.floor(intervals.length*.5)],p95:intervals[Math.floor(intervals.length*.95)],calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
  },mode);
  results.push(result);
}
await browser.close();
await writeFile('docs/town-art/verification/component-probe.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
