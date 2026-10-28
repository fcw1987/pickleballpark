// Validate the exact static artifact at the real Pages path, not a source checkout.
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, extname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';
import { protectedPinScenario } from '../tests/fixtures/smart-coach-scenarios.mjs';
import { validateDeploymentArtifact } from './verify-deployment-artifact.mjs';
import { createRuntimePackage } from './runtime-package.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');
const gitBytes = (revision, file) => execFileSync('git', ['show', `${revision}:${file}`], { maxBuffer: 20 * 1024 * 1024 });
const gitText = (revision, file) => gitBytes(revision, file).toString('utf8');
const runtimeInventory = revision => execFileSync('git', ['ls-tree', '-r', '--name-only', revision], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
  .filter(file => /^(?:[^/]+\.(?:js|css|html)|manifest\.json|assets\/|icons\/|vendor\/)/.test(file))
  .filter(file => !file.startsWith('assets/source/'));
const serviceWorkerAssets = text => [...text.matchAll(/['"]\.\/([^'"]*)['"]/g)].map(match => match[1] || 'index.html');
const serviceWorkerCache = text => text.match(/pickleboard-static-(v\d+)/)?.[1]
  || text.match(/(?:STATIC_CACHE|CACHE_NAME)\s*=\s*`[^`]*?(v\d+)`/)?.[1]
  || text.match(/(?:STATIC_CACHE|CACHE_NAME)\s*=\s*['"][^'"]*?(v\d+)['"]/)?.[1]
  || null;
mkdirSync('release-results', { recursive: true });
const artifact = resolve('dist');
const manifest = JSON.parse(readFileSync(`${artifact}/runtime-manifest.json`));
const info = JSON.parse(readFileSync(`${artifact}/build-info.json`));
validateDeploymentArtifact(artifact, info.revision);
expect(sha(readFileSync(`${artifact}/runtime-manifest.json`))).toBe(info.runtimeManifestSha256);
const walk = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`, `${prefix}${e.name}/`) : `${prefix}${e.name}`);
expect(walk(artifact).sort()).toEqual([...manifest.files.map(f => f.path), ...info.publicationMetadata].sort());
for (const f of manifest.files) expect(sha(readFileSync(`${artifact}/${f.path}`)), f.path).toBe(f.sha256);
const prior = JSON.parse(readFileSync('tests/fixtures/prior-production.json'));
const previousCache = prior.cacheName;
const candidateCacheVersion = serviceWorkerCache(readFileSync(`${artifact}/sw.js`, 'utf8'));
if (!candidateCacheVersion) throw Error('Candidate service worker does not declare a versioned static cache');
const candidateCache = `pickleboard-static-${candidateCacheVersion}`;
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
// The owner-tested Pages deployment is the public robustness/fidelity branch.
// Its approved-runtime fixture on this branch predates the public package and
// does not describe the exact v23 source, so derive the old server from the
// checked-in service-worker asset list and verify it against the full source
// inventory before hashing every byte.
// Historical branch aliases may be removed or move. The immutable commit and
// the complete source inventory/hash checks below establish this fixture.
const publicRevision = 'b2b36e2f5c4ad542cdf43a2a03cf1a1f7db27585';
expect(execFileSync('git', ['rev-parse', `${publicRevision}^{commit}`], { encoding: 'utf8' }).trim(), 'frozen public commit must exist').toBe(publicRevision);
const publicServiceWorker = gitText(publicRevision, 'sw.js');
const publicSwPaths = [...new Set(serviceWorkerAssets(publicServiceWorker))];
const publicInventory = runtimeInventory(publicRevision);
const publicSwInventory = publicInventory.filter(file => publicSwPaths.includes(file));
expect(publicSwPaths.slice().sort(), 'public service-worker paths must be source paths').toEqual(publicSwInventory.slice().sort());
const publicFiles = new Map();
for (const file of publicSwPaths) {
  const bytes = gitBytes(publicRevision, file);
  publicFiles.set(file, bytes);
}
publicFiles.set('sw.js', gitBytes(publicRevision, 'sw.js'));
expect(publicFiles.size).toBe(publicSwPaths.length + 1);
expect(candidateCache, 'candidate must advance the public v23 cache pin').not.toBe('pickleboard-static-v23');
// The owner's unpublished Smart Rally checkout is the direct art-overhaul baseline.
// Verify its exact v24 shell and saved authoring document, not only public v23.
const smartRevision = 'fc46c60f83ed8b1a2bd4ee186e05f7ab55e3a717';
const smartFiles = new Map();
for (const file of new Set(serviceWorkerAssets(gitText(smartRevision, 'sw.js'))))
  smartFiles.set(file, gitBytes(smartRevision, file));
