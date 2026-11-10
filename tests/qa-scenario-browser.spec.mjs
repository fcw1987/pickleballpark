import { expect, test } from '@playwright/test';
import { QA_SCENARIOS } from './fixtures/qa-scenarios.mjs';
import { installReferenceRigContract } from './helpers/reference-rig-browser-contract.mjs';

for (const scenario of QA_SCENARIOS) {
  test(`catalog ${scenario.id}: real view contacts, camera independence and source safety`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?qa-scenario-browser=1');
    await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
    await installReferenceRigContract(page);
    const result = await page.evaluate(async ({ document: source, expected }) => {
      const { sampleActorWorldPosition, sampleActorPresentation } = await import('./three-d-presentation.js');
      const { samplePlayState } = await import('./three-d-core.js');
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
      let overheadProfileSamples = 0;
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
          position: actor.position.toArray(), facing: actor.userData.animation.bodyFacing,
          orientation: actor.userData.visual.quaternion.toArray(),
          vertices: Array.from(actor.userData.bodyBatch.batch.geometry.attributes.position.array),
          paddleMatrix: actor.userData.paddle.matrixWorld.toArray()
        }]));
        // Accepted stroke source 041f285 opts 3D into instructional approach
        // and recovery, while retaining the frozen canonical 2D movement.
        // Assert each renderer's exact route instead of equating those routes.
        for (const [id, state] of Object.entries(tactical)) {
          const position = sampleActorWorldPosition(segment, id, segment.contactTime, source.players[id].handedness, true);
          const presentation = sampleActorPresentation({ instructionalMovement: true, segment, timeline: viewer.timeline, seconds: time, playerId: id, localTime: segment.contactTime, cameraPosition: viewer.camera.position, cameraTarget: viewer.cameraTarget, handedness: source.players[id].handedness });
          const jump = window.__referenceRigContract.expectedJump(presentation);
          [position.x, position.y + jump, position.z].forEach((value, axis) => close(state.position[axis], value, `${id}: instructional 3D axis ${axis}`));
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
            // Camera orbit must reveal different sides of the same solid actor,
            // never select/mirror a card or change the actual articulated pose.
            const data = actor.userData;
            const alignment = window.__referenceRigContract.cameraAlignment(actor, viewer.camera);
            for (const property of ['forwardError', 'headingError', 'rollError']) close(alignment[property], 0, `${id}: ${camera} ${property}`, 1e-6);
            close(alignment.elevation, alignment.expectedElevation, `${id}: ${camera} upright body`, 1e-6);
            const actualFacing = sampleActorPresentation({instructionalMovement:true, segment, timeline:viewer.timeline, seconds:time, playerId:id, localTime:segment.contactTime, cameraPosition:viewer.camera.position, cameraTarget:viewer.cameraTarget, handedness:source.players[id].handedness}).bodyFacing;
            close(data.animation.bodyFacing.x, actualFacing.x, `${id}: actual tactical facing x`);
            close(data.animation.bodyFacing.z, actualFacing.z, `${id}: actual tactical facing z`);
            if (!data.volumetric || !data.bodyBatch.batch.visible || data.bodyBatch.batch.material.map)
              failures.push({label: `${id}: expected visible untextured volumetric body batch`});
            if (![data.visual, data.bodyBatch.batch].every(object => object.scale.toArray().every(value => value > 0)))
              failures.push({label: `${id}: camera must not mirror solid geometry`});
            data.visual.quaternion.toArray().forEach((value, axis) => close(value, before.orientation[axis], `${id}: camera-independent body orientation`, 1e-6));
            const vertices = data.bodyBatch.batch.geometry.attributes.position.array;
            if (vertices.length !== before.vertices.length) failures.push({label: `${id}: camera changed body topology`});
            else for (let vertex = 0; vertex < vertices.length; vertex++) close(vertices[vertex], before.vertices[vertex], `${id}: camera-independent body vertex ${vertex}`, 1e-6);
            data.paddle.matrixWorld.toArray().forEach((value, axis) => close(value, before.paddleMatrix[axis], `${id}: camera-independent visible paddle`, 1e-6));
            actor.position.toArray().forEach((value, axis) => close(value, before.position[axis], `${id}: camera position`));
            if (JSON.stringify(actor.userData.animation.bodyFacing) !== JSON.stringify(before.facing))
              failures.push({ label: `${id}: camera changed tactical facing` });
          }
        }
        // The overhead leaves the court only during its stroke, peaking at
        // contact and landing by recovery. Inspect actual roots throughout that
        // profile, deriving the height from presentation inputs, never rig metadata.
        const strikerId = segment.shotSemantics.playerId, handedness = source.players[strikerId].handedness;
        const atContact = sampleActorPresentation({ instructionalMovement: true, segment, timeline: viewer.timeline, seconds: time, playerId: strikerId, localTime: segment.contactTime, cameraPosition: viewer.camera.position, cameraTarget: viewer.cameraTarget, handedness });
        if (window.__referenceRigContract.expectedJump(atContact) > 0) {
          const profile = segment.shotSemantics.profile;
          for (const ratio of [0, profile.contactRatio / 2, profile.contactRatio, (profile.contactRatio + profile.recoverRatio) / 2, profile.recoverRatio, (profile.recoverRatio + 1) / 2, 1]) {
            const seconds = time + profile.duration * (ratio - profile.contactRatio);
            if (seconds < 0 || seconds > viewer.timeline.duration) continue;
            b.seek(seconds);
            // Preparation can belong to the preceding flight segment. Resolve
            // the timeline sample so the check spans the actual contact boundary.
            const activeSegment = samplePlayState(viewer.timeline, seconds).segment;
            const localTime = Math.max(0, Math.min(activeSegment.duration, seconds - activeSegment.startTime));
            const sample = sampleActorPresentation({ instructionalMovement: true, segment: activeSegment, timeline: viewer.timeline, seconds, playerId: strikerId, localTime, cameraPosition: viewer.camera.position, cameraTarget: viewer.cameraTarget, handedness });
            const jump = window.__referenceRigContract.expectedJump(sample), position = viewer.playerObjects.get(strikerId).position;
            close(position.x, sample.worldPosition.x, `${strikerId}: overhead profile tactical x`);
            close(position.z, sample.worldPosition.z, `${strikerId}: overhead profile tactical z`);
            close(position.y, sample.worldPosition.y + jump, `${strikerId}: overhead profile y`);
            overheadProfileSamples++;
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
      return { invalid: false, failures, contacts, worldComparisons, instructionalComparisons, overheadProfileSamples,
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
      expect(result.overheadProfileSamples).toBe(scenario.document.shots.filter(shot => shot.family === 'overhead').length * 7);
      expect(result.historyPreserved).toBe(true);
      expect(result.live).toBe(true);
      expect(result.canvases).toBe(1);
    }
    expect(errors).toEqual([]);
  });
}
