import { expect, test } from '@playwright/test';

const start = async page => {
  await page.goto('/index.html?qa-persistence=1');
  await page.waitForFunction(() => window.playBuilder && !window.playBuilder.busy);
  await page.evaluate(() => localStorage.removeItem('pickleballpark-builder-v1'));
  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !window.playBuilder.busy);
};

async function savedPair(page) {
  return page.evaluate(async () => {
    const builder = playBuilder;
    await builder.action('title', 'Authority A');
    const a = builder.document.id;
    await builder.action('saveAs');
    await builder.action('title', 'Authority B');
    const b = builder.document.id;
    if (builder.view !== '3d') await builder.switchView('3d');
    await builder.setWorkspace('planner');
    return { a, b };
  });
}

async function gateBuilderRestore(page) {
  await page.evaluate(() => {
    const builder = playBuilder;
    let release;
    let entered;
    const gate = new Promise(resolve => { release = resolve; });
    const enteredGate = new Promise(resolve => { entered = resolve; });
    builder.switchView = async view => {
      if (view === '3d') {
        entered();
        await gate;
      }
    };
    window.__qaRestoreGate = { release, enteredGate };
  });
}

test('a later Open choice wins while an earlier Planner restore is pending', async ({ page }) => {
  await start(page);
  const ids = await savedPair(page);
  await gateBuilderRestore(page);

  const result = await page.evaluate(async ({ a, b }) => {
    const older = playBuilder.action('open', a);
    await window.__qaRestoreGate.enteredGate;
    const newer = await playBuilder.action('open', b);
    const afterNewer = { id: playBuilder.document.id, title: playBuilder.document.title, result: newer };
    window.__qaRestoreGate.release();
    const olderResult = await older;
    return { afterNewer, final: { id: playBuilder.document.id, title: playBuilder.document.title }, olderResult };
  }, ids);

  expect(result.afterNewer).toMatchObject({ id: ids.b, title: 'Authority B', result: { ok: true } });
  expect(result.final).toEqual({ id: ids.b, title: 'Authority B' });
  expect(result.olderResult).toMatchObject({ ok: false });
});

test('an edit and Save As stay authoritative over an older pending Open', async ({ page }) => {
  await start(page);
  const ids = await savedPair(page);
  await gateBuilderRestore(page);

  const result = await page.evaluate(async ({ a }) => {
    const older = playBuilder.action('open', a);
    await window.__qaRestoreGate.enteredGate;
    await playBuilder.action('title', 'Edited while restore was pending');
    await playBuilder.action('saveAs');
    const latest = { id: playBuilder.document.id, title: playBuilder.document.title };
    window.__qaRestoreGate.release();
    const olderResult = await older;
    const savedLatest = playBuilder.store.open(latest.id);
    return {
      latest,
      final: { id: playBuilder.document.id, title: playBuilder.document.title },
      savedLatest: savedLatest && { id: savedLatest.id, title: savedLatest.title },
      olderResult
    };
  }, ids);

  expect(result.latest.title).toBe('Edited while restore was pending — copy');
  expect(result.final).toEqual(result.latest);
  expect(result.savedLatest).toEqual(result.latest);
  expect(result.olderResult).toMatchObject({ ok: false });
});

test('a rejected newer Import keeps the current source and cancels an older pending Open', async ({ page }) => {
  await start(page);
  const ids = await savedPair(page);
  await gateBuilderRestore(page);

  const result = await page.evaluate(async ({ a }) => {
    const older = playBuilder.action('open', a);
    await window.__qaRestoreGate.enteredGate;
    const beforeImport = { id: playBuilder.document.id, title: playBuilder.document.title };
    const importResult = await playBuilder.action('import', '{malformed');
    const afterImport = { id: playBuilder.document.id, title: playBuilder.document.title };
    window.__qaRestoreGate.release();
    const olderResult = await older;
    return {
      beforeImport,
      importResult,
      afterImport,
      final: { id: playBuilder.document.id, title: playBuilder.document.title },
      olderResult
    };
  }, ids);

  expect(result.importResult).toMatchObject({ ok: false });
  expect(result.afterImport).toEqual(result.beforeImport);
  expect(result.final).toEqual(result.beforeImport);
  expect(result.olderResult).toMatchObject({ ok: false });
});

test('a pending Use Planner cannot rewrite a play opened during 3D restoration', async ({ page }) => {
  await start(page);
  const ids = await savedPair(page);
  await page.evaluate(() => {
    playBuilder.board.updateTokenPosition(playBuilder.board.tokens.player1, 8.75, 19.5);
    playBuilder.ui.confirmPlanner = async () => true;
  });
  await gateBuilderRestore(page);

  const result = await page.evaluate(async ({ a }) => {
    const plannerAction = playBuilder.action('usePlanner');
    await window.__qaRestoreGate.enteredGate;
    const opened = await playBuilder.action('open', a);
    const afterOpen = structuredClone(playBuilder.document);
    window.__qaRestoreGate.release();
    const plannerResult = await plannerAction;
    return {
      opened,
      plannerResult,
      afterOpen,
      final: structuredClone(playBuilder.document)
    };
  }, ids);

  expect(result.opened).toMatchObject({ ok: true });
  expect(result.final).toEqual(result.afterOpen);
  expect(result.plannerResult).toMatchObject({ ok: false });
});

