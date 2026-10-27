import { expect, test } from './helpers/offline-app.mjs';

for (const [name, viewport, touch] of [
  ['phone portrait', { width: 390, height: 844 }, true],
  ['phone landscape', { width: 844, height: 390 }, true],
  ['desktop', { width: 1440, height: 900 }, false]
]) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: touch });
    test('all coaching instructions are readable without clipping', async ({ page }) => {
      await page.goto('/?workspace=planner');
      await page.waitForFunction(() => window.pickleboard?.plays);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const plays = await page.evaluate(() => pickleboard.plays.list());
      for (const play of plays) {
        await page.evaluate(id => pickleboard.plays.load(id), play.id);
        const count = await page.evaluate(() => pickleboard.plays.getState().stepCount);
        for (let i = 0; i < count; i++) {
          const dimensions = await page.locator('#playbackDescription').evaluate(el => ({client: el.clientHeight, scroll: el.scrollHeight}));
          expect(dimensions.scroll, `${play.id} step ${i + 1}`).toBeLessThanOrEqual(dimensions.client + 1);
          const panel = await page.locator('#playbackControls').boundingBox();
          expect(panel.y).toBeGreaterThanOrEqual(0);
          expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);
          if (i < count - 1) await page.evaluate(index => pickleboard.plays.timelineAction('seek',pickleboard.plays.segmentEndpointTime(index + 1)),i);
        }
      }
    });

    test('arranged annotated pixel board survives retained 3D API round trips', async ({ page, browserName }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/?workspace=planner');
      await page.waitForFunction(() => window.pickleboard?.threeD);
      const activate = selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
      async function stroke(selector, dx, dy) {
        const box = await page.locator(selector).boundingBox();
        const fraction = selector === '#court' ? 0.35 : 0.5;
        const x = box.x + box.width * fraction, y = box.y + box.height * fraction;
        if (touch && browserName === 'chromium') {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{x, y}] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{x: x + dx, y: y + dy}] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await cdp.detach();
        } else if (touch) {
          const target = page.locator(selector);
          const dispatch = (type, px, py, active) => target.dispatchEvent(type, {
            touches: active ? [{identifier: 1, clientX: px, clientY: py}] : [],
            changedTouches: [{identifier: 1, clientX: px, clientY: py}]
          });
          await dispatch('touchstart', x, y, true);
          await dispatch('touchmove', x + dx, y + dy, true);
          await dispatch('touchend', x + dx, y + dy, false);
        } else {
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + dx, y + dy, { steps: 5 });
          await page.mouse.up();
        }
      }
      const original = await page.evaluate(() => pickleboard.getTokenPositions());
      await stroke('#player1-touch', 20, 25);
      await stroke('#ball', -20, -25);
      const arranged = await page.evaluate(() => pickleboard.getTokenPositions());
      expect(arranged.player1).not.toEqual(original.player1);
      expect(arranged.ball).not.toEqual(original.ball);
      await activate('#menuToggle');
      await activate('#drawToggle');
      await activate('#menuClose');
      await expect(page.locator('#menuOverlay')).toBeHidden();
      await stroke('#court', 35, 20);
      await expect(page.locator('#drawingLayer .drawing-stroke')).toHaveCount(1);
      const before = await page.evaluate(() => pickleboard.captureBoardState());
      await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
      // Only runFor advances playback; browser actionability must not add wall time.
      await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
      for (let run = 0; run < 2; run++) {
        await activate('#menuToggle');
        await activate('[data-play-id="serve-and-return"]');
        await activate('#playPlayPause');
        await page.clock.runFor(300);
        // Retained 3D compatibility API; primary playback uses the pixel court.
        await page.evaluate(() => pickleboard.threeD.enter());
        const entered = await page.evaluate(() => ({state: pickleboard.plays.getState(), positions: pickleboard.getTokenPositions()}));
        await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
        expect(entered.state.playing).toBe(true);
        await activate('#threeDPlayPause');
        const elapsed = await page.evaluate(() => pickleboard.threeD.clock.elapsed);
        expect(elapsed).toBeGreaterThan(0);
        await page.clock.runFor(200);
        expect(await page.evaluate(() => pickleboard.threeD.clock.elapsed)).toBe(elapsed);
        await page.locator('#threeDTimelineMount input[type=range]').fill('0');
        expect(await page.evaluate(() => pickleboard.threeD.clock.elapsed)).toBe(0);
        await activate('#threeDExit');
        // Both views share the same playhead: seeking in 3D returns 2D to setup.
        expect(await page.evaluate(() => pickleboard.plays.getState())).toMatchObject({elapsed:0,stepIndex:0,status:'paused',playing:false});
        expect(await page.evaluate(() => pickleboard.plays.snapshot.positions)).toEqual(before.positions);
        await activate('#playPlayPause');
        expect(await page.evaluate(() => pickleboard.plays.stepIndex)).toBe(0);
        await page.clock.runFor(1000);
        await activate('#playExit');
        const after = await page.evaluate(() => pickleboard.captureBoardState());
        expect(after).toEqual(before);
        await page.clock.runFor(2000);
        expect(await page.evaluate(() => pickleboard.getTokenPositions())).toEqual(before.positions);
        await expect(page.locator('#drawToggle')).toBeEnabled();
      }
      // Editing works again, including the restored drawing mode and Undo.
      await stroke('#court', -25, 20);
      await expect(page.locator('#drawingLayer .drawing-stroke')).toHaveCount(2);
      await activate('#menuToggle');
      await activate('#undoBtn');
      await expect(page.locator('#drawingLayer .drawing-stroke')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  });
}

test('cached coaching engine resumes an interrupted shot offline', async ({ page, offlineApp }) => {
  await page.goto(`${offlineApp.url}/?workspace=planner`);
  await page.waitForFunction(() => window.pickleboard?.plays && navigator.serviceWorker.controller);
  await offlineApp.stop();
  await page.reload();
  await page.waitForFunction(() => window.pickleboard?.plays);
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
      // Only runFor advances playback; browser actionability must not add wall time.
      await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.evaluate(() => pickleboard.plays.load('serve-and-return'));
  await page.locator('#playPlayPause').click();
  await page.clock.runFor(320);
  await page.locator('#playPlayPause').click();
  const paused = await page.evaluate(() => pickleboard.getTokenPositions());
  await page.locator('#playPlayPause').click();
  expect(await page.evaluate(() => pickleboard.plays.stepIndex)).toBe(1);
  expect(await page.evaluate(() => pickleboard.getTokenPositions())).toEqual(paused);
  await page.clock.runFor(650);
  const resumed=await page.evaluate(()=>({positions:pickleboard.getTokenPositions(),elapsed:pickleboard.plays.clock.elapsed,state:pickleboard.plays.getState()}));
  expect(resumed.state.stepIndex).toBe(1);
  expect(resumed.elapsed).toBeGreaterThan(.9);
  expect(resumed.positions.ball.y).toBeGreaterThan(paused.ball.y);
  expect(resumed.state.status).toBe('playing');
  await page.locator('#playExit').click();
  expect(await page.evaluate(() => pickleboard.playInteractionLocked)).toBe(false);
});
