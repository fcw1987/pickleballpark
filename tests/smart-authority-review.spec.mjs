import { expect, test } from '@playwright/test';

const start = async page => {
  await page.goto('/index.html?smart-authority-review=1');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.evaluate(() => localStorage.removeItem('pickleballpark-builder-v1'));
  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
};

const savedPair = async page => page.evaluate(async () => {
  await playBuilder.action('title', 'Authority A');
  const a = playBuilder.document.id;
  await playBuilder.action('saveAs');
  await playBuilder.action('title', 'Authority B');
  const b = playBuilder.document.id;
  if (playBuilder.view !== '3d') await playBuilder.switchView('3d');
  await playBuilder.setWorkspace('planner');
  return { a, b };
});

const gateBuilderRestore = async page => page.evaluate(() => {
  let release;
  let entered;
  const gate = new Promise(resolve => { release = resolve; });
  const enteredGate = new Promise(resolve => { entered = resolve; });
  playBuilder.switchView = async view => {
    if (view === '3d') {
      entered();
      await gate;
    }
  };
  window.__qaRestoreGate = { release, enteredGate };
});

test('a later Return to planner wins over an older Open during delayed restore', async ({ page }) => {
  await start(page);
  const ids = await savedPair(page);
  await gateBuilderRestore(page);

  const result = await page.evaluate(async ({ a }) => {
    const older = playBuilder.action('open', a);
    await window.__qaRestoreGate.enteredGate;
    const newer = await playBuilder.action('workspace', 'planner');
    const afterNewer = { workspace: playBuilder.workspace, id: playBuilder.document.id, result: newer };
    window.__qaRestoreGate.release();
    const olderResult = await older;
    return { afterNewer, final: { workspace: playBuilder.workspace, id: playBuilder.document.id }, olderResult };
  }, ids);

  expect(result.afterNewer).toMatchObject({ workspace: 'planner', id: expect.any(String) });
  expect(result.afterNewer.result).toBeUndefined();
  expect(result.final).toEqual(result.afterNewer);
  expect(result.olderResult).toMatchObject({ ok: false });
});

test('newer Open and edit still win over a delayed restore', async ({ page }) => {
  await start(page);
  const ids = await savedPair(page);
  await gateBuilderRestore(page);

  const result = await page.evaluate(async ({ a, b }) => {
    const older = playBuilder.action('open', a);
    await window.__qaRestoreGate.enteredGate;
    const newer = await playBuilder.action('open', b);
    await playBuilder.action('title', 'Newest authority');
    window.__qaRestoreGate.release();
    const olderResult = await older;
    return {
      newer,
      olderResult,
      final: { id: playBuilder.document.id, title: playBuilder.document.title },
      saved: playBuilder.store.open(playBuilder.document.id)?.title
    };
  }, ids);

  expect(result.newer).toMatchObject({ ok: true });
  expect(result.olderResult).toMatchObject({ ok: false });
  expect(result.final).toEqual({ id: ids.b, title: 'Newest authority' });
  expect(result.saved).toBe('Newest authority');
});
