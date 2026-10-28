// Legacy 3D compatibility coverage enters through the retained API; public UI defaults to pixel Canvas2D.
import {test,expect} from './helpers/offline-app.mjs';
import { installDimensionalAudit } from './helpers/dimensional-audit.mjs';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
async function open(page){await page.goto('/?workspace=planner');await page.waitForFunction(()=>window.pickleboard?.plays);await page.evaluate(()=>pickleboard.plays.load('third-shot-drop'));await page.evaluate(() => { void pickleboard.threeD.enter(); });await page.waitForFunction(()=>pickleboard.threeD.active);}

// Inspect the actual CanvasImageSource used by every live athlete, rather than
// requiring HTMLImageElement-only naturalWidth on generated partition canvases.
async function expectDecodedReferenceArtwork(page){
 await page.waitForFunction(()=>pickleboard.threeD.active&&pickleboard.threeD.renderer?.info.render.calls>0);
 const result=await page.evaluate(()=>{
  const v=pickleboard.threeD,countFrame=(image,rect)=>{const [x,y,w,h]=rect,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,x,y,w,h,0,0,w,h);const pixels=ctx.getImageData(0,0,w,h).data,bands=[0,0,0];for(let row=0;row<h;row++)for(let col=0;col<w;col++)if(pixels[(row*w+col)*4+3]>=21)bands[row<h*.45?0:row<h*.66?1:2]++;return bands;};
  return {renderCalls:v.renderer.info.render.calls,athletes:[...v.playerObjects.values()].map(actor=>{
   const d=actor.userData,assets=d.resources.assets,image=d.body.material.map.image,source=assets.sourceImage,rect=assets.metadata.frames[d.player][d.animation.frame].rect,validSize=image.width>0&&image.height>0&&image.width===source?.naturalWidth&&image.height===source?.naturalHeight,partitionCanvas=typeof image.getContext==='function';
   return {player:d.player,visible:actor.visible&&d.body.visible,reference:d.referenceAthlete,sourceLoaded:source instanceof HTMLImageElement&&source.complete&&source.naturalWidth>0&&source.naturalHeight>0&&new URL(source.currentSrc||source.src).pathname.endsWith('/assets/reference-athletes/athletes-armless-v2.png'),validSize,partitionCanvas,bodyBands:partitionCanvas?countFrame(image,rect):[0,0,0],sleeves:d.sleeves.map((mesh,side)=>({visible:mesh.visible,sourceMatches:mesh.material.map.image===assets.sleeves[side],validSize:assets.sleeves[side].width===image.width&&assets.sleeves[side].height===image.height,opaque:countFrame(mesh.material.map.image,rect).reduce((a,b)=>a+b,0)})),paddleVertices:d.paddle.children[1].geometry.attributes.position.count};
  })};
 });
 expect(result.renderCalls).toBeGreaterThan(0);expect(result.athletes).toHaveLength(4);
 for(const actor of result.athletes){expect(actor).toMatchObject({visible:true,reference:true,sourceLoaded:true,validSize:true,partitionCanvas:true});for(const band of actor.bodyBands)expect(band,'nonblank original head, torso and shoes').toBeGreaterThan(1000);expect(actor.paddleVertices).toBeGreaterThan(0);for(const sleeve of actor.sleeves){expect(sleeve.sourceMatches&&sleeve.validSize).toBe(true);if(sleeve.visible)expect(sleeve.opaque,'original sleeve patch has actual alpha pixels').toBeGreaterThan(200);else expect(sleeve.opaque).toBe(0);}}
}

