import { test, expect } from '@playwright/test';
import { copyScenarioDocument } from './fixtures/qa-scenarios.mjs';

test('short-screen menu actions scroll clear of playback and remain operable', async ({ page }) => {
  for (const [width, height, enlarged] of [[320, 568, false], [390, 844, false], [844, 390, false], [320, 568, true]]) {
    await page.setViewportSize({ width, height }); await page.goto('/');
    await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
    if (enlarged) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; playBuilder.render(); });
    const before = await page.evaluate(() => ({ doc: JSON.stringify(playBuilder.document), history: playBuilder.history.snapshots.length, theme: document.body.dataset.theme }));
    await page.locator('.builder-main-menu > summary').click();
    const panel = await page.locator('.builder-main-menu > .builder-menu-panel').boundingBox();
    const footer = await page.locator('.builder-transport').boundingBox();
    expect(panel.y + panel.height).toBeLessThanOrEqual(Math.min(height - 4, footer.y - 4));
    const appearance = page.getByRole('button', { name: /Switch to (?:light|dark) appearance/, exact: false });
    await appearance.scrollIntoViewIfNeeded();
    const box = await appearance.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(Math.min(height, footer.y));
    await appearance.click();
    expect(await page.evaluate(() => document.body.dataset.theme)).not.toBe(before.theme);
    expect(await page.evaluate(() => ({ doc: JSON.stringify(playBuilder.document), history: playBuilder.history.snapshots.length }))).toEqual({ doc: before.doc, history: before.history });
  }
});

test('compact history leaves a full-width, touch-sized seek surface', async ({ page }) => {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
    const range = page.getByRole('slider', { name: 'Rally timeline' });
    const chapter = page.getByLabel('Choose shot chapter', { exact: true });
    if (width === 320) {
      const text = chapter.locator('.builder-chapter-compact');
      await expect(text).toHaveText('Shot 1');
      const textBox = await text.boundingBox(), chapterBox = await chapter.boundingBox();
      expect(textBox.x + textBox.width).toBeLessThanOrEqual(chapterBox.x + chapterBox.width - 4);
    }
    const box = await range.boundingBox();
    expect(box.width).toBeGreaterThan(width * .85);
    expect(box.height).toBeGreaterThanOrEqual(44);
    for (const label of ['Undo authored edit', 'Redo authored edit']) {
      const history = page.getByRole('button', { name: label });
      await expect(history).toBeVisible();
      const control = await history.boundingBox();
      expect(control.y + control.height).toBeLessThanOrEqual(box.y + 1);
    }
    await range.focus(); await range.press('End');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  }
});

test('enlarged shot choices remain readable and intent tabs retain useful names', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await page.goto('/');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; playBuilder.render(); });
  for (const selector of ['.builder-main-menu > summary', '.builder-context-actions [data-action="collapse-inspector"]', '.builder-ui [data-action="add-shot"]', '.builder-play-button']) {
    const control = page.locator(selector).first();
    await expect(control).toBeVisible();
    const fits = await control.evaluate(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      const text = range.getBoundingClientRect(), box = node.getBoundingClientRect();
      return text.left >= box.left + 2 && text.right <= box.right - 2;
    });
    expect(fits, `${selector} enlarged live label stays inside its button`).toBe(true);
  }
  await page.getByRole('button', { name: 'Edit shot', exact: true }).first().click();
  for (const name of ['Hitter']) {
    const field = page.getByLabel(name, { exact: true });
    const size = await field.evaluate(node => {
      const style = getComputedStyle(node), ctx = document.createElement('canvas').getContext('2d');
      ctx.font = style.font;
      return { text: ctx.measureText(node.selectedOptions[0].textContent).width, available: node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), height: node.clientHeight };
    });
    expect(size.text).toBeLessThanOrEqual(size.available);
    expect(size.height).toBeGreaterThanOrEqual(42);
  }
  const family = page.getByLabel(/^Shot family:/);
  await expect(family).toBeVisible();
  expect(await family.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.locator('.builder-shot-details > summary').click();
  await page.getByRole('tab', { name: 'Movement', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Movement', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Movement', exact: true })).toBeVisible();
});

test('landscape chapter list stays inside the viewport with enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await page.getByLabel('Choose shot chapter', { exact: true }).click();
  const box = await page.locator('.builder-chapter-list').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(844);
  expect(box.y + box.height).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Customize Shot 2', exact: true }).click();
  await expect(page.getByLabel('Shot family: Return', { exact: true })).toBeVisible();
});

test('blocked contact offers the earlier pin without changing authored intent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.evaluate(document => playBuilder.loadDocument(document), copyScenarioDocument('infeasible-pin'));
  const original = await page.evaluate(() => ({ document: JSON.stringify(playBuilder.document), history: playBuilder.history.snapshots.length }));
  await page.getByRole('button', { name: 'Shot 3 needs attention', exact: true }).click();
  await page.getByRole('button', { name: /^Edit Green (?:Left|Right|A|B) pin · Shot 1$/ }).click();
  await expect(page.getByLabel('Moving player', { exact: true })).toHaveValue('player1');
  await expect(page.getByLabel('Pin movement target', { exact: true })).toBeChecked();
  await expect.poll(() => page.evaluate(() => playBuilder.selectedShotId)).toBe('pin-1');
  expect(await page.evaluate(() => ({ document: JSON.stringify(playBuilder.document), history: playBuilder.history.snapshots.length }))).toEqual(original);
  await page.getByLabel('Pin movement target', { exact: true }).uncheck();
  await expect.poll(() => page.evaluate(() => playBuilder.document.shots[0].movement.pinned)).toBe(false);
  await page.getByRole('button', { name: 'Undo authored edit', exact: true }).click();
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(original.document);
});

test('wide court reclaims the editor column when details close', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  const court = page.locator('.builder-court-region');
  const original = await court.boundingBox();
  expect(original.width).toBeGreaterThan(1440 * .95);
  const documentBefore = await page.evaluate(() => JSON.stringify(playBuilder.document));
  await page.getByRole('button', { name: 'Edit shot', exact: true }).first().click();
  const editor = await page.locator('.builder-inspector').boundingBox();
  const withEditor = await court.boundingBox();
  expect(withEditor.x + withEditor.width).toBeLessThanOrEqual(editor.x + 1);
  await page.locator('.builder-inspector [data-action="collapse-inspector"]').click();
  await expect.poll(async () => (await court.boundingBox()).width).toBeCloseTo(original.width, 0);
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(documentBefore);
});

test('intent tabs support keyboard selection without changing the rally', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.getByRole('button', { name: 'Edit shot', exact: true }).first().click();
  await page.locator('.builder-shot-details > summary').click();
  const before = await page.evaluate(() => ({ doc: JSON.stringify(playBuilder.document), history: playBuilder.history.snapshots.length }));
  await page.getByRole('tab', { name: 'Target', exact: true }).focus();
  for (const [key, name] of [['ArrowRight', 'Flight'], ['End', 'Precision'], ['ArrowRight', 'Target'], ['ArrowLeft', 'Precision'], ['Home', 'Target']]) {
    await page.keyboard.press(key);
    const tab = page.getByRole('tab', { name, exact: true });
    await expect(tab).toBeFocused(); await expect(tab).toHaveAttribute('aria-selected', 'true');
    const id = await tab.getAttribute('aria-controls'); expect(id).toBeTruthy();
    const panel = page.locator(`#${id}`); await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('aria-labelledby', await tab.getAttribute('id'));
    await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  }
  expect(await page.evaluate(() => ({ doc: JSON.stringify(playBuilder.document), history: playBuilder.history.snapshots.length }))).toEqual(before);
});
