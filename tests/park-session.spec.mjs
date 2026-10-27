import { expect, test } from '@playwright/test';

async function openApp(page, suffix='session') {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`/index.html?workspace=planner&park-${suffix}=1`);
  await page.waitForFunction(()=>Boolean(window.pickleboard?.plays&&window.pickleboard?.threeD));
  return errors;
}

async function installClock(page) {
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
}

test('retained 3D compatibility API: editor and 3D share elapsed time, rate, pause state, and final recovery',async({page})=>{
  const errors=await openApp(page,'handoff');
  await installClock(page);
  await page.evaluate(()=>window.pickleboard.plays.load('third-shot-drive'));
  await page.locator('#playRate').selectOption('0.5',{force:true});
  await page.locator('#playPlayPause').click();
  await page.clock.runFor(600);
  await page.locator('#playPlayPause').click();
  const editor=await page.evaluate(()=>({
    elapsed:pickleboard.plays.clock.elapsed,rate:pickleboard.plays.clock.playbackRate,
    playing:pickleboard.plays.clock.playing,phase:pickleboard.plays.lastState.phase
  }));
  expect(editor.elapsed).toBeGreaterThan(.25);
  expect(editor).toMatchObject({rate:.5,playing:false});

  await page.evaluate(() => { void pickleboard.threeD.enter(); });
  await expect(page.locator('#threeDViewer')).toBeVisible();
  const entered=await page.evaluate(()=>({
    sameSession:pickleboard.plays.session===pickleboard.threeD.session,
    sameClock:pickleboard.plays.clock===pickleboard.threeD.clock,
    elapsed:pickleboard.threeD.clock.elapsed,rate:pickleboard.threeD.clock.playbackRate,
    playing:pickleboard.threeD.clock.playing
  }));
  expect(entered).toEqual({sameSession:true,sameClock:true,elapsed:editor.elapsed,rate:.5,playing:false});

  await page.locator('#threeDPlayPause').click();
  await page.clock.runFor(400);
  await page.locator('#threeDPlayPause').click();
  const replayElapsed=await page.evaluate(()=>pickleboard.threeD.clock.elapsed);
  expect(replayElapsed-editor.elapsed).toBeCloseTo(.2,2);
  await page.locator('#threeDExit').click();
  expect(await page.evaluate(()=>pickleboard.plays.clock.elapsed)).toBe(replayElapsed);
  expect(await page.evaluate(()=>pickleboard.plays.clock.playing)).toBe(false);

  const recovered=await page.evaluate(()=>{
    const engine=pickleboard.plays,timeline=engine.timeline,last=timeline.segments.filter(s=>s.shotSemantics).at(-1);
    engine.session.seek(timeline.duration); engine.applyAtTime(timeline.duration);
    return {phase:engine.lastState.phase,elapsed:engine.clock.elapsed,
      positions:Object.fromEntries(['player1','player2','player3','player4'].map(id=>[id,pickleboard.getTokenPositions()[id]]))};
  });
  expect(recovered.phase).toBe('bounce');
  expect(recovered.elapsed).toBe(await page.evaluate(()=>pickleboard.plays.timeline.duration));
  expect(Object.values(recovered.positions).every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y))).toBe(true);
  expect(errors).toEqual([]);
});

test('retained 3D compatibility API: final hold freezes, Pause wins, repeat wraps, and replacement cancels stale wakeups',async({page})=>{
  const errors=await openApp(page,'hold');
  await installClock(page);
  const duration=await page.evaluate(()=>{
    pickleboard.plays.load('lob-overhead');
    pickleboard.plays.timingScale=.05;
    return pickleboard.plays.timeline.duration;
  });
  await page.locator('#playPlayPause').click();
  await page.clock.runFor(Math.ceil(duration*50)+10);
  await expect.poll(()=>page.evaluate(()=>pickleboard.plays.session.holding)).toBe(true);
  const held=await page.evaluate(()=>({elapsed:pickleboard.plays.clock.elapsed,duration:pickleboard.plays.timeline.duration,
    playing:pickleboard.plays.clock.playing,holding:pickleboard.plays.session.holding,
    ball:{...pickleboard.getTokenPositions().ball},height:pickleboard.playBallHeight}));
  expect(held).toMatchObject({playing:true,holding:true});
  expect(held.elapsed).toBeCloseTo(held.duration,8);
  await page.clock.runFor(20);
  const frozen=await page.evaluate(()=>({elapsed:pickleboard.plays.clock.elapsed,ball:{...pickleboard.getTokenPositions().ball},height:pickleboard.playBallHeight}));
  expect(frozen).toEqual({elapsed:held.elapsed,ball:held.ball,height:held.height});

  await page.locator('#playPlayPause').click();
  expect(await page.evaluate(()=>({holding:pickleboard.plays.session.holding,playing:pickleboard.plays.session.playing,
    elapsed:pickleboard.plays.clock.elapsed}))).toMatchObject({holding:true,playing:false,elapsed:duration});
  await page.clock.runFor(100);
  expect(await page.evaluate(()=>pickleboard.plays.clock.elapsed)).toBeCloseTo(duration,8);
  await page.locator('#playPlayPause').click();
  await page.clock.runFor(60);
  await expect.poll(()=>page.evaluate(()=>pickleboard.plays.session.iteration)).toBeGreaterThan(0);

  await page.evaluate(()=>{
    pickleboard.plays.pause();pickleboard.plays.session.seek(pickleboard.plays.timeline.duration-.01);
    pickleboard.plays.play();
  });
  await page.clock.runFor(20);
  await expect.poll(()=>page.evaluate(()=>pickleboard.plays.session.holding)).toBe(true);
  await page.evaluate(()=>pickleboard.plays.load('dink-exchange'));
  const replacement=await page.evaluate(()=>({playId:pickleboard.plays.activePlay.id,elapsed:pickleboard.plays.clock.elapsed,
    iteration:pickleboard.plays.session.iteration,holding:pickleboard.plays.session.holding}));
  await page.clock.runFor(200);
  expect(await page.evaluate(()=>({playId:pickleboard.plays.activePlay.id,elapsed:pickleboard.plays.clock.elapsed,
    iteration:pickleboard.plays.session.iteration,holding:pickleboard.plays.session.holding}))).toEqual(replacement);
  expect(errors).toEqual([]);
});

