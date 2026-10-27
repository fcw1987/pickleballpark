import { test, expect } from '@playwright/test';
import { openPlayFileMenu } from './helpers/builder-navigation.mjs';

test('coaching visible journey smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Starter Serve, Return & Third.', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add shot' })).toBeVisible();
});

test('mobile playback options and measured Menu tap are visible', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/');

  await page.locator('summary[aria-label="Playback options"]').click();
  const speed = page.getByLabel('Playback speed', {exact:true});
  await expect(speed).toBeVisible();
  for(const rate of ['0.25','0.5','1']){await speed.selectOption(rate);await expect(speed).toHaveValue(rate);}
  await page.locator('summary[aria-label="Playback options"]').click();
  for(const mode of ['Pan','Rotate']){
    const control=page.getByRole('button',{name:mode,exact:true});
    await expect(control).toBeVisible();await control.click();await expect(control).toHaveAttribute('aria-pressed','true');
    expect(await page.evaluate(()=>pickleboard.threeD.cameraControls.getState().mode)).toBe(mode==='Pan'?'pan':'orbit');
  }
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.getByRole('button',{name:'Reset view',exact:true}).click();
  expect(await page.evaluate(()=>pickleboard.threeD.cameraPreset)).toBe('overhead');

  const menu = page.locator('summary[aria-label="Menu"]');
  const box = await menu.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await openPlayFileMenu(page);
  await expect(page.getByRole('button', { name: 'Save As' })).toBeVisible();
  await context.close();
});
