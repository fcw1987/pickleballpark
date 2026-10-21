import { expect, test } from '@playwright/test';

const fixture = { title: 'Starter rally', shots: [
  { id: 'shot-serve', family: 'serve', hitter: 'player3', receiver: 'auto', contactStyle: 'auto', target: { x: 13, y: 8 }, arc: 'high', pace: 'soft', movement: { intent: 'recover', pinned: false }, serveMethod: 'drop' },
  { id: 'shot-return', family: 'return', hitter: 'player1', receiver: 'auto', contactStyle: 'auto', target: { x: 7, y: 35 }, arc: 'medium', pace: 'firm', movement: { intent: 'recover', pinned: false } }
], players: { player1: { handedness: 'right' }, player2: { handedness: 'left' }, player3: { handedness: 'right' }, player4: { handedness: 'left' } }, assistance: {} };

async function mount(page, value = fixture) {
  await page.goto('/index.html?workspace=planner&builder-ui-harness=1');
  await page.evaluate(async fixtureValue => {
    const { mountBuilderUI } = await import('/builder-ui.js');
    window.__builderActions = [];
    window.__builder = mountBuilderUI({ onAction: (type, payload) => { window.__builderActions.push({ type, payload }); } });
    window.__builder.render({ document: fixtureValue, selectedShotId: fixtureValue.shots?.[0]?.id });
  }, value);
}

test.describe('smart rally builder interface', () => {
  test('keeps the title clean and puts routine file work under Manage plays', async ({ page }) => {
    await mount(page);
    await page.locator('.builder-main-menu > summary').last().click();
    await expect(page.locator('.builder-menu-heading')).toContainText('PICKLEBALL PARK');
    await expect(page.locator('.builder-menu-kicker')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Manage plays' })).toHaveCount(0);
    await expect(page.getByLabel('Manage plays', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Random Rally', exact: true })).toBeVisible();
    await expect(page.locator('[data-ui="save-pill"]')).toHaveCount(0);
  });

  test('uses a semantic shot family picker and does not open it with Customize', async ({ page }) => {
    await mount(page);
    await page.locator('.builder-context-actions [data-action="collapse-inspector"]').click();
    await expect(page.locator('.builder-family-picker')).toBeVisible();
    await expect(page.locator('.builder-family-picker')).not.toHaveAttribute('open', '');
    await page.locator('.builder-family-summary').click();
    await expect(page.locator('.builder-family-option')).toHaveCount(9);
    await expect(page.locator('.builder-family-option').first()).toContainText('Start the rally');
    await page.getByRole('option', { name: /Drop/ }).click();
    await expect.poll(() => page.evaluate(() => window.__builderActions.at(-1))).toEqual({ type: 'editShot', payload: { field: 'family', value: 'drop' } });
  });

  test('exposes structural shot actions beside the selected shot', async ({ page }) => {
    await mount(page);
    await page.locator('.builder-context-actions [data-action="collapse-inspector"]').click();
    await page.getByText('Shot actions', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Insert before', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Insert after', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Insert after', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__builderActions.at(-1))).toEqual({ type: 'insertShot', payload: { position: 'after', shotId: 'shot-serve' } });
  });

  test('keeps Chrome playback options open while a native select changes', async ({ page }) => {
    await mount(page);
    await page.locator('.builder-context-menu > summary').last().click();
    const menu = page.locator('.builder-context-menu');
    await expect(menu).toHaveAttribute('open', '');
    await page.getByLabel('Playback speed').selectOption('0.5');
    await expect(menu).toHaveAttribute('open', '');
    await expect.poll(() => page.evaluate(() => window.__builderActions.at(-1))).toEqual({ type: 'rate', payload: 0.5 });
  });
});
