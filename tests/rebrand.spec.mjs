import { expect, test } from '@playwright/test';

test('publishes Pickleball Park metadata and visible identity', async ({ page }) => {
  await page.goto('/?workspace=planner');
  await expect(page).toHaveTitle('Pickleball Park - Build a Play');

  const manifest = await page.evaluate(async () => (await fetch('manifest.json')).json());
  expect(manifest).toMatchObject({
    name: 'Pickleball Park',
    short_name: 'Pickleball Park',
    start_url: './index.html'
  });
  expect(manifest).not.toHaveProperty('id');

  const banner = page.locator('h1.park-banner img');
  await expect(banner).toHaveAttribute('alt', 'Pickleball Park');
  await expect(page.locator('h1.park-banner')).toHaveAccessibleName('Pickleball Park');
  await expect.poll(() => banner.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  const visibleText = await page.locator('body').innerText();
  expect(visibleText).not.toMatch(/\b(?:Pickleboard|Paddle Park)\b/i);
});

test('keeps the legacy theme and public API compatible across the rebrand', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pickleboard-theme', 'dark'));
  await page.goto('/?workspace=planner');
  await page.waitForFunction(() => Boolean(window.pickleboard));

  const before = await page.evaluate(() => window.pickleboard.captureBoardState());
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('pickleboard-theme'))).toBe('dark');
  expect(await page.evaluate(() => typeof window.PickleboardProjection?.courtToView)).toBe('function');

  await page.reload();
  await page.waitForFunction(() => Boolean(window.pickleboard));
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => window.pickleboard.captureBoardState())).toEqual(before);
});

for (const width of [320, 390, 768]) {
  test(`full brand remains readable at 200% text size in ${width}px viewport`, async ({ page }) => {
    if (process.env.REBRAND_OLD_CSS) {
      const { execFileSync } = await import('node:child_process');
      const oldCSS = execFileSync('git', ['show', '98bf4c5:styles.css'], { encoding: 'utf8' });
      await page.route('**/styles.css', route => route.fulfill({ contentType: 'text/css', body: oldCSS }));
    }
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?workspace=planner');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const brand = page.locator('h1.park-banner');
    await expect(brand).toHaveAccessibleName('Pickleball Park');
    await expect.poll(() => brand.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    const brandBox = await brand.boundingBox();
    expect(brandBox.x).toBeGreaterThanOrEqual(0);
    expect(brandBox.x + brandBox.width).toBeLessThanOrEqual(width);
    expect(brandBox.y).toBeGreaterThanOrEqual(0);
    expect(brandBox.y + brandBox.height).toBeLessThanOrEqual(844);
    const menu = await page.locator('#menuToggle').boundingBox();
    const player = await page.locator('#player1').boundingBox();
    const overlaps = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
    expect(overlaps(brandBox, menu)).toBe(false);
    expect(overlaps(brandBox, player)).toBe(false);
    expect(overlaps(menu, player)).toBe(false);
    await page.locator('#menuToggle').click();
    const heading = page.locator('.menu-header h2');
    await expect(heading).toHaveText('Pickleball Park');
    const headingBox = await heading.boundingBox();
    expect(headingBox.x + headingBox.width).toBeLessThanOrEqual(width);
  });
}
