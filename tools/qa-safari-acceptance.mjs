import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium, webkit } from '@playwright/test';

const url = process.env.PREVIEW_URL || 'http://127.0.0.1:4186/index.html';
const engines = { chromium, webkit };

const settle = page => page.evaluate(() => new Promise(resolve => {
  let remaining = 4;
  const next = () => --remaining ? requestAnimationFrame(next) : resolve();
  requestAnimationFrame(next);
}));

async function state(page, label) {
  const canvas = page.locator('#threeDCanvas canvas');
  const png = await canvas.screenshot({ animations: 'disabled' });
  const runtime = await page.evaluate(() => {
    const viewer = pickleboard.threeD;
    const node = viewer.renderer.domElement;
    const rect = node.getBoundingClientRect();
    return {
      active: viewer.active,
      lost: viewer.renderer.getContext().isContextLost(),
      canvases: document.querySelectorAll('#threeDCanvas canvas').length,
      css: [rect.width, rect.height],
      buffer: [node.width, node.height],
      frame: viewer.renderer.info.render.frame,
      pending: viewer.renderLoopId !== null,
      bodyOverflow: document.body.style.overflow,
      hidden: document.hidden
    };
  });
  assert.equal(runtime.active, true, `${label}: viewer inactive`);
  assert.equal(runtime.lost, false, `${label}: context lost`);
  assert.equal(runtime.canvases, 1, `${label}: canvas count`);
  assert.ok(runtime.css.every(value => value > 1), `${label}: collapsed CSS canvas`);
  assert.ok(runtime.buffer.every(value => value > 1), `${label}: collapsed drawing buffer`);
  assert.ok(png.length > 10_000, `${label}: implausibly simple/blank canvas capture (${png.length} bytes)`);
  return { label, ...runtime, pngBytes: png.length, hash: createHash('sha256').update(png).digest('hex').slice(0, 12) };
}

async function run(name) {
  const browser = await engines[name].launch();
  const context = await browser.newContext({ viewport: { width: 844, height: 600 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy && playBuilder.view === '3d' && pickleboard.threeD?.renderer);
  await page.evaluate(() => playBuilder.pause());
  await settle(page);

  const samples = [await state(page, 'initial')];
  const viewports = [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1024, height: 768 },
    { width: 430, height: 932 },
    { width: 844, height: 600 }
  ];
  for (let index = 0; index < 12; index += 1) {
    await page.setViewportSize(viewports[index % viewports.length]);
    await settle(page);
    if (index % 2) {
      await page.evaluate(() => playBuilder.play());
      await settle(page);
    }
    await page.locator('.builder-main-menu > summary').click();
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await page.getByRole('button', { name: 'Close help and information' }).click();
    await settle(page);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '', `help-${index}: body overflow retained`);
    samples.push(await state(page, `help-${index}`));
    await page.evaluate(value => playBuilder.seek(value * playBuilder.session.duration), (index % 10) / 10);
    if (index % 3 === 2) {
      await page.evaluate(() => playBuilder.switchView('2d'));
      await page.evaluate(() => playBuilder.switchView('3d'));
      await settle(page);
      samples.push(await state(page, `reentry-${index}`));
    }
  }

  const other = await context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  await page.waitForTimeout(100);
  const hiddenWhileBackgrounded = await page.evaluate(() => document.hidden);
  await page.bringToFront();
  await other.close();
  await settle(page);
  samples.push(await state(page, 'background-return'));
  await page.evaluate(() => playBuilder.pause());
  await settle(page);
  const final = await state(page, 'final');
  assert.equal(final.pending, false, 'paused scheduler did not settle');
  assert.deepEqual(errors, []);
  await context.close();
  await browser.close();
  return { browser: name, hiddenWhileBackgrounded, samples, errors };
}

const results = [];
for (const name of Object.keys(engines)) results.push(await run(name));
console.log(JSON.stringify({ url, results }, null, 2));
