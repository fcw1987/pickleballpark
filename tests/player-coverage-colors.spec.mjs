import { test, expect } from '@playwright/test';

test('both renderers mix teammates to violet, independent of ordering, with fading overlap and mirrored ends', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.playBuilder?.view === '3d' && pickleboard.threeD?.worldAssetsReady);
  const result = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const { createPlayerCoverageOverlay } = await import('/player-coverage-overlay.js');
    const { drawPlayerCoverage } = await import('/player-coverage-canvas.js');
    const { getCoveragePreference } = await import('/player-coverage.js');
    const { FEET_TO_METERS: ft } = await import('/three-d-core.js');
    playBuilder.pause(); getCoveragePreference().set(true);
    const makePlayer = (id, team, x, y) => ({ id, team, position: { x, y }, facing: { x: 0, y: y < 22 ? 1 : -1 }, coverageFacing: { x: 0, y: y < 22 ? 1 : -1 }, handedness: 'right' });
    const snapshot = { version: 1, timeSeconds: 0, ball: { x: 10, y: 22 }, players: [makePlayer('p1', 'green', 6, 12), makePlayer('p2', 'green', 14, 12), makePlayer('p3', 'orange', 6, 32), makePlayer('p4', 'orange', 14, 32)] };
    const board = { coverageSnapshotProvider: () => snapshot };
    const overlay = createPlayerCoverageOverlay(THREE), scene = new THREE.Scene(); scene.add(overlay.mesh);
    const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(224, 416); renderer.setClearColor('#23404f');
    const camera = new THREE.OrthographicCamera(-14 * ft, 14 * ft, 26 * ft, -26 * ft, .1, 50);
    camera.position.set(0, 20, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
    const target = new THREE.WebGLRenderTarget(224, 416); renderer.setRenderTarget(target);
    const readGL = () => { overlay.update({ board }); renderer.render(scene, camera); const pixels = new Uint8Array(224 * 416 * 4); renderer.readRenderTargetPixels(target, 0, 0, 224, 416, pixels); return pixels; };
    const canvas = document.createElement('canvas'); canvas.width = 112; canvas.height = 208;
    const ctx = canvas.getContext('2d'), point = (x, y) => ({ x: (x + 4) * 4, y: (y + 4) * 4 });
    const readCanvas = () => { ctx.clearRect(0, 0, 112, 208); drawPlayerCoverage(ctx, board, point); return ctx.getImageData(0, 0, 112, 208).data; };
    const gl = readGL(), canvasPixels = readCanvas();
    snapshot.players.reverse(); const glReversed = readGL(), canvasReversed = readCanvas();
    const sample = (pixels, x, y, gpu = false) => { const at = gpu ? (Math.floor((48 - y) * 8) * 224 + Math.floor((x + 4) * 8)) * 4 : (Math.floor((y + 4) * 4) * 112 + Math.floor((x + 4) * 4)) * 4; return Array.from(pixels.slice(at, at + 4)); };
    const probes = (pixels, gpu) => ({ rose: sample(pixels, 4, 17, gpu), blue: sample(pixels, 16, 17, gpu), shared: sample(pixels, 10, 18, gpu), farShared: sample(pixels, 10, 26, gpu), farRose: sample(pixels, 4, 27, gpu), farBlue: sample(pixels, 16, 27, gpu), feather: sample(pixels, 10, 19.75, gpu), outside: sample(pixels, 10, 21, gpu) });
    const answer = { gl: probes(gl, true), canvas: probes(canvasPixels, false), glStable: gl.every((v, i) => v === glReversed[i]), canvasStable: canvasPixels.every((v, i) => v === canvasReversed[i]) };
    overlay.dispose(); target.dispose(); renderer.dispose(); return answer;
  });
  expect(result.glStable).toBe(true); expect(result.canvasStable).toBe(true);
  for (const sample of [result.gl, result.canvas]) {
    expect(sample.rose[0]).toBeGreaterThan(sample.blue[0]);
    expect(sample.blue[2]).toBeGreaterThan(sample.rose[2]);
    expect(sample.shared[0]).toBeGreaterThan(sample.blue[0]);
    expect(sample.shared[2]).toBeGreaterThan(sample.rose[2]);
    expect(sample.farRose[0]).toBeGreaterThan(sample.farBlue[0]);
    expect(sample.farBlue[2]).toBeGreaterThan(sample.farRose[2]);
    expect(sample.farShared[0]).toBeGreaterThan(sample.farBlue[0]);
    expect(sample.farShared[2]).toBeGreaterThan(sample.farRose[2]);
  }
  const glStrength = pixel => pixel.slice(0, 3).reduce((sum, channel, i) => sum + Math.abs(channel - result.gl.outside[i]), 0);
  expect(glStrength(result.gl.shared)).toBeGreaterThan(glStrength(result.gl.feather));
  expect(glStrength(result.gl.feather)).toBeGreaterThan(0);
  expect(result.canvas.shared[3]).toBeGreaterThan(result.canvas.feather[3]);
  expect(result.canvas.feather[3]).toBeGreaterThan(result.canvas.outside[3]);
  expect(result.canvas.outside[3]).toBe(0);
  // The core pigment stays prominent, rather than being a pastel-only revision.
  expect(result.canvas.rose[0]).toBe(255);
  // Canvas premultiply/unpremultiply can round a colour channel by one byte.
  expect(Math.abs(result.canvas.rose[1] - 63)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.canvas.blue[1] - 159)).toBeLessThanOrEqual(1); expect(result.canvas.blue[2]).toBe(255);
  expect(result.canvas.rose[3]).toBeGreaterThanOrEqual(178);
});

