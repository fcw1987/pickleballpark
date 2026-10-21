import { expect, test } from '@playwright/test';

test('editor does not execute Three.js until 3D is requested', async ({ page }) => {
  await page.goto('/?workspace=planner');
  await page.waitForFunction(() => window.pickleboard?.threeD);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => /vendor\/three/.test(entry.name)))).toBe(false);
  await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
  await page.locator('#play3dView').click();
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => /vendor\/three/.test(entry.name)))).toBe(true);
});

test('failed 3D module loading leaves the original board recoverable', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.route('**/three-d-playback.js', route => route.abort());
  await page.goto('/?workspace=planner');
  await page.waitForFunction(() => window.pickleboard?.threeD);
  await page.evaluate(() => pickleboard.setTokenPosition('ball', 7, 12));
  const before = await page.evaluate(() => pickleboard.captureBoardState());
  await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
  await page.locator('#play3dView').click();
  await expect(page.locator('#threeDLoadStatus')).toContainText('could not open');
  await expect(page.locator('#threeDViewer')).toBeHidden();
  await expect(page.locator('#play3dView')).toBeEnabled();
  await page.locator('#playExit').click();
  expect(await page.evaluate(() => pickleboard.captureBoardState())).toEqual(before);
  await context.close();
});

test('leaving a Play while 3D loads cannot open a stale viewer', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/three-d-playback.js', async route => { await gate; await route.continue(); });
  await page.goto('/?workspace=planner');
  await page.waitForFunction(() => window.pickleboard?.threeD);
  await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
  await page.locator('#play3dView').click();
  await expect(page.locator('#play3dView')).toHaveAttribute('aria-busy', 'true');
  await page.locator('#playExit').click();
  release();
  await expect(page.locator('#play3dView')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#threeDViewer')).toBeHidden();
  expect(await page.evaluate(() => pickleboard.playInteractionLocked)).toBe(false);
  await context.close();
});

for (const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]) {
  test(`court action stays clear of replay controls at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/?workspace=planner');
    await page.waitForFunction(() => window.pickleboard?.plays);
    await page.evaluate(() => pickleboard.plays.load('fifth-shot-drop'));
    const layout = await page.evaluate(() => {
      const a = document.querySelector('#court').getBoundingClientRect();
      const b = document.querySelector('#playbackControls').getBoundingClientRect();
      return { overlap: Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)), width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
    });
    expect(layout.overlap).toBe(0);
    expect(layout.width).toBeLessThanOrEqual(size.width);
    expect(layout.height).toBeLessThanOrEqual(size.height);
  });
}

test('WebGL allocation failure cleans up the viewer and preserves coaching state', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (/webgl/.test(type)) return null;
      return getContext.call(this, type, ...args);
    };
  });
  await page.goto('/?workspace=planner');
  await page.waitForFunction(() => window.pickleboard?.threeD);
  const before = await page.evaluate(() => pickleboard.captureBoardState());
  await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
  await page.locator('#play3dView').click();
  await expect(page.locator('#threeDLoadStatus')).toBeVisible();
  await expect(page.locator('#threeDLoadStatus')).not.toHaveText('Opening 3D court…');
  await expect(page.locator('#threeDViewer')).toBeHidden();
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(0);
  await expect(page.locator('#play3dView')).toBeEnabled();
  await page.locator('#playExit').click();
  expect(await page.evaluate(() => pickleboard.captureBoardState())).toEqual(before);
});


test('a failed module request can be retried without reloading the board', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let requests = 0;
  await page.route('**/three-d-playback.js*', route => ++requests === 1 ? route.abort() : route.continue());
  await page.goto('/?workspace=planner');
  await page.waitForFunction(() => window.pickleboard?.threeD);
  await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
  await page.locator('#play3dView').click();
  await expect(page.locator('#threeDLoadStatus')).toContainText('could not open');
  await page.locator('#play3dView').click();
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  await expect(page.locator('#threeDLoadStatus')).toBeHidden();
  await context.close();
});

test('reselecting the same Play cannot revive a cancelled 3D request', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/three-d-playback.js', async route => { await gate; await route.continue(); });
  await page.goto('/?workspace=planner');
  await page.waitForFunction(() => window.pickleboard?.threeD);
  await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
  await page.locator('#play3dView').click();
  await expect(page.locator('#play3dView')).toHaveAttribute('aria-busy', 'true');
  await page.locator('#playExit').click();
  await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
  release();
  await expect(page.locator('#play3dView')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#threeDViewer')).toBeHidden();
  await expect(page.locator('#playbackControls')).toBeVisible();
  await context.close();
});
