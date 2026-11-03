import { expect, test } from '@playwright/test';
import { settleBuilderStartup, openPlayFileMenu, openIntentTab } from './helpers/builder-navigation.mjs';

test.use({ serviceWorkers: 'block' });

async function freshBuilder(page, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('random-browser-ready')) {
      localStorage.clear();
      sessionStorage.setItem('random-browser-ready', '1');
    }
    const NativeWorker = window.Worker;
    window.__rallyWorkerURLs = [];
    window.__terminatedRallyWorkerURLs = [];
    window.Worker = class extends NativeWorker {
      constructor(url, options) { super(url, options); this.__rallyURL = String(url); window.__rallyWorkerURLs.push(this.__rallyURL); }
      terminate() { window.__terminatedRallyWorkerURLs.push(this.__rallyURL); return super.terminate(); }
    };
  });
  await page.goto('/index.html?smart-visible-random=1');
  await settleBuilderStartup(page);
}

async function openRandom(page) {
  const menu = page.locator('.builder-main-menu');
  if (!(await menu.evaluate(element => element.open))) await page.getByLabel('Menu', { exact: true }).click();
  await page.getByRole('button', { name: 'Random Rally', exact: true }).click();
  return page.getByRole('dialog', { name: 'Random rally' });
}

async function createNatural(page, seed = 7) {
  const dialog = await openRandom(page);
  await expect(dialog.getByLabel('Rally length')).toHaveValue('natural');
  await dialog.getByLabel('Random seed').fill(String(seed));
  await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30000 });
  await expect.poll(() => page.evaluate(() => playBuilder.document.modelVersion)).toBe(2);
}

async function currentWork(page) {
  return page.evaluate(() => ({
    document: JSON.stringify(playBuilder.document),
    history: JSON.stringify(playBuilder.history),
    bytes: localStorage.getItem('pickleballpark-builder-v1')
  }));
}

