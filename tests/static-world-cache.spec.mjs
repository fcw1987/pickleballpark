// Legacy 3D compatibility coverage enters through the retained API; public UI defaults to pixel Canvas2D.
import { test, expect } from '@playwright/test';

const openScene = async page => {
  await page.goto('/?workspace=planner');
  await page.waitForFunction(() => window.pickleboard?.plays);
  await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
  await page.evaluate(() => { void pickleboard.threeD.enter(); });
  await page.waitForFunction(() => pickleboard.threeD?.active && pickleboard.threeD.staticWorldCache);
};

const compareCachedPixels = () => {
    const v = pickleboard.threeD, cache = v.staticWorldCache, gl = v.renderer.getContext();
    v.cancelRenderWork();
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const raw = new Uint8Array(width * height * 4), cached = new Uint8Array(raw.length), cases = [];
    const sample = (enabled, pixels) => {
      cache.enabled = enabled; v.renderer.render(v.scene, v.camera);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    };
    const times = [0, ...v.timeline.segments.slice(0, 4).flatMap(s => [s.startTime + s.contactTime, s.startTime + s.duration * .67])];
    for (const camera of ['overhead', 'sideline', 'behind-green', 'behind-orange']) {
      v.setCamera(camera);
      for (const seconds of times) {
        v.session.seek(seconds); v.applyAtTime(seconds);
        sample(false, raw); sample(true, cached);
        let error = 0, changed = 0, severe = 0, maximum = 0;
        for (let i = 0; i < raw.length; i += 4) {
          let pixel = 0;
          for (let c = 0; c < 3; c++) { const d = Math.abs(raw[i + c] - cached[i + c]); error += d; pixel = Math.max(pixel, d); }
          if (pixel > 2) changed++;
          if (pixel > 24) severe++;
          maximum = Math.max(maximum, pixel);
        }
        cases.push({ camera, seconds, mean: error / (width * height * 3), changedFraction: changed / (width * height), severeFraction: severe / (width * height), maximum });
      }
    }
    return { cases, stats: { ...cache.stats }, nativeSamples: gl.getParameter(gl.SAMPLES), antialias: gl.getContextAttributes().antialias,
      ratio: v.renderer.getPixelRatio(), width, height, memory: { ...v.renderer.info.memory } };
};

const expectPixelEquivalence = evidence => {
  // Allow edge-level resolved-depth/8-bit rounding, never broad color or occlusion loss.
  expect(evidence.cases).toHaveLength(36);
  for (const item of evidence.cases) {
    expect(item.mean, JSON.stringify(item)).toBeLessThan(0.6);
    expect(item.changedFraction, JSON.stringify(item)).toBeLessThan(0.012);
    expect(item.severeFraction, JSON.stringify(item)).toBeLessThan(0.002);
  }
};

test('legacy 3D compatibility: static scene cache reuses artwork and invalidates for camera, light and world changes', async ({ page }) => {
  await openScene(page);
  const evidence = await page.evaluate(() => {
    const v = pickleboard.threeD, cache = v.staticWorldCache;
    v.cancelRenderWork();
    const render = () => v.renderer.render(v.scene, v.camera);
    render(); const first = { ...cache.stats };
    for (const time of [0.2, 0.5, 1.2, 2.6]) { v.applyAtTime(time); render(); }
    const reuse = { ...cache.stats };
    v.setCamera('sideline'); render(); const camera = { ...cache.stats };
    const light = v.scene.children.find(o => o.isDirectionalLight);
    light.intensity += 0.17; render(); const lit = { ...cache.stats };
    const ground = v.world.group.getObjectByName('GardenGround');
    ground.material.color.multiplyScalar(0.95); render(); const paint = { ...cache.stats };
    cache.invalidate('test-explicit'); render(); const explicit = { ...cache.stats };
    return { enabled: cache.enabled, first, reuse, camera, lit, paint, explicit };
  });
  expect(evidence.enabled).toBe(true);
  expect(evidence.reuse.builds).toBe(evidence.first.builds);
  expect(evidence.reuse.reuses).toBeGreaterThanOrEqual(evidence.first.reuses + 4);
  for (const [before, after] of [['reuse', 'camera'], ['camera', 'lit'], ['lit', 'paint'], ['paint', 'explicit']]) {
    expect(evidence[after].builds, after).toBeGreaterThan(evidence[before].builds);
  }
});

