import {expect,test} from '@playwright/test';

for(const width of [1440,390])test(`authored target reticle follows actual court after inspector and viewport changes at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/?pixel-reticle-audit=1');
 await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy);
 await page.evaluate(async()=>{
  await playBuilder.action('selectShot',playBuilder.document.shots[2].id);
  await playBuilder.action('editShot',{field:'target',value:{x:8,y:27}});
 });
 const assertPosition=async()=>{
  await expect.poll(()=>page.evaluate(()=>{
   const target=playBuilder.selectedShot.target,ring=document.querySelector('.builder-court-tools circle');
   if(!ring)return Infinity;
   // Primary pixel ground is in court feet. Do not use courtTools.project:
   // that would compare the overlay with the same stale helper that drew it.
   const expected=new DOMPoint(target.x,target.y).matrixTransform(pickleboard.court.getScreenCTM());
   const actual=new DOMPoint(Number(ring.getAttribute('cx')),Number(ring.getAttribute('cy'))).matrixTransform(ring.getScreenCTM());
   const renderer=pickleboard.pixelRenderer,canvas=renderer.canvas,box=canvas.getBoundingClientRect(),view=renderer.getDiagnostics().viewBox;
   const visible={x:box.x+(target.x-view.x)*4*box.width/canvas.width,y:box.y+(target.y-view.y)*4*box.height/canvas.height};
   return Math.max(Math.hypot(expected.x-actual.x,expected.y-actual.y),Math.hypot(visible.x-actual.x,visible.y-actual.y));
  })).toBeLessThan(.5);
 };
 await assertPosition();
 for(let i=0;i<4;i++){
  await page.locator('.builder-ui [data-action="collapse-inspector"]:visible').first().click();
  await assertPosition();
 }
 await page.setViewportSize({width:width===1440?1024:430,height:768});await assertPosition();
 expect(await page.evaluate(()=>playBuilder.selectedShot.target)).toEqual({x:8,y:27});
});
