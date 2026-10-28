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
    await expect(page.getByRole('button',{name:'Retry 3D',exact:true})).toHaveCount(0);
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
  await page.route('**/assets/reference-depth/park-tree-v1.webp', async route => { requested.release(); await held.promise; await route.continue(); });
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
    const response = page.waitForResponse('**/assets/reference-depth/park-tree-v1.webp');
    held.release(); await response; await frames(page);
    expect(await page.evaluate(() => ({view:playBuilder.view,busy:playBuilder.busy,scene:Boolean(pickleboard.threeD.scene),source:JSON.stringify(playBuilder.document)}))).toEqual({view:'2d',busy:false,scene:false,source});
    await page.evaluate(() => playBuilder.switchView('3d'));
    await ready(page);
    await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  } finally { held.release(); await context.close(); }
});

for (const asset of ['assets/reference-athletes/athletes-armless-v2.webp', 'assets/reference-depth/park-tree-v1.webp']) {
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

for (const module of ['play-builder.js','builder-ui.js']) for (const mode of ['rejected', 'hung']) test(`${mode} ${module} exposes usable 2D and late completion cannot take over`,async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),held=gate();
  await page.clock.install();
  await page.route(`**/${module}`,async route=>{if(mode==='rejected')await route.abort();else {await held.promise;await route.continue();}});
  try {
    await page.goto('/',{waitUntil:'commit'});
    await page.waitForFunction(()=>window.pickleboard?.plays&&window.pickleboard?.pixelRenderer);
    if(mode==='hung')await page.clock.fastForward(15001);
    await expect(page.getByRole('button',{name:'Continue in 2D',exact:true})).toBeVisible();
    await expect(page.locator('.pixel-court-canvas')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.hasAttribute('data-court-loading'))).toBe(false);
    await page.getByRole('button',{name:'Continue in 2D',exact:true}).click();
    await page.evaluate(()=>pickleboard.setTokenPosition('player1',7,8));
    expect(await page.evaluate(()=>({x:pickleboard.tokens.player1.x,y:pickleboard.tokens.player1.y}))).toEqual({x:7,y:8});
    held.release();await page.waitForLoadState('domcontentloaded');await frames(page);
    expect(await page.evaluate(()=>({builder:Boolean(window.playBuilder),active:pickleboard.threeD.active}))).toEqual({builder:false,active:false});
  }finally{held.release();await context.close();}
});

for(const mode of ['rejected','hung'])test(`${mode} graphics initialization falls back and permits a retry`,async({page})=>{
  await page.goto('/');await ready(page);
  await page.evaluate(()=>playBuilder.switchView('2d'));
  await page.clock.install();
  await page.evaluate(mode=>{window.__originalEnter=pickleboard.threeD.enter;pickleboard.threeD.enter=()=>mode==='rejected'?Promise.reject(new Error('test failure')):new Promise(resolve=>window.__lateGraphics=resolve);window.__viewPromise=playBuilder.switchView('3d');},mode);
  if(mode==='hung')await page.clock.fastForward(12001);
  await page.evaluate(()=>window.__viewPromise);
  await expect(page.locator('.pixel-court-canvas')).toBeVisible();
  expect(await page.evaluate(()=>({view:playBuilder.view,busy:playBuilder.busy}))).toEqual({view:'2d',busy:false});
  await expect(page.locator('.builder-message')).toContainText('Retry 3D');
  await page.evaluate(()=>{window.__lateGraphics?.(true);pickleboard.threeD.enter=window.__originalEnter;});
  expect(await page.evaluate(()=>playBuilder.view)).toBe('2d');
  await page.evaluate(()=>playBuilder.switchView('3d'));await ready(page);
});

for(const asset of ['three-d-playback.js','assets/reference-depth/park-tree-v1.webp','assets/reference-athletes/athletes-armless-v2.webp'])test(`startup deadline cancels held ${asset} before late completion`,async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),held=gate(),requested=gate();
  await page.clock.install();
  await page.route(`**/${asset}`,async route=>{requested.release();await held.promise;await route.continue();});
  try{
    await page.goto('/',{waitUntil:'domcontentloaded'});await requested.promise;
    const source=await page.evaluate(()=>JSON.stringify(playBuilder.document));
    await page.clock.fastForward(12001);
    await page.waitForFunction(()=>!playBuilder.busy);
    await expect(page.locator('.pixel-court-canvas')).toBeVisible();
    await expect(page.locator('#threeDCanvas canvas')).toHaveCount(0);
    held.release();await frames(page);
    expect(await page.evaluate(()=>({view:playBuilder.view,busy:playBuilder.busy,source:JSON.stringify(playBuilder.document),active:pickleboard.threeD.active}))).toEqual({view:'2d',busy:false,source,active:false});
    await page.evaluate(()=>{playBuilder.message='Continue editing in 2D.';playBuilder.render();playBuilder.render();});
    await page.unroute(`**/${asset}`);await page.getByRole('button',{name:'Retry 3D',exact:true}).click();await ready(page);
    await expect(page.getByRole('button',{name:'Retry 3D',exact:true})).toHaveCount(0);
  }finally{held.release();await context.close();}
});

