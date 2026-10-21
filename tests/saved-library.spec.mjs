import { test, expect } from '@playwright/test';
import { settleBuilderStartup, openPlayFileMenu } from './helpers/builder-navigation.mjs';

const key = 'pickleballpark-builder-v1';
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.goto('/'); await settleBuilderStartup(page);
  await page.evaluate(() => playBuilder.switchView('2d'));
});
async function fillLibrary(page) {
  await page.evaluate(() => {
    for (let i = 0; i < 50; i++) playBuilder.store.save({ ...structuredClone(playBuilder.document), id: `saved-${i}`, title: `Saved ${i}` });
    playBuilder.libraryDirty = true; playBuilder.render();
  });
}

test('more than fifty untouched lessons and New Play previews consume no saved slots', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const ids = new Set();
    for (let i = 0; i < 30; i++) {
      await playBuilder.action('template', 'third-shot-drop'); ids.add(playBuilder.document.id);
      await playBuilder.action('new'); ids.add(playBuilder.document.id);
    }
    const before = playBuilder.store.list();
    await playBuilder.action('title', playBuilder.document.title);
    await playBuilder.action('undo'); await playBuilder.action('redo');
    const afterNoop = playBuilder.store.list();
    await playBuilder.action('title', 'My first authored play');
    return { ids: ids.size, before, afterNoop, after: playBuilder.store.list(), current: playBuilder.store.loadLast(), error: playBuilder.saveError };
  });
  expect(result.ids).toBe(60); expect(result.before).toEqual([]); expect(result.afterNoop).toEqual([]);
  expect(result.after).toHaveLength(1); expect(result.current.title).toBe('My first authored play'); expect(result.error).toBe(null);
  await page.reload(); await settleBuilderStartup(page);
  expect(await page.evaluate(() => playBuilder.document)).toEqual(result.current);
});

test('a full library still opens saved plays and deleting the current saved copy stays transient', async ({ page }) => {
  await fillLibrary(page);
  const result = await page.evaluate(async () => {
    await playBuilder.action('template', 'third-shot-drop'); await playBuilder.action('new');
    await playBuilder.action('retrySave');
    const full = { error: playBuilder.saveError, dirty: playBuilder.hasUnsavedChanges };
    const opened = await playBuilder.action('open', 'saved-7');
    const current = JSON.stringify(playBuilder.document);
    const deleted = await playBuilder.action('deletePlay', 'saved-7');
    const afterDelete = { source: JSON.stringify(playBuilder.document), dirty: playBuilder.hasUnsavedChanges, error: playBuilder.saveError, count: playBuilder.store.list().length };
    await playBuilder.action('new');
    const afterNew = playBuilder.store.list().length;
    await playBuilder.action('title', 'Recovered slot');
    return { full, opened, current, deleted, afterDelete, afterNew, saved: playBuilder.store.list(), last: playBuilder.store.loadLast() };
  });
  expect(result.full).toMatchObject({ dirty: false, error: { libraryFull: true, conflict: false } });
  expect(result.opened.ok).toBe(true); expect(result.deleted).toMatchObject({ ok: true, deleted: true });
  expect(result.afterDelete).toEqual({ source: result.current, dirty: false, error: null, count: 49 });
  expect(result.afterNew).toBe(49); expect(result.saved).toHaveLength(50); expect(result.last.title).toBe('Recovered slot');
  expect(result.saved.some(item => item.id === 'saved-7')).toBe(false);
});