test('legacy 3D compatibility: actual opaque paddle triangles meet the unchanged ball for both hands in every Play and camera',async({page})=>{
 await open(page);
 await installDimensionalAudit(page);
 const result=await page.evaluate(async playIds=>{
  const v=pickleboard.threeD,errors=[],opaque=[];
  for(const play of playIds) {
   v.exit();pickleboard.plays.load(play);await v.enter();
   for(const handedness of ['left','right']){
    for(const actor of v.playerObjects.values())actor.userData.handedness=handedness;
    for(const camera of ['overhead','sideline','behind-green','behind-orange']){
     v.setCamera(camera);
     for(const segment of v.timeline.segments.filter(s=>s.trajectory)){
      const time=segment.startTime+segment.contactTime;v.clock.elapsed=time;v.applyAtTime(time);
      const actor=v.playerObjects.get(segment.shotSemantics.playerId);
      errors.push(window.__athleteAudit(actor).paddleDistance(v.ballObject.position)-v.ballObject.userData.physicalRadius);
      const face=(actor.userData.referenceAthlete?actor.userData.paddle.children[1]:actor.getObjectByName('PaddleFace'));
      opaque.push(face.visible&&face.material.opacity===1&&!face.material.transparent&&face.material.depthTest&&face.material.depthWrite);
     }
    }
   }
  }
  return {physicalRadius:v.ballObject.userData.physicalRadius,maxError:Math.max(...errors),opaque:opaque.every(Boolean),samples:errors.length};
 }, PICKLEBOARD_PLAYS.map(play=>play.id));
 expect(result.physicalRadius).toBe(.037);expect(result.samples).toBe(PICKLEBOARD_PLAYS.reduce((sum,play)=>sum+play.steps.filter(step=>step.shot).length,0)*8);expect(result.opaque).toBe(true);expect(result.maxError).toBeLessThanOrEqual(1e-6);
});

test('legacy 3D compatibility: ball stays at least twelve CSS pixels and its surface keeps the logical projected center',async({page})=>{
 await open(page);
 const sizes=await page.evaluate(()=>{
  const v=pickleboard.threeD,result=[];
  for(const camera of ['overhead','sideline','behind-green','behind-orange']){
   v.setCamera(camera);
   for(const segment of v.timeline.segments.filter(s=>s.trajectory))for(const fraction of [0,0.25,0.5,1]){
    v.clock.elapsed=segment.startTime+segment.contactTime+segment.trajectory.totalDuration*fraction;v.applyAtTime(v.clock.elapsed);
    const center=v.ballObject.position.clone(),surface=v.readableBall.sprite.getWorldPosition(center.clone());
    const projected=center.clone().project(v.camera),surfaceProjected=surface.clone().project(v.camera);
    const depth=-center.clone().applyMatrix4(v.camera.matrixWorldInverse).z;
    const worldPerPixel=2*depth*Math.tan(v.camera.fov*Math.PI/360)/v.elements.canvas.clientHeight;
    result.push({diameter:v.readableBall.sprite.scale.x*12/16/worldPerPixel,drift:Math.hypot(projected.x-surfaceProjected.x,projected.y-surfaceProjected.y),x:projected.x,y:projected.y});
   }
  }return result;
 });
 for(const s of sizes){expect(s.diameter).toBeGreaterThanOrEqual(11.99);expect(s.drift).toBeLessThan(1e-9);expect(Math.abs(s.x)).toBeLessThan(1);expect(Math.abs(s.y)).toBeLessThan(1);/* Depth changes on the same ray; x/y remain fixed. */}
});

test('legacy 3D compatibility: dimensional replay opens when raster replay assets are unavailable',async({browser})=>{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 await page.route('**/assets/replay/**',route=>route.abort());
 await open(page);await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
 expect(await page.evaluate(()=>Boolean(pickleboard.threeD.pixelAssets))).toBe(false);
 await expectDecodedReferenceArtwork(page);
 await context.close();
});

test('legacy 3D compatibility: context loss exits safely and replay can be opened again',async({page})=>{
 await open(page);await page.evaluate(()=>pickleboard.threeD.renderer.domElement.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
 await expect(page.locator('#threeDCanvas canvas')).toHaveCount(0);await expect(page.locator('#threeDLoadStatus')).toContainText('Graphics were interrupted');
 await page.evaluate(() => { void pickleboard.threeD.enter(); });await page.waitForFunction(()=>pickleboard.threeD.active);await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
});

test('legacy 3D compatibility: fresh cached installation opens all four solid athletes fully offline',async({browser,offlineApp})=>{
 const context=await browser.newContext({serviceWorkers:'allow'}),page=await context.newPage();
 await page.goto(`${offlineApp.url}/?workspace=planner`);await page.waitForFunction(()=>navigator.serviceWorker.controller);await offlineApp.stop();await page.reload();
 await page.waitForFunction(()=>window.pickleboard?.plays);await page.evaluate(()=>pickleboard.plays.load('third-shot-drop'));await page.evaluate(() => { void pickleboard.threeD.enter(); });await page.waitForFunction(()=>pickleboard.threeD.active);
 await expectDecodedReferenceArtwork(page);
 await page.locator('#threeDExit').click();await page.locator('#playExit').click();await expect(page.locator('#threeDCanvas canvas')).toHaveCount(0);await context.close();
});
