import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStarterDocument } from '../play-document.js';
import { compileEffectiveCandidate } from '../rally-proposals.js';
import { captureCompatibility, captureCompiledSignature, COMPATIBILITY_VERSION } from '../tools/game-mode-compatibility.mjs';

test('all eight lessons and supported saved model1/v2/v3 sources keep their structural and sampled contracts', () => {
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/game-mode/compatibility.json', import.meta.url)));
  const actual = captureCompatibility();
  assert.equal(actual.version, COMPATIBILITY_VERSION);
  assert.equal(actual.epsilonSeconds, baseline.epsilonSeconds);
  assert.equal(actual.cases.filter(c => c.id.startsWith('lesson:')).length, 8);
  assert.deepEqual(actual.cases, baseline.cases);
});

test('changing an omitted trajectory closure is detected even when JSON structure is identical', () => {
  const document = createStarterDocument(), compiled = compileEffectiveCandidate(document);
  const changed = { ...compiled, timeline: { ...compiled.timeline, segments: compiled.timeline.segments.map((segment, index) => index ? segment : {
    ...segment, trajectory: { ...segment.trajectory, sample(time) { const point = segment.trajectory.sample(time); return { ...point, x: point.x + .01 }; } }
  }) } };
  const before = captureCompiledSignature(document, compiled), after = captureCompiledSignature(document, changed);
  assert.equal(before.timelineStructureSha256, after.timelineStructureSha256);
  assert.notEqual(before.sampledTimelineSha256, after.sampledTimelineSha256);
});
