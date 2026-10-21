import { expect, test } from '@playwright/test';

const evidenceDir = 'release-results/smart-visible';

async function freshBuilder(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/index.html?smart-visible-random=1');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
}

async function openRandom(page) {
  await page.getByLabel('Menu', { exact: true }).click();
  await page.getByRole('button', { name: 'Random Rally', exact: true }).click();
  return page.getByRole('dialog', { name: 'Random rally' });
}

test.describe('smart rally visible random generation', () => {
  test.setTimeout(120000);

  test('shows progress while building and completes the visible 99-hit journey', async ({ page }) => {
    await freshBuilder(page);
    const dialog = await openRandom(page);
    await dialog.getByLabel('Number of hits').fill('99');
    await dialog.getByLabel('Random seed').fill('9901');
    await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
    const status = dialog.locator('.builder-proposal-status');
    await expect(status).toContainText('Building rally', { timeout: 10000 });
    await page.screenshot({ path: `${evidenceDir}/phone-390-random-99-progress.png`, fullPage: true });
    await expect(dialog).toBeHidden({ timeout: 110000 });
    await expect(page.locator('.builder-chapter-list [data-action="chapter"]')).toHaveCount(99);
    await page.screenshot({ path: `${evidenceDir}/phone-390-random-99-complete.png`, fullPage: true });
  });

  test('keeps the current play safe when Cancel is chosen during generation', async ({ page }) => {
    await freshBuilder(page);
    const before = await page.locator('.builder-chapter-list [data-action="chapter"]').count();
    const dialog = await openRandom(page);
    await dialog.getByLabel('Number of hits').fill('99');
    await dialog.getByLabel('Random seed').fill('9902');
    await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
    await expect(dialog.locator('.builder-proposal-status')).toContainText('Building rally', { timeout: 10000 });
    await page.screenshot({ path: `${evidenceDir}/phone-390-random-cancel-progress.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('.builder-chapter-list [data-action="chapter"]')).toHaveCount(before);
  });
});
