// App-only deterministic phone states, independent of browser chrome.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.argv[2];if(!out)throw Error('Provide output directory');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[];
for(const [width,height]of [[390,844],[430,932],[320,568],[844,390],[768,1024],[1024,768],[680,900],[1440,900]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:width<1100});const page=await context.newPage();
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4173/');await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&playBuilder.courtTools.THREE);
 for(const state of ['browse','edit','details','placement','playback']){
  if(state==='edit')await page.getByRole('button',{name:'Edit shot',exact:true}).click();
  if(state==='details')await page.locator('.builder-shot-details > summary').click();
  if(state==='placement')await page.getByRole('button',{name:'Place target on court',exact:true}).click();
  if(state==='playback'){await page.getByRole('button',{name:'Cancel target',exact:true}).click();await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>playBuilder.session.clock.elapsed>.6);await page.getByRole('button',{name:'Pause',exact:true}).click();}
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  results.push(await page.evaluate(state=>{const b=playBuilder,points=[{x:0,y:0},{x:20,y:0},{x:20,y:44},{x:0,y:44}].map(p=>b.courtTools.project(p));const area=Math.abs(points.reduce((n,p,i)=>{const q=points[(i+1)%4];return n+p.x*q.y-p.y*q.x;},0))/2;let visible=0,total=0;for(let x=0;x<=20;x+=1)for(let y=0;y<=44;y+=1){const p=b.courtTools.project({x,y}),node=document.elementFromPoint(p.x,p.y);total++;if(node&&(node.tagName==='CANVAS'||node.closest('#court')))visible++;}const canvas=b.board.threeD.renderer.domElement;return {state,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,time:b.session.clock.elapsed,camera:b.board.threeD.cameraPreset,courtPixels:area,unobscuredCourtSampleFraction:visible/total,buffer:[canvas.width,canvas.height]};},state));
  await page.screenshot({path:`${out}/${width}x${height}-${state}.png`});
 }
 await context.close();
}
await writeFile(`${out}/measurements.json`,JSON.stringify(results,null,2)+'\n');await browser.close();
