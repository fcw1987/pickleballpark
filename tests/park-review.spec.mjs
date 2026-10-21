import { expect, test } from '@playwright/test';

async function loadPlay(page, playId = 'third-shot-drop') {
  await page.goto('/index.html?workspace=planner&park-independent-review=1');
  await page.waitForFunction(() => Boolean(window.pickleboard?.plays && window.pickleboard?.threeD));
  await page.evaluate(id => pickleboard.plays.load(id), playId);
}

test('WebGL allocation failure returns session ownership to resumable guided playback', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return /webgl/.test(type) ? null : getContext.call(this, type, ...args);
    };
  });
  await loadPlay(page);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));

  await page.locator('#play3dView').click();
  await expect(page.locator('#threeDLoadStatus')).toBeVisible();
  await expect(page.locator('#threeDViewer')).toBeHidden();
  expect(await page.evaluate(() => pickleboard.plays.session.owner)).toBe('guided');

  await page.locator('#playPlayPause').click();
  await page.clock.runFor(250);
  expect(await page.evaluate(() => pickleboard.plays.clock.elapsed)).toBeGreaterThan(0.1);
});

test('failed 3D module leaves the board resumable and a retry can enter 3D', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let requests = 0;
  try {
    await loadPlay(page);
    // The dimensional world is geometry, so no park texture fetch is required.
    // Fail the actual lazy entry; retries use a new URL after module failures.
    await page.route('**/three-d-playback.js*', route => ++requests === 1 ? route.abort() : route.continue());

    await page.locator('#play3dView').click();
    await expect(page.locator('#threeDLoadStatus')).toContainText('Your board is safe');
    await expect(page.locator('#threeDCanvas canvas')).toHaveCount(0);
    await expect(page.locator('#play3dView')).toBeEnabled();
    await expect(page.locator('#play3dView')).not.toHaveAttribute('aria-busy', 'true');
    expect(requests).toBe(1);
    expect(await page.evaluate(() => ({ owner: pickleboard.plays.session.owner,
      active: pickleboard.threeD.active })))
      .toEqual({ owner: 'guided', active: false });

    // Guided playback really resumes after the failed handoff.
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    await page.locator('#playPlayPause').click();
    await page.clock.runFor(250);
    expect(await page.evaluate(() => pickleboard.plays.clock.elapsed)).toBeGreaterThan(0.1);
    await page.locator('#playPlayPause').click();

    await page.locator('#play3dView').click();
    await expect.poll(() => page.evaluate(() => pickleboard.threeD.active)).toBe(true);
    expect(requests).toBe(2);
    await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
    expect(await page.evaluate(() => pickleboard.plays.session.owner)).toBe('replay');
  } finally { await context.close(); }
});

test('leaving a Play cancels a pending 3D handoff instead of opening the stale Play', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await loadPlay(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let moduleRequestStarted = false;
  await page.route('**/three-d-playback.js', async route => {
    moduleRequestStarted = true;
    await gate;
    await route.continue();
  });

  try {
    await page.locator('#play3dView').click();
    await expect(page.locator('#play3dView')).toHaveAttribute('aria-busy', 'true');
    await expect.poll(() => moduleRequestStarted).toBe(true);
    await page.locator('#playExit').click();
    await page.evaluate(() => pickleboard.plays.load('dink-exchange'));
    const nextSnapshot = await page.evaluate(() => pickleboard.plays.snapshot);
    // Cancellation must release the entry immediately, before the old download
    // finishes. ES module downloads cannot be aborted, so stale intent is fenced.
    await expect(page.locator('#play3dView')).toBeEnabled({ timeout: 500 });
    await expect(page.locator('#play3dView')).not.toHaveAttribute('aria-busy', 'true');
    release();
    await page.evaluate(async () => { await import('./three-d-playback.js'); });
    expect(await page.evaluate(() => ({ owner: pickleboard.plays.session.owner,
      active: pickleboard.threeD.active, play: pickleboard.plays.activePlay.id })))
      .toEqual({ owner: 'guided', active: false, play: 'dink-exchange' });
    expect(await page.evaluate(() => pickleboard.plays.snapshot)).toEqual(nextSnapshot);
    await expect(page.locator('#threeDCanvas canvas')).toHaveCount(0);
    await expect(page.locator('#threeDViewer')).toBeHidden();
    await expect(page.locator('#threeDLoadStatus')).toBeHidden();

    await page.locator('#play3dView').click();
    await expect.poll(() => page.evaluate(() => pickleboard.threeD.active)).toBe(true);
    expect(await page.evaluate(() => ({ owner: pickleboard.plays.session.owner,
      play: pickleboard.threeD.currentPlay.id })))
      .toEqual({ owner: 'replay', play: 'dink-exchange' });
    await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  } finally {
    release();
    await context.close();
  }
});

test('camera changes and a 3D exit-restart keep one timeline and the original board snapshot', async ({ page }) => {
  await loadPlay(page, 'volley-block');
  const original = await page.evaluate(() => pickleboard.plays.snapshot);
  await page.locator('#play3dView').click();
  await expect.poll(() => page.evaluate(() => pickleboard.threeD.active)).toBe(true);

  const audit = await page.evaluate(() => {
    const viewer = pickleboard.threeD;
    const segment = viewer.timeline.segments.find(item => item.step.id === 'forehand-volley');
    const time = segment.startTime + segment.contactTime;
    viewer.session.seek(time);
    viewer.applyAtTime(time);
    return ['overhead', 'sideline', 'behind-green', 'behind-orange'].map(camera => {
      viewer.setCamera(camera);
      const actor = viewer.playerObjects.get(segment.shotSemantics.playerId);
      return {
        camera,
        elapsed: viewer.clock.elapsed,
        phase: actor.userData.animation.phase,
        root: actor.position.toArray(),
        ball: viewer.ballObject.position.toArray(),
        paddleError: actor.userData.paddleFaceWorld.distanceTo(viewer.ballObject.position)
      };
    });
  });
  expect(new Set(audit.map(item => item.elapsed)).size).toBe(1);
  expect(new Set(audit.map(item => item.phase))).toEqual(new Set(['contact']));
  expect(new Set(audit.map(item => JSON.stringify(item.root))).size).toBe(1);
  expect(new Set(audit.map(item => JSON.stringify(item.ball))).size).toBe(1);
  expect(Math.max(...audit.map(item => item.paddleError))).toBeLessThan(0.01);

  await page.locator('#threeDExit').click();
  await page.locator('#playTimelineMount input[type=range]').fill('0');
  expect(await page.evaluate(() => ({ owner: pickleboard.plays.session.owner,
    elapsed: pickleboard.plays.clock.elapsed, playing: pickleboard.plays.clock.playing })))
    .toEqual({ owner: 'guided', elapsed: 0, playing: false });
  await page.locator('#playExit').click();
  expect(await page.evaluate(() => pickleboard.captureBoardState())).toEqual(original);
});
