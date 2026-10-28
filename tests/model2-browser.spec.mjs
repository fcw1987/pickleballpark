import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';
import { openPlayFileMenu, settleBuilderStartup } from './helpers/builder-navigation.mjs';
import { installDimensionalAudit } from './helpers/dimensional-audit.mjs';

test.use({ serviceWorkers: 'block' });

async function openModel2(page, document) {
  await page.goto('/index.html');
  await settleBuilderStartup(page);
  await openPlayFileMenu(page);
  await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import or export play', exact: true });
  await dialog.getByRole('textbox', { name: 'JSON backup' }).fill(JSON.stringify(document));
  await dialog.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => playBuilder.document.modelVersion)).toBe(2);
  await page.evaluate(() => playBuilder.switchView('3d'));
  await page.waitForFunction(() => !playBuilder.busy && playBuilder.view === '3d' && pickleboard.threeD.worldAssetsReady);
}

test('model2 import, named export and Undo retain physical evidence and cannot install a legacy timeline', async ({ page }) => {
  const fixture = readModel2Fixture('nvz-momentum-after-dead');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await openModel2(page, fixture);
  const imported = await page.evaluate(() => structuredClone(playBuilder.document));
  expect({ ...imported, id: fixture.id }).toEqual(fixture);
  const installed = await page.evaluate(() => ({
    valid: playBuilder.compiled.validShotCount,
    errors: playBuilder.compiled.findings.filter(item => item.severity === 'error'),
    playModel: pickleboard.plays.activePlay.modelVersion,
    replayModel: pickleboard.threeD.currentPlay.modelVersion,
    version: pickleboard.threeD.timeline.play.physicsVersion,
    clocks: playBuilder.session === pickleboard.plays.session && playBuilder.session === pickleboard.threeD.session
  }));
  expect(installed).toEqual({ valid: fixture.shots.length, errors: [], playModel: 2, replayModel: 2, version: 'play-physics-v2', clocks: true });

  await openPlayFileMenu(page);
  const title = page.getByRole('textbox', { name: 'Play title', exact: true });
  await title.fill('Model 2 evidence survives a title edit');
  await title.press('Tab');
  await expect.poll(() => page.evaluate(() => playBuilder.document.title)).toBe('Model 2 evidence survives a title edit');
  await page.getByRole('button', { name: 'Undo authored edit', exact: true }).click();
  expect(await page.evaluate(() => playBuilder.document)).toEqual(imported);
  await openPlayFileMenu(page);
  await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import or export play', exact: true });
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export current play', exact: true }).click();
  const download = await downloadEvent;
  const text = await readFile(await download.path(), 'utf8');
  expect(download.suggestedFilename()).toContain('PickleballPark-');
  expect(JSON.parse(text)).toEqual(imported);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  const guards = await page.evaluate(async () => {
    const { compilePlayTimeline } = await import('/three-d-core.js');
    const { PICKLEBOARD_PLAYS } = await import('/play-catalog.js');
    const legacy = compilePlayTimeline(PICKLEBOARD_PLAYS[0]);
    const b = playBuilder, play = b.compiled.play, timeline = b.compiled.timeline;
    const otherSource = JSON.parse(JSON.stringify(play)); otherSource.id = 'a-different-model2-point';
    const otherOutcome = JSON.parse(JSON.stringify(play)); otherOutcome.outcome.winner = 'green';
    const mismatches = [legacy, { ...timeline, play: otherSource }, { ...timeline, modelVersion: 1 },
      { ...timeline, physicsVersion: 'another-physics-version' }, { ...timeline, play: otherOutcome }];
    b.seek(.25); b.play();
    const before = { document: JSON.stringify(b.document), guided: pickleboard.plays.activePlay, replay: pickleboard.threeD.currentPlay,
      playing: b.session.playing, time: b.session.clock.elapsed, view: b.view };
    const results = [];
    for (const candidate of mismatches) {
      for (const operation of [() => pickleboard.plays.loadDefinition(play, candidate), () => pickleboard.plays.replaceDefinition(play, 0, candidate), () => pickleboard.threeD.replaceDefinition(play, candidate)]) {
        try { operation(); results.push('accepted'); } catch (error) { results.push(error.message); }
      }
    }
    const proof = { results, documentUnchanged: JSON.stringify(b.document) === before.document,
      guidedUnchanged: pickleboard.plays.activePlay === before.guided,
      replayUnchanged: pickleboard.threeD.currentPlay === before.replay,
      playingBefore: before.playing, playingAfter: b.session.playing,
      sameTime: b.session.clock.elapsed === before.time, sameView: b.view === before.view };
    b.pause(); return proof;
  });
  expect(guards.results).toHaveLength(15);
  expect(guards.results.every(message => /model 2/i.test(message))).toBe(true);
  expect(guards).toMatchObject({ documentUnchanged: true, guidedUnchanged: true, replayUnchanged: true,
    playingBefore: true, playingAfter: true, sameTime: true, sameView: true });
  expect(errors).toEqual([]);
});

