import { expect, test } from '@playwright/test';

async function openBuilder(page) {
  await page.addInitScript(() => localStorage.removeItem('pickleballpark-builder-v1'));
  await page.goto('/?gauntlet-robustness=1');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.evaluate(async () => {
    if (playBuilder.view !== '2d') await playBuilder.switchView('2d');
  });
}

test('timeline manipulation cancels pending target placement before the next court tap', async ({ page }) => {
  await openBuilder(page);
  const before = await page.evaluate(async () => {
    await playBuilder.action('placeTarget');
    return {
      document: structuredClone(playBuilder.document),
      placing: playBuilder.courtTools.placing,
      history: playBuilder.history.index
    };
  });
  expect(before.placing).toBe(true);

  const timeline = page.getByRole('slider', { name: 'Rally timeline' });
  await timeline.focus();
  await timeline.press('End');
  expect(await page.evaluate(() => ({
    placing: playBuilder.courtTools.placing,
    drag: Boolean(playBuilder.courtTools.drag),
    document: playBuilder.document,
    history: playBuilder.history.index
  }))).toEqual({ placing: false, drag: false, document: before.document, history: before.history });
});

test('a second touch outside the court cancels an active target drag without committing it', async ({ page }) => {
  await openBuilder(page);
  const before = await page.evaluate(async () => {
    await playBuilder.action('placeTarget');
    return {
      target: structuredClone(playBuilder.selectedShot.target),
      point: playBuilder.courtTools.project(playBuilder.selectedShot.target),
      history: playBuilder.history.index
    };
  });

  await page.mouse.move(before.point.x, before.point.y);
  await page.mouse.down();
  await page.mouse.move(before.point.x + 42, before.point.y + 18);
  expect(await page.evaluate(() => Boolean(playBuilder.courtTools.drag))).toBe(true);

  await page.locator('.builder-transport').dispatchEvent('pointerdown', {
    pointerId: 991,
    pointerType: 'touch',
    isPrimary: false,
    bubbles: true
  });

  expect(await page.evaluate(() => ({
    placing: playBuilder.courtTools.placing,
    drag: Boolean(playBuilder.courtTools.drag),
    target: playBuilder.selectedShot.target,
    history: playBuilder.history.index
  }))).toEqual({ placing: false, drag: false, target: before.target, history: before.history });
  await page.mouse.up();
});

test('a visible viewport change cancels armed placement before coordinate projection changes', async ({ page }) => {
  await openBuilder(page);
  const before = await page.evaluate(async () => {
    await playBuilder.action('placeTarget');
    return { document: structuredClone(playBuilder.document), history: playBuilder.history.index };
  });

  await page.evaluate(() => playBuilder.viewportChanged());
  expect(await page.evaluate(() => ({
    placing: playBuilder.courtTools.placing,
    drag: Boolean(playBuilder.courtTools.drag),
    document: playBuilder.document,
    history: playBuilder.history.index
  }))).toEqual({ placing: false, drag: false, document: before.document, history: before.history });
});

