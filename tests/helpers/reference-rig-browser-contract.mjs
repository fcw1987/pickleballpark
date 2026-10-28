import { readFileSync } from 'node:fs';

const artworkCalibration = {
  cuffs: JSON.parse(readFileSync(new URL('../fixtures/reference-sleeve-measurements.json', import.meta.url), 'utf8')),
  hair: JSON.parse(readFileSync(new URL('../fixtures/reference-sleeve-preserved-hair.json', import.meta.url), 'utf8'))
};

// Independent browser checks for the approved original-art sleeve rig.
// Serialize the factory because the static server does not serve .mjs as modules.
export function referenceRigBrowserContract(calibration = { cuffs: null, hair: [] }) {
  const sourcePixels = new WeakMap();
  const sourceFor = image => {
    if (!sourcePixels.has(image)) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      // Match the partition canvases' default backing store. Linux WebKit
      // read-frequent canvases unpremultiply some channels differently.
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      sourcePixels.set(image, context.getImageData(0, 0, canvas.width, canvas.height));
    }
    return sourcePixels.get(image);
  };
  return {
    expectedJump(sample) {
      if (!sample.profile || ['ready', 'shuffle'].includes(sample.action)
        || (sample.instructionalFamily || sample.shotType || sample.action) !== 'overhead') return 0;
      const { duration, contactRatio, recoverRatio = .8 } = sample.profile;
      const time = sample.strokeTime / duration;
      const phase = time <= contactRatio ? time / contactRatio
        : time <= recoverRatio ? 1 + (time - contactRatio) / (recoverRatio - contactRatio)
          : 2 + (time - recoverRatio) / (1 - recoverRatio);
      return phase >= 0 && phase <= 2 ? .4 * Math.sin(phase * Math.PI / 2) ** 2 : 0;
    },
    cameraAlignment(root, camera) {
      // Compare actual transformed axes with a horizontally aligned card whose
      // elevation is independently limited to 20 degrees. A level right axis
      // additionally rejects roll, including rotations that preserve forward.
      const axis = (object, x, y, z) => object.position.clone().set(x, y, z).applyQuaternion(object.quaternion);
      const cameraForward = axis(camera, 0, 0, 1), actualForward = axis(root.userData.visual, 0, 0, 1);
      const heading = cameraForward.clone().setY(0).normalize();
      const expectedElevation = Math.max(-Math.PI / 9, Math.min(Math.PI / 9,
        Math.atan2(cameraForward.y, Math.hypot(cameraForward.x, cameraForward.z))));
      const expectedForward = heading.clone().multiplyScalar(Math.cos(expectedElevation)).setY(Math.sin(expectedElevation));
      const expectedRight = heading.clone().set(heading.z, 0, -heading.x);
      return { forwardError: actualForward.distanceTo(expectedForward),
        headingError: actualForward.clone().setY(0).normalize().distanceTo(heading),
        rollError: axis(root.userData.visual, 1, 0, 0).distanceTo(expectedRight),
        elevation: Math.atan2(actualForward.y, Math.hypot(actualForward.x, actualForward.z)), expectedElevation };
    },
    artwork(root) {
      const data = root.userData, { assets } = data.resources, source = assets.sourceImage;
      const sourceLoaded = source instanceof HTMLImageElement && source.complete
        && source.naturalWidth > 0 && source.naturalHeight > 0
        && new URL(source.currentSrc || source.src).pathname.endsWith('/assets/reference-athletes/athletes-armless-v2.webp');
      if (!sourceLoaded) return { sourceLoaded: false, dimensions: false, identity: false, visibleOriginalPixels: false };
      const original = sourceFor(source), [x, y, width, height] = assets.metadata.frames[data.player][data.animation.frame].rect;
      const parts = [data.body, ...data.sleeves];
      const dimensions = parts.every(part => part.material.map.image instanceof HTMLCanvasElement
        && part.material.map.image.width === source.naturalWidth && part.material.map.image.height === source.naturalHeight)
        && x >= 0 && y >= 0 && x + width <= original.width && y + height <= original.height;
      const identity = parts.every((part, index) => part.material.map === data.resources.textures.get(`${data.player}/${data.animation.frame}/${index - 1}`)
        && part.material.map.image === (index === 0 ? assets.image : assets.sleeves[index - 1])
        && part.material.map.offset.x === x / original.width
        && part.material.map.offset.y === 1 - (y + height) / original.height
        && part.material.map.repeat.x === width / original.width
        && part.material.map.repeat.y === height / original.height);
      const threshold = Math.ceil(.08 * 255);
      const painted = dimensions ? parts.map(part => part.material.map.image.getContext('2d').getImageData(x, y, width, height).data) : [];
      const sameSource = (pixels, at, sourceAt) => [0, 1, 2, 3].every(channel => pixels[at + channel] === original.data[sourceAt + channel]);
      const cuffs = calibration.cuffs?.[data.player]?.[data.animation.frame];
      let visibleOriginalPixels = dimensions;
      if (dimensions) {
        const counts = [0, 0, 0];
        for (let row = 0; row < height && visibleOriginalPixels; row++) for (let col = 0; col < width; col++) {
          const at = (row * width + col) * 4, sourceAt = ((y + row) * original.width + x + col) * 4;
          const sourceVisible = original.data[sourceAt + 3] >= threshold;
          for (let part = 0; part < parts.length; part++) if (painted[part][at + 3] >= threshold) {
            counts[part]++;
            // Exact complete RGBA, including the source alpha, stays required.
            if (!sameSource(painted[part], at, sourceAt)
              || (part > 0 && (row < height * .44 || row >= height * .66))) visibleOriginalPixels = false;
          }
          // Every visible original pixel must survive in the partition. This
          // rejects holes that a check of only surviving pixels would miss.
          if (sourceVisible && !painted.some(pixels => pixels[at + 3] >= threshold && sameSource(pixels, at, sourceAt))) visibleOriginalPixels = false;
          // Head, torso above the sleeves, shorts and shoes stay on the body.
          if (sourceVisible && (row < height * .44 || row >= height * .66) && !sameSource(painted[0], at, sourceAt)) visibleOriginalPixels = false;
          // Independently measured cuff cores must remain on their own sleeve,
          // including overlap pixels that may also exist in the body canvas.
          for (let side = 0; side < 2; side++) {
            const cuff = cuffs?.[side];
            if (!cuff?.visible || !sourceVisible) continue;
            const [left, top, right, bottom] = cuff.bounds;
            if (col >= left && col <= right && row >= top && row <= bottom && !sameSource(painted[side + 1], at, sourceAt)) visibleOriginalPixels = false;
          }
        }
        if (parts.some((part, index) => part.visible && counts[index] === 0)) visibleOriginalPixels = false;
        for (const hair of calibration.hair.filter(item => item.player === data.player && item.frame === data.animation.frame)) {
          for (const [left, top, w, h] of hair.rects) for (let row = top; row < top + h; row++) for (let col = left; col < left + w; col++) {
            const at = (row * width + col) * 4, sourceAt = ((y + row) * original.width + x + col) * 4;
            if (original.data[sourceAt + 3] >= threshold && !sameSource(painted[0], at, sourceAt)) visibleOriginalPixels = false;
            if (painted[hair.side + 1][at + 3] !== 0) visibleOriginalPixels = false;
          }
        }
      }
      return { sourceLoaded, dimensions, identity, visibleOriginalPixels };
    }
  };
}

export async function installReferenceRigContract(page) {
  await page.evaluate(({ source, calibration }) => {
    window.__referenceRigContract = new Function('calibration', `return (${source})(calibration);`)(calibration);
  }, { source: referenceRigBrowserContract.toString(), calibration: artworkCalibration });
}
