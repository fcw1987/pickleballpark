import { test, expect } from './helpers/offline-app.mjs';

const frames = (page, count = 4) => page.evaluate(count => new Promise(resolve => {
  const tick = () => --count ? requestAnimationFrame(tick) : resolve();
  requestAnimationFrame(tick);
}), count);
const ready = page => page.waitForFunction(() => window.playBuilder && !playBuilder.busy && playBuilder.view === '3d' && pickleboard.threeD.worldAssetsReady && pickleboard.threeD.renderer.info.render.calls > 0);
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };

test('cold and reload startup reveal complete 3D without a 2D flash or hidden replay downloads', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage(), held = gate(), requested = gate(), replay = [];
  page.on('request', request => { if(request.url().includes('/assets/replay/')) replay.push(request.url()); });
  await page.addInitScript(() => {
    window.__exposed2D = 0;
    const sample = () => {
      const court = document.querySelector('.court-container-fullscreen');
      if (court && getComputedStyle(court).visibility !== 'hidden' && getComputedStyle(court).display !== 'none' && court.getBoundingClientRect().width) __exposed2D++;
      if (!window.playBuilder || playBuilder.busy) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.route('**/three-d-playback.js', async route => { requested.release(); await held.promise; await route.continue(); });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await requested.promise;
    await expect(page.locator('#courtStartupStatus')).toBeVisible();
    await expect(page.locator('.court-container-fullscreen')).toBeHidden();
    await frames(page);
    await expect(page.locator('.builder-court-tools')).toHaveCount(1);
    await expect(page.locator('.builder-court-tools')).toBeHidden();
    expect(await page.evaluate(() => __exposed2D)).toBe(0);
    held.release();
    await ready(page);
    await expect(page.locator('#courtStartupStatus')).toBeHidden();
    await expect(page.locator('#threeDCanvas canvas')).toBeVisible();
    await expect(page.locator('.builder-court-tools')).toBeVisible();
    await page.reload();
    await ready(page);
    expect(await page.evaluate(() => __exposed2D)).toBe(0);
    expect(replay).toEqual([]);
    expect(await page.evaluate(() => ({ loaded: pickleboard.plays.pixelActors.loaded, nodes: pickleboard.plays.pixelActors.nodes.size }))).toEqual({ loaded: false, nodes: 0 });
  } finally { held.release(); await context.close(); }
});

for (const interruption of ['2D cancellation', 'context loss']) test(`held foliage: ${interruption} disposes the pending scene before a successful retry`, async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage(), held = gate(), requested = gate();
  await page.route('**/assets/reference-depth/park-tree-v1.png', async route => { requested.release(); await held.promise; await route.continue(); });
  try {
    await page.goto('/', {waitUntil:'domcontentloaded'});
    await requested.promise;
    await page.waitForFunction(()=>window.playBuilder?.busy && pickleboard.threeD.scene);
    await expect(page.locator('#courtStartupStatus')).toBeVisible();
    expect(await page.evaluate(() => playBuilder.busy)).toBe(true);
    const source = await page.evaluate(() => JSON.stringify(playBuilder.document));
    if (interruption === '2D cancellation') await page.evaluate(() => playBuilder.switchView('2d'));
    else {
      await page.evaluate(() => new Promise(resolve => {
        const renderer = pickleboard.threeD.renderer;
        renderer.domElement.addEventListener('webglcontextlost', resolve, { once: true });
        renderer.getContext().getExtension('WEBGL_lose_context').loseContext();
      }));
      await page.waitForFunction(() => !playBuilder.busy);
    }
    await expect(page.locator('.pixel-court-canvas')).toBeVisible();
    await expect(page.locator('#threeDCanvas canvas')).toHaveCount(0);
    const response = page.waitForResponse('**/assets/reference-depth/park-tree-v1.png');
    held.release(); await response; await frames(page);
    expect(await page.evaluate(() => ({view:playBuilder.view,busy:playBuilder.busy,scene:Boolean(pickleboard.threeD.scene),source:JSON.stringify(playBuilder.document)}))).toEqual({view:'2d',busy:false,scene:false,source});
    await page.evaluate(() => playBuilder.switchView('3d'));
    await ready(page);
    await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  } finally { held.release(); await context.close(); }
});

