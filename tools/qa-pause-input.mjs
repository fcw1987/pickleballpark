// Diagnostic only: record delivered UI events without replacing application handlers.
import { chromium, webkit } from '@playwright/test';
const engine = process.env.QA_BROWSER || 'webkit';
const browser = await ({ chromium, webkit })[engine].launch();
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4184';
const results = [];
try {
  for (const workspace of ['planner', 'builder']) {
    const page = await browser.newPage();
    await page.goto(`${base}/?workspace=${workspace}&qa-pause-input=1`);
    await page.waitForFunction(workspace => window.pickleboard?.threeD &&
      (workspace === 'planner' || (window.playBuilder && !playBuilder.busy)), workspace);
    if (workspace === 'planner') {
      await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
      await page.locator('#play3dView').click();
    }
    const selector = workspace === 'planner' ? '#threeDPlayPause' : '[data-action="play-pause"]';
    await page.evaluate(() => {
      window.qaPauseEvents = [];
      for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'])
        document.addEventListener(type, event => {
          const el = event.target.closest?.('button');
          qaPauseEvents.push({ type, id: el?.id, action: el?.dataset.action, target: event.target.tagName,
            time: performance.now(), playing: pickleboard.plays.session.playing, elapsed: pickleboard.plays.clock.elapsed,
            label: el?.getAttribute('aria-label'), detail: event.detail });
        }, true);
      pickleboard.plays.setPlaybackRate(.25);
    });
    const state = () => page.evaluate(() => ({ playing: pickleboard.plays.session.playing,
      clockPlaying: pickleboard.plays.clock.playing, elapsed: pickleboard.plays.clock.elapsed,
      owner: pickleboard.plays.session.owner, events: qaPauseEvents }));
    const failures = [];
    for (let trial = 0; trial < 60; trial++) {
      await page.evaluate(() => { pickleboard.plays.pause(); pickleboard.plays.timelineAction('seek', 0); qaPauseEvents.length = 0; });
      await page.locator(selector).click();
      await page.waitForTimeout(300);
      const playing = await state();
      await page.locator(selector).click();
      const immediate = await state();
      await page.waitForTimeout(150);
      const later = await state();
      if (!playing.playing || immediate.playing || later.playing || later.elapsed !== immediate.elapsed)
        failures.push({ trial, playing, immediate, later });
    }
    results.push({ engine, workspace, trials: 60, failures });
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(results, null, 2));
if (results.some(result => result.failures.length)) process.exitCode = 1;
