import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const output = process.argv[2];
if (!output) throw new Error('Usage: node tools/record-pixel-authoring.mjs <output-directory> [preview-url]');
const url = process.argv[3] || process.env.PREVIEW_URL || 'http://127.0.0.1:4173/';
const viewport = { width: 402, height: 874 };
const videoName = 'phone-authoring.webm';
const screenshotName = 'phone-authoring-final.png';
const eventsName = 'phone-authoring-events.json';
await mkdir(output, { recursive: true });
const rawVideo = await mkdtemp(join(tmpdir(), 'pickleboard-phone-authoring-'));

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 3,
  hasTouch: true,
  recordVideo: { dir: rawVideo, size: viewport }
});
const page = await context.newPage();
const started = Date.now();
const events = [];
const mark = async (name, details = {}) => {
  const state = await page.evaluate(() => ({
    view: playBuilder.view,
    playing: playBuilder.session.playing,
    time: Number(playBuilder.session.clock.elapsed.toFixed(3)),
    shot: playBuilder.document.shots.indexOf(playBuilder.selectedShot) + 1,
    shots: playBuilder.document.shots.length
  }));
  events.push({ atMs: Date.now() - started, name, ...details, state });
};
const hold = (milliseconds = 650) => page.waitForTimeout(milliseconds);
const touch = async locator => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Cannot touch a hidden authoring control');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
};
const mainMenu = async () => {
  const menu = page.locator('.builder-main-menu');
  if (!(await menu.evaluate(node => node.open))) await menu.locator('summary').click();
};
const openEditor = async () => {
  const inspector = page.locator('.builder-inspector');
  if (await inspector.evaluate(node => node.classList.contains('builder-inspector-collapsed'))) {
    await page.locator('.builder-context-actions [data-action="collapse-inspector"]').click();
  }
};
const openDetails = async () => {
  const summary = page.getByText('Details · coordinates, contact, movement', { exact: true });
  if (!(await summary.locator('..').evaluate(node => node.open))) await summary.click();
};
const editChapter = async number => {
  const summary = page.getByLabel('Choose shot chapter');
  if (!(await summary.locator('..').evaluate(node => node.open))) await summary.click();
  await page.getByRole('button', { name: `Edit Shot ${number}`, exact: true }).click();
  await openEditor();
};

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.removeItem('pickleballpark-builder-v1'));
  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  if (await page.evaluate(() => playBuilder.view !== '2d')) {
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await page.waitForFunction(() => playBuilder.view === '2d' && !playBuilder.busy);
  }
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await mark('fresh synthetic draft opens paused');
  await hold();

  await openEditor();
  await page.getByRole('button', { name: 'Place target on court' }).click();
  const serveTarget = await page.evaluate(() => playBuilder.courtTools.project({ x: 4.25, y: 38.25 }));
  await page.touchscreen.tap(Math.round(serveTarget.x), Math.round(serveTarget.y));
  await mark('serve target placed directly', { target: { x: 4.25, y: 38.25 } });
  await hold();

  await editChapter(2);
  await openDetails();
  await page.getByLabel('Target depth', { exact: true }).fill('6.8');
  await page.getByLabel('Target depth', { exact: true }).press('Tab');
  await mark('return target adjusted exactly', { depth: 6.8 });
  await hold();

  await editChapter(3);
  await page.getByLabel('Flight', { exact: true }).selectOption('high/soft');
  await mark('third shot selected and flight changed', { flight: 'high/soft' });
  await hold();
  await page.getByRole('button', { name: 'Add shot', exact: true }).click();
  await expect.poll(() => page.evaluate(() => playBuilder.document.shots.length)).toBe(4);
  await mark('response appended');
  await hold();

  await editChapter(3);
  await openDetails();
  await page.getByLabel('Moving player').selectOption('player2');
  await page.getByLabel('Movement intent').selectOption('manual');
  await page.getByLabel('Manual X').fill('7.4');
  await page.getByLabel('Manual X').press('Tab');
  await page.getByLabel('Manual Y').fill('13.2');
  await page.getByLabel('Manual Y').press('Tab');
  await page.getByRole('checkbox', { name: 'Pin movement target' }).check({ force: true, noWaitAfter: true });
  await expect.poll(() => page.evaluate(() => playBuilder.selectedShot.playerMovement?.player2?.pinned)).toBe(true);
  await mark('partner destination pinned in details', { player: 'Green 2', target: { x: 7.4, y: 13.2 } });
  await hold();

  const coachTools = page.getByText('Coach tools', { exact: true });
  if (!(await coachTools.locator('..').evaluate(node => node.open))) await coachTools.click();
  await touch(page.getByRole('checkbox', { name: 'Coverage Guides', exact: true }));
  await expect.poll(() => page.evaluate(() => playBuilder.document.assistance)).toMatchObject({ autoShading: false, showGuides: true });
  await mark('coverage guides enabled independently');
  await openEditor();
  if (!(await coachTools.locator('..').evaluate(node => node.open))) await coachTools.click();
  await touch(page.getByRole('checkbox', { name: 'Auto Shading', exact: true }));
  await expect.poll(() => page.evaluate(() => playBuilder.document.assistance)).toMatchObject({ autoShading: true, showGuides: true });
  await mark('auto shading enabled without changing guides');
  await hold();

  const beforeUndo = await page.evaluate(() => JSON.stringify(playBuilder.document.assistance));
  const playbackOptions = page.locator('.builder-context-menu').filter({ has: page.getByText('Playback options', { exact: true }) });
  if (!(await playbackOptions.evaluate(node => node.open))) await playbackOptions.locator('summary').click();
  await page.getByRole('button', { name: 'Undo authored edit' }).click();
  await mark('undo');
  if (!(await playbackOptions.evaluate(node => node.open))) await playbackOptions.locator('summary').click();
  await page.getByRole('button', { name: 'Redo authored edit' }).click();
  expect(await page.evaluate(() => JSON.stringify(playBuilder.document.assistance))).toBe(beforeUndo);
  await mark('redo');
  await hold();

  await mainMenu();
  await page.getByLabel('Play title').fill('Pixel park walkthrough');
  await page.getByLabel('Play title').press('Tab');
  await mainMenu();
  await page.getByRole('button', { name: 'Save As', exact: true }).click();
  await mark('named copy saved');
  await hold();

  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  expect(await page.evaluate(() => playBuilder.session.playing)).toBe(false);
  expect(await page.evaluate(() => playBuilder.document.title)).toContain('Pixel park walkthrough');
  await mark('saved draft reloaded paused');
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.waitForFunction(() => playBuilder.view === '2d' && !playBuilder.busy);
  await mark('continued saved work in 2D');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => playBuilder.session.clock.elapsed)).toBeGreaterThan(.2);
  await mark('play started from current position');
  await hold(1000);

  const beforeView = await page.evaluate(() => playBuilder.session.clock.elapsed);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.waitForFunction(() => playBuilder.view === '3d' && !playBuilder.busy);
  expect(await page.evaluate(() => playBuilder.session.playing)).toBe(true);
  await mark('switched to 3D with playback intent preserved');
  await hold(700);
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.waitForFunction(() => playBuilder.view === '2d' && !playBuilder.busy);
  expect(await page.evaluate(() => playBuilder.session.clock.elapsed)).toBeGreaterThan(beforeView);
  await mark('returned to 2D and continued');
  await hold(700);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await mark('paused after continuing saved work');
  await page.screenshot({ path: join(output, screenshotName), animations: 'disabled' });

  const video = page.video();
  await context.close();
  await video.saveAs(join(output, videoName));
  await writeFile(join(output, eventsName), `${JSON.stringify({
    fixture: 'synthetic four-shot authored rally',
    viewport,
    deviceScaleFactor: 3,
    browser: 'Playwright Chromium phone emulation',
    physicalDevice: false,
    url,
    video: videoName,
    screenshot: screenshotName,
    events
  }, null, 2)}\n`);
  console.log(JSON.stringify({ output: basename(output), video: videoName, events: events.length }));
} finally {
  if (!page.isClosed()) await context.close().catch(() => {});
  await browser.close();
  await rm(rawVideo, { recursive: true, force: true });
}
