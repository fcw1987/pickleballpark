import { expect, test } from '@playwright/test';
import { chooseShotFamily, openCoachTools, settleBuilderStartup, switchCourtView } from './helpers/builder-navigation.mjs';

const APP = '/index.html?pixel-game-context=1';

async function openBuilder(page, viewport = { width: 402, height: 874 }) {
  await page.setViewportSize(viewport);
  await page.goto(APP);
  await settleBuilderStartup(page);
}

const bounds = (page, selector) => page.locator(selector).evaluate(node => {
  const box = node.getBoundingClientRect();
  return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
});

async function courtGeometry(page) {
  return page.evaluate(() => {
    const region = document.querySelector('.builder-court-region').getBoundingClientRect();
    const surface = (playBuilder.view === '3d' ? document.querySelector('#threeDViewer') : document.querySelector('.court-container-fullscreen')).getBoundingClientRect();
    const pick = box => [box.x, box.y, box.width, box.height].map(value => Number(value.toFixed(3)));
    return { region: pick(region), surface: pick(surface) };
  });
}

test('main, chapter, and playback menus open over the scene without resizing the court', async ({ page }) => {
  await openBuilder(page);
  const initial = await courtGeometry(page);
  for (const selector of ['.builder-main-menu > summary', '.builder-chapter-menu > summary', '.builder-context-menu > summary']) {
    const summary = page.locator(selector);
    await summary.click();
    await expect(summary.locator('xpath=..')).toHaveAttribute('open', '');
    expect(await courtGeometry(page), selector).toEqual(initial);
    const panelSelector = selector.includes('chapter') ? '.builder-chapter-list' : `${selector.replace(' > summary', '')} > .builder-menu-panel`;
    const panel = await bounds(page, panelSelector);
    expect(panel.x, selector).toBeGreaterThanOrEqual(0);
    expect(panel.y, selector).toBeGreaterThanOrEqual(0);
    expect(panel.right, selector).toBeLessThanOrEqual(403);
    expect(panel.bottom, selector).toBeLessThanOrEqual(875);
    if (selector.includes('chapter')) {
      await page.locator('.builder-chapter-list [data-action="chapter"]').first().focus();
      await page.keyboard.press('Escape');
      await expect(summary.locator('xpath=..')).not.toHaveAttribute('open', '');
      await expect(summary).toBeFocused();
    } else await summary.click();
    expect(await courtGeometry(page), selector).toEqual(initial);
  }
  await page.locator('.builder-main-menu > summary').click();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.locator('#infoClose')).toBeFocused();
  expect(await page.evaluate(() => Boolean(document.elementFromPoint(200,30)?.closest('#infoModal')))).toBe(true);
  expect(await page.locator('#infoClose').evaluate(node => {
    const box=node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
  })).toBe(true);
  await page.locator('#infoClose').click();
  await expect(page.locator('.builder-main-menu > summary')).toBeFocused();
});

test('Coach tools remains expanded and focused after an assistance edit rerenders the document', async ({ page }) => {
  await openBuilder(page);
  await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
  const tools = await openCoachTools(page);
  await expect(tools).toHaveAttribute('open', '');
  const shading = page.getByRole('checkbox', { name: 'Auto Shading', exact: true });
  await shading.focus();
  await shading.check();
  await expect(page.locator('.builder-assistance')).toHaveAttribute('open', '');
  await expect(page.getByRole('checkbox', { name: 'Auto Shading', exact: true })).toBeChecked();
  expect(await page.evaluate(() => playBuilder.document.assistance.autoShading)).toBe(true);
});