test('dirty full-library work survives blocked Open while My Plays deletion and Retry recover it', async ({ page }) => {
  await fillLibrary(page);
  await page.evaluate(async () => { await playBuilder.action('template', 'third-shot-drop'); await playBuilder.action('title', 'Keep my unsaved lesson'); });
  const source = await page.evaluate(() => JSON.stringify(playBuilder.document));
  expect(await page.evaluate(() => playBuilder.saveError.libraryFull)).toBe(true);
  await openPlayFileMenu(page); await page.getByRole('button', { name: 'My Plays', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'My Plays', exact: true });
  await expect(library.locator('.builder-saved-play-row')).toHaveCount(50);
  await library.getByRole('button', { name: 'Saved 0', exact: true }).click();
  await expect(library).toBeVisible(); await expect(library.locator('.builder-library-status')).toContainText('Keep this unsaved work first');
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(source);
  await library.getByRole('button', { name: 'Delete Saved 0', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete saved play', exact: true }).getByRole('button', { name: 'Delete saved play', exact: true }).click();
  await expect(library.locator('.builder-saved-play-row')).toHaveCount(49);
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(source);
  await library.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => playBuilder.action('retrySave'));
  expect(await page.evaluate(() => playBuilder.saveError)).toBe(null);
  const saved = await page.evaluate(() => playBuilder.store.loadLast()); expect(JSON.stringify(saved)).toBe(source);
  expect(await page.evaluate(() => playBuilder.store.list().length)).toBe(50);
  expect((await page.evaluate(() => playBuilder.action('open', 'saved-1'))).ok).toBe(true);
  expect(await page.evaluate(id => playBuilder.store.open(id), saved.id)).toEqual(saved);
});

test('full-library Save As, import and Random fail before replacing current work or saved bytes', async ({ page }) => {
  await fillLibrary(page);
  const result = await page.evaluate(async () => {
    await playBuilder.action('open', 'saved-0');
    const source = JSON.stringify(playBuilder.document), history = JSON.stringify(playBuilder.history), bytes = localStorage.getItem('pickleballpark-builder-v1');
    const results = [];
    for (const [action, value] of [['saveAs'], ['import', source], ['randomRally', { count: 3, seed: 123 }]]) {
      results.push({ response: await playBuilder.action(action, value), source: JSON.stringify(playBuilder.document), history: JSON.stringify(playBuilder.history), bytes: localStorage.getItem('pickleballpark-builder-v1') });
    }
    await playBuilder.action('deletePlay', 'saved-49');
    const recovered = await playBuilder.action('saveAs');
    return { source, history, bytes, results, recovered, current: playBuilder.document, originals: playBuilder.store.list().filter(d => d.id.startsWith('saved-')), count: playBuilder.store.list().length };
  });
  for (const item of result.results) {
    expect(item.response.ok).toBe(false); expect(item.response.error).toContain('limited to 50');
    expect(item.source).toBe(result.source); expect(item.history).toBe(result.history); expect(item.bytes).toBe(result.bytes);
  }
  expect(result.recovered.ok).toBe(true); expect(result.current.id).not.toBe('saved-0'); expect(result.count).toBe(50); expect(result.originals).toHaveLength(49);
});

test('quota failures retain copies, imports, generation, deletion and dirty current work for retry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await playBuilder.action('title', 'Saved original');
    const source = JSON.stringify(playBuilder.document), history = JSON.stringify(playBuilder.history), bytes = localStorage.getItem('pickleballpark-builder-v1');
    const storage = playBuilder.store.storage;
    playBuilder.store.storage = { getItem: storage.getItem.bind(storage), setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); } };
    const results = [];
    for (const [action, value] of [['saveAs'], ['import', source], ['randomRally', { count: 3, seed: 123 }], ['deletePlay', playBuilder.document.id]]) {
      results.push({ response: await playBuilder.action(action, value), source: JSON.stringify(playBuilder.document), history: JSON.stringify(playBuilder.history), bytes: localStorage.getItem('pickleballpark-builder-v1') });
    }
    await playBuilder.action('title', 'Dirty work retained'); const dirty = JSON.stringify(playBuilder.document);
    const blocked = [];
    for (const [action, value] of [['new'], ['template', 'third-shot-drop'], ['open', playBuilder.document.id], ['import', source], ['randomRally', { count: 3, seed: 123 }]]) blocked.push({ response: await playBuilder.action(action, value), source: JSON.stringify(playBuilder.document) });
    playBuilder.store.storage = storage; await playBuilder.action('retrySave');
    return { source, history, bytes, results, dirty, blocked, saved: JSON.stringify(playBuilder.store.loadLast()), error: playBuilder.saveError };
  });
  for (const item of result.results) {
    expect(item.response.ok).toBe(false); expect(item.source).toBe(result.source); expect(item.history).toBe(result.history); expect(item.bytes).toBe(result.bytes);
  }
  for (const item of result.blocked) { expect(item.response.ok).toBe(false); expect(item.source).toBe(result.dirty); }
  expect(result.saved).toBe(result.dirty); expect(result.error).toBe(null);
});

