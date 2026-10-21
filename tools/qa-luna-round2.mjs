import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const baseURL = process.env.PARK_URL ?? 'http://127.0.0.1:4195';
const evidenceDir = process.env.LUNA_EVIDENCE_DIR ?? '/private/tmp/park-beta-luna-round2-evidence';
fs.mkdirSync(evidenceDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shot = async (page, name) => page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: true });
const bodyText = async (page) => page.locator('body').innerText();

const result = {
  url: baseURL,
  authored: {},
  persistence: {},
  playback: {},
  views: {},
  responsive: [],
  issues: [],
  evidenceDir,
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  hasTouch: true,
  recordVideo: { dir: evidenceDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await shot(page, '01-initial-1280');

  // The rendered + Add control is in the top bar at the desktop viewport.
  await page.mouse.click(1140, 35);
  await page.waitForTimeout(150);
  const selects = page.locator('select');
  if (!(await selects.nth(3).locator('option').filter({ hasText: 'Volley / block' }).count())) {
    throw new Error('Shot family selector was not exposed after Add shot');
  }
  await selects.nth(3).selectOption('volley');

  await page.getByText('Details · coordinates, contact, movement', { exact: true }).click({ force: true });
  const expandedSelects = page.locator('select');
  await expandedSelects.nth(4).selectOption('player3'); // Orange 1 hitter
  await expandedSelects.nth(8).selectOption('player2'); // Green 2 receiver
  await expandedSelects.nth(9).selectOption('short-hop');
  await expandedSelects.nth(10).selectOption('player4'); // Orange 2 partner movement
  await expandedSelects.nth(11).selectOption('advance');

  const width = page.locator('input[aria-label="Target width"]');
  const depth = page.locator('input[aria-label="Target depth"]');
  await width.fill('12');
  await page.keyboard.press('Enter');
  await depth.fill('5');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'centerline', exact: true }).click({ force: true });

  // Coach controls and a manual movement pin are visible in the expanded editor.
  await page.getByText('Coach tools', { exact: true }).click({ force: true });
  await page.getByLabel('Auto Shading').check({ force: true });
  await page.getByLabel('Coverage Guides').check({ force: true });
  const pinLabel = page.locator('label').filter({ hasText: 'Pin movement target' });
  if (await pinLabel.count()) {
    const pin = pinLabel.locator('input[type="checkbox"]');
    if (await pin.count()) await pin.check({ force: true });
  }

  // Rally detail handedness controls are reachable from the visible disclosure.
  const rallyDetails = page.getByText('Rally details', { exact: true });
  if (await rallyDetails.count()) {
    await rallyDetails.click({ force: true });
    const handednessDisclosure = page.getByText('Player handedness', { exact: true });
    if (await handednessDisclosure.count()) await handednessDisclosure.click({ force: true });
    const handedness = page.locator('select[data-action="handedness"]:visible');
    const handednessCount = await handedness.count();
    for (let i = 0; i < handednessCount; i += 1) {
      await handedness.nth(i).selectOption(i % 2 ? 'left' : 'right');
    }
  }

  const configuredText = await bodyText(page);
  result.authored = {
    hasVolleyBlock: configuredText.includes('Volley / block'),
    hasPartnerAdvance: configuredText.includes('Movement intent') && configuredText.includes('Advance'),
    targetSummary: configuredText.includes('centerline'),
    receiverSummary: configuredText.includes('Green 2'),
    numericValues: { width: await width.inputValue(), depth: await depth.inputValue() },
    autoShading: await page.getByLabel('Auto Shading').isChecked(),
    coverageGuides: await page.getByLabel('Coverage Guides').isChecked(),
    pinControlFound: (await pinLabel.count()) > 0,
  };
  await shot(page, '02-authored-shot4-block');

  // Save As is a visible menu action. It immediately creates a device-saved copy.
  await page.mouse.click(40, 35);
  await page.waitForTimeout(100);
  await page.mouse.click(160, 370);
  await page.waitForTimeout(300);
  let savedText = await bodyText(page);
  result.persistence.savedTitle = savedText.split('\n').find((line) => line.includes('copy')) ?? null;
  await page.mouse.click(40, 35);
  await page.waitForTimeout(100);
  const menuAfterSave = await bodyText(page);
  result.persistence.saveStatusVisible = menuAfterSave.includes('Saved on this device');
  await page.mouse.click(40, 35);
  await page.waitForTimeout(100);
  await shot(page, '03-saved-copy');

  // Reopen the saved copy from My Plays, then reload the same context as a second reopen check.
  await page.mouse.click(40, 35);
  await page.waitForTimeout(100);
  await page.mouse.click(160, 320);
  await page.waitForTimeout(200);
  const myPlaysText = await bodyText(page);
  result.persistence.myPlaysListsCopy = myPlaysText.includes('Starter Serve, Return & Third — copy');
  await shot(page, '04-my-plays');
  await page.mouse.click(640, 445);
  await page.waitForTimeout(300);
  const reopenedText = await bodyText(page);
  result.persistence.copyReopened = reopenedText.includes('Starter Serve, Return & Third — copy');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const reloadedText = await bodyText(page);
  result.persistence.copySurvivesReload = reloadedText.includes('Starter Serve, Return & Third — copy');
  const reloadedTimeline = page.locator('input[type="range"][aria-label="Rally timeline"]').first();
  result.persistence.reloadedTimelineMax = Number(await reloadedTimeline.getAttribute('max'));

  // Reopen shot 4 through the visible chapter chooser and verify its persisted fields.
  const chooser = page.locator('summary[aria-label="Choose shot chapter"]');
  await chooser.click();
  const shot4Chapter = page.locator('button[data-action="chapter"]').filter({ hasText: 'Shot 4' });
  if (await shot4Chapter.count()) await shot4Chapter.click();
  const editShot = page.getByRole('button', { name: 'Edit shot' });
  for (let i = 0; i < 3 && !(await page.getByText('Shot 4 details', { exact: true }).count()); i += 1) {
    await editShot.click();
    await page.waitForTimeout(120);
  }
  result.persistence.persistedShot4Numeric = {
    width: await page.locator('input[aria-label="Target width"]').inputValue(),
    depth: await page.locator('input[aria-label="Target depth"]').inputValue(),
  };
  await shot(page, '05-reopened-copy');

  // Play the entire authored clip and sample the timeline until it stops.
  await page.mouse.click(1245, 35); // visible 2D button
  await page.waitForTimeout(100);
  await page.mouse.click(50, 765); // visible Play button in the desktop playback strip
  const samples = [];
  const startedAt = Date.now();
  while (Date.now() - startedAt < 6500) {
    samples.push(Number(await reloadedTimeline.inputValue()));
    await sleep(200);
  }
  result.playback = {
    sampleCount: samples.length,
    min: Math.min(...samples),
    max: Math.max(...samples),
    final: Number(await reloadedTimeline.inputValue()),
    fullDurationObserved: Math.max(...samples) > 4,
  };
  await shot(page, '06-playback-complete');

  // Exercise 3D, the camera choices, then return to 2D.
  await page.mouse.click(1200, 35);
  await page.waitForTimeout(700);
  await page.locator('summary[aria-label="Playback options"]').click();
  await page.waitForTimeout(100);
  const camera = page.locator('select[aria-label="Camera"]');
  result.views.threeDClass = await page.evaluate(() => document.body.classList.contains('three-d-active'));
  result.views.cameraCount = await camera.count();
  result.views.cameraVisible = await camera.isVisible().catch(() => false);
  result.views.cameraPresets = [];
  if (await camera.count()) {
    for (const preset of ['overhead', 'sideline', 'behind-green', 'behind-orange']) {
      await camera.selectOption(preset);
      result.views.cameraPresets.push(await camera.inputValue());
    }
  }
  await shot(page, '07-3d-camera');
  await page.mouse.click(1245, 35);
  await page.waitForTimeout(300);
  result.views.twoDClassAfterReturn = await page.evaluate(() => !document.body.classList.contains('three-d-active'));
  await shot(page, '08-2d-return');

  // Responsive visible-layout sweep.
  for (const [widthPx, heightPx] of [[390, 844], [430, 932], [768, 1024], [1280, 800]]) {
    await page.setViewportSize({ width: widthPx, height: heightPx });
    await page.waitForTimeout(200);
    const metrics = await page.evaluate(() => ({
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyClass: document.body.className,
    }));
    result.responsive.push({ viewport: `${widthPx}x${heightPx}`, ...metrics, horizontalOverflow: metrics.scrollWidth > metrics.clientWidth + 1 });
    if (widthPx === 390) {
      const menu = page.locator('summary[aria-label="Menu"]');
      const box = await menu.boundingBox();
      const point = [box.x + box.width / 2, box.y + box.height / 2];
      result.responsiveMenu = {
        box,
        hitTag: await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName ?? null, point),
      };
      await page.touchscreen.tap(point[0], point[1]);
      await page.waitForTimeout(150);
      result.responsiveMenu.openedByMeasuredTouch = (await bodyText(page)).includes('Pickleball Park');
      await page.touchscreen.tap(point[0], point[1]);
    }
    await shot(page, `09-responsive-${widthPx}x${heightPx}`);
  }
} catch (error) {
  result.issues.push({ message: error.message, stack: error.stack });
  await shot(page, '99-error').catch(() => {});
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(evidenceDir, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
