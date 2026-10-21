// Optional local-only native Safari probe. Import from Web Inspector on an
// isolated synthetic QA origin. It is excluded from the packaged runtime.
// Controlled lifecycle testing, not a claim of a visible-interface journey.
export async function parkedContextLoss() {
  const builder = window.playBuilder;
  await builder.switchView('3d'); builder.pause();
  const original = builder.board.threeD.renderer;
  const source = JSON.stringify(builder.document);
  await builder.switchView('2d');
  const extension = original.getContext().getExtension('WEBGL_lose_context');
  if (!extension) throw Error('WEBGL_lose_context is unavailable');
  await new Promise(resolve => {
    original.domElement.addEventListener('webglcontextlost', resolve, { once: true });
    extension.loseContext();
  });
  await builder.switchView('3d');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const viewer = builder.board.threeD;
  const result = window.qaNativeContextResult = {
    view: builder.view, active: viewer.active, sameRenderer: viewer.renderer === original,
    originalConnected: original.domElement.isConnected,
    contextLost: viewer.renderer?.getContext().isContextLost(),
    canvases: document.querySelectorAll('#threeDViewer canvas').length,
    sourcePreserved: source === JSON.stringify(builder.document)
  };
  result.ok = result.active && !result.sameRenderer && !result.originalConnected && !result.contextLost && result.canvases === 1 && result.sourcePreserved;
  const output = document.createElement('output');
  output.id = 'qa-native-result'; output.style.cssText = 'position:fixed;left:10px;top:90px;z-index:9999;max-width:90vw;background:white;color:black;padding:8px;font:14px monospace;';
  output.textContent = JSON.stringify(result);
  document.getElementById(output.id)?.remove(); document.body.append(output);
  return result;
}

export async function run({ rounds = 24 } = {}) {
  const builder = window.playBuilder;
  if (!builder || builder.busy || builder.workspace !== 'builder') throw Error('Open the ready builder first');
  const initial = JSON.stringify(builder.document);
  const initialHistory = builder.history.snapshots.length;
  const frames = (n = 2) => new Promise(resolve => {
    const step = () => --n ? requestAnimationFrame(step) : resolve();
    requestAnimationFrame(step);
  });
  const settle = async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
    await frames();
  };
  const samples = [];
  const errors = [];
  const error = event => errors.push(String(event.message || event.reason));
  addEventListener('error', error); addEventListener('unhandledrejection', error);
  const viewer = builder.board.threeD;
  let contextLosses = 0;
  const contextLost = () => contextLosses++;
  const canvas = viewer.renderer.domElement;
  canvas.addEventListener('webglcontextlost', contextLost);
  const sample = label => {
    const rect = canvas.getBoundingClientRect();
    const value = { label, view: builder.view, active: viewer.active,
      lost: viewer.renderer.getContext().isContextLost(), frame: viewer.renderer.info.render.frame,
      size: [canvas.width, canvas.height], css: [rect.width, rect.height],
      scheduler: viewer.renderLoopId !== null, time: builder.session.clock.elapsed,
      playing: builder.session.playing, geometry: viewer.renderer.info.memory.geometries,
      textures: viewer.renderer.info.memory.textures, canvases: document.querySelectorAll('#threeDViewer canvas').length };
    samples.push(value);
    if (value.lost || !value.active || !value.size.every(n => n > 0) || !value.css.every(n => n > 0)) throw Error(`Invalid renderer at ${label}`);
    return value;
  };
  try {
    await builder.switchView('3d'); builder.pause();
    // Three uploads the occlusion cue on first visible use. Warm the tested
    // camera/time combinations before demanding exact retained-resource counts.
    const originalTime = builder.session.clock.elapsed, originalCamera = viewer.cameraPreset;
    for (const camera of ['overhead', 'sideline']) {
      viewer.setCamera(camera);
      for (let index = 0; index <= 24; index++) { builder.seek(index / 24 * builder.session.duration); await frames(); }
    }
    viewer.setCamera(originalCamera); builder.seek(originalTime); await settle(); sample('initial');
    for (let i = 0; i < rounds; i++) {
      if (i % 2) builder.play();
      await frames(4);
      await builder.action('help'); await settle(); sample(`help-${i}`);
      builder.board.closeInfoModal(); await settle(); sample(`closed-${i}`);
      if (builder.session.playing) throw Error('Help pause lost authority');
      const menu = builder.ui.element.querySelector('.builder-main-menu > summary');
      menu.click(); await settle(); menu.click(); await settle();
      const edit = () => builder.ui.element.querySelector('.builder-context-actions [data-action="collapse-inspector"]');
      edit().click(); await settle(); sample(`details-${i}`);
      edit().click(); await settle();
      if (i % 3 === 2) { await builder.switchView('2d'); await frames(); await builder.switchView('3d'); await settle(); }
      viewer.setCamera(i % 2 ? 'overhead' : 'sideline'); await settle();
      builder.seek((i % 11) / 10 * builder.session.duration); await frames();
      if (JSON.stringify(builder.document) !== initial || builder.history.snapshots.length !== initialHistory) throw Error(`Source/history changed at round ${i}`);
    }
    builder.pause(); await settle(); const idle = sample('idle'); await frames(12);
    const final = sample('final');
    if (idle.frame !== final.frame || final.scheduler) throw Error('Paused renderer did not settle');
    if (final.canvases !== 1 || final.geometry !== samples[0].geometry || final.textures !== samples[0].textures) throw Error('Native transition resources drifted');
    return window.qaNativeResult = { ok: true, rounds, samples, contextLosses, errors,
      agent: navigator.userAgent, note: 'Real native browser; controlled actions. Two cameras × 25 timeline positions warmed before resource comparison. Inspect visible court separately.' };
  } catch (error) {
    window.qaNativeResult = { ok: false, error: String(error), rounds, samples, contextLosses, errors };
    throw error;
  } finally {
    removeEventListener('error', error); removeEventListener('unhandledrejection', error);
    canvas.removeEventListener('webglcontextlost', contextLost);
    builder.pause();
    const output = document.createElement('output');
    output.id = 'qa-native-result'; output.style.cssText = 'position:fixed;left:10px;top:90px;z-index:9999;max-width:90vw;background:white;color:black;padding:8px;font:14px monospace;';
    const result = window.qaNativeResult;
    output.textContent = JSON.stringify({ ok: result?.ok, rounds, error: result?.error, samples: samples.length, contextLosses, errors,
      final: samples.at(-1) });
    document.getElementById(output.id)?.remove(); document.body.append(output);
  }
}
