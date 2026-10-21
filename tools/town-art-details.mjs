// Isolated visual QA: labelled detail views supplement, never replace, the normal UI captures.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { runtimeFileset } from './stamp-build.mjs';

const out = process.env.CAPTURE_DIR || 'docs/town-art/details';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, serviceWorkers: 'block' });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`${base}/?workspace=planner`);
await page.waitForFunction(() => window.pickleboard?.plays);
await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
await page.locator('#play3dView').click();
await page.waitForFunction(() => pickleboard.threeD?.active);
const actors = await page.evaluate(() => [...pickleboard.threeD.playerObjects.keys()]);
const detailStyle = await page.addStyleTag({ content: '.three-d-hud { display: none !important; }' });
for (const id of actors) {
  await page.evaluate(id => {
    const v = pickleboard.threeD, actor = v.playerObjects.get(id);
    v.cancelRenderWork(); v.session.seek(0); v.applyAtTime(0);
    const yaw = actor.userData.visual.rotation.y, x = .7, z = 3.8;
    v.camera.clearViewOffset(); v.camera.aspect = innerWidth / innerHeight; v.camera.fov = 38;
    v.camera.position.set(actor.position.x + x*Math.cos(yaw)+z*Math.sin(yaw), 1.75, actor.position.z-x*Math.sin(yaw)+z*Math.cos(yaw));
    v.camera.lookAt(actor.position.x, .95, actor.position.z);
    v.camera.updateProjectionMatrix(); v.camera.updateMatrixWorld(true);
    v.updateBallReadability();
    v.renderer.render(v.scene,v.camera);
  }, id);
  await page.screenshot({ path: `${out}/athlete-${id}.png` });
}
await detailStyle.evaluate(element => element.remove());
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => pickleboard.threeD.setCamera('sideline'));
for (const [name, offset] of [['prepare', -.16], ['contact', 0], ['follow', .16], ['recover', .32]]) {
  await page.evaluate(offset => {
    const v=pickleboard.threeD, segment=v.timeline.segments.find(s=>s.shotSemantics?.stroke==='drop');
    const time=segment.startTime+segment.contactTime+offset;
    v.cancelRenderWork(); v.session.seek(time); v.applyAtTime(time); v.updateUI(); v.renderer.render(v.scene,v.camera);
  }, offset);
  await page.screenshot({ path: `${out}/drop-${name}.png` });
}
const lights = [
  {name:'current', sky:'#fff5df', ground:'#637d76', hemi:1.2, ambient:.32, key:'#fff2d9', power:1.9},
  {name:'daylight', sky:'#e5f5ff', ground:'#91aa89', hemi:1.65, ambient:.42, key:'#fff3dd', power:1.65},
  {name:'soft-sun', sky:'#e8f3ff', ground:'#94a888', hemi:1.85, ambient:.42, key:'#fff6e9', power:1.45}
];
for (const light of lights) {
  await page.evaluate(light => {
    const v=pickleboard.threeD;
    for(const o of v.scene.children) {
      if(o.isHemisphereLight){o.color.set(light.sky);o.groundColor.set(light.ground);o.intensity=light.hemi;}
      if(o.isAmbientLight)o.intensity=light.ambient;
      if(o.isDirectionalLight){o.color.set(light.key);o.intensity=light.power;}
    }
    v.session.seek(0);v.applyAtTime(0);v.renderer.render(v.scene,v.camera);
  },light);
  await page.screenshot({path:`${out}/light-${light.name}.png`});
}
await writeFile(`${out}/detail-provenance.json`,JSON.stringify({base,runtimeDigest:runtimeFileset().digest,actors,detailCamera:'38 degree perspective, each athlete front 3/4, 1.75m eye',lights,errors},null,2));
await browser.close();
console.log(JSON.stringify({out,actors,errors}));