test('retained 3D compatibility API: thirty editor to 3D cycles restore the exact board and release replay resources',async({page})=>{
  test.setTimeout(120000);
  const errors=await openApp(page,'cycles');
  const before=await page.evaluate(()=>{
    const board=pickleboard;
    board.setGameMode('singles');
    board.setTokenPosition('player1',8.5,10.5); board.setTokenPosition('ball',12.5,20.5);
    board.togglePlayerHandedness(board.tokens.player1);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.classList.add('drawing-stroke'); path.setAttribute('d','M 2 3 L 8 13 L 12 18');
    board.drawingLayer.appendChild(path); board.drawingPaths.push(path);
    return board.captureBoardState();
  });
  const bounds=[];
  for(let index=0;index<30;index++){
    const sample=await page.evaluate(async i=>{
      const board=pickleboard;
      if(!board.plays.load(i%2?'dink-exchange':'third-shot-drive'))throw new Error('play did not load');
      if(!await board.threeD.enter())throw new Error('3D did not enter');
      const live={canvas:document.querySelectorAll('#threeDCanvas canvas').length,players:board.threeD.playerObjects.size,
        sceneChildren:board.threeD.scene.children.length,geometries:board.threeD.actorResources.geometries.size,materials:board.threeD.actorResources.materials.size};
      board.threeD.exit(); board.plays.exit();
      return {live,after:{canvas:document.querySelectorAll('#threeDCanvas canvas').length,players:board.threeD.playerObjects.size,
        active:board.threeD.active,hasRenderer:Boolean(board.threeD.renderer)},snapshot:board.captureBoardState()};
    },index);
    expect(sample.snapshot).toEqual(before);
    expect(sample.live.canvas).toBe(1); expect(sample.live.players).toBe(4);
    expect(sample.after).toEqual({canvas:0,players:0,active:false,hasRenderer:false});
    bounds.push(sample.live);
  }
  expect(new Set(bounds.map(item=>item.sceneChildren)).size).toBe(1);
  expect(new Set(bounds.map(item=>item.geometries)).size).toBe(1);
  expect(new Set(bounds.map(item=>item.materials)).size).toBe(1);
  expect(bounds[0].geometries).toBeGreaterThan(0);
  expect(bounds[0].materials).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('retained 3D compatibility API: fifty accelerated loop repetitions keep deterministic session time and bounded render work',async({page})=>{
  const errors=await openApp(page,'loops');
  const result=await page.evaluate(()=>{
    const engine=pickleboard.plays;
    engine.load('serve-and-return'); engine.setLoop(true);
    const session=engine.session,cycle=session.duration+session.holdSeconds,start=1000;
    session.play(start); session.tick(start+50*cycle*1000,1);
    engine.applyAtTime(session.clock.elapsed);
    return {iteration:session.iteration,elapsed:session.clock.elapsed,holding:session.holding,
      playing:session.clock.playing,duration:session.duration,stepIndex:engine.stepIndex,
      animationFrame:engine.animationFrame,advanceTimer:engine.advanceTimer};
  });
  expect(result).toMatchObject({iteration:50,elapsed:0,holding:false,playing:true,stepIndex:0});
  expect(result.animationFrame).toBe(null);
  expect(result.advanceTimer).toBe(null);
  expect(errors).toEqual([]);
});
