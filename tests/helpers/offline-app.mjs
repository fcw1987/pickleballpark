import { test as base, expect } from '@playwright/test';
import { createStaticServer } from './static-server.mjs';

// Each offline test owns its origin and server. Stopping it proves that a
// service worker supplied the repeat visit, without WebKit offline emulation.
export const test = base.extend({
  offlineApp: async ({ request }, use) => {
    let worker = null;
    const server = createStaticServer({ workerSource: () => worker });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    let stopped = false;
    const stop = async () => {
      if (!stopped) {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        stopped = true;
      }
    };
    try {
      await use({
        url,
        setWorkerSource: source => { worker = source; },
        stop: async () => {
          await stop();
          // API requests bypass the page's service worker. A successful HTTP
          // response here would invalidate every offline assertion below.
          await expect.poll(async () => {
            try { await request.get(`${url}/index.html`, { timeout: 1000 }); return 'reachable'; }
            catch { return 'stopped'; }
          }, { timeout: 5000 }).toBe('stopped');
        }
      });
    } finally {
      await stop();
    }
  }
});

export { expect };
