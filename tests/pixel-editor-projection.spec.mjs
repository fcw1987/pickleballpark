import {expect,test} from '@playwright/test';

for(const view of ['3d','2d'])test(`inspector target marker aligns with the visible ${view} court and dragging edits the authored target`,async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/?pixel-editor-projection=1');
 await page.waitForFunction(()=>window.playBuilder&&window.pickleboard?.pixelRenderer);
 await page.waitForFunction(()=>!playBuilder.busy);
 await page.evaluate(view=>playBuilder.switchView(view),view);
 await page.evaluate(()=>playBuilder.action('editShot',{field:'target',value:{x:8,y:35}}));
 await page.getByRole('button',{name:'Edit shot',exact:true}).click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const state=await page.evaluate(async()=>{
  const b=playBuilder,target=b.selectedShot.target;
  let painted;
  if(b.view==='2d'){const r=b.board.pixelRenderer,c=r.canvas.getBoundingClientRect(),d=r.getDiagnostics();painted={x:c.x+(d.court.x+target.x*4)*c.width/r.canvas.width,y:c.y+(d.court.y+target.y*4)*c.height/r.canvas.height};}
  if(b.view==='3d'){const {Vector3}=await import('/vendor/three.module.min.js'),v=new Vector3((target.x-10)*.3048,0,(target.y-22)*.3048).project(b.board.threeD.camera),box=b.board.threeD.renderer.domElement.getBoundingClientRect();painted={x:box.x+(v.x+1)*box.width/2,y:box.y+(1-v.y)*box.height/2};}
  const marker=b.courtTools.layer.querySelector('circle');
  const projected=b.courtTools.project(target);
  window.pixelTargetPointerEvents={};
  for(const type of ['pointerdown','pointerup'])document.addEventListener(type,event=>{if((b.view==='3d'?b.board.threeD.renderer.domElement:b.board.court).contains(event.target))window.pixelTargetPointerEvents[type]={x:event.clientX,y:event.clientY};},{capture:true,once:true});
  return{target,painted,projected,marker:{x:Number(marker.getAttribute('cx')),y:Number(marker.getAttribute('cy'))},delta:{x:20,y:24}};
 });
 expect(Math.abs(state.marker.x-state.painted.x)).toBeLessThan(.05);
 expect(Math.abs(state.marker.y-state.painted.y)).toBeLessThan(.05);
 expect(Math.abs(state.projected.x-state.painted.x)).toBeLessThan(.05);
 expect(Math.abs(state.projected.y-state.painted.y)).toBeLessThan(.05);
 await page.mouse.move(state.painted.x,state.painted.y);
 await page.mouse.down();
 await page.mouse.move(state.painted.x+state.delta.x,state.painted.y+state.delta.y,{steps:4});
 await page.mouse.up();
 const {target,events,expectedDelta}=await page.evaluate(async()=>{const b=playBuilder,events=window.pixelTargetPointerEvents;let expectedDelta;if(b.view==='3d'){const {Vector2,Vector3,Raycaster,Plane}=await import('/vendor/three.module.min.js'),box=b.board.threeD.renderer.domElement.getBoundingClientRect();const hit=e=>{const r=new Raycaster();r.setFromCamera(new Vector2((e.x-box.x)/box.width*2-1,1-(e.y-box.y)/box.height*2),b.board.threeD.camera);return r.ray.intersectPlane(new Plane(new Vector3(0,1,0),0),new Vector3());};const a=hit(events.pointerdown),z=hit(events.pointerup);expectedDelta={x:(z.x-a.x)/.3048,y:(z.z-a.z)/.3048};}else{const m=b.board.court.getScreenCTM();expectedDelta={x:(events.pointerup.x-events.pointerdown.x)/m.a,y:(events.pointerup.y-events.pointerdown.y)/m.d};}return{target:b.selectedShot.target,events,expectedDelta};});
 // WebKit quantizes synthetic mouse coordinates to CSS pixels. Verify the
 // actual delivered pointer displacement, rather than the requested fraction.
 expect(events.pointerdown).toBeTruthy();expect(events.pointerup).toBeTruthy();
 expect(Math.hypot(target.x-state.target.x,target.y-state.target.y)).toBeGreaterThan(1);
 expect(target.x).toBeCloseTo(state.target.x+expectedDelta.x,5);
 expect(target.y).toBeCloseTo(state.target.y+expectedDelta.y,5);
});
