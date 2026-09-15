import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function waitForWorker(page) {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
}

async function unregisterWorkers(page) {
  await page.goto('/tests/fixtures/cache-setup.html');
  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  });
}

test.describe('service worker lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await unregisterWorkers(page);
  });

  test('installs the versioned shell and serves a repeat visit offline', async ({ page, context }) => {
    await page.goto('/index.html?workspace=planner&install=1');
    await waitForWorker(page);

    const cacheState = await page.evaluate(async () => {
      const cache = await caches.open('pickleboard-static-v23');
      const playerAssets = [
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
    });
    expect(cacheState.names).toContain('pickleboard-static-v23');
    expect(cacheState.hasShell).toBe(true);
    expect(cacheState.hasScript).toBe(true);
    expect(cacheState.hasPlayerAssets).toBe(true);

    await context.setOffline(true);
    await page.goto('/index.html?workspace=planner&offline=1');
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
    await context.setOffline(false);
  });

  test('upgrades old Pickleboard caches without deleting unrelated origin caches', async ({ page }) => {
    await page.goto('/tests/fixtures/cache-setup.html');
    await page.evaluate(async () => {
      await window.seedCaches();
      const previous = await caches.open('pickleboard-static-v10');
      await previous.put('./guided-plays.js', new Response('// previous release'));
    });
    expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([
      'pickleboard-static-v1',
      'unrelated-application-cache'
    ]));

    await page.goto('/index.html?workspace=planner&upgrade=1');
    await waitForWorker(page);
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([
      'pickleboard-static-v23',
      'unrelated-application-cache'
    ]));
    expect(await page.evaluate(() => caches.keys())).not.toContain('pickleboard-static-v1');
    expect(await page.evaluate(() => caches.keys())).not.toContain('pickleboard-static-v10');
    expect(await page.evaluate(async () => {
      const cache = await caches.open('pickleboard-static-v23');
      return (await cache.match('./guided-plays.js'))?.text();
    })).toBe(readFileSync(new URL('../guided-plays.js', import.meta.url), 'utf8'));
    expect(await page.evaluate(async () => {
      const cache = await caches.open('unrelated-application-cache');
      return (await cache.match('/tests/fixtures/unrelated.txt'))?.text();
    })).toBe('keep me');
  });

  test('offline navigation uses only the owned shell cache and does not cache unknown pages as the shell', async ({ page, context }) => {
    await page.goto('/index.html?workspace=planner&navigation-setup=1');
    await waitForWorker(page);

    await page.goto('/tests/fixtures/cache-setup.html?online=1');
    await expect(page).toHaveTitle('Cache setup');
    await page.evaluate(async () => {
      const unrelatedCache = await caches.open('unrelated-application-cache');
      await unrelatedCache.put('/index.html', new Response('<title>Poisoned unrelated shell</title>'));
    });

    await context.setOffline(true);
    await page.goto('/unknown/offline-route');
    await expect(page).toHaveTitle('Pickleball Park - Build a Play');
    await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard))).toBe(true);
    await context.setOffline(false);
  });

  test('refreshes a stale cached application asset from the current release', async ({ page }) => {
    await page.goto('/index.html?workspace=planner&freshness-setup=1');
    await waitForWorker(page);

    await page.evaluate(async () => {
      const cache = await caches.open('pickleboard-static-v23');
      await cache.put('./script.js', new Response('window.__STALE_PICKLEBOARD_ASSET__ = true;', {
        headers: { 'Content-Type': 'text/javascript' }
      }));
    });

    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard))).toBe(true);
    expect(await page.evaluate(() => window.__STALE_PICKLEBOARD_ASSET__)).toBeUndefined();

    const cachedScript = await page.evaluate(async () => {
      const cache = await caches.open('pickleboard-static-v23');
      return (await cache.match('./script.js')).text();
    });
    expect(cachedScript).toContain('class Pickleboard');
    expect(cachedScript).not.toContain('__STALE_PICKLEBOARD_ASSET__');
  });

  test('returns a successful network asset even when refreshing its cache fails', async ({ page }) => {
    await page.goto('/index.html?workspace=planner&cache-write-setup=1');
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