test('legacy 3D compatibility: cached color and depth preserve moving ball, players and net across cameras', async ({ page }) => {
  await openScene(page);
  const evidence = await page.evaluate(compareCachedPixels);
  await test.info().attach('cached-vs-direct-pixels', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  expectPixelEquivalence(evidence);
});

test('legacy 3D compatibility: cache follows backing-buffer resize and disposes its owned resources once', async ({ page }) => {
  await openScene(page);
  await page.evaluate(() => {
    const v = pickleboard.threeD, cache = v.staticWorldCache;
    v.cancelRenderWork(); v.renderer.render(v.scene, v.camera);
    window.__cacheAudit = { cache, resources: [], counts: [] };
    const audit = window.__cacheAudit;
    const track = resource => {
      if (audit.resources.includes(resource)) return;
      const index = audit.resources.push(resource) - 1; audit.counts.push(0);
      resource.addEventListener('dispose', () => audit.counts[index]++);
    };
    for (const kind of ['targets', 'geometries', 'materials']) for (const resource of cache.resources[kind]) track(resource);
    // Observe short-lived MSAA build targets as well as each resized resident
    // target, so every allocation after the audit starts must retire once.
    const addTarget = cache.resources.targets.add;
    cache.resources.targets.add = function(resource) { track(resource); return addTarget.call(this, resource); };
  });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => {
      const v = pickleboard.threeD; v.renderer.render(v.scene, v.camera);
      return [v.staticWorldCache.stats.width - v.renderer.domElement.width, v.staticWorldCache.stats.height - v.renderer.domElement.height];
    })).toEqual([0, 0]);
  }
  const evidence = await page.evaluate(() => {
    const { cache, counts } = window.__cacheAudit, stats = { ...cache.stats };
    pickleboard.threeD.exit(); cache.dispose();
    return { counts, stats, disposed: cache.stats.disposed };
  });
  expect(evidence.counts.length).toBeGreaterThan(0);
  expect(evidence.counts.every(n => n === 1)).toBe(true);
  expect(evidence.disposed).toBe(true);
});

test('legacy 3D compatibility: oversized high-DPR surfaces retain direct rendering and cache again after shrinking', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await context.newPage();
  await openScene(page);
  const large = await page.evaluate(() => {
    const v = pickleboard.threeD; v.cancelRenderWork(); v.renderer.render(v.scene, v.camera);
    return { stats: { ...v.staticWorldCache.stats }, enabled: v.staticWorldCache.enabled, ratio: v.renderer.getPixelRatio() };
  });
  expect(large.enabled).toBe(true);
  expect(large.ratio).toBe(2);
  expect(large.stats.disabledReason).toBe('cache-memory-budget');
  expect(large.stats.estimatedBytes).toBeLessThan(large.stats.memoryBudgetBytes);
  expect(large.stats.estimatedPeakBytes).toBeGreaterThan(large.stats.peakMemoryBudgetBytes);
  expect(large.stats.residentBytes).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => {
    const v = pickleboard.threeD; v.renderer.render(v.scene, v.camera);
    return v.staticWorldCache.stats.disabledReason;
  })).toBe(null);
  const small = await page.evaluate(() => ({ ...pickleboard.threeD.staticWorldCache.stats }));
  expect(small.builds).toBeGreaterThan(large.stats.builds);
  expect(small.estimatedBytes).toBeLessThanOrEqual(96 * 1024 * 1024);
  expect(small.estimatedPeakBytes).toBeLessThanOrEqual(192 * 1024 * 1024);
  expect(small.failures).toBe(0);
  await context.close();
});


test('legacy 3D compatibility: native DPR3 phones retain MSAA quality with bounded resolved-cache memory', async ({ browser }) => {
  test.setTimeout(60000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await openScene(page);
    const evidence = await page.evaluate(compareCachedPixels);
    const rebuilds = await page.evaluate(() => {
      const v = pickleboard.threeD, cache = v.staticWorldCache, baseline = { ...v.renderer.info.memory };
      for (let i = 0; i < 12; i++) { cache.invalidate('phone-memory-audit'); v.renderer.render(v.scene, v.camera); }
      return { baseline, final: { ...v.renderer.info.memory }, stats: { ...cache.stats },
        targets: [...cache.resources.targets].map(target => ({ samples: target.samples, width: target.width, height: target.height })) };
    });
    await test.info().attach('native-phone-cached-vs-direct-pixels', { body: JSON.stringify({ ...evidence, rebuilds, errors }, null, 2), contentType: 'application/json' });
    expectPixelEquivalence(evidence);
    expect(evidence.ratio).toBe(3);
    expect(evidence.width).toBe(1170);
    expect(evidence.height).toBe(2532);
    expect(evidence.antialias).toBe(true);
    expect(evidence.nativeSamples).toBeGreaterThan(0);
    expect(evidence.stats.buildSamples).toBe(evidence.nativeSamples);
    expect(evidence.stats.residentSamples).toBe(0);
    expect(evidence.stats.disabledReason).toBe(null);
    expect(evidence.stats.residentBytes).toBe(evidence.width * evidence.height * 8);
    expect(evidence.stats.residentBytes).toBeLessThanOrEqual(96 * 1024 * 1024);
    expect(evidence.stats.estimatedPeakBytes).toBeLessThanOrEqual(192 * 1024 * 1024);
    expect(rebuilds.final).toEqual(rebuilds.baseline);
    expect(rebuilds.stats.transientBytes).toBe(0);
    expect(rebuilds.stats.failures).toBe(0);
    expect(rebuilds.targets).toEqual([{ samples: 0, width: evidence.width, height: evidence.height }]);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
