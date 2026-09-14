import { test, expect } from '@playwright/test';

test('coaching visible journey smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Starter Serve, Return & Third.', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add shot' })).toBeVisible();
});

test('mobile playback options and measured Menu tap are visible', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/');

  await page.locator('summary[aria-label="Playback options"]').click();
  const camera = page.locator('select[aria-label="Camera"]');
  await expect(camera).toBeVisible();
  for (const preset of ['overhead', 'sideline', 'behind-green', 'behind-orange']) {
    await camera.selectOption(preset);
    await expect(camera).toHaveValue(preset);
  }

  const menu = page.locator('summary[aria-label="Menu"]');
  const box = await menu.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('button', { name: 'Save As' })).toBeVisible();
  await context.close();
});