test('planner confirmation Cancel preserves both worlds and Use layout creates one undoable edit', async ({ page }) => {
  await openBuilder(page);
  const before = await page.evaluate(() => ({ document: structuredClone(playBuilder.document), history: playBuilder.history.snapshots.length }));
  await page.locator('.builder-main-menu > summary').click();
  await page.getByRole('button', { name: 'Court Planner', exact: true }).click();
  await expect.poll(() => page.evaluate(() => playBuilder.workspace)).toBe('planner');
  const planned = await page.evaluate(() => {
    pickleboard.setTokenPosition('player1', 6.25, 31.5);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('drawing-stroke'); path.setAttribute('d', 'M 2 3 L 7 11');
    pickleboard.drawingLayer.appendChild(path); pickleboard.drawingPaths.push(path);
    return pickleboard.captureBoardState();
  });

  await page.getByRole('button', { name: 'Use as starting layout', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Use planner layout' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Use layout', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => playBuilder.workspace)).toBe('planner');
  expect(await page.evaluate(() => ({ workspace: playBuilder.workspace, document: playBuilder.document,
    planner: pickleboard.captureBoardState() }))).toEqual({ workspace: 'planner', document: before.document, planner: planned });

  await page.getByRole('button', { name: 'Use as starting layout', exact: true }).click();
  await page.getByRole('dialog', { name: 'Use planner layout' }).getByRole('button', { name: 'Use layout', exact: true }).click();
  await expect.poll(() => page.evaluate(() => playBuilder.workspace)).toBe('builder');
  await expect.poll(() => page.evaluate(() => playBuilder.document.initialLayout.player1)).toEqual(planned.positions.player1);
  expect(await page.evaluate(() => ({ position: playBuilder.document.initialLayout.player1,
    annotation: playBuilder.document.annotations.at(-1), canUndo: playBuilder.history.canUndo,
      growth: playBuilder.history.snapshots.length }))).toEqual({
      position: planned.positions.player1, annotation: { type: 'path', d: 'M 2 3 L 7 11' }, canUndo: true,
      growth: before.history + 1
    });

  await page.getByRole('button', { name: 'Undo authored edit', exact: true }).click();
  expect(await page.evaluate(() => ({ layout: playBuilder.document.initialLayout,
    annotations: playBuilder.document.annotations }))).toEqual({
      layout: before.document.initialLayout, annotations: before.document.annotations
    });
});