test('actual model2 terminal effects follow one playhead in both renderers through scrub and orbit', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await openModel2(page, readModel2Fixture('long'));
  for (const [id, type] of [['net', 'net-touch'], ['long', 'out'], ['second-bounce', 'second-bounce'], ['nvz-foot', 'fault']]) {
    const document = readModel2Fixture(id);
    const installed = await page.evaluate(async document => {
      const result = await playBuilder.action('import', JSON.stringify(document));
      return { result, valid: playBuilder.compiled.validShotCount, errors: playBuilder.compiled.findings.filter(item => item.severity === 'error') };
    }, document);
    expect(installed).toEqual({ result: { ok: true }, valid: document.shots.length, errors: [] });
    const time = await page.evaluate(type => {
      const event = playBuilder.compiled.timeline.events.find(event => event.type === type);
      if (!event) throw Error(`No ${type} event`);
      return Math.min(playBuilder.compiled.timeline.duration, event.time + .05);
    }, type);
    for (const view of ['2d', '3d']) {
      await page.evaluate(view => playBuilder.switchView(view), view);
      const before = await page.evaluate(({ time, view }) => {
        const b = playBuilder, v = pickleboard.threeD;
        b.seek(time);
        if (view === '2d') b.board.pixelRenderer.render(performance.now());
        else { v.setCamera('overhead'); v.renderSessionSample(); }
        const canvas = view === '2d' ? b.board.pixelRenderer.canvas : v.renderer.domElement;
        return { time: b.session.clock.elapsed, ball: { x: v.lastState.x, y: v.lastState.y, z: v.lastState.z },
          markers: view === '2d' ? b.board.pixelRenderer.getDiagnostics().terminalMarkers : v.getState().terminalMarkers,
          canvas: canvas.toDataURL(), document: JSON.stringify(b.document),
          sceneMarkers: view === '3d' ? v.scene.getObjectByName('Model2TerminalMarkers').children.map(child => ({ name: child.name, visible: child.visible, event: child.userData.event?.type })) : null };
      }, { time, view });
      expect(before.time).toBe(time);
      expect(before.markers.some(marker => marker.type === type)).toBe(true);
      if (view === '3d') expect(before.sceneMarkers.some(marker => marker.name === `TerminalMarker:${type}` && marker.visible)).toBe(true);
      if (view === '2d') {
        const drawn = await page.evaluate(type => {
          const renderer = pickleboard.pixelRenderer;
          const marker = renderer.getDiagnostics().terminalMarkers.find(marker => marker.type === type);
          const image = renderer.ctx.getImageData(Math.max(0, Math.round(marker.display.x) - 15), Math.max(0, Math.round(marker.display.y) - 17), 31, 35);
          let bright = 0, accent = 0;
          for (let i = 0; i < image.data.length; i += 4) {
            if (image.data[i] > 235 && image.data[i + 1] > 205 && image.data[i + 2] < 220) bright++;
            if (image.data[i] > 155 && image.data[i + 1] < 160 && image.data[i + 2] < 115) accent++;
          }
          return { bright, accent, type: renderer.canvas.dataset.terminalEvents };
        }, type);
        expect(drawn.type.split(',')).toContain(type);
        expect(drawn.bright + drawn.accent).toBeGreaterThan(0);
      }
      await page.screenshot({ path: testInfo.outputPath(`${id}-${view}.png`) });
      await page.evaluate(({ time, view }) => {
        const b = playBuilder;
        b.seek(0); b.seek(time);
        if (view === '2d') b.board.pixelRenderer.render(performance.now());
        else pickleboard.threeD.renderSessionSample();
      }, { time, view });
      if (view === '3d') {
        await page.evaluate(() => {
          const controls = pickleboard.threeD.cameraControls;
          controls.setState({ azimuth: controls.getState().azimuth + .3 });
          pickleboard.threeD.renderSessionSample();
        });
        expect(await page.evaluate(() => playBuilder.session.clock.elapsed)).toBe(time);
        await page.evaluate(() => { pickleboard.threeD.setCamera('overhead'); pickleboard.threeD.renderSessionSample(); });
      }
      const after = await page.evaluate(view => {
        const b = playBuilder, v = pickleboard.threeD;
        // WebGL's default drawing buffer is discarded after compositing. Read
        // the fresh frame in the same task, as for the first capture above.
        if (view === '3d') v.renderer.render(v.scene, v.camera);
        else b.board.pixelRenderer.render(performance.now());
        const canvas = view === '2d' ? b.board.pixelRenderer.canvas : v.renderer.domElement;
        return { time: b.session.clock.elapsed, ball: { x: v.lastState.x, y: v.lastState.y, z: v.lastState.z },
          markers: view === '2d' ? b.board.pixelRenderer.getDiagnostics().terminalMarkers : v.getState().terminalMarkers,
          canvas: canvas.toDataURL(), document: JSON.stringify(b.document) };
      }, view);
      const { sceneMarkers, canvas: beforeCanvas, ...expected } = before;
      const { canvas: afterCanvas, ...actual } = after;
      expect(actual).toEqual(expected);
      const digest = image => createHash('sha256').update(image).digest('hex');
      if (digest(beforeCanvas) !== digest(afterCanvas)) {
        for (const [name, data] of [['before', beforeCanvas], ['after', afterCanvas]]) {
          await testInfo.attach(`${id}-${view}-${name}.png`, { body: Buffer.from(data.split(',')[1], 'base64'), contentType: 'image/png' });
        }
      }
      expect(digest(afterCanvas), `${id}/${view} rendered pixels after scrub/orbit roundtrip`).toBe(digest(beforeCanvas));
    }
  }
  expect(errors).toEqual([]);
});

