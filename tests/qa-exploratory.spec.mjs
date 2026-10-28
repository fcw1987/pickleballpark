import { expect, test } from '@playwright/test';
import { openBuilderMainMenu, openIntentTab, openPlayFileMenu, switchCourtView } from './helpers/builder-navigation.mjs';

const title = 'Starter Serve, Return & Third';

async function openMenu(page) {
  await openBuilderMainMenu(page);
}

async function authoredSnapshot(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.playBuilder.document)));
}

function authoredContent(document) {
  const { id, title, ...content } = document;
  return content;
}

async function closeHelp(page) {
  const close = page.getByRole('button', { name: 'Close help and information' });
  if (await close.isVisible().catch(() => false)) await close.click();
}

test('visible serve, return, third workflow supports advanced movement and Save As reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Build a Play' })).toBeVisible();

  await page.getByRole('button', { name: /^Play$/ }).first().click();
  await expect(page.getByRole('button', { name: /^Pause$/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit shot' }).click();
  await openIntentTab(page, 'Movement');

  await page.getByRole('combobox', { name: 'Movement intent' }).selectOption({ label: 'Manual' });
  await page.getByRole('spinbutton', { name: 'Manual X' }).fill('13');
  await page.getByRole('spinbutton', { name: 'Manual X' }).press('Tab');
  await page.getByRole('spinbutton', { name: 'Manual Y' }).fill('2');
  await page.getByRole('spinbutton', { name: 'Manual Y' }).press('Tab');
  await page.getByRole('checkbox', { name: 'Pin movement target' }).check();
  await expect(page.getByRole('combobox', { name: 'Movement intent' })).toHaveValue('manual');
  const savedBeforeReload = await authoredSnapshot(page);
  expect(savedBeforeReload.shots[0].movement).toMatchObject({ intent: 'manual', pinned: true, target: { x: 13, y: 2 } });

  await openPlayFileMenu(page);
  await page.getByRole('button', { name: 'Save As' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Build a Play' })).toBeVisible();
  const savedAfterReload = await authoredSnapshot(page);
  expect(authoredContent(savedAfterReload)).toEqual(authoredContent(savedBeforeReload));
  expect(savedAfterReload.shots[0].movement).toMatchObject({ intent: 'manual', pinned: true, target: { x: 13, y: 2 } });
  await openPlayFileMenu(page);
  await page.getByRole('button', { name: 'My Plays' }).click();
  await expect(page.getByRole('dialog', { name: 'My Plays' })).toContainText('— copy');
});

test('Menu Help and Appearance are discoverable and Help traps focus', async ({ page }) => {
  await page.goto('/');
  await openMenu(page);
  await page.getByRole('button', { name: 'Help' }).click();
  const help = page.getByRole('dialog', { name: 'Help & Information' });
  await expect(help).toBeVisible();
  await expect(help).toContainText('Choose a shot chapter');

  const focusables = help.locator('button:visible, summary:visible, [tabindex="0"]:visible');
  const focusableCount = await focusables.count();
  expect(focusableCount).toBeGreaterThanOrEqual(4);
  const focused = [];
  for (let i = 0; i < focusableCount * 2; i += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    focused.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim()));
  }
  expect(focused).toContain('Check server build');
  expect(focused).toContain('Copy diagnostics');
  await closeHelp(page);

  await openMenu(page);
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole('button', { name: /Switch to (?:light|dark) appearance/ }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(before);
  await openMenu(page);
  await page.getByRole('button', { name: /Switch to (?:light|dark) appearance/ }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(before);
});

test.describe('touch and responsive surfaces', () => {
  for (const viewport of [
    { width: 390, height: 844, label: '390x844' },
    { width: 430, height: 932, label: '430x932' },
    { width: 320, height: 568, label: '320x568' },
    { width: 844, height: 390, label: '844x390' },
  ]) {
    test(`touch sequence and legacy 3D API transition stay usable at ${viewport.label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, colorScheme: 'light' });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.getByRole('region', { name: 'Build a Play' })).toBeVisible();
      await switchCourtView(page, '2d');
      const beforeDocument = await authoredSnapshot(page);

      // Two taps on the disabled replay token are an ignored gesture, not an authoring edit.
      const player = page.locator('[aria-label^="player1,"]').first();
      const before = await player.getAttribute('aria-label');
      const playerBox = await player.boundingBox();
      expect(playerBox).not.toBeNull();
      await page.touchscreen.tap(playerBox.x + playerBox.width / 2, playerBox.y + playerBox.height / 2);
      await page.waitForTimeout(100);
      await page.touchscreen.tap(playerBox.x + playerBox.width / 2, playerBox.y + playerBox.height / 2);
      await expect.poll(() => player.getAttribute('aria-label')).toBe(before);

      // Start a drag, lift outside the court, then confirm the ignored gesture leaves the document intact.
      const player2 = page.locator('[aria-label^="player2,"]').first();
      const player2Before = await player2.getAttribute('aria-label');
      const box = await player2.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(-20, -20);
        await page.mouse.up();
      }
      await expect.poll(() => player2.getAttribute('aria-label')).toBe(player2Before);
      await switchCourtView(page, '3d');
      await expect(page.getByRole('region', { name: '3D Play playback' })).toBeVisible();
      await expect.poll(() => authoredSnapshot(page)).toEqual(beforeDocument);
      await context.close();
    });
  }
});

test('selected edit panel scrolls, legacy 3D API transitions settle, and resize keeps data', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit shot' }).click();
  await openIntentTab(page, 'Movement');
  const before = await authoredSnapshot(page);
  const panel = page.getByRole('region', { name: 'Selected shot settings' });
  await panel.evaluate(node => node.scrollTop = node.scrollHeight);
  await expect(page.getByRole('combobox', { name: 'Movement intent' })).toBeVisible();

  for (let i = 0; i < 4; i += 1) {
    await switchCourtView(page, '2d');
    await switchCourtView(page, '3d');
    await page.locator('.builder-shot-details > summary').click();
    await page.locator('.builder-shot-details > summary').click();
  }
  await page.setViewportSize({ width: 430, height: 932 });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => authoredSnapshot(page)).toEqual(before);
});

test('desktop keyboard shortcuts skip text fields, trap Help focus, and skip hidden controls', async ({ page }) => {
  await page.goto('/');
  await openPlayFileMenu(page);
  const titleInput = page.getByRole('textbox', { name: 'Play title' });
  const beforeDocument = await page.evaluate(() => ({
    title: playBuilder.document.title,
    playing: playBuilder.session.playing,
    time: playBuilder.session.clock.elapsed
  }));
  await titleInput.fill('Keyboard probe');
  // The shortcut must remain native while a title field owns the key. Verify
  // the browser can undo the field edit, and that no builder playback or
  // authored document command was generated alongside that native edit.
  await titleInput.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(titleInput).toHaveValue(beforeDocument.title);
  await expect.poll(() => page.evaluate(() => ({
    title: playBuilder.document.title,
    playing: playBuilder.session.playing,
    time: playBuilder.session.clock.elapsed
  }))).toEqual(beforeDocument);

  const tabbed = [];
  await page.keyboard.press('Escape');
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    tabbed.push(await page.evaluate(() => ({ id: document.activeElement?.id, aria: document.activeElement?.getAttribute('aria-label') })));
  }
  expect(tabbed.some(item => item.id === 'menuToggle' || item.id === 'infoToggle')).toBe(false);

  await openMenu(page);
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByRole('dialog', { name: 'Help & Information' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Help & Information' })).toBeHidden();
});

test('reduced motion and enlarged text simulation preserve the visible controls', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await openMenu(page);
  await page.getByRole('button', { name: /Switch to (?:light|dark) appearance/ }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pickleboard-theme'))).toBe('light');
  await openMenu(page);
  await page.getByRole('button', { name: /Switch to (?:light|dark) appearance/ }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pickleboard-theme'))).toBe('dark');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(32, 47, 60)');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.getByRole('region', { name: 'Build a Play' })).toBeVisible();
  await expect(page.locator('#threeDViewer canvas')).toBeVisible();
  expect(await page.evaluate(() => playBuilder.view)).toBe('3d');
  await expect(page.getByRole('button', { name: 'Switch to 3D court view', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Play$/ }).first().click();
  await expect(page.getByRole('button', { name: /^Pause$/ }).first()).toBeVisible();
  await context.close();
});