smartFiles.set('sw.js', gitBytes(smartRevision, 'sw.js'));
// The owner-reviewed dimensional-art candidate is also an upgrade source.
const artRevision = '08401fca5150f1ccfcb482a50953b5bbd340fe6a';
const artFiles = new Map();
for (const file of new Set(serviceWorkerAssets(gitText(artRevision, 'sw.js'))))
  artFiles.set(file, gitBytes(artRevision, file));
artFiles.set('sw.js', gitBytes(artRevision, 'sw.js'));
// Preserve the first reviewed human-village candidate while optimizing its renderer.
const townRevision = '3751cef343062667a2413d0add95bcb134331311';
const townFiles = new Map();
for (const file of new Set(serviceWorkerAssets(gitText(townRevision, 'sw.js'))))
  townFiles.set(file, gitBytes(townRevision, file));
townFiles.set('sw.js', gitBytes(townRevision, 'sw.js'));
// Preserve saves from the first local color/depth-cache candidate (v27).
const cacheRevision = '8aafabf9401d4fad3f807bcc16a7ecea27606444';
const cacheFiles = new Map();
for (const file of new Set(serviceWorkerAssets(gitText(cacheRevision, 'sw.js'))))
  cacheFiles.set(file, gitBytes(cacheRevision, file));
cacheFiles.set('sw.js', gitBytes(cacheRevision, 'sw.js'));
// Preserve the owner's accepted environment, compact cache, and saved plays (v28).
const strokeRevision = 'ac7ca5ff3a3022de3cb4ba843f2111b0f53987db';
const strokeFiles = new Map();
for (const file of new Set(serviceWorkerAssets(gitText(strokeRevision, 'sw.js'))))
  strokeFiles.set(file, gitBytes(strokeRevision, file));
strokeFiles.set('sw.js', gitBytes(strokeRevision, 'sw.js'));
// The immediately preceding stroke candidate may already be installed locally.
const strokeContactRevision = 'a951019ab0833dc11277dfd1e6199c69c4477978';
const strokeContactFiles = new Map();
for (const file of new Set(serviceWorkerAssets(gitText(strokeContactRevision, 'sw.js'))))
  strokeContactFiles.set(file, gitBytes(strokeContactRevision, file));
strokeContactFiles.set('sw.js', gitBytes(strokeContactRevision, 'sw.js'));
// Upgrade the exact frozen Pickleboard v30 package to the Pickleball Park display name.
const brandingRevision = '2b4559abe460681e166d2d1a883119c0504b841d';
const brandingServiceWorker = gitText(brandingRevision, 'sw.js');
expect(serviceWorkerCache(brandingServiceWorker), 'frozen branding baseline cache').toBe('v30');
const brandingFiles = new Map();
for (const file of new Set(serviceWorkerAssets(brandingServiceWorker)))
  brandingFiles.set(file, gitBytes(brandingRevision, file));
brandingFiles.set('sw.js', gitBytes(brandingRevision, 'sw.js'));

const packageProtectedCoachFixture = protectedPinScenario();

async function verifyPackageIdentity(page, context, base, sourceRevision) {
  const endpoint = `${base}version.json?diagnostic=package-${Date.now()}`;
  const response = await context.request.get(endpoint);
  expect(response.status(), 'version endpoint under the project subpath').toBe(200);
  const serverIdentity = await response.json();
  const moduleResponse = await page.evaluate(async () => {
    const response = await fetch(`./build-identity.js?diagnostic=package-${Date.now()}`);
    return { ok: response.ok, status: response.status, contentType: response.headers.get('content-type') };
  });
  expect(moduleResponse, 'build identity module must be loadable at the project subpath').toMatchObject({ ok: true, status: 200 });
  const loaded = await page.evaluate(async () => {
    try {
      const identity = await import(`./build-identity.js?diagnostic=package-${Date.now()}`);
      return identity.BUILD_IDENTITY;
    } catch (error) {
      const metadata = await fetch(`./build-metadata.js?diagnostic=package-${Date.now()}`).then(response => response.text());
      throw Error(`${error.message}; metadata=${metadata.slice(0, 240)}`);
    }
  });
  expect(new URL(page.url()).pathname).toBe(scopePath);
  expect(loaded.sourceRevision).toBe(sourceRevision);
  expect(serverIdentity.sourceRevision).toBe(sourceRevision);
  expect(loaded).toEqual(serverIdentity);
  const queried = await page.evaluate(async () => {
    const [{ BUILD_IDENTITY }, { createBuildDiagnostics }] = await Promise.all([
      import('./build-identity.js'), import('./build-diagnostics.js')
    ]);
    const controller = createBuildDiagnostics({ loadedIdentity: BUILD_IDENTITY });
    return controller.queryServerBuild();
  });
  expect(queried.serverFetch).toMatchObject({ status: 'complete', cache: 'no-store', path: './version.json' });
  expect(queried.server.identity).toEqual(serverIdentity);
  return { loaded, server: serverIdentity, queried: queried.serverFetch };
}

