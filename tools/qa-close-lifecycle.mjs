// Isolate browser lifecycle commits from Playwright's page.close semantics.
import { chromium, webkit } from '@playwright/test';

const baseURL = process.argv[2] || 'http://127.0.0.1:4198/';
const trials = Number(process.env.QA_CLOSE_TRIALS || 5);

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const minimalHTML = lifecycle => `<!doctype html><meta charset="utf-8">
<label>Title <input aria-label="Title"></label>
<script>
  const input = document.querySelector('input');
  input.value = localStorage.getItem('minimal-title') || 'Starter';
  input.addEventListener('change', () => localStorage.setItem('minimal-title', input.value));
  const finish = () => input.blur();
  ${lifecycle === 'pagehide-blur' ? "addEventListener('pagehide', finish);" : ''}
  ${lifecycle === 'beforeunload-noop-pagehide-blur' ? "addEventListener('beforeunload', () => {}); addEventListener('pagehide', finish);" : ''}
  ${lifecycle === 'beforeunload-blur' ? "addEventListener('beforeunload', finish);" : ''}
  ${lifecycle === 'visibility-blur' ? "document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });" : ''}
  ${lifecycle === 'pagehide-direct' ? "addEventListener('pagehide', () => localStorage.setItem('minimal-title', input.value));" : ''}
</script>`;

async function installMinimalRoute(context) {
  await context.route('**/__qa-close-minimal**', async route => {
    const lifecycle = new URL(route.request().url()).searchParams.get('lifecycle');
    await route.fulfill({ status: 200, contentType: 'text/html', body: minimalHTML(lifecycle) });
  });
}

async function minimalTrial(engine, lifecycle, closeMode, trial) {
  const context = await engine.newContext();
  await installMinimalRoute(context);
  const page = await context.newPage();
  const url = new URL(`/__qa-close-minimal?lifecycle=${lifecycle}&trial=${trial}`, baseURL).href;
  await page.goto(url);
  await page.evaluate(() => localStorage.removeItem('minimal-title'));
  await page.reload();
  await page.getByLabel('Title').fill(`Final ${trial}`);
  if (closeMode === 'blur-run-beforeunload') await page.getByLabel('Title').blur();
  const before = Date.now();
  await page.close({ runBeforeUnload: closeMode !== 'default' });
  const closeReturnMs = Date.now() - before;
  const closedAtReturn = page.isClosed();
  if (closeMode === 'run-beforeunload-delay') await sleep(250);
  const closedBeforeReopen = page.isClosed();
  const reopened = await context.newPage();
  await reopened.goto(url);
  const stored = await reopened.evaluate(() => localStorage.getItem('minimal-title'));
  const openPages = context.pages().length;
  await context.close();
  return { lifecycle, closeMode, trial, stored, passed: stored === `Final ${trial}`, closedAtReturn, closedBeforeReopen, closeReturnMs, openPages };
}

async function appTrial(engine, closeMode, trial) {
  const context = await engine.newContext();
  const page = await context.newPage();
  const url = new URL(`/?qa-close-app=${closeMode}-${trial}`, baseURL).href;
  await page.goto(url);
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.evaluate(() => localStorage.removeItem('pickleballpark-builder-v1'));
  await page.reload();
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  await page.locator('.builder-main-menu > summary').click();
  await page.getByLabel('Play title').fill(`App final ${trial}`);
  if (closeMode === 'blur-run-beforeunload') await page.getByLabel('Play title').blur();
  const before = Date.now();
  await page.close({ runBeforeUnload: closeMode !== 'default' });
  const closeReturnMs = Date.now() - before;
  const closedAtReturn = page.isClosed();
  if (closeMode === 'run-beforeunload-delay') await sleep(250);
  const closedBeforeReopen = page.isClosed();
  const reopened = await context.newPage();
  await reopened.goto(url);
  await reopened.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  const title = await reopened.evaluate(() => playBuilder.document.title);
  const openPages = context.pages().length;
  await context.close();
  return { lifecycle: 'application', closeMode, trial, stored: title, passed: title === `App final ${trial}`, closedAtReturn, closedBeforeReopen, closeReturnMs, openPages };
}

const matrix = [
  ['none', 'default'],
  ['pagehide-blur', 'default'],
  ['pagehide-direct', 'default'],
  ['pagehide-blur', 'run-beforeunload'],
  ['pagehide-blur', 'run-beforeunload-delay'],
  ['beforeunload-noop-pagehide-blur', 'run-beforeunload'],
  ['beforeunload-blur', 'run-beforeunload'],
  ['visibility-blur', 'run-beforeunload'],
  ['pagehide-direct', 'run-beforeunload'],
  ['none', 'blur-run-beforeunload']
];
const results = [];
for (const [engineName, browserType] of Object.entries({ chromium, webkit })) {
  const browser = await browserType.launch();
  for (const [lifecycle, closeMode] of matrix) {
    for (let trial = 1; trial <= trials; trial++) results.push({ engine: engineName, ...(await minimalTrial(browser, lifecycle, closeMode, trial)) });
  }
  for (const closeMode of ['default', 'run-beforeunload', 'run-beforeunload-delay', 'blur-run-beforeunload']) {
    for (let trial = 1; trial <= trials; trial++) results.push({ engine: engineName, ...(await appTrial(browser, closeMode, trial)) });
  }
  await browser.close();
}

const grouped = Object.values(results.reduce((groups, result) => {
  const key = `${result.engine}/${result.lifecycle}/${result.closeMode}`;
  const group = groups[key] ||= { engine: result.engine, lifecycle: result.lifecycle, closeMode: result.closeMode, passed: 0, trials: 0, closedAtReturn: 0, closedBeforeReopen: 0, closeReturnMs: [] , openPages: [] };
  group.passed += Number(result.passed);
  group.trials += 1;
  group.closedAtReturn += Number(result.closedAtReturn);
  group.closedBeforeReopen += Number(result.closedBeforeReopen);
  group.closeReturnMs.push(result.closeReturnMs);
  group.openPages.push(result.openPages);
  return groups;
}, {})).map(group => ({
  ...group,
  closeReturnMs: { min: Math.min(...group.closeReturnMs), max: Math.max(...group.closeReturnMs) },
  openPages: [...new Set(group.openPages)]
}));
console.log(JSON.stringify({ baseURL, trials, grouped }, null, 2));
