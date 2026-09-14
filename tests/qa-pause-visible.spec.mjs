import { expect, test } from '@playwright/test';

// BETA009: this spec intentionally targets only the visible builder transport.
// Run against a running candidate with PORT/PICKLEBALLPARK_TEST_URL set.

const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'compact-390', width: 390, height: 844 },
  { name: 'compact-320', width: 320, height: 700 }
];

const visiblePlay = page => page.locator('.builder-play-button:visible');
const visibleView = (page, label) => page.locator('.builder-view-button:visible').filter({ hasText: label });

async function openBuilder(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/index.html?workspace=builder');
  await expect(page.locator('.builder-ui')).toBeVisible();
  await expect(visiblePlay(page)).toHaveAttribute('aria-label', 'Play');
}

async function playAndHoldPause(page, frames = 4, pointerType = 'mouse') {
  const play = visiblePlay(page);
  await play.click();
  await expect(play).toHaveAttribute('aria-label', 'Pause');
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  const pause = visiblePlay(page);
  const label = pause.locator('.pixel-play-label:visible');
  const box = await label.boundingBox();
  expect(box, 'visible Pause control must have a hit target').not.toBeNull();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  if (pointerType === 'touch') await page.touchscreen.tap(point.x, point.y);
  else {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.evaluate(async count => {
      for (let i = 0; i < count; i += 1) await new Promise(resolve => requestAnimationFrame(resolve));
    }, frames);
    await page.mouse.up();
  }
  await page.waitForTimeout(60);
  return {
    label: await visiblePlay(page).getAttribute('aria-label'),
    pressed: await visiblePlay(page).getAttribute('aria-pressed'),
    timeline: await page.locator('.builder-transport input[type="range"]:visible').inputValue()
  };
}

async function openChapterMenuDuringPlay(page) {
  const summary = page.locator('.builder-chapter-menu:visible > summary');
  await expect(summary, 'the visible builder must expose its chapter menu').toHaveCount(1);
  await summary.click();
  await expect(page.locator('.builder-chapter-menu:visible')).toHaveAttribute('open', '');
  return { visibleButtons: await page.locator('.builder-chapter-menu:visible [data-action="chapter"]').count() };
}

async function expectPausedStable(page, timeline) {
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i += 1) await new Promise(resolve => requestAnimationFrame(resolve));
  });
  await page.waitForTimeout(100);
  const current = Number(await page.locator('.builder-transport input[type="range"]:visible').inputValue());
  expect(current).toBeCloseTo(Number(timeline), 6);
  await expect(visiblePlay(page)).toHaveAttribute('aria-label', 'Play');
  await expect(visiblePlay(page)).toHaveAttribute('aria-pressed', 'false');
}

test.describe('BETA009 visible pause input', () => {
  for (const viewport of viewports) {
    test(`desktop/compact visible long press pauses at ${viewport.name}`, async ({ page }) => {
      await openBuilder(page, viewport);
      const result = await playAndHoldPause(page, 4, 'mouse');
      expect(result.label).toBe('Play');
      expect(result.pressed).toBe('false');
      const pausedAt = Number(result.timeline);
      expect(pausedAt).toBeGreaterThan(0);
      await expectPausedStable(page, result.timeline);
      await visiblePlay(page).focus();
      await expect(visiblePlay(page)).toBeFocused();
      await visiblePlay(page).click();
      await page.waitForTimeout(80);
      expect(Number(await page.locator('.builder-transport input[type="range"]:visible').inputValue())).toBeGreaterThan(pausedAt);
    });
  }

  test('2D and 3D builder views expose one working visible Pause control', async ({ page }) => {
    await openBuilder(page, viewports[0]);
    for (const label of ['2D', '3D']) {
      await visibleView(page, label).click();
      await expect(visibleView(page, label)).toHaveClass(/is-selected/);
      const result = await playAndHoldPause(page, 3, 'mouse');
      expect(result.label, `${label} visible transport`).toBe('Play');
      await expect(visiblePlay(page)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('chapter menu can open during playback and Pause still remains reachable', async ({ page }) => {
    await openBuilder(page, viewports[0]);
    await visiblePlay(page).click();
    await expect(visiblePlay(page)).toHaveAttribute('aria-label', 'Pause');
    const menu = await openChapterMenuDuringPlay(page);
    expect(menu.visibleButtons).toBeGreaterThan(0);
    await expect(visiblePlay(page)).toHaveAttribute('aria-label', 'Pause');
    await visiblePlay(page).click();
    await expect(visiblePlay(page)).toHaveAttribute('aria-label', 'Play');
  });

});

test.describe('BETA009 touch affordance', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('a real touch tap pauses the visible transport at phone width', async ({ page }) => {
    await openBuilder(page, viewports[1]);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const result = await playAndHoldPause(page, 2, 'touch');
    expect(result.label).toBe('Play');
    expect(result.pressed).toBe('false');
  });
});