async function verifySmartRallyOffline(page, expectedSavedKey = 'pickleballpark-builder-v1') {
  const storageBefore = await page.evaluate(key => localStorage.getItem(key), expectedSavedKey);
  const beforeId = await page.evaluate(() => playBuilder.document.id);
  await page.evaluate(id => { window.__packageSmartBeforeId = id; }, beforeId);
  const openMainMenu = async () => {
    const menu = page.locator('.builder-main-menu');
    await menu.evaluate(element => { element.open = false; });
    await menu.locator(':scope > summary').click({ force: true });
    await expect.poll(() => menu.evaluate(element => element.open)).toBe(true);
  };

  // Use the visible New Play and Add controls so the package check covers the
  // same authoring path a user uses, while the final counts inspect the model.
  await openMainMenu();
  await page.locator('.builder-document-menu > summary').click();
  await page.locator('[data-action="new"]').click();
  await expect.poll(() => page.evaluate(() => playBuilder.document.shots.length)).toBe(0);
  for (let index = 1; index <= 5; index += 1) {
    await page.getByRole('button', { name: 'Add shot' }).click();
    await expect.poll(() => page.evaluate(() => playBuilder.document.shots.length)).toBe(index);
  }
  const adds = await page.evaluate(() => ({
    shots: playBuilder.document.shots.length,
    valid: playBuilder.compiled.validShotCount,
    ids: playBuilder.document.shots.map(shot => shot.id),
    playing: playBuilder.session.playing,
  }));
  expect(adds).toMatchObject({ shots: 5, valid: 5, playing: false });
  expect(new Set(adds.ids).size).toBe(5);

  // Open Random Rally through Menu, enter the exact 99-hit boundary, and
  // assert the old draft is retained in the local saved library.
  await openMainMenu();
  await page.locator('[data-action="random"]').click();
  await page.locator('[data-action="random-count"]').fill('99');
  await page.locator('[data-action="random-seed"]').fill('12648430');
  await page.locator('[data-action="random-rally"]').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => playBuilder.document.shots.length), { timeout: 30_000 }).toBe(99);
  const random = await page.evaluate(key => {
    const envelope = JSON.parse(localStorage.getItem(key));
    return {
      id: playBuilder.document.id,
      shots: playBuilder.document.shots.length,
      valid: playBuilder.compiled.validShotCount,
      chapters: playBuilder.chapters.length,
      generation: playBuilder.document.generation,
      retainedOldDraft: envelope.drafts.some(draft => draft.id !== playBuilder.document.id),
      oldBeforeSmart: envelope.drafts.some(draft => draft.id === window.__packageSmartBeforeId),
      playing: playBuilder.session.playing,
    };
  }, expectedSavedKey);
  expect(random).toMatchObject({ shots: 99, valid: 99, chapters: 99, retainedOldDraft: true, playing: false });
  expect(random.oldBeforeSmart).toBe(true);
  expect(random.generation).toMatchObject({ seed: 12648430, generatorVersion: 'smart-rally-v2' });

  // A real invalid authored rally is opened through the public Coach controls.
  // The protected pin stays unchanged while visible Fix/Show options and an
  // explicitly consented Apply action exercise the consent boundary offline.
  await page.evaluate(fixture => playBuilder.loadDocument(fixture), packageProtectedCoachFixture);
  await expect(page.locator('[data-action="review-findings"]')).toHaveCount(1, { timeout: 15_000 });
  const protectedBefore = await page.evaluate(() => structuredClone(playBuilder.document));
  await page.locator('[data-action="review-findings"]').click();
  await page.getByRole('button', { name: 'Fix for me' }).click();
  await expect.poll(() => page.evaluate(() => playBuilder.proposalBusy)).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(JSON.stringify(protectedBefore));
  await page.getByRole('button', { name: 'Show options' }).click();
  await expect.poll(() => page.locator('[data-action="coach-apply"]').count(), { timeout: 15_000 }).toBeGreaterThan(0);

  // Apply one evaluated Coach option through the visible control and use the
  // visible Undo control to prove the repair remains one transaction.
  const beforeCoach = await page.evaluate(() => structuredClone(playBuilder.document));
  await page.locator('[data-action="coach-apply"]').first().click();
  const fixed = await page.evaluate(() => ({ document: structuredClone(playBuilder.document), valid: playBuilder.compiled.validShotCount }));
  expect(fixed.valid).toBe(fixed.document.shots.length);
  expect(fixed.document.shots.length).toBe(beforeCoach.shots.length);
  expect(JSON.stringify(fixed.document)).not.toBe(JSON.stringify(beforeCoach));
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(JSON.stringify(beforeCoach));

  const storageAfter = await page.evaluate(key => localStorage.getItem(key), expectedSavedKey);
  expect(storageAfter).not.toBeNull();
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: expectedSavedKey, value: storageBefore });
  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  return { adds, random, coach: { protectedKept: true, optionsShown: true, fixed: true, undoRestored: true }, restoredSavedLibrary: storageAfter !== storageBefore };
}

