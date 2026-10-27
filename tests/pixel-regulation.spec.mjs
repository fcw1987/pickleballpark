import { expect, test } from '@playwright/test';

for(const viewport of [{width:320,height:568},{width:390,height:844}])test(`pixel court remains proportionate and pointer inversion stays exact at ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);
 await page.goto('/?pixel-regulation=1');
 await page.waitForFunction(()=>window.pickleboard?.pixelRenderer?.getDiagnostics()?.court&&window.playBuilder&&!playBuilder.busy);
 const state=await page.evaluate(()=>{
  const board=window.pickleboard,renderer=board.pixelRenderer,canvas=renderer.canvas,ctm=board.court.getScreenCTM();
  const points=[{x:0,y:0},{x:20,y:44},{x:10,y:22},{x:5.25,y:37.75},{x:-3,y:48}];
  return {diagnostics:renderer.getDiagnostics(),smoothing:renderer.ctx.imageSmoothingEnabled,renderer:canvas.dataset.renderer,
   horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
   scale:{x:ctm.a,y:ctm.d},roundTrips:points.map(point=>{
    const view=board.projection.courtToView(point),screen=new DOMPoint(view.x,view.y).matrixTransform(ctm);
    return {expected:point,actual:board.screenToSVG(screen.x,screen.y)};
   })};
 });
 expect(state.renderer).toBe('canvas2d');expect(state.smoothing).toBe(false);
 expect(state.diagnostics.court.width/state.diagnostics.court.height).toBeCloseTo(20/44,12);
 expect(state.scale.x).toBeCloseTo(state.scale.y,10);
 expect(state.horizontalOverflow).toBe(false);
 for(const {actual,expected} of state.roundTrips){expect(actual.x).toBeCloseTo(expected.x,8);expect(actual.y).toBeCloseTo(expected.y,8);}
});

test('pixel replay retains exact ball and paddle alignment for both hands across every lesson',async({page})=>{
 await page.goto('/?workspace=planner&pixel-contact-audit=1');
 await page.waitForFunction(()=>window.pickleboard?.pixelRenderer&&pickleboard.plays);
 const result=await page.evaluate(async()=>{
  const {PICKLEBOARD_PLAYS}=await import('/play-catalog.js');
  const board=pickleboard,errors=[];let count=0;
  for(const play of PICKLEBOARD_PLAYS){
   board.plays.load(play.id);
   for(const hand of ['left','right']){
    for(const token of Object.values(board.tokens))if(token.type==='player')token.handedness=hand;
    for(const segment of board.plays.timeline.segments.filter(segment=>segment.trajectory)){
     board.plays.applyAtTime(segment.startTime+segment.contactTime);
     board.pixelRenderer.render(0);
     const d=board.pixelRenderer.getDiagnostics(),actor=d.actors[segment.shotSemantics.playerId];
     count++;
     if(!actor?.target||Math.hypot(actor.paddle.x-d.ball.display.x,actor.paddle.y-d.ball.display.y)>1e-6||Math.hypot(actor.rasterPaddle.x-d.ball.rasterCenter.x,actor.rasterPaddle.y-d.ball.rasterCenter.y)>0)errors.push({play:play.id,shot:segment.step.id,hand,actor,ball:d.ball});
    }
   }
   board.plays.exit();
  }
  return {count,errors};
 });
 expect(result.count).toBeGreaterThan(40);
 expect(result.errors).toEqual([]);
});

test('pixel contact plants canonical soles and keeps both shoes fixed through the contact window',async({page})=>{
 await page.goto('/?workspace=planner&pixel-foot-audit=1');
 await page.waitForFunction(()=>window.pickleboard?.pixelRenderer&&pickleboard.plays);
 const result=await page.evaluate(async()=>{
  const {PICKLEBOARD_PLAYS}=await import('/play-catalog.js');
  const board=pickleboard,errors=[];let samples=0;
  for(const play of PICKLEBOARD_PLAYS){
   board.plays.load(play.id);
   for(const hand of ['left','right']){
    for(const token of Object.values(board.tokens))if(token.type==='player')token.handedness=hand;
    for(const segment of board.plays.timeline.segments.filter(segment=>segment.trajectory)){
     const anchor=segment.startTime+segment.contactTime,id=segment.shotSemantics.playerId;let planted;
     for(const delta of [0,-.06,-.03,.03,.06]){
      if(anchor+delta<0)continue;
      board.plays.applyAtTime(anchor+delta);board.pixelRenderer.render(1000);
      const actor=board.pixelRenderer.getDiagnostics().actors[id];samples++;
      const shoes=actor.feet.map(foot=>({x:actor.sole.x+foot.x,y:actor.sole.y+foot.y}));
      const drift=Math.hypot(actor.sole.x-actor.ground.x,actor.sole.y-actor.ground.y);
      if(drift>1e-8)errors.push({play:play.id,shot:segment.step.id,hand,delta,reason:'canonical root shifted',drift});
      if(!planted)planted=shoes;
      for(let i=0;i<shoes.length;i++){
       const slip=Math.hypot(shoes[i].x-planted[i].x,shoes[i].y-planted[i].y);
       if(slip>1e-6)errors.push({play:play.id,shot:segment.step.id,hand,delta,reason:'planted shoe slipped',slip});
      }
     }
    }
   }
   board.plays.exit();
  }
  return {samples,errors};
 });
 expect(result.samples).toBeGreaterThan(200);
 expect(result.errors).toEqual([]);
});

for(const width of [320,390])test(`visible pixel athlete head supports handedness and dragging at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/?workspace=planner&pixel-head-input=1');
 await page.waitForFunction(()=>pickleboard?.pixelRenderer?.getDiagnostics()?.actors.player1);
 const locateHead=()=>page.evaluate(()=>{
  const r=pickleboard.pixelRenderer,d=r.getDiagnostics(),a=d.actors.player1,box=r.canvas.getBoundingClientRect();
  return {x:box.x+(a.ground.x)*box.width/r.canvas.width,y:box.y+(a.ground.y-20)*box.height/r.canvas.height};
 });
 const original=await page.evaluate(()=>({hand:pickleboard.tokens.player1.handedness,position:pickleboard.getTokenPositions().player1}));
 const head=await locateHead();await page.mouse.dblclick(head.x,head.y);
 expect(await page.evaluate(()=>pickleboard.tokens.player1.handedness)).toBe(original.hand==='left'?'right':'left');
 const current=await locateHead(),delta={x:16,y:10};
 const expected=await page.evaluate(({head,delta})=>{const a=pickleboard.screenToSVG(head.x,head.y),b=pickleboard.screenToSVG(head.x+delta.x,head.y+delta.y);return{x:b.x-a.x,y:b.y-a.y};},{head:current,delta});
 await page.mouse.move(current.x,current.y);await page.mouse.down();await page.mouse.move(current.x+delta.x,current.y+delta.y,{steps:5});await page.mouse.up();
 const position=await page.evaluate(()=>pickleboard.getTokenPositions().player1);
 expect(position.x-original.position.x).toBeCloseTo(expected.x,1);expect(position.y-original.position.y).toBeCloseTo(expected.y,1);
});