test('both renderers put the bright paddle-hand mark on the physical right/left at both ends and reverse camera', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => pickleboard.threeD?.worldAssetsReady);
  const result = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const { createPlayerCoverageOverlay } = await import('/player-coverage-overlay.js');
    const { drawPlayerCoverage } = await import('/player-coverage-canvas.js');
    const { getCoveragePreference } = await import('/player-coverage.js');
    const { FEET_TO_METERS: ft } = await import('/three-d-core.js');
    playBuilder.pause(); getCoveragePreference().set(true);
    const snapshot = { version: 1, timeSeconds: 0, ball: { x: 10, y: 22 }, players: [12, 32].map((y, i) => ({
      id: `p${i}`, team: i ? 'orange' : 'green', position: { x: 6, y },
      facing: { x: 0, y: i ? -1 : 1 }, coverageFacing: { x: 0, y: i ? -1 : 1 }, handedness: 'right'
    })) };
    const board = { coverageSnapshotProvider: () => snapshot }, overlay = createPlayerCoverageOverlay(THREE);
    const scene = new THREE.Scene(); scene.add(overlay.mesh);
    const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(224, 416); renderer.setClearColor('#23404f');
    const camera = new THREE.OrthographicCamera(-14 * ft, 14 * ft, 26 * ft, -26 * ft, .1, 50);
    camera.position.set(0, 20, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
    const target = new THREE.WebGLRenderTarget(224, 416); renderer.setRenderTarget(target);
    const canvas = document.createElement('canvas'); canvas.width = 112; canvas.height = 208;
    const ctx = canvas.getContext('2d'), point = (x, y) => ({ x: (x + 4) * 4, y: (y + 4) * 4 });
    const read = () => {
      overlay.update({ board }); renderer.render(scene, camera);
      const gpu = new Uint8Array(224 * 416 * 4); renderer.readRenderTargetPixels(target, 0, 0, 224, 416, gpu);
      ctx.clearRect(0, 0, 112, 208); drawPlayerCoverage(ctx, board, point);
      return { gpu, cpu: ctx.getImageData(0, 0, 112, 208).data };
    };
    const probe = (pixels, x, y, gpu, reversed) => {
      const scale = gpu ? 8 : 4, width = gpu ? 224 : 112;
      const px = Math.floor((reversed ? 24 - x : x + 4) * scale);
      const py = Math.floor((gpu ? (reversed ? y + 4 : 48 - y) : y + 4) * scale);
      // Peak green over the mark's antialias footprint distinguishes the bright
      // arc from rose field pigment, independent of half-foot raster phase.
      let green = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) green = Math.max(green, pixels[((py + dy) * width + px + dx) * 4 + 1]);
      return green;
    };
    const samples = [];
    for (const handedness of ['right', 'left']) for (const reversed of [false, true]) {
      for (const player of snapshot.players) player.handedness = handedness;
      camera.up.set(0, 0, reversed ? 1 : -1); camera.lookAt(0, 0, 0);
      const pixels = read();
      for (const player of snapshot.players) {
        const forward = player.position.y < 22 ? 1 : -1;
        const hand = handedness === 'right' ? 1 : -1;
        const theta = Math.atan2(forward, 0) + hand * .58;
        const x = player.position.x + Math.cos(theta) * 2.6, y = player.position.y + Math.sin(theta) * 2.6;
        samples.push({ handedness, reversed, y: player.position.y, physicalHandX: x - player.position.x,
          gpuMark: probe(pixels.gpu, x, y, true, reversed), gpuOther: probe(pixels.gpu, 12 - x, y, true, reversed),
          cpuMark: probe(pixels.cpu, x, y, false, false), cpuOther: probe(pixels.cpu, 12 - x, y, false, false) });
      }
    }
    overlay.dispose(); target.dispose(); renderer.dispose(); return samples;
  });
  for (const sample of result) {
    const rightSign = sample.y < 22 ? -1 : 1;
    expect(Math.sign(sample.physicalHandX)).toBe(sample.handedness === 'right' ? rightSign : -rightSign);
    expect(sample.gpuMark).toBeGreaterThan(sample.gpuOther + 30);
    expect(sample.cpuMark).toBeGreaterThan(sample.cpuOther + 30);
  }
});
