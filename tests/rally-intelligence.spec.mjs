import { test, expect } from '@playwright/test';
import { settleBuilderStartup, openIntentTab } from './helpers/builder-navigation.mjs';

test.use({ serviceWorkers: 'block' });

test('seven-hit seed 2 uses the designated returner through playback, shading and reload', async ({ page }, testInfo) => {
  await page.goto('/'); await settleBuilderStartup(page);
  const generated = await page.evaluate(() => playBuilder.action('randomRally', { count: 7, seed: 2 }));
  expect(generated.ok).toBe(true);
  const source = await page.evaluate(() => structuredClone(playBuilder.document));
  expect(source.shots[1].hitter).toBe('player3');
  expect(source.service.receiver).toBe('player3');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => playBuilder.session.playing)).toBe(true);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.evaluate(async () => {
    await playBuilder.action('assistance', { field: 'autoShading', value: true });
    await playBuilder.action('assistance', { field: 'showGuides', value: true });
    const contact = playBuilder.compiled.timeline.events.filter(e => e.type === 'contact')[1];
    playBuilder.seek(contact.time);
  });
  expect(await page.evaluate(() => playBuilder.compiled.timeline.events.filter(e => e.type === 'contact')[1].actor)).toBe('player3');
  await page.screenshot({ path: testInfo.outputPath('seed-2-designated-returner.png'), fullPage: true });
  await page.reload(); await settleBuilderStartup(page);
  expect(await page.evaluate(() => playBuilder.document.service)).toEqual(source.service);
  expect(await page.evaluate(() => playBuilder.document.shots)).toEqual(source.shots);
  expect(await page.evaluate(() => playBuilder.compiled.validShotCount)).toBe(7);
});

test('serve role and court edits use the existing UI and Undo without rewriting the return', async ({ page }) => {
  await page.goto('/'); await settleBuilderStartup(page);
  await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
  await openIntentTab(page, 'Players');
  const before = await page.evaluate(() => structuredClone(playBuilder.document));
  await page.getByLabel('Receiver', { exact: true }).selectOption('player4');
  expect(await page.evaluate(() => playBuilder.document.service.receiver)).toBe('player4');
  expect(await page.evaluate(() => playBuilder.document.shots[1].hitter)).toBe('player3');
  expect(await page.evaluate(() => playBuilder.compiled.findings.some(f => /designated receiver is player4/.test(f.message)))).toBe(true);
  await page.evaluate(() => playBuilder.action('undo'));
  expect(await page.evaluate(() => playBuilder.document)).toEqual(before);
  await page.getByLabel('Serving court', { exact: true }).selectOption('right');
  expect(await page.evaluate(() => playBuilder.document.service.court)).toBe('right');
  expect(await page.evaluate(() => playBuilder.compiled.validShotCount)).toBe(0);
  await page.evaluate(() => playBuilder.action('undo'));
  expect(await page.evaluate(() => playBuilder.document)).toEqual(before);
});

test('legacy imported court keeps its diagonal until an explicit court edit and Undo restores the exact source', async ({ page }) => {
  await page.goto('/'); await settleBuilderStartup(page);
  const before = await page.evaluate(async () => {
    const doc = structuredClone(playBuilder.document);
    doc.id = 'legacy-service-court'; doc.service.court = 'right'; delete doc.service.courtConvention;
    doc.shots[2].playerMovement = { player4: { intent: 'manual', pinned: true, target: { x: 15, y: 30 } } };
    await playBuilder.action('import', JSON.stringify(doc));
    return JSON.stringify(playBuilder.document);
  });
  expect(await page.evaluate(() => playBuilder.compiled.validShotCount)).toBe(3);
  await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
  await openIntentTab(page, 'Players');
  await expect(page.getByLabel('Serving court', { exact: true })).toHaveValue('left');
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(before);
  await page.getByLabel('Serving court', { exact: true }).selectOption('left');
  expect(await page.evaluate(() => playBuilder.document.service.courtConvention)).toBe('server-perspective-v1');
  expect(await page.evaluate(() => playBuilder.document.service.court)).toBe('left');
  expect(await page.evaluate(() => playBuilder.compiled.validShotCount)).toBe(3);
  expect(await page.evaluate(() => playBuilder.document.shots)).toEqual(JSON.parse(before).shots);
  expect(await page.evaluate(() => playBuilder.document.initialLayout)).toEqual(JSON.parse(before).initialLayout);
  await page.getByLabel('Serving court', { exact: true }).selectOption('right');
  expect(await page.evaluate(() => playBuilder.document.service.courtConvention)).toBe('server-perspective-v1');
  expect(await page.evaluate(() => playBuilder.compiled.validShotCount)).toBe(0);
  await page.evaluate(() => playBuilder.action('undo'));
  expect(await page.evaluate(() => playBuilder.document.service.court)).toBe('left');
  expect(await page.evaluate(() => playBuilder.compiled.validShotCount)).toBe(3);
  await page.evaluate(() => playBuilder.action('undo'));
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(before);
  expect(await page.evaluate(() => playBuilder.compiled.validShotCount)).toBe(3);
});

test('wrong-returner import stays authored and shows an actionable identity warning', async ({ page }) => {
  await page.goto('/'); await settleBuilderStartup(page);
  const before = await page.evaluate(async () => {
    const doc = structuredClone(playBuilder.document);
    doc.id = 'wrong-returner-import'; doc.shots[0].receiver = 'auto'; doc.shots[1].hitter = 'player4';
    await playBuilder.action('import', JSON.stringify(doc)); return structuredClone(playBuilder.document);
  });
  expect(await page.evaluate(() => playBuilder.document)).toEqual(before);
  await page.getByRole('button', { name: 'Shot 2 needs attention', exact: true }).click();
  await expect(page.locator('.builder-finding-row[data-kind="rule"]')).toContainText('designated receiver');
  await page.getByLabel('Hitter', { exact: true }).selectOption('player3');
  expect(await page.evaluate(() => playBuilder.compiled.validShotCount)).toBe(3);
  await page.evaluate(() => playBuilder.action('undo'));
  expect(await page.evaluate(() => playBuilder.document)).toEqual(before);
});

test('volley contact settings explain the NVZ history limits without changing the lesson', async ({ page }) => {
  await page.goto('/'); await settleBuilderStartup(page);
  await page.evaluate(async () => {
    await playBuilder.action('template', 'volley-block');
    await playBuilder.action('selectShot', playBuilder.document.shots.find(shot => ['volley', 'reset', 'overhead'].includes(shot.family)).id);
  });
  const before = await page.evaluate(() => structuredClone(playBuilder.document));
  await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
  await openIntentTab(page, 'Players');
  await expect(page.locator('#builder-nvz-model-limits')).toBeVisible();
  await expect(page.locator('#builder-nvz-model-limits')).toContainText('full foot and equipment contact history');
  await expect(page.locator('#builder-nvz-model-limits')).toContainText('cannot certify non-volley-zone legality');
  expect(await page.evaluate(() => playBuilder.document)).toEqual(before);
});
