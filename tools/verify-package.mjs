// Validate the exact static artifact at the real Pages path, not a source checkout.
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';
const sha = b => createHash('sha256').update(b).digest('hex');
mkdirSync('release-results', { recursive: true });
const artifact = resolve('dist');
const manifest = JSON.parse(readFileSync(`${artifact}/runtime-manifest.json`));
const info = JSON.parse(readFileSync(`${artifact}/build-info.json`));
expect(sha(readFileSync(`${artifact}/runtime-manifest.json`))).toBe(info.runtimeManifestSha256);
const walk = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`, `${prefix}${e.name}/`) : `${prefix}${e.name}`);
expect(walk(artifact).sort()).toEqual([...manifest.files.map(f => f.path), ...info.publicationMetadata].sort());
for (const f of manifest.files) expect(sha(readFileSync(`${artifact}/${f.path}`)), f.path).toBe(f.sha256);
const prior = JSON.parse(readFileSync('tests/fixtures/prior-production.json'));
const previousCache = prior.cacheName;
const candidateCache = 'pickleboard-static-v23';
const oldFiles = new Map();
for (const f of prior.files) {
  const b = execFileSync('git', ['show', `${prior.revision}:${f.file}`], { maxBuffer: 20 * 1024 * 1024 });
  expect(sha(b), `verified previous public asset ${f.file}`).toBe(f.sha256); oldFiles.set(f.file, b);
}
const priorCachePaths = [...oldFiles.get('sw.js').toString('utf8').split('const STATIC_ASSETS = [')[1].split('];')[0].matchAll(/'\.\/([^']*)'/g)].map(m => m[1] || 'index.html');
expect([...oldFiles.keys()].filter(path => path !== 'sw.js').sort()).toEqual([...new Set(priorCachePaths)].sort());
// Also exercise the immediately preceding, reviewed builder cache and saved draft.
const builderRevision = 'd9b75d71b3836613acfd5d5c33e2d228b789ec4c';
const builderFixture = JSON.parse(execFileSync('git', ['show', `${builderRevision}:tests/fixtures/approved-runtime.json`]));
const builderFiles = new Map();
for (const f of builderFixture.files) {
  const bytes = execFileSync('git', ['show', `${builderRevision}:${f.path}`], { maxBuffer: 20 * 1024 * 1024 });
  expect(sha(bytes), `previous builder ${f.path}`).toBe(f.sha256); builderFiles.set(f.path, bytes);
}
// The completed court-centered usability pass is the direct candidate baseline.
const usabilityRevision = '4816210';
const usabilityFixture = JSON.parse(execFileSync('git', ['show', `${usabilityRevision}:tests/fixtures/approved-runtime.json`]));
const usabilityFiles = new Map();
for (const f of usabilityFixture.files) {
  const bytes = execFileSync('git', ['show', `${usabilityRevision}:${f.path}`], { maxBuffer: 20 * 1024 * 1024 });
  expect(sha(bytes), `court-centered baseline ${f.path}`).toBe(f.sha256); usabilityFiles.set(f.path, bytes);
}
// PR #17 is the direct pixel-game baseline and the owner-used preview at start.
const iphoneRevision = 'd0d5376a4a76e44a3ce381c83f61e3354bcc2241';
const iphoneFixture = JSON.parse(execFileSync('git', ['show', `${iphoneRevision}:tests/fixtures/approved-runtime.json`]));
const iphoneFiles = new Map();
for (const f of iphoneFixture.files) {
  const bytes = execFileSync('git', ['show', `${iphoneRevision}:${f.path}`], { maxBuffer: 20 * 1024 * 1024 });
  expect(sha(bytes), `iPhone baseline ${f.path}`).toBe(f.sha256); iphoneFiles.set(f.path, bytes);
}
// Preserve the exact local pixel-game candidate that entered stabilization.
const betaStartingRevision = 'd66934838a742f126cf9650b2459a5420ea917b8';
const betaStartingFixture = JSON.parse(execFileSync('git', ['show', `${betaStartingRevision}:tests/fixtures/approved-runtime.json`]));
const betaStartingFiles = new Map();
for (const f of betaStartingFixture.files) {
  const bytes = execFileSync('git', ['show', `${betaStartingRevision}:${f.path}`], { maxBuffer: 20 * 1024 * 1024 });
  expect(sha(bytes), `beta starting candidate ${f.path}`).toBe(f.sha256); betaStartingFiles.set(f.path, bytes);
}
// Also preserve saves from the interim beta package installed during this campaign.
const betaInterimRevision = 'fe7a9abc4aefb3aa1abc87cb98fcd61f5ad9e048';
const betaInterimFixture = JSON.parse(execFileSync('git', ['show', `${betaInterimRevision}:tests/fixtures/approved-runtime.json`]));
const betaInterimFiles = new Map();
for (const f of betaInterimFixture.files) {
  const bytes = execFileSync('git', ['show', `${betaInterimRevision}:${f.path}`], { maxBuffer: 20 * 1024 * 1024 });
  expect(sha(bytes), `interim beta candidate ${f.path}`).toBe(f.sha256); betaInterimFiles.set(f.path, bytes);
}
// The owner-specified stabilized engine is the compatibility checkpoint for this mission.
const stabilizedRevision = '13758356d65f154b19ca631e6ecb9bdb8afd875b';
const stabilizedFixture = JSON.parse(execFileSync('git', ['show', `${stabilizedRevision}:tests/fixtures/approved-runtime.json`]));
const stabilizedFiles = new Map();
for (const f of stabilizedFixture.files) {
  const bytes = execFileSync('git', ['show', `${stabilizedRevision}:${f.path}`], { maxBuffer: 20 * 1024 * 1024 });
  expect(sha(bytes), `stabilized checkpoint ${f.path}`).toBe(f.sha256); stabilizedFiles.set(f.path, bytes);
}
// A local preview may already have installed the interim fidelity cache. It
// must upgrade without clearing the owner's storage or leaving stale assets.
const fidelityRevision = '1d2e4cd67330d2efc444fd99868c22442222465c';
const fidelityFixture = JSON.parse(execFileSync('git', ['show', `${fidelityRevision}:tests/fixtures/approved-runtime.json`]));
const fidelityFiles = new Map();
for (const f of fidelityFixture.files) {
  const bytes = execFileSync('git', ['show', `${fidelityRevision}:${f.path}`], { maxBuffer: 20 * 1024 * 1024 });
  expect(sha(bytes), `interim fidelity candidate ${f.path}`).toBe(f.sha256); fidelityFiles.set(f.path, bytes);
}
const results = [];
const allModes = ['fresh', 'upgrade', 'builder-upgrade', 'usability-upgrade', 'iphone-upgrade', 'beta-starting-upgrade', 'beta-interim-upgrade', 'stabilized-upgrade', 'fidelity-interim-upgrade'];
const modes = process.env.QA_PACKAGE_MODE ? [process.env.QA_PACKAGE_MODE] : allModes;
if (modes.some(mode => !allModes.includes(mode))) throw Error('Unknown package verification mode');
const scopePath = new URL('https://fcw1987.github.io/pickleboard/').pathname;
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };
for (const [browserName, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
  for (const mode of modes) {
    const upgrading = mode !== 'fresh';
    const previousFiles = mode === 'fidelity-interim-upgrade' ? fidelityFiles : mode === 'stabilized-upgrade' ? stabilizedFiles : mode === 'beta-interim-upgrade' ? betaInterimFiles : mode === 'beta-starting-upgrade' ? betaStartingFiles : mode === 'iphone-upgrade' ? iphoneFiles : mode === 'builder-upgrade' ? builderFiles : mode === 'usability-upgrade' ? usabilityFiles : oldFiles;
    const priorCache = mode === 'fidelity-interim-upgrade' ? 'pickleboard-static-v23' : mode === 'stabilized-upgrade' ? 'pickleboard-static-v22' : mode === 'beta-interim-upgrade' ? 'pickleboard-static-v21' : mode === 'beta-starting-upgrade' ? 'pickleboard-static-v20' : mode === 'iphone-upgrade' ? 'pickleboard-static-v19' : mode === 'builder-upgrade' ? 'pickleboard-static-v17' : mode === 'usability-upgrade' ? 'pickleboard-static-v18' : previousCache;
    const previousRevision = mode === 'fidelity-interim-upgrade' ? fidelityRevision : mode === 'stabilized-upgrade' ? stabilizedRevision : mode === 'beta-interim-upgrade' ? betaInterimRevision : mode === 'beta-starting-upgrade' ? betaStartingRevision : mode === 'iphone-upgrade' ? iphoneRevision : mode === 'builder-upgrade' ? builderRevision : mode === 'usability-upgrade' ? usabilityRevision : prior.revision;
    let phase = upgrading ? 'old' : 'new', stopped = false;
    const server = createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (!pathname.startsWith(scopePath) || pathname.split('/').includes('..')) return res.writeHead(404).end('Not found');
      const file = pathname.slice(scopePath.length) || 'index.html';
      try {
        const bytes = phase === 'old' ? previousFiles.get(file) : readFileSync(`${artifact}/${file}`);
        if (!bytes) throw Error('Not cached in prior release');
        res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes);
      } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}${scopePath}`;
    const browser = await browserType.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(base);
      await page.waitForFunction(() => navigator.serviceWorker.controller && window.pickleboard?.plays);
      expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toBe(base);
      const oldManifest = await page.evaluate(async () => (await fetch('./manifest.json')).json());
      if (upgrading) {
        expect(await page.evaluate(() => caches.keys())).toContain(priorCache);
        await page.evaluate(async () => {
          localStorage.setItem('pickleboard-theme', 'dark');
          const unrelated = await caches.open('unrelated-application-cache'); await unrelated.put('/keep', new Response('preserve'));
          pickleboard.setTokenPosition('player1', 8.25, 12.75); pickleboard.setDrawingMode(true);
        });
        let priorDraft = null;
        if (mode === 'builder-upgrade' || mode === 'usability-upgrade' || mode === 'iphone-upgrade' || mode === 'beta-starting-upgrade' || mode === 'beta-interim-upgrade' || mode === 'stabilized-upgrade' || mode === 'fidelity-interim-upgrade') {
          await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
          priorDraft = await page.evaluate(async () => {
            await playBuilder.action('title', 'Preserved pre-update draft');
            await playBuilder.action('editShot', { field: 'target.x', value: 6.25 });
            return JSON.stringify(playBuilder.document);
          });
        }
        const before = await page.evaluate(() => pickleboard.captureBoardState());
        phase = 'new';
        await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
        await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 20000 }).toContain(candidateCache);
        if (priorCache !== candidateCache) await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 20000 }).not.toContain(priorCache);
        expect(await page.evaluate(() => pickleboard.captureBoardState())).toEqual(before);
        await page.reload(); await page.waitForFunction(() => window.pickleboard?.plays);
        if (priorDraft) {
          await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
          expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(priorDraft);
        }
        expect(await page.evaluate(() => ({ theme: localStorage.getItem('pickleboard-theme'), body: document.body.dataset.theme }))).toEqual({ theme: 'dark', body: 'dark' });
        expect(await page.evaluate(async () => (await (await caches.open('unrelated-application-cache')).match('/keep')).text())).toBe('preserve');
      }
      await expect(page).toHaveTitle('Pickleball Park - Build a Play');
      const currentManifest = await page.evaluate(async () => (await fetch('./manifest.json')).json());
      expect(currentManifest.name).toBe('Pickleball Park');
      expect({ id: currentManifest.id, start_url: currentManifest.start_url }).toEqual({ id: oldManifest.id, start_url: oldManifest.start_url });
      const checks = await page.evaluate(async ({ files, scopePath, candidateCache }) => {
        const cache = await caches.open(candidateCache);
        const digest = async r => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await r.arrayBuffer()))).map(v => v.toString(16).padStart(2, '0')).join('');
        const all = [];
        for (const f of files) {
          const r = await fetch(`./${f.path}`); if (!r.ok) throw Error(`HTTP ${r.status}: ${f.path}`);
          all.push({ path: f.path, sha256: await digest(r), type: r.headers.get('content-type') });
        }
        const cached = [];
        for (const request of await cache.keys()) {
          const path = new URL(request.url).pathname.slice(scopePath.length) || 'index.html';
          cached.push({ path, sha256: await digest(await cache.match(request)) });
        }
        return { all, cached };
      }, { files: manifest.files, scopePath, candidateCache });
      for (const f of checks.all) {
        expect(f.sha256, f.path).toBe(manifest.files.find(e => e.path === f.path).sha256);
        if (f.path.endsWith('.js')) expect(f.type).toContain('javascript');
        if (f.path.endsWith('.png')) expect(f.type).toBe('image/png');
        if (f.path.endsWith('.ttf')) expect(f.type).toBe('font/ttf');
      }
      for (const f of checks.cached) expect(f.sha256, `cached ${f.path}`).toBe(manifest.files.find(e => e.path === f.path)?.sha256);
      const declaredCachePaths = [...readFileSync(`${artifact}/sw.js`, 'utf8').split('const STATIC_ASSETS = [')[1].split('];')[0].matchAll(/'\.\/([^']*)'/g)].map(m => m[1] || 'index.html');
      expect(checks.cached.map(f => f.path).sort()).toEqual(declaredCachePaths.sort());
      const missing = await context.request.get(`${base}missing-asset.png`); expect(missing.status()).toBe(404);
      // Exercise the shipped default builder with one saved custom edit and both renderers.
      await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
      expect(await page.evaluate(async()=>{const faces=await document.fonts.load('20px "Park Labels"');return faces.length===1&&faces[0].status==='loaded';})).toBe(true);
      expect(await page.evaluate(()=>playBuilder.session.playing)).toBe(false);
      const builderProof = await page.evaluate(async () => {
        const b = playBuilder;
        await b.action('title', 'Package offline custom rally');
        await b.action('editShot', { field: 'target.x', value: 6.5 });
        const source = JSON.stringify(b.document);
        b.seek(Math.min(1.25, b.session.duration));
        await b.switchView('2d');
        await b.switchView('3d');
        await b.setWorkspace('planner');
        b.board.updateTokenPosition(b.board.tokens.player1, 8.25, 12.75);
        const planner = b.board.captureBoardState();
        await b.setWorkspace('builder');
        return { source: JSON.stringify(b.document), time: b.session.clock.elapsed, planner, view: b.view };
      });
      expect(builderProof.source).toBe(await page.evaluate(() => JSON.stringify(playBuilder.document)));
      expect(JSON.parse(builderProof.source).title).toBe('Package offline custom rally');
      expect(builderProof.time).toBeCloseTo(1.25, 8);
      expect(builderProof.view).toBe('3d');
      await page.screenshot({ path: `release-results/package-${browserName}-${mode}.png` });
      // Real offline: close only this test's server. Do not use setOffline emulation.
      server.closeAllConnections(); await new Promise(r => server.close(r)); stopped = true;
      await page.reload(); await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
      expect(await page.evaluate(async()=>{const faces=await document.fonts.load('20px "Park Labels"');return faces.length===1&&faces[0].status==='loaded';})).toBe(true);
      expect(await page.evaluate(()=>playBuilder.session.playing)).toBe(false);
      expect(await page.evaluate(() => ({ title: playBuilder.document.title, target: playBuilder.document.shots[0].target.x }))).toEqual({ title: 'Package offline custom rally', target: 6.5 });
      const ids = await page.evaluate(() => pickleboard.plays.list().map(p => p.id)); expect(ids).toHaveLength(8);
      for (const id of ids) {
        const lesson = await page.evaluate(async id => {
          const b = playBuilder;
          await b.setWorkspace('planner');
          const planner = b.board.captureBoardState();
          await b.action('template', id);
          await b.switchView('3d');
          const proof = { id: b.document.templateSource?.templateId, active: b.board.threeD.active, shots: b.document.shots.length, valid:b.compiled.validShotCount, chapters:b.chapters.length, paused:!b.session.playing };
          b.play();proof.canPlay=b.session.playing;b.pause();
          await b.switchView('2d');
          await b.setWorkspace('planner');
          proof.plannerRestored = JSON.stringify(b.board.captureBoardState()) === JSON.stringify(planner);
          return proof;
        }, id);
        expect(lesson).toMatchObject({ id, active: true, plannerRestored: true, paused:true, canPlay:true });
        expect(lesson.shots).toBeGreaterThan(0);
        expect(lesson.valid).toBe(lesson.shots);expect(lesson.chapters).toBe(lesson.shots);
      }
      await expect(page.locator('#threeDCanvas canvas')).toHaveCount(0); expect(errors).toEqual([]);
      results.push({ browser: browserName, mode, status: 'PASS', runtimeHashes: checks.all.length, cacheEntries: checks.cached.length, offlineCustomReload: true, offlineLessons: ids.length, offlineMethod: 'owned server stopped', source: info.revision, previousPublicSource: upgrading ? previousRevision : null });
    } catch (e) { results.push({ browser: browserName, mode, status: 'FAIL', error: e.message }); throw e; }
    finally { await browser.close(); if (!stopped) { server.closeAllConnections(); await new Promise(r => server.close(r)); } mkdirSync('release-results', { recursive: true }); writeFileSync('release-results/package-verification.json', JSON.stringify(results, null, 2)); }
  }
}
console.log(JSON.stringify(results, null, 2));
