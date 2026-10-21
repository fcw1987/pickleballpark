import { test, expect } from '@playwright/test';

const open = async page => {
  await page.goto('/?iphone-input=1');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.evaluate(async () => {
    localStorage.removeItem('pickleballpark-builder-v1');
    if (playBuilder.view !== '2d') await playBuilder.switchView('2d');
  });
};

test('paused mouse drag keeps its grab offset, clamps to court, and creates one undo command', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => structuredClone(playBuilder.document));
  const point = await page.evaluate(() => playBuilder.courtTools.project(playBuilder.selectedShot.target));
  await page.mouse.move(point.x + 9, point.y + 6);
  await page.mouse.down();
  await page.mouse.move(-200, 2000, { steps: 5 });
  await page.mouse.up();

  expect(await page.evaluate(() => playBuilder.selectedShot.target)).toEqual({ x: 0, y: 44 });
  await page.evaluate(() => playBuilder.action('undo'));
  expect(await page.evaluate(() => playBuilder.document)).toEqual(before);
  await page.evaluate(() => playBuilder.action('undo'));
  expect(await page.evaluate(() => playBuilder.document)).toEqual(before);
});

test('native emulated touch places one bounded target and remains undoable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });
  const page = await context.newPage();
  await open(page);
  const before = await page.evaluate(() => structuredClone(playBuilder.document));
  await page.locator('.builder-context-actions [data-action="collapse-inspector"]').click();
  await page.getByRole('button',{name:'Place target on court',exact:true}).click();
  await page.evaluate(() => {
    playBuilder.courtTools.surface.addEventListener('pointerup', event => { window.actualTouchPoint = playBuilder.courtTools.unproject(event); }, { capture: true, once: true });
  });
  const point = await page.evaluate(() => playBuilder.courtTools.project({ x: 2.75, y: 39.25 }));
  // Native touch dispatch may quantize CSS coordinates differently by platform.
  // Send explicit whole-pixel coordinates; retain both exact input mapping and court accuracy.
  await page.touchscreen.tap(Math.round(point.x), Math.round(point.y));
  const { target, actual } = await page.evaluate(() => ({ target: playBuilder.selectedShot.target, actual: window.actualTouchPoint }));
  expect(target.x).toBeCloseTo(actual.x, 6);
  expect(target.y).toBeCloseTo(actual.y, 6);
  expect(Math.hypot(target.x - 2.75, target.y - 39.25)).toBeLessThan(.1);
  expect(await page.evaluate(() => playBuilder.courtTools.placing)).toBe(false);
  await page.evaluate(() => playBuilder.action('undo'));
  expect(await page.evaluate(() => playBuilder.document)).toEqual(before);
  await context.close();
});

for (const reason of ['pointercancel', 'lostpointercapture', 'resize', 'second-touch']) {
  test(`${reason} discards the preview and releases the active gesture`, async ({ page }) => {
    await open(page);
    const before = await page.evaluate(() => JSON.stringify(playBuilder.document));
    const point = await page.evaluate(() => {
      playBuilder.courtTools.beginPlacement();
      return playBuilder.courtTools.project(playBuilder.selectedShot.target);
    });
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 30, point.y + 20);
    await page.evaluate(reason => {
      const tools = playBuilder.courtTools;
      if (reason === 'pointercancel') tools.surface.dispatchEvent(new PointerEvent('pointercancel', { pointerId: tools.drag.pointer, bubbles: true }));
      else if (reason === 'lostpointercapture') tools.surface.releasePointerCapture(tools.drag.pointer);
      else if (reason === 'resize') window.dispatchEvent(new Event('resize'));
      else tools.surface.dispatchEvent(new PointerEvent('pointerdown', { pointerId: tools.drag.pointer + 1, pointerType: 'touch', isPrimary: false, bubbles: true }));
    }, reason);
    await page.mouse.up();
    expect(await page.evaluate(() => ({ placing: playBuilder.courtTools.placing, drag: playBuilder.courtTools.drag })))
      .toEqual({ placing: false, drag: null });
    expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(before);
  });
}

