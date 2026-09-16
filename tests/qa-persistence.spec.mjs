import { expect, test } from '@playwright/test';
import { openPlayFileMenu } from './helpers/builder-navigation.mjs';

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

test('two never-saved starter tabs cannot silently overwrite the same draft identity', async ({ context, page }) => {
  await start(page);
  const other = await context.newPage();
  await other.goto('/index.html?qa-persistence=fresh-second-tab');
  await other.waitForFunction(() => window.playBuilder && !window.playBuilder.busy);

  const initialIds = await Promise.all([
    page.evaluate(() => playBuilder.document.id),
    other.evaluate(() => playBuilder.document.id)
  ]);
  await page.evaluate(() => playBuilder.action('title', 'Fresh tab first version'));
  await other.evaluate(() => playBuilder.action('title', 'Fresh tab second version'));
  const conflict = await other.evaluate(() => Boolean(playBuilder.saveError?.conflict));
  if (conflict) await other.evaluate(() => playBuilder.action('saveAs'));

  const library = await page.evaluate(() => playBuilder.store.list());
  expect(library.map(item => item.title)).toContain('Fresh tab first version');
  expect(library.some(item => item.title.startsWith('Fresh tab second version'))).toBe(true);
  expect(new Set(library.map(item => item.id)).size).toBeGreaterThanOrEqual(2);
  expect(initialIds[0] !== initialIds[1] || conflict).toBe(true);
});

test('bounded random source edits, undo, and redo agree with a snapshot model', async ({ page }) => {
  await start(page);

  const result = await page.evaluate(async () => {
    const builder = playBuilder;
    if (builder.view !== '2d') await builder.switchView('2d');
    let randomState = 0x5eed1234;
    const random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 0x100000000;
    };
    const choose = values => values[Math.floor(random() * values.length)];
    const snapshots = [JSON.stringify(builder.document)];
    let index = 0;
    let mutations = 0;
    let undos = 0;
    let redos = 0;

    const commitModel = () => {
      snapshots.splice(index + 1);
      snapshots.push(JSON.stringify(builder.document));
      if (snapshots.length > 101) snapshots.shift();
      index = snapshots.length - 1;
      mutations += 1;
    };
    const mutate = async step => {
      const shot = builder.selectedShot || builder.document.shots[0];
      const operations = [
        () => builder.action('title', `History ${step}`),
        () => builder.action('editShot', { field: 'target.x', value: Math.round(random() * 200) / 10 }),
        () => builder.action('editShot', { field: 'target.y', value: Math.round(random() * 440) / 10 }),
        () => builder.action('flight', { arc: choose(['low', 'medium', 'high']), pace: choose(['soft', 'medium', 'firm']) }),
        () => builder.action('editShot', { field: 'contactStyle', value: choose(['auto', 'forehand', 'backhand', 'short-hop']) }),
        () => builder.action('editMovement', { player: shot.hitter, field: 'intent', value: choose(['hold', 'advance', 'recover', 'manual']) }),
        () => builder.action('handedness', { id: choose(['player1', 'player2', 'player3', 'player4']), value: choose(['left', 'right']) }),
        () => builder.action('assistance', { field: choose(['autoShading', 'showGuides']), value: random() > 0.5 }),
        () => builder.action('assistance', { field: 'team', value: choose(['both', 'green', 'orange']) }),
        () => builder.action('opening', choose(['serve', 'midrally'])),
        () => builder.action('ending', choose(['stop', 'winner', 'fault'])),
        () => builder.action('intentionalFault', random() > 0.5),
        () => builder.document.shots.length < 12 ? builder.action('addShot') : builder.action('moveShot', { id: shot.id, delta: -1 }),
        () => builder.document.shots.length < 12 ? builder.action('duplicateShot') : builder.action('deleteShot'),
        () => builder.document.shots.length > 1 ? builder.action('moveShot', { id: shot.id, delta: choose([-1, 1]) }) : builder.action('addShot'),
        () => builder.document.shots.length > 2 ? builder.action('deleteShot') : builder.action('addShot')
      ];
      const response = await choose(operations)();
      if (response?.ok === false) throw new Error(`mutation ${step} failed: ${response.error}`);
      commitModel();
    };

    for (let step = 0; step < 140; step += 1) {
      const roll = random();
      if (roll < 0.2 && index > 0) {
        await builder.action('undo');
        index -= 1;
        undos += 1;
      } else if (roll < 0.32 && index < snapshots.length - 1) {
        await builder.action('redo');
        index += 1;
        redos += 1;
      } else {
        await mutate(step);
      }
      const actual = JSON.stringify(builder.document);
      if (actual !== snapshots[index]) throw new Error(`history diverged at step ${step}`);
      const saved = builder.store.open(builder.document.id);
      if (JSON.stringify(saved) !== actual) throw new Error(`autosave diverged at step ${step}`);
    }

    while (index > 0) {
      await builder.action('undo');
      index -= 1;
      if (JSON.stringify(builder.document) !== snapshots[index]) throw new Error(`undo replay diverged at ${index}`);
    }
    while (index < snapshots.length - 1) {
      await builder.action('redo');
      index += 1;
      if (JSON.stringify(builder.document) !== snapshots[index]) throw new Error(`redo replay diverged at ${index}`);
    }
    return { mutations, undos, redos, retainedSnapshots: snapshots.length, final: snapshots[index] };
  });

  expect(result.mutations).toBeGreaterThan(90);
  expect(result.undos).toBeGreaterThan(10);
  expect(result.redos).toBeGreaterThan(0);
  expect(result.retainedSnapshots).toBeLessThanOrEqual(101);
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(result.final);
});

