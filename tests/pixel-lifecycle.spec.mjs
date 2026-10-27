// Legacy 3D compatibility coverage enters through the retained API; public UI defaults to pixel Canvas2D.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const counts = { resizeAdded: 0, resizeRemoved: 0, visibilityAdded: 0, visibilityRemoved: 0 };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (this === window && type === 'resize') counts.resizeAdded += 1;
      if (this === document && type === 'visibilitychange') counts.visibilityAdded += 1;
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      if (this === window && type === 'resize') counts.resizeRemoved += 1;
      if (this === document && type === 'visibilitychange') counts.visibilityRemoved += 1;
      return remove.call(this, type, listener, options);
    };
    window.__pixelLifecycleListeners = counts;
  });
  await page.goto('/index.html?workspace=planner&pixel-lifecycle=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
});

async function settleAnimationFrames(page, count = 4) {
  await page.evaluate(frameCount => new Promise(resolve => {
    let remaining = frameCount;
    const frame = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), count);
}

test('legacy 3D compatibility: paused replay renders only on demand and playback owns one scheduler', async ({ page }) => {
  await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
  await page.evaluate(() => { void pickleboard.threeD.enter(); });
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  await page.waitForFunction(()=>pickleboard.threeD.worldAssetsReady);
  await settleAnimationFrames(page);

  await page.evaluate(() => {
    const viewer = pickleboard.threeD;
    const render = viewer.renderer.render.bind(viewer.renderer);
    viewer.__testRenderCount = 0;
    viewer.renderer.render = (...args) => {
      viewer.__testRenderCount += 1;
      return render(...args);
    };
  });
  await settleAnimationFrames(page);
  expect(await page.evaluate(() => ({
    calls: pickleboard.threeD.__testRenderCount,
    scheduler: pickleboard.threeD.renderLoopId
  }))).toEqual({ calls: 0, scheduler: null });

  await page.locator('#threeDPlayPause').click();
  await settleAnimationFrames(page);
  const playing = await page.evaluate(() => ({
    calls: pickleboard.threeD.__testRenderCount,
    scheduler: pickleboard.threeD.renderLoopId,
    playing: pickleboard.threeD.clock.playing
  }));
  expect(playing.calls).toBeGreaterThan(0);
  expect(playing.scheduler).not.toBeNull();
  expect(playing.playing).toBe(true);

  await page.locator('#threeDPlayPause').click();
  await settleAnimationFrames(page);
  const pausedCalls = await page.evaluate(() => pickleboard.threeD.__testRenderCount);
  await settleAnimationFrames(page);
  expect(await page.evaluate(() => ({
    calls: pickleboard.threeD.__testRenderCount,
    scheduler: pickleboard.threeD.renderLoopId
  }))).toEqual({ calls: pausedCalls, scheduler: null });

  await page.locator('#threeDCamera').selectOption('sideline',{force:true});
  await settleAnimationFrames(page);
  let demandCalls = await page.evaluate(() => pickleboard.threeD.__testRenderCount);
  expect(demandCalls).toBeGreaterThan(pausedCalls);

  await page.evaluate(() => pickleboard.plays.timelineAction('chapter','return'));
  await settleAnimationFrames(page);
  expect(await page.evaluate(() => pickleboard.threeD.__testRenderCount)).toBeGreaterThan(demandCalls);
  demandCalls = await page.evaluate(() => pickleboard.threeD.__testRenderCount);
  await page.locator('#threeDTimelineMount input[type=range]').fill('0');
  await settleAnimationFrames(page);
  expect(await page.evaluate(() => pickleboard.threeD.__testRenderCount)).toBeGreaterThan(demandCalls);
  demandCalls = await page.evaluate(() => pickleboard.threeD.__testRenderCount);
  await page.evaluate(() => pickleboard.threeD.resize());
  await settleAnimationFrames(page);
  expect(await page.evaluate(() => pickleboard.threeD.__testRenderCount)).toBeGreaterThan(demandCalls);
});

test('legacy 3D compatibility: playing replay resumes its single scheduler after visibility returns', async ({ page }) => {
  await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
  await page.evaluate(() => { void pickleboard.threeD.enter(); });
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  await page.locator('#threeDPlayPause').click();
  await settleAnimationFrames(page, 2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await settleAnimationFrames(page, 2);
  expect(await page.evaluate(() => pickleboard.threeD.renderLoopId)).toBeNull();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => ({
    playing: pickleboard.threeD.clock.playing,
    scheduler: pickleboard.threeD.renderLoopId
  }))).toMatchObject({ playing: true, scheduler: expect.any(Number) });
});

