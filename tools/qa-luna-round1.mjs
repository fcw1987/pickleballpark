import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const port = process.env.PORT || '4191';
const base = `http://127.0.0.1:${port}`;
const artifactDir = '/private/tmp/luna-round1-artifacts';
fs.mkdirSync(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: false });
const shot = async (page, name) => page.screenshot({ path: `${artifactDir}/${name}.png`, fullPage: true });
const text = async page => page.locator('body').innerText();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.match(await text(page), /Starter Serve, Return & Third/);
  await shot(page, '01-initial');

  await page.getByRole('button', { name: /Play/ }).click();
  await page.waitForTimeout(800);
  assert.match(await text(page), /Shot 1, Serve/);
  await shot(page, '02-serve-motion');

  await page.locator('summary[aria-label="Choose shot chapter"]').click();
  await page.getByRole('button', { name: 'Edit Shot 3' }).click();
  await page.getByRole('combobox', { name: 'Shot family' }).selectOption('drive');
  assert.match(await text(page), /Shot 3, Drive/);
  await shot(page, '03-drive');

  await page.locator('summary').filter({ hasText: 'Details · coordinates' }).click();
  await page.getByRole('spinbutton', { name: 'Target width' }).fill('9');
  await page.getByRole('spinbutton', { name: 'Target width' }).press('Tab');
  assert.match(await text(page), /Authored drive to \(9\.0, 27\.0\)/);
  await shot(page, '04-target-edited');

  await page.getByRole('button', { name: 'Add shot' }).click();
  assert.match(await text(page), /Shot 4 details/);
  await shot(page, '05-added-shot');

  await page.locator('summary[aria-label="Menu"]').click();
  await page.getByRole('button', { name: 'Save As' }).click();
  assert.match(await text(page), /Starter Serve, Return & Third — copy/);
  const menu = page.locator('summary[aria-label="Menu"]');
  if (!(await page.getByRole('button', { name: 'Help' }).isVisible())) {
    await menu.click();
    await page.waitForTimeout(150);
  }
  assert.match(await text(page), /Saved on this device/);
  await page.getByRole('button', { name: 'Help' }).click();
  await page.waitForTimeout(150);
  assert.match(await text(page), /Help & Information/);
  await shot(page, '06-help');
  await page.getByRole('button', { name: 'Close help and information' }).click();

  await page.getByRole('button', { name: '2D' }).click();
  await shot(page, '07-2d');
  await page.getByRole('button', { name: '3D' }).click();

  for (const [width, height, name] of [[390, 844, '390x844'], [320, 568, '320x568'], [844, 390, '844x390']]) {
    const compact = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true });
    await compact.goto(base, { waitUntil: 'networkidle' });
    assert.ok((await compact.getByRole('button', { name: /Play/ }).count()) > 0, `${name} Play control missing`);
    await shot(compact, name);
    await compact.close();
  }

  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await touch.goto(base, { waitUntil: 'networkidle' });
  await touch.locator('summary[aria-label="Choose shot chapter"]').click();
  await touch.getByRole('button', { name: 'Edit Shot 3' }).click();
  await touch.getByRole('button', { name: 'Place target on court' }).click();
  assert.match(await text(touch), /Tap to place Shot 3's target/);
  await touch.getByRole('button', { name: 'Cancel target' }).click();
  assert.match(await text(touch), /Target placement cancelled/);
  await shot(touch, '08-touch-cancel');
  await touch.close();

  console.log(`Luna round 1 visible journey passed at ${base}; screenshots in ${artifactDir}`);
} finally {
  await browser.close();
}
