import { expect, test } from '@playwright/test';

const viewports=[[1440,900],[768,1024],[1024,768],[390,844],[844,390]];
const polygonArea=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0)/2);

async function audit(page){return page.evaluate(()=>{
 const svg=document.querySelector('#court'),matrix=svg.getScreenCTM(),p=PickleboardProjection;
 const screen=point=>{const v=p.courtToView(point);const q=new DOMPoint(v.x,v.y).matrixTransform(matrix);return{x:q.x,y:q.y};};
 const court=[[0,0],[20,0],[20,44],[0,44]].map(([x,y])=>screen({x,y}));
 const apron=[[-8,-8],[28,-8],[28,52],[-8,52]].map(([x,y])=>screen({x,y}));
 const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 return {name:p.name,court,apron,viewBox:{width:svg.viewBox.baseVal.width,height:svg.viewBox.baseVal.height},menu:box('menuToggle'),help:box('infoToggle'),svg:box('court')};
});}

for(const [width,height] of viewports)test(`court-first layout ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.goto('/?workspace=planner');await page.waitForFunction(()=>window.pickleboard?.plays);
 const a=await audit(page);
 // The visible top-down court uses the largest uniform scale that fits the
 // complete park viewBox, with the regulation 20:44 proportion intact.
 const courtWidth=Math.hypot(a.court[1].x-a.court[0].x,a.court[1].y-a.court[0].y);
 const courtHeight=Math.hypot(a.court[3].x-a.court[0].x,a.court[3].y-a.court[0].y);
 const fittedScale=Math.min(a.svg.width/a.viewBox.width,a.svg.height/a.viewBox.height);
 expect(courtWidth/20).toBeCloseTo(courtHeight/44,6);
 expect(courtWidth).toBeCloseTo(20*fittedScale,5);
 expect(courtHeight).toBeCloseTo(44*fittedScale,5);
 expect(polygonArea(a.court)).toBeCloseTo(20*44*fittedScale**2,3);
 expect(a.court[1].y).toBeCloseTo(a.court[0].y,6);
 expect(a.court[3].x).toBeCloseTo(a.court[0].x,6);
 for(const point of a.apron){expect(point.x).toBeGreaterThanOrEqual(a.svg.x-1);expect(point.x).toBeLessThanOrEqual(a.svg.right+1);expect(point.y).toBeGreaterThanOrEqual(a.svg.y-1);expect(point.y).toBeLessThanOrEqual(a.svg.bottom+1);}
 for(const control of[a.menu,a.help]){expect(control.width).toBeGreaterThanOrEqual(44);expect(control.height).toBeGreaterThanOrEqual(44);expect(control.x).toBeGreaterThanOrEqual(0);expect(control.right).toBeLessThanOrEqual(width);expect(control.y).toBeGreaterThanOrEqual(0);expect(control.bottom).toBeLessThanOrEqual(height);}
});

test('resize preserves guided playback while controls remain operable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/?workspace=planner');await page.waitForFunction(()=>window.pickleboard?.plays);
 await page.evaluate(()=>{pickleboard.plays.load('serve-and-return');pickleboard.plays.session.seek(.5);pickleboard.plays.applyAtTime(.5);});
 const before=await page.evaluate(()=>({elapsed:pickleboard.plays.clock.elapsed,play:pickleboard.plays.activePlay.id}));
 await page.setViewportSize({width:844,height:390});await expect.poll(()=>page.evaluate(()=>PickleboardProjection.name)).toBe('wide');
 expect(await page.evaluate(()=>({elapsed:pickleboard.plays.clock.elapsed,play:pickleboard.plays.activePlay.id}))).toEqual(before);
 await page.locator('#infoToggle').click();await expect(page.locator('#infoClose')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#infoToggle')).toBeFocused();
 await page.locator('#menuToggle').click();await expect(page.locator('#menuClose')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#menuToggle')).toBeFocused();
});

test('guided layout keeps border controls on their projected park anchors',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/?workspace=planner');await page.waitForFunction(()=>window.pickleboard?.plays);
 await page.evaluate(()=>pickleboard.plays.load('serve-and-return'));
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--coaching-hud-height'))).not.toBe('');
 const measure=()=>page.evaluate(()=>{const matrix=document.querySelector('#court').getScreenCTM();
  const point=anchor=>{const view=PickleboardProjection.courtToView(anchor),screen=new DOMPoint(view.x,view.y).matrixTransform(matrix);return{x:screen.x,y:screen.y};};
  const center=id=>{const r=document.getElementById(id).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,box:{left:r.left,right:r.right,top:r.top,bottom:r.bottom}};};
  return{menu:center('menuToggle'),help:center('infoToggle'),menuAnchor:point({x:-6.5,y:15}),helpAnchor:point({x:26.5,y:8}),court:[[0,0],[20,0],[20,44],[0,44]].map(([x,y])=>point({x,y}))};});
 // The HUD CSS variable is set before ResizeObserver applies the projected control positions.
 await expect.poll(async()=>{const p=await measure();return Math.max(...['menu','help'].flatMap(n=>['x','y'].map(axis=>Math.abs(p[n][axis]-p[`${n}Anchor`][axis]))));}).toBeLessThan(.5);
 const positions=await measure();
 for(const name of['menu','help']){expect(positions[name].x).toBeCloseTo(positions[`${name}Anchor`].x,0);expect(positions[name].y).toBeCloseTo(positions[`${name}Anchor`].y,0);}
 const courtLeft=Math.min(...positions.court.map(point=>point.x)),courtRight=Math.max(...positions.court.map(point=>point.x));
 expect(positions.menu.box.right).toBeLessThan(courtLeft);expect(positions.help.box.left).toBeGreaterThan(courtRight);
});

test('active shot cue stays readable inside a 1024x768 viewport',async({page})=>{
 await page.setViewportSize({width:1024,height:768});await page.goto('/?workspace=planner');await page.waitForFunction(()=>window.pickleboard?.plays);
 await page.evaluate(()=>{pickleboard.plays.load('lob-overhead');pickleboard.plays.timelineAction('chapter','overhead');});
 await expect(page.locator('#playShotCue')).toBeVisible();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const cue=await page.locator('#playShotCue').boundingBox();expect(cue.width).toBeGreaterThan(0);expect(cue.height).toBeGreaterThan(0);expect(cue.x).toBeGreaterThanOrEqual(0);expect(cue.x+cue.width).toBeLessThanOrEqual(1024);expect(cue.y).toBeGreaterThanOrEqual(0);expect(cue.y+cue.height).toBeLessThanOrEqual(768);
});

for(const [width,height] of [[390,844],[844,390]])test(`200 percent text keeps border controls clear at ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.goto('/?workspace=planner');await page.addStyleTag({content:'html{font-size:200%}'});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const geometry=await page.evaluate(()=>{const matrix=document.querySelector('#court').getScreenCTM(),project=([x,y])=>{const view=PickleboardProjection.courtToView(x,y),p=new DOMPoint(view.x,view.y).matrixTransform(matrix);return{x:p.x,y:p.y};};
  const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return[{x:r.left,y:r.top},{x:r.right,y:r.top},{x:r.right,y:r.bottom},{x:r.left,y:r.bottom}];};
  return{court:[[0,0],[20,0],[20,44],[0,44]].map(project),menu:rect('menuToggle'),help:rect('infoToggle')};});
 const separated=(a,b)=>[...a,...b].some((p,i)=>{const q=i<a.length?a[(i+1)%a.length]:b[(i-a.length+1)%b.length];const axis={x:-(q.y-p.y),y:q.x-p.x};const values=poly=>poly.map(point=>point.x*axis.x+point.y*axis.y);const av=values(a),bv=values(b);return Math.max(...av)<Math.min(...bv)||Math.max(...bv)<Math.min(...av);});
 for(const [id,poly] of Object.entries({menu:geometry.menu,help:geometry.help})){const r=await page.locator(`#${id==='menu'?'menuToggle':'infoToggle'}`).boundingBox();expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);expect(separated(poly,geometry.court),id).toBe(true);}
 await page.locator('#infoToggle').click();await expect(page.locator('#infoClose')).toBeVisible();
});
