import { test, expect } from '@playwright/test';
import { installDimensionalAudit } from './helpers/dimensional-audit.mjs';

test.use({ serviceWorkers: 'block' });

const ready = page => page.waitForFunction(() =>
  window.playBuilder?.view === '3d' && pickleboard.threeD.active && pickleboard.threeD.renderer.info.render.calls > 0);

test('normal court draws the approved skin throughout an orbit and releases its GPU resources on exit', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await installDimensionalAudit(page);
  const result = await page.evaluate(() => {
    const viewer = pickleboard.threeD, actor = viewer.playerObjects.get('player1');
    const resources = new Set(), disposed = new Map();
    actor.traverse(node => {
      if (node.isSkinnedMesh) for (const part of [node.material, node.geometry, node.skeleton]) resources.add(part);
    });
    for (const resource of resources) {
      const dispose = resource.dispose.bind(resource);
      resource.dispose = () => { disposed.set(resource, (disposed.get(resource) || 0) + 1); dispose(); };
    }
    const source = JSON.stringify(playBuilder.document);
    const roster = [...viewer.playerObjects.values()].map(player => player.userData.animation.source);
    const shot = viewer.timeline.segments.find(s => s.shotSemantics?.playerId === 'player1');
    playBuilder.seek(shot.startTime + shot.contactTime);
    const initial = [actor.position, viewer.ballObject.position, actor.userData.paddleFaceWorld].map(p => p.clone());
    const gl = viewer.renderer.getContext(), pixels = new Uint8Array(4 * 128 * 128);
    const original = new Uint8Array(pixels.length);
    let minChanged = Infinity, maxDrift = 0, maxContact = 0;
    for (let i = 0; i <= 16; i++) {
      viewer.cameraControls.setState({ azimuth: i * Math.PI / 8, elevation: 34 });
      viewer.applyAtTime(viewer.clock.elapsed);
      const center = actor.position.clone(); center.y += .85; center.project(viewer.camera);
      const rect = [Math.max(0, Math.min(gl.drawingBufferWidth - 128, Math.round((center.x + 1) * gl.drawingBufferWidth / 2) - 64)),
        Math.max(0, Math.min(gl.drawingBufferHeight - 128, Math.round((center.y + 1) * gl.drawingBufferHeight / 2) - 64))];
      const read = target => { viewer.renderer.render(viewer.scene, viewer.camera); gl.readPixels(...rect, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, target); };
      actor.visible = false; read(original); actor.visible = true; read(pixels);
      let changed = 0;
      for (let j = 0; j < pixels.length; j += 4) {
        if ([0,1,2].some(channel => Math.abs(original[j+channel] - pixels[j+channel]) > 12)) changed++;
      }
      minChanged = Math.min(minChanged, changed);
      maxDrift = Math.max(maxDrift, ...[actor.position, viewer.ballObject.position, actor.userData.paddleFaceWorld].map((p,k) => p.distanceTo(initial[k])));
      maxContact = Math.max(maxContact, window.__athleteAudit(actor).paddleDistance(viewer.ballObject.position));
    }
    viewer.exit();
    return { roster, minChanged, maxContact, maxDrift, count: resources.size,
      disposed: [...resources].every(part => disposed.get(part) === 1), sourcePreserved: source === JSON.stringify(playBuilder.document) };
  });
  expect(result.roster).toEqual(['approved-emerald-cap-glb', ...Array(3).fill('original-imagegen-articulated-v2')]);
  expect(result.minChanged).toBeGreaterThan(40);
  expect(result.maxDrift).toBeLessThan(1e-6);
  expect(result.maxContact).toBeLessThan(0.037);
  expect(result.count).toBeGreaterThan(12);
  expect(result.disposed && result.sourcePreserved).toBe(true);
});

for (const fault of ['missing', 'corrupt']) {
  test('illustrated Emerald Cap can play and retry after a ' + fault + ' model', async ({ page }) => {
    const url = '**/assets/athletes/emerald-cap.glb';
    await page.route(url, route => route.fulfill({ status: fault === 'missing' ? 404 : 200, body: 'invalid model' }));
    await page.goto('/');
    await ready(page);
    const fallback = await page.evaluate(() => {
      const v = pickleboard.threeD, actor = v.playerObjects.get('player1');
      const s = v.timeline.segments.find(s => s.shotSemantics?.playerId === 'player1');
      playBuilder.seek(s.startTime + s.contactTime);
      return { original: actor.userData.body.material.map.image.width > 0,
        source: actor.userData.animation.source, contact: actor.userData.paddleFaceWorld.distanceTo(v.ballObject.position) };
    });
    expect(fallback).toMatchObject({ original: true, source: 'original-imagegen-articulated-v2' });
    expect(fallback.contact).toBeLessThan(.01);
    await page.unroute(url);
    await page.evaluate(async () => { const v = pickleboard.threeD; v.exit(); await v.enter(); });
    expect(await page.evaluate(() => pickleboard.threeD.playerObjects.get('player1').userData.emeraldCap)).toBe(true);
  });
}
