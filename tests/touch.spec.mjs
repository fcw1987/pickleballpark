import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

async function openApp(page) {
  await page.goto('/index.html?workspace=planner&touch-e2e=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard))).toBe(true);
}

async function touchPoint(locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dispatchTouch(locator, type, point, touches = true) {
  const touch = { identifier: 1, clientX: point.x, clientY: point.y };
  await locator.dispatchEvent(type, {
    touches: touches ? [touch] : [],
    targetTouches: touches ? [touch] : [],
    changedTouches: [touch]
  });
}

async function tap(page, locator) {
  const point = await touchPoint(locator);
  await page.touchscreen.tap(point.x, point.y);
}

async function drag(locator, deltaX, deltaY) {
  const start = await touchPoint(locator);
  await dispatchTouch(locator, 'touchstart', start);
  for (let step = 1; step <= 5; step++) {
    await dispatchTouch(locator, 'touchmove', {
      x: start.x + deltaX * step / 5,
      y: start.y + deltaY * step / 5
    });
  }
  await dispatchTouch(locator, 'touchend', {
    x: start.x + deltaX,
    y: start.y + deltaY
  }, false);
}

test('touch double tap toggles handedness twice while single tap does nothing', async ({ page }) => {
  await openApp(page);
  const player = page.locator('#player1');

  await tap(page, player);
  await expect(player).toHaveAttribute('data-handedness', 'right');

  await tap(page, player);
  await expect(player).toHaveAttribute('data-handedness', 'left');
  await expect(player).toHaveAttribute('href', 'assets/players/green-left-handed.png');
  await page.waitForTimeout(400);
  await expect(player).toHaveAttribute('data-handedness', 'left');

  await page.waitForTimeout(400);
  await tap(page, player);
  await tap(page, player);
  await expect(player).toHaveAttribute('data-handedness', 'right');
  await expect(player).toHaveAttribute('href', 'assets/players/green-right-handed.png');
});

test('touch taps on different players do not combine', async ({ page }) => {
  await openApp(page);
  await tap(page, page.locator('#player1'));
  await tap(page, page.locator('#player2'));

  await expect(page.locator('#player1')).toHaveAttribute('data-handedness', 'right');
  await expect(page.locator('#player2')).toHaveAttribute('data-handedness', 'right');
});

test('touch drag moves the player without toggling handedness', async ({ page }) => {
  await openApp(page);
  const player = page.locator('#player1');
  const hitTarget = page.locator('#player1-touch');
  const before = await page.evaluate(() => window.pickleboard.getTokenPositions().player1);

  await drag(player, 45, 55);

  await expect(player).toHaveAttribute('data-handedness', 'right');
  const after = await page.evaluate(() => {
    const player = document.querySelector('#player1');
    const hitTarget = document.querySelector('#player1-touch');
    return {
      position: window.pickleboard.getTokenPositions().player1,
      visualAnchor: { x: Number(player.dataset.cx), y: Number(player.dataset.cy) },
      hitTarget: { x: Number(hitTarget.getAttribute('cx')), y: Number(hitTarget.getAttribute('cy')) }
    };
  });
  expect(after.position).not.toEqual(before);
  expect(after.visualAnchor).toEqual(after.position);
  expect(after.hitTarget).toEqual(after.position);

  await tap(page, hitTarget);
  await expect(player).toHaveAttribute('data-handedness', 'right');
  await page.waitForTimeout(400);
});
