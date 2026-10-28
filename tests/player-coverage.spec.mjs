import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.playBuilder?.view === '3d' && pickleboard.threeD?.worldAssetsReady);
  await page.evaluate(() => playBuilder.pause());
}
const toggle = page => page.getByRole('button', { name: 'Player coverage', exact: true });

test('coverage is a persisted optional view with no authored changes or playback changes', async ({ page }) => {
  await open(page); await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  const before = await page.evaluate(() => ({ document: structuredClone(playBuilder.document), time: playBuilder.session.clock.elapsed, playing: playBuilder.session.playing }));
  await toggle(page).click(); await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => ({ document: structuredClone(playBuilder.document), time: playBuilder.session.clock.elapsed, playing: playBuilder.session.playing }))).toEqual(before);
  expect(await page.evaluate(() => pickleboard.threeD.playerCoverage.getDiagnostics().sectors.length)).toBe(4);
  await page.reload(); await page.waitForFunction(() => pickleboard.threeD?.worldAssetsReady); await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await toggle(page).click(); await page.reload(); await page.waitForFunction(() => pickleboard.threeD?.worldAssetsReady); await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
});

test('the same sampled sectors follow actual actors and ball through seeking and camera orbit', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await open(page); await page.evaluate(() => playBuilder.action('template', 'dink-exchange')); await toggle(page).click();
  const result = await page.evaluate(async () => {
    const { worldToBoard } = await import('/three-d-core.js');
    const v = pickleboard.threeD, time = v.timeline.duration * .44;
    playBuilder.seek(time);
    const before = structuredClone(v.playerCoverage.getDiagnostics());
    const actual = [...v.playerObjects].map(([id, actor]) => ({ id, position: worldToBoard(actor.position) }));
    const ball = worldToBoard(v.ballObject.position);
    for (let i = 0; i < 8; i++) v.cameraControls.setState({ azimuth: i * Math.PI / 4, elevation: 50, distance: 20, target: { x: 0, y: .6, z: 0 } });
    v.renderSessionSample(); const afterOrbit = structuredClone(v.playerCoverage.getDiagnostics());
    playBuilder.seek(time + .17); const moved = structuredClone(v.playerCoverage.getDiagnostics());
    playBuilder.seek(time); const returned = structuredClone(v.playerCoverage.getDiagnostics());
    return { before, actual, ball, afterOrbit, moved, returned };
  });
  expect(result.before.sectors).toHaveLength(4); expect(result.afterOrbit).toEqual(result.before); expect(result.returned).toEqual(result.before);
  expect(result.moved.ball).not.toEqual(result.before.ball);
  for (const actual of result.actual) expect(result.before.sectors.find(s => s.id === actual.id).position).toEqual(actual.position);
  expect(result.before.ball.x).toBeCloseTo(result.ball.x, 9); expect(result.before.ball.y).toBeCloseTo(result.ball.y, 9); expect(errors).toEqual([]);
});

test('overlay costs one draw call, has fixed resources, honors provider versions and releases resources once', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { getCoveragePreference } = await import('/player-coverage.js'); const pref = getCoveragePreference(), v = pickleboard.threeD;
    v.renderSessionSample(); const off = v.renderer.info.render.calls;
    pref.set(true); v.renderSessionSample(); const on = v.renderer.info.render.calls, textures = v.renderer.info.memory.textures, geometryCount = v.renderer.info.memory.geometries;
    for (let i = 0; i < 80; i++) { pref.set(i % 2 === 0); v.applyAtTime(v.timeline.duration * (i / 80)); v.renderer.render(v.scene, v.camera); }
    const stable = { textures: v.renderer.info.memory.textures, geometryCount: v.renderer.info.memory.geometries };
    pref.set(true); pickleboard.coverageSnapshotProvider = () => ({ version: 999 }); v.renderSessionSample(); const invalidHidden = !v.playerCoverage.mesh.visible;
    delete pickleboard.coverageSnapshotProvider; v.renderSessionSample(); const restored = v.playerCoverage.mesh.visible;
    const layer = v.playerCoverage, counts = { geometry: 0, material: 0 };
    layer.mesh.geometry.addEventListener('dispose', () => counts.geometry++); layer.mesh.material.addEventListener('dispose', () => counts.material++);
    const props = { depthTest: layer.mesh.material.depthTest, depthWrite: layer.mesh.material.depthWrite, floorHeight: layer.mesh.position.y };
    v.exit(); layer.dispose(); return { off, on, textures, geometryCount, stable, invalidHidden, restored, counts, props };
  });
  expect(result.on - result.off).toBe(1); expect(result.stable).toEqual({ textures: result.textures, geometryCount: result.geometryCount });
  expect(result.invalidHidden).toBe(true); expect(result.restored).toBe(true); expect(result.counts).toEqual({ geometry: 1, material: 1 });
  expect(result.props).toEqual({ depthTest: true, depthWrite: false, floorHeight: .035 });
});

test('blocked preference storage still permits the view without an application error', async ({ page }) => {
  await page.addInitScript(() => {
    const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) { if (key === 'pickleboard-player-coverage-v1') throw Error('denied'); return read.call(this, key); };
    Storage.prototype.setItem = function(key, value) { if (key === 'pickleboard-player-coverage-v1') throw Error('quota'); return write.call(this, key, value); };
  });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); await open(page); await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true'); expect(await page.evaluate(() => pickleboard.threeD.playerCoverage.mesh.visible)).toBe(true); expect(errors).toEqual([]);
});

for (const [width, height] of [[320, 780], [390, 844], [844, 390], [1440, 900]]) test(`coverage controls, explanation and theme stay usable at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await open(page); await toggle(page).click();
  await page.getByLabel('About player coverage', { exact: true }).click();
  const box = await page.locator('.player-coverage-explanation').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
  expect((await toggle(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.locator('.player-coverage-help')).not.toHaveAttribute('open', '');
  await page.evaluate(() => { document.body.dataset.theme = 'dark'; }); await expect(toggle(page)).toBeVisible();
});
