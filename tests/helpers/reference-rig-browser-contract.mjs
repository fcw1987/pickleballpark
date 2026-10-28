// Independent browser checks for the approved original-art sleeve rig.
// Serialize the factory because the static server does not serve .mjs as modules.
export function referenceRigBrowserContract() {
  const sourcePixels = new WeakMap();
  const sourceFor = image => {
    if (!sourcePixels.has(image)) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
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
        && new URL(source.currentSrc || source.src).pathname.endsWith('/assets/reference-athletes/athletes-armless-v2.png');
      if (!sourceLoaded) return { sourceLoaded: false, dimensions: false, identity: false, visibleOriginalPixels: false };
      const original = sourceFor(source), [x, y, width, height] = assets.metadata.frames[data.player][data.animation.frame].rect;
      const parts = [data.body, ...data.sleeves];
      const dimensions = parts.every(part => part.material.map.image instanceof HTMLCanvasElement
        && part.material.map.image.width === source.naturalWidth && part.material.map.image.height === source.naturalHeight)
        && x >= 0 && y >= 0 && x + width <= original.width && y + height <= original.height;
      const identity = parts.every((part, index) => part.material.map === data.resources.textures.get(`${data.player}/${data.animation.frame}/${index - 1}`)
        && part.material.map.image === (index === 0 ? assets.image : assets.sleeves[index - 1]));
      const visibleOriginalPixels = dimensions && parts.every(part => {
        const painted = part.material.map.image.getContext('2d', { willReadFrequently: true }).getImageData(x, y, width, height).data;
        // The approved PNG uses antialiased partial alpha, including sleeves
        // with no alpha=255 pixel. Audit every pixel actually admitted by the
        // material's alpha test, preserving its complete source RGBA value.
        const threshold = Math.max(1, Math.ceil(part.material.alphaTest * 255));
        let opaque = 0;
        for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
          const at = (row * width + col) * 4, originalAt = ((y + row) * original.width + x + col) * 4;
          if (painted[at + 3] < threshold) continue;
          opaque++;
          for (let channel = 0; channel < 4; channel++) if (painted[at + channel] !== original.data[originalAt + channel]) return false;
        }
        return !part.visible || opaque > 0;
      });
      return { sourceLoaded, dimensions, identity, visibleOriginalPixels };
    }
  };
}

export async function installReferenceRigContract(page) {
  await page.evaluate(source => { window.__referenceRigContract = new Function(`return (${source})();`)(); }, referenceRigBrowserContract.toString());
}
