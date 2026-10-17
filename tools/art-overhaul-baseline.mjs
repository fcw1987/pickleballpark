import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const out = resolve(process.env.CAPTURE_DIR || 'docs/art-overhaul/before');
const baseUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:4174/index.html';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
async function context(viewport, recordVideo = false) {
  return browser.newContext({ viewport, deviceScaleFactor: 1, ...(recordVideo ? { recordVideo: { dir: out, size: viewport } } : {}) });
}
async function visit(page, suffix='') {
  page.on('pageerror', error => errors.push(error.message));
  const navStarted = performance.now();
  await page.goto(`${baseUrl}?workspace=planner&three-d-visual=1${suffix}`);
  await page.waitForFunction(() => Boolean(window.pickleboard?.threeD));
  page._baselineBootMs = performance.now() - navStarted;
  page._baselineNavigation = await page.evaluate(() => { const n=performance.getEntriesByType('navigation')[0]; return {domContentLoaded:n.domContentLoadedEventEnd,loadEvent:n.loadEventEnd,transferBytes:n.transferSize}; });
  await page.evaluate(() => window.pickleboard.plays.load('third-shot-drop'));
  await page.waitForTimeout(900);
}
const desktopCtx = await context({width:1440,height:900});
const desktop = await desktopCtx.newPage();
await visit(desktop);
await desktop.screenshot({path:`${out}/desktop-2d.png`, fullPage:true});
await desktop.locator('#menuToggle').click(); await desktop.waitForTimeout(200);
await desktop.screenshot({path:`${out}/desktop-menu.png`,fullPage:true});
await desktop.locator('#menuClose').click();
await desktop.locator('#play3dView').click();
await desktop.waitForSelector('#threeDCanvas canvas'); await desktop.waitForTimeout(1600);
await desktop.screenshot({path:`${out}/desktop-3d.png`,fullPage:true});
await desktop.locator('#threeDViewer .playback-options summary').click(); await desktop.locator('#threeDCamera').selectOption('sideline'); await desktop.waitForTimeout(600);
await desktop.screenshot({path:`${out}/desktop-3d-sideline.png`,fullPage:true});
const rendererMetrics = await desktop.evaluate(async () => {
 const v=window.pickleboard.threeD, r=v.renderer, gl=r.getContext();
 const info=r.info;
 return {state:v.getState(), viewport:{w:innerWidth,h:innerHeight},canvas:{w:v.elements.canvas.clientWidth,h:v.elements.canvas.clientHeight,pixelW:v.elements.canvas.width,pixelH:v.elements.canvas.height},renderer:{calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,programs:info.programs?.length},webgl:{version:gl.getParameter(gl.VERSION),vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER)},diag:window.pickleboard.buildDiagnostics?.getState?.()??null};
});
const frameMetrics = await desktop.evaluate(async () => {
 const v=window.pickleboard.threeD; const times=[]; v.togglePlay();
 await new Promise(resolve=>{let first=null,prior=null; function tick(t){first??=t;if(prior!==null)times.push(t-prior);prior=t;if(t-first<5000)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);}); v.togglePlay();
 const sorted=[...times].sort((a,b)=>a-b);const q=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
 return {rafSamples:times.length,medianIntervalMs:q(.5),p95IntervalMs:q(.95),over25ms:times.filter(t=>t>25).length,renderFrames:v.renderer.info.render.frame};
});
await writeFile(`${out}/desktop-metrics.json`,JSON.stringify({bootMs:desktop._baselineBootMs,navigation:desktop._baselineNavigation,rendererMetrics,frameMetrics,errors},null,2));
const videoCtx = await context({width:1280,height:800},true);
const videoPage=await videoCtx.newPage(); await visit(videoPage); await videoPage.locator('#play3dView').click(); await videoPage.waitForSelector('#threeDCanvas canvas'); await videoPage.waitForTimeout(500);
await videoPage.locator('#threeDPlayPause').click(); await videoPage.waitForTimeout(5200); await videoPage.locator('#threeDPlayPause').click(); await videoPage.waitForTimeout(300);
const video=videoPage.video(); await videoCtx.close(); const vpath=await video.path();
const {copyFile}=await import('node:fs/promises'); await copyFile(vpath,`${out}/baseline-motion.webm`);
async function mobile(name, viewport) {
 const ctx=await context(viewport); const page=await ctx.newPage(); await visit(page);
 await page.screenshot({path:`${out}/${name}-2d.png`,fullPage:true});
 await page.locator('#play3dView').click(); await page.waitForSelector('#threeDCanvas canvas'); await page.waitForTimeout(1200);
 await page.screenshot({path:`${out}/${name}-3d.png`,fullPage:true});
 const sizes=await page.evaluate(()=>({screen:[innerWidth,innerHeight],canvas:[...document.querySelectorAll('#threeDCanvas canvas')].map(c=>[c.clientWidth,c.clientHeight]),viewer:document.querySelector('#threeDViewer').getBoundingClientRect().toJSON(),controls:[...document.querySelectorAll('#threeDViewer button,#threeDViewer select')].map(e=>({id:e.id,rect:e.getBoundingClientRect().toJSON(),disabled:e.disabled}))}));
 await writeFile(`${out}/${name}-metrics.json`,JSON.stringify(sizes,null,2)); await ctx.close();
}
await mobile('phone-portrait',{width:390,height:844});
await mobile('phone-landscape',{width:844,height:390});
await desktopCtx.close(); await browser.close();
console.log(JSON.stringify({out,bootMs:desktop._baselineBootMs,rendererMetrics,frameMetrics,errors},null,2));
