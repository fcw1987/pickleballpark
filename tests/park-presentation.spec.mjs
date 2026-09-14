import {test,expect} from '@playwright/test';
for (const viewport of [{width:1440,height:900},{width:390,height:844}]) test(`guided art reaches the projected contact without giant overhead equipment at ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);
 await page.goto('/?workspace=planner');await page.waitForFunction(()=>window.pickleboard?.plays);
 const samples=await page.evaluate(async()=>{
  const board=pickleboard,engine=board.plays,result=[];
  for(const hand of['left','right'])for(const play of engine.list()){
   engine.load(play.id);for(const token of Object.values(board.tokens))if(token.type==='player')token.handedness=hand;
   await engine.pixelActors.load();
   for(const segment of engine.timeline.segments.filter(s=>s.shotSemantics)){
    engine.applyAtTime(segment.startTime+segment.contactTime);
    const id=segment.shotSemantics.playerId,entry=engine.pixelActors.nodes.get(id);
    const face=entry.node.dataset.paddleFace.split(',').map(Number);
    const point=new DOMPoint(...face).matrixTransform(entry.armGroup.getScreenCTM());
    const ball=board.tokens.ball.element;
    const center=new DOMPoint(Number(ball.getAttribute('cx')),Number(ball.getAttribute('cy'))).matrixTransform(ball.getScreenCTM());
    const transform=entry.armGroup.getAttribute('transform');
    result.push({play:play.id,shot:segment.step.id,hand,error:Math.hypot(point.x-center.x,point.y-center.y),scale:Number(transform.match(/scale\(([^)]+)/)?.[1]||1),phase:entry.node.dataset.frame});
   }
   engine.exit();
  }
  return result;
 });
 for(const s of samples){expect(s.error,JSON.stringify(s)).toBeLessThan(.05);if(s.shot==='overhead')expect(s.scale,JSON.stringify(s)).toBeLessThan(1.5);}
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
 await page.locator('#play3dView').click();await page.locator('#threeDCanvas canvas').waitFor();
 await expect(page.locator('#threeDShotCue')).toHaveText('overhead · Contact');
});
