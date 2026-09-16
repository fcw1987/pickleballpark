import { expect, test } from '@playwright/test';

async function openApp(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/index.html?workspace=planner&accessibility=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.plays))).toBe(true);
}

test('menu and help expose modal state, contain focus, and restore their triggers', async ({ page }) => {
  await openApp(page);

  await page.locator('#menuToggle').click();
  await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#menuOverlay')).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#menuOverlay')).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#menuClose')).toBeFocused();

  await page.locator('#themeToggle').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#menuClose')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#themeToggle')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menuOverlay')).toBeHidden();
  await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#menuToggle')).toBeFocused();

  await page.locator('#infoToggle').click();
  await expect(page.locator('#infoToggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#infoModal')).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#infoModal')).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#infoClose')).toBeFocused();
  const infoFocusables = page.locator('#infoModal button:visible, #infoModal summary:visible, #infoModal [tabindex="0"]:visible');
  const infoFocusableCount = await infoFocusables.count();
  expect(infoFocusableCount).toBeGreaterThanOrEqual(4);
  const infoFocusLabels = [];
  for (let index = 0; index < infoFocusableCount * 2; index += 1) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({ inside: Boolean(document.activeElement?.closest('#infoModal')), label: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim(), tag: document.activeElement?.tagName }));
    infoFocusLabels.push(focus.label);
    expect(focus.inside).toBe(true);
  }
  expect(infoFocusLabels).toContain('Check server build');
  expect(infoFocusLabels).toContain('Copy diagnostics');
  await page.keyboard.press('Escape');
  await expect(page.locator('#infoModal')).toBeHidden();
  await expect(page.locator('#infoToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#infoToggle')).toBeFocused();
});

test('focused court hit targets support precise keyboard movement and handedness', async ({ page }) => {
  await openApp(page);
  const player = page.locator('#player1-touch');
  const artwork = page.locator('#player1');
  await expect(player).toHaveAttribute('tabindex', '0');
  await expect(player).toHaveAttribute('role', 'button');
  await expect(artwork).toHaveAttribute('aria-hidden', 'true');
  await player.focus();

  const before = await page.evaluate(() => pickleboard.getTokenPositions().player1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => pickleboard.getTokenPositions().player1)).toEqual({
    x: before.x + 0.5,
    y: before.y + 0.5
  });
  await expect(player).toHaveAttribute('cx', String(before.x + 0.5));
  await expect(player).toHaveAttribute('cy', String(before.y + 0.5));

  await page.keyboard.press('Enter');
  await expect(artwork).toHaveAttribute('data-handedness', 'left');
  await expect(player).toHaveAttribute('aria-label', /left-handed/);
  await page.keyboard.press('Space');
  await expect(artwork).toHaveAttribute('data-handedness', 'right');

  const ball = page.locator('#ball-touch');
  await ball.focus();
  const ballBefore = await page.evaluate(() => pickleboard.getTokenPositions().ball);
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => pickleboard.getTokenPositions().ball)).toEqual({
    x: ballBefore.x - 0.5,
    y: ballBefore.y
  });
});

test('drawing and Play locks block keyboard edits', async ({ page }) => {
  await openApp(page);
  const target = page.locator('#player1-touch');
  await target.focus();

  await page.evaluate(() => pickleboard.setDrawingMode(true));
  const drawingState = await page.evaluate(() => ({
    position: pickleboard.getTokenPositions().player1,
    handedness: pickleboard.tokens.player1.handedness
  }));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => ({
    position: pickleboard.getTokenPositions().player1,
    handedness: pickleboard.tokens.player1.handedness
  }))).toEqual(drawingState);

  await page.evaluate(() => {
    pickleboard.setDrawingMode(false);
    pickleboard.plays.load('serve-and-return');
    document.querySelector('#player1-touch').focus();
  });
  const playState = await page.evaluate(() => ({
    position: pickleboard.getTokenPositions().player1,
    handedness: pickleboard.tokens.player1.handedness
  }));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => ({
    position: pickleboard.getTokenPositions().player1,
    handedness: pickleboard.tokens.player1.handedness
  }))).toEqual(playState);
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 }
]) {
  test(`transparent court targets remain usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openApp(page);
    for (const id of ['player1-touch', 'ball-touch']) {
      await expect.poll(() => page.locator(`#${id}`).evaluate(element => element.getBoundingClientRect().width))
        .toBeGreaterThanOrEqual(43);
    }
    const sizes = await page.evaluate(() => Object.fromEntries(
      ['player1-touch', 'ball-touch'].map(id => {
        const element = document.getElementById(id);
        const box = element.getBoundingClientRect();
        return [id, { width: box.width, height: box.height, radius: Number(element.getAttribute('r')) }];
      })
    ));
    for (const target of Object.values(sizes)) {
      expect(target.width).toBeGreaterThanOrEqual(43);
      expect(target.height).toBeGreaterThanOrEqual(43);
      expect(target.radius).toBeLessThanOrEqual(4);
    }
  });
}

test('DPR2 touch dragging retains exact SVG coordinates and replay restoration', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${baseURL}/?workspace=planner`);
  await page.waitForFunction(() => window.pickleboard?.plays);
  const target = page.locator('#player1-touch');
  const box = await target.boundingBox();
  const before = await page.evaluate(() => {
    const svg = document.querySelector('#court');
    const inverse = svg.getScreenCTM().inverse();
    const viewDelta = { x: inverse.a * 20, y: inverse.b * 20 };
    const origin = PickleboardProjection.viewToCourt(0, 0);
    const end = PickleboardProjection.viewToCourt(viewDelta.x, viewDelta.y);
    return {
      position: pickleboard.getTokenPositions().player1,
      expectedDelta: { x: end.x - origin.x, y: end.y - origin.y }
    };
  });
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  for (const [type, dx, active] of [['touchstart', 0, true], ['touchmove', 20, true], ['touchend', 20, false]]) {
    await target.dispatchEvent(type, {touches: active ? [{identifier:1,clientX:x+dx,clientY:y}] : [], changedTouches:[{identifier:1,clientX:x+dx,clientY:y}]});
  }
  const arranged = await page.evaluate(() => pickleboard.getTokenPositions());
  expect(arranged.player1.x).toBeCloseTo(before.position.x + before.expectedDelta.x, 5);
  expect(arranged.player1.y).toBeCloseTo(before.position.y + before.expectedDelta.y, 5);
  await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
  await page.locator('#play3dView').tap();
  await page.locator('#threeDCanvas canvas').waitFor();
  await page.locator('#threeDExit').tap();
  await page.locator('#playExit').tap();
  expect(await page.evaluate(() => pickleboard.getTokenPositions())).toEqual(arranged);
  await context.close();
});

test('200 percent text sizing keeps instructions and Exit reachable', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await openApp(page);
  await page.addStyleTag({content: 'html { font-size: 200%; } body { font-size: 32px; }'});
  await page.evaluate(() => pickleboard.plays.load('fifth-shot-drop'));
  await expect(page.locator('#playbackDescription')).toBeVisible();
  await page.locator('#play3dView').click();
  await page.locator('#threeDCanvas canvas').waitFor();
  await page.locator('#threeDExit').click();
  await page.locator('#playExit').click();
  await expect(page.locator('#playbackControls')).toBeHidden();
});
