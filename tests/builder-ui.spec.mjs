import { expect, test } from '@playwright/test';
import { openCoachTools, openPlayFileMenu } from './helpers/builder-navigation.mjs';

const fixture = { title: 'Starter rally', shots: [
  { id: 'shot-serve', family: 'serve', hitter: 'player3', receiver: 'auto', contactStyle: 'auto', target: { x: 13, y: 8 }, arc: 'high', pace: 'soft', movement: { intent: 'recover', pinned: false }, serveMethod: 'drop' },
  { id: 'shot-return', family: 'return', hitter: 'player1', receiver: 'auto', contactStyle: 'auto', target: { x: 7, y: 35 }, arc: 'medium', pace: 'firm', movement: { intent: 'recover', pinned: false } },
  { id: 'shot-third', family: 'drop', hitter: 'player3', receiver: 'auto', contactStyle: 'auto', target: { x: 10, y: 17 }, arc: 'medium', pace: 'medium', movement: { intent: 'advance', pinned: false } }
], players: { player1: { handedness: 'right' }, player2: { handedness: 'left' }, player3: { handedness: 'right' }, player4: { handedness: 'left' } }, assistance: { autoShading: false, showGuides: false }, opening: 'serve', ending: 'stop' };

const openMenu = page => page.locator('.builder-main-menu>summary').click();

async function mount(page, value = fixture) {
  await page.goto('/index.html?workspace=planner&builder-ui-harness=1');
  await page.evaluate(async fixtureValue => {
    const { mountBuilderUI } = await import('/builder-ui.js');
    window.__builderActions = [];
    window.__builder = mountBuilderUI({ onAction: (type, payload) => {
      window.__builderActions.push({ type, payload });
      if (type === 'workspace') window.__builder.render({ workspace: payload, document: fixtureValue, selectedShotId: fixtureValue.shots?.[0]?.id });
    } });
    window.__builder.render({ document: fixtureValue, selectedShotId: fixtureValue.shots?.[0]?.id });
  }, value);
}

test.describe('court first builder UI harness', () => {
  test('mounts an accessible rally with chapter navigation and one transport', async ({ page }) => {
    await mount(page);
    await expect(page.locator('.builder-ui')).toBeVisible();
    await expect(page.locator('.builder-transport .shot-timeline')).toBeVisible();
    await expect(page.locator('[data-action="chapter"]')).toHaveCount(3);
    for (const action of ['previous', 'next', 'restart', 'loop']) await expect(page.locator(`[data-action="${action}"]`)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add shot', exact: true }).click();
    await openMenu(page);
    await expect(page.getByRole('button', { name: 'Court Planner', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
    await page.getByRole('button', { name: 'Place target on court' }).click();
    await page.getByRole('button', { name: 'Switch to 2D court view', exact: true }).click();
    const actions = await page.evaluate(() => window.__builderActions);
    expect(actions.map(action => action.type)).toEqual(['pauseForEditing', 'addShot', 'pauseForEditing', 'pauseForEditing', 'placeTarget', 'view']);
    expect(actions[4].payload).toEqual({ shotId: 'shot-serve' });
  });

  test('keeps one session while switching planner and assistance controls', async ({ page }) => {
    await mount(page);
    await openMenu(page);
    await page.getByRole('button', { name: 'Court Planner', exact: true }).click();
    await expect(page.locator('.builder-planner')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use as starting layout' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to builder' }).click();
    await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
    await openCoachTools(page);
    await page.getByRole('checkbox', { name: 'Auto Shading', exact: true }).check();
    const actions = await page.evaluate(() => window.__builderActions);
    expect(actions.map(action => action.type)).toEqual(['workspace', 'workspace', 'pauseForEditing', 'assistance']);
    expect(actions.at(-1).payload).toEqual({ field: 'autoShading', value: true });
  });

  test('separates lessons from saved plays and keeps import/title actions usable', async ({ page }) => {
    await mount(page);
    await page.evaluate(() => window.__builder.render({ templates: [{ id: 'lesson-one', name: 'Lesson One' }], library: [{ id: 'saved-one', title: 'Saved One' }] }));
    await openMenu(page);
    await page.getByRole('button', { name: 'Learn', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Learn / Templates');
    await page.getByRole('dialog').getByRole('button', { name: 'Lesson One' }).click();
    await openPlayFileMenu(page);
    await page.getByRole('button', { name: 'My Plays', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('My Plays');
    await page.getByRole('dialog').getByRole('button', { name: 'Saved One' }).click();
    await openPlayFileMenu(page);
    await page.getByLabel('Play title').fill('Focused title');
    await page.getByLabel('Play title').press('Tab');
    await page.locator('.builder-main-menu').evaluate(node => { node.open = false; });
    await openMenu(page);
    await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
    await page.getByLabel('JSON backup').fill('{"schemaVersion":1,"title":"Imported"}');
    await page.getByRole('button', { name: 'Import JSON' }).click();
    const actions = await page.evaluate(() => window.__builderActions);
    expect(actions).toEqual([{ type: 'template', payload: 'lesson-one' }, { type: 'open', payload: 'saved-one' }, { type: 'title', payload: 'Focused title' }, { type: 'import', payload: '{"schemaVersion":1,"title":"Imported"}' }]);
  });

  test('keeps zero-shot settings and bounds file imports', async ({ page }) => {
    await mount(page, { title: 'Empty', shots: [], players: {}, assistance: {} });
    await page.getByRole('button', { name: 'Edit play', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Auto Shading', exact: true })).toBeVisible();
    await expect(page.getByLabel('Starting condition')).toBeVisible();
    await openMenu(page);
    await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
    await page.getByLabel('Choose JSON file').setInputFiles({ name: 'oversize.json', mimeType: 'application/json', buffer: Buffer.alloc(512 * 1024 + 1) });
    await expect.poll(() => page.evaluate(() => window.__builderActions.at(-1))).toEqual({ type: 'message', payload: 'Import is limited to 512 KiB.' });
  });
});
