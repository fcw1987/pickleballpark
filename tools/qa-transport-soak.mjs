// Bounded accelerated browser-clock soak. Real application RAF/hold callbacks
// execute; fastForward coalesces intervening frames, so this is not a frame-rate
// measurement or a claim that every flight frame was visually inspected.
import { chromium, webkit, expect } from '@playwright/test';
import { QA_SCENARIOS } from '../tests/fixtures/qa-scenarios.mjs';
import { generatedRally } from './qa-generated.mjs';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4184';
const requested = (process.env.QA_BROWSER || 'chromium,webkit').split(',');
const engines = { chromium, webkit };
const results = [];
for (const name of requested) {
  const browser = await engines[name].launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base);
    await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
    await page.clock.install({ time: new Date('2026-09-13T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-13T00:00:01Z'));
    for (const [label, source, repetitions] of [
      ['opening', QA_SCENARIOS.find(s => s.id === 'third-drop-fifth-drop').document, 150],
      ['maximum', generatedRally({ seed: 0x5eed2026, length: 64 }), 10]
    ]) {
      for (const view of ['2d', '3d']) {
        const setup = await page.evaluate(async ({ source, view }) => {
          const b = playBuilder;
          b.loadDocument(source);
          if (b.compiled.validShotCount !== source.shots.length) throw Error('Soak fixture is not fully playable');
          await b.switchView(view);
          b.seek(0);
          const sample = await import('/three-d-core.js');
          window.qaTransportSampler = sample.samplePlayBall;
          b.play();
          return { duration: b.session.duration, hold: b.session.holdSeconds,
            start: performance.now(), source: JSON.stringify(b.document),
            history: JSON.stringify(b.history), memory: { ...pickleboard.threeD.renderer.info.memory } };
        }, { source, view });
        let virtual = setup.start;
        let samples = 0;
        let warmMemory = null;
        for (let cycle = 0; cycle < repetitions; cycle++) {
          const offsets = [setup.duration - .04, setup.duration + .04, setup.duration + setup.hold + .04];
          for (const offset of offsets) {
            const target = Math.round(setup.start + (cycle * (setup.duration + setup.hold) + offset) * 1000);
            if (target > virtual) { await page.clock.fastForward(target - virtual); virtual = target; }
            // Hold completion advances the clock in its timer and requests the
            // next render. Observe that frame, not the gap between callbacks.
            await page.clock.runFor(16);
            virtual = await page.evaluate(() => performance.now());
            const state = await page.evaluate(() => {
              const b = playBuilder, s = b.session;
              const canonical = qaTransportSampler(b.compiled.timeline, s.clock.elapsed);
              const actual = b.view === '3d' ? pickleboard.threeD.ballObject.position.toArray()
                : [(b.board.tokens.ball.x - 10) * .3048, canonical.y, (b.board.tokens.ball.y - 22) * .3048];
              return { playing: s.playing, iteration: s.iteration, time: s.clock.elapsed,
                positionError: Math.hypot(actual[0] - canonical.x, actual[1] - canonical.y, actual[2] - canonical.z),
                source: JSON.stringify(b.document), history: JSON.stringify(b.history),
                memory: { ...pickleboard.threeD.renderer.info.memory } };
            });
            expect(state.playing).toBe(true);
            expect(state.positionError, JSON.stringify({ name, label, view, cycle, offset, time: state.time })).toBeLessThan(1e-7);
            expect(state.source).toBe(setup.source);
            expect(state.history).toBe(setup.history);
            // Three uploads a texture on first visible use (for example the
            // ball's occlusion cue). Compare retained allocations after the
            // complete first repetition, then require exact stability.
            expect(state.memory.geometries).toBe(setup.memory.geometries);
            if (warmMemory) expect(state.memory).toEqual(warmMemory);
            if (offset === offsets[2]) {
              expect(state.iteration).toBe(cycle + 1);
              expect(state.time).toBeLessThan(.09);
              if (!warmMemory) warmMemory = state.memory;
            }
            samples++;
          }
        }
        await page.evaluate(() => playBuilder.pause());
        await page.clock.runFor(32);
        const paused = await page.evaluate(() => ({ time: playBuilder.session.clock.elapsed,
          frame: pickleboard.threeD.renderer.info.render.frame, playing: playBuilder.session.playing }));
        await page.clock.fastForward(10000);
        expect(await page.evaluate(() => ({ time: playBuilder.session.clock.elapsed,
          frame: pickleboard.threeD.renderer.info.render.frame, playing: playBuilder.session.playing }))).toEqual(paused);
        results.push({ browser: name, label, shots: source.shots.length, view, repetitions, samples,
          initialMemory: setup.memory, warmMemory, pausedIdle: true });
      }
    }
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}
console.log(JSON.stringify({ method: 'accelerated real browser callbacks; three boundary samples per repetition', results }, null, 2));
