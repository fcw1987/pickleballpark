import { expect, test } from '@playwright/test';

const openBuilder = async page => {
  await page.goto('/index.html?qa-render-lifecycle=1');
  await expect.poll(() => page.evaluate(() => Boolean(
    window.playBuilder && !playBuilder.busy && playBuilder.view === '3d' && window.pickleboard?.threeD?.renderer
  ))).toBe(true);
};

const settleFrames = (page, count = 2) => page.evaluate(frameCount => new Promise(resolve => {
  const frame = () => --frameCount > 0 ? requestAnimationFrame(frame) : resolve();
  requestAnimationFrame(frame);
}), count);

const loseContext = page => page.evaluate(() => new Promise((resolve, reject) => {
  const viewer = pickleboard.threeD;
  const canvas = viewer.renderer.domElement;
  const extension = viewer.renderer.getContext().getExtension('WEBGL_lose_context');
  if (!extension) {
    reject(new Error('WEBGL_lose_context is unavailable'));
    return;
  }
  canvas.addEventListener('webglcontextlost', () => resolve(), { once: true });
  extension.loseContext();
}));

test('a context lost while 3D is parked is discarded before re-entry', async ({ page }) => {
  await openBuilder(page);
  const firstCanvas = await page.evaluate(() => {
    const canvas = pickleboard.threeD.renderer.domElement;
    canvas.dataset.lifecycleCanvas = 'first';
    return { width: canvas.width, height: canvas.height };
  });
  expect(firstCanvas.width).toBeGreaterThan(1);
  expect(firstCanvas.height).toBeGreaterThan(1);

  await page.evaluate(() => playBuilder.switchView('2d'));
  await expect.poll(() => page.evaluate(() => playBuilder.view)).toBe('2d');
  expect(await page.evaluate(() => ({
    active: pickleboard.threeD.active,
    hasScene: Boolean(pickleboard.threeD.scene),
    canvasCount: document.querySelectorAll('#threeDCanvas canvas').length
  }))).toEqual({ active: false, hasScene: true, canvasCount: 1 });

  await loseContext(page);
  await settleFrames(page);
  const afterLoss = await page.evaluate(() => ({
    hasScene: Boolean(pickleboard.threeD.scene),
    canvasCount: document.querySelectorAll('#threeDCanvas canvas').length,
    contextLost: pickleboard.threeD.renderer?.getContext().isContextLost() ?? false
  }));
  expect(afterLoss).toEqual({ hasScene: false, canvasCount: 0, contextLost: false });

  await page.evaluate(() => playBuilder.switchView('3d'));
  await expect.poll(() => page.evaluate(() => !playBuilder.busy && playBuilder.view)).toBe('3d');
  expect(await page.evaluate(() => ({
    active: pickleboard.threeD.active,
    firstCanvasConnected: Boolean(document.querySelector('[data-lifecycle-canvas="first"]')),
    contextLost: pickleboard.threeD.renderer.getContext().isContextLost(),
    canvasCount: document.querySelectorAll('#threeDCanvas canvas').length
  }))).toEqual({ active: true, firstCanvasConnected: false, contextLost: false, canvasCount: 1 });
  expect(await page.evaluate(() => pickleboard.threeD.renderer.domElement.width)).toBeGreaterThan(1);
  expect(await page.evaluate(() => pickleboard.threeD.renderer.domElement.height)).toBeGreaterThan(1);
});

test('an active context loss exits safely and a retry creates one live renderer', async ({ page }) => {
  await openBuilder(page);
  await page.evaluate(() => { pickleboard.threeD.renderer.domElement.dataset.lifecycleCanvas = 'lost'; });
  await loseContext(page);
  await expect.poll(() => page.evaluate(() => Boolean(pickleboard.threeD.scene))).toBe(false);
  expect(await page.evaluate(() => ({
    active: pickleboard.threeD.active,
    canvasCount: document.querySelectorAll('#threeDCanvas canvas').length,
    scheduler: pickleboard.threeD.renderLoopId,
    message: pickleboard.threeD.elements.loadStatus.textContent
  }))).toEqual({
    active: false,
    canvasCount: 0,
    scheduler: null,
    message: 'Graphics were interrupted. Your board is safe. Try 3D View again.'
  });

  await page.evaluate(() => playBuilder.switchView('2d'));
  await page.evaluate(() => playBuilder.switchView('3d'));
  await expect.poll(() => page.evaluate(() => !playBuilder.busy && playBuilder.view)).toBe('3d');
  expect(await page.evaluate(() => ({
    active: pickleboard.threeD.active,
    lostCanvasConnected: Boolean(document.querySelector('[data-lifecycle-canvas="lost"]')),
    contextLost: pickleboard.threeD.renderer.getContext().isContextLost(),
    canvasCount: document.querySelectorAll('#threeDCanvas canvas').length
  }))).toEqual({ active: true, lostCanvasConnected: false, contextLost: false, canvasCount: 1 });
});

