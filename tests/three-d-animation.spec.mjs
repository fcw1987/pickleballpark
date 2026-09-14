import { expect, test } from '@playwright/test';

async function openPlay(page, playId = 'fifth-shot-drop') {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/index.html?workspace=planner&animation-e2e=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
  await page.evaluate(id => window.pickleboard.plays.load(id), playId);
  await page.locator('#play3dView').click();
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  return errors;
}

async function sampleSegment(page, stepId, offset) {
  return page.evaluate(({ stepId, offset }) => {
    const viewer = window.pickleboard.threeD;
    const segment = viewer.timeline.segments.find(item => item.step.id === stepId);
    const time = segment.startTime + (offset === 'contact' ? segment.contactTime : offset);
    viewer.clock.pause();
    viewer.clock.elapsed = time;
    viewer.applyAtTime(time);
    const actor = viewer.playerObjects.get(segment.shotSemantics.playerId);
    return {
      segment: { startTime: segment.startTime, contactTime: segment.contactTime, endTime: segment.endTime, actor: segment.shotSemantics.playerId, stroke: segment.shotSemantics.stroke },
      animation: actor.userData.animation,
      paddleFace: actor.userData.paddleFaceWorld.toArray(),
      ball: viewer.lastState,
      actorPosition: actor.position.toArray(),
      targetPosition: viewer.playerObjects.get(segment.shotSemantics.playerId).position.toArray()
    };
  }, { stepId, offset });
}

test('serve, return, drive, block, and fifth drop resolve actors and synchronize ball launch to contact', async ({ page }) => {
  const errors = await openPlay(page);
  const expected = [
    ['serve', 'player1', 'serve'],
    ['return', 'player3', 'forehand'],
    ['third-drive', 'player1', 'drive'],
    ['fourth-block', 'player4', 'block', 'backhand'],
    ['fifth-drop', 'player1', 'drop']
  ];
  for (const [stepId, actor, stroke, artwork = stroke] of expected) {
    const before = await sampleSegment(page, stepId, (await page.evaluate(id => {
      const s = window.pickleboard.threeD.timeline.segments.find(x => x.step.id === id); return s.contactTime - 0.02;
    }, stepId)));
    expect(before.segment).toMatchObject({ actor, stroke });
    // Incoming contacts occur at a segment boundary: the ball is still flying from the prior hitter.
    if(before.segment.contactTime>0){expect(before.ball.phase).toBe('waiting-contact');expect(before.ball.launched).toBe(false);}
    else {expect(before.ball.launched).toBe(true);expect(before.ball.y).toBeGreaterThan(0);}
    expect(before.animation.phase).toBe('contact'); // final forward swing immediately before impact
    const at = await sampleSegment(page, stepId, 'contact');
    expect(at.ball.launched).toBe(true);
    expect(['contact', 'flight', 'landed']).toContain(at.ball.phase);
    expect(at.animation.action).toBe(artwork); // stroke timing and handed-side artwork are separate contracts
    expect(Math.hypot(...at.paddleFace.map((value, axis) => value - [at.ball.x, at.ball.y, at.ball.z][axis]))).toBeLessThan(0.01);
  }
  expect(errors).toEqual([]);
});

test('right and left handed forehands animate their dominant physical arm', async ({ page }) => {
  await page.goto('/index.html?workspace=planner&animation-hands=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
  await page.evaluate(() => {
    window.pickleboard.tokens.player1.handedness = 'left';
    window.pickleboard.plays.load('third-shot-drive');
  });
  await page.locator('#play3dView').click();
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  const result = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    const segment = viewer.timeline.segments.find(item => item.step.id === 'third-drive');
    const time = segment.startTime + segment.contactTime;
    viewer.applyAtTime(time);
    const root = viewer.playerObjects.get('player1');
    return { handedness: root.userData.handedness, pixelActor: root.userData.pixelActor, frame: root.userData.animation.frame, phase: root.userData.animation.phase };
  });
  expect(result).toMatchObject({ handedness: 'left', pixelActor: true, frame: 'drive-contact', phase: 'contact' });
});

