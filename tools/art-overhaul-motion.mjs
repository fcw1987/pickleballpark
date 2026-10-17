import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runtimeFileset } from './stamp-build.mjs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = resolve(process.env.CAPTURE_DIR || 'docs/art-overhaul/final');
const baseUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:4173/index.html';
const plays = ['serve-and-return', 'third-shot-drop', 'third-shot-drive', 'fifth-shot-drop'];
const runtimeRoot = process.env.RUNTIME_ROOT || process.cwd();
const revision = execFileSync('git', ['-C', runtimeRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const runtimeDigest = runtimeFileset(runtimeRoot).digest;
const stampedSourceRevision = JSON.parse(readFileSync(join(runtimeRoot, 'version.json'), 'utf8')).sourceRevision;
await mkdir(out, { recursive: true });
const videoTemp = await mkdtemp(join(tmpdir(), 'pickleboard-motion-'));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  recordVideo: { dir: videoTemp, size: { width: 1280, height: 800 } }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`${baseUrl}?workspace=planner&all-plays-3d=1`);
await page.waitForFunction(() => Boolean(window.pickleboard?.threeD));
const report = [];

for (const id of plays) {
  await page.evaluate(playId => window.pickleboard.plays.load(playId), id);
  await page.locator('#play3dView').click();
  await page.waitForSelector('#threeDCanvas canvas');
  const viewer = await page.evaluate(() => {
    const v = window.pickleboard.threeD;
    return { duration: v.timeline.duration, contacts: v.timeline.segments
      .filter(segment => segment.step.shot && segment.trajectory)
      .map((segment, index) => ({ index: index + 1, shot: segment.step.shot.name || segment.step.shot.type || 'shot', time: segment.startTime + segment.contactTime })) };
  });
  for (const contact of viewer.contacts) {
    await page.evaluate(time => {
      const v = window.pickleboard.threeD;
      v.cancelRenderWork(); v.session.seek(time); v.applyAtTime(time); v.updateUI(); v.renderer.render(v.scene, v.camera);
    }, contact.time);
    await page.screenshot({ path: resolve(out, `${id}-contact-${String(contact.index).padStart(2, '0')}.png`) });
  }
  await page.evaluate(() => window.pickleboard.threeD.restart());
  await page.locator('#threeDPlayPause').click();
  await page.waitForTimeout(Math.ceil(viewer.duration * 1000) + 250);
  await page.locator('#threeDPlayPause').click();
  report.push({ id, ...viewer });
  await page.locator('#threeDExit').click();
}

const video = page.video();
await context.close();
await video.saveAs(resolve(out, 'four-play-motion.webm'));
await rm(videoTemp, { recursive: true, force: true });
await browser.close();
await writeFile(resolve(out, 'motion-report.json'), JSON.stringify({ baseUrl, viewport: [1280, 800], currentHead: revision, sourceRevision: revision, stampedSourceRevision, runtimeDigest, plays: report, errors }, null, 2) + '\n');
console.log(JSON.stringify({ out, plays: report.length, errors }, null, 2));
