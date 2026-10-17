import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runtimeFileset} from './stamp-build.mjs';
const out=process.env.CAPTURE_DIR||'docs/art-overhaul/prototype';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4173';
const runtimeRoot=process.env.RUNTIME_ROOT||process.cwd();
const currentHead=execFileSync('git',['-C',runtimeRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
await mkdir(out,{recursive:true});
const browser=await chromium.launch();
const errors=[],metrics=[];
for(const [name,width,height] of [['desktop',1440,900],['phone-portrait',390,844],['phone-landscape',844,390]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block'});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?workspace=planner`);
 await page.waitForFunction(()=>window.pickleboard?.plays);
 await page.evaluate(()=>pickleboard.plays.load('third-shot-drop'));
 await page.locator('#play3dView').click();
 await page.waitForFunction(()=>pickleboard.threeD?.active);
 await page.screenshot({path:`${out}/${name}-3d.png`});
 if(name==='desktop'){
 for(const camera of ['sideline','behind-green','behind-orange']){
  await page.evaluate(c=>pickleboard.threeD.setCamera(c),camera);
  await page.waitForTimeout(80);await page.screenshot({path:`${out}/desktop-3d-${camera}.png`});
 }
 await page.evaluate(()=>{const v=pickleboard.threeD;v.setCamera('overhead');const s=v.timeline.segments.find(s=>s.shotSemantics?.stroke==='drop');v.cancelRenderWork();v.session.seek(s.startTime+s.contactTime);v.applyAtTime(v.clock.elapsed);v.renderer.render(v.scene,v.camera);});
 await page.screenshot({path:`${out}/desktop-contact.png`});
 }
 metrics.push(await page.evaluate(()=>{const v=pickleboard.threeD;return{screen:[innerWidth,innerHeight],state:v.getState(),memory:v.renderer.info.memory,drawCalls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,actors:[...v.playerObjects].map(([id,a])=>({id,position:a.position.toArray(),animation:a.userData.animation,paddleError:a.userData.paddleFaceWorld?.distanceTo(v.ballObject.position)}))}}));
 await page.goto(`${base}/`);await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&playBuilder.board.threeD?.active);
 await page.screenshot({path:`${out}/${name}-builder.png`});
 if(name==='phone-portrait'){
  const edit=page.locator('.builder-context-actions [data-action="collapse-inspector"]');
  if(await edit.count()) await edit.click();
  await page.waitForTimeout(100);
  const family=page.locator('.builder-family-picker > summary');
  if(await family.count()) await family.click();
  await page.evaluate(()=>document.activeElement?.blur());
  await page.waitForTimeout(80);
  const editor=await page.evaluate(()=>({
   focus:document.activeElement===document.body?'none':document.activeElement?.tagName||'none',
   inspectorOpen:!document.querySelector('.builder-inspector')?.classList.contains('builder-inspector-collapsed'),
   familyOpen:!!document.querySelector('.builder-family-picker')?.open,
   familyOptions:[...document.querySelectorAll('.builder-family-option')].map(node=>node.getAttribute('aria-label')),
   familySummaryHeight:document.querySelector('.builder-family-summary')?.getBoundingClientRect().height
  }));
  await page.screenshot({path:`${out}/phone-portrait-editor-family-menu.png`});
  const familyDetails=page.locator('.builder-family-picker');
  if(await familyDetails.count()) await familyDetails.evaluate(node=>node.open=false);
  const menu=page.locator('.builder-main-menu > summary');
  if(await menu.count()) await menu.click();
  await page.waitForTimeout(80);
  const menuMetrics=await page.evaluate(()=>({
   open:!!document.querySelector('.builder-main-menu')?.open,
   focus:document.activeElement===document.body?'none':document.activeElement?.tagName||'none',
   targets:[...document.querySelectorAll('.builder-main-menu .builder-menu-item,.builder-main-menu .builder-menu-submenu-summary')].map(node=>({label:node.getAttribute('aria-label')||node.textContent.trim(),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})),
   minimumHeight:44
  }));
  await page.screenshot({path:`${out}/phone-portrait-menu.png`});
  metrics.push({screen:[390,844],mobileEditor:editor,mobileMenu:menuMetrics});
 }
 await context.close();
}
await browser.close();
await writeFile(`${out}/capture.json`,JSON.stringify({base,currentHead,revision:currentHead,stampedSourceRevision:JSON.parse(readFileSync(`${runtimeRoot}/version.json`,'utf8')).sourceRevision,runtimeDigest:runtimeFileset(runtimeRoot).digest,workingChanges:execFileSync('git',['-C',runtimeRoot,'status','--short'],{encoding:'utf8'}),errors,metrics},null,2));
console.log(JSON.stringify({out,errors,summary:metrics.map(m=>({screen:m.screen,memory:m.memory,drawCalls:m.drawCalls,triangles:m.triangles}))},null,2));
