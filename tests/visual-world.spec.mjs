import { expect, test } from '@playwright/test';
import { fitCameraPreset } from '../three-d-core.js';

test('camera fitting expands narrow views without changing preset sight lines', () => {
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
  await page.locator('#play3dView').click();
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  await page.evaluate(() => {
    window.__auditPixelWorld = ({ includeTrajectory = false } = {}) => {
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
      const surfacePoint = (mesh, pixelX, pixelY) => {
        const frame = mesh.userData.currentFrame;
        const widthSegments = mesh.geometry.parameters.widthSegments;
        const heightSegments = mesh.geometry.parameters.heightSegments;
        const fxGrid = Math.max(0, Math.min(widthSegments, pixelX / frame.rect[2] * widthSegments));
        const fyGrid = Math.max(0, Math.min(heightSegments, pixelY / frame.rect[3] * heightSegments));
        const column = Math.min(widthSegments - 1, Math.floor(fxGrid));
        const row = Math.min(heightSegments - 1, Math.floor(fyGrid));
        const fx = fxGrid - column;
        const fy = fyGrid - row;
        const stride = widthSegments + 1;
        const indices = fx + fy <= 1
          ? [[row * stride + column, 1 - fx - fy], [(row + 1) * stride + column, fy], [row * stride + column + 1, fx]]
          : [[(row + 1) * stride + column, 1 - fx], [(row + 1) * stride + column + 1, fx + fy - 1], [row * stride + column + 1, 1 - fy]];
        const attribute = mesh.geometry.attributes.position;
        const point = mesh.position.clone().set(0, 0, 0);
        for (const [index, weight] of indices) {
          point.x += attribute.getX(index) * weight;
          point.y += attribute.getY(index) * weight;
          point.z += attribute.getZ(index) * weight;
        }
        return point.applyMatrix4(mesh.matrixWorld);
      };
      const actorPoints = root => {
        const points = [];
        for (const mesh of [root.userData.body, root.userData.arm]) {
          const frame = mesh.userData.currentFrame;
          const bounds = mesh.userData.layerIndex === 0 ? frame.bodyBounds : frame.actionBounds;
          const [left, top, right, bottom] = bounds;
          for (let x = left; x <= right; x += 1) {
            points.push(project(surfacePoint(mesh, x, top)), project(surfacePoint(mesh, x, bottom)));
          }
          for (let y = top; y <= bottom; y += 1) {
            points.push(project(surfacePoint(mesh, left, y)), project(surfacePoint(mesh, right, y)));
          }
          for (let x = Math.ceil(left / 4) * 4; x < right; x += 4) {
            for (let y = Math.ceil(top / 4) * 4; y < bottom; y += 4) {
              points.push(project(surfacePoint(mesh, x, y)));
            }
          }
        }
        return points;
      };
      const ballPoints = (position, scale) => {
        const right = viewer.camera.position.clone().setFromMatrixColumn(viewer.camera.matrixWorld, 0);
        const up = viewer.camera.position.clone().setFromMatrixColumn(viewer.camera.matrixWorld, 1);
        const visibleRadius = scale * 12 / 16 / 2;
        return [
          project(position.clone().addScaledVector(right, visibleRadius)),
          project(position.clone().addScaledVector(right, -visibleRadius)),
          project(position.clone().addScaledVector(up, visibleRadius)),
          project(position.clone().addScaledVector(up, -visibleRadius))
        ];
      };
      const actors = [...viewer.playerObjects.values()].map(root => actorPoints(root));
      const ball = ballPoints(viewer.ballObject.position, viewer.ballObject.scale.x);
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

test('3D world uses depth-tested pixel actors authored from the shared palette', async ({ page }) => {
  await openWorld(page, { width: 1280, height: 800 });
  const world = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    const players = [...viewer.playerObjects.values()].map(root => {
      const layers = [root.userData.body, root.userData.arm];
      const team = root.userData.team === 'team1' ? 'green' : 'orange';
      const key = `${team}/${root.userData.handedness}/${root.userData.animation.viewDirection}`;
      return {
        team: root.userData.team,
        handedness: root.userData.handedness,
        pixelActor: root.userData.pixelActor,
        positiveScale: root.scale.x > 0,
        layerNames: layers.map(layer => layer.name),
        frame: layers.map(layer => layer.userData.currentFrame.action),
        layerIndices: layers.map(layer => layer.userData.layerIndex),
        basicMaterials: layers.every(layer => layer.material.type === 'MeshBasicMaterial'),
        depthTested: layers.every(layer => layer.material.depthTest && layer.material.depthWrite),
        nearestSampled: layers.every(layer => layer.material.map.magFilter === 1003 && layer.material.map.minFilter === 1003),
        noMipmaps: layers.every(layer => layer.material.map.generateMipmaps === false),
        ownedMaps: layers.every(layer => [...viewer.actorResources.textures.values()].includes(layer.material.map)),
        stableMapLookup: layers.every(layer => viewer.actorResources.texture(key, layer.userData.layerIndex) === layer.material.map)
      };
    });
    const images = [...new Set([...viewer.playerObjects.values()].flatMap(root =>
      [root.userData.body.material.map.image, root.userData.arm.material.map.image]))];
    const colors = new Set();
    for (const image of images) {
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      // Ignore the deliberately translucent foot-shadow row: canvas premultiplication
      // can round its RGB channels even though its authored source is the ink color.
      for (let index = 0; index < pixels.length; index += 4) if (pixels[index + 3] === 255) {
        colors.add(`#${[pixels[index], pixels[index + 1], pixels[index + 2]]
          .map(value => value.toString(16).padStart(2, '0')).join('')}`);
      }
    }
    const palette = new Set(Object.values(window.PICKLEBOARD_VISUAL.palette).map(color => color.toLowerCase()));
    return {
      players,
      colors: [...colors],
      unexpectedColors: [...colors].filter(color => !palette.has(color)),
      textureCount: viewer.actorResources.textures.size,
      layerCount: players.length * 2,
      court: `#${viewer.scene.getObjectByName('CourtSlab').material.color.getHexString()}`,
      kitchen: `#${viewer.scene.getObjectByName('KitchenSurface').material.color.getHexString()}`,
      surround: `#${viewer.scene.getObjectByName('CourtSurround').material.color.getHexString()}`,
      line: `#${viewer.scene.getObjectByName('GreenBaseline').material.color.getHexString()}`,
      pixelScale: viewer.getState().pixelScale
    };
  });
  expect(world).toMatchObject({
    court: '#4f8f88', kitchen: '#a7c7aa', surround: '#739b70', line: '#fff6db', pixelScale: 1
  });
  expect(world.players).toHaveLength(4);
  for (const player of world.players) {
    expect(player).toMatchObject({ pixelActor: true, positiveScale: true, basicMaterials: true,
      depthTested: true, nearestSampled: true, noMipmaps: true, ownedMaps: true, stableMapLookup: true });
    expect(player.layerNames).toEqual(['PixelBody', 'PixelPaddleArm']);
    expect(player.frame).toEqual(['ready', 'ready']);
    expect(player.layerIndices).toEqual([0, 1]);
  }
  expect(world.unexpectedColors).toEqual([]);
  expect(world.colors).toEqual(expect.arrayContaining(['#263449', '#304762', '#83bc65', '#df8b50', '#f5edd8']));
  expect(world.textureCount).toBeLessThanOrEqual(world.layerCount);
  expect(await page.evaluate(() => window.pickleboard.threeD.setPixelScale(2))).toBe(2);
  expect(await page.evaluate(() => window.pickleboard.threeD.setPixelScale(1))).toBe(1);
});

test('camera presets reframe after portrait resize without resetting playback', async ({ page }) => {
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
      audit: window.__auditPixelWorld({ includeTrajectory: true }),
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

test('all Plays keep complete actors and trajectories above the HUD at every target viewport', async ({ page }) => {
  await openWorld(page, { width: 390, height: 844 });
  const playIds = ['serve-and-return', 'third-shot-drop', 'third-shot-drive', 'fifth-shot-drop'];
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
            audit = window.__auditPixelWorld({ includeTrajectory: index === 0 });
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


test('phone cameras retain a visible ball without changing its trajectory or physical radius', async ({ page }) => {
  await openWorld(page, {width:320, height:568});
  for (const name of ['overhead','sideline','behind-green','behind-orange']) {
    await page.locator('#threeDCamera').selectOption(name,{force:true});
    const sample = await page.evaluate(() => {
      const v = pickleboard.threeD;
      const s = v.timeline.segments.find(s => s.step.id === 'third-drive');
      v.applyAtTime(s.startTime + s.contactTime + 0.2);
      const center = v.ballObject.position.clone();
      const points = window.__auditPixelWorld().ball;
      return { diameterPixels: Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)),
        physicalRadius: v.ballObject.userData.physicalRadius,
        center: center.toArray(), state: [v.lastState.x,v.lastState.y,v.lastState.z] };
    });
    expect(sample.diameterPixels).toBeGreaterThanOrEqual(9.5);
    expect(sample.physicalRadius).toBe(0.037);
    expect(sample.center).toEqual(sample.state);
  }
});
