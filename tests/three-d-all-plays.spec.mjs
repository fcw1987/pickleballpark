// Legacy 3D compatibility coverage enters through the retained API; public UI defaults to pixel Canvas2D.
import { expect, test } from '@playwright/test';

const plays = [
  { id: 'serve-and-return', finalStep: 'return', stepCount: 3 },
  { id: 'third-shot-drop', finalStep: 'drop-transition', stepCount: 5 },
  { id: 'third-shot-drive', finalStep: 'fourth-block', stepCount: 5 },
  { id: 'fifth-shot-drop', finalStep: 'fifth-transition', stepCount: 7 }
];

async function openApp(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/index.html?workspace=planner&all-plays-3d=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
  return errors;
}

for (const expected of plays) {
  test(`legacy 3D compatibility: ${expected.id} reaches its endpoint, seeks, exits, and re-enters 3D`, async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(id => window.pickleboard.plays.load(id), expected.id);
    await page.evaluate(() => { void pickleboard.threeD.enter(); });
    await expect(page.locator('#threeDViewer')).toBeVisible();

    const initialized = await page.evaluate(() => ({
      state: window.pickleboard.threeD.getState(),
      segmentIds: window.pickleboard.threeD.timeline.segments.map(segment => segment.step.id),
      trajectoryTypes: window.pickleboard.threeD.timeline.segments
        .filter(segment => segment.step.shot)
        .map(segment => segment.trajectory?.metadata.type)
    }));
    expect(initialized.state).toMatchObject({ playerCount: 4, hasBall: true, playId: expected.id });
    expect(initialized.segmentIds).toHaveLength(expected.stepCount - 1);
    expect(initialized.trajectoryTypes.every(Boolean)).toBe(true);

    await page.evaluate(() => {
      const viewer = window.pickleboard.threeD;
      viewer.clock.elapsed = viewer.timeline.duration;
      viewer.applyAtTime(viewer.clock.elapsed);
      viewer.clock.pause();
    });
    const completed = await page.evaluate(() => {
      const viewer = window.pickleboard.threeD;
      const last = viewer.timeline.segments.at(-1);
      return {
        lastStep: last.step.id,
        elapsed: viewer.clock.elapsed,
        duration: viewer.timeline.duration,
        ball: viewer.lastState,
        positions: Object.fromEntries([...viewer.playerObjects].map(([id, object]) => [id, object.position.toArray()]))
      };
    });
    expect(completed.lastStep).toBe(expected.finalStep);
    expect(completed.elapsed).toBeCloseTo(completed.duration, 6);
    expect(completed.positions).toHaveProperty('player1');
    expect(completed.ball).toBeTruthy();

    await page.locator('#threeDTimelineMount input[type=range]').fill('0');
    expect(await page.evaluate(() => window.pickleboard.threeD.getState())).toMatchObject({ elapsed: 0, playing: false });
    await page.locator('#threeDCamera').selectOption('sideline',{force:true});
    expect(await page.evaluate(() => window.pickleboard.threeD.getState().camera)).toBe('sideline');
    await page.locator('#threeDRate').selectOption('0.5',{force:true});
    expect(await page.evaluate(() => window.pickleboard.threeD.getState().playbackRate)).toBe(0.5);
    await page.locator('#threeDExit').click();
    expect(await page.evaluate(() => window.pickleboard.plays.getState().playId)).toBe(expected.id);
    await page.evaluate(() => window.pickleboard.plays.timelineAction('chapter',window.pickleboard.plays.chapters[1].shotId));
    expect((await page.evaluate(() => window.pickleboard.plays.getState().stepIndex))).toBeGreaterThan(0);
    await page.evaluate(() => { void pickleboard.threeD.enter(); });
    await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
