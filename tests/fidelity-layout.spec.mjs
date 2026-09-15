import { test, expect } from '@playwright/test';

test('compact history leaves a full-width, touch-sized seek surface', async ({ page }) => {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
    const range = page.getByRole('slider', { name: 'Rally timeline' });
    const box = await range.boundingBox();
    expect(box.width).toBeGreaterThan(width * .85);
    expect(box.height).toBeGreaterThanOrEqual(44);
    for (const label of ['Undo authored edit', 'Redo authored edit']) {
      const history = page.getByRole('button', { name: label });
      await expect(history).toBeVisible();
      const control = await history.boundingBox();
      expect(control.y + control.height).toBeLessThanOrEqual(box.y + 1);
    }
    await range.focus(); await range.press('End');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  }
});

test('wide court reclaims the editor column when details close', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  const court = page.locator('.builder-court-region');
  const original = await court.boundingBox();
  expect(original.width).toBeGreaterThan(1440 * .95);
  const documentBefore = await page.evaluate(() => JSON.stringify(playBuilder.document));
  await page.getByRole('button', { name: 'Edit shot', exact: true }).first().click();
  const editor = await page.locator('.builder-inspector').boundingBox();
  const withEditor = await court.boundingBox();
  expect(withEditor.x + withEditor.width).toBeLessThanOrEqual(editor.x + 1);
  await page.locator('.builder-inspector [data-action="collapse-inspector"]').click();
  await expect.poll(async () => (await court.boundingBox()).width).toBeCloseTo(original.width, 0);
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(documentBefore);
});
