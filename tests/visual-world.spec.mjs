// Legacy 3D compatibility coverage enters through the retained API; public UI defaults to pixel Canvas2D.
import { expect, test } from '@playwright/test';
import { fitCameraPreset } from '../three-d-core.js';
import { installDimensionalAudit } from './helpers/dimensional-audit.mjs';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';

test('legacy 3D compatibility: camera fitting expands narrow views without changing preset sight lines', () => {
  const desktop = fitCameraPreset('sideline', 16 / 9, 0.12);
  const portrait = fitCameraPreset('sideline', 390 / 1060, 0.22);
  expect(desktop.position.every(Number.isFinite)).toBe(true);
  expect(portrait.position.every(Number.isFinite)).toBe(true);
  expect(desktop.distanceScale).toBeGreaterThan(0);
  expect(portrait.distanceScale).toBeGreaterThan(desktop.distanceScale);
  expect(portrait.target).toEqual(desktop.target);
  const desktopDirection = desktop.position.map((value, index) => value - desktop.target[index]);
  const portraitDirection = portrait.position.map((value, index) => value - portrait.target[index]);
  expect(portraitDirection[1] / portraitDirection[0]).toBeCloseTo(desktopDirection[1] / desktopDirection[0], 8);
});

async function openWorld(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto('/index.html?workspace=planner&visual-world=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
  await page.evaluate(() => window.pickleboard.plays.load('fifth-shot-drop'));
  await page.evaluate(() => { void pickleboard.threeD.enter(); });
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  await installDimensionalAudit(page);
  await page.evaluate(() => {
    window.__auditDimensionalWorld = ({ includeTrajectory = false } = {}) => {
      const viewer = window.pickleboard.threeD;
      viewer.scene.updateMatrixWorld(true);
      viewer.camera.updateMatrixWorld(true);
      const canvasRect = viewer.renderer.domElement.getBoundingClientRect();
      const project = point => {
        const ndc = point.clone().project(viewer.camera);
        return {
          x: canvasRect.left + (ndc.x + 1) * canvasRect.width / 2,
          y: canvasRect.top + (1 - ndc.y) * canvasRect.height / 2
        };
      };
      // Project actual transformed solid vertices, including paddle and shoes.
      const actorPoints = root => window.__athleteAudit(root).vertices.map(project);
      const ballPoints = (position, scale) => {
        const right = viewer.camera.position.clone().setFromMatrixColumn(viewer.camera.matrixWorld, 0);
        const up = viewer.camera.position.clone().setFromMatrixColumn(viewer.camera.matrixWorld, 1);
        const visibleRadius = scale * 12 / 16 / 2;
        // The visible sprite sits on the near surface along the camera ray.
        const surface = position.clone().addScaledVector(viewer.camera.position.clone().sub(position).normalize(), scale * 0.375);
        return [
          project(surface.clone().addScaledVector(right, visibleRadius)),
          project(surface.clone().addScaledVector(right, -visibleRadius)),
          project(surface.clone().addScaledVector(up, visibleRadius)),
          project(surface.clone().addScaledVector(up, -visibleRadius))
        ];
      };
      const actors = [...viewer.playerObjects.values()].map(root => actorPoints(root));
      const ball = ballPoints(viewer.ballObject.position, viewer.readableBall.sprite.scale.x);
      const trajectory = [];
      if (includeTrajectory) {
        for (const segment of viewer.timeline.segments.filter(item => item.trajectory)) {
          for (let index = 0; index <= 16; index += 1) {
            const sample = segment.trajectory.sample(segment.trajectory.totalDuration * index / 16);
            const position = viewer.ballObject.position.clone().set(sample.x, sample.y, sample.z);
            const scale = viewer.readableBall.sizeAt(position, viewer.camera, viewer.elements.canvas.clientHeight);
            trajectory.push(...ballPoints(position, scale));
          }
        }
      }
      const all = [...actors.flat(), ...ball, ...trajectory];
      return {
        actors,
        ball,
        trajectory,
        bounds: {
          left: Math.min(...all.map(point => point.x)),
          right: Math.max(...all.map(point => point.x)),
          top: Math.min(...all.map(point => point.y)),
          bottom: Math.max(...all.map(point => point.y))
        },
        smallestActorHeight: Math.min(...actors.map(points =>
          Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)))),
        hudTop: document.querySelector('.three-d-hud').getBoundingClientRect().top,
        canvas: { left: canvasRect.left, right: canvasRect.right, top: canvasRect.top, bottom: canvasRect.bottom }
      };
    };
  });
}