test('every authored mutation family is one exact undo and redo transition', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => { if (playBuilder.view !== '2d') await playBuilder.switchView('2d'); });

  const cases = [
    ['title', 'Mutation title'],
    ['flight', { arc: 'low', pace: 'firm' }],
    ['editShot', { field: 'family', value: 'lob' }],
    ['editMovement', { player: 'player1', field: 'target', value: { x: 8.5, y: 12.25 } }],
    ['handedness', { id: 'player1', value: 'left' }],
    ['assistance', { field: 'showGuides', value: true }],
    ['assistance', { field: 'autoShading', value: true }],
    ['addShot'],
    ['duplicateShot'],
    ['moveShot', { delta: -1, idIndex: 1 }],
    ['deleteShot']
  ];

  for (const [action, supplied] of cases) {
    const transition = await page.evaluate(async ({ action, supplied }) => {
      const value = action === 'moveShot'
        ? { delta: supplied.delta, id: playBuilder.document.shots[supplied.idIndex].id }
        : supplied;
      const before = JSON.stringify(playBuilder.document);
      const response = await playBuilder.action(action, value);
      const after = JSON.stringify(playBuilder.document);
      await playBuilder.action('undo');
      const undone = JSON.stringify(playBuilder.document);
      await playBuilder.action('redo');
      const redone = JSON.stringify(playBuilder.document);
      return { before, after, undone, redone, response };
    }, { action, supplied });
    expect(transition.response).toMatchObject({ ok: true });
    expect(transition.after, `${action} must change source`).not.toBe(transition.before);
    expect(transition.undone, `${action} undo`).toBe(transition.before);
    expect(transition.redone, `${action} redo`).toBe(transition.after);
  }

  await page.evaluate(() => playBuilder.action('selectShot', playBuilder.document.shots[0].id));
  const drag = await page.evaluate(() => {
    const start = playBuilder.courtTools.project(playBuilder.selectedShot.target);
    return { start, end: { x: start.x + 36, y: start.y + 22 }, before: JSON.stringify(playBuilder.document) };
  });
  await page.mouse.move(drag.start.x, drag.start.y);
  await page.mouse.down();
  await page.mouse.move(drag.end.x, drag.end.y, { steps: 5 });
  await page.mouse.up();
  const dragged = await page.evaluate(() => JSON.stringify(playBuilder.document));
  expect(dragged).not.toBe(drag.before);
  await page.evaluate(() => playBuilder.action('undo'));
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(drag.before);
  await page.evaluate(() => playBuilder.action('redo'));
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(dragged);
});

