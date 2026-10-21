import { expect, test } from '@playwright/test';

async function state(page) {
  return page.evaluate(() => ({
    ...window.pickleboard.plays.getState(),
    positions: window.pickleboard.getTokenPositions(),
    path: window.pickleboard.plays.currentShotPath
      ? parseFloat(window.pickleboard.plays.currentShotPath.element.style.strokeDashoffset)
      : null
  }));
}

async function command(page, name) {
  await page.evaluate(method => window.pickleboard.plays[method](), name);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html?workspace=planner&resume-regression=1');
  await page.waitForFunction(() => window.pickleboard?.plays);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  // Freeze wall time between commands; runFor alone resumes real ticking.
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.evaluate(() => window.pickleboard.plays.load('serve-and-return'));
});

test('repeated pause resumes the same rally leg without skipping contact or changing its path', async ({ page }) => {
  await command(page, 'play');
  await page.clock.runFor(600);
  for (let index = 0; index < 2; index++) {
    await command(page, 'pause');
    const paused = await state(page);
    expect(paused.stepIndex).toBe(1);
    await page.clock.runFor(2000);
    expect(await state(page)).toEqual(paused);
    await command(page, 'play');
    expect(await state(page)).toEqual({ ...paused, status: 'playing', playing: true });
    await page.clock.runFor(100);
    const resumed = await state(page);
    expect(resumed.stepIndex).toBe(1);
    expect(resumed.elapsed).toBeGreaterThan(paused.elapsed);
    expect(Number(resumed.path)).toBeLessThan(Number(paused.path));
    expect(resumed.positions.ball.y).toBeGreaterThan(paused.positions.ball.y);
  }
  await command(page, 'pause');
  await page.evaluate(()=>pickleboard.plays.timelineAction('seek',pickleboard.plays.timeline.duration));
  const endpoint=await state(page);
  expect(endpoint.playing).toBe(false);
  expect(endpoint.stepIndex).toBe(2);
  // Final return lands at its authored deep target, with no restarted bounce arc.
  expect(endpoint.positions.ball.x).toBeCloseTo(15,9);
  expect(endpoint.positions.ball.y).toBeCloseTo(6,9);
});

test('final shot resumes to its actual final event, holds, and then repeats', async ({ page }) => {
  await page.evaluate(()=>pickleboard.plays.timelineAction('chapter',pickleboard.plays.chapters[1].shotId));
  await command(page,'play');
  await page.clock.runFor(320);
  await command(page,'pause');
  const paused=await state(page);
  expect(paused.stepIndex).toBe(2);
  expect(paused.status).toBe('paused');
  await command(page,'play');
  expect(await state(page)).toEqual({...paused,status:'playing',playing:true});
  const remaining=await page.evaluate(()=> (pickleboard.plays.timeline.duration-pickleboard.plays.clock.elapsed)*1000);
  await page.clock.runFor(Math.max(0,remaining-50));
  expect((await state(page)).status).toBe('playing');
  await page.clock.runFor(80);
  const ended=await state(page);
  expect(ended.status).toBe('playing'); expect(ended.playing).toBe(true);
  expect(await page.evaluate(()=>pickleboard.plays.session.holding)).toBe(true);
  expect(ended.positions.ball.x).toBeCloseTo(15,9);expect(ended.positions.ball.y).toBeCloseTo(6,9);
  await command(page,'pause');const held=await state(page);
  await page.clock.runFor(2000);expect(await state(page)).toEqual(held);
  await command(page,'play');await page.clock.runFor(1100);
  expect(await page.evaluate(()=>pickleboard.plays.session.iteration)).toBe(1);
  expect((await state(page)).elapsed).toBeLessThan(.3);
});

test('paused chapter and endpoint seeking plus exit cancel retained action and timers', async ({ page }) => {
  await command(page,'play');await page.clock.runFor(320);await command(page,'pause');
  await page.evaluate(()=>pickleboard.plays.timelineAction('chapter',pickleboard.plays.chapters[1].shotId));const manual=await state(page);
  expect(manual.playing).toBe(false);
  await page.clock.runFor(2000);expect(await state(page)).toEqual(manual);
  await page.evaluate(()=>pickleboard.plays.timelineAction('seek',0));await command(page,'play');await page.clock.runFor(160);await command(page,'pause');
  await page.evaluate(()=>pickleboard.plays.timelineAction('seek',0));expect((await state(page)).elapsed).toBe(0);
  await command(page,'play');await page.clock.runFor(160);await command(page,'pause');await page.evaluate(()=>pickleboard.plays.timelineAction('seek',0));
  const restarted=await state(page);await page.clock.runFor(2000);expect(await state(page)).toEqual(restarted);
  await command(page,'play');await page.clock.runFor(160);await command(page,'exit');
  const exited=await state(page);await page.clock.runFor(2000);expect(await state(page)).toEqual(exited);
});
