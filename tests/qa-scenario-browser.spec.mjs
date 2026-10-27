import { expect, test } from '@playwright/test';
import { QA_SCENARIOS } from './fixtures/qa-scenarios.mjs';

for (const scenario of QA_SCENARIOS) {
  test(`catalog ${scenario.id}: real view contacts, camera independence and source safety`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?qa-scenario-browser=1');
    await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
    const result = await page.evaluate(async ({ document: source, expected }) => {
      const { sampleActorWorldPosition, sampleActorPresentation } = await import('./three-d-presentation.js');
      const b = playBuilder;
      b.loadDocument(source);
      if (b.view !== '3d') await b.switchView('3d');
      const initial = JSON.stringify(b.document);
      const history = JSON.stringify(b.history);
      const viewer = b.board.threeD;
      const segments = b.compiled.timeline.segments.filter(segment => segment.shotSemantics);
      const failures = [];
      let contacts = 0;
      let worldComparisons = 0;
      let instructionalComparisons = 0;
      const close = (left, right, label, tolerance = 1e-7) => {
        if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) > tolerance)
          failures.push({ label, left, right });
      };
      if ((expected.validShotCount ?? source.shots.length) < source.shots.length) {
        b.play();
        return { invalid: true, playing: b.session.playing, message: b.message,
          sourcePreserved: initial === JSON.stringify(b.document), failures, contacts, worldComparisons };
      }
      for (const segment of segments) {
        const time = segment.startTime + segment.contactTime;
        b.seek(time);
        const actor = viewer.playerObjects.get(segment.shotSemantics.playerId);
        const ball = viewer.ballObject.position.toArray();
        const paddle = actor.userData.paddleFaceWorld.toArray();
        const distance = Math.hypot(...paddle.map((value, axis) => value - ball[axis]));
        if (distance >= .01) failures.push({ label: `${segment.step.id}: paddle contact`, distance });
        if (actor.userData.handedness !== source.players[segment.shotSemantics.playerId].handedness)
          failures.push({ label: `${segment.step.id}: handedness` });
        contacts++;
        const tactical = Object.fromEntries([...viewer.playerObjects].map(([id, actor]) => [id, {
          position: actor.position.toArray(), facing: actor.userData.animation.bodyFacing
        }]));
        // Accepted stroke source 041f285 opts 3D into instructional approach
        // and recovery, while retaining the frozen canonical 2D movement.
        // Assert each renderer's exact route instead of equating those routes.
        for (const [id, state] of Object.entries(tactical)) {
          const position = sampleActorWorldPosition(segment, id, segment.contactTime, source.players[id].handedness, true);
          [position.x, position.y, position.z].forEach((value, axis) => close(state.position[axis], value, `${id}: instructional 3D axis ${axis}`));
          instructionalComparisons++;
        }
        for (const camera of ['overhead', 'sideline', 'behind-green', 'behind-orange']) {
          if (!viewer.setCamera(camera)) throw Error(`Camera unavailable: ${camera}`);
          viewer.applyAtTime(time);
          const cameraContact = actor.userData.paddleFaceWorld.toArray();
          const cameraDistance = Math.hypot(...cameraContact.map((value, axis) => value - ball[axis]));
          if (cameraDistance >= .01) failures.push({ label: `${camera}: paddle contact`, distance: cameraDistance });
          for (const [id, actor] of viewer.playerObjects) {
            const before = tactical[id];
            if (!before.facing || ![before.facing.x, before.facing.z].every(Number.isFinite))
              throw Error(`${id}: missing tactical facing sample`);
            // Derive the eight-view choice from tactical facing and the camera basis,
            // then inspect the actual atlas transform and mirrored body scale.
            const dx = viewer.camera.position.x - viewer.cameraTarget.x;
            const dz = viewer.camera.position.z - viewer.cameraTarget.z;
            const sector = (Math.round(Math.atan2(before.facing.x * dz - before.facing.z * dx,
              before.facing.x * dx + before.facing.z * dz) / (Math.PI / 4)) + 8) % 8;
            const [frame, mirror] = [[0,1],[1,1],[2,1],[3,1],[3,1],[3,-1],[2,-1],[1,-1]][sector];
            const data = actor.userData, map = data.body.material.map;
            const actualFacing = sampleActorPresentation({instructionalMovement:true, segment, timeline:viewer.timeline, seconds:time, playerId:id, localTime:segment.contactTime, cameraPosition:viewer.camera.position, cameraTarget:viewer.cameraTarget, handedness:source.players[id].handedness}).bodyFacing;
            close(data.animation.bodyFacing.x, actualFacing.x, `${id}: actual tactical facing x`);
            close(data.animation.bodyFacing.z, actualFacing.z, `${id}: actual tactical facing z`);
            const directions = ['front','front-right','right','back-right','back','back-left','left','front-left'];
            if(data.animation.viewDirection !== directions[sector] || data.animation.frame !== frame || data.animation.mirror !== mirror) failures.push({label:`${id}: rendered direction metadata disagrees with camera sector`});
            const [x,y,w,h] = data.resources.assets.metadata.frames[data.player][frame].rect;
            const image = map.image;
            close(map.offset.x, x / image.width, `${id}: rendered atlas x`);
            close(map.offset.y, 1 - (y+h) / image.height, `${id}: rendered atlas y`);
            close(map.repeat.x, w / image.width, `${id}: rendered atlas width`);
            close(map.repeat.y, h / image.height, `${id}: rendered atlas height`);
            if (Math.sign(data.body.scale.x) !== mirror) failures.push({label: `${id}: rendered atlas mirror`});
            actor.position.toArray().forEach((value, axis) => close(value, before.position[axis], `${id}: camera position`));
            if (JSON.stringify(actor.userData.animation.bodyFacing) !== JSON.stringify(before.facing))
              failures.push({ label: `${id}: camera changed tactical facing` });
          }
        }
        await b.switchView('2d');
        b.seek(time);
        close(b.board.tokens.ball.x, (ball[0] / .3048) + 10, '2D/3D ball x');
        close(b.board.tokens.ball.y, (ball[2] / .3048) + 22, '2D/3D ball y');
        for (const id of Object.keys(tactical)) {
          const position = sampleActorWorldPosition(segment, id, segment.contactTime, source.players[id].handedness, false);
          close(b.board.tokens[id].x, (position.x / .3048) + 10, `${id}: canonical 2D x`);
          close(b.board.tokens[id].y, (position.z / .3048) + 22, `${id}: canonical 2D y`);
          worldComparisons++;
        }
        await b.switchView('3d');
        b.seek(time);
        viewer.ballObject.position.toArray().forEach((value, axis) => close(value, ball[axis], 'seek history independence'));
      }
      b.pause(); viewer.setCamera('overhead');
      return { invalid: false, failures, contacts, worldComparisons, instructionalComparisons,
        sourcePreserved: initial === JSON.stringify(b.document), historyPreserved: history === JSON.stringify(b.history),
        live: viewer.active && !viewer.renderer.getContext().isContextLost(),
        canvases: document.querySelectorAll('#threeDViewer canvas').length };
    }, scenario);
    expect(result.sourcePreserved).toBe(true);
    expect(result.failures).toEqual([]);
    if (result.invalid) {
      expect(result.playing).toBe(false);
      expect(result.message).toMatch(/not valid|correct/i);
    } else {
      expect(result.contacts).toBe(scenario.document.shots.length);
      expect(result.worldComparisons).toBe(result.contacts * 4);
      expect(result.instructionalComparisons).toBe(result.contacts * 4);
      expect(result.historyPreserved).toBe(true);
      expect(result.live).toBe(true);
      expect(result.canvases).toBe(1);
    }
    expect(errors).toEqual([]);
  });
}
