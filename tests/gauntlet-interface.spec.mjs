import { expect, test } from '@playwright/test';

const fixture = {
  title: 'Custom coaching rally',
  shots: [{ id: 'custom-shot', family: 'drive', hitter: 'player1', target: { x: 4, y: 32 }, arc: 'looping', pace: 'quiet', movement: { intent: 'recover', pinned: false } }],
  players: { player1: { handedness: 'right' } },
  assistance: { autoShading: false, showGuides: false }
};

async function mount(page, state = {}) {
  await page.goto('/index.html?builder-ui-harness=1');
  await page.evaluate(async ({ value, extra }) => {
    const { mountBuilderUI } = await import('/builder-ui.js');
    window.__interfaceActions = [];
    window.__interfaceBuilder = mountBuilderUI({ onAction: (type, payload) => window.__interfaceActions.push({ type, payload }) });
    window.__interfaceBuilder.render({ document: value, selectedShotId: value.shots[0].id, ...extra });
  }, { value: fixture, extra: state });
}

test.describe('Park Desk interface layer', () => {
  test('shot card reports authored target and custom flight values', async ({ page }) => {
    await mount(page);
    const ui = page.locator('.builder-ui').last();
    await expect(ui.locator('[data-shot-card-number]')).toHaveText('SHOT 1');
    await expect(ui.locator('[data-shot-card-family]')).toHaveText('Drive');
    await expect(ui.locator('[data-shot-card-description]')).toHaveText('Middle crosscourt left');
    await expect(ui.locator('[data-shot-card-flight]')).toHaveText('Custom pace · Custom arc');
  });

  test('selected shot groups authoring by intent while retaining live controls', async ({ page }) => {
    await mount(page);
    const ui = page.locator('.builder-ui').last();
    await ui.getByRole('button', { name: 'Edit shot', exact: true }).last().click();
    await ui.getByText('Details · coordinates, contact, movement', { exact: true }).click();
    for (const label of ['Shot', 'Target', 'Flight', 'Players', 'Movement', 'Precision']) await expect(ui.locator('.builder-control-group h3', { hasText: label })).toBeVisible();
    await expect(ui.getByLabel('Shot family', { exact: true })).toBeVisible();
    await expect(ui.getByRole('button', { name: 'Place target on court', exact: true })).toBeVisible();
    await expect(ui.locator('.builder-assistance > summary')).toHaveText('Coach tools');
  });

  test('opening a menu cancels an interrupted placement gesture', async ({ page }) => {
    await mount(page, { targetPlacement: true });
    const ui = page.locator('.builder-ui').last();
    await ui.locator('.builder-main-menu > summary').click();
    await expect.poll(() => page.evaluate(() => window.__interfaceActions.map(item => item.type))).toContain('cancelTarget');
  });
});