// This is a path move on one origin, rather than an in-place worker update.
// Desktop engines verify registration/manifest identities; they do not install
// an operating-system home-screen shortcut or claim that its old URL redirects.
async function verifyPathMigration(browserName, browserType, mode) {
  const baselineFiles = mode === 'branding-path-migration' ? brandingFiles : publicFiles;
  const baselineRevision = mode === 'branding-path-migration' ? brandingRevision : publicRevision;
  const baselineCache = `pickleboard-static-${serviceWorkerCache(baselineFiles.get('sw.js').toString())}`;
  let legacyAvailable = true, stopped = false;
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    if (pathname.split('/').includes('..')) return response.writeHead(404).end();
    const legacy = pathname.startsWith(legacyScopePath);
    const prefix = legacy ? legacyScopePath : scopePath;
    if ((!legacy && !pathname.startsWith(scopePath)) || (legacy && !legacyAvailable)) return response.writeHead(404).end('Old project path is no longer hosted');
    const file = pathname.slice(prefix.length) || 'index.html';
    try {
      const bytes = legacy ? baselineFiles.get(file) : readFileSync(`${artifact}/${file}`);
      if (!bytes) throw Error('Missing asset');
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const oldBase = origin + legacyScopePath, newBase = origin + scopePath;
  const browser = await browserType.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const oldPage = await context.newPage();
    const errors = [];
    oldPage.on('pageerror', error => errors.push(error.message));
    await oldPage.goto(oldBase);
    await oldPage.waitForFunction(() => navigator.serviceWorker.controller && window.playBuilder && !playBuilder.busy);
    const oldManifest = await oldPage.evaluate(async () => (await fetch('./manifest.json')).json());
    expect(Object.hasOwn(oldManifest, 'id'), 'historical manifest uses its implicit start URL identity').toBe(false);
    await oldPage.evaluate(async () => {
      await playBuilder.action('title', 'Preserved project-path migration draft');
      await playBuilder.action('editShot', { field: 'target.x', value: 6.25 });
      localStorage.setItem('pickleboard-theme', 'dark');
      localStorage.setItem('migration-unrelated-key', 'keep this origin data');
      const unrelated = await caches.open('unrelated-application-cache');
      await unrelated.put('/keep', new Response('preserve'));
    });
    const before = await oldPage.evaluate(async cacheName => {
      const cache = await caches.open(cacheName);
      const entries = [];
      for (const request of await cache.keys()) {
        const bytes = await (await cache.match(request)).arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('');
        entries.push({ url: request.url, sha256: digest });
      }
      return { storage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])), draft: JSON.stringify(playBuilder.document), entries: entries.sort((a, b) => a.url.localeCompare(b.url)) };
    }, baselineCache);
    expect(before.storage['pickleballpark-builder-v1']).toBeTruthy();
    expect(before.entries.length).toBeGreaterThan(0);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(newBase);
    await page.waitForFunction(() => navigator.serviceWorker.controller && window.playBuilder && !playBuilder.busy);
    await expect(page).toHaveTitle('Pickleball Park - Build a Play');
    const after = await page.evaluate(async ({ baselineCache, candidateCache }) => {
      const manifest = await (await fetch('./manifest.json')).json();
      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheNames = await caches.keys();
      const oldEntries = [];
      if (cacheNames.includes(baselineCache)) {
        const cache = await caches.open(baselineCache);
        for (const request of await cache.keys()) {
          const bytes = await (await cache.match(request)).arrayBuffer();
          const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('');
          oldEntries.push({ url: request.url, sha256: digest });
        }
      }
      return {
        manifest, controller: navigator.serviceWorker.controller.scriptURL,
        registrations: registrations.map(registration => ({ scope: registration.scope, worker: registration.active?.scriptURL })).sort((a, b) => a.scope.localeCompare(b.scope)),
        storage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
        draft: JSON.stringify(playBuilder.document), theme: document.body.dataset.theme, caches: cacheNames,
        oldEntries: oldEntries.sort((a, b) => a.url.localeCompare(b.url)),
        currentCacheEntries: (await (await caches.open(candidateCache)).keys()).map(request => request.url),
        unrelatedCache: await (await (await caches.open('unrelated-application-cache')).match('/keep')).text(),
      };
    }, { baselineCache, candidateCache });
    expect(after.storage, 'origin storage must survive the path move byte for byte').toEqual(before.storage);
    expect(after.draft, 'real saved draft must reopen at the new project path').toBe(before.draft);
    expect(after.theme).toBe('dark');
    expect(after.registrations).toEqual([
      { scope: newBase, worker: `${newBase}sw.js` }, { scope: oldBase, worker: `${oldBase}sw.js` }
    ].sort((a, b) => a.scope.localeCompare(b.scope)));
    expect(after.controller).toBe(`${newBase}sw.js`);
    expect(after.caches).toEqual(expect.arrayContaining([baselineCache, candidateCache, 'unrelated-application-cache']));
    expect(after.oldEntries, 'installing at the new path must retain the old offline shell bytes').toEqual(before.entries);
    expect(after.unrelatedCache).toBe('preserve');
    expect(after.currentCacheEntries.length).toBeGreaterThan(0);
    expect(after.currentCacheEntries.every(url => url.startsWith(newBase))).toBe(true);
    expect(Object.hasOwn(after.manifest, 'id')).toBe(false);
    expect(Object.hasOwn(oldManifest, 'scope')).toBe(false);
    expect(Object.hasOwn(after.manifest, 'scope')).toBe(false);
    const oldInstallIdentity = new URL(oldManifest.start_url, `${oldBase}manifest.json`).href;
    const newInstallIdentity = new URL(after.manifest.start_url, `${newBase}manifest.json`).href;
    expect(oldInstallIdentity).toBe(`${oldBase}index.html`);
    expect(newInstallIdentity).toBe(`${newBase}index.html`);
    expect(newInstallIdentity, 'the path move creates a distinct implicit manifest identity').not.toBe(oldInstallIdentity);
    const hashes = await page.evaluate(async files => {
      const results = [];
      for (const file of files) {
        const response = await fetch(`./${file.path}`);
        if (!response.ok) throw Error(`${file.path}: HTTP ${response.status}`);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))).map(value => value.toString(16).padStart(2, '0')).join('');
        results.push({ path: file.path, sha256: digest });
      }
      return results;
    }, manifest.files);
    expect(hashes).toEqual(manifest.files.map(file => ({ path: file.path, sha256: file.sha256 })));
    const identity = await verifyPackageIdentity(page, context, newBase, info.sourceRevision);
    legacyAvailable = false;
    const oldShortcut = await context.request.get(oldBase);
    expect(oldShortcut.status(), 'an old hosted shortcut has no automatic project-path redirect').toBe(404);
    await page.screenshot({ path: `release-results/package-${browserName}-${mode}.png` });
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); stopped = true;
    await page.reload();
    await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
    expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(before.draft);
    expect(await page.evaluate(() => document.body.dataset.theme)).toBe('dark');
    // The old installed worker retains its own offline fallback; a real HTTP 404
    // above is deliberately not disguised as an offline navigation success.
    await oldPage.reload();
    await oldPage.waitForFunction(() => window.playBuilder && !playBuilder.busy);
    expect(await oldPage.evaluate(() => JSON.stringify(playBuilder.document))).toBe(before.draft);
    expect(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])))).toEqual(before.storage);
    expect(errors).toEqual([]);
    return { browser: browserName, mode, status: 'PASS', priorSource: baselineRevision, source: info.sourceRevision, oldPath: legacyScopePath, newPath: scopePath, runtimeHashes: hashes.length, preservedOldCacheEntries: before.entries.length, oldCache: baselineCache, newCache: candidateCache, savedDraftAndStoragePreserved: true, theme: after.theme, distinctWorkerScopes: after.registrations, implicitManifestIdentities: { old: oldInstallIdentity, current: newInstallIdentity }, legacyShortcutNetworkStatus: oldShortcut.status(), shortcutLimitation: 'The old hosted path returns 404; users must open the new URL and install a new shortcut. Retained old offline caches do not redirect online HTTP 404 responses.', offlineReloads: ['old path', 'new path'], offlineMethod: 'owned server stopped', identity };
  } finally {
    await browser.close();
    if (!stopped) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
}

