import { expect, test } from '@playwright/test';

async function openApp(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/index.html?workspace=planner&plays-e2e=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.plays))).toBe(true);
  return errors;
}

async function loadPlay(page, id) {
  await page.evaluate(playId => window.pickleboard.plays.load(playId), id);
  await expect(page.locator('#playbackControls')).toBeVisible();
}

async function engineState(page) {
  return page.evaluate(() => window.pickleboard.plays.getState());
}

const expectedPlays = [
  ['serve-and-return', 'Serve & Return'],
  ['third-shot-drop', 'Third Shot Drop'],
  ['third-shot-drive', 'Third Shot Drive'],
  ['fifth-shot-drop', 'Fifth Shot Drop'],
  ['dink-exchange', 'Dink Exchange'],
  ['volley-block', 'Volley & Block'],
  ['short-hop-reset', 'Short-Hop Reset'],
  ['lob-overhead', 'Lob & Overhead']
];

test('library exposes the four opening Plays and four shot lessons and each can load', async ({ page }) => {
  const errors = await openApp(page);
  expect(await page.evaluate(() => window.pickleboard.plays.list().map(({ id, name }) => [id, name])))
    .toEqual(expectedPlays);
  await expect(page.locator('#playLibrary .play-library-btn')).toHaveCount(8);

  for (const [id, name] of expectedPlays) {
    await page.evaluate(playId => window.pickleboard.plays.load(playId), id);
    await expect(page.locator('#playbackTitle')).toHaveText(name);
    await page.evaluate(() => window.pickleboard.plays.exit());
  }
  expect(errors).toEqual([]);
});

test('one transport seeks chapters and the start deterministically', async ({ page }) => {
  await openApp(page);
  await loadPlay(page, 'third-shot-drop');
  expect(await engineState(page)).toMatchObject({ stepIndex: 0, stepCount: 5, status: 'paused' });
  await expect(page.locator('#playPrevious,#playNext,#playRestart,#playLoop')).toHaveCount(0);

  await page.evaluate(() => window.pickleboard.plays.timelineAction('chapter','return'));
  await expect.poll(async () => (await engineState(page)).stepIndex).toBe(1);
  await expect(page.locator('#playbackProgress')).toHaveText('Step 2 of 5');
  await page.locator('#playTimelineMount input[type=range]').fill('0');
  expect(await engineState(page)).toMatchObject({ stepIndex: 0, status: 'paused' });
  expect(await page.evaluate(() => window.pickleboard.getTokenPositions().ball)).toEqual({ x: 16.2, y: 0 });
  await expect(page.locator('#playPathLayer')).toBeEmpty();
});

test('automatic playback pauses cleanly, resumes, and repeats after the final hold', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    // Keep transitions short while leaving enough time for CI to exercise Pause
    // before the three-step play can race to completion.
    window.pickleboard.plays.timingScale = 0.05;
    window.pickleboard.plays.load('serve-and-return');
  });

  await page.locator('#playPlayPause').click();
  await expect.poll(async () => (await engineState(page)).status).toBe('playing');
  await page.locator('#playPlayPause').click();
  await expect.poll(async () => (await engineState(page)).status).toBe('paused');
  const paused = await engineState(page);
  await page.waitForTimeout(150);
  expect(await engineState(page)).toEqual(paused);

  await page.locator('#playPlayPause').click();
  await expect.poll(async () => (await engineState(page)).iteration, {timeout:5000}).toBeGreaterThan(0);
  expect(await engineState(page)).toMatchObject({ playing:true, loop:true, stepCount:3 });
  await expect(page.locator('#playPlayPause')).toHaveAttribute('aria-label','Pause rally');
  await page.locator('#playPlayPause').click();
  expect(await engineState(page)).toMatchObject({playing:false,status:'paused'});
});