test('legacy 3D compatibility: 3D world has original lit solid geometry, deterministic acrylic surfaces, and bounded resources', async ({ page }) => {
  await openWorld(page, { width: 1280, height: 800 });
  const world = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD, garden = viewer.world;
    const gardenMeshMaterials = new Set();
    garden.group.traverse(object => { if (object.isMesh) gardenMeshMaterials.add(object.material); });
    const players = [...viewer.playerObjects.values()].map(root => {
      const meshes = [];
      root.traverse(mesh => { if (mesh.isMesh && mesh.visible && mesh.name !== 'AthleteContactShadow') meshes.push(mesh); });
      return { volumetric: root.userData.volumetricAthlete, positiveScale: root.scale.toArray().every(n => n > 0),
        lit: meshes.every(mesh => mesh.material.type === 'MeshStandardMaterial'),
        depthTested: meshes.every(mesh => mesh.material.depthTest && mesh.material.depthWrite),
        owned: meshes.every(mesh => viewer.actorResources.geometries.has(mesh.geometry)),
        shoeBottoms: window.__athleteAudit(root).shoeBottoms };
    });
    return { players, worldName: garden.group.name, dimensional: garden.group.userData.dimensionalWorld,
      textureCount: garden.resources.textures.size,
      opaqueTextures: [...garden.resources.textures].every(texture => texture.image.data.every((value,index) => index % 4 !== 3 || value === 255)),
      gardenMeshes: garden.resources.geometries.size,
      actorGeometries: viewer.actorResources.geometries.size,
      shadowEnabled: viewer.renderer.shadowMap.enabled,
      diffuseGarden: gardenMeshMaterials.size > 0 && [...gardenMeshMaterials].every(material => material.type === 'MeshLambertMaterial'),
      netGridMaterial: garden.net.getObjectByName('NetMesh').material.type,
      contactShadows: [...viewer.playerObjects.values()].every(root => root.userData.shadow.visible && root.userData.shadow.material.opacity > 0),
      line: `#${viewer.scene.getObjectByName('GreenBaseline').material.color.getHexString()}`,
      pixelScale: viewer.getState().pixelScale };
  });
  expect(world).toMatchObject({ worldName: 'DimensionalSportsGarden', dimensional: true,
    textureCount: 3, opaqueTextures: true, shadowEnabled: false, diffuseGarden: true, netGridMaterial: 'LineBasicMaterial', contactShadows: true, line: '#fff6db', pixelScale: 1 });
  expect(world.players).toHaveLength(4);
  for (const player of world.players) {
    expect(player).toMatchObject({ volumetric: true, positiveScale: true, lit: true, depthTested: true, owned: true });
    for (const bottom of player.shoeBottoms) expect(Math.abs(bottom)).toBeLessThanOrEqual(0.01);
  }
  expect(world.gardenMeshes).toBeLessThan(40);
  expect(world.actorGeometries).toBeLessThan(400);
  expect(await page.evaluate(() => window.pickleboard.threeD.setPixelScale(2))).toBe(2);
  expect(await page.evaluate(() => window.pickleboard.threeD.setPixelScale(1))).toBe(1);
});

test('legacy 3D compatibility: camera presets reframe after portrait resize without resetting playback', async ({ page }) => {
  await openWorld(page, { width: 1280, height: 800 });
  await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    const shot = viewer.timeline.segments.find(segment => segment.step.id === 'fifth-drop');
    viewer.clock.elapsed = shot.startTime + shot.contactTime;
    viewer.applyAtTime(viewer.clock.elapsed);
  });
  const beforeResize = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    return {
      elapsed: viewer.clock.elapsed,
      ball: viewer.ballObject.position.toArray(),
      players: [...viewer.playerObjects].map(([id, root]) => [id, root.position.toArray()])
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => window.pickleboard.threeD.getState().framing.aspect)).toBeCloseTo(390 / 844, 2);

  for (const name of ['overhead', 'sideline', 'behind-green', 'behind-orange']) {
    await page.locator('#threeDCamera').selectOption(name,{force:true});
    const { state, audit, restored } = await page.evaluate(before => ({
      state: window.pickleboard.threeD.getState(),
      audit: window.__auditDimensionalWorld({ includeTrajectory: true }),
      restored: {
        elapsed: window.pickleboard.threeD.clock.elapsed,
        ball: window.pickleboard.threeD.ballObject.position.toArray(),
        players: [...window.pickleboard.threeD.playerObjects].map(([id, root]) => [id, root.position.toArray()])
      }
    }), beforeResize);
    expect(state.camera).toBe(name);
    expect(state.elapsed).toBeCloseTo(beforeResize.elapsed, 8);
    expect(state.framing.distanceScale).toBeGreaterThan(0);
    expect(state.framing.reservedPixels).toBeGreaterThan(0);
    expect(state.framing.reservedPixels).toBeLessThan(audit.canvas.bottom - audit.canvas.top);
    expect(restored).toEqual(beforeResize);
    expect(audit.bounds.left).toBeGreaterThanOrEqual(audit.canvas.left - 2);
    expect(audit.bounds.right).toBeLessThanOrEqual(audit.canvas.right + 2);
    expect(audit.bounds.top).toBeGreaterThanOrEqual(audit.canvas.top - 2);
    expect(audit.bounds.bottom).toBeLessThanOrEqual(audit.hudTop + 2);
  }
});