// Exact reviewed local depth checkpoint; this is an upgrade fixture, not a release stamp.
const depthRevision = 'e8f870a50a36325f3bcc946a412899c5e8197be4';
const depthFiles = new Map(runtimeInventory(depthRevision).map(file => [file, gitBytes(depthRevision, file)]));
const depthCache = `pickleboard-static-${serviceWorkerCache(depthFiles.get('sw.js').toString('utf8'))}`;

// Actual prior Pages source (confirmed separately through the Pages API).
// Rebuild generated publication metadata; retained root stamps are historical.
const liveRevision = 'e765b0160c23a600680b3323f6bb50d09da3e17c';
const liveRoot = mkdtempSync(join(tmpdir(), 'pickleballpark-live-upgrade-'));
let liveFiles;
try {
  for (const file of [...runtimeInventory(liveRevision), 'tools/runtime-files.json']) {
    mkdirSync(dirname(join(liveRoot, file)), { recursive: true });
    writeFileSync(join(liveRoot, file), gitBytes(liveRevision, file));
  }
  // Read-only Git object access permits exact commit checks in the temporary tree.
  writeFileSync(join(liveRoot, '.git'), `gitdir: ${execFileSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim()}\n`);
  for (const file of ['tools/runtime-package.mjs', 'tools/stamp-build.mjs']) expect(readFileSync(file).equals(gitBytes(liveRevision, file)), `historical package algorithm ${file}`).toBe(true);
  const packaged = createRuntimePackage({ sourceRoot: liveRoot, revision: liveRevision, requireCommittedSource: true, verifyVendor: false });
  expect(packaged.info.sourceState).toBe('clean');
  expect(packaged.metadata.sourceRevision).toBe(liveRevision);
  liveFiles = packaged.files;
} finally { rmSync(liveRoot, { recursive: true, force: true }); }
const liveCache = `pickleboard-static-${serviceWorkerCache(liveFiles.get('sw.js').toString('utf8'))}`;
expect(liveCache, 'actual prior live cache').toBe('pickleboard-static-v33');

