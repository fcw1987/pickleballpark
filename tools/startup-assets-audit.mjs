// Fair cold-load comparison: identical runtime and URLs; only image encoding differs.
import {chromium} from '@playwright/test';
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {createStaticServer} from '../tests/helpers/static-server.mjs';
const out=resolve(process.env.OUT||'release-results/startup-assets'),baseline=join(out,'png-baseline');
const assets=['assets/reference-athletes/athletes-armless-v2','assets/reference-depth/park-tree-v1'];
await mkdir(out,{recursive:true});
const runtime=JSON.parse(await readFile('tools/runtime-files.json'));
for(const file of runtime){await mkdir(dirname(join(baseline,file)),{recursive:true});await copyFile(file,join(baseline,file));}
for(const file of assets)await copyFile(`${file.replace('assets/','assets/source/')}.png`,join(baseline,`${file}.webp`));
const servers=[createStaticServer({root:baseline}),createStaticServer({root:process.cwd()})];
await Promise.all(servers.map((s,i)=>new Promise(resolve=>s.listen(4182+i,'127.0.0.1',resolve))));
const browser=await chromium.launch();const results=[];
try{
 for(let repetition=0;repetition<3;repetition++)for(const [index,label]of ['png','webp'].entries()){
  const context=await browser.newContext({viewport:{width:402,height:874},deviceScaleFactor:3,isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:4_000_000/8,uploadThroughput:1_000_000/8});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const start=performance.now();await page.goto(`http://127.0.0.1:${4182+index}/`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&playBuilder.view==='3d'&&pickleboard.threeD.worldAssetsReady&&pickleboard.threeD.renderer.info.render.calls>0,{},{timeout:30000});
  const elapsed=performance.now()-start;
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(({name,transferSize,encodedBodySize,duration})=>({path:new URL(name).pathname,transferSize,encodedBodySize,duration})));
  if(repetition===0)await page.screenshot({path:join(out,`${label}-phone.png`)});
  results.push({repetition,label,readyMs:elapsed,resources,errors});await context.close();
 }
 const context=await browser.newContext(),page=await context.newPage();await page.goto('http://127.0.0.1:4183/');
 const quality=await page.evaluate(async assets=>{
  const pixels=async path=>{const image=new Image();image.src=path;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return{width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data};};
  return Promise.all(assets.map(async file=>{const [a,b]=await Promise.all([pixels(`${file.replace('assets/','assets/source/')}.png`),pixels(`${file}.webp`)]);let alphaMismatch=0,rgbError=0,count=0,maxRGBError=0;for(let i=0;i<a.data.length;i+=4){if(a.data[i+3]!==b.data[i+3])alphaMismatch++;if(a.data[i+3]===255)for(let c=0;c<3;c++){const error=Math.abs(a.data[i+c]-b.data[i+c]);rgbError+=error;maxRGBError=Math.max(maxRGBError,error);count++;}}return{file,width:a.width,height:a.height,webpWidth:b.width,webpHeight:b.height,alphaMismatch,opaqueRGBMeanAbsoluteError:rgbError/count,maxRGBError};}));
 },assets);
 await context.close();
 const sizes=await Promise.all(assets.map(async file=>({file,png:(await readFile(`${file.replace('assets/','assets/source/')}.png`)).length,webp:(await readFile(`${file}.webp`)).length})));
 const summary={conversion:'cwebp -q 90 -alpha_q 100 -exact; original PNG source art retained and exact-hash checked; runtime ships WebP only',method:'Three paired cold browser contexts. Identical runtime and image URLs; baseline serves original PNG bytes at the WebP paths. Chromium phone402x874 DPR3 touch/mobile, 4Mbps down/1Mbps up,100ms latency,4x CPU slowdown,HTTP cache disabled,service workers blocked. Readiness requires complete 3D and submitted frame. No image or route fulfillment bypass of network throttle.',sizes,quality,results};
 await writeFile(join(out,'audit.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify({sizes,quality,ready:results.map(({label,readyMs})=>({label,readyMs}))},null,2));
}finally{await browser.close();await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));}
