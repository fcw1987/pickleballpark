import { expect, test } from '@playwright/test';

const title = 'Starter Serve, Return & Third';

async function openMenu(page) {
  const menu = page.locator('summary[aria-label="Menu"]');
  const isOpen = await menu.evaluate(node => node.closest('details')?.open === true);
  if (!isOpen) await menu.click();
  await expect(page.getByRole('textbox', { name: 'Play title' })).toBeVisible();
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
  await page.getByText('Details · coordinates, contact, movement', { exact: true }).click();

  await page.getByRole('combobox', { name: 'Movement intent' }).selectOption({ label: 'Manual' });
  await page.getByRole('spinbutton', { name: 'Manual X' }).fill('13');
  await page.getByRole('spinbutton', { name: 'Manual X' }).press('Tab');
  await page.getByRole('spinbutton', { name: 'Manual Y' }).fill('2');
  await page.getByRole('spinbutton', { name: 'Manual Y' }).press('Tab');
  await page.getByRole('checkbox', { name: 'Pin movement target' }).check();
  await expect(page.getByRole('combobox', { name: 'Movement intent' })).toHaveValue('manual');
  const savedBeforeReload = await authoredSnapshot(page);
  expect(savedBeforeReload.shots[0].movement).toMatchObject({ intent: 'manual', pinned: true, target: { x: 13, y: 2 } });

  await openMenu(page);
  await page.getByRole('button', { name: 'Save As' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Build a Play' })).toBeVisible();
  const savedAfterReload = await authoredSnapshot(page);
  expect(authoredContent(savedAfterReload)).toEqual(authoredContent(savedBeforeReload));
  expect(savedAfterReload.shots[0].movement).toMatchObject({ intent: 'manual', pinned: true, target: { x: 13, y: 2 } });
  await openMenu(page);
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

  const focused = [];
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    focused.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')));
  }
  expect(new Set(focused)).toEqual(new Set(['Close help and information']));
  await closeHelp(page);

  await openMenu(page);
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole('button', { name: 'Appearance' }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(before);
  await openMenu(page);
  await page.getByRole('button', { name: 'Appearance' }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(before);
});

test.describe('touch and responsive surfaces', () => {
  for (const viewport of [
    { width: 390, height: 844, label: '390x844' },
    { width: 430, height: 932, label: '430x932' },
    { width: 320, height: 568, label: '320x568' },
    { width: 844, height: 390, label: '844x390' },
  ]) {
    test(`touch sequence stays usable at ${viewport.label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, colorScheme: 'light' });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.getByRole('region', { name: 'Build a Play' })).toBeVisible();
      await page.getByRole('button', { name: '2D' }).click();
      const beforeDocument = await authoredSnapshot(page);

      // Two taps on the disabled replay token are an ignored gesture, not an authoring edit.
      const player = page.locator('[aria-label^="Player 1,"]').first();
      const before = await player.getAttribute('aria-label');
      const playerBox = await player.boundingBox();
      expect(playerBox).not.toBeNull();
      await page.touchscreen.tap(playerBox.x + playerBox.width / 2, playerBox.y + playerBox.height / 2);
      await page.waitForTimeout(100);
      await page.touchscreen.tap(playerBox.x + playerBox.width / 2, playerBox.y + playerBox.height / 2);
      await expect.poll(() => player.getAttribute('aria-label')).toBe(before);

      // Start a drag, lift outside the court, then confirm the ignored gesture leaves the document intact.
      const player2 = page.locator('[aria-label^="Player 2,"]').first();
      const player2Before = await player2.getAttribute('aria-label');
      const box = await player2.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(-20, -20);
        await page.mouse.up();
      }
      await expect.poll(() => player2.getAttribute('aria-label')).toBe(player2Before);
      await page.getByRole('button', { name: '2D' }).click();
      await page.getByRole('button', { name: '3D' }).click();
      await expect(page.getByRole('region', { name: '3D Play playback' })).toBeVisible();
      await expect.poll(() => authoredSnapshot(page)).toEqual(beforeDocument);
      await context.close();
    });
  }
});

test('selected edit panel scrolls, rapid view/detail toggles settle, and resize keeps data', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit shot' }).click();
  await page.getByText('Details · coordinates, contact, movement', { exact: true }).click();
  const before = await authoredSnapshot(page);
  const panel = page.getByRole('region', { name: 'Selected shot settings' });
  await panel.evaluate(node => node.scrollTop = node.scrollHeight);
  await expect(page.getByRole('combobox', { name: 'Movement intent' })).toBeVisible();

  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: '2D' }).click();
    await page.getByRole('button', { name: '3D' }).click();
    await page.getByText('Details · coordinates, contact, movement', { exact: true }).click();
    await page.getByText('Details · coordinates, contact, movement', { exact: true }).click();
  }
  await page.setViewportSize({ width: 430, height: 932 });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => authoredSnapshot(page)).toEqual(before);
});

test('desktop keyboard shortcuts skip text fields, trap Help focus, and skip hidden controls', async ({ page }) => {
  await page.goto('/');
  await openMenu(page);
  const titleInput = page.getByRole('textbox', { name: 'Play title' });
  await titleInput.fill('Keyboard probe');
  await titleInput.press('Control+z');
  await expect(titleInput).toHaveValue('Keyboard probe');

  const tabbed = [];
  await page.keyboard.press('Escape');
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    tabbed.push(await page.evaluate(() => ({ id: document.activeElement?.id, aria: document.activeElement?.getAttribute('aria-label') })));
  }
  expect(tabbed.some(item => item.id === 'menuToggle' || item.id === 'infoToggle')).toBe(false);

  await openMenu(page);
  await page.getByRole('button', { name: 'Help' }).click();
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Help & Information' })).toBeHidden();
});

test('reduced motion and enlarged text simulation preserve the visible controls', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForTimeout(700);
  await openMenu(page);
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.waitForTimeout(350);
  await openMenu(page);
  await page.getByRole('button', { name: 'Appearance' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pickleboard-theme'))).toBe('dark');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(32, 47, 60)');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.getByRole('region', { name: 'Build a Play' })).toBeVisible();
  await expect(page.getByRole('button', { name: '2D' })).toBeVisible();
  await page.getByRole('button', { name: /^Play$/ }).first().click();
  await expect(page.getByRole('button', { name: /^Pause$/ }).first()).toBeVisible();
  await context.close();
});