// Exact v35 preview publication candidate; its predecessor never deployed.
// Reconstruct this immutable commit with its historical packaging algorithms.
const previewRevision = 'af8ea7cbb7b603966c11623ef58d9ab2bda1792d';
const previewRoot = mkdtempSync(join(tmpdir(), 'pickleballpark-preview-upgrade-'));
let previewFiles;
try {
  for (const file of [...runtimeInventory(previewRevision), 'tools/runtime-files.json']) {
    mkdirSync(dirname(join(previewRoot, file)), { recursive: true });
    writeFileSync(join(previewRoot, file), gitBytes(previewRevision, file));
  }
  // Read-only Git object access permits exact commit checks in the temporary tree.
  writeFileSync(join(previewRoot, '.git'), `gitdir: ${execFileSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim()}\n`);
  for (const file of ['tools/runtime-package.mjs', 'tools/stamp-build.mjs']) expect(readFileSync(file).equals(gitBytes(previewRevision, file)), `historical package algorithm ${file}`).toBe(true);
  const packaged = createRuntimePackage({ sourceRoot: previewRoot, revision: previewRevision, requireCommittedSource: true, verifyVendor: false });
  expect(packaged.info.sourceState).toBe('clean');
  expect(packaged.metadata.sourceRevision).toBe(previewRevision);
  previewFiles = packaged.files;
} finally { rmSync(previewRoot, { recursive: true, force: true }); }
const previewCache = `pickleboard-static-${serviceWorkerCache(previewFiles.get('sw.js').toString('utf8'))}`;
expect(previewCache, 'immutable owner-tested preview cache').toBe('pickleboard-static-v35');

expect(candidateCache, 'candidate must advance the owner-tested preview cache').not.toBe(previewCache);

