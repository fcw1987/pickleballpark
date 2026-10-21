import { expect, test } from '@playwright/test';

const start = async page => {
  await page.goto('/index.html?lifecycle-review=1');
  await page.waitForFunction(() => window.playBuilder && !window.playBuilder.busy);
};

const frames = (page, count = 4) => page.evaluate(frameCount => new Promise(resolve => {
  const next = () => --frameCount ? requestAnimationFrame(next) : resolve();
  requestAnimationFrame(next);
}), count);

test('30 view and planner round trips preserve source, playhead, and planner drawings', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async () => {
    const b = playBuilder;
    await b.switchView('2d');
    await b.action('title', 'Lifecycle source sentinel');
    b.seek(Math.min(1.375, b.session.duration));
    await b.setWorkspace('planner');
    b.board.updateTokenPosition(b.board.tokens.player1, 6.25, 31.5);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('drawing-stroke');
    path.setAttribute('d', 'M 2 3 L 7 11');
    b.board.drawingLayer.appendChild(path);
    b.board.drawingPaths.push(path);
    const planner = b.board.captureBoardState();
    await b.setWorkspace('builder');
    const source = JSON.stringify(b.document);
    const time = b.session.clock.elapsed;
    for (let index = 0; index < 30; index += 1) {
      await b.switchView('3d');
      await b.switchView('2d');
      await b.setWorkspace('planner');
      if (JSON.stringify(b.board.captureBoardState()) !== JSON.stringify(planner)) throw new Error(`planner drift at ${index}`);
      await b.setWorkspace('builder');
      if (JSON.stringify(b.document) !== source) throw new Error(`source drift at ${index}`);
      if (Math.abs(b.session.clock.elapsed - time) > 1e-9) throw new Error(`playhead drift at ${index}`);
    }
    return { source: JSON.stringify(b.document), time: b.session.clock.elapsed, planner: b.plannerSnapshot };
  });
  expect(JSON.parse(result.source).title).toBe('Lifecycle source sentinel');
  expect(result.time).toBeCloseTo(1.375, 8);
  expect(result.planner.drawings).toEqual(['M 2 3 L 7 11']);
  expect(result.planner.positions.player1).toEqual({ x: 6.25, y: 31.5 });
});

test('paused 3D demand renders settle without RAF growth', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => { if (playBuilder.view !== '3d') await playBuilder.switchView('3d'); playBuilder.pause(); });
  await frames(page);
  const baseline = await page.evaluate(() => pickleboard.threeD.renderLoopCount);
  for (let index = 0; index < 20; index += 1) {
    await page.evaluate(i => {
      const viewer = pickleboard.threeD;
      viewer.setCamera(i % 2 ? 'sideline' : 'overhead');
      viewer.resize();
      playBuilder.seek((i % 5) / 10);
    }, index);
    await frames(page, 2);
    expect(await page.evaluate(() => pickleboard.threeD.renderLoopId)).toBeNull();
  }
  const settled = await page.evaluate(() => pickleboard.threeD.renderLoopCount);
  await frames(page, 8);
  expect(await page.evaluate(() => ({ count: pickleboard.threeD.renderLoopCount, id: pickleboard.threeD.renderLoopId })))
    .toEqual({ count: settled, id: null });
  expect(settled).toBeGreaterThan(baseline);
});

test('a delayed 3D entry cancelled by planner switch cannot reopen stale 3D', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async () => {
    const b = playBuilder;
    await b.switchView('2d');
    const viewer = b.board.threeD;
    const realEnter = viewer.enter.bind(viewer);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    viewer.enter = async () => { await gate; return realEnter(); };
    const pending = b.switchView('3d');
    await Promise.resolve();
    await b.setWorkspace('planner');
    release();
    await pending;
    return { workspace: b.workspace, view: b.view, busy: b.busy, active: viewer.active,
      locked: b.board.playInteractionLocked, drawingLayerConnected: b.board.drawingLayer.isConnected };
  });
  expect(result).toEqual({ workspace: 'planner', view: '2d', busy: false, active: false, locked: false, drawingLayerConnected: true });
  await expect(page.locator('#threeDViewer')).toBeHidden();
});

test('3D allocation failure returns the builder to an editable 2D fallback', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (/webgl/.test(type)) return null;
      return getContext.call(this, type, ...args);
    };
  });
  await start(page);
  expect(await page.evaluate(() => ({ view: playBuilder.view, busy: playBuilder.busy, active: pickleboard.threeD.active,
    message: playBuilder.message, locked: pickleboard.playInteractionLocked }))).toMatchObject({
    view: '2d', busy: false, active: false, locked: true
  });
  await page.evaluate(() => playBuilder.action('title', 'Edited after 3D failure'));
  expect(await page.evaluate(() => playBuilder.document.title)).toBe('Edited after 3D failure');
  await expect(page.locator('#threeDViewer')).toBeHidden();
});

test('50 accelerated loop iterations exit without a pending restart', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async () => {
    const b = playBuilder;
    await b.switchView('2d');
    b.board.plays.timingScale = 0.001;
    b.board.plays.setLoop(true);
    const session = b.session;
    session.play(1000);
    session.clock.lastTimestamp = 1000;
    session.tick(1000 + (session.duration + session.holdSeconds) * 50 * 0.001 * 1000, b.board.plays.timingScale);
    const iterations = session.iteration;
    b.board.plays.exit();
    return { iterations, frame: b.board.plays.animationFrame, timer: b.board.plays.advanceTimer,
      playing: session.clock.playing, activePlay: b.board.plays.activePlay, owner: session.owner };
  });
  expect(result).toEqual({ iterations: 50, frame: null, timer: null, playing: false, activePlay: null, owner: 'guided' });
  await frames(page, 6);
  expect(await page.evaluate(() => ({ frame: pickleboard.plays.animationFrame, timer: pickleboard.plays.advanceTimer,
    activePlay: pickleboard.plays.activePlay }))).toEqual({ frame: null, timer: null, activePlay: null });
});

test('saved source reloads and malformed storage fails closed with a visible recovery state', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    await playBuilder.action('title', 'Persistent lifecycle draft');
    await playBuilder.action('editShot', { field: 'target.x', value: 6.75 });
  });
  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !window.playBuilder.busy);
  expect(await page.evaluate(() => ({ title: playBuilder.document.title, x: playBuilder.document.shots[0].target.x })))
    .toEqual({ title: 'Persistent lifecycle draft', x: 6.75 });

  await page.evaluate(() => localStorage.setItem('pickleballpark-builder-v1', '{malformed'));
  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !window.playBuilder.busy);
  const recovery = await page.evaluate(() => ({ title: playBuilder.document.title, status: playBuilder.saveStatus,
    valid: playBuilder.compiled.validShotCount, raw: localStorage.getItem('pickleballpark-builder-v1') }));
  expect(recovery.title).not.toBe('Persistent lifecycle draft');
  expect(recovery.status).toContain('Storage recovery needed');
  expect(recovery.valid).toBeGreaterThan(0);
  expect(recovery.raw).toBe('{malformed');
});
