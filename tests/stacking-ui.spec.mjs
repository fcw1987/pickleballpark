import { test, expect } from '@playwright/test';
import { settleBuilderStartup, openCoachTools } from './helpers/builder-navigation.mjs';

test.use({ serviceWorkers: 'block' });
async function openBuilder(page, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.goto('/index.html?stacking-review=1');
  await settleBuilderStartup(page);
}
async function openRandom(page) {
  const menu = page.locator('.builder-main-menu');
  if (!(await menu.evaluate(node => node.open))) await menu.locator(':scope > summary').click();
  await page.getByRole('button', { name: 'Random Rally', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Random rally', exact: true });
  await dialog.locator('.builder-stacking > summary').click();
  return dialog;
}
const work = page => page.evaluate(() => ({ source: JSON.stringify(playBuilder.document), saved: localStorage.getItem('pickleballpark-builder-v1') }));

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`advanced stacking keeps player identity, focus and explicit routes at ${viewport.width}px`, async ({ page }, testInfo) => {
    await openBuilder(page, viewport);
    const before = await page.evaluate(() => structuredClone(playBuilder.document));
    await page.getByRole('button', { name: 'Edit shot', exact: true }).click();
    await openCoachTools(page);
    const settings = page.locator('.builder-group-coach .builder-stacking');
    await settings.locator('summary').click();
    await expect(settings).toContainText('Existing starting positions, shots and pinned routes stay as authored');
    await expect(settings).toContainText('Left and right mean facing the net');
    await expect(settings.getByLabel('Orange preferred left player')).toBeDisabled();
    const mode = settings.getByLabel('Orange stacking', { exact: true });
    await mode.focus(); await mode.selectOption('full');
    await expect(settings).toHaveAttribute('open', ''); await expect(mode).toBeFocused();
    await expect(settings.getByLabel('Orange preferred left player')).toBeEnabled();
    await settings.getByLabel('Orange preferred left player').focus();
    await settings.getByLabel('Orange preferred left player').selectOption('player4');
    await expect(settings.getByLabel('Orange preferred left player')).toBeFocused();
    const changed = await page.evaluate(() => structuredClone(playBuilder.document));
    expect(changed.stacking).toEqual({ version: 'stacking-v1', teams: { orange: { mode: 'full', leftPlayer: 'player4' } } });
    for (const field of ['players', 'initialLayout', 'service', 'shots']) expect(changed[field]).toEqual(before[field]);
    await page.evaluate(() => playBuilder.action('undo'));
    await expect(settings.getByLabel('Orange preferred left player')).toHaveValue('player3');
    await page.evaluate(() => playBuilder.action('redo'));
    await expect(settings.getByLabel('Orange preferred left player')).toHaveValue('player4');
    await page.screenshot({ path: testInfo.outputPath(`stacking-settings-${viewport.width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.reload(); await settleBuilderStartup(page);
    expect(await page.evaluate(() => playBuilder.document.stacking)).toEqual(changed.stacking);
  });
}

test('Random Rally stacking overrides cancel cleanly, disable while working and really support Off', async ({ page }) => {
  await openBuilder(page);
  await page.evaluate(() => playBuilder.action('stacking', { team: 'green', mode: 'full', leftPlayer: 'player1' }));
  const before = await work(page);
  let dialog = await openRandom(page);
  await dialog.getByLabel('Green stacking', { exact: true }).selectOption('off');
  await expect(dialog.getByLabel('Green preferred left player')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await work(page)).toEqual(before);
  dialog = await openRandom(page);
  await expect(dialog.getByLabel('Green stacking', { exact: true })).toHaveValue('full');
  await dialog.getByLabel('Green stacking', { exact: true }).selectOption('off');
  await page.evaluate(() => {
    playBuilder.generateRally = input => {
      window.__stackingRequest = { stacking: input.stacking ?? null, layout: input.layout };
      return new Promise(resolve => { window.__finishStacking = resolve; });
    };
  });
  await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Create rally', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Green stacking', { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Orange stacking', { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.__stackingRequest.stacking)).toBeNull();
  expect(await page.evaluate(() => window.__stackingRequest.layout.player2.x)).toBe(15);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => window.__finishStacking({ status: 'complete', document: {} }));
  await expect(dialog).toBeHidden(); expect(await work(page)).toEqual(before);
  dialog = await openRandom(page);
  await expect(dialog.getByLabel('Green stacking', { exact: true })).toBeEnabled();
  await expect(dialog.getByLabel('Green stacking', { exact: true })).toHaveValue('full');
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  expect(await work(page)).toEqual(before);
});

test('visible full-stack generation preserves settings and passes independent physical validation', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await openBuilder(page);
  const dialog = await openRandom(page);
  await dialog.getByLabel('Green stacking', { exact: true }).selectOption('full');
  await dialog.getByLabel('Green preferred left player').selectOption('player1');
  await dialog.getByLabel('Orange stacking', { exact: true }).selectOption('full');
  await dialog.getByLabel('Orange preferred left player').selectOption('player3');
  await dialog.getByLabel('Random seed').fill('7');
  await dialog.getByRole('button', { name: 'Create rally', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30000 });
  const result = await page.evaluate(async () => {
    const { compileDocument } = await import('/play-compiler.js');
    const { validateRallyRules } = await import('/rally-rules.js');
    const { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } = await import('/rally-movement.js');
    const source = playBuilder.document, compiled = compileDocument(source);
    return { source, accepted: compiled.validShotCount, findings: compiled.findings.filter(item => item.severity === 'error'),
      rules: validateRallyRules(compiled.play, compiled.timeline), movement: inspectGeneratedMovementV1(compiled.timeline), spacing: inspectGeneratedSpacingV1(compiled.timeline) };
  });
  expect(result.source.modelVersion).toBe(2); expect(result.source.stacking).toEqual(result.source.generation.input.stacking);
  expect(result.source.stacking.teams).toEqual({ green: { mode: 'full', leftPlayer: 'player1' }, orange: { mode: 'full', leftPlayer: 'player3' } });
  expect(result.accepted).toBe(result.source.shots.length); expect(result.findings).toEqual([]);
  expect(result.rules.violations).toEqual([]); expect(result.movement.valid).toBe(true); expect(result.spacing.valid).toBe(true);
  const render = await page.evaluate(async () => {
    const { sampleActorWorldPosition } = await import('/three-d-presentation.js');
    const b = playBuilder, viewer = b.board.threeD, source = JSON.stringify(b.document);
    const positions = new Set();
    let drift = 0, contact = 0, impacts = 0;
    for (const segment of viewer.timeline.segments.filter(s => s.shotSemantics)) {
      for (const time of [segment.contactTime, segment.duration * .5]) {
        b.seek(segment.startTime + time);
        for (const id of ['player1', 'player2']) {
          const actor = viewer.playerObjects.get(id);
          const expected = sampleActorWorldPosition(segment, id, time, b.document.players[id].handedness, true);
          drift = Math.max(drift, actor.position.distanceTo(expected));
          if (id === 'player1') positions.add(actor.position.toArray().join(','));
        }
        if (time === segment.contactTime && segment.shotSemantics.playerId === 'player1') {
          impacts++;
          contact = Math.max(contact, viewer.playerObjects.get('player1').userData.paddleFaceWorld.distanceTo(viewer.ballObject.position));
        }
      }
    }
    return { model: viewer.playerObjects.get('player1').userData.emeraldCap, drift, contact, impacts,
      positions: positions.size, sourcePreserved: source === JSON.stringify(b.document) };
  });
  expect(render.model && render.sourcePreserved).toBe(true);
  expect(render.positions).toBeGreaterThan(1);
  expect(render.impacts).toBeGreaterThan(0);
  expect(render.drift).toBeLessThan(1e-6);
  expect(render.contact).toBeLessThan(.01);
  await page.screenshot({ path: testInfo.outputPath('stacked-generated-rally.png'), fullPage: true });
  await page.reload(); await settleBuilderStartup(page);
  expect(await page.evaluate(() => playBuilder.document.stacking)).toEqual(result.source.stacking);
});