test('Exit restores custom mode, positions, handedness, drawings, and removes play artifacts', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const board = window.pickleboard;
    board.setGameMode('singles');
    board.setTokenPosition('player1', 9, 10);
    board.setTokenPosition('ball', 12, 20);
    board.togglePlayerHandedness(board.tokens.player1);
    const drawing = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    drawing.classList.add('drawing-stroke');
    drawing.setAttribute('d', 'M 1 1 L 2 2');
    board.drawingLayer.appendChild(drawing);
    board.drawingPaths.push(drawing);
  });

  const before = await page.evaluate(() => ({
    mode: window.pickleboard.currentGameMode,
    positions: window.pickleboard.getTokenPositions(),
    handedness: window.pickleboard.tokens.player1.handedness,
    drawing: window.pickleboard.drawingPaths[0].getAttribute('d')
  }));
  await loadPlay(page, 'fifth-shot-drop');
  expect(await page.evaluate(() => window.pickleboard.currentGameMode)).toBe('doubles');
  await page.evaluate(() => window.pickleboard.plays.timelineAction('chapter','return'));
  await page.locator('#playExit').click();

  const after = await page.evaluate(() => ({
    mode: window.pickleboard.currentGameMode,
    positions: window.pickleboard.getTokenPositions(),
    handedness: window.pickleboard.tokens.player1.handedness,
    drawing: window.pickleboard.drawingPaths[0].getAttribute('d'),
    locked: window.pickleboard.playInteractionLocked,
    artifacts: document.querySelector('#playPathLayer').children.length
  }));
  expect(after).toEqual({ ...before, locked: false, artifacts: 0 });
  await expect(page.locator('#playbackControls')).toBeHidden();
});

test('play mode locks dragging and handedness changes', async ({ page }) => {
  await openApp(page);
  await loadPlay(page, 'serve-and-return');
  const before = await page.evaluate(() => ({
    position: window.pickleboard.getTokenPositions().player1,
    handedness: window.pickleboard.tokens.player1.handedness
  }));
  await page.locator('#player1').dispatchEvent('dblclick');
  const box = await page.locator('#player1').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 80);
  await page.mouse.up();
  expect(await page.evaluate(() => ({
    position: window.pickleboard.getTokenPositions().player1,
    handedness: window.pickleboard.tokens.player1.handedness
  }))).toEqual(before);
});

test('reduced motion keeps exact chapter destinations inspectable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await loadPlay(page, 'third-shot-drive');
  await page.evaluate(() => window.pickleboard.plays.timelineAction('chapter','return'));
  const endpoint = await page.evaluate(() => window.pickleboard.getTokenPositions().ball);
  expect(endpoint.x).toBeCloseTo(5.8, 9); expect(endpoint.y).toBeCloseTo(39, 9);
  expect(await engineState(page)).toMatchObject({ stepIndex: 1, status: 'paused' });
});

test('play controls remain inside required viewports without document overflow', async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await openApp(page);
    await loadPlay(page, 'serve-and-return');
    const layout = await page.evaluate(() => {
      const controls = document.querySelector('#playbackControls').getBoundingClientRect();
      const court = document.querySelector('#court').getBoundingClientRect();
      return { controls, court, height: document.documentElement.scrollHeight, viewport: innerHeight };
    });
    expect(layout.controls.left).toBeGreaterThanOrEqual(0);
    expect(layout.controls.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(layout.controls.top).toBeGreaterThanOrEqual(0);
    expect(layout.controls.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(layout.height).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.court.bottom).toBeLessThanOrEqual(viewport.height + 1);
    await page.evaluate(() => window.pickleboard.plays.exit());
  }
});

test('guided plays start and advance on an offline repeat visit', async ({ page, context }) => {
  await openApp(page);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.plays))).toBe(true);
  await loadPlay(page, 'third-shot-drop');
  await page.evaluate(() => window.pickleboard.plays.timelineAction('chapter','return'));
  expect(await engineState(page)).toMatchObject({ playId: 'third-shot-drop', stepIndex: 1 });
  await context.setOffline(false);
});
