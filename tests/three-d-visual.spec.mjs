// Legacy 3D compatibility coverage enters through the retained API; public UI defaults to pixel Canvas2D.
import { expect, test } from '@playwright/test';
import { COURT_DIMENSIONS } from '../court-geometry.js';

async function open3d(page) {
  await page.goto('/index.html?workspace=planner&three-d-visual=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
  await page.evaluate(() => window.pickleboard.plays.load('third-shot-drop'));
  await page.evaluate(() => { void pickleboard.threeD.enter(); });
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  await expect(page.locator('#threeDViewer')).toBeVisible();
}

test('legacy 3D compatibility: visible athletes combine directional artwork with solid articulated arms and physical handedness', async ({ page }) => {
  await page.goto('/index.html?workspace=planner&three-d-visual-hands=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.threeD))).toBe(true);
  await page.evaluate(() => { window.pickleboard.tokens.player2.handedness = 'left'; window.pickleboard.plays.load('third-shot-drop'); });
  await page.evaluate(() => { void pickleboard.threeD.enter(); });
  await expect(page.locator('#threeDCanvas canvas')).toHaveCount(1);
  const players = await page.evaluate(() => Object.fromEntries([...window.pickleboard.threeD.playerObjects].map(([id, root]) => {
    const meshes = [];
    root.traverse(mesh => { if (mesh.isMesh && mesh.visible && mesh.name !== 'AthleteContactShadow') meshes.push(mesh); });
    return [id, {
      reference: root.userData.referenceAthlete,
      artwork: Boolean(root.userData.body.material.map && root.userData.body.material.transparent && root.userData.body.material.alphaTest > 0),
      solidParts: meshes.filter(mesh => {
        mesh.geometry.computeBoundingBox(); const b = mesh.geometry.boundingBox;
        return b.max.x > b.min.x && b.max.y > b.min.y && b.max.z > b.min.z;
      }).length,
      meshCount: meshes.length,
      physicalArm: root.userData.arms[0].hand.name,
      handedness: root.userData.handedness, team: root.userData.team,
      groundY: root.userData.groundY, worldY: root.position.y,
      phase: root.userData.animation.phase, frame: root.userData.animation.frame, mirror: root.userData.animation.mirror
    }];
  })));
  for (const player of Object.values(players)) {
    expect(player).toMatchObject({ reference: true, artwork: true, worldY: 0, phase: 'ready' });
    expect(player.meshCount).toBe(14); // Directional body card, ten arm pieces, and three paddle pieces.
    expect(player.solidParts).toBe(13);
    expect([0, 1, 2, 3]).toContain(player.frame);
    expect([-1, 1]).toContain(player.mirror);
  }
  expect(players.player1).toMatchObject({ handedness: 'right', team: 'team1' });
  expect(players.player2).toMatchObject({ handedness: 'left', team: 'team1' });
  expect(players.player3.team).toBe('team2');
});

test('legacy 3D compatibility: court, sagging net, surround, and camera framing preserve authoritative dimensions', async ({ page }) => {
  await open3d(page);
  const scene = await page.evaluate(() => {
    const viewer = window.pickleboard.threeD;
    // Slice rendered top-tape triangles, independent of declared net metadata.
    const tape = viewer.scene.getObjectByName('NetTopTape');
    tape.updateWorldMatrix(true, false);
    const topAt = x => {
      const attr = tape.geometry.attributes.position, index = tape.geometry.index;
      let top = -Infinity;
      for (let i = 0; i < (index?.count ?? attr.count); i += 3) {
        const points = [0, 1, 2].map(corner => viewer.ballObject.position.clone()
          .fromBufferAttribute(attr, index ? index.getX(i + corner) : i + corner).applyMatrix4(tape.matrixWorld));
        for (const [a, b] of [[points[0], points[1]], [points[1], points[2]], [points[2], points[0]]]) {
          if (Math.abs(a.x - x) < 1e-7) top = Math.max(top, a.y);
          if ((a.x < x && b.x > x) || (a.x > x && b.x < x)) top = Math.max(top, a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x));
        }
      }
      return top;
    };
    const slab = viewer.scene.getObjectByName('CourtSlab'); slab.geometry.computeBoundingBox();
    const courtSize = slab.geometry.boundingBox.getSize(viewer.ballObject.position.clone()).toArray();
    const kitchen = viewer.scene.getObjectByName('KitchenSurface'); kitchen.geometry.computeBoundingBox();
    const kitchenSize = kitchen.geometry.boundingBox.getSize(viewer.ballObject.position.clone()).toArray();
    const postXs = viewer.scene.getObjectsByProperty('name', 'NetPost').map(post => post.getWorldPosition(viewer.ballObject.position.clone()).x);
    const netTop = { center: topAt(0), side: topAt(viewer.courtObject.userData.width / 2), oppositeSide: topAt(-viewer.courtObject.userData.width / 2) };
    const cameraStates = {};
    for (const name of ['overhead', 'sideline', 'behind-green', 'behind-orange']) {
      viewer.setCamera(name);
      cameraStates[name] = { position: viewer.camera.position.toArray(), fov: viewer.camera.fov, controls:viewer.cameraControls.getState() };
    }
    return {
      court: viewer.courtObject.userData, courtSize, kitchenSize, netTop, netSpan: Math.max(...postXs)-Math.min(...postXs),
      net: { centerHeight: 34 / 12 * 0.3048, sideHeight: 36 / 12 * 0.3048 },
      hasSurround: Boolean(viewer.scene.getObjectByName('CourtApron')),
      hasSlab: Boolean(viewer.scene.getObjectByName('CourtSlab')),
      hasKitchen: Boolean(viewer.scene.getObjectByName('KitchenSurface')),
      hasMesh: Boolean(viewer.scene.getObjectByName('NetMesh')),
      hasTape: Boolean(viewer.scene.getObjectByName('NetTopTape')),
      postCount: viewer.scene.getObjectsByProperty('name', 'NetPost').length,
      cameraStates
    };
  });
  expect(scene.court.width).toBeCloseTo(20 * 0.3048, 6);
  expect(scene.court.length).toBeCloseTo(44 * 0.3048, 6);
  expect(scene.net.sideHeight).toBeGreaterThan(scene.net.centerHeight);
  expect(scene.netSpan).toBeCloseTo(22 * 0.3048, 6);
  expect(scene.courtSize[0]).toBeCloseTo(scene.court.width, 5);
  expect(scene.courtSize[2]).toBeCloseTo(scene.court.length, 5);
  expect(scene.kitchenSize[0]).toBeCloseTo(20 * 0.3048, 5);
  expect(scene.kitchenSize[1]).toBeCloseTo(14 * 0.3048, 5);
  expect(Math.abs(scene.netTop.center - scene.net.centerHeight)).toBeLessThan(0.001);
  expect(Math.abs(scene.netTop.side - scene.net.sideHeight)).toBeLessThan(0.001);
  expect(Math.abs(scene.netTop.oppositeSide - scene.net.sideHeight)).toBeLessThan(0.001);
  expect(scene).toMatchObject({ hasSurround: true, hasSlab: true, hasKitchen: true, hasMesh: true, hasTape: true, postCount: 2 });
  expect(scene.cameraStates.overhead.position[1]).toBeGreaterThan(10);
  expect(scene.cameraStates.overhead.controls.elevation).toBe(50);
  expect(scene.cameraStates.sideline.position[0]).toBeGreaterThan(8);
  expect(scene.cameraStates.sideline.position[1]).toBeGreaterThan(4);
  expect(scene.cameraStates['behind-green'].position[2]).toBeLessThan(0);
  expect(scene.cameraStates['behind-orange'].position[2]).toBeGreaterThan(0);
  expect(Object.values(scene.cameraStates).map(camera => camera.fov)).toEqual([38, 38, 38, 38]);
});

test('legacy 3D compatibility: ball keeps its physical radius while enforcing a readable projected diameter', async ({ page }) => {
  await open3d(page);
  const ball = await page.evaluate(() => ({
    ...window.pickleboard.threeD.ballObject.userData,

    projectedDiameter: (() => {
      const viewer = window.pickleboard.threeD;
      const position = viewer.ballObject.position.clone().applyMatrix4(viewer.camera.matrixWorldInverse);
      const worldPerPixel = 2 * Math.max(0.01, -position.z) * Math.tan(viewer.camera.fov * Math.PI / 360)
        / viewer.elements.canvas.clientHeight;
      return viewer.readableBall.sprite.scale.x / worldPerPixel * 12 / 16;
    })()
  }));
  expect(ball.physicalRadius).toBe(COURT_DIMENSIONS.ballDiameterMeters / 2);
  expect(ball.visualRadius).toBe(ball.physicalRadius);
  expect(ball.minimumCSSDiameter).toBeGreaterThanOrEqual(12);
  expect(ball.projectedDiameter).toBeGreaterThanOrEqual(ball.minimumCSSDiameter - 0.01);
});
