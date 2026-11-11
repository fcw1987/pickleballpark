import { test, expect } from '@playwright/test';
import { pixelAuthoringCases } from './fixtures/pixel-authoring-cases.mjs';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';
import { openIntentTab, settleBuilderStartup } from './helpers/builder-navigation.mjs';

test.use({ serviceWorkers: 'block' });

async function inspectFlight(page, document) {
  await page.goto('/');
  await settleBuilderStartup(page);
  await page.evaluate(document => playBuilder.action('import', JSON.stringify(document)), document);
  await page.getByLabel('Choose shot chapter', { exact: true }).click();
  await page.getByRole('button', { name: 'Customize Shot 1', exact: true }).click();
  await openIntentTab(page, 'Flight');
}

test('legacy overhead flight explains its illustrative loft without changing source, path or rule findings', async ({ page }) => {
  const document = pixelAuthoringCases().find(item => item.id === 'pixel-overhead-forehand-right-rally').document;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await inspectFlight(page, document);
  const note = page.locator('#builder-legacy-overhead-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('may rise after contact');
  await expect(note).toContainText('not a physical downward-smash simulation');
  for (const name of ['Flight', 'Arc', 'Pace']) await expect(page.getByRole('combobox', { name, exact: true })).toHaveAttribute('aria-describedby', 'builder-legacy-overhead-note');
  const actual = await page.evaluate(() => ({
    shots: structuredClone(playBuilder.document.shots),
    findings: structuredClone(playBuilder.compiled.findings),
    valid: playBuilder.compiled.validShotCount,
    heights: [0, .01, .1].map(t => playBuilder.compiled.timeline.segments[0].trajectory.sample(t).y)
  }));
  expect(actual.shots).toEqual(document.shots);
  expect(actual.findings).toEqual([]);
  expect(actual.valid).toBe(1);
  expect(actual.heights[0]).toBeCloseTo(2.1336, 9);
  expect(actual.heights[1]).toBeCloseTo(2.2029801652892558, 9);
  expect(actual.heights[2]).toBeCloseTo(2.648234710743802, 9);
  await expect(page.locator('.builder-issue-chip')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('physical Model2 overhead does not inherit the legacy illustrative-flight note', async ({ page }) => {
  const document = model2Document({ shots: [model2Shot({ family: 'overhead', intent: 'overhead',
    pace: 'medium', target: { x: 12, y: 32 }, narration: { label: 'Overhead', why: 'Strike downward from the high contact.' } })] });
  await inspectFlight(page, document);
  await expect(page.locator('#builder-legacy-overhead-note')).toHaveCount(0);
  const actual = await page.evaluate(() => ({
    shots: structuredClone(playBuilder.document.shots),
    valid: playBuilder.compiled.validShotCount,
    heights: [0, .01].map(t => playBuilder.compiled.timeline.segments[0].trajectory.sample(t).y)
  }));
  expect(actual.shots).toEqual(document.shots);
  expect(actual.valid).toBe(1);
  expect(actual.heights[1]).toBeLessThan(actual.heights[0]);
});
