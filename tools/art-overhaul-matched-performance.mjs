// Run targets sequentially in one browser process to reduce background load.
// RAF timing is callback cadence, not displayed FPS.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runtimeFileset } from './stamp-build.mjs';
import { writeFile } from 'node:fs/promises';

const targets = (process.env.MATCHED_TARGETS || 'before=http://127.0.0.1:4174/index.html,candidate=http://127.0.0.1:4173/index.html,candidate=http://127.0.0.1:4173/index.html,before=http://127.0.0.1:4174/index.html,before=http://127.0.0.1:4174/index.html,candidate=http://127.0.0.1:4173/index.html')
  .split(',').map(entry => { const [label, url] = entry.split('='); return { label, url }; });
const output = process.argv[2] || 'docs/art-overhaul/final/matched-performance.json';
const browser = await chromium.launch({ headless: true });
const records = [];

for (const target of targets) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const navStart = performance.now();
  await page.goto(`${target.url}?workspace=planner&three-d-visual=1`);
  await page.waitForFunction(() => Boolean(window.pickleboard?.threeD));
  const moduleReadyMs = performance.now() - navStart;
  await page.evaluate(() => window.pickleboard.plays.load('third-shot-drop'));
  const sceneStart = performance.now();
  await page.locator('#play3dView').click();
  await page.waitForSelector('#threeDCanvas canvas');
  await page.waitForFunction(() => window.pickleboard.threeD?.active && window.pickleboard.threeD.renderer?.info.render.frame > 0);
  const sceneReadyMs = performance.now() - sceneStart;
  await page.evaluate(() => { const v = window.pickleboard.threeD; v.setCamera('overhead'); v.togglePlay(); });
  await page.waitForTimeout(1200); // warm shaders and the active animation path
  await page.evaluate(() => { const v = window.pickleboard.threeD; v.togglePlay(); v.restart(); });
  const initial = await page.evaluate(() => {
    const v = window.pickleboard.threeD;
    const gl = v.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      playId: v.getState().playId,
      duration: v.timeline.duration,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      memory: { ...v.renderer.info.memory },
      drawCalls: v.renderer.info.render.calls,
      triangles: v.renderer.info.render.triangles,
      pixels: [v.renderer.domElement.width, v.renderer.domElement.height],
      navigation: (() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoaded: n.domContentLoadedEventEnd, loadEvent: n.loadEventEnd, transferBytes: n.transferSize }; })()
    };
  });
  const activity = await page.evaluate(async () => {
    const v = window.pickleboard.threeD, intervals = [], applyWork = [], renderWork = [];
    const originalApply = v.applyAtTime, originalRender = v.renderer.render;
    v.applyAtTime = function (...args) { const t = performance.now(); try { return originalApply.apply(this, args); } finally { applyWork.push(performance.now() - t); } };
    v.renderer.render = function (...args) { const t = performance.now(); try { return originalRender.apply(this, args); } finally { renderWork.push(performance.now() - t); } };
    v.togglePlay();
    await new Promise(resolve => {
      let first = null, prior = null;
      function tick(t) { first ??= t; if (prior !== null) intervals.push(t - prior); prior = t; if (t - first < 6000) requestAnimationFrame(tick); else resolve(); }
      requestAnimationFrame(tick);
    });
    v.togglePlay(); v.applyAtTime = originalApply; v.renderer.render = originalRender;
    const stats = values => { const s = [...values].sort((a,b) => a-b); const pick = q => s[Math.min(s.length - 1, Math.floor(s.length * q))]; return { count: s.length, medianMs: pick(.5), p95Ms: pick(.95), maxMs: s.at(-1) }; };
    return { rafIntervalsMs: stats(intervals), applyAtTimeCPUms: stats(applyWork), renderCPUms: stats(renderWork), renderFrames: v.renderer.info.render.frame, state: v.getState() };
  });
  const runtimeRoot = target.label === 'before'
    ? (process.env.BASELINE_ROOT || '/Users/fdub/Geese/pickleboard')
    : (process.env.CANDIDATE_ROOT || process.cwd());
  const sourceRevision = execFileSync('git', ['-C', runtimeRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const runtimeDigest = runtimeFileset(runtimeRoot).digest;
  const stampedSourceRevision = JSON.parse(readFileSync(`${runtimeRoot}/version.json`, 'utf8')).sourceRevision;
  records.push({ label: target.label, url: target.url, currentHead: sourceRevision, sourceRevision, stampedSourceRevision, runtimeDigest, moduleReadyMs, sceneReadyMs, initial, activity, errors });
  await context.close();
}
await browser.close();
await writeFile(output, JSON.stringify({ browser: browser.version(), viewport: '1440x900 DPR1', workload: 'third-shot-drop, overhead, 1200ms active warm-up, reset, then active play for 6 seconds', order: targets.map(target => target.label), methodology: 'Targets executed sequentially in one headless Chromium process in counterbalanced before/candidate/candidate/before/before/candidate order. RAF interval is callback cadence, not display FPS; render/apply values are CPU time, not GPU completion.', records }, null, 2) + '\n');
console.log(JSON.stringify({ output, records: records.map(({ label, moduleReadyMs, sceneReadyMs, initial, activity, errors }) => ({ label, moduleReadyMs, sceneReadyMs, initial, activity, errors })) }, null, 2));
