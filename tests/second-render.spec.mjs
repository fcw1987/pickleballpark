// Legacy 3D compatibility coverage enters through the retained API; public UI defaults to pixel Canvas2D.
import { expect, test } from '@playwright/test';
import { installDimensionalAudit } from './helpers/dimensional-audit.mjs';
import { installReferenceRigContract } from './helpers/reference-rig-browser-contract.mjs';

async function openViewer(page) {
  await page.goto('/index.html?workspace=planner&second-render=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
  await page.evaluate(() => window.pickleboard.plays.load('fifth-shot-drop'));
  await page.evaluate(() => { void pickleboard.threeD.enter(); });
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  await installReferenceRigContract(page);
}

test('legacy 3D compatibility: 3D renderer uses antialiasing and native DPR up to the quality cap', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await openViewer(page);
  const render = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    const canvas = viewer.renderer.domElement;
    return {
      antialias: viewer.renderer.getContext().getContextAttributes().antialias,
      css: [canvas.clientWidth, canvas.clientHeight],
      buffer: [canvas.width, canvas.height],
      ratio: viewer.renderer.getPixelRatio(),
      pixelScale: viewer.getState().pixelScale
    };
  });
  expect(render.antialias).toBe(true);
  expect(render.pixelScale).toBe(1);
  expect(render.ratio).toBe(2);
  expect(render.buffer[0]).toBe(render.css[0] * 2);
  expect(render.buffer[1]).toBe(render.css[1] * 2);
  await context.close();
});

test('legacy 3D compatibility: directional artwork and solid athlete meshes own and release every resource on exit', async ({ page }) => {
  await openViewer(page);
  const result = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD, resources = viewer.actorResources;
    const meshes = [];
    for (const root of viewer.playerObjects.values()) root.traverse(mesh => { if (mesh.isMesh && mesh.visible && mesh.name !== 'AthleteContactShadow') meshes.push(mesh); });
    const ownedGeometry = meshes.every(mesh => resources.geometries.has(mesh.geometry));
    const ownedMaterial = meshes.every(mesh => [...resources.materials].includes(mesh.material));
    const materials = meshes.every(mesh => mesh.material.type === 'MeshBasicMaterial' && mesh.material.depthTest && mesh.material.depthWrite);
    const artwork = [...viewer.playerObjects.values()].map(root => window.__referenceRigContract.artwork(root));
    const tracked = [...resources.geometries, ...resources.materials, ...resources.textures.values()];
    const counts = tracked.map(() => 0);
    tracked.forEach((resource, i) => resource.addEventListener('dispose', () => counts[i]++));
    viewer.exit();
    resources.dispose(); // A second lifecycle cleanup must not redispose released GPU resources.
    return { ownedGeometry, ownedMaterial, materials, artwork, meshCount: meshes.length, counts, remaining: resources.geometries.size + resources.materials.size + resources.textures.size };
  });
  expect(result).toMatchObject({ ownedGeometry: true, ownedMaterial: true, materials: true, remaining: 0 });
  expect(result.meshCount).toBe(64); // Body, two original-art sleeve planes, ten arm pieces and three paddle pieces per athlete.
  for (const artwork of result.artwork) expect(artwork).toEqual({ sourceLoaded: true, dimensions: true, identity: true, visibleOriginalPixels: true });
  expect(result.counts.every(count => count === 1)).toBe(true);
});

test('legacy 3D compatibility: articulated strokes remain upright, continuously positioned, grounded, and contact calibrated', async ({ page }) => {
  await openViewer(page);
  await installDimensionalAudit(page);
  const audit = await page.evaluate(async () => {
    const { sampleActorPresentation } = await import('./three-d-presentation.js');
    const viewer = window.pickleboard.threeD;
    return viewer.timeline.segments.filter(segment => segment.shotSemantics).map(segment => {
      const actor = viewer.playerObjects.get(segment.shotSemantics.playerId);
      const samples = [];
      for (let offset = -0.12; offset <= 0.1201; offset += 0.02) {
        viewer.applyAtTime(segment.startTime + segment.contactTime + offset);
        const presentation = sampleActorPresentation({ instructionalMovement: true, segment, timeline: viewer.timeline, seconds: segment.startTime + segment.contactTime + offset, playerId: segment.shotSemantics.playerId, localTime: segment.contactTime + offset, cameraPosition: viewer.camera.position, cameraTarget: viewer.cameraTarget, handedness: actor.userData.handedness });
        samples.push({
          position: actor.position.toArray(),
          paddle: actor.userData.paddleFaceWorld.toArray(),
          ball: viewer.ballObject.position.toArray(),
          frame: actor.userData.animation.phase,
          groundY: actor.position.y,
          expectedY: presentation.worldPosition.y + window.__referenceRigContract.expectedJump(presentation),
          cameraAlignment: window.__referenceRigContract.cameraAlignment(actor, viewer.camera),
          shoeBottoms: window.__athleteAudit(actor).shoeBottoms,
          artworkError: window.__athleteAudit(actor).artworkError()
        });
      }
      return { samples };
    });
  });
  for (const shot of audit) {
    for (const sample of shot.samples) {
      expect(sample.groundY).toBe(sample.expectedY);
      expect(sample.cameraAlignment.forwardError).toBeLessThan(1e-6);
      expect(sample.cameraAlignment.headingError).toBeLessThan(1e-6);
      expect(sample.cameraAlignment.rollError).toBeLessThan(1e-6);
      expect(Math.abs(sample.cameraAlignment.elevation - sample.cameraAlignment.expectedElevation)).toBeLessThan(1e-6);
    }
    expect(new Set(shot.samples.map(sample => sample.frame)).size).toBeGreaterThan(1);
    for (const sample of shot.samples) {
      expect(sample.artworkError).toBeLessThan(2e-6);
      expect(Math.min(...sample.shoeBottoms)).toBeGreaterThanOrEqual(-0.005);
      expect(Math.min(...sample.shoeBottoms)).toBeLessThanOrEqual(0.01);
    }
    for (let i = 1; i < shot.samples.length; i++) {
      expect(Math.hypot(...shot.samples[i].position.map((value, axis) => value - shot.samples[i - 1].position[axis]))).toBeLessThan(0.4);
    }
    const atContact = shot.samples[6];
    expect(Math.hypot(...atContact.ball.map((value, axis) => value - atContact.paddle[axis]))).toBeLessThan(0.01);
  }
});

test('legacy 3D compatibility: tab visibility gaps preserve elapsed time and the playing state', async ({ page }) => {
  await openViewer(page);
  const active = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    viewer.clock.elapsed = 0.4;
    viewer.clock.play(1000);
    viewer.clock.update(1100);
    document.dispatchEvent(new Event('visibilitychange'));
    const elapsedBeforeReturn = viewer.clock.elapsed;
    const elapsedAfterReturn = viewer.clock.update(100000);
    return { elapsedBeforeReturn, elapsedAfterReturn, playing: viewer.clock.playing };
  });
  expect(active.playing).toBe(true);
  expect(active.elapsedAfterReturn).toBe(active.elapsedBeforeReturn);

  const paused = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    viewer.clock.pause();
    document.dispatchEvent(new Event('visibilitychange'));
    const before = viewer.clock.elapsed;
    return { playing: viewer.clock.playing, before, after: viewer.clock.update(200000) };
  });
  expect(paused.playing).toBe(false);
  expect(paused.after).toBe(paused.before);
});
