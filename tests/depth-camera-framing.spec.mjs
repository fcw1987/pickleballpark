import {expect,test} from '@playwright/test';
import {installDimensionalAudit} from './helpers/dimensional-audit.mjs';

async function openCourt(page){
 await page.goto('/?depth-camera-framing=1');
 await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&pickleboard.threeD?.active&&pickleboard.threeD.worldAssetsReady);
 await installDimensionalAudit(page);
}
async function assertCourtFit(page){
 const result=await page.evaluate(()=>{
  const v=pickleboard.threeD,c=v.cameraControls,r=v.renderer.domElement.getBoundingClientRect(),reserved=v.cameraFraming.reservedPixels;
  const points=c.envelope().map(p=>p.clone());
  const times=[0,...v.timeline.segments.flatMap(s=>[s.startTime,s.startTime+(s.contactTime||0),s.startTime+s.duration/2,s.endTime])];
  for(const time of times){v.applyAtTime(time);for(const actor of v.playerObjects.values())points.push(...__athleteAudit(actor).vertices);points.push(v.ballObject.position.clone());}
  v.applyAtTime(v.clock.elapsed);
  const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  for(const p of points){const q=p.project(v.camera),x=r.x+(q.x+1)*r.width/2,y=r.y+(1-q.y)*r.height/2;bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);}
  return{...bounds,canvas:{left:r.left,right:r.right,top:r.top,bottom:r.bottom-reserved}};
 });
 expect(result.left).toBeGreaterThanOrEqual(result.canvas.left-1);
 expect(result.right).toBeLessThanOrEqual(result.canvas.right+1);
 expect(result.top).toBeGreaterThanOrEqual(result.canvas.top-1);
 expect(result.bottom).toBeLessThanOrEqual(result.canvas.bottom+1);
}
const state=page=>page.evaluate(()=>pickleboard.threeD.cameraControls.getState());
const authored=page=>page.evaluate(()=>({document:JSON.stringify(playBuilder.document),elapsed:pickleboard.threeD.clock.elapsed}));
async function emptyPoint(page){return page.evaluate(()=>{
 const c=pickleboard.threeD.cameraControls,r=c.surface.getBoundingClientRect();
 for(const x of[.12,.88,.2,.8])for(const y of[.35,.6,.2]){const p={clientX:r.left+r.width*x,clientY:r.top+r.height*y};if(!c.shouldYield(p))return{x:p.clientX,y:p.clientY};}
 throw Error('No empty camera gesture point');
});}
async function drag(page,p,dx,dy){await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:4});await page.mouse.up();}