test('120 Help, playback, visibility, and view transitions settle to one finite renderer', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openBuilder(page);
  const baseline = await page.evaluate(() => ({ ...pickleboard.threeD.renderer.info.memory }));

  for (let batch = 0; batch < 6; batch += 1) {
    await page.setViewportSize(batch % 2
      ? { width: 844 - batch * 3, height: 390 + batch * 5 }
      : { width: 390 + batch * 7, height: 844 - batch * 4 });
    await page.evaluate(async batchIndex => {
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      for (let index = 0; index < 20; index += 1) {
        const absoluteIndex = batchIndex * 20 + index;
        if (absoluteIndex % 3 === 0) {
          playBuilder.play();
          await frame();
        }
        await playBuilder.action('help');
        if (!pickleboard.infoModal.classList.contains('active')) throw new Error(`Help did not open at ${absoluteIndex}`);
        pickleboard.closeInfoModal();
        const menu = playBuilder.ui.element.querySelector('.builder-main-menu');
        menu.open = true;
        menu.open = false;
        playBuilder.pause();
        await playBuilder.switchView('2d');
        if (absoluteIndex % 20 === 10) {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
          Object.defineProperty(document, 'hidden', { configurable: true, value: false });
          document.dispatchEvent(new Event('visibilitychange'));
        }
        if (absoluteIndex % 30 === 29) {
          const renderer = pickleboard.threeD.renderer;
          const extension = renderer.getContext().getExtension('WEBGL_lose_context');
          await new Promise((resolve, reject) => {
            if (!extension) { reject(new Error('WEBGL_lose_context is unavailable')); return; }
            renderer.domElement.addEventListener('webglcontextlost', resolve, { once: true });
            extension.loseContext();
          });
        }
        await playBuilder.switchView('3d');
        if (!pickleboard.threeD.active || pickleboard.threeD.renderer.getContext().isContextLost()) {
          throw new Error(`3D did not recover at ${absoluteIndex}`);
        }
      }
    }, batch);
  }

  await page.evaluate(() => playBuilder.pause());
  await settleFrames(page, 4);
  const final = await page.evaluate(() => ({
    active: pickleboard.threeD.active,
    canvasCount: document.querySelectorAll('#threeDCanvas canvas').length,
    contextLost: pickleboard.threeD.renderer.getContext().isContextLost(),
    rendererScheduler: pickleboard.threeD.renderLoopId,
    guidedScheduler: pickleboard.plays.animationFrame,
    holdTimer: pickleboard.plays.advanceTimer,
    memory: { ...pickleboard.threeD.renderer.info.memory },
    size: [pickleboard.threeD.renderer.domElement.width, pickleboard.threeD.renderer.domElement.height]
  }));
  expect(final).toMatchObject({
    active: true,
    canvasCount: 1,
    contextLost: false,
    rendererScheduler: null,
    guidedScheduler: null,
    holdTimer: null,
    memory: baseline
  });
  expect(final.size[0]).toBeGreaterThan(1);
  expect(final.size[1]).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('a real delayed 3D module cancelled by 2D cannot attach a stale renderer', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let releaseModule;
  let markRequested;
  const moduleGate = new Promise(resolve => { releaseModule = resolve; });
  const moduleRequested = new Promise(resolve => { markRequested = resolve; });
  // The procedural world has no actor downloads. Hold the real lazy entry
  // without allowing service-worker precaching to impersonate a blocked load.
  await page.route('**/three-d-playback.js', async route => {
    markRequested();
    await moduleGate;
    await route.continue();
  });
  try {
    await page.goto('/index.html?qa-delayed-renderer=1', { waitUntil: 'domcontentloaded' });
    await moduleRequested;
    await expect.poll(() => page.evaluate(() => Boolean(window.playBuilder?.busy))).toBe(true);
    const draft = await page.evaluate(() => JSON.stringify(playBuilder.document));
    await page.evaluate(() => playBuilder.switchView('2d'));
    // Cancellation must settle before the old module response is released.
    expect(await page.evaluate(() => ({ view: playBuilder.view, busy: playBuilder.busy })))
      .toEqual({ view: '2d', busy: false });
    releaseModule();
    // Imports cannot abort their network request. Await the held module's full
    // evaluation so the final check covers its stale continuation as well.
    await page.evaluate(async () => { await import('./three-d-playback.js'); });
    await settleFrames(page);
    expect(await page.evaluate(() => ({
      view: playBuilder.view,
      active: pickleboard.threeD.active,
      loading: Boolean(pickleboard.threeD.loading),
      scene: Boolean(pickleboard.threeD.scene),
      renderer: Boolean(pickleboard.threeD.renderer),
      canvasCount: document.querySelectorAll('#threeDCanvas canvas').length
    }))).toEqual({ view: '2d', active: false, loading: false, scene: false, renderer: false, canvasCount: 0 });
    expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(draft);
    expect(await page.evaluate(() => pickleboard.plays.session.owner)).toBe('guided');
  } finally {
    releaseModule();
    await context.close();
  }
});
