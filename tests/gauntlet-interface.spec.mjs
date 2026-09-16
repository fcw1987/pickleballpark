import { expect, test } from '@playwright/test';

const fixture = {
  title: 'Custom coaching rally',
  shots: [{ id: 'custom-shot', family: 'drive', hitter: 'player1', target: { x: 4, y: 32 }, arc: 'looping', pace: 'quiet', movement: { intent: 'recover', pinned: false } }],
  players: { player1: { handedness: 'right' } },
  assistance: { autoShading: false, showGuides: false }
};

async function mount(page, state = {}, value = fixture) {
  await page.goto('/index.html?builder-ui-harness=1');
  await page.evaluate(async ({ value, extra }) => {
    const { mountBuilderUI } = await import('/builder-ui.js');
    window.__interfaceActions = [];
    window.__interfaceBuilder = mountBuilderUI({ onAction: (type, payload) => window.__interfaceActions.push({ type, payload }) });
    window.__interfaceBuilder.render({ document: value, selectedShotId: value.shots[0].id, ...extra });
  }, { value, extra: state });
}

test.describe('Park Desk interface layer', () => {
  test('shot card reports authored target and custom flight values', async ({ page }) => {
    await mount(page);
    const ui = page.locator('.builder-ui').last();
    await expect(ui.locator('[data-shot-card-number]')).toHaveText('SHOT 1');
    await expect(ui.locator('[data-shot-card-family]')).toHaveText('Drive');
    await expect(ui.locator('[data-shot-card-description]')).toHaveText('Middle left lane');
    await expect(ui.locator('[data-shot-card-flight]')).toHaveText('Custom pace · Custom arc');
  });

  test('selected shot groups authoring by intent while retaining live controls', async ({ page }) => {
    await mount(page);
    const ui = page.locator('.builder-ui').last();
    await ui.getByRole('button', { name: 'Edit shot', exact: true }).last().click();
    await ui.locator('.builder-shot-details > summary').click();
    for (const group of ['target', 'flight', 'players', 'movement', 'coach', 'precision']) {
      await ui.locator(`[data-action="detail-group"][data-group="${group}"]`).click();
      await expect(ui.locator(`[data-detail-group="${group}"]`)).toBeVisible();
      await expect(ui.locator(`[data-detail-group]:not([data-detail-group="${group}"])`).filter({ visible: true })).toHaveCount(0);
    }
    await expect(ui.getByLabel(/^Shot family:/)).toBeVisible();
    await expect(ui.getByRole('button', { name: 'Place target on court', exact: true })).toBeVisible();
    await expect(ui.locator('.builder-assistance > summary')).toHaveText('Shading & Guides');
    await expect(ui.locator('.builder-detail-tab').first()).toHaveCSS('min-height', '44px');
    await expect(ui.locator('.builder-choice-grid')).toHaveCount(1);
    await expect(ui.locator('.builder-choice-grid .builder-choice-field')).toHaveCount(2);
  });

  test('opening a menu cancels an interrupted placement gesture', async ({ page }) => {
    await mount(page, { targetPlacement: true });
    const ui = page.locator('.builder-ui').last();
    await ui.locator('.builder-main-menu > summary').click();
    await expect.poll(() => page.evaluate(() => window.__interfaceActions.map(item => item.type))).toContain('cancelTarget');
  });

  test('Help reconciles a collapsed editor to the live shot and preserves an open editor selection', async ({ page }) => {
    const value = { ...fixture, shots: [...fixture.shots, { id: 'return-shot', family: 'return', hitter: 'player3', target: { x: 16, y: 12 }, arc: 'high', pace: 'firm', movement: { intent: 'recover' } }] };
    await mount(page, { currentShotId: 'return-shot' }, value);
    const ui = page.locator('.builder-ui').last();
    await ui.locator('.builder-main-menu').evaluate(node => { node.open = true; });
    await ui.locator('[data-action="help"]').click();
    await expect.poll(() => page.evaluate(() => window.__interfaceActions.map(item => item.type))).toContain('selectShot');
    await expect.poll(() => page.evaluate(() => window.__interfaceActions.at(-1).payload)).toEqual({ id: 'return-shot', preserveTime: true });

    await mount(page, { currentShotId: 'return-shot' }, value);
    const openUi = page.locator('.builder-ui').last();
    await openUi.getByRole('button', { name: 'Edit shot', exact: true }).last().click();
    await openUi.locator('.builder-main-menu').evaluate(node => { node.open = true; });
    await openUi.locator('[data-action="help"]').click();
    await expect.poll(() => page.evaluate(() => window.__interfaceActions.at(-1).type)).toBe('help');
  });

  test('phone keeps the shot chapter selector and avoids header intersections', async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await mount(page);
      const ui = page.locator('.builder-ui').last();
      await expect(page.locator('#menuToggle')).toBeHidden();
      await expect(page.locator('#infoToggle')).toBeHidden();
      await expect(ui.locator('.builder-shot-card .builder-chapter-menu > summary')).toBeVisible();
      await expect(ui.locator('.builder-context-actions [data-action="view"]')).toHaveCount(1);
      const boxes = await ui.evaluate(root => [...root.querySelectorAll('.builder-meta > *')].filter(node => node.getBoundingClientRect().width > 0).map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
      for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
        const overlapX = boxes[i].left < boxes[j].right - 1 && boxes[j].left < boxes[i].right - 1;
        const overlapY = boxes[i].top < boxes[j].bottom - 1 && boxes[j].top < boxes[i].bottom - 1;
        expect(overlapX && overlapY, `${viewport.width}x${viewport.height} header overlap`).toBe(false);
      }
    }
  });

  test('dense chapter navigation stays scrollable on a phone', async ({ page }) => {
    const shots = Array.from({ length: 64 }, (_, index) => ({ id: `shot-${index + 1}`, family: 'drive', hitter: 'player1', target: { x: 10, y: 20 }, arc: 'medium', pace: 'medium', movement: { intent: 'recover' } }));
    const chapters = shots.map((shot, index) => ({ shotId: shot.id, number: index + 1, label: `Shot ${index + 1}`, time: index * 0.3 }));
    await page.setViewportSize({ width: 390, height: 844 });
    await mount(page, { chapters, duration: 19.2 }, { ...fixture, shots });
    const ui = page.locator('.builder-ui').last();
    await ui.locator('.builder-shot-card .builder-chapter-menu > summary').click();
    const list = ui.locator('.builder-shot-card .builder-chapter-list');
    await expect(list.locator('[data-action="chapter"]')).toHaveCount(64);
    await expect.poll(() => list.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  });
});
