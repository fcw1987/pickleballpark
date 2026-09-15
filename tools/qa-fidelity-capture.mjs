// Matched visual captures. UI actions open surfaces; read-only probes measure composition.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4184/';
const output=process.env.EVIDENCE_DIR||'/private/tmp/park-fidelity-captures';
await mkdir(output,{recursive:true});
const sizes=[['phone',390,844],['phone-large',430,932],['phone-small',320,568],['landscape',844,390],['tablet',768,1024],['desktop',1440,900]];
const browser=await chromium.launch();const records=[];
try{
 for(const [label,width,height] of sizes){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:label==='phone'?3:2,hasTouch:width<1000,serviceWorkers:'block'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&pickleboard.threeD.renderer);
  await page.evaluate(()=>document.fonts.ready);
  const snap=async state=>{await page.screenshot({path:`${output}/${label}-${state}.png`,scale:'css',animations:'disabled'});};
  await snap('rest-3d');
  const metric=await page.evaluate(async()=>{
   const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
   const v=pickleboard.threeD,canvas=rect(v.renderer.domElement),ui=[...document.querySelectorAll('.builder-meta,.builder-transport')].map(rect);
   const THREE=await import('./vendor/three.module.min.js');const {boardToWorld}=await import('./three-d-core.js');
   const points=[[0,0],[20,0],[20,44],[0,44]].map(([x,y])=>{const w=boardToWorld({x,y});const p=new THREE.Vector3(w.x,0,w.z).project(v.camera);return {x:canvas.x+(p.x+1)*canvas.width/2,y:canvas.y+(1-p.y)*canvas.height/2};});
   const area=Math.abs(points.reduce((a,p,i)=>{const q=points[(i+1)%points.length];return a+p.x*q.y-q.x*p.y;},0))/2;
   const controls=[...document.querySelectorAll('.builder-ui button,.builder-ui summary,.builder-ui input')].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>({name:n.getAttribute('aria-label')||n.textContent,rect:rect(n),font:getComputedStyle(n).fontFamily,fontSize:getComputedStyle(n).fontSize}));
   return {viewport:[innerWidth,innerHeight],devicePixelRatio,canvas,buffer:[v.renderer.domElement.width,v.renderer.domElement.height],ui,worldHostFraction:canvas.width*canvas.height/(innerWidth*innerHeight),permanentUiFraction:ui.reduce((a,r)=>a+r.width*r.height,0)/(innerWidth*innerHeight),projectedCourtFraction:area/(innerWidth*innerHeight),courtCorners:points,allCourtCornersInViewport:points.every(p=>p.x>=0&&p.y>=0&&p.x<=innerWidth&&p.y<=innerHeight),controls};
  });
  if(label==='phone')await page.screenshot({path:`${output}/phone-rest-3d-dpr3.png`,scale:'device',animations:'disabled'});
  await page.locator('[data-action="view"][data-view="2d"]:visible').click();await page.waitForFunction(()=>!playBuilder.busy&&playBuilder.view==='2d');await snap('rest-2d');
  await page.locator('[data-action="view"][data-view="3d"]:visible').click();await page.waitForFunction(()=>!playBuilder.busy&&playBuilder.view==='3d');
  await page.locator('.builder-main-menu > summary').click();await snap('menu');await page.locator('.builder-main-menu > summary').click();
  await page.locator('.builder-context-actions [data-action="collapse-inspector"]').click();await snap('shot-card');
  const details=page.locator('.builder-shot-details > summary');await expect(details).toBeVisible();await details.click();await snap('details');
  records.push({label,metric,errors});await context.close();
 }
}finally{await browser.close();}
await writeFile(`${output}/measurements.json`,JSON.stringify({base,method:'Fresh isolated contexts; completed view changes and CSS transitions disabled for still captures; CSS-pixel captures plus phone DPR3 original. Court fraction is projected regulation surface, not a usability score; host/UI fractions are separate rectangles.',records},null,2));
console.log(JSON.stringify(records.map(({label,metric,errors})=>({label,worldHostFraction:metric.worldHostFraction,permanentUiFraction:metric.permanentUiFraction,projectedCourtFraction:metric.projectedCourtFraction,allCourtCornersInViewport:metric.allCourtCornersInViewport,errors})),null,2));
