import { expect, test } from '@playwright/test';

async function openBuilder(page) {
  await page.addInitScript(() => localStorage.removeItem('pickleballpark-builder-v1'));
  await page.goto('/?gauntlet-review2=1');
  await page.waitForFunction(() => window.playBuilder);
  await page.evaluate(async () => {
    if (playBuilder.view !== '2d') await playBuilder.switchView('2d');
  });
  await page.waitForFunction(() => !playBuilder.busy && playBuilder.view === '2d');
}

test('Help on a later paused chapter keeps the visible target and edit authority on that chapter', async ({ page }) => {
  await openBuilder(page);
  const source = await page.evaluate(() => {
    const builder = playBuilder;
    const first = builder.document.shots[0];
    const second = builder.document.shots[1];
    return {
      firstId: first.id,
      secondId: second.id,
      firstTarget: structuredClone(first.target),
      secondTarget: structuredClone(second.target)
    };
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('Choose shot chapter', { exact: true }).click();
  await page.locator(`[data-action="chapter"][data-shot-id="${source.secondId}"]`).click();
  expect(await page.evaluate(() => ({
    playing: playBuilder.session.playing,
    selected: playBuilder.selectedShotId,
    current: playBuilder.chapters.findLast(item => item.anchor <= playBuilder.session.clock.elapsed)?.shotId
  }))).toEqual({ playing: true, selected: source.firstId, current: source.secondId });
  await page.getByLabel('Menu', { exact: true }).click();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Help & Information' })).toBeVisible();

  const before = await page.evaluate(() => {
    const builder = playBuilder;
    return {
      selected: builder.selectedShotId,
      current: builder.chapters.findLast(item => item.anchor <= builder.session.clock.elapsed)?.shotId,
      ring: builder.courtTools.project(builder.selectedShot.target)
    };
  });

  expect(before.current).toBe(source.secondId);

  await page.getByRole('button', { name: 'Close help and information' }).click();
  await expect(page.getByRole('dialog', { name: 'Help & Information' })).toBeHidden();
  await page.mouse.move(before.ring.x, before.ring.y);
  await page.mouse.down();
  await page.mouse.move(before.ring.x + 32, before.ring.y + 12);
  await page.mouse.up();

  const after = await page.evaluate(() => ({
    first: structuredClone(playBuilder.document.shots[0].target),
    second: structuredClone(playBuilder.document.shots[1].target),
    selected: playBuilder.selectedShotId,
    history: playBuilder.history.index
  }));
  expect(after.first).toEqual(source.firstTarget);
  expect(after.second).not.toEqual(source.secondTarget);
  expect(after.selected).toBe(source.secondId);
  expect(after.history).toBe(1);
});

test('[model probe] Help preserves an explicitly open editor while playback chapter remains separate', async ({ page }) => {
  await openBuilder(page);
  const ids = await page.evaluate(() => playBuilder.document.shots.slice(0, 2).map(shot => shot.id));
  await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
  await expect(page.locator('.builder-inspector')).not.toHaveClass(/builder-inspector-collapsed/);

  await page.evaluate(secondId => {
    const chapter = playBuilder.chapters.find(item => item.shotId === secondId);
    playBuilder.board.plays.timelineAction('seek', chapter.anchor);
  }, ids[1]);
  await page.getByLabel('Menu', { exact: true }).click();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Help & Information' })).toBeVisible();

  expect(await page.evaluate(() => ({
    selected: playBuilder.selectedShotId,
    current: playBuilder.chapters.findLast(item => item.anchor <= playBuilder.session.clock.elapsed)?.shotId,
    history: playBuilder.history.index
  }))).toEqual({ selected: ids[0], current: ids[1], history: 0 });
});

test('the always-visible save state reports a pending title edit honestly', async ({ page }) => {
  await openBuilder(page);
  await page.getByLabel('Menu', { exact: true }).click();
  await page.getByLabel('Play file', { exact: true }).click();
  await page.getByLabel('Play title', { exact: true }).fill('Saved status baseline');
  await page.getByLabel('Play title', { exact: true }).press('Tab');
  await expect(page.locator('[data-ui="save-pill"]')).toHaveText('Saved on this device');

  await page.getByLabel('Play title', { exact: true }).fill('Pending status edit');
  await expect(page.locator('.builder-save-status')).toHaveText('Editing · not saved yet');
  await expect(page.locator('[data-ui="save-pill"]')).toHaveText('Editing');
});