test('a 64-shot draft and retained waypoints survive save, reload, export, and import as a copy', async ({ page }) => {
  await start(page);

  const lifecycle = await page.evaluate(async () => {
    const source = structuredClone(playBuilder.document);
    while (source.shots.length < 64) {
      const shot = structuredClone(source.shots.at(-1));
      shot.id = `qa-shot-${source.shots.length + 1}`;
      shot.target = { x: (source.shots.length * 7) % 21, y: (source.shots.length * 11) % 45 };
      source.shots.push(shot);
    }
    source.title = 'Sixty-four exact recipes';
    source.shots[61].movement = {
      intent: 'manual', pinned: true, target: { x: 8.25, y: 12.75 },
      waypoints: [{ x: 15.5, y: 5.25 }, { x: 11.125, y: 9.875 }]
    };
    const imported = await playBuilder.action('import', JSON.stringify(source));
    if (imported?.ok === false) throw new Error(imported.error);
    const first = structuredClone(playBuilder.document);
    const exported = playBuilder.store.exportJSON(first);
    const saved = playBuilder.store.open(first.id);
    const copied = await playBuilder.action('import', exported);
    if (copied?.ok === false) throw new Error(copied.error);
    const second = structuredClone(playBuilder.document);
    return { first, saved, second, exported };
  });

  expect(lifecycle.first.shots).toHaveLength(64);
  expect(lifecycle.saved).toEqual(lifecycle.first);
  expect(JSON.parse(lifecycle.exported)).toEqual(lifecycle.first);
  expect(lifecycle.second.id).not.toBe(lifecycle.first.id);
  expect({ ...lifecycle.second, id: lifecycle.first.id }).toEqual(lifecycle.first);
  expect(lifecycle.second.shots[61].movement.waypoints).toEqual([
    { x: 15.5, y: 5.25 }, { x: 11.125, y: 9.875 }
  ]);

  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !window.playBuilder.busy);
  expect(await page.evaluate(() => playBuilder.document)).toEqual(lifecycle.second);
});

test('malformed, oversized, and unknown-version imports retain the last valid source', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async () => {
    await playBuilder.action('title', 'Keep this valid source');
    const before = JSON.stringify(playBuilder.document);
    const future = structuredClone(playBuilder.document);
    future.schemaVersion = 2;
    const attempts = [];
    for (const raw of ['{malformed', JSON.stringify(future), `{"oversized":"${'x'.repeat(512 * 1024)}"}`]) {
      attempts.push(await playBuilder.action('import', raw));
      if (JSON.stringify(playBuilder.document) !== before) throw new Error('rejected import changed source');
    }
    return { attempts, before, saved: JSON.stringify(playBuilder.store.open(playBuilder.document.id)) };
  });

  expect(result.attempts.every(attempt => attempt.ok === false)).toBe(true);
  expect(result.attempts.map(attempt => attempt.error).join('\n')).toMatch(/malformed/);
  expect(result.attempts.map(attempt => attempt.error).join('\n')).toMatch(/schemaVersion|must be 1/);
  expect(result.attempts.map(attempt => attempt.error).join('\n')).toMatch(/512 KiB/);
  expect(result.saved).toBe(result.before);
});

test('the last rapid title input commits synchronously when the page closes', async ({ context, page }) => {
  await start(page);
  await openPlayFileMenu(page);
  const title = page.getByLabel('Play title');
  await title.fill('Rapid one');
  await title.fill('Rapid two');
  await title.fill('Rapid final value');
  await page.close();
  expect(page.isClosed()).toBe(true);
  expect(context.pages()).not.toContain(page);

  const reopened = await context.newPage();
  await reopened.goto('/index.html?qa-persistence=reopen');
  await reopened.waitForFunction(() => window.playBuilder && !window.playBuilder.busy);
  expect(await reopened.evaluate(() => playBuilder.document.title)).toBe('Rapid final value');
});

test('out-of-order and dialog-closed file reads cannot replace newer import text', async ({ page }) => {
  await start(page);
  await openPlayFileMenu(page);
  await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
  await page.evaluate(() => {
    window.__qaFileReads = [];
    File.prototype.text = function() {
      return new Promise((resolve, reject) => window.__qaFileReads.push({ name: this.name, resolve, reject }));
    };
  });
  const file = page.getByLabel('Choose JSON file');
  await file.setInputFiles({ name: 'older.json', mimeType: 'application/json', buffer: Buffer.from('{"choice":"older"}') });
  await file.setInputFiles({ name: 'newer.json', mimeType: 'application/json', buffer: Buffer.from('{"choice":"newer"}') });
  await expect.poll(() => page.evaluate(() => window.__qaFileReads.length)).toBe(2);
  await page.evaluate(() => window.__qaFileReads[1].resolve('{"choice":"newer"}'));
  await expect(page.getByLabel('JSON backup')).toHaveValue('{"choice":"newer"}');
  await page.evaluate(() => window.__qaFileReads[0].resolve('{"choice":"older"}'));
  await page.waitForTimeout(0);
  await expect(page.getByLabel('JSON backup')).toHaveValue('{"choice":"newer"}');

  await file.setInputFiles({ name: 'closed.json', mimeType: 'application/json', buffer: Buffer.from('{"choice":"closed"}') });
  await expect.poll(() => page.evaluate(() => window.__qaFileReads.length)).toBe(3);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => window.__qaFileReads[2].resolve('{"choice":"closed"}'));
  await openPlayFileMenu(page);
  await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
  await expect(page.getByLabel('JSON backup')).toHaveValue('');
});
