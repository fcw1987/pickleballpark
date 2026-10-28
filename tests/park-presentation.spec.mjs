import {test,expect} from '@playwright/test';
for (const viewport of [{width:1440,height:900},{width:390,height:844}]) test(`visible pixel canvas paddle reaches the ball without unbounded contact correction at ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);
 await page.goto('/?workspace=planner');await page.waitForFunction(()=>window.pickleboard?.plays);
 await expect(page.locator('.pixel-court-canvas')).toBeVisible();
 const samples=await page.evaluate(async()=>{
  const board=pickleboard,engine=board.plays,result=[];
  for(const hand of ['left','right'])for(const play of engine.list()){
   engine.load(play.id);for(const token of Object.values(board.tokens))if(token.type==='player')token.handedness=hand;
   await engine.pixelActors.load();
   for(const segment of engine.timeline.segments.filter(s=>s.shotSemantics)){
    engine.applyAtTime(segment.startTime+segment.contactTime);
    board.pixelRenderer.render(performance.now());
    const actor=board.pixelRenderer.diagnostics.actors[segment.shotSemantics.playerId];
    const ball=board.pixelRenderer.diagnostics.ball.display;
    result.push({play:play.id,shot:segment.step.id,hand,
      error:Math.hypot(actor.paddle.x-ball.x,actor.paddle.y-ball.y),
      contactBounded:actor.contactBounded,phase:actor.phase,
      upperArm:Math.hypot(actor.shoulder.x-actor.elbow.x,actor.shoulder.y-actor.elbow.y),
      forearm:Math.hypot(actor.elbow.x-actor.wrist.x,actor.elbow.y-actor.wrist.y),
      handle:Math.hypot(actor.paddle.x-actor.sole.x-actor.wrist.x,actor.paddle.y-actor.sole.y-actor.wrist.y),
      torsoOffset:Math.hypot(actor.torsoOffset.x,actor.torsoOffset.y),
      sole:actor.sole,ground:actor.ground,
      renderer:board.pixelRenderer.diagnostics.renderer});
   }
   engine.exit();
  }
  return result;
 });
 for(const sample of samples){
  expect(sample.renderer).toBe('Canvas2D');
  expect(sample.phase,JSON.stringify(sample)).toBe('contact');
  expect(sample.error,JSON.stringify(sample)).toBeLessThan(.05);
  expect(sample.contactBounded,JSON.stringify(sample)).toBe(false);
  expect(sample.sole,JSON.stringify(sample)).toEqual(sample.ground);
  expect(sample.upperArm,JSON.stringify(sample)).toBeCloseTo(4.5,8);
  expect(sample.forearm,JSON.stringify(sample)).toBeCloseTo(4.5,8);
  expect(sample.handle,JSON.stringify(sample)).toBeCloseTo(4,8);
  expect(sample.torsoOffset,JSON.stringify(sample)).toBeLessThanOrEqual(8);
 }
 expect(samples.length).toBeGreaterThan(40);
});
test('empty cues stay hidden; pause freezes their timeline-driven reveal',async({page})=>{
 await page.goto('/?workspace=planner');await page.waitForFunction(()=>window.pickleboard?.plays);await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
 await page.evaluate(()=>pickleboard.plays.load('serve-and-return'));await expect(page.locator('#playShotCue')).toBeHidden();
 await page.locator('#playPlayPause').click();await page.clock.runFor(80);await page.locator('#playPlayPause').click();
 const cue=await page.locator('#playShotCue').getAttribute('style');await page.clock.runFor(500);expect(await page.locator('#playShotCue').getAttribute('style')).toBe(cue);
 await page.locator('#playTimelineMount input[type=range]').fill('0');await expect(page.locator('#playShotCue')).toBeHidden();
});

test('chapter boundaries label and cue the destination shot consistently',async({page})=>{
 await page.goto('/?workspace=planner');await page.waitForFunction(()=>window.pickleboard?.plays);
 await page.evaluate(()=>{pickleboard.plays.load('lob-overhead');pickleboard.plays.timelineAction('chapter','overhead');});
 await expect(page.locator('#playbackStepLabel')).toHaveText('Overhead Reply');
 await expect(page.locator('#playShotCue')).toHaveText('overhead · Contact');
 await page.evaluate(() => { void pickleboard.threeD.enter(); });await page.locator('#threeDCanvas canvas').waitFor();
 await expect(page.locator('#threeDShotCue')).toHaveText('overhead · Contact');
});
