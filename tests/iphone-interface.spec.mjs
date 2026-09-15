import { expect, test } from '@playwright/test';

const fixture = { title: 'Phone rally', shots: [{ id: 's1', family: 'drive', hitter: 'player1', target: { x: 8, y: 22 }, arc: 'medium', pace: 'firm', movement: { intent: 'manual', target: { x: 9, y: 18 }, pinned: true } }], players: { player1: { handedness: 'right' } }, assistance: {} };

async function mount(page) {
  await page.goto('/index.html?builder-ui-harness=1');
  await page.evaluate(async value => {
    const { mountBuilderUI } = await import('/builder-ui.js');
    window.__builderActions = [];
    window.__builder = mountBuilderUI({ onAction: (type, payload) => window.__builderActions.push({ type, payload }) });
    window.__builder.render({ document: value, selectedShotId: 's1' });
  }, fixture);
}

test.describe('portrait selected-shot authoring sheet', () => {
  test('groups full details behind one nonmodal sheet with visible Done', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mount(page);
    const ui = page.locator('.builder-ui').last();
    await ui.getByRole('button', { name: 'Edit shot', exact: true }).click();
    const inspector = ui.locator('.builder-inspector');
    await expect(inspector).toHaveAttribute('data-surface', 'nonmodal-sheet');
    await expect(ui.locator('.builder-collapse-label-done')).toBeVisible();
    await expect(ui.getByText('Edit by intent', { exact: true })).toBeVisible();
    await ui.getByText('Edit by intent', { exact: true }).click();
    await ui.getByRole('tab', { name: 'Flight', exact: true }).click();
    await expect(ui.getByLabel('Arc', { exact: true })).toBeVisible();
    await ui.getByRole('tab', { name: 'Movement', exact: true }).click();
    await expect(ui.getByLabel('Moving player', { exact: true })).toBeVisible();
    await expect(ui.getByRole('button', { name: 'Place movement on court', exact: true })).toBeVisible();
  });

  test('commits a precise field without losing sheet scroll or keyboard focus route', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mount(page);
    const ui = page.locator('.builder-ui').last();
    await ui.getByRole('button', { name: 'Edit shot', exact: true }).click();
    await ui.getByText('Edit by intent', { exact: true }).click();
    await ui.getByRole('tab', { name: 'Movement', exact: true }).click();
    const inspector = ui.locator('.builder-inspector');
    await inspector.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await ui.getByLabel('Manual X', { exact: true }).fill('7.5');
    await ui.getByLabel('Manual X', { exact: true }).press('Enter');
    await expect(ui.getByLabel('Manual X', { exact: true })).toHaveValue('7.5');
    await expect.poll(() => inspector.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await ui.getByRole('button', { name: 'Place movement on court', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__builderActions.at(-1))).toEqual({ type: 'placeMovement', payload: { shotId: 's1', player: 'player1' } });
  });
});