for(const failure of ['rejected module','held module','constructor failure'])test(`core ${failure} offers reload recovery without promising a usable board`,async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),held=gate(),requested=gate(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install();
  await page.route('**/script.js',async route=>{
    requested.release();
    if(failure==='rejected module')return route.abort();
    if(failure==='held module'){await held.promise;return route.continue();}
    const response=await route.fetch(),source=await response.text();
    expect(source).toContain('constructor() {');
    await route.fulfill({response,body:source.replace('constructor() {',"constructor() { throw new Error('Injected core constructor failure');")});
  });
  try{
    await page.goto('/',{waitUntil:'commit'});await requested.promise;
    await page.waitForFunction(()=>window.courtStartup);
    if(failure==='held module')await page.clock.fastForward(15001);
    const recovery=page.locator('[data-court-recovery]');
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText('The court could not finish opening. Reload to try again.');
    await expect(recovery).not.toContainText('2D');
    await expect(page.getByRole('button',{name:'Reload court',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Continue in 2D',exact:true})).toHaveCount(0);
    expect(await page.evaluate(()=>({ready:courtStartup.coreReady,expired:courtStartup.expired,builder:Boolean(window.playBuilder)}))).toEqual({ready:false,expired:true,builder:false});
    if(failure==='held module'){
      held.release();await page.waitForLoadState('domcontentloaded');
      await page.waitForFunction(()=>courtStartup.coreReady&&pickleboard.pixelRenderer);
      await expect(page.getByRole('button',{name:'Continue in 2D',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Continue in 2D',exact:true}).click();
      await expect(page.locator('.pixel-court-canvas')).toBeVisible();
      const before=await page.evaluate(()=>pickleboard.tokens.player1.x);
      await page.getByRole('button',{name:/^Player 1,/}).press('ArrowRight');
      expect(await page.evaluate(()=>pickleboard.tokens.player1.x)).toBe(before+.5);
      await frames(page);
      expect(await page.evaluate(()=>({builder:Boolean(window.playBuilder),active:pickleboard.threeD.active}))).toEqual({builder:false,active:false});
    }
    expect(errors).toEqual([]);
  }finally{held.release();await context.close();}
});

for(const playing of [false,true])test(`a graphics deadline preserves ${playing?'playing':'paused'} intent and playhead with working 2D playback and editing`,async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),held=gate(),requested=gate();
  await page.clock.install();
  await page.route('**/assets/reference-depth/park-tree-v1.webp',async route=>{requested.release();await held.promise;await route.continue();});
  try{
    await page.goto('/',{waitUntil:'domcontentloaded'});await requested.promise;
    await page.clock.fastForward(12001);await page.waitForFunction(()=>!playBuilder.busy);
    await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
    await page.evaluate(()=>playBuilder.seek(.6));
    if(playing)await page.getByRole('button',{name:'Play',exact:true}).click();
    const source=await page.evaluate(()=>JSON.stringify(playBuilder.document));
    await page.getByRole('button',{name:'Retry 3D',exact:true}).click();
    await page.waitForFunction(()=>playBuilder.busy&&pickleboard.threeD.loading&&pickleboard.threeD.scene);
    const suspended=await page.evaluate(()=>({time:playBuilder.session.clock.elapsed,intent:playBuilder.session.playing}));
    expect(suspended.intent).toBe(playing);expect(suspended.time).toBeCloseTo(.6,2);
    await page.clock.fastForward(12001);await page.waitForFunction(()=>!playBuilder.busy);
    const fallback=await page.evaluate(()=>({view:playBuilder.view,time:playBuilder.session.clock.elapsed,intent:playBuilder.session.playing,clockPlaying:playBuilder.session.clock.playing,source:JSON.stringify(playBuilder.document)}));
    expect(fallback).toMatchObject({view:'2d',intent:playing,clockPlaying:playing,source});
    expect(fallback.time).toBeCloseTo(suspended.time,2);
    await expect(page.locator('.pixel-court-canvas')).toBeVisible();
    if(!playing)await page.getByRole('button',{name:'Play',exact:true}).click();
    await page.clock.fastForward(200);
    expect(await page.evaluate(()=>playBuilder.session.clock.elapsed)).toBeGreaterThan(fallback.time+.1);
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    const paused=await page.evaluate(()=>playBuilder.session.clock.elapsed);
    held.release();await page.clock.runFor(80);
    expect(await page.evaluate(()=>({view:playBuilder.view,time:playBuilder.session.clock.elapsed,intent:playBuilder.session.playing,source:JSON.stringify(playBuilder.document)}))).toEqual({view:'2d',time:paused,intent:false,source});
    await page.getByRole('button',{name:'Edit shot',exact:true}).click();
    const shotDetails=page.locator('.builder-shot-details');if(!await shotDetails.evaluate(node=>node.open))await shotDetails.locator(':scope > summary').click();
    await page.getByRole('tab',{name:'Precision',exact:true}).click();
    await page.getByLabel('Target width',{exact:true}).fill('6.2');await page.getByLabel('Target width',{exact:true}).press('Tab');
    expect(await page.evaluate(()=>playBuilder.selectedShot.target.x)).toBe(6.2);
    expect(await page.evaluate(()=>playBuilder.view)).toBe('2d');
  }finally{held.release();await context.close();}
});

for(const staleFailure of ['rejection','deadline'])test(`an obsolete view ${staleFailure} cannot cancel a newer pending graphics attempt`,async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),held=gate(),requested=gate();
  try{
    await page.goto('/');await ready(page);
    await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
    await page.evaluate(async()=>{
      await playBuilder.switchView('2d');pickleboard.threeD.exit();playBuilder.seek(.6);
      const viewer=pickleboard.threeD,enter=viewer.enter;let attempts=0;
      window.__loopsBeforeRetry=viewer.renderLoopCount;
      viewer.enter=function(){return ++attempts===1?new Promise((_,reject)=>window.__rejectOldView=reject):enter.call(this);};
      window.__oldViewAttempt=playBuilder.switchView('3d');
    });
    await page.waitForFunction(()=>playBuilder.busy&&window.__rejectOldView);
    const source=await page.evaluate(()=>JSON.stringify(playBuilder.document));
    await page.evaluate(()=>playBuilder.switchView('2d'));
    await page.clock.runFor(1000);
    // WebKit can reuse an already decoded image despite request interception.
    // Force this second scene to wait on a distinct real image response.
    await page.evaluate(async()=>{
      const {DefaultLoadingManager}=await import('/vendor/three.module.min.js');
      DefaultLoadingManager.setURLModifier(url=>url.endsWith('/park-tree-v1.webp')?`${url}?attempt-ownership=held`:url);
    });
    await page.route('**/assets/reference-depth/park-tree-v1.webp*',async route=>{requested.release();await held.promise;await route.continue();});
    await page.evaluate(()=>{window.__newViewAttempt=playBuilder.switchView('3d');});
    await requested.promise;await page.waitForFunction(()=>pickleboard.threeD.loading&&pickleboard.threeD.scene);
    const pending=await page.evaluate(()=>({generation:playBuilder.generation,loaderGeneration:pickleboard.threeD.loadGeneration}));
    if(staleFailure==='rejection')await page.evaluate(()=>window.__rejectOldView(new Error('Obsolete view failed')));
    else await page.clock.fastForward(11001);
    await page.evaluate(()=>window.__oldViewAttempt);
    expect(await page.evaluate(()=>({busy:playBuilder.busy,view:playBuilder.view,loading:pickleboard.threeD.loading,scene:Boolean(pickleboard.threeD.scene),generation:playBuilder.generation,loaderGeneration:pickleboard.threeD.loadGeneration,source:JSON.stringify(playBuilder.document),time:playBuilder.session.clock.elapsed}))).toEqual({busy:true,view:'2d',loading:true,scene:true,...pending,source,time:.6});
    held.release();await page.evaluate(()=>window.__newViewAttempt);await page.clock.runFor(80);await ready(page);
    await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
    expect(await page.evaluate(()=>({source:JSON.stringify(playBuilder.document),time:playBuilder.session.clock.elapsed,loops:pickleboard.threeD.renderLoopCount-window.__loopsBeforeRetry,active:pickleboard.threeD.active}))).toEqual({source,time:.6,loops:1,active:true});
  }finally{held.release();await context.close();}
});
