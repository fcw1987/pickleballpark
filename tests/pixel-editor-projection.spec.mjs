import {expect,test} from '@playwright/test';

test('inspector target marker aligns with the painted court and dragging edits the authored target',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/?pixel-editor-projection=1');
 await page.waitForFunction(()=>window.playBuilder&&window.pickleboard?.pixelRenderer);
 await page.evaluate(()=>playBuilder.action('editShot',{field:'target',value:{x:8,y:35}}));
 await page.getByRole('button',{name:'Edit shot',exact:true}).click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const state=await page.evaluate(()=>{
  const b=playBuilder,r=b.board.pixelRenderer,c=r.canvas.getBoundingClientRect(),d=r.getDiagnostics(),target=b.selectedShot.target;
  const painted={x:c.x+(d.court.x+target.x*4)*c.width/r.canvas.width,y:c.y+(d.court.y+target.y*4)*c.height/r.canvas.height};
  const marker=b.courtTools.layer.querySelector('circle');
  const projected=b.courtTools.project(target);
  const m=b.board.court.getScreenCTM();
  window.pixelTargetPointerEvents={};
  for(const type of ['pointerdown','pointerup'])document.addEventListener(type,event=>{if(b.board.court.contains(event.target))window.pixelTargetPointerEvents[type]={x:event.clientX,y:event.clientY};},{capture:true,once:true});
  return{target,painted,projected,marker:{x:Number(marker.getAttribute('cx')),y:Number(marker.getAttribute('cy'))},scale:{x:m.a,y:m.d},delta:{x:m.a*1.25,y:m.d*1.5}};
 });
 expect(Math.abs(state.marker.x-state.painted.x)).toBeLessThan(.05);
 expect(Math.abs(state.marker.y-state.painted.y)).toBeLessThan(.05);
 expect(Math.abs(state.projected.x-state.painted.x)).toBeLessThan(.05);
 expect(Math.abs(state.projected.y-state.painted.y)).toBeLessThan(.05);
 await page.mouse.move(state.painted.x,state.painted.y);
 await page.mouse.down();
 await page.mouse.move(state.painted.x+state.delta.x,state.painted.y+state.delta.y,{steps:4});
 await page.mouse.up();
 const {target,events}=await page.evaluate(()=>({target:playBuilder.selectedShot.target,events:window.pixelTargetPointerEvents}));
 // WebKit quantizes synthetic mouse coordinates to CSS pixels. Verify the
 // actual delivered pointer displacement, rather than the requested fraction.
 expect(events.pointerdown).toBeTruthy();expect(events.pointerup).toBeTruthy();
 expect(target.x-state.target.x).toBeGreaterThan(1);
 expect(target.y-state.target.y).toBeGreaterThan(1.25);
 expect(target.x).toBeCloseTo(state.target.x+(events.pointerup.x-events.pointerdown.x)/state.scale.x,5);
 expect(target.y).toBeCloseTo(state.target.y+(events.pointerup.y-events.pointerdown.y)/state.scale.y,5);
});