test('3D NVZ foot and momentum flags paint their full cue across camera angles at the physical fault anchor', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const pixelEvidence = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await openModel2(page, readModel2Fixture('nvz-foot'));
  let depthTestedOcclusions = 0;
  for (const id of ['nvz-foot', 'nvz-momentum-after-dead']) {
    const fixture = readModel2Fixture(id);
    expect(await page.evaluate(document => playBuilder.action('import', JSON.stringify(document)), fixture)).toEqual({ ok: true });
    for (const [label, azimuth] of [['front', 0], ['side', Math.PI / 2], ['back', Math.PI], ['other-side', Math.PI * 1.5]]) {
      const proof = await page.evaluate(async azimuth => {
        const THREE = await import('/vendor/three.module.min.js');
        const b = playBuilder, viewer = pickleboard.threeD;
        b.seek(b.session.duration);
        viewer.cameraControls.setState({ azimuth });
        viewer.renderSessionSample();
        const marker = viewer.scene.getObjectByName('TerminalMarker:fault');
        const sprite = marker.children[0], renderer = viewer.renderer, camera = viewer.camera;
        const gl = renderer.getContext(), width = renderer.domElement.width, height = renderer.domElement.height;
        const pixels = scene => {
          renderer.render(scene, camera);
          const data = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
          return data;
        };
        const actual = pixels(viewer.scene);
        marker.visible = false;
        const absent = pixels(viewer.scene);
        marker.visible = true;
        const originalDepthTest = sprite.material.depthTest;
        sprite.material.depthTest = true;
        const depthTested = pixels(viewer.scene);
        sprite.material.depthTest = originalDepthTest;
        // Render only the same anchored flag into the same camera/buffer. Its
        // opaque palette texels form an independent expected pixel mask. A
        // scene object's visible flag cannot establish that it was painted.
        const isolatedScene = new THREE.Scene();
        const isolated = marker.clone(true);
        isolated.traverse(object => { if (object.isSprite) object.material = object.material.clone(); });
        isolatedScene.add(isolated);
        const expected = pixels(isolatedScene);
        const palette = [[38, 52, 73], [231, 139, 84], [255, 247, 207]];
        const counts = { mask: 0, actualMismatch: 0, absentMismatch: 0, depthTestedMismatch: 0, accent: 0, symbol: 0 };
        const equals = (data, index, color) => color.every((value, axis) => Math.abs(data[index + axis] - value) <= 1);
        for (let index = 0; index < expected.length; index += 4) {
          const colorIndex = palette.findIndex(color => equals(expected, index, color));
          if (colorIndex < 0) continue;
          const color = palette[colorIndex];
          counts.mask++;
          if (colorIndex === 1) counts.accent++;
          if (colorIndex === 2) counts.symbol++;
          if (!equals(actual, index, color)) counts.actualMismatch++;
          if (!equals(absent, index, color)) counts.absentMismatch++;
          if (!equals(depthTested, index, color)) counts.depthTestedMismatch++;
        }
        isolated.traverse(object => { if (object.isSprite) object.material.dispose(); });
        pixels(viewer.scene);
        return { counts, anchor: marker.position.toArray(), evidence: marker.userData.event.position,
          source: JSON.stringify(b.document), time: b.session.clock.elapsed, duration: b.session.duration };
      }, azimuth);
      expect(proof.counts.mask, `${id}/${label} flag mask must be on screen`).toBeGreaterThan(4);
      expect(proof.counts.accent, `${id}/${label} orange flag paint`).toBeGreaterThan(0);
      expect(proof.counts.symbol, `${id}/${label} exclamation paint`).toBeGreaterThan(0);
      expect(proof.counts.actualMismatch, `${id}/${label} every opaque cue pixel must survive actor occlusion`).toBe(0);
      expect(proof.counts.absentMismatch, `${id}/${label} hiding the cue must remove actual painted pixels`).toBeGreaterThan(0);
      depthTestedOcclusions += proof.counts.depthTestedMismatch;
      const at = fixture.outcome.evidence.position;
      const physicalAnchor = [(at.x - 10) * .3048, at.heightFeet * .3048, (at.y - 22) * .3048];
      expect(proof.anchor).toEqual(physicalAnchor);
      expect(proof.evidence).toEqual({ x: physicalAnchor[0], y: physicalAnchor[1], z: physicalAnchor[2] });
      expect(proof.time).toBe(proof.duration);
      expect(JSON.parse(proof.source).outcome).toEqual(fixture.outcome);
      pixelEvidence.push({ id, angle: label, ...proof.counts, anchor: proof.anchor, evidence: proof.evidence });
      await page.screenshot({ path: testInfo.outputPath(`${id}-visible-flag-${label}.png`) });
    }
  }
  expect(depthTestedOcclusions, 'the former depth-tested setting must reproduce real actor occlusion').toBeGreaterThan(0);
  const evidencePath = testInfo.outputPath('nvz-cue-pixel-proof.json');
  await writeFile(evidencePath, JSON.stringify(pixelEvidence, null, 2));
  await testInfo.attach('nvz-cue-pixel-proof', { path: evidencePath, contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('momentum feet reach the recorded global time in both actual views and reverse scrubbing restores the same pose', async ({ page }, testInfo) => {
  const fixture = readModel2Fixture('earlier-momentum-overrides-later-fault');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await openModel2(page, fixture);
  await installDimensionalAudit(page);
  const contactTime = await page.evaluate(() => playBuilder.compiled.timeline.events.find(event => event.type === 'contact' && event.rallyLeg === 1).time);
  const evidence = fixture.shots[0].contactEvidence, momentum = evidence.momentum;
  for (const [view, azimuth, orientation] of [['2d', 0, '2d'], ['3d', 0, 'front'], ['3d', Math.PI / 2, 'side'], ['3d', Math.PI, 'back'], ['3d', Math.PI * 1.5, 'other-side']]) {
    await page.evaluate(view => playBuilder.switchView(view), view);
    await page.evaluate(azimuth => { pickleboard.threeD.cameraControls.setState({ azimuth }); }, azimuth);
    const seen = new Map();
    for (const fraction of [0, .25, .6, .99, 1, .99, .6, .25, 0]) {
      const time = contactTime + momentum.afterContactSeconds * fraction;
      const rendered = await page.evaluate(({ time, view }) => {
        const b = playBuilder, v = pickleboard.threeD;
        b.seek(time);
        const pixel = b.board.pixelRenderer;
        const sampleShoes = () => pixel.getDiagnostics().actors.player1.rasterFeet.map(foot => {
          const pixels = pixel.ctx.getImageData(Math.round(foot.x) - 2, Math.round(foot.y) - 2, 5, 4).data;
          let count = 0;
          for (let index = 0; index < pixels.length; index += 4) if (pixels[index] === 241 && pixels[index + 1] === 237 && pixels[index + 2] === 206 && pixels[index + 3]) count++;
          return count;
        });
        // The terminal flag intentionally covers the faulting foot. Audit the
        // actual actor pass before that overlay, then retain the full frame
        // and independently verify the flag's final paint below.
        let paintedBeforeMarkers;
        const drawMarkers = pixel.drawTerminalMarkers;
        if (view === '2d') pixel.drawTerminalMarkers = function (...args) {
          paintedBeforeMarkers = sampleShoes();
          return drawMarkers.apply(this, args);
        };
        try { pixel.render(performance.now()); }
        finally { pixel.drawTerminalMarkers = drawMarkers; }
        const paintedAfterMarkers = view === '2d' ? sampleShoes() : null;
        const faultPolePixels = view === '2d' ? pixel.getDiagnostics().actors.player1.rasterFeet.map(foot =>
          Array.from(pixel.ctx.getImageData(Math.round(foot.x) - 1, Math.round(foot.y) - 1, 2, 1).data)) : null;
        v.renderSessionSample();
        const actor = v.playerObjects.get('player1');
        // Independent source alpha -> atlas UV -> actual rendered triangle
        // audit. A root or planned target cannot stand in for painted soles.
        const worldFeet = window.__athleteAudit(actor).paintedSoles.map(points => points[0].map((_, axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length)).sort((a, b) => a[0] - b[0]);
        const pixelFeet = Object.values(b.board.pixelSamples.player1.footTargets).map(p => [p.x, p.y, p.z]).sort((a, b) => a[0] - b[0]);
        const rasterFeet = view === '2d' ? pixel.getDiagnostics().actors.player1.rasterFeet : null;
        const canvas = view === '2d' ? pixel.canvas : v.renderer.domElement;
        return { time: b.session.clock.elapsed, token: { x: b.board.tokens.player1.x, y: b.board.tokens.player1.y },
          world: actor.position.toArray(), worldFeet, pixelFeet, rasterFeet, pixelGround: view === '2d' ? pixel.getDiagnostics().actors.player1.ground : null,
          viewBox: view === '2d' ? pixel.getDiagnostics().viewBox : null, markers: view === '2d' ? pixel.getDiagnostics().terminalMarkers : v.getState().terminalMarkers,
          paintedBeforeMarkers, paintedAfterMarkers, faultPolePixels,
          canvas: canvas.toDataURL(), clockShared: b.session === b.board.plays.session && b.session === v.session };
      }, { time, view });
      expect(rendered.time).toBe(time);
      expect(rendered.clockShared).toBe(true);
      const expectedFeet = evidence.feet.map((from, index) => ({
        x: from.x + (momentum.feet[index].x - from.x) * fraction,
        y: from.y + (momentum.feet[index].y - from.y) * fraction
      })).sort((a, b) => a.x - b.x);
      const expected = { x: (expectedFeet[0].x + expectedFeet[1].x) / 2, y: (expectedFeet[0].y + expectedFeet[1].y) / 2 };
      expect(rendered.token.x).toBeCloseTo(expected.x, 8);
      expect(rendered.token.y).toBeCloseTo(expected.y, 8);
      expect(rendered.world[0] / .3048 + 10).toBeCloseTo(expected.x, 8);
      expect(rendered.world[2] / .3048 + 22).toBeCloseTo(expected.y, 8);
      if (view === '2d') {
        expect(rendered.pixelGround.x).toBeCloseTo((expected.x - rendered.viewBox.x) * 4, 8);
        expect(rendered.pixelGround.y).toBeCloseTo((expected.y - rendered.viewBox.y) * 4, 8);
      }
      for (const feet of [rendered.worldFeet, rendered.pixelFeet]) {
        for (let index = 0; index < 2; index++) {
          const world = [(expectedFeet[index].x - 10) * .3048, 0, (expectedFeet[index].y - 22) * .3048];
          expect(Math.hypot(...feet[index].map((coordinate, axis) => coordinate - world[axis]))).toBeLessThan(1e-6);
        }
      }
      if (view === '2d') {
        expect(rendered.rasterFeet).toHaveLength(2);
        const rasterFeet = [...rendered.rasterFeet].sort((a, b) => a.x - b.x);
        for (let index = 0; index < 2; index++) {
          expect(Math.abs(rasterFeet[index].x - (expectedFeet[index].x - rendered.viewBox.x) * 4)).toBeLessThanOrEqual(.500001);
          expect(Math.abs(rasterFeet[index].y - (expectedFeet[index].y - rendered.viewBox.y) * 4)).toBeLessThanOrEqual(.500001);
        }
        expect(rendered.paintedBeforeMarkers.every(count => count > 0)).toBe(true);
        for (let index = 0; index < rendered.rasterFeet.length; index++) {
          if (rendered.paintedAfterMarkers[index] > 0) continue;
          const foot = rendered.rasterFeet[index];
          const flag = rendered.markers.find(marker => marker.type === 'fault' &&
            Math.round(marker.display.x) === foot.x && Math.round(marker.display.y) === foot.y);
          expect(flag, 'only the actual fault flag may hide the painted shoe').toBeDefined();
          expect(rendered.faultPolePixels[index]).toEqual([38, 52, 73, 255, 38, 52, 73, 255]);
        }
      }
      if (fraction < 1) expect(rendered.token.y).toBeLessThan(15);
      else expect(rendered.token.y).toBeCloseTo(15, 8);
      const { canvas, ...geometry } = rendered;
      const hash = createHash('sha256').update(canvas).digest('hex');
      if (seen.has(fraction)) {
        expect(geometry).toEqual(seen.get(fraction).geometry);
        expect(hash, `${orientation} momentum ${fraction} reverse pixels`).toBe(seen.get(fraction).hash);
      } else {
        seen.set(fraction, { geometry, hash });
        if (fraction === .6 || fraction === 1) await page.screenshot({ path: testInfo.outputPath(`momentum-${orientation}-${fraction}.png`) });
      }
    }
  }
  expect(errors).toEqual([]);
});
