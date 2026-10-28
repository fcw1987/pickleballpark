// Actual app playback, UI toggle, camera gestures, and deterministic raster audit.
// Usage: PREVIEW_URL=http://127.0.0.1:4191 node tools/capture-player-coverage.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.COVERAGE_PROOF_OUT || 'release-results/player-coverage';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(), evidence = [];
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 960 }], ['phone', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, recordVideo: { dir: out, size: viewport } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4191/');
    await page.waitForFunction(() => window.playBuilder?.view === '3d' && pickleboard.threeD?.worldAssetsReady);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async name => {
      await playBuilder.action('template', 'dink-exchange'); playBuilder.pause();
      pickleboard.threeD.cameraControls.setState({ azimuth: name === 'desktop' ? .18 : 0, elevation: 58, distance: name === 'desktop' ? 21 : 23.5, target: { x: 0, y: .5, z: 0 } });
      playBuilder.seek(.7);
    }, name);
    const before = await page.evaluate(() => JSON.stringify(playBuilder.document));
    await page.screenshot({ path: `${out}/${name}-coverage-off.png` });
    await page.getByRole('button', { name: 'Player coverage', exact: true }).click();
    await page.screenshot({ path: `${out}/${name}-coverage-on.png` });
    const raster = await page.evaluate(async () => {
      const { getCoveragePreference } = await import('/player-coverage.js'), THREE = await import('/vendor/three.module.min.js');
      const { boardToWorld } = await import('/three-d-core.js');
      const v = pickleboard.threeD, pref = getCoveragePreference(), canvas = document.createElement('canvas');
      canvas.width = v.renderer.domElement.width; canvas.height = v.renderer.domElement.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const pixel = world => { const p = new THREE.Vector3(world.x, world.y, world.z).project(v.camera); return { x: Math.round((p.x + 1) * canvas.width / 2), y: Math.round((1 - p.y) * canvas.height / 2) }; };
      const probes = [
        ...[2, 5, 8, 12, 17].flatMap(x => [15, 29].map(y => ({ name: `line-${x}-${y}`, at: pixel(boardToWorld({ x, y }, .0205 / .3048)) }))),
        { name: 'ball', at: pixel(v.ballObject.position) },
        ...[...v.playerObjects].map(([id, actor]) => ({ name: id, at: pixel({ x: actor.position.x, y: .9, z: actor.position.z }) }))
      ].filter(p => p.at.x >= 2 && p.at.y >= 2 && p.at.x < canvas.width - 2 && p.at.y < canvas.height - 2);
      const read = () => { v.renderer.render(v.scene, v.camera); ctx.drawImage(v.renderer.domElement, 0, 0); return probes.map(p => [...ctx.getImageData(p.at.x, p.at.y, 1, 1).data]); };
      pref.set(false); const off = read(); pref.set(true); const on = read();
      const foreground = probes.map((p, i) => ({ name: p.name, off: off[i], on: on[i], maxDifference: Math.max(...on[i].map((v, j) => Math.abs(v - off[i][j]))) }));
      return { foreground, coverage: v.playerCoverage.getDiagnostics(), draws: v.renderer.info.render.calls };
    });
    await page.getByLabel('About player coverage', { exact: true }).click();
    await page.screenshot({ path: `${out}/${name}-coverage-guide.png` }); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(2400);
    // A real empty-space pointer drag exercises the app's supported orbit path.
    const box = await page.locator('#threeDCanvas canvas').boundingBox();
    const start = { x: box.x + box.width * .08, y: box.y + box.height * .45 };
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 95, start.y + 25, { steps: 20 }); await page.mouse.up();
    await page.waitForTimeout(2400);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.screenshot({ path: `${out}/${name}-coverage-orbit.png` });
    await page.evaluate(() => { document.body.dataset.theme = 'dark'; });
    await page.screenshot({ path: `${out}/${name}-coverage-dark.png` });
    const after = await page.evaluate(() => ({ authored: JSON.stringify(playBuilder.document), coverage: pickleboard.threeD.playerCoverage.getDiagnostics(), camera: pickleboard.threeD.cameraControls.getState(), overflow: document.documentElement.scrollWidth > innerWidth }));
    const video = page.video(); await context.close(); await video.saveAs(`${out}/${name}-coverage-motion.webm`);
    const item = { name, viewport, authoredUnchanged: before === after.authored, errors, overflow: after.overflow, raster, after: { ...after, authored: undefined } }; evidence.push(item);
    if (!item.authoredUnchanged || item.errors.length || item.overflow || raster.foreground.some(p => p.maxDifference > 3)) throw Error(`Coverage proof failed for ${name}: inspect evidence.json`);
  }
} finally { await browser.close(); await writeFile(`${out}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`); }
console.log(JSON.stringify(evidence.map(({ name, errors, authoredUnchanged, overflow, raster }) => ({ name, errors, authoredUnchanged, overflow, maximumForegroundPixelChange: Math.max(...raster.foreground.map(p => p.maxDifference)) })), null, 2));
