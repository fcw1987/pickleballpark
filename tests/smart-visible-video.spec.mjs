import { expect, test } from '@playwright/test';
import { automaticRepairScenario } from './fixtures/smart-coach-scenarios.mjs';
import { expectBuilderAddComplete } from './helpers/builder-navigation.mjs';

test.use({ video: 'on' });

test('ordinary phone workflow records Add, Random, then visible Coach repair', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/index.html?smart-visible-video=1');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);

  const chaptersBefore = await page.locator('.builder-chapter-list [data-action="chapter"]').count();
  await page.getByRole('button', { name: 'Add shot', exact: true }).click();
  await expectBuilderAddComplete(page, chaptersBefore + 1);
  await expect(page.locator('.builder-chapter-list [data-action="chapter"]')).toHaveCount(chaptersBefore + 1);

  await page.getByLabel('Menu', { exact: true }).click();
  await page.getByRole('button', { name: 'Random Rally', exact: true }).click();
  const random = page.getByRole('dialog', { name: 'Random rally' });
  await random.getByLabel('Number of hits').fill('7');
  await random.getByLabel('Random seed').fill('707');
  await random.getByRole('button', { name: 'Create rally', exact: true }).click();
  await expect(random).toBeHidden({ timeout: 30000 });

  // This is a prearranged visible-import fixture so the clip can show a
  // deterministic Coach repair after the ordinary Random journey.
  const repairFixture = await automaticRepairScenario();
  await page.getByLabel('Menu', { exact: true }).click();
  await page.getByLabel('Manage plays', { exact: true }).click();
  await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
  const importer = page.getByRole('dialog', { name: 'Import or export play' });
  await importer.getByLabel('JSON backup').fill(JSON.stringify(repairFixture));
  await importer.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await expect(importer).toBeHidden();
  await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
  const picker = page.locator('.builder-family-picker');
  if (!(await picker.evaluate(element => element.open))) await page.locator('.builder-family-summary').click();
  await page.locator('.builder-family-option').filter({ hasText: 'Return' }).click();
  await expect(page.getByRole('button', { name: 'Fix for me', exact: true })).toBeVisible();
  await page.screenshot({ path: 'release-results/smart-visible/phone-390-video-repair-before.png', fullPage: true });
  await page.getByRole('button', { name: 'Fix for me', exact: true }).click();
  await page.waitForTimeout(500);
});