for (const asset of ['assets/reference-athletes/athletes-armless-v2.png', 'assets/reference-depth/park-tree-v1.png']) {
  test(`failure of ${asset} reveals editable 2D and preserves the draft`, async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers:'block' });
    const page = await context.newPage();
    await page.route(`**/${asset}`,route=>route.abort());
    try {
      await page.goto('/');
      await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy);
      await expect(page.locator('#courtStartupStatus')).toBeHidden();
      await expect(page.locator('.pixel-court-canvas')).toBeVisible();
      await expect(page.locator('#threeDCanvas canvas')).toHaveCount(0);
      expect(await page.evaluate(()=>({view:playBuilder.view,valid:playBuilder.compiled.validShotCount,shots:playBuilder.document.shots.length,scene:Boolean(pickleboard.threeD.scene)}))).toEqual({view:'2d',valid:3,shots:3,scene:false});
      await page.evaluate(()=>playBuilder.action('editShot',{field:'target.x',value:6.25}));
      const source=await page.evaluate(()=>JSON.stringify(playBuilder.document));
      await page.unroute(`**/${asset}`);
      await page.evaluate(()=>playBuilder.switchView('3d'));
      await ready(page);
      expect(await page.evaluate(()=>JSON.stringify(playBuilder.document))).toBe(source);
    } finally { await context.close(); }
  });
}

test('2D scheduling stops while 3D or the document is hidden and resumes when needed',async({page})=>{
  await page.goto('/'); await ready(page); await frames(page);
  await page.evaluate(()=>{const r=pickleboard.pixelRenderer;window.__hidden2DCalls=0;const render=r.render;r.render=function(...args){__hidden2DCalls++;return render.apply(this,args);};});
  await frames(page,20);
  expect(await page.evaluate(()=>({calls:__hidden2DCalls,frame:pickleboard.pixelRenderer.frame}))).toEqual({calls:0,frame:null});
  await page.evaluate(()=>playBuilder.switchView('2d')); await frames(page);
  expect(await page.evaluate(()=>__hidden2DCalls)).toBeGreaterThan(0);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  expect(await page.evaluate(()=>pickleboard.pixelRenderer.frame)).toBeNull();
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));}); await frames(page);
  expect(await page.evaluate(()=>pickleboard.pixelRenderer.frame)).not.toBeNull();
  await page.evaluate(()=>{pickleboard.pixelRenderer.dispose();document.body.classList.add('three-d-active');document.body.classList.remove('three-d-active');}); await frames(page);
  expect(await page.evaluate(()=>pickleboard.pixelRenderer.frame)).toBeNull();
});

test('fresh offline installation retains both visible modes without precaching unused replay art',async({browser,offlineApp})=>{
  const context=await browser.newContext({serviceWorkers:'allow'}),page=await context.newPage();
  try {
    await page.goto(offlineApp.url); await ready(page);
    await page.waitForFunction(()=>navigator.serviceWorker.controller);
    const replay=await page.evaluate(async()=>{const keys=await caches.keys(),requests=(await Promise.all(keys.map(async key=>(await caches.open(key)).keys()))).flat();return requests.filter(r=>new URL(r.url).pathname.includes('/assets/replay/')).map(r=>r.url);});
    expect(replay).toEqual([]);
    await offlineApp.stop(); await page.reload(); await ready(page);
    await page.evaluate(()=>playBuilder.switchView('2d'));
    await expect(page.locator('.pixel-court-canvas')).toBeVisible();
    await page.waitForFunction(()=>pickleboard.pixelRenderer.diagnostics?.actors.player1);
    await page.evaluate(()=>playBuilder.switchView('3d')); await ready(page);
    await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  } finally { await context.close(); }
});
