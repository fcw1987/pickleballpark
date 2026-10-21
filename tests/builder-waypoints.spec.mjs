import { expect, test } from '@playwright/test';
import { WAYPOINT_DISCLOSURE } from '../builder-waypoint-policy.js';

const start = async page => {
  await page.goto('/index.html?builder-waypoints=1');
  await page.waitForFunction(() => window.playBuilder && !window.playBuilder.busy);
  await page.evaluate(() => localStorage.removeItem('pickleballpark-builder-v1'));
  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !window.playBuilder.busy);
  await page.evaluate(async () => { if (playBuilder.view !== '2d') await playBuilder.switchView('2d'); });
};

test('bounded imported waypoints require a session acknowledgement and survive every source lifecycle', async ({ page }) => {
  await start(page);

  const imported = await page.evaluate(async () => {
    const source = structuredClone(playBuilder.document);
    const shot = source.shots[2];
    shot.movement = {
      intent: 'manual', pinned: false, target: { x: 8, y: 13 },
      waypoints: [{ x: 14, y: 7 }, { x: 11, y: 10 }]
    };
    await playBuilder.action('import', JSON.stringify(source));
    return { id: source.id, shotId: shot.id, waypoints: shot.movement.waypoints };
  });

  const pending = await page.evaluate(() => playBuilder.waypointPolicy);
  expect(pending).toMatchObject({
    requiresConfirmation: true,
    affected: [{ shotId: imported.shotId, number: 3, player: 'player1', pointCount: 2 }]
  });
  expect(pending.message).toContain(WAYPOINT_DISCLOSURE);
  await expect(page.getByText(WAYPOINT_DISCLOSURE, { exact: false })).toBeVisible();

  const stoppedAt = await page.evaluate(() => playBuilder.session.clock.elapsed);
  await page.evaluate(() => playBuilder.action('playPause'));
  await page.evaluate(()=>playBuilder.session.tick(performance.now()+5000));
  await page.evaluate(()=>playBuilder.seek(1));
  await page.evaluate(async()=>{
    await playBuilder.action('seek',1);
    await playBuilder.action('chapter',playBuilder.document.shots[2].id);
    await playBuilder.action('scrubBegin',{id:'unacknowledged'});
    await playBuilder.action('scrubSeek',{id:'unacknowledged',time:1});
    await playBuilder.action('scrubEnd',{id:'unacknowledged'});
  });
  expect(await page.evaluate(() => playBuilder.session.clock.elapsed)).toBe(stoppedAt);
  expect(await page.evaluate(() => playBuilder.session.clock.playing)).toBe(false);

  await page.evaluate(() => playBuilder.action('acknowledgeWaypoints'));
  expect(await page.evaluate(() => playBuilder.waypointPolicy.requiresConfirmation)).toBe(false);
  await page.evaluate(() => playBuilder.action('playPause'));
  await expect.poll(() => page.evaluate(() => playBuilder.session.clock.elapsed)).toBeGreaterThan(stoppedAt);
  expect(await page.evaluate(() => playBuilder.compiled.validShotCount)).toBeGreaterThan(0);
  await page.evaluate(() => playBuilder.pause());

  const firstKey = pending.key;
  await page.evaluate(async () => {
    await playBuilder.action('selectShot', playBuilder.document.shots[2].id);
    await playBuilder.action('editShot', {
      field: 'movement.waypoints', value: [{ x: 13.5, y: 7.5 }, { x: 10.5, y: 10.5 }]
    });
  });
  expect(await page.evaluate(() => playBuilder.waypointPolicy)).toMatchObject({ requiresConfirmation: true });
  expect(await page.evaluate(() => playBuilder.waypointPolicy.key)).not.toBe(firstKey);

  await page.evaluate(() => playBuilder.action('selectShot', playBuilder.document.shots[0].id));
  await page.getByLabel('Choose shot chapter', {exact:true}).click();
  await page.getByRole('button', { name: 'Customize Shot 3', exact: true }).click();
  expect(await page.evaluate(() => playBuilder.selectedShotId)).toBe(imported.shotId);
  await page.getByRole('button', { name: 'Preview destination only', exact: true }).click();
  expect(await page.evaluate(() => playBuilder.waypointPolicy.requiresConfirmation)).toBe(false);

  const lifecycle = await page.evaluate(() => {
    const exact = structuredClone(playBuilder.document.shots[2].movement.waypoints);
    const exported = JSON.parse(playBuilder.store.exportJSON(playBuilder.document));
    const saved = playBuilder.store.open(playBuilder.document.id);
    return { exact, exported: exported.shots[2].movement.waypoints, saved: saved.shots[2].movement.waypoints };
  });
  expect(lifecycle.exported).toEqual(lifecycle.exact);
  expect(lifecycle.saved).toEqual(lifecycle.exact);

  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !window.playBuilder.busy);
  expect(await page.evaluate(() => playBuilder.document.shots[2].movement.waypoints)).toEqual(lifecycle.exact);
  expect(await page.evaluate(() => playBuilder.waypointPolicy.requiresConfirmation)).toBe(true);
  await expect(page.getByText(WAYPOINT_DISCLOSURE, { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview destination only', exact: true })).toBeVisible();
});
