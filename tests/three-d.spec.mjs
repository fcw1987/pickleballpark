// Legacy 3D compatibility coverage enters through the retained API; public UI defaults to pixel Canvas2D.
import { expect, test } from './helpers/offline-app.mjs';

async function openApp(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/index.html?workspace=planner&three-d-e2e=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
  return errors;
}

async function openDrop3d(page) {
  await page.evaluate(() => window.pickleboard.plays.load('third-shot-drop'));
  await page.evaluate(() => { void pickleboard.threeD.enter(); });
  await expect(page.locator('#threeDViewer')).toBeVisible();
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
}

test('legacy 3D compatibility: 3D View initializes regulation scene with players, ball, and handed paddles', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => window.pickleboard.tokens.player2.handedness = 'left');
  await openDrop3d(page);
  const scene = await page.evaluate(() => ({
    state: window.pickleboard.threeD.getState(),
    paddles: Object.fromEntries([...window.pickleboard.threeD.playerObjects]
      .map(([id, object]) => [id, { handedness: object.userData.handedness, gripDistance: object.userData.arms[0].hand.getWorldPosition(object.position.clone()).distanceTo(object.userData.paddle.children[2].getWorldPosition(object.position.clone())) }]))
  }));
  expect(scene.state).toMatchObject({ active: true, playerCount: 4, hasBall: true, playId: 'third-shot-drop' });
  expect(scene.paddles.player1).toMatchObject({ handedness: 'right' });
  expect(scene.paddles.player2).toMatchObject({ handedness: 'left' });
  for (const paddle of Object.values(scene.paddles)) expect(paddle.gripDistance).toBeLessThan(0.006);
  expect(errors).toEqual([]);
});

test('legacy 3D compatibility: named cameras switch without resetting the Play', async ({ page }) => {
  await openApp(page);
  await openDrop3d(page);
  for (const camera of ['overhead', 'sideline', 'behind-green', 'behind-orange']) {
    await page.locator('#threeDCamera').selectOption(camera,{force:true});
    expect(await page.evaluate(() => window.pickleboard.threeD.getState().camera)).toBe(camera);
    expect(await page.evaluate(() => window.pickleboard.threeD.getState().elapsed)).toBe(0);
  }
});

test('legacy 3D compatibility: play, pause, playback rate, timeline seek, and proof bounce share one clock', async ({ page }) => {
  await openApp(page);
  await openDrop3d(page);
  await page.locator('#threeDRate').selectOption('0.25',{force:true});
  await page.locator('#threeDPlayPause').click();
  await page.waitForTimeout(300);
  const slowState = await page.evaluate(() => window.pickleboard.threeD.getState());
  expect(slowState.playbackRate).toBe(0.25);
  expect(slowState.elapsed).toBeGreaterThan(0);
  await page.locator('#threeDPlayPause').click();
  const paused = await page.evaluate(() => window.pickleboard.threeD.getState().elapsed);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.pickleboard.threeD.getState().elapsed)).toBeCloseTo(paused, 4);

  await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    const proof = viewer.timeline.segments.find(segment => segment.step.id === 'third-drop');
    viewer.clock.elapsed = proof.startTime + proof.contactTime + proof.trajectory.flightDuration;
    viewer.applyAtTime(viewer.clock.elapsed);
  });
  const proof = await page.evaluate(() => window.pickleboard.threeD.getState().lastState);
  expect(proof.y).toBeCloseTo(0.037, 6);
  expect(proof.phase).toBe('bounce');
  await page.locator('#threeDTimelineMount input[type=range]').fill('0');
  expect(await page.evaluate(() => window.pickleboard.threeD.getState())).toMatchObject({ elapsed: 0, playing: false });
});

