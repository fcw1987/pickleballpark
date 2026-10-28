import { expect, test } from '@playwright/test';
import { openPlayFileMenu, settleBuilderStartup, switchCourtView } from './helpers/builder-navigation.mjs';

const APP = '/index.html?pixel-game-review=1';

async function openBuilder(page) {
  await page.goto(APP);
  await settleBuilderStartup(page);
}

const rect = (page, selector) => page.locator(selector).evaluate(node => {
  const box = node.getBoundingClientRect();
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
});

test('the resting pixel game keeps the court and one transport usable in both themes', async ({ browser }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 402, height: 874 }]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width === 402 ? 2 : 1 });
      const page = await context.newPage();
      await openBuilder(page);
      if (await page.locator('body').getAttribute('data-theme') !== theme) {
        await page.locator('.builder-main-menu > summary').click();
        await page.getByRole('button', { name: /Switch to (?:light|dark) appearance/, exact: false }).click();
      }
      await expect(page.locator('body')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('[data-action="play-pause"]')).toHaveCount(1);
      await expect(page.getByRole('slider', { name: 'Rally timeline' })).toHaveCount(1);
      await expect(page.locator('[data-action="previous"],[data-action="next"],[data-action="restart"],[data-action="loop"]')).toHaveCount(0);
      await expect(page.locator('.builder-inspector')).toHaveClass(/builder-inspector-collapsed/);

      const [court, inspector, transport] = await Promise.all([
        rect(page, '.builder-court-region'), rect(page, '.builder-inspector'), rect(page, '.builder-transport')
      ]);
      expect(court.width).toBeGreaterThan(viewport.width * .9);
      expect(court.height).toBeGreaterThan(viewport.height * (viewport.width === 402 ? .6 : .65));
      expect(inspector.height).toBeLessThanOrEqual(72);
      expect(inspector.width * inspector.height).toBeLessThan(court.width * court.height * .06);
      expect(transport.bottom).toBeLessThanOrEqual(viewport.height + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      expect(await page.getByRole('slider', { name: 'Rally timeline' }).evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      const topControls = await page.locator('.builder-topbar button,.builder-topbar summary').evaluateAll(nodes => nodes
        .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
        .map(node => { const box = node.getBoundingClientRect(); return { text: node.textContent.trim(), left: box.left, right: box.right }; }));
      for (const control of topControls) {
        expect(control.left, control.text).toBeGreaterThanOrEqual(-1);
        expect(control.right, control.text).toBeLessThanOrEqual(viewport.width + 1);
      }

      await testInfo.attach(`resting-${viewport.width}x${viewport.height}-${theme}`, {
        body: await page.screenshot(), contentType: 'image/png'
      });
      await context.close();
    }
  }
});

test('all 99 authored shots stay reachable without becoming 99 permanent labels', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await openBuilder(page);
  await page.evaluate(async () => {
    const source = structuredClone(playBuilder.document);
    while (source.shots.length < 99) {
      const shot = structuredClone(source.shots.at(-1));
      shot.id = `review-shot-${source.shots.length + 1}`;
      source.shots.push(shot);
    }
    await playBuilder.action('import', JSON.stringify(source));
  });
  await page.getByLabel('Choose shot chapter', { exact: true }).click();
  const list = page.locator('.builder-chapter-list');
  await expect(list.locator('.builder-chapter-row')).toHaveCount(99);
  await expect(list.getByRole('button', { name: /^Customize Shot / })).toHaveCount(99);
  await expect(page.getByRole('button', { name: 'Add shot', exact: true })).toBeDisabled();
  expect(await list.evaluate(node => node.scrollHeight)).toBeGreaterThan(await list.evaluate(node => node.clientHeight));
  expect((await rect(page, '.builder-chapter-list')).right).toBeLessThanOrEqual(402);
  await list.getByRole('button', { name: 'Customize Shot 99', exact: true }).scrollIntoViewIfNeeded();
  await list.getByRole('button', { name: 'Customize Shot 99', exact: true }).press('Enter');
  const selection = await page.evaluate(() => ({ selected: playBuilder.selectedShotId,
    current: document.querySelector('.shot-timeline-marker.is-current')?.dataset.shotId,
    first: playBuilder.chapters[0].shotId, playing: playBuilder.session.playing }));
  expect(selection).toMatchObject({ selected: 'review-shot-99', playing: false });
  expect(selection.current).toBe(selection.first);
  await expect(page.locator('.builder-inspector')).not.toHaveClass(/builder-inspector-collapsed/);
  await testInfo.attach('dense-99-shot-picker', { body: await page.screenshot(), contentType: 'image/png' });
});