test('explicit chapter navigation updates the open editor while playback and seeks keep its selection', async ({ page }) => {
  await openBuilder(page);
  const state = await page.evaluate(() => ({ ids: playBuilder.document.shots.map(shot => shot.id),
    targets: playBuilder.document.shots.map(shot => structuredClone(shot.target)) }));
  await page.getByLabel('Choose shot chapter', { exact: true }).click();
  await page.locator(`[data-action="chapter"][data-shot-id="${state.ids[1]}"]`).click();
  const closed = await page.evaluate(() => ({ selected: playBuilder.selectedShotId, playing: playBuilder.session.playing,
    current: document.querySelector('.builder-transport .shot-timeline-marker.is-current')?.dataset.shotId,
    projected: playBuilder.courtTools.project(playBuilder.selectedShot.target),
    ring: (() => { const circle = document.querySelector('.builder-court-tools circle'); return circle ? { x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')) } : null; })() }));
  expect(closed).toMatchObject({ selected: state.ids[1], current: state.ids[1], playing: false });
  expect(closed.ring.x).toBeCloseTo(closed.projected.x, 4);
  expect(closed.ring.y).toBeCloseTo(closed.projected.y, 4);

  await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
  await page.getByLabel('Choose shot chapter', { exact: true }).click();
  await page.locator(`[data-action="chapter"][data-shot-id="${state.ids[2]}"]`).click();
  const open = await page.evaluate(() => ({ selected: playBuilder.selectedShotId,
    current: document.querySelector('.builder-transport .shot-timeline-marker.is-current')?.dataset.shotId,
    family: document.querySelector('.builder-family-option[aria-selected="true"]')?.dataset.family,
    expectedFamily: playBuilder.document.shots.find(shot => shot.id === playBuilder.selectedShotId)?.family }));
  expect(open).toEqual({ selected: state.ids[2], current: state.ids[2], family: open.expectedFamily, expectedFamily: open.expectedFamily });
  await expect(page.locator('.builder-inspector-header')).toContainText('Shot 3 details');
  await chooseShotFamily(page, 'Drive');
  expect(await page.evaluate(() => playBuilder.document.shots.map(shot => shot.family))).toEqual(['serve', 'return', 'drive']);

  await page.evaluate(async () => {
    await playBuilder.action('seek', 0);
    playBuilder.play();
    playBuilder.render();
  });
  await expect.poll(() => page.evaluate(() => playBuilder.session.clock.elapsed)).toBeGreaterThan(.3);
  await page.evaluate(() => { playBuilder.pause(); playBuilder.render(); });
  expect(await page.evaluate(() => playBuilder.selectedShotId)).toBe(state.ids[2]);
  await expect(page.locator('.builder-inspector-header')).toContainText('Shot 3 details');
  await expect(page.locator('.builder-inspector')).not.toHaveClass(/builder-inspector-collapsed/);
});

for (const viewport of [{ width: 402, height: 874 }, { width: 844, height: 390 }]) {
  test(`200 percent text keeps every contextual surface bounded and keyboard reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openBuilder(page, viewport);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await page.evaluate(() => { playBuilder.render(); playBuilder.viewportChanged(); });
    const checks = [
      ['.builder-main-menu > summary', '.builder-main-menu > .builder-menu-panel', '[data-action="templates"]'],
      ['.builder-chapter-menu > summary', '.builder-chapter-list', '[data-action="chapter"]'],
      ['.builder-context-menu > summary', '.builder-context-menu > .builder-menu-panel', '[data-action="rate"]']
    ];
    for (const [summarySelector, panelSelector, firstSelector] of checks) {
      const summary = page.locator(summarySelector);
      await summary.focus(); await page.keyboard.press('Enter');
      await expect(page.locator(panelSelector)).toBeVisible();
      const panel = await bounds(page, panelSelector);
      expect.soft(panel.x, summarySelector).toBeGreaterThanOrEqual(0);
      expect.soft(panel.y, summarySelector).toBeGreaterThanOrEqual(0);
      expect.soft(panel.right, summarySelector).toBeLessThanOrEqual(viewport.width + 1);
      expect.soft(panel.bottom, summarySelector).toBeLessThanOrEqual(viewport.height + 1);
      const first = page.locator(firstSelector).first();
      await first.focus();
      await expect(first).toBeFocused();
      await summary.click();
    }
    await expect(page.getByRole('button', { name: 'Switch to 3D court view', exact: true })).toBeHidden();
    for (const name of ['Play', 'Add shot', 'Edit shot']) {
      const control = page.getByRole('button', { name, exact: true }).first();
      await control.focus(); await expect(control).toBeFocused();
      const box = await control.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    // Retained view APIs preserve the same contextual state, while 2D remains
    // the public default and only visible court after returning.
    for (const view of ['3d', '2d']) await switchCourtView(page, view);
    await expect(page.locator('.pixel-court-canvas')).toBeVisible();
    const edit = page.getByRole('button', { name: 'Edit shot', exact: true }).first();
    await expect(edit).toHaveAttribute('aria-expanded', 'false');
    await edit.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.builder-inspector')).toBeVisible();
    await expect(page.locator('.builder-inspector')).not.toHaveClass(/builder-inspector-collapsed/);
    const collapse = page.locator('.builder-inspector [data-action="collapse-inspector"]');
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    const inspector = await bounds(page, '.builder-inspector');
    expect.soft(inspector.x).toBeGreaterThanOrEqual(0); expect.soft(inspector.y).toBeGreaterThanOrEqual(0);
    expect.soft(inspector.right).toBeLessThanOrEqual(viewport.width + 1); expect.soft(inspector.bottom).toBeLessThanOrEqual(viewport.height + 1);
    await expect(page.getByRole('button',{name:'Close editor',exact:true})).toBeFocused();
    await collapse.click();
    await expect(page.locator('.builder-inspector')).toHaveClass(/builder-inspector-collapsed/);
    await expect(page.getByRole('button', { name: 'Edit shot', exact: true }).first()).toHaveAttribute('aria-expanded', 'false');
  });
}
