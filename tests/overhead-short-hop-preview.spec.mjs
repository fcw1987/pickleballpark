import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openIntentTab, settleBuilderStartup } from './helpers/builder-navigation.mjs';

const source = JSON.parse(readFileSync(new URL('./fixtures/overhead-short-hop-document.json', import.meta.url), 'utf8'));
test.use({ serviceWorkers: 'block' });

async function openFixture(page, document) {
  await page.goto('/');
  await settleBuilderStartup(page);
  await page.evaluate(document => playBuilder.action('import', JSON.stringify(document)), document);
}

async function reviewWarning(page) {
  await page.getByRole('button', { name: 'Shot 2 needs attention', exact: true }).click();
  const warning = page.locator('.builder-finding-row[data-kind="feasibility"]');
  await expect(warning).toContainText('7 ft contact');
  await expect(warning).toContainText('low contact height');
  await expect(warning).toContainText('Choose Automatic, Forehand, or Backhand');
  await expect(warning).toBeVisible();
}

test('legacy import and reload visibly warn while preserving authored Short hop and preview', async ({ page }) => {
  await openFixture(page, source);
  await reviewWarning(page);
  expect(await page.evaluate(() => playBuilder.document.shots)).toEqual(source.shots);
  expect(await page.evaluate(() => playBuilder.compiled.validShotCount)).toBe(2);
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => playBuilder.session.playing)).toBe(true);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.reload();
  await settleBuilderStartup(page);
  await reviewWarning(page);
  expect(await page.evaluate(() => playBuilder.document.shots)).toEqual(source.shots);
});

test('ordinary Contact style editing warns immediately and clears reversibly', async ({ page }) => {
  const document = structuredClone(source);
  document.shots[1].contactStyle = 'auto';
  await openFixture(page, document);
  await expect(page.locator('.builder-issue-chip')).toHaveCount(0);
  await page.getByLabel('Choose shot chapter', { exact: true }).click();
  await page.getByRole('button', { name: 'Customize Shot 2', exact: true }).click();
  await openIntentTab(page, 'Players');
  await page.getByLabel('Contact style', { exact: true }).selectOption('short-hop');
  await reviewWarning(page);
  await openIntentTab(page, 'Players');
  await page.getByLabel('Contact style', { exact: true }).selectOption('auto');
  await expect(page.locator('.builder-issue-chip')).toHaveCount(0);
  await expect(page.locator('.builder-finding-row')).toHaveCount(0);
  await page.evaluate(() => playBuilder.action('undo'));
  await reviewWarning(page);
  expect(await page.evaluate(() => playBuilder.document.shots[1].contactStyle)).toBe('short-hop');
  await page.evaluate(() => playBuilder.action('redo'));
  await expect(page.locator('.builder-issue-chip')).toHaveCount(0);
  expect(await page.evaluate(() => playBuilder.document.shots[1].contactStyle)).toBe('auto');
});