test('legacy 3D compatibility: exit cancels owned frames, re-entry schedules one frame, and 2D Play remains intact', async ({ page }) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    window.__replayFrames = { pending, maximum: 0 };
    window.requestAnimationFrame = callback => {
      const replay = callback.toString().includes('this.renderer.render(this.scene, this.camera)');
      let id; id = request(time => { pending.delete(id); callback(time); });
      if (replay) { pending.add(id); window.__replayFrames.maximum = Math.max(window.__replayFrames.maximum, pending.size); }
      return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
  });
  await openApp(page);
  await openDrop3d(page);
  expect(await page.evaluate(() => window.__replayFrames.maximum)).toBe(1);
  await page.locator('#threeDExit').click();
  await expect(page.locator('#threeDViewer')).toBeHidden();
  expect(await page.evaluate(() => window.pickleboard.threeD.getState().active)).toBe(false);
  expect(await page.evaluate(() => window.__replayFrames.pending.size)).toBe(0);
  expect(await page.evaluate(() => window.pickleboard.plays.getState().playId)).toBe('third-shot-drop');
  await page.evaluate(() => window.pickleboard.plays.timelineAction('chapter','return'));
  const returnState = await page.evaluate(() => {
    const engine = window.pickleboard.plays;
    const chapter = engine.chapters.find(item => item.shotId === 'return');
    return { ...engine.getState(), anchor: chapter.anchor, stepId: engine.lastState.segment.step.id,
      currentShotId: document.querySelector('#playTimelineMount .shot-timeline-marker.is-current')?.dataset.shotId };
  });
  expect(returnState).toMatchObject({ stepIndex: 2, stepId: 'return', currentShotId: 'return' });
  expect(returnState.elapsed).toBeCloseTo(returnState.anchor, 6);
  await page.evaluate(() => { void pickleboard.threeD.enter(); });
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  const frames = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    viewer.startRenderLoop(); viewer.startRenderLoop(); viewer.startRenderLoop();
    return { maximum: window.__replayFrames.maximum, pending: window.__replayFrames.pending.size, owned: window.__replayFrames.pending.has(viewer.renderLoopId) };
  });
  expect(frames).toEqual({ maximum: 1, pending: 1, owned: true });
  await page.locator('#threeDPlayPause').click();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => ({maximum:window.__replayFrames.maximum, pending:window.__replayFrames.pending.size, playing:window.pickleboard.threeD.session.playing}))).toEqual({maximum:1,pending:1,playing:true});
  await page.locator('#threeDExit').click();
  expect(await page.evaluate(() => ({pending: window.__replayFrames.pending.size, id: window.pickleboard.threeD.renderLoopId}))).toEqual({pending: 0, id: null});
});

test('legacy 3D compatibility: 3D viewer fits portrait, landscape, and desktop controls', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await openApp(page);
    await openDrop3d(page);
    const layout = await page.evaluate(() => {
      const root = document.querySelector('#threeDViewer').getBoundingClientRect();
      const hud = document.querySelector('.three-d-hud').getBoundingClientRect();
      return { root: root.toJSON(), hud: hud.toJSON(), documentHeight: document.documentElement.scrollHeight };
    });
    expect(layout.root.width).toBeCloseTo(viewport.width, 0);
    expect(layout.root.height).toBeCloseTo(viewport.height, 0);
    expect(layout.hud.left).toBeGreaterThanOrEqual(0);
    expect(layout.hud.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(layout.hud.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(layout.documentHeight).toBeLessThanOrEqual(viewport.height + 1);
    await page.locator('#threeDExit').click();
  }
});

test('legacy 3D compatibility: reduced motion retains 3D endpoints and camera controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await openDrop3d(page);
  await page.locator('#threeDCamera').selectOption('sideline',{force:true});
  expect(await page.evaluate(() => window.pickleboard.threeD.getState().camera)).toBe('sideline');
  await page.locator('#threeDTimelineMount input[type=range]').fill('0');
  expect(await page.evaluate(() => window.pickleboard.threeD.getState().lastState.phase)).toBe('ready');
});

test('legacy 3D compatibility: offline repeat visit can open the locally cached Three.js viewer', async ({ page, offlineApp }) => {
  await page.goto(`${offlineApp.url}/index.html?workspace=planner&three-d-e2e=1`);
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await offlineApp.stop();
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
  await openDrop3d(page);
  expect(await page.evaluate(() => window.pickleboard.threeD.getState())).toMatchObject({ active: true, hasBall: true, playerCount: 4 });
});
