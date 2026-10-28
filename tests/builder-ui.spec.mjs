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
      return window.__builderActionResults?.[type];
    } });
    window.__builder.render({ document: fixtureValue, selectedShotId: fixtureValue.shots?.[0]?.id });
  }, value);
}

test.describe('court first builder UI harness', () => {
  test('validates numeric Random Rally seeds and keeps zero distinct from a blank seed', async ({ page }) => {
    await mount(page);
    const openRandom = async () => {
      await openMenu(page);
      await page.getByRole('button', { name: 'Random Rally', exact: true }).click();
      return page.getByRole('dialog', { name: 'Random rally', exact: true });
    };
    let dialog = await openRandom();
    const seed = dialog.getByLabel('Random seed');
    await expect(seed).toHaveAttribute('type', 'number');
    await expect(seed).toHaveAccessibleDescription(/whole number from 0 to 4294967295/);
    for (const value of ['-1', '1.5', '4294967296']) {
      await seed.fill(value);
      await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
      await expect(seed).toHaveAttribute('aria-invalid', 'true');
      await expect(seed).toBeFocused();
      await expect(seed).toHaveAccessibleDescription(/leave the seed blank/);
      expect(await page.evaluate(() => window.__builderActions.some(action => action.type === 'randomRally'))).toBe(false);
    }
    await seed.fill('0');
    await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.__builderActions.at(-1))).toEqual({ type: 'randomRally', payload: { count: 7, seed: 0 } });
    dialog = await openRandom();
    await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
    expect(await page.evaluate(() => window.__builderActions.at(-1))).toEqual({ type: 'randomRally', payload: { count: 7 } });
  });

  test('time-only updates preserve controls, typing and focus while the accessible timeline advances', async ({ page }) => {
    await mount(page);
    await page.evaluate(() => window.__builder.render({ duration: 3, chapters: [{ shotId: 'shot-serve', number: 1, label: 'Serve', anchor: 0, endTime: 1 }, { shotId: 'shot-return', number: 2, label: 'Return', anchor: 1, endTime: 3 }], currentShotId: 'shot-serve', cue: { title: '1. Serve' } }));
    await openPlayFileMenu(page);
    await page.getByLabel('Play title').fill('Still typing');
    // Settle the one changed editing status before measuring time-only calls.
    await page.evaluate(() => window.__builder.render({ time: 0 }));
    const result = await page.evaluate(async () => {
      const root = window.__builder.element;
      const input = root.querySelector('[data-action="title"]');
      const play = root.querySelector('[data-action="play-pause"]');
      const records = [];
      const observer = new MutationObserver(items => records.push(...items));
      observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
      for (let index = 0; index < 120; index += 1) window.__builder.render({ time: index / 120 });
      await Promise.resolve(); observer.disconnect();
      return {
        controlMutations: records.filter(record => !(record.target.nodeType === 1 ? record.target : record.target.parentElement)?.closest('.shot-timeline')).length,
        sameInput: input === root.querySelector('[data-action="title"]'), samePlay: play === root.querySelector('[data-action="play-pause"]'), focused: document.activeElement === input,
        typed: input.value, timeline: root.querySelector('.shot-timeline-range').value
      };
    });
    expect(result).toEqual({ controlMutations: 0, sameInput: true, samePlay: true, focused: true, typed: 'Still typing', timeline: expect.any(String) });
    expect(Number(result.timeline)).toBeCloseTo(119 / 120, 12);
    await expect(page.getByRole('slider', { name: 'Rally timeline' })).toHaveAttribute('aria-valuetext', /Shot 1, Serve, 1.0 seconds/);
    await page.evaluate(() => window.__builder.render({ time: 1.5, currentShotId: 'shot-return', cue: { title: '2. Return' }, playing: true }));
    await expect(page.locator('[data-shot-card-number]')).toHaveText('SHOT 2');
    await expect(page.locator('[data-action="chapter"][data-shot-id="shot-return"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('slider', { name: 'Rally timeline' })).toHaveAttribute('aria-valuetext', /Shot 2, Return, 1.5 seconds/);
    await expect(page.getByLabel('Play title')).toHaveValue('Still typing');
  });

  test('confirms saved-play deletion, preserves cancellation, and refreshes My Plays without closing it', async ({ page }) => {
    await mount(page);
    await page.evaluate(() => {
      const library = [{ id: 'saved-one', title: 'Saved One' }, { id: 'saved-two', title: 'Saved Two' }];
      window.__builder.render({ library });
      const original = window.__builderActions;
      window.__builder.destroy();
      return import('/builder-ui.js').then(({ mountBuilderUI }) => {
        window.__builder = mountBuilderUI({ onAction(type, payload) {
          original.push({ type, payload });
          if (type === 'deletePlay') { const index = library.findIndex(play => play.id === payload); library.splice(index, 1); window.__builder.render({ library: [...library] }); return { ok: true, deleted: true, id: payload }; }
        } });
        window.__builder.render({ document: { title: 'Current draft', shots: [], players: {}, assistance: {} }, library });
      });
    });
    await openPlayFileMenu(page);
    await page.getByRole('button', { name: 'My Plays', exact: true }).click();
    const libraryDialog = page.getByRole('dialog', { name: 'My Plays', exact: true });
    await libraryDialog.getByRole('button', { name: 'Delete Saved One', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Delete saved play', exact: true });
    await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(libraryDialog.getByRole('button', { name: 'Delete Saved One', exact: true })).toBeFocused();
    expect(await page.evaluate(() => window.__builderActions)).toEqual([]);
    await libraryDialog.getByRole('button', { name: 'Delete Saved One', exact: true }).click();
    await confirmation.getByRole('button', { name: 'Delete saved play', exact: true }).click();
    await expect(libraryDialog).toBeVisible();
    await expect(libraryDialog.getByRole('button', { name: 'Saved One', exact: true })).toHaveCount(0);
    await expect(libraryDialog.getByRole('button', { name: 'Saved Two', exact: true })).toBeFocused();
    await expect(libraryDialog.getByRole('status')).toContainText('Your current draft is still open');
    expect(await page.evaluate(() => window.__builderActions)).toEqual([{ type: 'deletePlay', payload: 'saved-one' }]);
    await libraryDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await openPlayFileMenu(page);
    await expect(page.getByLabel('Play title')).toHaveValue('Current draft');
  });

  test('full-library recovery keeps failed Open and Delete attempts actionable without losing the draft', async ({ page }) => {
    await mount(page);
    await page.evaluate(() => {
      window.__builderActionResults = { open: { ok: false, error: 'Save or export these unsaved edits before opening another play.' }, deletePlay: { ok: false, error: 'Storage changed elsewhere. Try again.' } };
      window.__builder.render({ library: [{ id: 'saved-one', title: 'Saved One' }], saveError: { libraryFull: true, message: 'This device already has 50 saved plays.' }, saveStatus: 'Not saved', unsavedChanges: true });
    });
    await expect(page.locator('.builder-save-error')).toContainText('My Plays is full.');
    await expect(page.locator('.builder-save-error').getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
    await expect(page.locator('.builder-save-error').getByRole('button', { name: 'Save a copy', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export this draft', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Manage saved plays', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'My Plays', exact: true });
    await dialog.getByRole('button', { name: 'Saved One', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText('Save or export these unsaved edits');
    await dialog.getByRole('button', { name: 'Delete Saved One', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete saved play', exact: true }).getByRole('button', { name: 'Delete saved play', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Storage changed elsewhere');
    await expect(dialog.getByRole('button', { name: 'Delete Saved One', exact: true })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Saved One', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await openPlayFileMenu(page);
    await expect(page.getByLabel('Play title')).toHaveValue('Starter rally');
  });

  test('Delete uses the revision displayed in My Plays when a background refresh changes the library', async ({ page }) => {
    await mount(page);
    await page.evaluate(() => {
      window.__builderActionResults = { deletePlay: { ok: false, error: 'This saved play changed elsewhere. Reopen My Plays before deleting it.' } };
      window.__builder.render({ library: [{ id: 'saved-one', title: 'Saved One', revision: 'displayed-revision' }] });
    });
    await openPlayFileMenu(page);
    await page.getByRole('button', { name: 'My Plays', exact: true }).click();
    await page.evaluate(() => window.__builder.render({ library: [{ id: 'saved-one', title: 'Changed elsewhere', revision: 'newer-revision' }] }));
    const dialog = page.getByRole('dialog', { name: 'My Plays', exact: true });
    await dialog.getByRole('button', { name: 'Delete Saved One', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete saved play', exact: true }).getByRole('button', { name: 'Delete saved play', exact: true }).click();
    expect(await page.evaluate(() => window.__builderActions.at(-1))).toEqual({ type: 'deletePlay', payload: { id: 'saved-one', revision: 'displayed-revision' } });
    await expect(dialog.getByRole('alert')).toContainText('changed elsewhere');
    await expect(dialog.getByRole('button', { name: 'Saved One', exact: true })).toBeVisible();
  });

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
    await expect(page.getByLabel('2D rally court host region', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch to 3D court view', exact: true })).toBeHidden();
    const actions = await page.evaluate(() => window.__builderActions);
    expect(actions.map(action => action.type)).toEqual(['pauseForEditing', 'addShot', 'pauseForEditing', 'pauseForEditing', 'placeTarget']);
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
    await page.getByRole('dialog').getByRole('button', { name: 'Saved One', exact: true }).click();
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
    await page.getByLabel('Manage plays', { exact: true }).click();
    await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
    await page.getByLabel('Choose JSON file').setInputFiles({ name: 'oversize.json', mimeType: 'application/json', buffer: Buffer.alloc(512 * 1024 + 1) });
    await expect.poll(() => page.evaluate(() => window.__builderActions.at(-1))).toEqual({ type: 'message', payload: 'Import is limited to 512 KiB.' });
  });
});