test('legacy 3D compatibility: 30 editor to replay cycles preserve state and release owned lifecycle resources', async ({ page }) => {
  const baseline = await page.evaluate(() => {
    const board = pickleboard;
    board.setTokenPosition('player1', 8.25, 30.5);
    board.setTokenPosition('ball', 12.75, 17.25);
    board.tokens.player2.handedness = 'left';
    board.renderPlayerArtwork(board.tokens.player2);
    const drawing = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    drawing.classList.add('drawing-stroke');
    drawing.setAttribute('d', 'M 2 3 L 7 11');
    board.drawingLayer.appendChild(drawing);
    board.drawingPaths.push(drawing);
    return {
      snapshot: board.captureBoardState(),
      listeners: { ...window.__pixelLifecycleListeners }
    };
  });

  // Keep all thirty real renderer lifecycles and state checks, without adding
  // five traced browser-protocol round trips to every individual cycle.
  const cycles = await page.evaluate(async baselineSnapshot => {
    const result=[];
    for(let cycle=0;cycle<30;cycle++){
      const board=pickleboard;
      board.plays.load(cycle%2?'third-shot-drive':'third-shot-drop');
      if(!await board.threeD.enter())throw Error(`3D entry failed on cycle ${cycle+1}`);
      let renderedFrames=0;
      const render=board.threeD.renderer.render.bind(board.threeD.renderer);
      board.threeD.renderer.render=(...args)=>{const value=render(...args);renderedFrames++;return value;};
      board.threeD.togglePlay();board.threeD.togglePlay();
      board.threeD.setPlaybackRate(cycle%3===0 ? .5 : 1);
      board.threeD.setCamera(cycle%2?'sideline':'overhead');board.threeD.resize();
      await new Promise(resolve=>requestAnimationFrame(resolve));
      if(renderedFrames<1)throw Error(`No actual rendered frame on cycle ${cycle+1}`);
      const during={active:board.threeD.active,canvases:document.querySelectorAll('#threeDCanvas canvas').length,players:board.threeD.playerObjects.size};
      if(!during.active||during.canvases!==1||during.players!==4)throw Error(`Invalid live renderer on cycle ${cycle+1}`);
      board.threeD.exit();board.plays.exit();
      const after={active:board.threeD.active,scheduler:board.threeD.renderLoopId,canvases:document.querySelectorAll('#threeDCanvas canvas').length,snapshot:board.captureBoardState()};
      if(after.active||after.scheduler!==null||after.canvases!==0||JSON.stringify(after.snapshot)!==JSON.stringify(baselineSnapshot))throw Error(`Renderer cleanup or board drift on cycle ${cycle+1}`);
      result.push({during,renderedFrames,after});
    }
    return result;
  },baseline.snapshot);
  expect(cycles).toHaveLength(30);
  for(const [cycle,state]of cycles.entries()){
    expect(state.renderedFrames,`actual rendered frames cycle ${cycle+1}`).toBeGreaterThan(0);
    expect(state.during,`live renderer cycle ${cycle+1}`).toEqual({active:true,canvases:1,players:4});
    expect(state.after,`cleanup cycle ${cycle+1}`).toEqual({active:false,scheduler:null,canvases:0,snapshot:baseline.snapshot});
  }

  const final = await page.evaluate(() => ({
    listeners: { ...window.__pixelLifecycleListeners },
    canvases: document.querySelectorAll('#threeDCanvas canvas').length,
    snapshot: pickleboard.captureBoardState()
  }));
  expect(final.snapshot).toEqual(baseline.snapshot);
  expect(final.canvases).toBe(0);
  // The lazily-created 3D timeline remains mounted for the app lifetime so a
  // later replay can reuse it. Its one resize/visibility listener is stable
  // across all 30 entries; the renderer-owned listeners are still released.
  expect(final.listeners.resizeAdded - final.listeners.resizeRemoved)
    .toBe(baseline.listeners.resizeAdded - baseline.listeners.resizeRemoved + 1);
  expect(final.listeners.visibilityAdded - final.listeners.visibilityRemoved)
    .toBe(baseline.listeners.visibilityAdded - baseline.listeners.visibilityRemoved + 1);
});
