// Run targets sequentially in one browser process to reduce background load.
// RAF timing is callback cadence, not displayed FPS.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runtimeFileset } from './stamp-build.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const targets = (process.env.MATCHED_TARGETS || 'before=http://127.0.0.1:4174/index.html,candidate=http://127.0.0.1:4173/index.html,candidate=http://127.0.0.1:4173/index.html,before=http://127.0.0.1:4174/index.html,before=http://127.0.0.1:4174/index.html,candidate=http://127.0.0.1:4173/index.html')
  .split(',').map(entry => { const [label, url] = entry.split('='); return { label, url }; });
const output = process.argv[2] || 'docs/art-overhaul/final/matched-performance.json';
const roots = JSON.parse(process.env.MATCHED_ROOTS || '{}');
const snapshotRevisions = JSON.parse(process.env.MATCHED_SNAPSHOT_REVISIONS || '{}');
const [width, height] = (process.env.MATCHED_VIEWPORT || '1440x900').split('x').map(Number);
const deviceScaleFactor = Number(process.env.MATCHED_DPR || 1);
if (![width, height, deviceScaleFactor].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid matched viewport or DPR');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const identities = {};
// Verify the actual HTTP bytes, not just the checkout named by an environment variable.
for (const target of targets) {
  if (identities[target.label]) {
    if (identities[target.label].url !== target.url) throw new Error(`Multiple URLs for ${target.label}`);
    continue;
  }
  const runtimeRoot = roots[target.label] || (target.label === 'before'
    ? (process.env.BASELINE_ROOT || '/Users/fdub/Geese/pickleboard')
    : (process.env.CANDIDATE_ROOT || process.cwd()));
  const fileset = runtimeFileset(runtimeRoot);
  const servedFiles = [];
  for (const file of fileset.files) {
    const response = await fetch(new URL(file.path, target.url));
    if (!response.ok) throw new Error(`${target.label}: HTTP ${response.status} for ${file.path}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const hash = sha256(bytes);
    if (bytes.length !== file.bytes || hash !== file.sha256) throw new Error(`${target.label}: served file differs: ${file.path}`);
    servedFiles.push({ path: file.path, bytes: bytes.length, sha256: hash });
  }
  const servedRuntimeDigest = sha256(Buffer.from(`${JSON.stringify({ algorithm: 'sha256', files: servedFiles })}\n`));
  const response = await fetch(new URL('version.json', target.url));
  if (!response.ok) throw new Error(`${target.label}: version.json unavailable`);
  const servedVersion = await response.json();
  const localVersion = JSON.parse(readFileSync(`${runtimeRoot}/version.json`, 'utf8'));
  if (JSON.stringify(servedVersion) !== JSON.stringify(localVersion)) throw new Error(`${target.label}: served version differs`);
  const snapshotRevision=snapshotRevisions[target.label];
  if(snapshotRevision){
    if(!/^[a-f0-9]{40}$/.test(snapshotRevision))throw new Error('Snapshot revision must be an exact commit');
    for(const file of fileset.files){const source=execFileSync('git',['show',`${snapshotRevision}:${file.path}`],{maxBuffer:20*1024*1024});if(sha256(source)!==file.sha256)throw new Error(`Snapshot differs from source: ${file.path}`);}
  }
  const currentHead = snapshotRevision?null:execFileSync('git', ['-C', runtimeRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  identities[target.label] = { url: target.url, runtimeRoot, currentHead, sourceRevision: snapshotRevision||currentHead, snapshotSourceVerified:Boolean(snapshotRevision),
    stampedSourceRevision: localVersion.sourceRevision, runtimeDigest: fileset.digest,
    servedRuntimeDigest, servedRuntimeFiles: servedFiles.length, servedVersion, servedBytesVerified: true };
}
await mkdir(path.dirname(output), { recursive: true });
const startedAt = new Date().toISOString();
const browser = await chromium.launch({ headless: true });
const records = [];
const save = async completed => writeFile(output, JSON.stringify({ browser: browser.version(), startedAt,
  completedAt: completed ? new Date().toISOString() : null,
  viewport: `${width}x${height} DPR${deviceScaleFactor}`,
  host: { platform: process.platform, arch: process.arch, osRelease: os.release(), cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, node: process.version },
  workload: 'third-shot-drop, overhead, playback rate 0.5, 1200ms active warm-up, pause/reset, then active play for 6 seconds',
  order: targets.map(target => target.label), repetitionsPerLabel:Object.fromEntries([...new Set(targets.map(t=>t.label))].map(label=>[label,targets.filter(t=>t.label===label).length])),
  methodology: 'Targets executed sequentially in one isolated headless Chromium process in the recorded target order, each in a fresh context with service workers blocked. Every served runtime file is byte-verified against its named root before launch. RAF interval is observer callback cadence, not display FPS; appRenderIntervalsMs is actual public renderer.render invocation cadence. CPU render timings wrap the complete public render call (including cache signature/copy/live work), not GPU completion. CPU totals per elapsed second permit comparison without assuming equal invocation counts. Start/end playback state verifies the active half-speed window. Repetition counts are recorded per label; these observations are descriptive, not a statistical certification.',
  records }, null, 2) + '\n');

try {
for (const [runIndex, target] of targets.entries()) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, serviceWorkers: 'block' });
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
  await page.evaluate(() => { const v = window.pickleboard.threeD; v.setCamera('overhead'); v.setPlaybackRate(.5); v.togglePlay(); });
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
      contextAttributes: gl.getContextAttributes(),
      samples: gl.getParameter(gl.SAMPLES),
      devicePixelRatio: window.devicePixelRatio,
      renderPixelRatio: v.renderer.getPixelRatio(),
      memory: { ...v.renderer.info.memory },
      staticWorldCache: v.staticWorldCache ? { enabled: v.staticWorldCache.enabled, ...v.staticWorldCache.stats } : null,
      drawCalls: v.renderer.info.render.calls,
      triangles: v.renderer.info.render.triangles,
      pixels: [v.renderer.domElement.width, v.renderer.domElement.height],
      navigation: (() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoaded: n.domContentLoadedEventEnd, loadEvent: n.loadEventEnd, transferBytes: n.transferSize }; })()
    };
  });
  const activity = await page.evaluate(async () => {
    const v = window.pickleboard.threeD, intervals = [], applyWork = [], renderWork = [], renderIntervals = [];
    const originalApply = v.applyAtTime, originalRender = v.renderer.render;
    const frameStart = v.renderer.info.render.frame;
    let previousRender = null;
    v.applyAtTime = function (...args) { const t = performance.now(); try { return originalApply.apply(this, args); } finally { applyWork.push(performance.now() - t); } };
    v.renderer.render = function (...args) { const t = performance.now(); if(previousRender !== null)renderIntervals.push(t-previousRender);previousRender=t;try { return originalRender.apply(this, args); } finally { renderWork.push(performance.now() - t); } };
    v.togglePlay();
    const startState = v.getState(), started = performance.now();
    if (!startState.playing || startState.playbackRate !== .5) throw new Error('Workload did not start active at half speed');
    await new Promise(resolve => {
      let first = null, prior = null;
      function tick(t) { first ??= t; if (prior !== null) intervals.push(t - prior); prior = t; if (t - first < 6000) requestAnimationFrame(tick); else resolve(); }
      requestAnimationFrame(tick);
    });
    const elapsedMs = performance.now() - started, endState = v.getState();
    v.applyAtTime = originalApply; v.renderer.render = originalRender;v.togglePlay();
    if (!endState.playing || endState.holding || endState.iteration !== startState.iteration || !(endState.elapsed > startState.elapsed)) throw new Error('Workload ended idle, holding, or crossed a loop transition');
    const stats = values => { const s = [...values].sort((a,b) => a-b); const pick = q => s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; const totalMs=s.reduce((a,b)=>a+b,0);return { count: s.length, medianMs: pick(.5), p95Ms: pick(.95), maxMs: s.at(-1) ?? null, totalMs, meanMs:s.length?totalMs/s.length:null }; };
    return { elapsedMs, startState, endState, activeWindowVerified:true,
      rafIntervalsMs: stats(intervals), appRenderIntervalsMs:stats(renderIntervals),
      applyAtTimeCPUms: stats(applyWork), renderCPUms: stats(renderWork),
      applyCPUmsPerSecond:applyWork.reduce((a,b)=>a+b,0)*1000/elapsedMs,
      renderCPUmsPerSecond:renderWork.reduce((a,b)=>a+b,0)*1000/elapsedMs,
      renderFrames: v.renderer.info.render.frame, renderFrameDelta:v.renderer.info.render.frame-frameStart,
      staticWorldCache: v.staticWorldCache ? { enabled: v.staticWorldCache.enabled, ...v.staticWorldCache.stats } : null, state: v.getState() };
  });
  const identity = identities[target.label];
  if (runtimeFileset(identity.runtimeRoot).digest !== identity.runtimeDigest) throw new Error(`${target.label}: runtime changed during benchmark`);
  records.push({ label: target.label, runIndex, ...identity, moduleReadyMs, sceneReadyMs, initial, activity, errors });
  await context.close();
  await save(false);
  console.log(JSON.stringify({runIndex,label:target.label,raf:activity.rafIntervalsMs,appRender:activity.appRenderIntervalsMs,errors}));
}
await save(true);
} finally { await browser.close(); }
console.log(JSON.stringify({ output, records: records.length }));
