import { chromium, webkit } from '@playwright/test';

const previewURL = process.env.PREVIEW_URL || 'http://127.0.0.1:4193/index.html';
const iterations = Number(process.env.QA_LIFECYCLE_ITERATIONS || 200);
const requested = (process.env.QA_BROWSER || 'chromium,webkit').split(',').map(value => value.trim()).filter(Boolean);
const engines = { chromium, webkit };
if (!Number.isInteger(iterations) || iterations < 1) throw new RangeError('QA_LIFECYCLE_ITERATIONS must be a positive integer.');
for (const name of requested) if (!engines[name]) throw new RangeError(`Unsupported QA_BROWSER value: ${name}`);

const settle = page => page.evaluate(() => new Promise(resolve => {
  let frames = 4;
  const frame = () => --frames ? requestAnimationFrame(frame) : resolve();
  requestAnimationFrame(frame);
}));

async function run(name) {
  const browser = await engines[name].launch();
  const context = await browser.newContext({ viewport: { width: 844, height: 600 }, reducedMotion: 'reduce', serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    window.requestAnimationFrame = callback => {
      let id;
      id = request(timestamp => { pending.delete(id); callback(timestamp); });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
    window.__qaPendingAnimationFrames = pending;
  });
  await page.goto(previewURL);
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy && playBuilder.view === '3d' && window.pickleboard?.threeD?.renderer);
  await settle(page);
  const baseline = await page.evaluate(() => ({
    memory: { ...pickleboard.threeD.renderer.info.memory },
    loopStarts: pickleboard.threeD.renderLoopCount
  }));
  const viewports = [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1024, height: 768 },
    { width: 430, height: 932 },
    { width: 1440, height: 900 }
  ];
  let completed = 0;
  let forcedContextLosses = 0;
  for (let batch = 0; batch < viewports.length && completed < iterations; batch += 1) {
    await page.setViewportSize(viewports[batch]);
    const count = Math.min(Math.ceil(iterations / viewports.length), iterations - completed);
    const result = await page.evaluate(async ({ start, count }) => {
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      let contextLosses = 0;
      for (let offset = 0; offset < count; offset += 1) {
        const index = start + offset;
        if (index % 4 === 0) { playBuilder.play(); await frame(); }
        await playBuilder.action('help');
        if (!pickleboard.infoModal.classList.contains('active')) throw new Error(`Help did not open at iteration ${index}`);
        pickleboard.closeInfoModal();
        const menu = playBuilder.ui.element.querySelector('.builder-main-menu');
        menu.open = true;
        menu.open = false;
        playBuilder.pause();
        playBuilder.seek((index % 10) / 10);
        await playBuilder.switchView('2d');
        if (index % 25 === 24) {
          const renderer = pickleboard.threeD.renderer;
          const extension = renderer.getContext().getExtension('WEBGL_lose_context');
          if (!extension) throw new Error('WEBGL_lose_context is unavailable');
          await new Promise(resolve => {
            renderer.domElement.addEventListener('webglcontextlost', resolve, { once: true });
            extension.loseContext();
          });
          contextLosses += 1;
        }
        if (index % 20 === 10) {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
          Object.defineProperty(document, 'hidden', { configurable: true, value: false });
          document.dispatchEvent(new Event('visibilitychange'));
        }
        await playBuilder.switchView('3d');
        pickleboard.threeD.setCamera(index % 2 ? 'sideline' : 'overhead');
        if (!pickleboard.threeD.active || pickleboard.threeD.renderer.getContext().isContextLost()) {
          throw new Error(`3D renderer was not live at iteration ${index}`);
        }
      }
      return { contextLosses };
    }, { start: completed, count });
    completed += count;
    forcedContextLosses += result.contextLosses;
  }
  await page.evaluate(() => playBuilder.pause());
  await settle(page);
  const final = await page.evaluate(() => ({
    active: pickleboard.threeD.active,
    canvasCount: document.querySelectorAll('#threeDCanvas canvas').length,
    contextLost: pickleboard.threeD.renderer.getContext().isContextLost(),
    drawingBuffer: [pickleboard.threeD.renderer.domElement.width, pickleboard.threeD.renderer.domElement.height],
    memory: { ...pickleboard.threeD.renderer.info.memory },
    programs: pickleboard.threeD.renderer.info.programs?.length ?? null,
    renderFrames: pickleboard.threeD.renderer.info.render.frame,
    renderLoopStarts: pickleboard.threeD.renderLoopCount,
    rendererScheduler: pickleboard.threeD.renderLoopId,
    guidedScheduler: pickleboard.plays.animationFrame,
    holdTimer: pickleboard.plays.advanceTimer,
    pendingAnimationFrames: window.__qaPendingAnimationFrames.size,
    playing: pickleboard.threeD.clock.playing
  }));
  await context.close();
  await browser.close();
  const failures = [];
  if (!final.active || final.canvasCount !== 1 || final.contextLost) failures.push('final renderer is not live and singular');
  if (final.drawingBuffer.some(value => value <= 1)) failures.push('final drawing buffer is collapsed');
  if (JSON.stringify(final.memory) !== JSON.stringify(baseline.memory)) failures.push('renderer memory counts drifted');
  if ([final.rendererScheduler, final.guidedScheduler, final.holdTimer].some(value => value !== null)) failures.push('application scheduler did not settle');
  if (final.pendingAnimationFrames !== 0 || final.playing) failures.push('animation work did not settle');
  if (errors.length) failures.push(`${errors.length} browser errors`);
  return { browser: name, iterations: completed, forcedContextLosses, baseline, final, errors, failures };
}

const results = [];
for (const name of requested) results.push(await run(name));
console.log(JSON.stringify({ previewURL, results }, null, 2));
if (results.some(result => result.failures.length)) process.exitCode = 1;
