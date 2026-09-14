import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.PICKLEBALLPARK_TEST_URL || 'http://127.0.0.1:4197/';
const evidenceDir = process.env.EVIDENCE_DIR || '/private/tmp/park-beta-luna-round3/docs/qa/evidence/round3';
await fs.mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'light',
  reducedMotion: 'no-preference',
});
const page = await context.newPage();
const notes = [];
let shot = 0;

async function observe(label) {
  const name = `${String(++shot).padStart(2, '0')}-${label}`;
  await page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: true });
  const ax = await page.locator('body').ariaSnapshot();
  notes.push({ label, url: page.url(), aria: ax });
  console.log(`\n### ${label}\n${ax}`);
  return ax;
}

await page.goto(baseURL);
await observe('blind-initial');

// The first expectation is that Play starts the visible authored rally.
await page.getByRole('button', { name: /^Play$/ }).first().click();
await page.waitForTimeout(450);
await observe('play-rally');

// Return to authoring to see whether a shot can be edited without leaving the rally.
const edit = page.getByRole('button', { name: /Edit/ }).first();
if (await edit.count()) {
  await edit.click();
  await observe('edit-shot');
}

const details = page.getByText('Details · coordinates, contact, movement', { exact: true });
if (await details.count()) {
  await details.click();
  await observe('details-open');
}

const coach = page.getByText('Coach tools', { exact: true });
if (await coach.count()) {
  await coach.click();
  await observe('coach-tools-open');
}

// Probe the visible Menu, Help, and advanced movement affordances through text only.
const menu = page.getByRole('button', { name: /Menu/ }).first();
if (await menu.count()) {
  await menu.click();
  await observe('menu-open');
}

await fs.writeFile(path.join(evidenceDir, 'journey-log.json'), JSON.stringify(notes, null, 2));
await context.close();
await browser.close();

// A short normal-speed clip is retained as independent visual evidence.
const motionBrowser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
const motionContext = await motionBrowser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'light',
  reducedMotion: 'no-preference',
  recordVideo: { dir: evidenceDir, size: { width: 1440, height: 900 } },
});
const motionPage = await motionContext.newPage();
const motionVideo = motionPage.video();
await motionPage.goto(baseURL);
await motionPage.getByRole('button', { name: /^Play$/ }).first().click();
await motionPage.waitForTimeout(4200);
await motionPage.screenshot({ path: path.join(evidenceDir, 'motion-normal-end.png'), fullPage: true });
await motionContext.close();
const recordedPath = await motionVideo.path();
await fs.rename(recordedPath, path.join(evidenceDir, 'motion-normal.webm'));
await motionBrowser.close();
