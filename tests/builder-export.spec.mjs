import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openPlayFileMenu, settleBuilderStartup } from './helpers/builder-navigation.mjs';

test('export downloads a named compatible JSON backup and keeps a copy in the dialog', async ({ page }) => {
  await page.goto('/index.html');
  await settleBuilderStartup(page);
  await page.evaluate(() => { playBuilder.document.title = 'Serve / return: practice?'; });
  const expected = await page.evaluate(() => JSON.parse(playBuilder.store.exportJSON(playBuilder.document)));
  await openPlayFileMenu(page);
  await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import or export play' });
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export current play', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('PickleballPark-Serve - return- practice.json');
  const text = await readFile(await download.path(), 'utf8');
  expect(JSON.parse(text)).toEqual(expected);
  await expect(dialog.locator('textarea')).toHaveValue(text);
  const imported = await page.evaluate(text => playBuilder.store.importJSON(text), text);
  expect(imported).toEqual(expected);
});


test('byte-full library recovery deletes a saved play before retrying the preserved draft', async ({ page }) => {
  await page.goto('/index.html');
  await settleBuilderStartup(page);
  const original = await page.evaluate(async () => {
    const { STORAGE_KEY, MAX_LIBRARY_BYTES, MAX_JSON_BYTES } = await import('/builder-storage.js');
    const current = structuredClone(playBuilder.document);
    current.title = 'Keep this draft';
    const backups = Array.from({ length: 5 }, (_, index) => ({ ...structuredClone(current), id: `backup-${index}`, title: `Saved backup ${index}`, extension: [] }));
    const envelope = { schemaVersion: 1, drafts: [...backups, current], lastId: current.id };
    const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
    const size = () => bytes(envelope);
    for (const backup of backups) {
      while (MAX_LIBRARY_BYTES - size() > 0 && MAX_JSON_BYTES - bytes(backup) > 4) {
        backup.extension.push('');
        const count = Math.min(32768, MAX_LIBRARY_BYTES - size(), MAX_JSON_BYTES - bytes(backup));
        if (count < 0) throw Error('Capacity fixture overflowed');
        backup.extension[backup.extension.length - 1] = 'x'.repeat(count);
      }
    }
    if (backups.some(backup => bytes(backup) > MAX_JSON_BYTES)) throw Error('Every fixture play must remain within the document byte cap');
    if (size() !== MAX_LIBRARY_BYTES) throw Error('Fixture must fill the exact byte cap');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    playBuilder.loadDocument(playBuilder.store.open(current.id), { persist: false, saved: true });
    playBuilder.document.title += ' with unsaved changes';
    playBuilder.save(); playBuilder.render();
    return { document: structuredClone(playBuilder.document), stored: localStorage.getItem(STORAGE_KEY) };
  });
  const error = page.locator('.builder-save-error');
  await expect(error).toContainText('2 MiB');
  await expect(error.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
  await expect(error.getByRole('button', { name: 'Save a copy', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pickleballpark-builder-v1'))).toBe(original.stored);
  await error.getByRole('button', { name: 'Manage saved plays', exact: true }).click();
  await page.getByRole('dialog', { name: 'My Plays', exact: true }).getByRole('button', { name: 'Delete Saved backup 0', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete saved play', exact: true }).getByRole('button', { name: 'Delete saved play', exact: true }).click();
  await page.getByRole('dialog', { name: 'My Plays', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(error).toContainText('Space was freed');
  expect(await page.evaluate(() => playBuilder.document)).toEqual(original.document);
  await error.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(error).toHaveCount(0);
  expect(await page.evaluate(() => playBuilder.store.open(playBuilder.document.id))).toEqual(original.document);
  expect(await page.evaluate(() => playBuilder.store.list().map(play => play.title))).toEqual(expect.arrayContaining([original.document.title, 'Saved backup 1', 'Saved backup 2', 'Saved backup 3', 'Saved backup 4']));
  expect(await page.evaluate(() => playBuilder.store.list())).toHaveLength(5);
});
