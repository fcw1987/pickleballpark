// Synthetic app-only captures. No browser chrome, profiles or personal plays.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.argv[2],url=process.argv[3]||'http://127.0.0.1:4173/';
if(!out)throw Error('Provide capture output directory');
await mkdir(out,{recursive:true});
const browser=await chromium.launch();const measurements=[];
for(const [width,height,dpr] of [[402,874,3],[390,844,3],[430,932,3],[320,568,2],[874,402,2],[768,1024,2],[1440,900,1]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:width<1100,serviceWorkers:'block'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const start=Date.now();await page.goto(url);await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&playBuilder.board.threeD?.renderer&&playBuilder.courtTools.THREE);const readyMs=Date.now()-start;
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{document.body.classList.toggle('dark-mode',theme==='dark');document.documentElement.setAttribute('data-theme',theme);document.body.setAttribute('data-theme',theme);},theme);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const metric=await page.evaluate(()=>{
   const b=playBuilder,corners=[{x:0,y:0},{x:20,y:0},{x:20,y:44},{x:0,y:44}].map(p=>b.courtTools.project(p));
   const area=Math.abs(corners.reduce((n,p,i)=>{const q=corners[(i+1)%4];return n+p.x*q.y-p.y*q.x;},0))/2;
   let visible=0,total=0;for(let x=0;x<=20;x++)for(let y=0;y<=44;y++){const p=b.courtTools.project({x,y});const n=document.elementFromPoint(p.x,p.y);total++;if(n&&(n.tagName==='CANVAS'||n.closest('#court')||n.closest('.builder-court-tools')))visible++;}
   const renderer=b.board.threeD.renderer,canvas=renderer.domElement,r=canvas.getBoundingClientRect();
   return {courtPixels:area,unoccludedSampleFraction:visible/total,unoccludedCourtEstimate:area*visible/total,corners,canvas:{x:r.x,y:r.y,width:r.width,height:r.height},buffer:[canvas.width,canvas.height],resources:{...renderer.info.memory},time:b.session.clock.elapsed,playing:b.session.clock.playing,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,visibleButtons:[...document.querySelectorAll('button')].filter(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height&&getComputedStyle(n).visibility!=='hidden').map(n=>n.getAttribute('aria-label')||n.textContent.trim())};
  });
  measurements.push({viewport:[width,height],dpr,theme,readyMs,...metric,errors});
  await page.screenshot({path:`${out}/${width}x${height}-${theme}-rest.png`});
 }
 await context.close();
}
await browser.close();await writeFile(`${out}/measurements.json`,JSON.stringify(measurements,null,2)+'\n');
console.log(JSON.stringify({captures:measurements.length,errors:measurements.flatMap(m=>m.errors),phone:measurements[0]},null,2));