for(const viewport of[{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){
 test(`action-fitted camera entry, presets and controls at ${viewport.width}x${viewport.height}`,async({browser,browserName},testInfo)=>{
  const context=await browser.newContext({viewport,hasTouch:true}),page=await context.newPage();await openCourt(page);
  const source=await authored(page),entry=await state(page);expect(entry.distance).toBeLessThan(24);expect(entry.autoFit).toBe(true);
  const sizes=await page.evaluate(()=>{
   const v=pickleboard.threeD,c=v.cameraControls,height=v.renderer.domElement.clientHeight;
   const measure=()=>[...v.playerObjects.values()].map(actor=>{const ys=__athleteAudit(actor).vertices.map(p=>p.project(v.camera).y);return(Math.max(...ys)-Math.min(...ys))*height/2});
   const fitted=measure();c.setState({distance:c.surface.clientWidth<600?27:29});const overview=measure();c.reset();
   return{fitted,overview};
  });
  for(let i=0;i<sizes.fitted.length;i++)expect(sizes.fitted[i]/sizes.overview[i]).toBeGreaterThan(viewport.width===390?1.2:1.25);
  await assertCourtFit(page);await page.screenshot({path:testInfo.outputPath('closer-entry.png')});
  for(const preset of['sideline','behind-green','behind-orange','overhead']){
   await page.evaluate(p=>pickleboard.threeD.setCamera(p),preset);await assertCourtFit(page);expect(await authored(page)).toEqual(source);
  }
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();const closer=await state(page);expect(closer.distance).toBeLessThan(entry.distance);expect(closer.autoFit).toBe(false);
  await page.getByRole('button',{name:'Zoom out',exact:true}).click();expect((await state(page)).distance).toBeGreaterThan(closer.distance);
  await page.getByRole('button',{name:'Reset view',exact:true}).click();expect((await state(page)).distance).toBeCloseTo(entry.distance,7);
  const p=await emptyPoint(page);await drag(page,p,34,8);const turned=await state(page);expect(turned.azimuth).toBeLessThan(0);expect(turned.pointerCount).toBe(0);
  await drag(page,await emptyPoint(page),-60,-8);expect((await state(page)).azimuth).toBeGreaterThan(turned.azimuth);
  await page.getByRole('button',{name:'Pan',exact:true}).click();const prePan=await state(page);await drag(page,await emptyPoint(page),20,6);const panned=await state(page);expect(panned.azimuth).toBe(prePan.azimuth);expect(panned.target).not.toEqual(prePan.target);
  await page.getByRole('button',{name:'Reset view',exact:true}).click();await page.getByRole('button',{name:'Rotate',exact:true}).click();
  const preTouch=await state(page),touch=await emptyPoint(page);
  if(browserName==='chromium'){
   const client=await context.newCDPSession(page),points=spread=>[{x:touch.x,y:touch.y-spread,id:1},{x:touch.x,y:touch.y+spread,id:2}];
   await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(12)});
   await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(25)});
   await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
   // Playwright exposes native multitouch only through Chromium's CDP.
   // Exercise Safari's same two-pointer controller without faking native capture.
   await page.evaluate(touch=>{
    const c=pickleboard.threeD.cameraControls,s=c.surface,original={set:s.setPointerCapture,has:s.hasPointerCapture,release:s.releasePointerCapture},captured=new Set();
    s.setPointerCapture=id=>captured.add(id);s.hasPointerCapture=id=>captured.has(id);s.releasePointerCapture=id=>captured.delete(id);
    const send=(type,id,offset)=>s.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',button:0,clientX:touch.x,clientY:touch.y+offset,bubbles:true,cancelable:true}));
    try{send('pointerdown',91,-12);send('pointerdown',92,12);send('pointermove',91,-25);send('pointermove',92,25);send('pointerup',91,-25);send('pointerup',92,25);}
    finally{s.setPointerCapture=original.set;s.hasPointerCapture=original.has;s.releasePointerCapture=original.release;}
   },touch);
  }
  const pinched=await state(page);expect(pinched.distance).toBeLessThan(preTouch.distance);expect(pinched.azimuth).toBe(preTouch.azimuth);expect(pinched.pointerCount).toBe(0);expect(await authored(page)).toEqual(source);
  await page.getByRole('button',{name:'Reset view',exact:true}).click();await context.close();
 });
}

test('closer editor target dragging wins over orbit and later play refresh retains the manual camera',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await openCourt(page);
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();const manual=await state(page);
 await page.evaluate(()=>playBuilder.action('editShot',{field:'target',value:{x:8,y:35}}));
 await page.getByRole('button',{name:'Edit shot',exact:true}).click();await page.waitForFunction(()=>!playBuilder.busy);
 expect(await state(page)).toEqual(manual);
 const before=await page.evaluate(()=>({target:{...playBuilder.selectedShot.target},point:playBuilder.courtTools.project(playBuilder.selectedShot.target)}));
 await drag(page,before.point,18,14);await page.waitForFunction(()=>!playBuilder.busy);
 const after=await page.evaluate(()=>playBuilder.selectedShot.target);expect(Math.hypot(after.x-before.target.x,after.y-before.target.y)).toBeGreaterThan(.4);
 expect(await state(page)).toEqual(manual);
 await page.getByRole('button',{name:'Reset view',exact:true}).click();await assertCourtFit(page);
});