test('view-surface replacement cancels placement without editing source', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => JSON.stringify(playBuilder.document));
  await page.evaluate(async () => {
    playBuilder.courtTools.beginPlacement();
    await playBuilder.switchView('3d');
  });
  expect(await page.evaluate(() => ({ placing: playBuilder.courtTools.placing, drag: playBuilder.courtTools.drag })))
    .toEqual({ placing: false, drag: null });
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(before);
});

test('movement placement exposes one controller command with player identity', async ({ page }) => {
  await open(page);
  const command = await page.evaluate(async () => {
    const builder = playBuilder;
    const realAction = builder.action.bind(builder);
    let received = null;
    builder.action = (action, value) => { received = { action, value }; };
    builder.courtTools.beginPlacement({ field: 'playerMovement.player2.target', player: 'player2' });
    const point = builder.courtTools.project({ x: 4.5, y: 12.25 });
    const pointerId = 991;
    const event = { pointerId, pointerType: 'touch', isPrimary: true, button: 0, clientX: point.x, clientY: point.y,
      preventDefault() {}, stopPropagation() {} };
    const surface = builder.courtTools.surface;
    const capture = surface.setPointerCapture, release = surface.releasePointerCapture, has = surface.hasPointerCapture;
    surface.setPointerCapture = () => {}; surface.releasePointerCapture = () => {}; surface.hasPointerCapture = () => false;
    builder.courtTools.down(event); builder.courtTools.up(event);
    surface.setPointerCapture = capture; surface.releasePointerCapture = release; surface.hasPointerCapture = has;
    builder.action = realAction;
    return received;
  });
  expect(command.action).toBe('editMovement');
  expect(command.value).toMatchObject({ player: 'player2', field: 'target' });
  expect(command.value.value.x).toBeCloseTo(4.5, 6);
  expect(command.value.value.y).toBeCloseTo(12.25, 6);
});

test('playing court remains protected from hidden target capture', async ({ page }) => {
  await open(page);
  await page.evaluate(() => playBuilder.play());
  await expect.poll(() => page.evaluate(() => playBuilder.session.clock.elapsed)).toBeGreaterThan(0);
  const before = await page.evaluate(() => JSON.stringify(playBuilder.document));
  const point = await page.evaluate(() => playBuilder.courtTools.project(playBuilder.selectedShot.target));
  await page.mouse.click(point.x, point.y);
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document))).toBe(before);
  expect(await page.evaluate(() => playBuilder.courtTools.drag)).toBeNull();
});

test('changing shots or starting playback cancels the previous placement owner',async({page})=>{
 await open(page);const source=await page.evaluate(()=>JSON.stringify(playBuilder.document));
 await page.evaluate(()=>{playBuilder.courtTools.beginPlacement();return playBuilder.action('selectShot',playBuilder.document.shots[1].id);});
 expect(await page.evaluate(()=>playBuilder.courtTools.placing)).toBe(false);
 expect(await page.evaluate(()=>JSON.stringify(playBuilder.document))).toBe(source);
 await page.evaluate(()=>{playBuilder.courtTools.beginPlacement();playBuilder.play();});
 expect(await page.evaluate(()=>playBuilder.courtTools.placing)).toBe(false);
 const point=await page.evaluate(()=>playBuilder.courtTools.project(playBuilder.selectedShot.target));await page.mouse.click(point.x,point.y);
 expect(await page.evaluate(()=>playBuilder.session.clock.playing)).toBe(true);expect(await page.evaluate(()=>JSON.stringify(playBuilder.document))).toBe(source);
});

test('adding a shot cancels the earlier placement without another edit on pointer release',async({page})=>{
 await open(page);await page.evaluate(()=>{playBuilder.courtTools.beginPlacement();return playBuilder.action('addShot');});
 expect(await page.evaluate(()=>playBuilder.courtTools.placing)).toBe(false);const source=await page.evaluate(()=>JSON.stringify(playBuilder.document));
 const point=await page.evaluate(()=>playBuilder.courtTools.project({x:10,y:22}));await page.mouse.click(point.x,point.y);expect(await page.evaluate(()=>JSON.stringify(playBuilder.document))).toBe(source);
});
