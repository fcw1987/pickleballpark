// Matched local CPU/action measurements. These are not displayed-frame-rate data.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';

const output = process.argv[2];
if (!output) throw Error('Provide an output JSON path.');
const targets = (process.env.QA_PERF_TARGETS || 'before=http://127.0.0.1:4173/,candidate=http://127.0.0.1:4198/')
  .split(',').map(entry => { const [label, url] = entry.split('='); return { label, url }; });
const runCount = Number(process.env.QA_PERF_RUNS || 3);
const viewport = (process.env.QA_PERF_VIEWPORT || '1440x900').split('x').map(Number);
const deviceScaleFactor = Number(process.env.QA_PERF_DPR || 1);
if (viewport.length !== 2 || viewport.some(value => !Number.isInteger(value) || value < 100 || value > 4000) ||
    !Number.isFinite(deviceScaleFactor) || deviceScaleFactor < 1 || deviceScaleFactor > 4 ||
    !Number.isInteger(runCount) || runCount < 1 || runCount > 10) throw Error('Invalid bounded performance conditions.');
const browser = await chromium.launch();
const records = [];

for (const target of targets) {
  for (let run = 1; run <= runCount; run++) {
    const context = await browser.newContext({
      viewport: { width: viewport[0], height: viewport[1] },
      deviceScaleFactor,
      serviceWorkers: 'block'
    });
    const page = await context.newPage();
    const navigationStarted = performance.now();
    await page.goto(target.url);
    await page.waitForFunction(() => window.playBuilder?.document && playBuilder.ui?.element);
    const builderReadyMs = performance.now() - navigationStarted;
    await page.waitForFunction(() => window.playBuilder && !playBuilder.busy && playBuilder.board.threeD?.renderer);
    const first3DReadyMs = performance.now() - navigationStarted;
    const initial = await page.evaluate(() => {
      const renderer = playBuilder.board.threeD.renderer;
      const gl = renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const resources = performance.getEntriesByType('resource');
      return {
        appReadyAtMs: performance.now(),
        navigation: performance.getEntriesByType('navigation')[0]?.duration,
        resourceCount: resources.length,
        encodedBytes: resources.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        decodedBytes: resources.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        rendererMemory: { ...renderer.info.memory },
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        drawingBuffer: [renderer.domElement.width, renderer.domElement.height],
        pixelRatio: renderer.getPixelRatio()
      };
    });

    const tasks = await page.evaluate(async () => {
      const builder = playBuilder;
      const renderer = builder.board.threeD.renderer;
      const { compileDocument } = await import('./play-compiler.js');
      const stats = values => {
        const sorted = [...values].sort((a, b) => a - b);
        const pick = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
        return { count: sorted.length, median: pick(.5), p95: pick(.95), max: sorted.at(-1) };
      };
      const makeDocument = shots => {
        const source = structuredClone(builder.document);
        source.id = `qa-performance-${shots}`;
        if (shots === 3) return source;
        source.title = `QA ${shots}-shot rally`;
        source.opening = 'midrally';
        source.ending = 'stop';
        source.initialLayout.ball = { x: 7, y: 14 };
        source.initialLayout.player1 = { x: 7, y: 14 };
        source.initialLayout.player3 = { x: 7, y: 30 };
        source.shots = Array.from({ length: shots }, (_, index) => ({
          id: `dink-${index + 1}`,
          family: 'dink',
          hitter: index % 2 ? 'player3' : 'player1',
          receiver: index === shots - 1 ? 'auto' : index % 2 ? 'player1' : 'player3',
          contactStyle: 'forehand',
          target: index % 2 ? { x: 7, y: 14 } : { x: 7, y: 30 },
          arc: 'medium',
          pace: 'soft',
          movement: { intent: 'hold', pinned: false }
        }));
        return source;
      };

      const byShots = [];
      for (const shotCount of [3, 8, 64]) {
        const source = makeDocument(shotCount);
        const compileSamples = [];
        const compileIterations = shotCount === 64 ? 80 : 160;
        for (let index = 0; index < compileIterations; index++) {
          const started = performance.now();
          const compiled = compileDocument(source);
          compileSamples.push(performance.now() - started);
          if (compiled.validShotCount !== shotCount) throw Error(`${shotCount}-shot compile stopped at ${compiled.validShotCount}`);
        }
        const installStarted = performance.now();
        builder.loadDocument(source);
        const compileInstallSaveMs = performance.now() - installStarted;

        const targetEdits = [];
        for (let index = 0; index < 20; index++) {
          const started = performance.now();
          await builder.action('editShot', { field: 'target.x', value: index % 2 ? 7 : 7.25 });
          targetEdits.push(performance.now() - started);
        }
        const seeks = [];
        for (let index = 0; index < 100; index++) {
          const started = performance.now();
          builder.seek(builder.session.duration * index / 99);
          seeks.push(performance.now() - started);
        }
        const menu = builder.ui.element.querySelector('.builder-main-menu > summary');
        const menuLoops = [];
        for (let index = 0; index < 100; index++) {
          const started = performance.now();
          menu.click();
          menu.click();
          menuLoops.push(performance.now() - started);
        }
        const saves = [];
        for (let index = 0; index < 50; index++) {
          const started = performance.now();
          if (!builder.save()) throw Error('Performance save failed.');
          saves.push(performance.now() - started);
        }
        // Include completed browser layout in the editor measurement. This is
        // still CPU work, not paint/GPU completion or a visible frame rate.
        const detailLoops = [];
        for (let index = 0; index < 30; index++) {
          const started = performance.now();
          builder.ui.element.querySelector('.builder-context-actions [data-action="collapse-inspector"]').click();
          builder.ui.element.querySelector('.builder-inspector')?.getBoundingClientRect();
          builder.ui.element.querySelector('.builder-context-actions [data-action="collapse-inspector"]').click();
          builder.ui.element.querySelector('.builder-court-region').getBoundingClientRect();
          detailLoops.push(performance.now() - started);
        }
        const submission = [];
        const nativeRender = renderer.render;
        renderer.render = function(...args) {
          const started = performance.now();
          try { return nativeRender.apply(this, args); }
          finally { submission.push(performance.now() - started); }
        };
        try {
          // Sample a complete authored rally with settled real renderer work.
          // Seeking makes times reproducible without changing the shared clock.
          for (let index = 0; index < 120; index++) {
            builder.seek(builder.session.duration * index / 119);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }
        } finally { renderer.render = nativeRender; }
        if (submission.length < 120) throw Error(`Only ${submission.length} of 120 settled renderer samples submitted.`);
        byShots.push({
          shots: shotCount,
          duration: builder.session.duration,
          compileMs: stats(compileSamples),
          compileInstallSaveMs,
          targetEditMs: stats(targetEdits),
          seekMs: stats(seeks),
          menuOpenCloseMs: stats(menuLoops),
          saveMs: stats(saves),
          detailsOpenCloseLayoutMs: stats(detailLoops),
          rendererCpuSubmissionMs: stats(submission),
          renderedSamples: submission.length,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles
        });
      }

      builder.pause();
      await builder.switchView('2d');
      const enter2D = [], enterWarm3D = [];
      for (let index = 0; index < 10; index++) {
        let started = performance.now();
        await builder.switchView('3d');
        enterWarm3D.push(performance.now() - started);
        started = performance.now();
        await builder.switchView('2d');
        enter2D.push(performance.now() - started);
      }
      await builder.switchView('3d');
      builder.pause();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      let renderCalls = 0;
      const originalRender = renderer.render;
      renderer.render = function(...args) {
        renderCalls += 1;
        return originalRender.apply(this, args);
      };
      const idleStarted = performance.now();
      let callbacks = 0;
      await new Promise(resolve => {
        const frame = () => { callbacks += 1; if (callbacks === 60) resolve(); else requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
      });
      const sixtyPausedRAFCallbacksMs = performance.now() - idleStarted;
      renderer.render = originalRender;
      return {
        byShots,
        viewLoops: { enter2DMs: stats(enter2D), enterWarm3DMs: stats(enterWarm3D) },
        pausedRAF: { callbacks, elapsedMs: sixtyPausedRAFCallbacksMs, applicationRenderCalls: renderCalls },
        finalResources: {
          memory: { ...renderer.info.memory }, drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          canvases: document.querySelectorAll('#threeDCanvas canvas').length,
          pendingRender: builder.board.threeD.renderLoopId !== null
        }
      };
    });

    const reloadMs = [];
    for (let index = 0; index < 3; index++) {
      const started = performance.now();
      await page.reload();
      await page.waitForFunction(() => window.playBuilder && !playBuilder.busy && playBuilder.document.shots.length === 64);
      reloadMs.push(performance.now() - started);
    }
    records.push({ target: target.label, url: target.url, run, builderReadyMs, first3DReadyMs, initial, tasks, reloadMs });
    console.log(JSON.stringify({ target: target.label, run, first3DReadyMs, reloadMs }));
    await context.close();
  }
}

const evidence = {
  measuredAt: new Date().toISOString(),
  browser: `Playwright Chromium ${browser.version()}`,
  host: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model },
  conditions: {
    context: 'fresh isolated context per run; service workers blocked; local static servers',
    viewport,
    deviceScaleFactor,
    runs: runCount,
    workload: '3, 8 and 64 shot source; 160/160/80 pure compiles; 20 target edits, 100 seeks, 100 menu open-close pairs, 30 details open-close/layout pairs and 50 saves per size; 120 settled renderer samples per rally; ten 2D/3D loops; sixty paused rAF callbacks; three completed reloads retaining 64 shots',
    limitations: 'CPU-side performance.now/action timing and automation callback cadence. Renderer calls measure CPU command submission, not GPU completion. Results do not measure displayed FPS or physical-device performance.'
  },
  records
};
await browser.close();
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
