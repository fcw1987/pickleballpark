import { test, expect } from '@playwright/test';
import { expectBuilderAddComplete } from './helpers/builder-navigation.mjs';

const evidenceDir = 'release-results/smart-visible';

async function freshBuilder(page, viewport) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/index.html?smart-visible=1');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
}

test.describe('smart rally visible acceptance', () => {
  test('390px authoring keeps the editor owned by the active placement', async ({ page }) => {
    await freshBuilder(page, { width: 390, height: 844 });
    await page.screenshot({ path: `${evidenceDir}/phone-390-start.png`, fullPage: true });

    const chaptersBefore = await page.locator('.builder-chapter-list [data-action="chapter"]').count();
    await page.getByRole('button', { name: 'Add shot', exact: true }).click();
    await expectBuilderAddComplete(page, chaptersBefore + 1);
    await expect(page.locator('.builder-chapter-list [data-action="chapter"]')).toHaveCount(chaptersBefore + 1);
    await page.screenshot({ path: `${evidenceDir}/phone-390-add.png`, fullPage: true });

    await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
    await page.getByRole('button', { name: 'Place target on court', exact: true }).click();
    const court = page.locator('.builder-court-region');
    const box = await court.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box.x + box.width * 0.48, box.y + box.height * 0.5);

    await expect(page.getByRole('button', { name: 'Close editor', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close editor', exact: true })).toBeFocused();
    await page.screenshot({ path: `${evidenceDir}/phone-390-customize-after-placement.png`, fullPage: true });
  });

  test('picker, random dialog, and Coach review remain visible in the compact workflow', async ({ page }) => {
    await freshBuilder(page, { width: 390, height: 844 });
    await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
    const familyPicker = page.locator('.builder-family-picker');
    if (!(await familyPicker.evaluate(element => element.open))) await page.locator('.builder-family-summary').click();
    await expect(page.getByRole('listbox', { name: 'Shot families' })).toBeVisible();
    const pickerBox = await page.locator('.builder-choice-family').boundingBox();
    const hitterBox = await page.locator('.builder-choice-hitter').boundingBox();
    expect(pickerBox?.width).toBeGreaterThan(300);
    expect(hitterBox?.width).toBeGreaterThan(300);
    expect(await page.locator('.builder-family-options').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
    await page.screenshot({ path: `${evidenceDir}/phone-390-picker.png`, fullPage: true });

    await page.locator('.builder-main-menu > summary').click();
    await page.getByRole('button', { name: 'Random Rally', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Random rally' })).toBeVisible();
    await page.screenshot({ path: `${evidenceDir}/phone-390-random.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Random rally' })).toBeHidden();

    // A deliberate incompatible family keeps authored intent and exposes the
    // actionable Coach review in the same editor surface.
    if (!(await familyPicker.evaluate(element => element.open))) await page.locator('.builder-family-summary').click();
    await page.locator('.builder-family-option').filter({ hasText: 'Return' }).click();
    await expect(familyPicker).not.toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: 'Fix for me', exact: true })).toBeVisible();
    await page.screenshot({ path: `${evidenceDir}/phone-390-coach.png`, fullPage: true });
  });

  test('200% text at 390px keeps advanced authoring inside the viewport', async ({ page }) => {
    await freshBuilder(page, { width: 390, height: 844 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; window.dispatchEvent(new Event('resize')); });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
    await expect(page.getByLabel('Hitter', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${evidenceDir}/phone-390-large-text-authoring.png`, fullPage: true });
  });

  test('200% landscape keeps editor, menu, and playback options touchable', async ({ page }) => {
    await freshBuilder(page, { width: 844, height: 390 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; window.dispatchEvent(new Event('resize')); });
    await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
    await expect(page.getByLabel('Hitter', { exact: true })).toBeVisible();
    // The enlarged editor covers the court controls. Use its visible Close
    // action before moving to the next surface, rather than clicking through it.
    await page.getByRole('button', { name: 'Close editor', exact: true }).click();
    await page.locator('.builder-main-menu > summary').click();
    await expect(page.getByLabel('Menu', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);
    await page.locator('.builder-main-menu > summary').click();
    await expect(page.locator('.builder-main-menu > .builder-menu-panel')).toBeHidden();
    await page.getByLabel('Playback options', { exact: true }).click();
    const playbackPanel = page.locator('.builder-context-menu > .builder-menu-panel');
    await expect(playbackPanel).toBeVisible();
    const panelBox = await playbackPanel.boundingBox();
    expect(panelBox?.x).toBeGreaterThanOrEqual(0);
    expect((panelBox?.x || 0) + (panelBox?.width || 0)).toBeLessThanOrEqual(844);
    expect(panelBox?.y).toBeGreaterThanOrEqual(0);
    expect((panelBox?.y || 0) + (panelBox?.height || 0)).toBeLessThanOrEqual(390);
    await page.getByLabel('Playback speed', { exact: true }).selectOption('0.5');
    await expect.poll(() => page.evaluate(() => playBuilder.session.clock.playbackRate)).toBe(0.5);
    await expect(playbackPanel).toBeVisible();
    await page.screenshot({ path: `${evidenceDir}/landscape-844-large-text-menus.png`, fullPage: true });
  });

  for (const viewport of [
    { name: 'phone-320', width: 320, height: 568 },
    { name: 'phone-430', width: 430, height: 932 },
    { name: 'desktop-1440', width: 1440, height: 900 }
  ]) {
    test(`${viewport.name} keeps the basic court and menu usable`, async ({ page }) => {
      await freshBuilder(page, { width: viewport.width, height: viewport.height });
      await expect(page.getByRole('button', { name: 'Add shot', exact: true })).toBeVisible();
      await page.locator('.builder-main-menu > summary').click();
      await expect(page.getByRole('button', { name: 'Random Rally', exact: true })).toBeVisible();
      await page.screenshot({ path: `${evidenceDir}/${viewport.name}-menu.png`, fullPage: true });
    });
  }
});
