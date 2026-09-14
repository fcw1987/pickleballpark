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
            actor.position.toArray().forEach((value, axis) => close(value, before.position[axis], `${id}: camera position`));
            if (JSON.stringify(actor.userData.animation.bodyFacing) !== JSON.stringify(before.facing))
              failures.push({ label: `${id}: camera changed tactical facing` });
          }
        }
        await b.switchView('2d');
        b.seek(time);
        close(b.board.tokens.ball.x, (ball[0] / .3048) + 10, '2D/3D ball x');
        close(b.board.tokens.ball.y, (ball[2] / .3048) + 22, '2D/3D ball y');
        for (const [id, state] of Object.entries(tactical)) {
          close(b.board.tokens[id].x, (state.position[0] / .3048) + 10, `${id}: 2D/3D x`);
          close(b.board.tokens[id].y, (state.position[2] / .3048) + 22, `${id}: 2D/3D y`);
          worldComparisons++;
        }
        await b.switchView('3d');
        b.seek(time);
        viewer.ballObject.position.toArray().forEach((value, axis) => close(value, ball[axis], 'seek history independence'));
      }
      b.pause(); viewer.setCamera('overhead');
      return { invalid: false, failures, contacts, worldComparisons,
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
      expect(result.historyPreserved).toBe(true);
      expect(result.live).toBe(true);
      expect(result.canvases).toBe(1);
    }
    expect(errors).toEqual([]);
  });
}
