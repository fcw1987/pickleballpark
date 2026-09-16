// Serve committed source exactly under the project path, without building dist.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, relative } from 'node:path';
import { chromium, webkit } from '@playwright/test';
import { discoverRuntimeFiles, runtimeFileset, runtimeMatchesSource } from './stamp-build.mjs';

const metadata = JSON.parse(readFileSync('version.json', 'utf8'));
assert.equal(metadata.runtimeMatchesSource, true, 'Stamp a frozen source before verification');
assert.equal(runtimeMatchesSource('.', metadata.sourceRevision), true);
assert.equal(runtimeFileset('.').digest, metadata.runtimeSha256);
const files = new Map(discoverRuntimeFiles('.').map(file => [relative('.', file), readFileSync(file)]));
const types = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  const file = pathname.startsWith('/pickleboard/') ? pathname.slice('/pickleboard/'.length) || 'index.html' : null;
  if (!files.has(file)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  response.end(files.get(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const results = [];
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ serviceWorkers: 'allow' });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/pickleboard/`);
      await page.waitForFunction(() => window.playBuilder && !playBuilder.busy && window.pickleboard?.buildDiagnostics);
      const identity = await page.evaluate(async () => {
        const controller = pickleboard.buildDiagnostics.controller;
        const compared = await controller.queryServerBuild();
        return { running: controller.running, server: compared.server, fetch: compared.serverFetch, playing: playBuilder.session.playing };
      });
      assert.deepEqual(identity.running, metadata);
      assert.deepEqual(identity.server.identity, metadata);
      assert.equal(identity.fetch.status, 'complete');
      assert.equal(identity.fetch.cache, 'no-store');
      assert.equal(identity.playing, false);
      assert.deepEqual(errors, []);
      results.push({ browser: name, version: browser.version(), source: metadata.sourceRevision, runtimeDigest: metadata.runtimeSha256, path: '/pickleboard/version.json', runningMatchesServer: true, startsPaused: true });
    } finally { await browser.close(); }
  }
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
console.log(JSON.stringify({ status: 'PASS', delivery: 'source branch equivalent; no packaged metadata endpoint required', results }, null, 2));
