// Matched local browser measurements. Callback cadence is not displayed FPS.
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const url=process.env.PREVIEW_URL || 'http://127.0.0.1:4173/';
const browser=await chromium.launch();const runs=[];
for(let run=0;run<2;run++){
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});const page=await context.newPage();
 await page.goto(url);await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&playBuilder.board.threeD.renderer);
 const startup=await page.evaluate(()=>{const gl=playBuilder.board.threeD.renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),readyMs:performance.now(),bytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.encodedBodySize,0),buffer:[playBuilder.board.threeD.renderer.domElement.width,playBuilder.board.threeD.renderer.domElement.height]};});
 await page.evaluate(()=>{playBuilder.action('loop',true);playBuilder.play();});
 await page.waitForFunction(()=>playBuilder.session.clock.elapsed>2);
 const timings=await page.evaluate(()=>new Promise(resolve=>{
  const intervals=[],work=[];const renderer=playBuilder.board.threeD.renderer,original=renderer.render;renderer.render=function(...args){const start=performance.now();const out=original.apply(this,args);work.push(performance.now()-start);return out;};
  let prior=null,start=null;function frame(t){start??=t;if(prior!==null)intervals.push(t-prior);prior=t;if(t-start<30000)return requestAnimationFrame(frame);renderer.render=original;const stats=a=>{const s=[...a].sort((a,b)=>a-b);return{count:s.length,median:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],p99:s[Math.floor(s.length*.99)]};};const cadence=stats(intervals);resolve({cadence,missFraction:intervals.filter(v=>v>cadence.median*1.5).length/intervals.length,renderWorkMs:stats(work),memory:renderer.info.memory,drawCalls:renderer.info.render.calls});}requestAnimationFrame(frame);
 }));
 await page.evaluate(()=>playBuilder.pause());
 const idle=await page.evaluate(()=>new Promise(resolve=>{const r=playBuilder.board.threeD.renderer;requestAnimationFrame(()=>requestAnimationFrame(()=>{const before=r.info.render.frame;setTimeout(()=>resolve(r.info.render.frame-before),1000);}));}));
 runs.push({startup,...timings,pausedFramesOverOneSecond:idle});await context.close();
}
await browser.close();await writeFile(process.argv[2] || 'release-results/usability-performance.json',JSON.stringify({browser:browser.version(),environment:'headless Chromium on macOS, desktop emulation, DPR1, 1440x900',workload:'starter three-shot draft, overhead, Loop, 1x',warmup:'logical time >2 seconds',sampleSeconds:30,runs,limitations:'RAF intervals do not prove presentation; render work includes CPU command submission, not GPU completion. No physical phone or Safari claim.'},null,2)+'\n');
