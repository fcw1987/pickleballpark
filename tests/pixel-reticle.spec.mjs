import {expect,test} from '@playwright/test';

for(const view of ['3d','2d'])for(const width of [1440,390])test(`${view} authored target reticle follows actual court after inspector and viewport changes at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/?pixel-reticle-audit=1');
 await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy);
 await page.evaluate(view=>playBuilder.switchView(view),view);
 await page.evaluate(async()=>{
  await playBuilder.action('selectShot',playBuilder.document.shots[2].id);
  await playBuilder.action('editShot',{field:'target',value:{x:8,y:27}});
 });
 const assertPosition=async()=>{
  await expect.poll(()=>page.evaluate(async()=>{
   const target=playBuilder.selectedShot.target,ring=document.querySelector('.builder-court-tools circle');
   if(!ring)return Infinity;
   // Compute ground coordinates independently of courtTools.project so a
   // stale overlay helper cannot validate itself in either rendering mode.
   let expected=new DOMPoint(target.x,target.y).matrixTransform(pickleboard.court.getScreenCTM());
   const actual=new DOMPoint(Number(ring.getAttribute('cx')),Number(ring.getAttribute('cy'))).matrixTransform(ring.getScreenCTM());
   const renderer=pickleboard.pixelRenderer,canvas=renderer.canvas,box=canvas.getBoundingClientRect(),view=renderer.getDiagnostics().viewBox;
   let visible={x:box.x+(target.x-view.x)*4*box.width/canvas.width,y:box.y+(target.y-view.y)*4*box.height/canvas.height};
   if(playBuilder.view==='3d'){const {Vector3}=await import('/vendor/three.module.min.js'),v=new Vector3((target.x-10)*.3048,0,(target.y-22)*.3048).project(pickleboard.threeD.camera),rect=pickleboard.threeD.renderer.domElement.getBoundingClientRect();visible=expected={x:rect.x+(v.x+1)*rect.width/2,y:rect.y+(1-v.y)*rect.height/2};}
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