test('normal-motion playback, Pause, chapter seek, and ready view switching share one sample', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await openBuilder(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => playBuilder.session.clock.elapsed)).toBeGreaterThan(.2);
  const range = page.locator('.builder-transport .shot-timeline-range');
  await expect.poll(() => range.inputValue().then(Number)).toBeGreaterThan(.2);
  const moving = await page.evaluate(() => ({ time: playBuilder.session.clock.elapsed,
    value: Number(document.querySelector('.builder-transport .shot-timeline-range').value), playing: playBuilder.session.playing }));
  expect(moving.time).toBeGreaterThan(.2);
  expect(moving.value).toBeGreaterThan(.2);
  expect(moving.playing).toBe(true);
  await testInfo.attach('phone-normal-motion', { body: await page.screenshot(), contentType: 'image/png' });

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const pausedSample = await page.evaluate(() => {
    const input = document.querySelector('.builder-transport .shot-timeline-range');
    return { time: playBuilder.session.clock.elapsed, value: Number(input.value),
      min: Number(input.min), step: input.step, playing: playBuilder.session.playing };
  });
  const paused = pausedSample.time;
  const step = pausedSample.step === 'any' ? 0 : Number(pausedSample.step || '1');
  const expectedValue = step ? pausedSample.min + Math.round((paused - pausedSample.min) / step) * step : paused;
  expect(pausedSample.playing).toBe(false);
  // Native range values serialize decimals; use the same eight-decimal stable
  // clock precision as the freeze and view checks, after step quantization.
  expect(pausedSample.value).toBeCloseTo(expectedValue, 8);
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => playBuilder.session.clock.elapsed)).toBeCloseTo(paused, 8);
  await page.getByLabel('Choose shot chapter', { exact: true }).click();
  await page.getByRole('button', { name: /Shot 2 ·/, exact: false }).first().click();
  const chapterTime = await page.evaluate(() => playBuilder.session.clock.elapsed);
  expect(chapterTime).toBeGreaterThan(paused);
  expect(await page.evaluate(() => playBuilder.session.playing)).toBe(false);
  const beforeView = await page.evaluate(() => playBuilder.session.clock.elapsed);
  const nextView = await page.evaluate(() => playBuilder.view === '3d' ? '2d' : '3d');
  await switchCourtView(page, nextView);
  expect(await page.evaluate(() => playBuilder.session.clock.elapsed)).toBeCloseTo(beforeView, 8);
});

test('keyboard authoring retains typed data and returns focus to a useful editing control', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await openBuilder(page);
  await page.locator('.builder-main-menu > summary').focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Manage plays', { exact: true }).click();
  const rename = page.getByRole('button', { name: 'Rename play', exact: true });
  await rename.focus();
  await page.keyboard.press('Enter');
  const title = page.getByLabel('Play title', { exact: true });
  await expect(title).toBeFocused();
  await title.fill('Keyboard persistence sentinel');
  await page.evaluate(() => {
    for (let frame = 0; frame < 20; frame += 1) playBuilder.scheduleRender();
  });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('Keyboard persistence sentinel');
  await title.press('Tab');
  await expect.poll(() => page.evaluate(() => playBuilder.store.loadLast()?.title)).toBe('Keyboard persistence sentinel');

  await page.getByLabel('Choose shot chapter', { exact: true }).focus();
  await page.keyboard.press('Enter');
  const edit = page.getByRole('button', { name: 'Customize Shot 2', exact: true });
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.builder-inspector')).not.toHaveClass(/builder-inspector-collapsed/);
  await expect(page.getByRole('button',{name:'Close editor',exact:true})).toBeFocused();

  await page.reload();
  await settleBuilderStartup(page);
  await openPlayFileMenu(page);
  await expect(page.getByLabel('Play title', { exact: true })).toHaveValue('Keyboard persistence sentinel');
});

test('validation, save failure, and delayed 3D completion leave an honest paused draft', async ({ page }) => {
  await openBuilder(page);
  await page.evaluate(async () => {
    await playBuilder.switchView('2d');
    const source = structuredClone(playBuilder.document);
    source.shots[2].movement = { intent: 'manual', pinned: false, target: { x: 8, y: 13 },
      waypoints: [{ x: 13, y: 8 }, { x: 10, y: 11 }] };
    await playBuilder.action('import', JSON.stringify(source));
  });
  await expect(page.getByRole('button', { name: 'Preview destination only', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  expect(await page.evaluate(() => ({ playing: playBuilder.session.playing, time: playBuilder.session.clock.elapsed })))
    .toEqual({ playing: false, time: 0 });

  await page.evaluate(() => {
    const storage = playBuilder.store.storage;
    window.__restoreReviewStorage = () => { playBuilder.store.storage = storage; };
    playBuilder.store.storage = {
      getItem: storage.getItem.bind(storage), removeItem: storage.removeItem.bind(storage),
      setItem: () => { throw new DOMException('Storage quota reached', 'QuotaExceededError'); }
    };
  });
  await openPlayFileMenu(page);
  await page.getByRole('button', { name: 'Rename play', exact: true }).click();
  await page.getByLabel('Play title', { exact: true }).fill('Unsaved review sentinel');
  await page.getByLabel('Play title', { exact: true }).press('Tab');
  await expect(page.getByText('Could not save this draft.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  expect(await page.evaluate(() => playBuilder.document.title)).toBe('Unsaved review sentinel');

  const asyncResult = await page.evaluate(async () => {
    window.__restoreReviewStorage();
    await playBuilder.action('acknowledgeWaypoints');
    // Initialize the retained legacy viewer explicitly; primary startup is Canvas2D.
    await playBuilder.switchView('3d');
    const viewer = playBuilder.board.threeD;
    viewer.exit({ preservePlayback: true });
    playBuilder.view = '2d';
    playBuilder.play();
    const before = playBuilder.session.clock.elapsed;
    const realSuspend = playBuilder.session.suspend.bind(playBuilder.session);
    playBuilder.session.suspend = (...args) => {
      const token = realSuspend(...args);
      queueMicrotask(() => playBuilder.pause());
      return token;
    };
    await playBuilder.switchView('3d');
    const afterLoad = playBuilder.session.clock.elapsed;
    await new Promise(resolve => setTimeout(resolve, 80));
    return { before, afterLoad, afterWait: playBuilder.session.clock.elapsed,
      intended: playBuilder.session.playing, scheduled: playBuilder.session.clock.playing,
      view: playBuilder.view, busy: playBuilder.busy };
  });
  expect(asyncResult).toMatchObject({ intended: false, scheduled: false, view: '3d', busy: false });
  expect(asyncResult.afterLoad).toBeCloseTo(asyncResult.afterWait, 8);
});
