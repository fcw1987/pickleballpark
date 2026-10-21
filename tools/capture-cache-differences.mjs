import { chromium } from '@playwright/test';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out='docs/town-art/performance-cache-validation/differences';await mkdir(out,{recursive:true});
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();
await page.goto('http://127.0.0.1:4176/?workspace=planner');await page.waitForFunction(()=>window.pickleboard?.plays);
await page.evaluate(()=>pickleboard.plays.load('third-shot-drop'));await page.locator('#play3dView').click();await page.waitForFunction(()=>pickleboard.threeD?.active);
const records=[];
for(const camera of ['overhead','sideline','behind-green','behind-orange']){
 await page.evaluate(camera=>{const v=pickleboard.threeD;v.cancelRenderWork();v.setCamera(camera);v.cancelRenderWork();v.session.seek(3.34);v.applyAtTime(3.34);v.staticWorldCache.enabled=false;v.renderer.render(v.scene,v.camera);},camera);
 await page.locator('#threeDCanvas canvas').screenshot({path:`${out}/${camera}-direct.png`});
 const result=await page.evaluate(()=>{
  const v=pickleboard.threeD,gl=v.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,raw=new Uint8Array(w*h*4),cached=new Uint8Array(raw.length);
  v.staticWorldCache.enabled=false;v.renderer.render(v.scene,v.camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,raw);v.staticWorldCache.enabled=true;v.renderer.render(v.scene,v.camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,cached);
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),image=ctx.createImageData(w,h),severe=[];let sum=0,changed=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,j=((h-1-y)*w+x)*4;let d=0;for(let c=0;c<3;c++){const a=Math.abs(raw[i+c]-cached[i+c]);sum+=a;d=Math.max(d,a);}if(d>2)changed++;if(d>24)severe.push({x,y:h-1-y,d});image.data[j]=d>24?255:d*5;image.data[j+1]=d>24?30:d*5;image.data[j+2]=d>24?30:d*5;image.data[j+3]=255;}
  ctx.putImageData(image,0,0);return{width:w,height:h,seconds:3.34,mean:sum/(w*h*3),changedFraction:changed/(w*h),severeFraction:severe.length/(w*h),severePixels:severe,locator:canvas.toDataURL('image/png')};
 });
 await page.locator('#threeDCanvas canvas').screenshot({path:`${out}/${camera}-cached.png`});
 await writeFile(`${out}/${camera}-differences.png`,Buffer.from(result.locator.split(',')[1],'base64'));delete result.locator;records.push({camera,...result});
}
await browser.close();
const sourceHashes=Object.fromEntries(await Promise.all(['three-d-world.js','three-d-playback.js','three-d-athletes.js'].map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
await writeFile(`${out}/comparison.json`,JSON.stringify({sourceHashes,note:'Difference locators amplify RGB difference 5x; red marks pixels whose maximum channel difference exceeds24. Coordinates are viewport CSS pixels atDPR1. Direct/cached preserve the same actor pose and camera.',records},null,2));
console.log(JSON.stringify(records.map(({severePixels,...r})=>({...r,severePixels:severePixels.length})),null,2));
