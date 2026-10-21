import { expect, test } from './helpers/offline-app.mjs';
import { readFileSync } from 'node:fs';

const workerSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const staticCache = `pickleboard-static-${workerSource.match(/static-(v\d+)/)[1]}`;

async function waitForWorker(page) {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
}

test.describe('service worker lifecycle', () => {
  test('installs the versioned shell and serves a repeat visit offline', async ({ page, offlineApp }) => {
    await page.goto(`${offlineApp.url}/index.html?workspace=planner&install=1`);
    await waitForWorker(page);

    const cacheState = await page.evaluate(async cacheName => {
      const cache = await caches.open(cacheName);
      const playerAssets = [
        './three-d-athletes.js',
        './three-d-world.js',
        './assets/players/green-left-handed.png',
        './assets/players/green-right-handed.png',
        './assets/players/orange-left-handed.png',
        './assets/players/orange-right-handed.png'
      ];
      return {
        names: await caches.keys(),
        hasShell: Boolean(await cache.match('./index.html')),
        hasScript: Boolean(await cache.match('./script.js')),
        hasPlayerAssets: (await Promise.all(playerAssets.map(path => cache.match(path)))).every(Boolean)
      };
    }, staticCache);
    expect(cacheState.names).toContain(staticCache);
    expect(cacheState.hasShell).toBe(true);
    expect(cacheState.hasScript).toBe(true);
    expect(cacheState.hasPlayerAssets).toBe(true);

    await offlineApp.stop();
    await page.goto(`${offlineApp.url}/index.html?workspace=planner&offline=1`);
    await expect(page).toHaveTitle('Pickleball Park - Build a Play');
    await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard))).toBe(true);
    const offlinePlayerAssets = await page.evaluate(async () => Promise.all(
      [...document.querySelectorAll('.player-artwork')].map(async image => {
        const response = await fetch(image.getAttribute('href'));
        const blob = await response.blob();
        return response.ok && blob.type === 'image/png' && blob.size > 0;
      })
    ));
    expect(offlinePlayerAssets).toEqual([true, true, true, true]);
  });

  test('upgrades old Pickleboard caches without deleting unrelated origin caches', async ({ page, offlineApp }) => {
    // Seed an installed origin, as a previous release would. WebKit's transient
    // pre-worker document cache partition is not the installed worker's store.
    offlineApp.setWorkerSource("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));");
    await page.goto(`${offlineApp.url}/tests/fixtures/cache-setup.html`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.evaluate(async () => {
      await window.seedCaches();
      const previous = await caches.open('pickleboard-static-v10');
      await previous.put('./guided-plays.js', new Response('// previous release'));
    });
    expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([
      'pickleboard-static-v1',
      'unrelated-application-cache'
    ]));

    offlineApp.setWorkerSource(null);
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    await waitForWorker(page);
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([
      staticCache,
      'unrelated-application-cache'
    ]));
    await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('pickleboard-static-v1');
    await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('pickleboard-static-v10');
    await page.goto(`${offlineApp.url}/index.html?workspace=planner&upgrade=1`);
    await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.plays))).toBe(true);
    expect(await page.evaluate(async cacheName => {
      const cache = await caches.open(cacheName);
      return (await cache.match('./guided-plays.js'))?.text();
    }, staticCache)).toBe(readFileSync(new URL('../guided-plays.js', import.meta.url), 'utf8'));
    expect(await page.evaluate(async () => {
      const cache = await caches.open('unrelated-application-cache');
      return (await cache.match('/tests/fixtures/unrelated.txt'))?.text();
    })).toBe('keep me');
  });

  test('offline navigation uses only the owned shell cache and does not cache unknown pages as the shell', async ({ page, offlineApp }) => {
    await page.goto(`${offlineApp.url}/index.html?workspace=planner&navigation-setup=1`);
    await waitForWorker(page);

    await page.goto(`${offlineApp.url}/tests/fixtures/cache-setup.html?online=1`);
    await expect(page).toHaveTitle('Cache setup');
    await page.evaluate(async () => {
      const unrelatedCache = await caches.open('unrelated-application-cache');
      await unrelatedCache.put('/index.html', new Response('<title>Poisoned unrelated shell</title>'));
    });

    await offlineApp.stop();
    await page.goto(`${offlineApp.url}/unknown/offline-route`);
    await expect(page).toHaveTitle('Pickleball Park - Build a Play');
    await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard))).toBe(true);
    expect(await page.evaluate(async cacheName => {
      const cache = await caches.open(cacheName);
      return Boolean(await cache.match('/unknown/offline-route'));
    }, staticCache)).toBe(false);
    expect(await page.evaluate(async () => {
      const cache = await caches.open('unrelated-application-cache');
      return (await cache.match('/index.html'))?.text();
    })).toBe('<title>Poisoned unrelated shell</title>');
  });

  test('refreshes a stale cached application asset from the current release', async ({ page, offlineApp }) => {
    await page.goto(`${offlineApp.url}/index.html?workspace=planner&freshness-setup=1`);
    await waitForWorker(page);

    await page.evaluate(async cacheName => {
      const cache = await caches.open(cacheName);
      await cache.put('./script.js', new Response('window.__STALE_PICKLEBOARD_ASSET__ = true;', {
        headers: { 'Content-Type': 'text/javascript' }
      }));
    }, staticCache);

    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard))).toBe(true);
    expect(await page.evaluate(() => window.__STALE_PICKLEBOARD_ASSET__)).toBeUndefined();

    const cachedScript = await page.evaluate(async cacheName => {
      const cache = await caches.open(cacheName);
      return (await cache.match('./script.js')).text();
    }, staticCache);
    expect(cachedScript).toContain('class Pickleboard');
    expect(cachedScript).not.toContain('__STALE_PICKLEBOARD_ASSET__');
  });

  test('returns a successful network asset even when refreshing its cache fails', async ({ page, offlineApp }) => {
    await page.goto(`${offlineApp.url}/index.html?workspace=planner&cache-write-setup=1`);
    await waitForWorker(page);

    await page.context().addCookies([{
      name: 'test-cache-write-failure', value: '1', url: new URL('/', page.url()).href
    }]);
    const result = await page.evaluate(async () => {
      const response = await fetch('/script.js');
      return { ok: response.ok, text: await response.text() };
    });

    expect(result.ok).toBe(true);
    expect(result.text).toContain('class Pickleboard');
    expect(result.text).toContain('playwright-vary-response');
  });
});
