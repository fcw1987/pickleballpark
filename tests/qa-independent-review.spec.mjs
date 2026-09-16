import { expect, test } from '@playwright/test';
import { openIntentTab, openPlayFileMenu, switchCourtView } from './helpers/builder-navigation.mjs';

import {
  EXTENDED_DOCUMENT_COUNT,
  extendedInvalidDocuments,
  extendedValidDocuments,
  pairwiseDimensionCases,
  runExtendedCorpus
} from '../tools/qa-generated-extended.mjs';

const clone = value => structuredClone(value);

const longDocument = () => clone(extendedValidDocuments().find(document =>
  document.shots.length === 64 && !document.shots.some(shot => shot.movement?.waypoints?.length)
));

async function openCleanBuilder(page) {
  await page.goto('/index.html?qa-independent-review=1');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.evaluate(() => localStorage.removeItem('pickleballpark-builder-v1'));
  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
}

async function importThroughDialog(page, document) {
  await openPlayFileMenu(page);
  await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import or export play' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('JSON backup').fill(JSON.stringify(document));
  await dialog.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => ({
    title: playBuilder.document.title,
    shots: playBuilder.document.shots.length,
    busy: playBuilder.busy
  }))).toEqual({ title: document.title, shots: document.shots.length, busy: false });
}

async function chooseChapter(page, number, { edit = false } = {}) {
  await page.getByLabel('Choose shot chapter').click();
  if (edit) await page.getByLabel(`Customize Shot ${number}`, { exact: true }).click();
  else await page.locator(`[data-action="chapter"][data-shot-id$="shot-${number}"]`).click();
}

async function chooseDifferent(select, values) {
  const current = await select.inputValue();
  const next = values.find(value => value !== current);
  await select.selectOption(next);
  return next;
}

test('extended corpus truthfully covers hundreds of valid documents and classified invalids', () => {
  const report = runExtendedCorpus();
  expect(pairwiseDimensionCases()).toHaveLength(EXTENDED_DOCUMENT_COUNT);
  expect(extendedValidDocuments()).toHaveLength(EXTENDED_DOCUMENT_COUNT);
  expect(report).toMatchObject({
    validDocuments: 446,
    validShots: 9435,
    pairwiseRows: 446,
    pairwiseDimensionPairs: 446,
    invalidDocuments: 24,
    invalidByExpected: { validation: 17, rule: 6, feasibility: 1 },
    sampledBoundaryPoints: 77873,
    observed: {
      lengths: [1, 2, 31, 64, 8],
      hitterPairs: ['player1/player3', 'player1/player4', 'player1/single', 'player2/player3', 'player2/player4', 'player2/single'],
      regions: [1, 10, 15, 19, 5],
      families: ['dink', 'drive', 'drop', 'lob', 'overhead', 'reset', 'return', 'volley'],
      contactStyles: ['auto', 'backhand', 'forehand', 'short-hop'],
      movementIntents: ['advance', 'hold', 'manual', 'recover'],
      assistanceModes: ['false/false', 'false/true', 'true/false', 'true/true'],
      shadeTeams: ['both', 'green', 'orange'],
      handPatterns: ['LLLL', 'LRRL', 'RLLR', 'RRRR']
    }
  });
  expect(report.guidedCoverageRecords).toBeGreaterThan(4000);
  expect(new Set(extendedInvalidDocuments().map(item => item.id)).size).toBe(24);
});

