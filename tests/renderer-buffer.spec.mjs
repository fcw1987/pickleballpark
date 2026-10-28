import { test, expect } from '@playwright/test';

for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`legacy 3D compatibility: buffer follows the actual court after layout changes (${reducedMotion})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, reducedMotion, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(process.env.PICKLEBALLPARK_TEST_URL || `http://127.0.0.1:${process.env.PORT || 4173}`);
    await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
    await page.evaluate(() => playBuilder.switchView('3d'));
    const source = await page.evaluate(() => JSON.stringify(playBuilder.document));
    const matchBuffer = async () => {
      await expect.poll(() => page.evaluate(() => {
        const viewer = pickleboard.threeD, node = viewer.renderer.domElement;
        const ratio = viewer.renderer.getPixelRatio();
        return [node.width - Math.floor(viewer.elements.canvas.clientWidth * ratio), node.height - Math.floor(viewer.elements.canvas.clientHeight * ratio)];
      })).toEqual([0, 0]);
    };
    await matchBuffer();
    for (const [width, height] of [[844, 390], [320, 568], [1440, 900], [430, 932]]) {
      await page.setViewportSize({ width, height }); await matchBuffer();
      await page.getByLabel('Menu', { exact: true }).click();
      await page.getByRole('button', { name: 'Help', exact: true }).click();
      await page.getByRole('button', { name: 'Close help and information' }).click(); await matchBuffer();
      await page.evaluate(() => playBuilder.switchView('2d'));
      await page.evaluate(() => playBuilder.switchView('3d'));
      await page.waitForFunction(() => !playBuilder.busy && playBuilder.view === '3d'); await matchBuffer();
    }
    expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(source);
    await expect.poll(() => page.evaluate(() => pickleboard.threeD.renderLoopId)).toBe(null);
    const frames = await page.evaluate(async () => {
      const renderer = pickleboard.threeD.renderer, before = renderer.info.render.frame;
      for (let i = 0; i < 12; i++) await new Promise(resolve => requestAnimationFrame(resolve));
      return renderer.info.render.frame - before;
    });
    expect(frames).toBe(0);
    await context.close();
  });
}