test('explicit saves, matching-ID imports and Random retain previously authored plays', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await playBuilder.action('title', 'Original authored'); const original = structuredClone(playBuilder.document);
    await playBuilder.action('saveAs'); await playBuilder.action('title', 'Second authored'); const copy = structuredClone(playBuilder.document);
    await playBuilder.action('import', JSON.stringify({ ...original, title: 'Imported separately' })); const imported = structuredClone(playBuilder.document);
    const generated = await playBuilder.action('randomRally', { count: 3, seed: 123 });
    return { original, copy, imported, generated, current: playBuilder.document, valid: playBuilder.compiled.validShotCount, library: JSON.parse(localStorage.getItem('pickleballpark-builder-v1')).drafts };
  });
  expect(result.generated.ok).toBe(true); expect(result.current.shots).toHaveLength(3); expect(result.valid).toBe(3);
  expect(new Set([result.original.id, result.copy.id, result.imported.id, result.current.id]).size).toBe(4);
  expect(result.library).toHaveLength(4);
  for (const doc of [result.original, result.copy, result.imported, result.current]) expect(result.library.find(saved => saved.id === doc.id)).toEqual(doc);
  await page.reload(); await settleBuilderStartup(page); expect(await page.evaluate(() => playBuilder.document)).toEqual(result.current);
});

test('Random from an untouched lesson saves only the intentional generated result', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await playBuilder.action('template', 'third-shot-drop'); const lesson = playBuilder.document.id;
    const response = await playBuilder.action('randomRally', { count: 3, seed: 123 });
    return { lesson, response, current: playBuilder.document.id, library: playBuilder.store.list() };
  });
  expect(result.response.ok).toBe(true); expect(result.library).toEqual([{ id: result.current, title: expect.any(String) }]); expect(result.current).not.toBe(result.lesson);
});

test('a never-opened My Plays row cannot delete another tab’s newer saved content after list refresh', async ({ page, context }) => {
  const initial = await page.evaluate(async () => {
    const { DraftStore } = await import('./builder-storage.js');
    const { validateDocument } = await import('./play-document.js');
    const writer = new DraftStore({ validate: validateDocument });
    writer.save({ ...structuredClone(playBuilder.document), id: 'listed-only', title: 'Listed old play' });
    playBuilder.libraryDirty = true; playBuilder.render();
    return { source: JSON.stringify(playBuilder.document), observed: playBuilder.store.observedDrafts.has('listed-only') };
  });
  expect(initial.observed).toBe(false);
  await openPlayFileMenu(page); await page.getByRole('button', { name: 'My Plays', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'My Plays', exact: true });
  await expect(library.getByRole('button', { name: 'Delete Listed old play', exact: true })).toBeVisible();
  const other = await context.newPage(); await other.goto('/'); await settleBuilderStartup(other);
  await other.evaluate(() => playBuilder.action('title', 'Newer play from another tab'));
  const newer = await other.evaluate(() => JSON.stringify(playBuilder.document));
  await expect.poll(() => page.evaluate(() => playBuilder.library.find(item => item.id === 'listed-only')?.title)).toBe('Newer play from another tab');
  // The modal still shows its original row. Its confirmation must use that
  // revision, rather than the newly refreshed background library entry.
  await library.getByRole('button', { name: 'Delete Listed old play', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete saved play', exact: true }).getByRole('button', { name: 'Delete saved play', exact: true }).click();
  await expect(library.locator('.builder-library-status')).toContainText('changed in another tab');
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(initial.source);
  expect(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('pickleballpark-builder-v1')).drafts.find(doc => doc.id === 'listed-only')))).toBe(newer);
  await other.close();
});
