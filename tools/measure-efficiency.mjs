// Matched local measurements; renderer timing is CPU submission, not displayed FPS.
import { chromium, webkit } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';

const url = process.env.QA_EFFICIENCY_URL || 'http://127.0.0.1:43871/';
const output = process.env.QA_EFFICIENCY_OUTPUT || 'release-results/efficiency/startup.json';
const runs = Number(process.env.QA_EFFICIENCY_RUNS || 3);
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw Error('Use 1–10 matched runs.');
const records = [];
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))], max: sorted.at(-1) };
};
for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await browserType.launch();
  try {
    for (let run = 1; run <= runs; run++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__startup = { visible2DFrames: 0, firstReadyMs: null, longTasks: [] };
        try { new PerformanceObserver(list => __startup.longTasks.push(...list.getEntries().map(({startTime, duration}) => ({startTime,duration})))).observe({type:'longtask', buffered:true}); } catch {}
        const visible = element => {
          if (!element || !element.getBoundingClientRect().width) return false;
          for (let node = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          }
          return true;
        };
        const sample = () => {
          const viewer = window.pickleboard?.threeD;
          if (visible(document.querySelector('.court-container-fullscreen'))) __startup.visible2DFrames++;
          if (viewer?.active && viewer.worldAssetsReady && viewer.renderer?.info.render.calls > 0 && !document.documentElement.hasAttribute('data-court-loading')) {
            __startup.firstReadyMs = performance.now();
          } else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      for (const navigation of ['cold', 'reload']) {
        const errors = [];
        const onError = error => errors.push(error.message);
        page.on('pageerror', onError);
        await (navigation === 'cold' ? page.goto(url) : page.reload());
        await page.waitForFunction(() => window.__startup?.firstReadyMs, null, { timeout: 30000 });
        const initial = await page.evaluate(() => {
          const viewer = pickleboard.threeD;
          const resources = performance.getEntriesByType('resource').map(({name, encodedBodySize, decodedBodySize, transferSize}) => ({path:new URL(name).pathname, encodedBodySize, decodedBodySize, transferSize}));
          return { ...__startup, resources, rendererMemory: {...viewer.renderer.info.memory}, drawCalls: viewer.renderer.info.render.calls, triangles: viewer.renderer.info.render.triangles };
        });
        const client = engine === 'chromium' ? await context.newCDPSession(page) : null;
        if (client) await client.send('Performance.enable');
        const before = client ? (await client.send('Performance.getMetrics')).metrics : [];
        const idle = await page.evaluate(async () => {
          const renderer = pickleboard.pixelRenderer, original = renderer.render;
          let calls = 0; renderer.render = function(...args) { calls++; return original.apply(this, args); };
          let frames = 0; const start = performance.now();
          await new Promise(resolve => { const next = () => ++frames < 90 ? requestAnimationFrame(next) : resolve(); requestAnimationFrame(next); });
          renderer.render = original;
          return {frames, elapsedMs: performance.now()-start, hidden2DCalls: calls, pending2DFrame: renderer.frame, pending3DFrame: pickleboard.threeD.renderLoopId};
        });
        const after = client ? (await client.send('Performance.getMetrics')).metrics : [];
        const metrics = Object.fromEntries(after.map(({name,value}) => [name, value]));
        const cpu = Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].map(name => [name, (metrics[name] || 0) - (before.find(entry => entry.name === name)?.value || 0)]));
        const resources = initial.resources;
        const legacy = resources.filter(resource => resource.path.includes('/assets/replay/'));
        records.push({ engine, version: browser.version(), run, navigation, ...initial, idle, cpu, heapBytes: metrics.JSHeapUsedSize ?? null, domNodes: metrics.Nodes ?? null, resourceCount: resources.length, decodedBytes: resources.reduce((sum,r)=>sum+r.decodedBodySize,0), legacyRequests: legacy.length, legacyDecodedBytes: legacy.reduce((sum,r)=>sum+r.decodedBodySize,0), errors });
        console.log(JSON.stringify({engine,run,navigation,firstReadyMs:initial.firstReadyMs,visible2DFrames:initial.visible2DFrames,hidden2DCalls:idle.hidden2DCalls,legacyRequests:legacy.length}));
        if (run === 1 && navigation === 'cold') await page.screenshot({ path: output.replace(/\.json$/, `-${engine}.png`) });
        if(client) await client.detach();
        page.removeListener('pageerror',onError);
      }
      await context.close();
    }
  } finally { await browser.close(); }
}
mkdirSync(new URL('../release-results/efficiency/',import.meta.url),{recursive:true});
writeFileSync(output, JSON.stringify({ measuredAt:new Date().toISOString(), url, host:{platform:os.platform(),cpu:os.cpus()[0]?.model}, conditions:'1440x900 DPR1, local HTTP, service workers blocked, cold isolated context then reload per run. First ready is the first rAF observing an active rendered scene with world textures ready; this is a paint opportunity, not GPU completion. Browser resource timings are decoded response bytes, not GPU memory. Chromium CDP CPU/heap; WebKit does not expose those metrics.', summary:Object.fromEntries(['chromium','webkit'].map(engine=>[engine,stats(records.filter(r=>r.engine===engine&&r.navigation==='cold').map(r=>r.firstReadyMs))])), records },null,2)+'\n');
