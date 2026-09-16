import { test, expect } from '@playwright/test';

const evidenceDir = 'docs/smart-visible/evidence';

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
    await expect(page.getByRole('button', { name: 'Fix for me', exact: true })).toBeVisible();
    await page.screenshot({ path: `${evidenceDir}/phone-390-coach.png`, fullPage: true });
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
