import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { settleBuilderStartup } from './helpers/builder-navigation.mjs';

test.use({ serviceWorkers: 'block' });

test('fifty real long plays remain readable and a fifty-first edited draft shows actionable My Plays-full guidance', async ({ page }) => {
  const long = JSON.parse(await readFile(new URL('./fixtures/game-mode/long-smart-v3.json', import.meta.url), 'utf8'));
  expect(long.shots).toHaveLength(99);
  await page.goto('/'); await settleBuilderStartup(page);
  await page.evaluate(() => playBuilder.switchView('2d'));
  await page.evaluate(document => {
    for (let i = 0; i < 50; i++) playBuilder.store.save({ ...structuredClone(document), id: `long-${i}`, title: `Long rally ${i}` });
  }, long);
  await page.reload(); await settleBuilderStartup(page);
  await page.evaluate(() => playBuilder.switchView('2d'));
  const proof = await page.evaluate(async () => {
    const originals = playBuilder.store.list().map(row => playBuilder.store.open(row.id));
    playBuilder.loadDocument({ ...playBuilder.store.open('long-0'), id: 'long-preview', title: 'Unsaved long preview' }, { persist: false });
    const expected = structuredClone(playBuilder.document); expected.title = 'Keep this fifty-first long draft';
    const bytes = localStorage.getItem('pickleballpark-builder-v1');
    await playBuilder.action('title', expected.title);
    return { originalCounts: originals.map(doc => doc.shots.length), bytes: new TextEncoder().encode(bytes).byteLength,
      compiled: playBuilder.compiled.validShotCount, libraryFull: playBuilder.saveError?.libraryFull,
      sourcePreserved: JSON.stringify(expected) === JSON.stringify(playBuilder.document), bytesUnchanged: bytes === localStorage.getItem('pickleballpark-builder-v1') };
  });
  expect(proof.originalCounts).toEqual(Array(50).fill(99));
  expect(proof.bytes).toBeGreaterThan(512 * 1024); expect(proof.bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(proof).toMatchObject({ compiled: 99, libraryFull: true, sourcePreserved: true, bytesUnchanged: true });
  const error = page.locator('.builder-save-error');
  await expect(error).toContainText('My Plays is full');
  await expect(error.getByRole('button', { name: 'Manage saved plays', exact: true })).toBeVisible();
  await expect(error.getByRole('button', { name: 'Export this draft', exact: true })).toBeVisible();
  await expect(error.getByRole('button', { name: 'Save a copy', exact: true })).toHaveCount(0);
  const recovered = await page.evaluate(async () => {
    await playBuilder.action('deletePlay', 'long-49');
    await playBuilder.action('retrySave');
    return { ok: playBuilder.saveError === null, saved: playBuilder.store.list().length, original: playBuilder.store.open('long-0').shots.length, copy: playBuilder.store.open('long-preview').shots.length };
  });
  expect(recovered).toEqual({ ok: true, saved: 50, original: 99, copy: 99 });
});