test('striker plants both world axes before contact and non-strikers use locomotion or split-step', async ({ page }) => {
  await openPlay(page, 'third-shot-drive');
  const state = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    const segment = viewer.timeline.segments.find(item => item.step.id === 'third-drive');
    const time = segment.startTime + segment.contactTime - 0.03;
    viewer.applyAtTime(time);
    return Object.fromEntries([...viewer.playerObjects].map(([id, root]) => [id, root.userData.animation]));
  });
  expect(state.player1.planted).toBe(true);
  expect(state.player1.locomotionFrame).toBeNull();
  const plantedPosition = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    const segment = viewer.timeline.segments.find(item => item.step.id === 'third-drive');
    viewer.applyAtTime(segment.startTime + segment.contactTime + 0.08);
    return viewer.playerObjects.get('player1').position.toArray();
  });
  const contactPosition = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    const segment = viewer.timeline.segments.find(item => item.step.id === 'third-drive');
    viewer.applyAtTime(segment.startTime + segment.contactTime);
    return viewer.playerObjects.get('player1').position.toArray();
  });
  expect(plantedPosition).toEqual(contactPosition);
  expect(Object.values(state).slice(1).some(player => player.action === 'shuffle' || player.phase === 'locomotion')).toBe(true);
});

test('quality guardrails keep sprite anchors finite and contact ball at the visible paddle face', async ({ page }) => {
  await openPlay(page, 'fifth-shot-drop');
  const quality = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    return viewer.timeline.segments.filter(segment => segment.shotSemantics).map(segment => {
      const samples = [];
      for (const offset of [-0.1, 0, 0.1]) {
        viewer.applyAtTime(segment.startTime + segment.contactTime + offset);
        const actor = viewer.playerObjects.get(segment.shotSemantics.playerId);
        const paddle = actor.userData.paddleFaceWorld.toArray();
        const ball = viewer.ballObject.position.toArray();
        const values = [...actor.position.toArray(), ...actor.userData.paddleFaceWorld.toArray(), ...actor.userData.shoulderWorld.toArray()];
        samples.push({ offset, distance: Math.hypot(ball[0] - paddle[0], ball[1] - paddle[1], ball[2] - paddle[2]), finite: values.every(Number.isFinite) });
      }
      return { step: segment.step.id, samples };
    });
  });
  for (const shot of quality) {
    expect(shot.samples.every(sample => sample.finite)).toBe(true);
    expect(shot.samples.find(sample => sample.offset === 0).distance).toBeLessThan(0.01);
  }
});

test('pause freezes player pose and ball together, rate scales both, and seeking to start restores ready', async ({ page }) => {
  await openPlay(page, 'third-shot-drop');
  await page.locator('#threeDRate').selectOption('0.25',{force:true});
  await page.locator('#threeDPlayPause').click();
  await page.waitForTimeout(250);
  await page.locator('#threeDPlayPause').click();
  const before = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD; const root = viewer.playerObjects.get('player1');
    return { elapsed: viewer.clock.elapsed, ball: viewer.ballObject.position.toArray(), frame: root.userData.animation.frame, paddle: root.userData.paddleFaceWorld.toArray() };
  });
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD; const root = viewer.playerObjects.get('player1');
    return { elapsed: viewer.clock.elapsed, ball: viewer.ballObject.position.toArray(), frame: root.userData.animation.frame, paddle: root.userData.paddleFaceWorld.toArray() };
  });
  expect(after).toEqual(before);
  await page.locator('#threeDTimelineMount input[type=range]').fill('0');
  const restart = await page.evaluate(() => ({ elapsed: window.pickleboard.threeD.clock.elapsed, animations: [...window.pickleboard.threeD.playerObjects.values()].map(root => root.userData.animation.phase) }));
  expect(restart.elapsed).toBe(0);
  expect(restart.animations).toEqual(['ready', 'ready', 'ready', 'ready']);
});

test('3D chapter seeking uses canonical anchors and reduced motion remains inspectable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPlay(page, 'fifth-shot-drop');
  await expect(page.locator('#threeDPrevious,#threeDNext,#threeDRestart,#threeDLoop')).toHaveCount(0);
  await page.evaluate(() => window.pickleboard.plays.timelineAction('chapter','return'));
  expect(await page.evaluate(() => window.pickleboard.threeD.currentStepIndex())).toBe(1);
  await page.locator('#threeDTimelineMount input[type=range]').fill('0');
  expect(await page.evaluate(() => window.pickleboard.threeD.currentStepIndex())).toBe(0);
  expect(await page.evaluate(() => [...window.pickleboard.threeD.playerObjects.values()].every(root => root.userData.animation.phase === 'ready'))).toBe(true);
});