const results = [];
const allModes = ['fresh', 'preview-upgrade', 'live-upgrade', 'depth-upgrade', 'upgrade', 'builder-upgrade', 'usability-upgrade', 'iphone-upgrade', 'beta-starting-upgrade', 'beta-interim-upgrade', 'stabilized-upgrade', 'fidelity-interim-upgrade', 'public-upgrade', 'smart-upgrade', 'art-upgrade', 'town-upgrade', 'cache-upgrade', 'stroke-upgrade', 'stroke-contact-upgrade', 'branding-upgrade', 'path-migration', 'branding-path-migration'];
const modes = process.env.QA_PACKAGE_MODE ? [process.env.QA_PACKAGE_MODE] : allModes;
if (modes.some(mode => !allModes.includes(mode))) throw Error('Unknown package verification mode');
const scopePath = new URL('https://fcw1987.github.io/pickleballpark/').pathname;
const legacyScopePath = '/pickleboard/';
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };
for (const [browserName, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
  for (const mode of modes) {
    if (mode === 'path-migration' || mode === 'branding-path-migration') {
      try { results.push(await verifyPathMigration(browserName, browserType, mode)); }
      catch (error) { results.push({ browser: browserName, mode, status: 'FAIL', error: error.message }); throw error; }
      finally { writeFileSync('release-results/package-verification.json', JSON.stringify(results, null, 2)); }
      continue;
    }
    const upgrading = mode !== 'fresh';
    const previousFiles = mode === 'preview-upgrade' ? previewFiles : mode === 'live-upgrade' ? liveFiles : mode === 'depth-upgrade' ? depthFiles : mode === 'branding-upgrade' ? brandingFiles : mode === 'stroke-contact-upgrade' ? strokeContactFiles : mode === 'stroke-upgrade' ? strokeFiles : mode === 'cache-upgrade' ? cacheFiles : mode === 'town-upgrade' ? townFiles : mode === 'art-upgrade' ? artFiles : mode === 'smart-upgrade' ? smartFiles : mode === 'public-upgrade' ? publicFiles : mode === 'fidelity-interim-upgrade' ? fidelityFiles : mode === 'stabilized-upgrade' ? stabilizedFiles : mode === 'beta-interim-upgrade' ? betaInterimFiles : mode === 'beta-starting-upgrade' ? betaStartingFiles : mode === 'iphone-upgrade' ? iphoneFiles : mode === 'builder-upgrade' ? builderFiles : mode === 'usability-upgrade' ? usabilityFiles : oldFiles;
    const priorCache = mode === 'preview-upgrade' ? previewCache : mode === 'live-upgrade' ? liveCache : mode === 'depth-upgrade' ? depthCache : mode === 'branding-upgrade' ? 'pickleboard-static-v30' : mode === 'stroke-contact-upgrade' ? 'pickleboard-static-v29' : mode === 'stroke-upgrade' ? 'pickleboard-static-v28' : mode === 'cache-upgrade' ? 'pickleboard-static-v27' : mode === 'town-upgrade' ? 'pickleboard-static-v26' : mode === 'art-upgrade' ? 'pickleboard-static-v25' : mode === 'smart-upgrade' ? 'pickleboard-static-v24' : mode === 'public-upgrade' ? 'pickleboard-static-v23' : mode === 'fidelity-interim-upgrade' ? 'pickleboard-static-v23' : mode === 'stabilized-upgrade' ? 'pickleboard-static-v22' : mode === 'beta-interim-upgrade' ? 'pickleboard-static-v21' : mode === 'beta-starting-upgrade' ? 'pickleboard-static-v20' : mode === 'iphone-upgrade' ? 'pickleboard-static-v19' : mode === 'builder-upgrade' ? 'pickleboard-static-v17' : mode === 'usability-upgrade' ? 'pickleboard-static-v18' : previousCache;
    const previousRevision = mode === 'preview-upgrade' ? previewRevision : mode === 'live-upgrade' ? liveRevision : mode === 'depth-upgrade' ? depthRevision : mode === 'branding-upgrade' ? brandingRevision : mode === 'stroke-contact-upgrade' ? strokeContactRevision : mode === 'stroke-upgrade' ? strokeRevision : mode === 'cache-upgrade' ? cacheRevision : mode === 'town-upgrade' ? townRevision : mode === 'art-upgrade' ? artRevision : mode === 'smart-upgrade' ? smartRevision : mode === 'public-upgrade' ? publicRevision : mode === 'fidelity-interim-upgrade' ? fidelityRevision : mode === 'stabilized-upgrade' ? stabilizedRevision : mode === 'beta-interim-upgrade' ? betaInterimRevision : mode === 'beta-starting-upgrade' ? betaStartingRevision : mode === 'iphone-upgrade' ? iphoneRevision : mode === 'builder-upgrade' ? builderRevision : mode === 'usability-upgrade' ? usabilityRevision : prior.revision;
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
      if (mode === 'branding-upgrade') {
        await expect(page).toHaveTitle('Pickleboard - Build a Play');
        expect(oldManifest).toMatchObject({ name: 'Pickleboard', short_name: 'Pickleboard', start_url: './index.html' });
        expect(Object.hasOwn(oldManifest, 'id'), 'previous install has no explicit manifest id').toBe(false);
        expect(candidateCache, 'branding update must replace the frozen v30 cache').not.toBe(priorCache);
      }
      if (upgrading) {
        expect(await page.evaluate(() => caches.keys())).toContain(priorCache);
        await page.evaluate(async () => {
          localStorage.setItem('pickleboard-theme', 'dark');
          const unrelated = await caches.open('unrelated-application-cache'); await unrelated.put('/keep', new Response('preserve'));
          pickleboard.setTokenPosition('player1', 8.25, 12.75); pickleboard.setDrawingMode(true);
        });
        let priorDraft = null;
        if (mode === 'preview-upgrade' || mode === 'live-upgrade' || mode === 'depth-upgrade' || mode === 'builder-upgrade' || mode === 'usability-upgrade' || mode === 'iphone-upgrade' || mode === 'beta-starting-upgrade' || mode === 'beta-interim-upgrade' || mode === 'stabilized-upgrade' || mode === 'fidelity-interim-upgrade' || mode === 'public-upgrade' || mode === 'smart-upgrade' || mode === 'art-upgrade' || mode === 'town-upgrade' || mode === 'cache-upgrade' || mode === 'stroke-upgrade' || mode === 'stroke-contact-upgrade' || mode === 'branding-upgrade') {
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
      if (mode === 'branding-upgrade') {
        expect(currentManifest.short_name).toBe('Pickleball Park');
        expect(Object.hasOwn(currentManifest, 'id'), 'branding must preserve the implicit install identity').toBe(false);
      }
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
      const identityProof = await verifyPackageIdentity(page, context, base, info.sourceRevision);
      await page.screenshot({ path: `release-results/package-${browserName}-${mode}.png` });
      // Real offline: close only this test's server. Do not use setOffline emulation.
      server.closeAllConnections(); await new Promise(r => server.close(r)); stopped = true;
      await expect.poll(async () => {
        try { await context.request.get(`${base}index.html`, { timeout: 1000 }); return 'reachable'; }
        catch { return 'stopped'; }
      }, { timeout: 5000 }).toBe('stopped');
      await page.reload(); await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
      expect(await page.evaluate(async()=>{const faces=await document.fonts.load('20px "Park Labels"');return faces.length===1&&faces[0].status==='loaded';})).toBe(true);
      expect(await page.evaluate(()=>playBuilder.session.playing)).toBe(false);
      expect(await page.evaluate(() => ({ title: playBuilder.document.title, target: playBuilder.document.shots[0].target.x }))).toEqual({ title: 'Package offline custom rally', target: 6.5 });
      const offlineIdentity = await page.evaluate(async () => {
        const [{ BUILD_IDENTITY }, { createBuildDiagnostics }] = await Promise.all([
          import('./build-identity.js'), import('./build-diagnostics.js')
        ]);
        const controller = createBuildDiagnostics({ loadedIdentity: BUILD_IDENTITY });
        const result = await controller.queryServerBuild();
        return { running: result.running, server: result.server, fetch: result.serverFetch };
      });
      expect(offlineIdentity.running).toEqual(identityProof.loaded);
      expect(offlineIdentity.fetch).toMatchObject({ status: 'unavailable', cache: 'no-store', path: './version.json' });
      expect(offlineIdentity.server).toMatchObject({ status: 'unavailable', offline: true });
      const cacheProof = await page.evaluate(async () => ({
        caches: await caches.keys(),
        unrelated: await (await caches.open('unrelated-application-cache')).match('/keep').then(response => response?.text()),
      }));
      expect(cacheProof.caches).toContain(candidateCache);
      if (upgrading) expect(cacheProof).toMatchObject({ caches: expect.arrayContaining(['unrelated-application-cache']), unrelated: 'preserve' });
      const smartProof = (mode === 'fresh' || mode === 'preview-upgrade' || mode === 'live-upgrade' || mode === 'depth-upgrade' || mode === 'public-upgrade' || mode === 'smart-upgrade' || mode === 'art-upgrade' || mode === 'town-upgrade' || mode === 'cache-upgrade' || mode === 'stroke-upgrade' || mode === 'stroke-contact-upgrade' || mode === 'branding-upgrade') ? await verifySmartRallyOffline(page) : null;
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
      results.push({ browser: browserName, mode, status: 'PASS', runtimeHashes: checks.all.length, cacheEntries: checks.cached.length, offlineCustomReload: true, offlineLessons: ids.length, offlineMethod: 'owned server stopped', source: info.revision, previousPublicSource: upgrading ? previousRevision : null, identity: identityProof, offlineIdentity: { status: offlineIdentity.server.status, loadedRetained: offlineIdentity.running.sourceRevision === identityProof.loaded.sourceRevision }, smartRally: smartProof });
    } catch (e) { results.push({ browser: browserName, mode, status: 'FAIL', error: e.message }); throw e; }
    finally { await browser.close(); if (!stopped) { server.closeAllConnections(); await new Promise(r => server.close(r)); } mkdirSync('release-results', { recursive: true }); writeFileSync('release-results/package-verification.json', JSON.stringify(results, null, 2)); }
  }
}
console.log(JSON.stringify(results, null, 2));