test('legacy 3D compatibility: all Plays keep complete actors and trajectories above the HUD at every target viewport', async ({ page }) => {
  test.setTimeout(90000);
  await openWorld(page, { width: 390, height: 844 });
  const playIds = PICKLEBOARD_PLAYS.map(play => play.id);
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 900 }, { width: 1164, height: 696 }]) {
    await page.setViewportSize(viewport);
    for (const playId of playIds) {
      await page.evaluate(async id => {
        const board = window.pickleboard;
        if (board.threeD.active) board.threeD.exit();
        board.plays.load(id);
        if (!await board.threeD.enter()) throw new Error(`Could not enter replay for ${id}`);
        board.threeD.resize();
      }, playId);
      const audits = await page.evaluate(() => {
        const viewer = window.pickleboard.threeD;
        const cameras = ['overhead', 'sideline', 'behind-green', 'behind-orange'];
        const times = [0];
        for (const segment of viewer.timeline.segments) {
          times.push(segment.startTime + Math.min(0.02, segment.duration / 2));
          times.push(segment.startTime + segment.duration / 2);
          if (segment.contactTime !== null) {
            times.push(segment.startTime + Math.max(0, segment.contactTime - 0.12));
            times.push(segment.startTime + segment.contactTime);
            times.push(segment.startTime + Math.min(segment.duration, segment.contactTime + 0.12));
            times.push(segment.startTime + Math.min(segment.duration, segment.shotSemantics.profile.duration * 0.9));
          }
          times.push(segment.endTime);
        }
        times.sort((a, b) => a - b);
        return cameras.map(camera => {
          viewer.setCamera(camera);
          let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
          let smallestActorHeight = Infinity;
          let audit;
          times.forEach((time, index) => {
            viewer.applyAtTime(time);
            audit = window.__auditDimensionalWorld({ includeTrajectory: index === 0 });
            left = Math.min(left, audit.bounds.left);
            right = Math.max(right, audit.bounds.right);
            top = Math.min(top, audit.bounds.top);
            bottom = Math.max(bottom, audit.bounds.bottom);
            smallestActorHeight = Math.min(smallestActorHeight, audit.smallestActorHeight);
          });
          return {
            camera,
            left, right, top, bottom,
            smallestActorHeight,
            hudTop: audit.hudTop,
            canvas: audit.canvas
          };
        });
      });
      for (const audit of audits) {
        expect.soft(audit.left, `${viewport.width}px ${playId} ${audit.camera} left`).toBeGreaterThanOrEqual(audit.canvas.left - 2);
        expect.soft(audit.right, `${viewport.width}px ${playId} ${audit.camera} right`).toBeLessThanOrEqual(audit.canvas.right + 2);
        expect.soft(audit.top, `${viewport.width}px ${playId} ${audit.camera} top`).toBeGreaterThanOrEqual(audit.canvas.top - 2);
        expect.soft(audit.bottom, `${viewport.width}px ${playId} ${audit.camera} HUD`).toBeLessThanOrEqual(audit.hudTop + 2);
        expect.soft(audit.smallestActorHeight, `${viewport.width}px ${playId} ${audit.camera} readability`).toBeGreaterThan(8);
      }
    }
  }
});


test('legacy 3D compatibility: phone cameras retain a visible ball without changing its trajectory or physical radius', async ({ page }) => {
  await openWorld(page, {width:320, height:568});
  for (const name of ['overhead','sideline','behind-green','behind-orange']) {
    await page.locator('#threeDCamera').selectOption(name,{force:true});
    const sample = await page.evaluate(() => {
      const v = pickleboard.threeD;
      const s = v.timeline.segments.find(s => s.step.id === 'third-drive');
      v.applyAtTime(s.startTime + s.contactTime + 0.2);
      const center = v.ballObject.position.clone();
      const points = window.__auditDimensionalWorld().ball;
      return { diameterPixels: Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)),
        physicalRadius: v.ballObject.userData.physicalRadius,
        center: center.toArray(), state: [v.lastState.x,v.lastState.y,v.lastState.z] };
    });
    expect(sample.diameterPixels).toBeGreaterThanOrEqual(11.5);
    expect(sample.physicalRadius).toBe(0.037);
    expect(sample.center).toEqual(sample.state);
  }
});
