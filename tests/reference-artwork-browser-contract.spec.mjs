import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installReferenceRigContract } from './helpers/reference-rig-browser-contract.mjs';

const cuffs = JSON.parse(readFileSync(new URL('./fixtures/reference-sleeve-measurements.json', import.meta.url), 'utf8'));
const hair = JSON.parse(readFileSync(new URL('./fixtures/reference-sleeve-preserved-hair.json', import.meta.url), 'utf8'));

test('original artwork contract preserves all atlas frames and rejects changed pixels, holes, hair transfer and UVs', async ({ page }, testInfo) => {
  await page.goto('/index.html?workspace=planner&original-artwork-contract=1');
  await page.waitForFunction(() => Boolean(window.pickleboard?.threeD));
  await page.evaluate(async () => {
    pickleboard.plays.load('fifth-shot-drop');
    if (!await pickleboard.threeD.enter()) throw Error('Could not enter original artwork replay');
  });
  await installReferenceRigContract(page);
  const result = await page.evaluate(async ({ cuffs, hair }) => {
    const THREE = await import('/vendor/three.module.min.js');
    const inspect = root => window.__referenceRigContract.artwork(root);
    const failures = [], positives = [], counts = { color: 0, alpha: 0, missingPixel: 0, uv: 0, hairTransfer: 0 };
    const valid = value => Object.values(value).every(Boolean);
    const check = (condition, label, value) => { if (!condition) failures.push({ label, value }); };
    for (const root of pickleboard.threeD.playerObjects.values()) {
      const d = root.userData, parts = [d.body, ...d.sleeves], savedFrame = d.animation.frame;
      const savedMaps = parts.map(part => part.material.map), savedVisibility = parts.map(part => part.visible);
      for (let frame = 0; frame < 4; frame++) {
        d.animation.frame = frame;
        parts.forEach((part, index) => {
          part.material.map = d.resources.texture(d.player, frame, index - 1);
          part.visible = index === 0 || cuffs[d.player][frame][index - 1].visible;
        });
        const original = inspect(root); positives.push({ player: d.player, frame, result: original });
        check(valid(original), `${d.player}/${frame}: original artwork`, original);
        const [ox, oy, width, height] = d.resources.assets.metadata.frames[d.player][frame].rect;
        // Keep the production atlas untouched. Copy its canvases into an owned
        // negative-control actor with real Texture instances and resource keys.
        const copies = parts.map(part => {
          const canvas = document.createElement('canvas'); canvas.width = part.material.map.image.width; canvas.height = part.material.map.image.height;
          canvas.getContext('2d').drawImage(part.material.map.image, 0, 0);
          const map = new THREE.Texture(canvas); map.offset.copy(part.material.map.offset); map.repeat.copy(part.material.map.repeat);
          return { visible: part.visible, material: { map, alphaTest: part.material.alphaTest } };
        });
        const resources = { assets: { ...d.resources.assets, image: copies[0].material.map.image, sleeves: copies.slice(1).map(part => part.material.map.image) },
          textures: new Map(copies.map((part, index) => [`${d.player}/${frame}/${index - 1}`, part.material.map])) };
        const control = { userData: { ...d, animation: { ...d.animation }, resources, body: copies[0], sleeves: copies.slice(1) } };
        check(valid(inspect(control)), `${d.player}/${frame}: unchanged control`, inspect(control));
        const restorePixel = (part, x, y) => {
          const context = copies[part].material.map.image.getContext('2d'); context.clearRect(x, y, 1, 1);
          context.drawImage(parts[part].material.map.image, x, y, 1, 1, x, y, 1, 1);
        };
        const changePixel = (part, x, y, rgba) => copies[part].material.map.image.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), 1, 1), x, y);
        for (let part = 0; part < copies.length; part++) {
          if (!copies[part].visible) continue;
          const image = copies[part].material.map.image.getContext('2d').getImageData(ox, oy, width, height);
          const bounds = part === 0 ? [0, 0, width - 1, Math.floor(height * .4)] : cuffs[d.player][frame][part - 1].bounds;
          let point;
          for (let y = bounds[1]; y <= bounds[3] && !point; y++) for (let x = bounds[0]; x <= bounds[2]; x++) {
            const at = (y * width + x) * 4;
            if (image.data[at + 3] >= 96) { point = { x: ox + x, y: oy + y, rgba: Array.from(image.data.slice(at, at + 4)) }; break; }
          }
          if (!point) throw Error(`Missing independent visible core pixel ${d.player}/${frame}/${part}`);
          for (const kind of ['color', 'alpha', 'missingPixel']) {
            const changed = [...point.rgba];
            if (kind === 'color') changed[0] += changed[0] < 128 ? 80 : -80;
            if (kind === 'alpha') changed[3] += changed[3] < 128 ? 64 : -64;
            if (kind === 'missingPixel') changed.fill(0);
            changePixel(part, point.x, point.y, changed);
            const rejected = inspect(control); check(rejected.visibleOriginalPixels === false, `${d.player}/${frame}/${part}: reject ${kind}`, rejected); counts[kind]++;
            restorePixel(part, point.x, point.y);
            check(valid(inspect(control)), `${d.player}/${frame}/${part}: restore after ${kind}`, inspect(control));
          }
        }
        const map = copies[0].material.map, savedX = map.offset.x; map.offset.x += 1 / map.image.width;
        check(inspect(control).identity === false, `${d.player}/${frame}: reject wrong UV`, inspect(control)); counts.uv++; map.offset.x = savedX;
        check(valid(inspect(control)), `${d.player}/${frame}: restore UV`, inspect(control));
        for (const preserved of hair.filter(item => item.player === d.player && item.frame === frame)) {
          const body = copies[0].material.map.image.getContext('2d').getImageData(ox, oy, width, height);
          let point;
          for (const [x, y, w, h] of preserved.rects) for (let row = y; row < y + h && !point; row++) for (let col = x; col < x + w; col++) {
            const at = (row * width + col) * 4;
            if (body.data[at + 3] >= 21) { point = { x: ox + col, y: oy + row }; break; }
          }
          if (!point) throw Error(`Missing independently preserved hair ${d.player}/${frame}`);
          // Transfer the original pixel instead of dropping it: whole-art source
          // coverage remains intact, so the calibrated body ownership must catch it.
          const sleeve = copies[preserved.side + 1].material.map.image.getContext('2d');
          sleeve.drawImage(parts[0].material.map.image, point.x, point.y, 1, 1, point.x, point.y, 1, 1);
          copies[0].material.map.image.getContext('2d').clearRect(point.x, point.y, 1, 1);
          check(inspect(control).visibleOriginalPixels === false, `${d.player}/${frame}: reject moving hair`, inspect(control)); counts.hairTransfer++;
          restorePixel(0, point.x, point.y); restorePixel(preserved.side + 1, point.x, point.y);
          check(valid(inspect(control)), `${d.player}/${frame}: restore hair`, inspect(control));
        }
        copies.forEach(part => part.material.map.dispose());
      }
      d.animation.frame = savedFrame;
      parts.forEach((part, index) => { part.material.map = savedMaps[index]; part.visible = savedVisibility[index]; });
    }
    return { positives, counts, failures };
  }, { cuffs, hair });
  await testInfo.attach('original-artwork-contract-controls', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.positives).toHaveLength(16);
  expect(result.counts).toEqual({ color: 44, alpha: 44, missingPixel: 44, uv: 16, hairTransfer: 3 });
  expect(result.failures).toEqual([]);
});
