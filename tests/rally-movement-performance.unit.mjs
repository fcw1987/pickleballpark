import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGeneratedMovementV1 } from '../rally-movement.js';
import { sampleActorBoardPositionV2, sampleActorFeetV2 } from '../play-actors-v2.js';

// Frozen 63016b5 inspection algorithm. Intentionally retained independently so
// reuse changes are compared against the original sample order and arithmetic.
const IDS = ['player1', 'player2', 'player3', 'player4'];
const xy = p => ({ x: p.x, y: p.y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const asTimeline = value => value?.segments ? value : { segments: [value], duration: value?.endTime ?? value?.duration };
const freeze = object => {
  if (object && typeof object === 'object' && !Object.isFrozen(object)) {
    Object.values(object).forEach(freeze); Object.freeze(object);
  }
  return object;
};
function frozenInspection63016b5(timelineOrSegment, { maxPeakFeetPerSecond = 18 } = {}) {
  if (!Number.isFinite(maxPeakFeetPerSecond) || maxPeakFeetPerSecond <= 0 || maxPeakFeetPerSecond > 18) throw new TypeError('Generated peak speed must be in (0,18] ft/s.');
  const timeline = asTimeline(timelineOrSegment);
  let maximum = 0;
  const previous = new Map(), byActor = {};
  const fail = (actor, segment, reason, details = {}) => freeze({ valid: false, actor, shotId: segment?.step?.id ?? null, reason, maxPeakFeetPerSecond: maximum, ...details });
  for (const segment of timeline.segments || []) {
    if (segment?.modelVersion !== 2) throw new TypeError('Generated movement inspection requires model2 segments.');
    const duration = Math.min(segment.duration, timeline.duration - segment.startTime);
    if (!(duration > 0)) continue;
    const original = segment.originalDuration ?? segment.duration, contact = segment.contactTime, release = Math.min(original, contact + .12);
    for (const actor of IDS) {
      const cuts = [0, duration, original, original / 2, contact, contact / 2, release, release + (original - release) / 2];
      for (const evidence of segment.model2Momentum || []) if (evidence.actor === actor) cuts.push(evidence.contactTime - segment.startTime, evidence.time - segment.startTime);
      const times = [...new Set(cuts.filter(t => Number.isFinite(t) && t >= 0 && t <= duration))].sort((a, b) => a - b);
      const tracks = [time => sampleActorBoardPositionV2(segment, actor, time), ...[0, 1].map(index => time => sampleActorFeetV2(segment, actor, time).toSorted((a, b) => a.x - b.x || a.y - b.y)[index])];
      for (const [trackIndex, at] of tracks.entries()) for (let i = 1; i < times.length; i++) {
        const start = times[i - 1], end = times[i], seconds = end - start;
        if (seconds < 1e-12) continue;
        const from = at(start), to = at(end), middle = at((start + end) / 2), key = `${actor}:${trackIndex}`;
        if (![from, to, middle].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return fail(actor, segment, 'Generated movement samples must be finite.', { track: trackIndex });
        const before = previous.get(key);
        if (before && distance(before, from) > 1e-6) return fail(actor, segment, 'The generated sampled route jumps between stages.', { track: trackIndex });
        const a = { x: 2 * (to.x + from.x - 2 * middle.x), y: 2 * (to.y + from.y - 2 * middle.y) };
        const b = { x: to.x - from.x - a.x, y: to.y - from.y - a.y };
        for (const q of [.25, .75]) {
          const actual = at(start + seconds * q), expected = { x: from.x + a.x * q * q + b.x * q, y: from.y + a.y * q * q + b.y * q };
          if (distance(actual, expected) > 1e-6) return fail(actor, segment, 'Unsupported generated movement shape.', { track: trackIndex });
        }
        const peak = Math.max(Math.hypot(b.x, b.y), Math.hypot(2 * a.x + b.x, 2 * a.y + b.y)) / seconds;
        maximum = Math.max(maximum, peak); byActor[actor] = Math.max(byActor[actor] || 0, peak);
        if (peak > maxPeakFeetPerSecond + 1e-6) return fail(actor, segment, 'The actual generated route exceeds the peak speed bound.', { track: trackIndex, peakFeetPerSecond: peak, fromTime: segment.startTime + start, toTime: segment.startTime + end });
        previous.set(key, xy(to));
      }
    }
  }
  return freeze({ valid: true, maxPeakFeetPerSecond: maximum, byActor, boundFeetPerSecond: maxPeakFeetPerSecond });
}

const positions = { player1: { x: 5, y: 3 }, player2: { x: 15, y: 3 }, player3: { x: 5, y: 41 }, player4: { x: 15, y: 30 } };
function segment() {
  return { modelVersion: 2, startTime: 0, endTime: 1, duration: 1, originalDuration: 1, contactTime: .3,
    previous: { positions: structuredClone(positions) }, step: { id: 'performance-fixture', positions: structuredClone(positions) },
    shotSemantics: { playerId: 'player1', contact: { feet: [{ x: 4.58, y: 3 }, { x: 5.42, y: 3 }] } }, model2Momentum: [] };
}
function parity(value, options) {
  assert.deepEqual(inspectGeneratedMovementV1(value, options), frozenInspection63016b5(value, options));
}
test('inspection-local reuse preserves frozen results for valid, peak, continuity, momentum, NVZ and clipped routes', () => {
  const valid = segment(); valid.step.positions.player4.x += 3;
  const peak = segment(); peak.step.positions.player4.x += 10;
  const next = segment(); next.startTime = 1; next.endTime = 2; next.previous.positions.player4.x += 1;
  const momentum = segment(); momentum.model2Momentum = [{ actor: 'player1', contactTime: 0, time: .04,
    from: { x: 5, y: 3 }, to: { x: 15, y: 3 }, fromFeet: [{ x: 4.58, y: 3 }, { x: 5.42, y: 3 }], feet: [{ x: 14.58, y: 3 }, { x: 15.42, y: 3 }] }];
  const nvz = segment(); nvz.previous.positions.player1.y = 16; nvz.step.positions.player1.y = 14.25;
  nvz.shotSemantics.contact.feet.forEach(foot => { foot.y = 16; });
  const clipped = segment(); clipped.duration = .1; clipped.endTime = .1; clipped.step.positions.player4.x += 8;
  const nonfinite = segment(); nonfinite.step.positions.player4.x = NaN;
  for (const value of [valid, peak, { segments: [segment(), next], duration: 2 }, momentum, nvz, clipped, nonfinite]) parity(value);
  assert.equal(inspectGeneratedMovementV1(valid).valid, true);
  for (const value of [peak, momentum, nonfinite]) assert.equal(inspectGeneratedMovementV1(value).valid, false);
});
test('every inspection revalidates changed positions, feet, momentum and independent state', () => {
  const value = segment();
  const initial = inspectGeneratedMovementV1(value); assert.equal(initial.valid, true);
  value.step.positions.player4.x += 10; parity(value); assert.equal(inspectGeneratedMovementV1(value).valid, false);
  value.step.positions.player4.x -= 10; parity(value); assert.deepEqual(inspectGeneratedMovementV1(value), initial);
  value.shotSemantics.contact.feet.forEach(foot => { foot.x += 10; }); parity(value); assert.equal(inspectGeneratedMovementV1(value).valid, false);
  assert.deepEqual(inspectGeneratedMovementV1(segment()), initial, 'a different state cannot inherit samples');
  value.shotSemantics.contact.feet.forEach(foot => { foot.x -= 10; });
  value.model2Momentum.push({ actor: 'player4', contactTime: 0, time: .04, from: positions.player4, to: { x: 25, y: 30 },
    fromFeet: [{ x: 14.58, y: 30 }, { x: 15.42, y: 30 }], feet: [{ x: 24.58, y: 30 }, { x: 25.42, y: 30 }] });
  parity(value); assert.equal(inspectGeneratedMovementV1(value).valid, false);
});
test('inspection reuse preserves thrown validation errors', () => {
  const invalid = segment(); invalid.modelVersion = 1;
  const missing = segment(); delete missing.previous.positions.player3;
  for (const [value, options] of [[segment(), { maxPeakFeetPerSecond: 19 }], [invalid], [missing]]) {
    let original;
    try { frozenInspection63016b5(value, options); } catch (error) { original = error; }
    assert.ok(original);
    assert.throws(() => inspectGeneratedMovementV1(value, options), { name: original.name, message: original.message });
  }
});
