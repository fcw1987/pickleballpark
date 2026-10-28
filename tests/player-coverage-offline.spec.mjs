import { test, expect } from '@playwright/test';
import { createStaticServer } from './helpers/static-server.mjs';

test('coverage preference and all overlay assets survive an actual server-stopped offline reload', async ({ browser }) => {
  const server = createStaticServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const context = await browser.newContext(); const page = await context.newPage();
  let stopped = false;
  const stop = async () => { if (stopped) return; stopped = true; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
  try {
    await page.goto(url); await page.waitForFunction(() => pickleboard.threeD?.worldAssetsReady && navigator.serviceWorker.controller);
    await page.evaluate(() => playBuilder.loadDocument({ ...structuredClone(playBuilder.document), title: 'Offline coverage verification' }));
    const before = await page.evaluate(() => JSON.stringify(playBuilder.document));
    await page.getByRole('button', { name: 'Player coverage', exact: true }).click();
    const cached = await page.evaluate(async () => {
      const cache = await caches.open((await caches.keys()).find(key => key.startsWith('pickleboard-static-')));
      return (await cache.keys()).map(request => new URL(request.url).pathname.split('/').at(-1));
    });
    for (const file of ['player-coverage.js', 'player-coverage-snapshot.js', 'player-coverage-overlay.js', 'player-coverage-canvas.js', 'player-coverage-ui.js', 'player-coverage.css']) expect(cached).toContain(file);
    await stop(); await page.reload(); await page.waitForFunction(() => pickleboard.threeD?.worldAssetsReady);
    await expect(page.getByRole('button', { name: 'Player coverage', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(before);
    expect(await page.evaluate(() => pickleboard.threeD.playerCoverage.getDiagnostics().sectors.length)).toBe(4);
    await page.evaluate(() => { playBuilder.seek(.5); });
    expect(await page.evaluate(() => pickleboard.threeD.playerCoverage.getDiagnostics().timeSeconds)).toBeCloseTo(.5, 6);
  } finally { await context.close(); await stop(); }
});
