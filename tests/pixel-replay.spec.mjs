import {test,expect} from '@playwright/test';
import { installDimensionalAudit } from './helpers/dimensional-audit.mjs';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
async function open(page){await page.goto('/?workspace=planner');await page.waitForFunction(()=>window.pickleboard?.plays);await page.evaluate(()=>pickleboard.plays.load('third-shot-drop'));await page.locator('#play3dView').click();await page.waitForFunction(()=>pickleboard.threeD.active);}

test('actual opaque paddle triangles meet the unchanged ball for both hands in every Play and camera',async({page})=>{
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
      errors.push(window.__athleteAudit(actor).paddleDistance(v.ballObject.position));
      const face=actor.getObjectByName('PaddleFace');
      opaque.push(face.visible&&face.material.opacity===1&&!face.material.transparent&&face.material.depthTest&&face.material.depthWrite);
     }
    }
   }
  }
  return {maxError:Math.max(...errors),opaque:opaque.every(Boolean),samples:errors.length};
 }, PICKLEBOARD_PLAYS.map(play=>play.id));
 expect(result.samples).toBe(PICKLEBOARD_PLAYS.reduce((sum,play)=>sum+play.steps.filter(step=>step.shot).length,0)*8);expect(result.opaque).toBe(true);expect(result.maxError).toBeLessThan(0.02);
});

test('ball stays at least twelve CSS pixels and its surface keeps the logical projected center',async({page})=>{
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

test('dimensional replay opens when raster replay assets are unavailable',async({browser})=>{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 await page.route('**/assets/replay/**',route=>route.abort());
 await open(page);await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
 expect(await page.evaluate(()=>Boolean(pickleboard.threeD.pixelAssets))).toBe(false);
 expect(await page.evaluate(()=>[...pickleboard.threeD.playerObjects.values()].every(actor=>actor.userData.volumetricAthlete))).toBe(true);
 await context.close();
});

test('context loss exits safely and replay can be opened again',async({page})=>{
 await open(page);await page.evaluate(()=>pickleboard.threeD.renderer.domElement.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
 await expect(page.locator('#threeDCanvas canvas')).toHaveCount(0);await expect(page.locator('#threeDLoadStatus')).toContainText('Graphics were interrupted');
 await page.locator('#play3dView').click();await page.waitForFunction(()=>pickleboard.threeD.active);await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
});

test('fresh cached installation opens all four solid athletes fully offline',async({browser})=>{
 const context=await browser.newContext({serviceWorkers:'allow'}),page=await context.newPage();
 await page.goto('/?workspace=planner');await page.waitForFunction(()=>navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();
 await page.waitForFunction(()=>window.pickleboard?.plays);await page.evaluate(()=>pickleboard.plays.load('third-shot-drop'));await page.locator('#play3dView').click();await page.waitForFunction(()=>pickleboard.threeD.active);
 expect(await page.evaluate(()=>[...pickleboard.threeD.playerObjects.values()].filter(a=>a.userData.volumetricAthlete&&a.getObjectByName('PaddleFace')?.geometry.attributes.position.count>0).length)).toBe(4);
 await page.locator('#threeDExit').click();await page.locator('#playExit').click();await expect(page.locator('#threeDCanvas canvas')).toHaveCount(0);await context.close();
});
