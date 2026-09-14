import { expect, test } from '@playwright/test';

async function open(page) {
  await page.goto('/?qa-modal-authority=1');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.evaluate(() => playBuilder.action('title', 'Modal authority sentinel'));
  await page.evaluate(async () => {
    await playBuilder.action('title', 'Redo authority sentinel');
    await playBuilder.action('undo');
  });
}

for (const panel of ['Help', 'My Plays', 'Learn', 'Import / Export']) {
  test(`${panel} prevents background authored Undo and Redo`, async ({ page }) => {
    await open(page);
    const snapshot = await page.evaluate(() => ({ document: playBuilder.document, index: playBuilder.history.index }));
    await page.locator('.builder-main-menu > summary').click();
    await page.getByRole('button', { name: panel, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole('button', { name: panel === 'Help' ? 'Close help and information' : 'Close', exact: true });
    await close.focus();
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => ({ document: playBuilder.document, index: playBuilder.history.index }))).toEqual(snapshot);
    await page.keyboard.press('Meta+Shift+z');
    expect(await page.evaluate(() => ({ document: playBuilder.document, index: playBuilder.history.index }))).toEqual(snapshot);
    await expect(dialog).toBeVisible();
    await close.click();
    await expect(dialog).toBeHidden();
    await page.locator('.builder-main-menu > summary').focus();
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => playBuilder.document.title)).not.toBe(snapshot.document.title);
  });
}
