import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStarterDocument } from '../play-document.js';
import { compileEffectiveCandidate } from '../rally-proposals.js';
import { captureCompatibility, captureCompiledSignature, COMPATIBILITY_VERSION } from '../tools/game-mode-compatibility.mjs';

test('all lessons and saved sources keep exact contracts with only reviewed auto-handedness metadata corrections', () => {
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/game-mode/compatibility.json', import.meta.url)));
  const actual = captureCompatibility();
  assert.equal(actual.version, COMPATIBILITY_VERSION);
  assert.equal(actual.epsilonSeconds, baseline.epsilonSeconds);
  assert.equal(actual.cases.filter(c => c.id.startsWith('lesson:')).length, 8);
  // Keep the original frozen baseline intact. These five exact structural
  // pairs record the reviewed anatomy bug fix; every other field, including
  // source bytes and default actor/ball/function samples, stays frozen.
  const review = JSON.parse(readFileSync(new URL('./fixtures/game-mode/auto-handedness-corrections-v1.json', import.meta.url)));
  assert.equal(review.version, 'auto-handedness-corrections-v1');
  assert.equal(review.corrections.length, 5); assert.equal(new Set(review.corrections.map(row => row.id)).size, 5);
  const expected = baseline.cases.map(row => {
    const correction = review.corrections.find(item => item.id === row.id);
    if (!correction) return row;
    assert.deepEqual(Object.keys(correction.prior), ['compiledPlaySha256', 'timelineStructureSha256']);
    assert.deepEqual(Object.keys(correction.corrected), Object.keys(correction.prior));
    for (const key of Object.keys(correction.prior)) assert.equal(row[key], correction.prior[key]);
    return { ...row, ...correction.corrected };
  });
  assert.deepEqual(actual.cases, expected);
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