test('64-shot visible workflow keeps early, middle, and last edits through delete, undo, export, import, views, and reload', async ({ page }) => {
  test.setTimeout(90_000);
  const source = longDocument();
  await openCleanBuilder(page);
  await importThroughDialog(page, source);

  const importedId = await page.evaluate(() => playBuilder.document.id);
  expect(importedId).not.toBe(source.id);
  await expect(page.getByLabel('Add shot')).toBeEnabled();

  for (const number of [1, 33, 64]) {
    await chooseChapter(page, number);
    await expect.poll(() => page.evaluate(() => ({
      selected: playBuilder.selectedShotId,
      current: playBuilder.chapters.find(chapter => Math.abs(chapter.anchor - playBuilder.session.clock.elapsed) < 1e-7)?.shotId
    }))).toEqual({ selected: `extended-${source.id.split('-').at(-1)}-shot-${number}`, current: `extended-${source.id.split('-').at(-1)}-shot-${number}` });
  }

  await chooseChapter(page, 1, { edit: true });
  await openIntentTab(page, 'Players');
  const firstContact = await chooseDifferent(page.getByLabel('Contact style', { exact: true }), ['auto', 'forehand', 'backhand']);
  await expect.poll(() => page.evaluate(() => playBuilder.document.shots[0].contactStyle)).toBe(firstContact);

  await chooseChapter(page, 33, { edit: true });
  await openIntentTab(page, 'Flight');
  const middleArc = await chooseDifferent(page.getByLabel('Arc', { exact: true }), ['low', 'medium', 'high']);
  await expect.poll(() => page.evaluate(() => playBuilder.document.shots[32].arc)).toBe(middleArc);

  await chooseChapter(page, 64, { edit: true });
  await openIntentTab(page, 'Flight');
  const lastPace = await chooseDifferent(page.getByLabel('Pace', { exact: true }), ['soft', 'medium', 'firm']);
  await expect.poll(() => page.evaluate(() => playBuilder.document.shots[63].pace)).toBe(lastPace);
  const editedLast = await page.evaluate(() => structuredClone(playBuilder.document.shots[63]));

  await page.getByText('Shot actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => page.evaluate(() => playBuilder.document.shots.length)).toBe(63);
  await page.getByLabel('Undo authored edit').click();
  await expect.poll(() => page.evaluate(() => playBuilder.document.shots.length)).toBe(64);
  expect(await page.evaluate(() => playBuilder.document.shots[63])).toEqual(editedLast);

  await openPlayFileMenu(page);
  await page.getByRole('button', { name: 'Save As', exact: true }).click();
  const savedAs = await page.evaluate(() => ({ id: playBuilder.document.id, title: playBuilder.document.title }));
  expect(savedAs.id).not.toBe(importedId);
  expect(savedAs.title).toContain('— copy');

  await openPlayFileMenu(page);
  await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import or export play' });
  await dialog.getByRole('button', { name: 'Export current play', exact: true }).click();
  const exported = await dialog.getByLabel('JSON backup').inputValue();
  const exportedDocument = JSON.parse(exported);
  expect(exportedDocument).toEqual(await page.evaluate(() => playBuilder.document));
  await dialog.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await expect(dialog).toBeHidden();
  const reimported = await page.evaluate(() => structuredClone(playBuilder.document));
  expect(reimported.id).not.toBe(exportedDocument.id);
  expect({ ...reimported, id: exportedDocument.id }).toEqual(exportedDocument);

  for (const rate of ['0.25', '0.5', '1']) {
    await page.getByLabel('Playback options').click();
    await page.getByLabel('Playback speed').selectOption(rate);
    await expect.poll(() => page.evaluate(() => playBuilder.session.clock.playbackRate)).toBe(Number(rate));
    await page.getByLabel('Playback options').click();
    for (let repeat = 0; repeat < 4; repeat += 1) {
      await switchCourtView(page, '2d');
      await switchCourtView(page, '3d');
    }
  }
  expect(await page.evaluate(() => ({
    canvases: document.querySelectorAll('#threeDCanvas canvas').length,
    lost: pickleboard.threeD.renderer.getContext().isContextLost(),
    shots: playBuilder.document.shots.length
  }))).toEqual({ canvases: 1, lost: false, shots: 64 });

  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  expect(await page.evaluate(() => playBuilder.document)).toEqual(reimported);
  await expect(page.getByLabel('Add shot')).toBeEnabled();
});

test('hundreds of long-rally boundary seeks keep chapters, 2D, 3D, and resources equivalent', async ({ page }) => {
  test.setTimeout(90_000);
  const source = longDocument();
  await openCleanBuilder(page);
  await importThroughDialog(page, source);
  await expect.poll(() => page.evaluate(() => !playBuilder.busy && playBuilder.view)).toBe('3d');

  const result = await page.evaluate(() => {
    const timeline = playBuilder.compiled.timeline;
    const times = new Set([0, timeline.duration]);
    for (const event of timeline.events) {
      times.add(Math.max(0, event.time - 1e-7));
      times.add(event.time);
      times.add(Math.min(timeline.duration, event.time + 1e-7));
    }
    for (const segment of timeline.segments) {
      times.add(segment.startTime); times.add(segment.endTime);
    }
    for (let index = 0; index <= 128; index += 1) times.add(timeline.duration * index / 128);
    const ordered = [...times].sort((a, b) => a - b);
    const input = document.querySelector('.builder-transport .shot-timeline-range');
    const memory = { ...pickleboard.threeD.renderer.info.memory };
    const errors = [];
    for (const time of ordered) {
      input.value = String(time);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const twoD = pickleboard.plays.lastState;
      const threeD = pickleboard.threeD.lastState;
      const fields = ['x', 'y', 'z', 'phase', 'rallyLeg'];
      if (fields.some(field => JSON.stringify(twoD?.[field]) !== JSON.stringify(threeD?.[field])) ||
          JSON.stringify(twoD?.board) !== JSON.stringify(threeD?.board) ||
          Math.abs(playBuilder.session.clock.elapsed - time) > 1e-9) {
        errors.push({ time, twoD, threeD, elapsed: playBuilder.session.clock.elapsed });
        break;
      }
      const timelineValues = [...document.querySelectorAll('.shot-timeline-range')].map(control => Number(control.value));
      if (timelineValues.some(value => Math.abs(value - time) > 1e-9)) {
        errors.push({ time, timelineValues });
        break;
      }
    }
    return {
      seeks: ordered.length,
      errors,
      chapters: playBuilder.chapters.length,
      chapterIds: playBuilder.chapters.map(chapter => chapter.shotId),
      markerCounts: [...document.querySelectorAll('.shot-timeline-markers')].map(markers => markers.children.length),
      memoryBefore: memory,
      memoryAfter: { ...pickleboard.threeD.renderer.info.memory },
      canvases: document.querySelectorAll('#threeDCanvas canvas').length,
      replayActive: pickleboard.threeD.active,
      rendererLoopScheduled: pickleboard.threeD.renderLoopId !== null,
      guidedLoopScheduled: pickleboard.plays.animationFrame !== null,
      holdTimerScheduled: pickleboard.plays.advanceTimer !== null
    };
  });

  expect(result.seeks).toBeGreaterThan(400);
  expect(result.errors).toEqual([]);
  expect(result.chapters).toBe(64);
  expect(new Set(result.chapterIds).size).toBe(64);
  expect(result.markerCounts).toEqual([64, 64, 64]);
  expect(result.memoryAfter).toEqual(result.memoryBefore);
  expect(result.canvases).toBe(1);
  expect(result.replayActive).toBe(true);
  expect(result.rendererLoopScheduled).toBe(false);
  expect(result.guidedLoopScheduled).toBe(false);
  expect(result.holdTimerScheduled).toBe(false);
});

test('parked WebGL loss during active 2D playback preserves source, rate, intent, and advancing time', async ({ page }) => {
  test.setTimeout(60_000);
  const source = longDocument();
  await openCleanBuilder(page);
  await importThroughDialog(page, source);
  await page.getByLabel('Playback options').click();
  await page.getByLabel('Playback speed').selectOption('0.5');
  await page.getByLabel('Playback options').click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => playBuilder.session.clock.elapsed)).toBeGreaterThan(0.05);
  await switchCourtView(page, '2d');

  const before = await page.evaluate(() => ({
    source: JSON.stringify(playBuilder.document),
    elapsed: playBuilder.session.clock.elapsed,
    playing: playBuilder.session.playing,
    rate: playBuilder.session.clock.playbackRate,
    iteration: playBuilder.session.iteration
  }));
  await page.evaluate(() => new Promise((resolve, reject) => {
    const viewer = pickleboard.threeD;
    const extension = viewer.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!extension) { reject(new Error('WEBGL_lose_context unavailable')); return; }
    viewer.renderer.domElement.addEventListener('webglcontextlost', resolve, { once: true });
    extension.loseContext();
  }));
  await expect.poll(() => page.evaluate(() => Boolean(pickleboard.threeD.scene))).toBe(false);
  await page.waitForTimeout(150);
  const afterLoss = await page.evaluate(() => ({
    source: JSON.stringify(playBuilder.document),
    elapsed: playBuilder.session.clock.elapsed,
    playing: playBuilder.session.playing,
    rate: playBuilder.session.clock.playbackRate,
    iteration: playBuilder.session.iteration,
    owner: playBuilder.session.owner,
    canvases: document.querySelectorAll('#threeDCanvas canvas').length,
    guidedLoopScheduled: pickleboard.plays.animationFrame !== null
  }));
  expect(afterLoss).toMatchObject({
    source: before.source, playing: true, rate: 0.5, iteration: before.iteration,
    owner: 'guided', canvases: 0, guidedLoopScheduled: true
  });
  expect(afterLoss.elapsed).toBeGreaterThan(before.elapsed);

  await switchCourtView(page, '3d');
  const recovered = await page.evaluate(() => ({
    source: JSON.stringify(playBuilder.document),
    elapsed: playBuilder.session.clock.elapsed,
    playing: playBuilder.session.playing,
    rate: playBuilder.session.clock.playbackRate,
    owner: playBuilder.session.owner,
    canvases: document.querySelectorAll('#threeDCanvas canvas').length,
    lost: pickleboard.threeD.renderer.getContext().isContextLost()
  }));
  expect(recovered).toMatchObject({
    source: before.source, playing: true, rate: 0.5, owner: 'replay', canvases: 1, lost: false
  });
  expect(recovered.elapsed).toBeGreaterThanOrEqual(afterLoss.elapsed);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});
