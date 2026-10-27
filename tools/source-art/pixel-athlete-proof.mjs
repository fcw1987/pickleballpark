// Editable original source-art generator; no downloaded art, filters, or 3D.
// Run from repository root: node tools/source-art/pixel-athlete-proof.mjs
import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out='release-results/pixel-athletes';await mkdir(out,{recursive:true});
const html=`<!doctype html><html><body style="margin:0;background:#d8e7bf"><canvas id="c" width="768" height="680"></canvas><script type="module">
import {drawPixelAthlete} from '/pixel-athletes.js';import {PIXEL_STROKE_FAMILIES} from '/pixel-strokes.js';
const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
ctx.font='12px monospace';
for(let row=0;row<PIXEL_STROKE_FAMILIES.length;row++){let type=PIXEL_STROKE_FAMILIES[row];ctx.fillStyle='#20364a';ctx.fillText(type,5,row*48+28);
for(let col=0;col<8;col++){let phase=col%4,style=col<4?'forehand':'backhand';drawPixelAthlete(ctx,{x:144+col*80,y:row*48+42,scale:1,playerId:'player'+(row%4+1),kit:row%2?'orange':'green',shot:{type,contact:{strokeSide:style}},phase});}}
ctx.fillStyle='#20364a';ctx.fillText('FOREHAND: PREP / CONTACT / FOLLOW / RECOVER       BACKHAND: PREP / CONTACT / FOLLOW / RECOVER',80,660);window.done=true;
</script></body></html>`;
const strokes=(await readFile('pixel-strokes.js','utf8')).replaceAll('export ','');
const actors=(await readFile('pixel-athletes.js','utf8')).replace(/^import .*;$/m,'').replace(/^export \{.*;$/m,'').replaceAll('export ','');
const bundled=html.replace(/import .*?;import .*?;/,strokes+'\n'+actors);
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:768,height:680},deviceScaleFactor:1});await page.setContent(bundled);await page.waitForFunction(()=>window.done);await page.screenshot({path:out+'/stroke-sheet.png'});
// 4x nearest-neighbor visual proof and a deterministic animated reel.
await page.evaluate(()=>{const c=document.querySelector('canvas');c.style.width='1536px';c.style.height='1360px';c.style.imageRendering='pixelated';});await page.setViewportSize({width:1536,height:1360});await page.screenshot({path:out+'/stroke-proof-2x.png'});
await page.evaluate(()=>{const c=document.querySelector('canvas');c.width=512;c.height=416;c.style.width='1024px';c.style.height='832px';});
await page.evaluate(`(async()=>{${strokes}\n${actors}\nconst ctx=document.querySelector('canvas').getContext('2d');for(let r=0;r<13;r++)for(let col=0;col<16;col++){drawPixelAthlete(ctx,{x:col*32+16,y:r*32+28,playerId:'player'+(r%4+1),kit:r%2?'orange':'green',shot:{type:PIXEL_STROKE_FAMILIES[r],contact:{strokeSide:col%8<4?'forehand':'backhand'}},handedness:col<8?'right':'left',phase:col%4});}})()`);
const atlas=await page.locator('canvas').evaluate(c=>c.toDataURL('image/png').split(',')[1]);await writeFile(out+'/athlete-native-atlas.png',Buffer.from(atlas,'base64'));await mkdir('source-art/pixel-athletes',{recursive:true});await writeFile('source-art/pixel-athletes/athlete-native-atlas.png',Buffer.from(atlas,'base64'));await writeFile('source-art/pixel-athletes/provenance.json',JSON.stringify({title:'Pickleball Park original trainer athletes',source:['pixel-athletes.js','pixel-strokes.js','tools/source-art/pixel-athlete-proof.mjs'],externalAssets:[],nativeCell:{width:32,height:32},rows:['serve','return','forehand','backhand','drive','drop','dink','volley','block','reset','short-hop','lob','overhead'],columns:'RH-FH4,RH-BH4,LH-FH4,LH-BH4',states:['prepare','contact','follow','recover'],license:'Project-owned original pixel art'},null,2));
const reel=await page.evaluate(`(async()=>{${strokes}\n${actors}\nconst c=document.querySelector('canvas'),ctx=c.getContext('2d');c.width=384;c.height=416;const stream=c.captureStream(24),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'}),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);const done=new Promise(r=>rec.onstop=r);rec.start();for(let frame=0;frame<96;frame++){ctx.fillStyle='#d8e7bf';ctx.fillRect(0,0,c.width,c.height);for(let row=0;row<13;row++)for(let col=0;col<4;col++){drawPixelAthlete(ctx,{x:48+col*96,y:row*32+28,playerId:'player'+(col+1),kit:col%2?'orange':'green',shot:{type:PIXEL_STROKE_FAMILIES[row],contact:{strokeSide:col%2?'backhand':'forehand'}},handedness:col<2?'right':'left',phase:frame/95*3,time:frame/24});}await new Promise(r=>setTimeout(r,1000/24));}rec.stop();await done;const b=new Blob(chunks,{type:rec.mimeType});return await new Promise(r=>{let f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b);});})()`);await writeFile(out+'/stroke-reel.webm',Buffer.from(reel,'base64'));
await writeFile(out+'/provenance.json',JSON.stringify({source:['pixel-athletes.js','pixel-strokes.js','tools/source-art/pixel-athlete-proof.mjs'],original:true,externalAssets:[],frames:'13 families × 2 sides × preparation/contact/follow/recovery',reelMethod:'Sample phase0..3 at24fps for both physical hands, each family and side; render on native logical grid with nearest-neighbor integer upscale. Runtime ball contact compares returned contact coordinates to projected ball.'},null,2));await browser.close();
