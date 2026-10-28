import { test, expect } from '@playwright/test';
import { expectBuilderAddComplete } from './helpers/builder-navigation.mjs';

test.describe('fresh visible builder correction review', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/index.html');
    await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  });

  test('transient panels have one owner and Add leaves the court first', async ({ page }) => {
    const main = page.locator('.builder-main-menu');
    const chapters = page.locator('.builder-chapter-menu');
    await page.getByLabel('Menu', { exact: true }).click();
    await page.getByLabel('Choose shot chapter', { exact: true }).click();
    await expect(main).toHaveJSProperty('open', false);
    await expect(chapters).toHaveJSProperty('open', true);
    await page.getByLabel('Menu', { exact: true }).click();
    await expect(chapters).toHaveJSProperty('open', false);
    await page.getByRole('button', { name: 'Add shot', exact: true }).click();
    await expectBuilderAddComplete(page, 4);
    await expect(page.locator('.builder-inspector')).toHaveClass(/builder-inspector-collapsed/);
    await expect(page.locator('[data-shot-card]')).toBeVisible();
  });

  test('More controls survive native select changes and the family picker is semantic', async ({ page }) => {
    await page.getByLabel('Playback options', { exact: true }).click();
    const menu = page.locator('.builder-context-menu');
    await expect(menu).toHaveJSProperty('open', true);
    await page.getByLabel('Playback speed', { exact: true }).selectOption('0.5');
    await expect(menu).toHaveJSProperty('open', true);
    await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
    await page.locator('.builder-family-summary').click();
    await expect(page.locator('.builder-native-family-select')).toHaveCount(0);
    const selected = page.locator('.builder-family-option[aria-selected="true"]');
    await selected.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.builder-family-option').nth(1)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('.builder-family-option').first()).toBeFocused();
  });

  test('Escape cancels a random proposal and dialog fields do not mark the draft editing', async ({ page }) => {
    await page.getByLabel('Menu', { exact: true }).click();
    await page.getByRole('button', { name: 'Random Rally', exact: true }).click();
    await page.getByLabel('Number of hits', { exact: true }).fill('8');
    await expect(page.locator('[data-ui="save-pill"]')).not.toHaveText('Editing');
    await page.keyboard.press('Escape');
    await expect(page.locator('.builder-random-dialog')).toBeHidden();
    await expect.poll(() => page.evaluate(() => playBuilder.message)).toContain('Cancelled');
  });
});

test('playback options leave Edit reachable across compact and enlarged viewports without authoring changes',async({page},testInfo)=>{
 for(const [width,height]of[[1440,900],[800,450],[390,844],[844,390]])for(const enlarged of[false,true]){
  await page.setViewportSize({width,height});await page.goto('/');await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy);
  if(enlarged)await page.evaluate(()=>{document.documentElement.style.fontSize='200%';playBuilder.render();});
  const before=await page.evaluate(()=>({document:JSON.stringify(playBuilder.document),history:playBuilder.history.snapshots.length}));
  await page.getByLabel('Playback options',{exact:true}).click();
  await page.getByLabel('Playback speed',{exact:true}).selectOption('0.5');
  const menu=page.locator('.builder-context-menu');await expect(menu).toHaveJSProperty('open',true);
  const panel=await menu.locator('.builder-menu-panel').boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.y).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(width);expect(panel.y+panel.height).toBeLessThanOrEqual(height);
  await page.screenshot({path:testInfo.outputPath(`options-${width}x${height}-${enlarged?'200':'100'}.png`)});
  await page.getByRole('button',{name:'Edit shot',exact:true}).click();
  await expect(menu).toHaveJSProperty('open',false);await expect(page.getByRole('button',{name:'Close editor',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>({document:JSON.stringify(playBuilder.document),history:playBuilder.history.snapshots.length}))).toEqual(before);
 }
});
