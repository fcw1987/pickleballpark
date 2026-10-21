import { expect, test } from '@playwright/test';

async function open(page) {
  await page.addInitScript(() => localStorage.removeItem('pickleballpark-builder-v1'));
  await page.goto('/?pixel-game-input=1');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.evaluate(async () => {
    if (playBuilder.view !== '2d') await playBuilder.switchView('2d');
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Rally timeline' })).toBeVisible();
}

async function dragTimeline(page, from, to, { release = true } = {}) {
  const box = await page.getByRole('slider', { name: 'Rally timeline' }).boundingBox();
  await page.mouse.move(box.x + box.width * from, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to, box.y + box.height / 2, { steps: 5 });
  if (release) await page.mouse.up();
}

test('integrated scrub preserves playing intent and resumes from the sampled point', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => playBuilder.session.playing)).toBe(false);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => playBuilder.session.clock.elapsed)).toBeGreaterThan(.05);
  await dragTimeline(page, .2, .62, { release: false });
  const held = await page.evaluate(() => ({
    intent: playBuilder.session.playing,
    clock: playBuilder.session.clock.playing,
    scrub: playBuilder.session.scrub?.id,
    time: playBuilder.session.clock.elapsed,
    selected: playBuilder.selectedShotId,
    history: `${playBuilder.history.index}/${playBuilder.history.snapshots.length}`
  }));
  expect(held.intent).toBe(true);
  expect(held.clock).toBe(false);
  expect(held.scrub).toMatch(/^shot-timeline-/);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => playBuilder.session.clock.playing)).toBe(true);
  const resumedAt = await page.evaluate(() => playBuilder.session.clock.elapsed);
  await expect.poll(() => page.evaluate(() => playBuilder.session.clock.elapsed)).toBeGreaterThan(resumedAt);
  expect(await page.evaluate(() => ({ selected: playBuilder.selectedShotId, history: `${playBuilder.history.index}/${playBuilder.history.snapshots.length}` })))
    .toEqual({ selected: held.selected, history: held.history });
});

test('Pause during a scrub wins over release and resize cancellation stays safely paused', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await dragTimeline(page, .15, .55, { release: false });
  await page.evaluate(() => document.querySelector('[data-action="play-pause"]').click());
  await expect.poll(() => page.evaluate(() => playBuilder.session.playing)).toBe(false);
  const pausedAt = await page.evaluate(() => playBuilder.session.clock.elapsed);
  await page.mouse.up();
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => ({ intent: playBuilder.session.playing, clock: playBuilder.session.clock.playing, scrub: playBuilder.session.scrub, time: playBuilder.session.clock.elapsed })))
    .toEqual({ intent: false, clock: false, scrub: null, time: pausedAt });

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await dragTimeline(page, .35, .72, { release: false });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect.poll(() => page.evaluate(() => playBuilder.session.scrub)).toBeNull();
  expect(await page.evaluate(() => ({ intent: playBuilder.session.playing, clock: playBuilder.session.clock.playing })))
    .toEqual({ intent: false, clock: false });
  await page.mouse.up();
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => playBuilder.session.playing)).toBe(false);
});

test('explicit chapter selection preserves playback while Edit pauses the selected shot', async ({ page }) => {
  await open(page);
  const state = await page.evaluate(() => ({
    selected: playBuilder.selectedShotId,
    chapter: playBuilder.chapters[1],
    history: `${playBuilder.history.index}/${playBuilder.history.snapshots.length}`
  }));
  expect(state.chapter?.shotId).toBeTruthy();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('Choose shot chapter').click();
  await page.locator(`[data-action="chapter"][data-shot-id="${state.chapter.shotId}"]`).click();
  const jumped = await page.evaluate(() => ({ time: playBuilder.session.clock.elapsed, current: playBuilder.chapters.findLast(chapter => chapter.anchor <= playBuilder.session.clock.elapsed)?.shotId, intent: playBuilder.session.playing, selected: playBuilder.selectedShotId, history: `${playBuilder.history.index}/${playBuilder.history.snapshots.length}` }));
  expect(jumped.time).toBeGreaterThanOrEqual(state.chapter.anchor);
  expect(jumped.time).toBeLessThan(state.chapter.anchor + .5);
  expect(jumped).toMatchObject({ current: state.chapter.shotId, intent: true, selected: state.chapter.shotId, history: state.history });

  const picker = page.getByLabel('Choose shot chapter');
  if (!(await picker.locator('..').evaluate(node => node.open))) await picker.click();
  await page.getByRole('button', { name: 'Customize Shot 2', exact: true }).click();
  expect(await page.evaluate(() => ({ intent: playBuilder.session.playing, selected: playBuilder.selectedShotId, history: `${playBuilder.history.index}/${playBuilder.history.snapshots.length}` })))
    .toEqual({ intent: false, selected: state.chapter.shotId, history: state.history });
});