test('Court Planner rejects a second touch instead of transferring the active drag', async ({ page }) => {
  await openBuilder(page);
  const originalSecond = await page.evaluate(async () => {
    await playBuilder.setWorkspace('planner');
    return { x: pickleboard.tokens.player2.x, y: pickleboard.tokens.player2.y };
  });
  const firstTarget = page.locator('#player1-touch');
  const secondTarget = page.locator('#player2-touch');
  const firstBox = await firstTarget.boundingBox();
  const secondBox = await secondTarget.boundingBox();
  const touch = (identifier, x, y) => ({ identifier, clientX: x, clientY: y, screenX: x, screenY: y, pageX: x, pageY: y });
  const first = touch(41, firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await firstTarget.dispatchEvent('touchstart', { touches: [first], targetTouches: [first], changedTouches: [first] });
  const moved = touch(41, first.clientX + 28, first.clientY + 12);
  await firstTarget.dispatchEvent('touchmove', { touches: [moved], targetTouches: [moved], changedTouches: [moved] });
  const second = touch(42, secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
  await secondTarget.dispatchEvent('touchstart', { touches: [moved, second], targetTouches: [second], changedTouches: [second] });
  const result = await page.evaluate(original => {
    const board = pickleboard;
    return {
      dragging: board.dragState.isDragging,
      owner: board.dragState.dragElement?.id || null,
      second: { x: board.tokens.player2.x, y: board.tokens.player2.y },
      originalSecond: original
    };
  }, originalSecond);

  expect(result).toEqual({ dragging: false, owner: null, second: result.originalSecond, originalSecond: result.originalSecond });
});

test('Court Planner ignores non-primary mouse presses and never transfers a held drag', async ({ page }) => {
  await openBuilder(page);
  await page.evaluate(() => playBuilder.setWorkspace('planner'));
  const first = await page.locator('#player1-touch').boundingBox();
  const second = await page.locator('#player2-touch').boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
  await page.mouse.down({ button: 'right' });
  expect(await page.evaluate(() => ({
    dragging: pickleboard.dragState.isDragging,
    owner: pickleboard.dragState.dragElement?.id || null
  }))).toEqual({ dragging: false, owner: null });
  await page.mouse.up({ button: 'right' });
  await page.mouse.up();
});

test('Court Planner second-touch drawing interruption leaves no orphan path', async ({ page }) => {
  await openBuilder(page);
  await page.evaluate(async () => {
    await playBuilder.setWorkspace('planner');
    pickleboard.setDrawingMode(true);
  });
  const court = page.locator('#court');
  const rect = await court.boundingBox();
  const touch = (identifier, x, y) => ({ identifier, clientX: x, clientY: y, screenX: x, screenY: y, pageX: x, pageY: y });
  const first = touch(51, rect.x + rect.width * .4, rect.y + rect.height * .4);
  await court.dispatchEvent('touchstart', { touches: [first], targetTouches: [first], changedTouches: [first] });
  const moved = touch(51, first.clientX + 30, first.clientY + 20);
  await court.dispatchEvent('touchmove', { touches: [moved], targetTouches: [moved], changedTouches: [moved] });
  const second = touch(52, rect.x + rect.width * .65, rect.y + rect.height * .55);
  await court.dispatchEvent('touchstart', { touches: [moved, second], targetTouches: [moved, second], changedTouches: [second] });
  const result = await page.evaluate(() => {
    const board = pickleboard;
    return {
      drawing: board.isDrawing,
      current: Boolean(board.currentPath),
      paths: board.drawingPaths.length,
      children: board.drawingLayer.children.length,
      saved: board.captureBoardState().drawings.length
    };
  });

  expect(result).toEqual({ drawing: false, current: false, paths: 1, children: 1, saved: 1 });
});

test('backgrounding ends Planner gestures with one coherent saved drawing', async ({ page }) => {
  await openBuilder(page);
  const result = await page.evaluate(async () => {
    await playBuilder.setWorkspace('planner');
    const board = pickleboard;
    const player = board.tokens.player1;
    board.startDrag({ button: 0, clientX: 100, clientY: 100, preventDefault() {} }, player);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const dragEnded = !board.dragState.isDragging && board.dragState.dragElement === null;
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });

    board.setDrawingMode(true);
    const event = { button: 0, clientX: 120, clientY: 160, preventDefault() {} };
    board.startDrawing(event);
    board.draw({ ...event, clientX: 150, clientY: 190 });
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return {
      dragEnded,
      drawing: board.isDrawing,
      current: Boolean(board.currentPath),
      paths: board.drawingPaths.length,
      children: board.drawingLayer.children.length,
      saved: board.captureBoardState().drawings.length
    };
  });

  expect(result).toEqual({ dragEnded: true, drawing: false, current: false, paths: 1, children: 1, saved: 1 });
});

test('returning from Planner finalizes an interrupted drawing before taking its snapshot', async ({ page }) => {
  await openBuilder(page);
  const result = await page.evaluate(async () => {
    await playBuilder.setWorkspace('planner');
    const board = pickleboard;
    board.setDrawingMode(true);
    const event = { button: 0, clientX: 120, clientY: 160, preventDefault() {} };
    board.startDrawing(event);
    board.draw({ ...event, clientX: 155, clientY: 195 });
    await playBuilder.setWorkspace('builder');
    return {
      workspace: playBuilder.workspace,
      drawing: board.isDrawing,
      current: Boolean(board.currentPath),
      snapshotDrawings: playBuilder.plannerSnapshot.drawings.length
    };
  });

  expect(result).toEqual({ workspace: 'builder', drawing: false, current: false, snapshotDrawings: 1 });
});

test('an older failed 2D actor load cannot announce failure over a newer load of the same play', async ({ page }) => {
  await openBuilder(page);
  const result = await page.evaluate(async () => {
    const engine = playBuilder.board.plays;
    const play = engine.activePlay;
    const timeline = engine.timeline;
    const pending = [];
    engine.pixelActors.load = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
    engine.loadDefinition(play, timeline);
    const older = pending[0];
    engine.loadDefinition(play, timeline);
    const newer = pending[1];
    newer.resolve(true);
    await Promise.resolve();
    engine.elements.announcement.textContent = 'Newer load retained';
    older.reject(new Error('older asset failure'));
    await Promise.resolve();
    await Promise.resolve();
    return {
      announcement: engine.elements.announcement.textContent,
      activePlay: engine.activePlay?.id,
      expectedPlay: play.id
    };
  });

  expect(result).toEqual({ announcement: 'Newer load retained', activePlay: result.expectedPlay, expectedPlay: result.expectedPlay });
});
