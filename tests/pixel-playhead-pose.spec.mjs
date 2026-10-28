import{expect,test}from'@playwright/test';

test('paused and repeated seek frames use the authoritative playhead for moving pixel poses',async({page})=>{
 await page.goto('/?workspace=planner&pixel-playhead-pose=1');
 await page.waitForFunction(()=>window.pickleboard?.pixelRenderer&&pickleboard.plays);
 const state=await page.evaluate(async()=>{
  const {pixelEnvironmentReady}=await import('/pixel-environment.js');await pixelEnvironmentReady;
  const b=pickleboard;b.plays.load('third-shot-drop');b.plays.pause();await b.plays.pixelActors.load();
  let selected;
  for(let time=.02;time<b.plays.timeline.duration;time+=.04){
   b.plays.applyAtTime(time);
   const candidate=Object.entries(b.pixelSamples||{}).find(([,s])=>s.travelSpeed>.1&&['ready','shuffle'].includes(s.action));
   if(candidate){selected={time,id:candidate[0]};break;}
  }
  if(!selected)throw Error('Fixture requires an actual moving athlete.');
  window.pixelPlayheadSnapshot=()=>{
   b.pixelRenderer.render(performance.now());
   const pixels=b.pixelRenderer.ctx.getImageData(0,0,b.pixelRenderer.canvas.width,b.pixelRenderer.canvas.height).data;
   let hash=2166136261;for(const byte of pixels)hash=Math.imul(hash^byte,16777619)>>>0;
   return{feet:b.pixelRenderer.getDiagnostics().actors[selected.id].feet,hash,elapsed:b.plays.session.clock.elapsed};
  };
  b.plays.session.seek(selected.time);b.plays.applyAtTime(selected.time);
  return{...selected,snapshot:window.pixelPlayheadSnapshot()};
 });
 await page.waitForTimeout(160);
 expect(await page.evaluate(()=>window.pixelPlayheadSnapshot())).toEqual(state.snapshot);
 await page.evaluate(time=>{const b=pickleboard;b.plays.session.seek(time+.2);b.plays.applyAtTime(time+.2);b.pixelRenderer.render(performance.now());b.plays.session.seek(time);b.plays.applyAtTime(time);},state.time);
 expect(await page.evaluate(()=>window.pixelPlayheadSnapshot())).toEqual(state.snapshot);
});