test.describe('visible physically completed Random Rally', () => {
  test.setTimeout(90000);

  test('phone Create uses the real worker, preserves the prior play and restores the completed point', async ({ page }, testInfo) => {
    await freshBuilder(page);
    const previous = await page.evaluate(async () => {
      await playBuilder.action('title', 'My authored play before Random');
      return structuredClone(playBuilder.document);
    });
    await createNatural(page);
    const point = await page.evaluate(async () => {
      const { validateDocument } = await import('/play-document.js');
      const { compileDocument } = await import('/play-compiler.js');
      const { validateRallyRules } = await import('/rally-rules.js');
      validateDocument(playBuilder.document);
      const compiled = compileDocument(playBuilder.document);
      const rules = validateRallyRules(compiled.play, compiled.timeline);
      return {
        source: playBuilder.document, accepted: compiled.validShotCount,
        errors: compiled.findings.filter(item => item.severity === 'error'),
        violations: rules.violations, expectedOutcomes: rules.expectedOutcomes,
        saved: JSON.parse(localStorage.getItem('pickleballpark-builder-v1')),
        playing: playBuilder.session.playing, workers: window.__rallyWorkerURLs,
        renderCanvases: document.querySelectorAll('#threeDViewer canvas').length
      };
    });
    expect(point.source.modelVersion).toBe(2);
    expect(point.source.physicsVersion).toBe('play-physics-v2');
    expect(point.source.generation).toMatchObject({ generatorVersion: 'rally-engine-v1', seed: 7, input: { options: { lengthFeel: 'natural' } } });
    expect(point.source.outcome).toMatchObject({ shotId: expect.any(String), reason: expect.any(String), winner: expect.any(String) });
    expect(point.source.id).not.toBe(previous.id);
    expect(point.source.shots.length).toBeGreaterThan(0);
    expect(point.source.shots.length).toBeLessThanOrEqual(99);
    expect(point.accepted).toBe(point.source.shots.length);
    expect(point.errors).toEqual([]); expect(point.violations).toEqual([]);
    expect(point.expectedOutcomes).toContainEqual(expect.objectContaining({ shotId: point.source.outcome.shotId, reason: point.source.outcome.reason }));
    expect(point.saved.drafts.find(draft => draft.id === previous.id)).toEqual(previous);
    expect(point.saved.drafts.find(draft => draft.id === point.source.id)).toEqual(point.source);
    expect(point.saved.lastId).toBe(point.source.id); expect(point.playing).toBe(false);
    expect(point.workers.some(url => url.endsWith('/rally-engine-worker.js'))).toBe(true);
    expect(point.renderCanvases).toBe(1);
    await expect(page.locator('.builder-chapter-list [data-action="chapter"]')).toHaveCount(point.source.shots.length);
    await page.screenshot({ path: testInfo.outputPath('phone-390-generated-point.png'), fullPage: true });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.evaluate(() => playBuilder.session.clock.elapsed)).toBeGreaterThan(0.05);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.evaluate(() => playBuilder.seek(playBuilder.session.duration));
    expect(await page.evaluate(() => ({ playing: playBuilder.session.playing, end: playBuilder.session.clock.elapsed === playBuilder.session.duration, outcome: playBuilder.compiled.timeline.outcome })))
      .toMatchObject({ playing: false, end: true, outcome: { reason: point.source.outcome.reason } });
    await page.screenshot({ path: testInfo.outputPath('phone-375-completed-point.png'), fullPage: true });
    await page.reload(); await settleBuilderStartup(page);
    expect(await page.evaluate(() => playBuilder.document)).toEqual(point.source);
    expect(await page.evaluate(() => playBuilder.session.playing)).toBe(false);
  });

  test('desktop repeated seed preserves physical source and provenance without overwriting saved points', async ({ page }, testInfo) => {
    await freshBuilder(page, { width: 1440, height: 900 });
    await createNatural(page, 0);
    const first = await page.evaluate(() => structuredClone(playBuilder.document));
    await createNatural(page, 0);
    const second = await page.evaluate(() => structuredClone(playBuilder.document));
    const { id: firstId, ...firstSource } = first, { id: secondId, ...secondSource } = second;
    expect(secondId).not.toBe(firstId);
    expect(secondSource).toEqual(firstSource);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pickleballpark-builder-v1')).drafts)).toEqual(expect.arrayContaining([first, second]));
    await openPlayFileMenu(page);
    await page.getByLabel('Play title', { exact: true }).fill('An authored generated point');
    await page.getByLabel('Play title', { exact: true }).press('Tab');
    await page.getByLabel('Menu', { exact: true }).click();
    await page.getByRole('button', { name: 'Undo authored edit', exact: true }).click();
    expect(await page.evaluate(() => playBuilder.document)).toEqual(second);
    await page.getByRole('button', { name: 'Redo authored edit', exact: true }).click();
    expect(await page.evaluate(() => ({ title: playBuilder.document.title, origin: playBuilder.document.generation })))
      .toEqual({ title: 'An authored generated point', origin: second.generation });
    await page.screenshot({ path: testInfo.outputPath('desktop-random-point.png'), fullPage: true });
  });

  test('native Flight preset replaces generated physics, changes the real trajectory and restores exactly with Undo/Redo', async ({ page }, testInfo) => {
    await freshBuilder(page, { width: 1440, height: 900 });
    await createNatural(page, 7);
    const physicalPoint = () => page.evaluate(async () => {
      const { compileDocument } = await import('/play-compiler.js');
      const { samplePlayBall } = await import('/three-d-core.js');
      const source = structuredClone(playBuilder.document), compiled = compileDocument(source);
      const segment = compiled.timeline.segments[0];
      return {
        source, duration: compiled.timeline.duration, firstSegmentDuration: segment.duration,
        samples: [.1, .2, .3].map(seconds => samplePlayBall(compiled.timeline, segment.startTime + segment.contactTime + seconds)),
        findings: compiled.findings, history: playBuilder.history.index,
        saved: JSON.parse(localStorage.getItem('pickleballpark-builder-v1')).drafts.find(draft => draft.id === source.id)
      };
    });
    const before = await physicalPoint();
    expect(before.source.shots[0].physics).toBeDefined();
    expect(before.source.shots[0].authoring.fields).toContain('physics');
    await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
    await openIntentTab(page, 'Flight');
    const flight = page.getByRole('combobox', { name: 'Flight', exact: true });
    await expect(flight).toHaveAccessibleDescription(/custom.*flight.*replac|replace.*custom.*flight/i);
    await flight.selectOption('low/firm');
    const after = await physicalPoint();
    expect(after.history).toBe(before.history + 1);
    expect(after.source.shots[0]).not.toHaveProperty('physics');
    for (const field of ['physics', 'arc', 'pace']) expect(after.source.shots[0].authoring.fields).not.toContain(field);
    expect(after.samples).not.toEqual(before.samples);
    expect(after.firstSegmentDuration).not.toBe(before.firstSegmentDuration);
    expect(after.duration).not.toBe(before.duration);
    expect(after.source.shots.slice(1)).toEqual(before.source.shots.slice(1));
    expect(after.source.generation).toEqual(before.source.generation);
    expect(after.source.outcome).toEqual(before.source.outcome);
    const expected = structuredClone(before.source);
    delete expected.shots[0].physics;
    Object.assign(expected.shots[0], { arc: 'low', pace: 'firm' });
    expected.shots[0].authoring.fields = expected.shots[0].authoring.fields.filter(field => !['physics', 'arc', 'pace'].includes(field));
    expect(after.source).toEqual(expected);
    expect(after.saved).toEqual(after.source);
    expect(after.findings).toContainEqual(expect.objectContaining({ severity: 'error', message: expect.stringMatching(/terminal geometry.*match.*solved event/i) }));
    const staleOutcome = page.locator('.builder-findings .builder-finding-row').filter({ hasText: /terminal geometry.*match.*solved event/i });
    await staleOutcome.scrollIntoViewIfNeeded();
    await expect(staleOutcome).toBeVisible();
    await expect(staleOutcome).toContainText('Declared terminal geometry');
    await page.screenshot({ path: testInfo.outputPath('native-flight-preset-stale-outcome.png'), fullPage: true });
    await page.getByRole('button', { name: 'Undo authored edit', exact: true }).click();
    const undone = await physicalPoint();
    expect(undone.source).toEqual(before.source);
    expect(undone.saved).toEqual(before.source);
    expect(undone.samples).toEqual(before.samples);
    expect(undone.duration).toBe(before.duration);
    expect(undone.firstSegmentDuration).toBe(before.firstSegmentDuration);
    expect(undone.findings).toEqual(before.findings);
    await page.getByRole('button', { name: 'Redo authored edit', exact: true }).click();
    const redone = await physicalPoint();
    expect(redone.source).toEqual(after.source);
    expect(redone.saved).toEqual(after.source);
    expect(redone.samples).toEqual(after.samples);
    expect(redone.duration).toBe(after.duration);
    expect(redone.firstSegmentDuration).toBe(after.firstSegmentDuration);
    expect(redone.findings).toEqual(after.findings);
  });

  test('Cancel stays actionable during generation and preserves exact work and saved bytes', async ({ page }, testInfo) => {
    await freshBuilder(page);
    let releaseWorker;
    const workerGate = new Promise(resolve => { releaseWorker = resolve; });
    await page.route('**/rally-engine-worker.js', async route => { await workerGate; await route.continue().catch(() => {}); });
    const before = await currentWork(page);
    const dialog = await openRandom(page);
    await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
    await expect(dialog.locator('.builder-proposal-status')).toContainText('Building rally');
    await expect(dialog.getByRole('button', { name: 'Create rally', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('phone-random-progress.png'), fullPage: true });
    expect(await page.evaluate(() => window.__rallyWorkerURLs.some(url => url.endsWith('/rally-engine-worker.js')))).toBe(true);
    await page.keyboard.press('Escape');
    releaseWorker();
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => playBuilder.proposalBusy)).toBe(false);
    expect(await currentWork(page)).toEqual(before);
  });

  for (const interruption of ['pagehide', 'destroy']) test(`${interruption} terminates its pending worker without replacing current work`, async ({ page }) => {
    await freshBuilder(page);
    let releaseWorker;
    const workerGate = new Promise(resolve => { releaseWorker = resolve; });
    await page.route('**/rally-engine-worker.js', async route => { await workerGate; await route.continue().catch(() => {}); });
    const before = await currentWork(page);
    await page.evaluate(() => { window.__pendingPoint = playBuilder.action('randomRally', { lengthFeel: 'natural', seed: 7 }); });
    await expect.poll(() => page.evaluate(() => window.__rallyWorkerURLs.filter(url => url.endsWith('/rally-engine-worker.js')).length)).toBe(1);
    await page.evaluate(interruption => {
      if (interruption === 'pagehide') window.dispatchEvent(new Event('pagehide'));
      else playBuilder.ui.destroy();
    }, interruption);
    releaseWorker();
    const response = await page.evaluate(() => window.__pendingPoint);
    expect(response.ok).toBe(false);
    expect(await page.evaluate(() => window.__terminatedRallyWorkerURLs.filter(url => url.endsWith('/rally-engine-worker.js')).length)).toBe(1);
    expect(await currentWork(page)).toEqual(before);
    expect(await page.evaluate(() => playBuilder.proposalBusy)).toBe(false);
  });

  test('an already-produced stale result cannot replace a newer edit or its history', async ({ page }) => {
    await freshBuilder(page);
    await page.evaluate(() => {
      const original = playBuilder.generateRally;
      playBuilder.generateRally = async input => {
        const result = await original(input);
        window.__heldPointStatus = result.status;
        await new Promise(resolve => { window.__releaseHeldPoint = resolve; });
        return result;
      };
      window.__pendingVisiblePoint = playBuilder.action('randomRally', { lengthFeel: 'natural', seed: 7 });
    });
    await expect.poll(() => page.evaluate(() => window.__heldPointStatus)).toBe('complete');
    await page.evaluate(() => playBuilder.action('title', 'Keep this newer edit'));
    const newer = await currentWork(page);
    const response = await page.evaluate(async () => { window.__releaseHeldPoint(); return await window.__pendingVisiblePoint; });
    expect(response.ok).toBe(false);
    expect(await currentWork(page)).toEqual(newer);
    expect(await page.evaluate(() => playBuilder.proposalBusy)).toBe(false);
  });

  test('a cancelled old request cannot close or overwrite a newly opened Random dialog', async ({ page }) => {
    await freshBuilder(page);
    await page.evaluate(() => {
      window.__heldRequests = [];
      playBuilder.generateRally = input => new Promise(resolve => window.__heldRequests.push({ resolve, signal: input.signal }));
    });
    const before = await currentWork(page);
    let dialog = await openRandom(page);
    await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__heldRequests.length)).toBe(1);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    dialog = await openRandom(page);
    await dialog.getByLabel('Random seed').fill('11');
    await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__heldRequests.length)).toBe(2);
    expect(await page.evaluate(() => window.__heldRequests.map(request => request.signal.aborted))).toEqual([true, false]);
    await page.evaluate(() => window.__heldRequests[0].resolve({ status: 'cancelled', document: null, outcome: null }));
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create rally', exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('Random seed')).toHaveValue('11');
    await page.evaluate(() => window.__heldRequests[1].resolve({ status: 'failed', document: null, outcome: null }));
    await expect(dialog.locator('.builder-proposal-status')).toHaveAttribute('role', 'alert');
    expect(await currentWork(page)).toEqual(before);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  });

  test('failed, unsatisfied, censored and worker-error results keep the dialog actionable and source untouched', async ({ page }) => {
    await freshBuilder(page);
    const before = await currentWork(page);
    for (const status of ['failed', 'unsatisfied', 'censored', 'worker-error']) {
      await page.evaluate(status => {
        playBuilder.generateRally = async () => {
          if (status === 'worker-error') throw Error('The rally worker could not run.');
          return { status, document: null, outcome: null, diagnostics: { code: 'test-bounded-result' } };
        };
      }, status);
      const dialog = await openRandom(page);
      await dialog.getByLabel('Rally length').selectOption(status === 'unsatisfied' ? 'epic' : 'natural');
      await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.builder-proposal-status')).toHaveAttribute('role', 'alert');
      await expect(dialog.locator('.builder-proposal-status')).toContainText(/kept|unchanged/i);
      await expect(dialog.getByRole('button', { name: 'Create rally', exact: true })).toBeEnabled();
      expect(await currentWork(page)).toEqual(before);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();
    }
  });

  test('a full library or quota failure cannot install a generated point over the current work', async ({ page }) => {
    await freshBuilder(page);
    await page.evaluate(async () => {
      await playBuilder.action('title', 'Saved original');
      const original = playBuilder.generateRally;
      window.__realGenerate = original;
      window.__workerRequests = 0;
      playBuilder.generateRally = input => { window.__workerRequests++; return original(input); };
      for (let i = 0; i < 49; i++) playBuilder.store.save({ ...structuredClone(playBuilder.document), id: `full-${i}` });
    });
    const full = await currentWork(page);
    expect((await page.evaluate(() => playBuilder.action('randomRally', { lengthFeel: 'natural', seed: 7 }))).ok).toBe(false);
    expect(await currentWork(page)).toEqual(full);
    await page.evaluate(async () => {
      await playBuilder.action('deletePlay', 'full-48');
      const storage = playBuilder.store.storage;
      playBuilder.store.storage = { getItem: storage.getItem.bind(storage), setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); } };
    });
    const quota = await currentWork(page);
    expect((await page.evaluate(() => playBuilder.action('randomRally', { lengthFeel: 'natural', seed: 7 }))).ok).toBe(false);
    expect(await currentWork(page)).toEqual(quota);
    expect(await page.evaluate(() => playBuilder.proposalBusy)).toBe(false);
  });
});
