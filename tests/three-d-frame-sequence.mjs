import { expect, test } from '@playwright/test';

// Developer-only deterministic contact frame sequence. Run with:
//   UPDATE_SNAPSHOTS=1 npx playwright test tests/three-d-frame-sequence.mjs
// Screenshots are only emitted when explicitly requested; semantic checks always run.
test('capture deterministic Fifth Shot Drop contact neighborhoods', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index.html?frame-sequence=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
  await page.evaluate(() => window.pickleboard.plays.load('fifth-shot-drop'));
  await page.locator('#play3dView').click();
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  await page.locator('#threeDCamera').selectOption('sideline',{force:true});

  const records = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    const results = [];
    for (const segment of viewer.timeline.segments.filter(item => item.shotSemantics)) {
      for (const offset of [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]) {
        const absolute = segment.startTime + Math.max(0, segment.contactTime + offset);
        viewer.applyAtTime(absolute);
        const actor = viewer.playerObjects.get(segment.shotSemantics.playerId);
        actor.updateMatrixWorld(true);
        const matrix = actor.userData.paddle.matrixWorld.elements;
        const paddle = [matrix[12], matrix[13], matrix[14]];
        const ball = viewer.ballObject.position.toArray();
        results.push({
          step: segment.step.id,
          offset,
          phase: actor.userData.animation.phase,
          stroke: actor.userData.animation.stroke,
          ballPhase: viewer.lastState.phase,
          distance: Math.hypot(ball[0] - paddle[0], ball[1] - paddle[1], ball[2] - paddle[2]),
          finite: [...ball, ...paddle].every(Number.isFinite)
        });
      }
    }
    return results;
  });
  expect(records.every(record => record.finite)).toBe(true);
  for (const record of records.filter(record => record.offset === 0)) expect(record.distance).toBeLessThan(0.01);

  if (process.env.UPDATE_SNAPSHOTS === '1') {
    for (const record of records) {
      await page.evaluate(({ step, offset }) => {
        const viewer = window.pickleboard.threeD;
        const segment = viewer.timeline.segments.find(item => item.step.id === step);
        viewer.applyAtTime(segment.startTime + Math.max(0, segment.contactTime + offset));
        viewer.renderer.render(viewer.scene, viewer.camera);
      }, record);
      await page.locator('#threeDCanvas').screenshot({
        path: testInfo.outputPath(`${record.step}-${String(record.offset).replace('.', '_')}.png`)
      });
    }
  }
});
