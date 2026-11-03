// Shared logical actor geometry for model 2 collision checks and both views.
// All times come from the CoachingSession timeline, including evidence observed
// after the ball became dead. Legacy actor routes never enter this module.
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t < .5 ? 2 * t * t : 1 - (1 - t) ** 2 * 2; };
const blend = (a, b, t) => Object.freeze({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const center = feet => ({ x: (feet[0].x + feet[1].x) / 2, y: (feet[0].y + feet[1].y) / 2 });

export function sampleMomentumV2(evidence, actor, absoluteTime) {
  if (!evidence) return null;
  let active;
  if (Array.isArray(evidence) && evidence.constructor === Array && evidence.filter === Array.prototype.filter) {
    // Stable sort selected the first equal-time entry. Keep that tie rule while
    // scanning inert model evidence without allocating a filtered/sorted copy.
    const length = evidence.length;
    for (let index = 0; index < length; index++) {
      if (!(index in evidence)) continue; // Array#filter skips sparse holes.
      const item = evidence[index];
      if (item.actor === actor && item.contactTime <= absoluteTime + 1e-9
        && (!active || item.contactTime - active.contactTime > 0)) active = item;
    }
  } else {
    const candidates = (evidence || []).filter(item => item.actor === actor && item.contactTime <= absoluteTime + 1e-9);
    active = candidates.sort((a, b) => b.contactTime - a.contactTime)[0];
  }
  if (!active) return null;
  const duration = active.time - active.contactTime;
  const progress = duration > 0 ? clamp((absoluteTime - active.contactTime) / duration) : 1;
  return blend(active.from, active.to, progress);
}

export function sampleActorBoardPositionV2(segment, actor, localTime) {
  if (segment?.modelVersion !== 2 || !Number.isFinite(localTime)) throw new TypeError('A model 2 segment and finite actor sample time are required.');
  const from = segment.previous.positions[actor], to = segment.step.positions[actor];
  if (!from || !to) throw new TypeError('Model 2 actor positions must be represented at both boundaries.');
  const absoluteTime = segment.startTime + localTime;
  const momentum = sampleMomentumV2(segment.model2Momentum, actor, absoluteTime);
  if (momentum) return momentum;
  const duration = segment.originalDuration ?? segment.duration;
  const time = Math.max(0, Math.min(duration, localTime));
  if (segment.shotSemantics?.playerId === actor && segment.shotSemantics.contact.feet.length === 2) {
    const plant = center(segment.shotSemantics.contact.feet);
    const contact = segment.contactTime;
    if (time <= contact) return blend(from, plant, contact > 0 ? ease(time / contact) : 1);
    const release = Math.min(duration, contact + .12);
    if (time <= release) return Object.freeze(plant);
    return blend(plant, to, ease((time - release) / Math.max(.001, duration - release)));
  }
  return blend(from, to, ease(time / Math.max(.001, duration)));
}

export function sampleActorFeetV2(segment, actor, localTime) {
  const absoluteTime = segment.startTime + localTime;
  const evidence = segment.model2Momentum;
  let active;
  if (Array.isArray(evidence) && evidence[Symbol.iterator] === Array.prototype[Symbol.iterator]) {
    // Feet intentionally select the last active array entry, even when the
    // entries are out of time order. This differs from position momentum.
    for (let index = evidence.length - 1; index >= 0; index--) {
      const item = evidence[index];
      if (item.actor === actor && item.contactTime <= absoluteTime + 1e-9) { active = item; break; }
    }
  } else if (evidence) {
    active = [...(segment.model2Momentum || [])].reverse().find(item => item.actor === actor && item.contactTime <= absoluteTime + 1e-9);
  }
  if (active) {
    const progress = clamp((absoluteTime - active.contactTime) / Math.max(.001, active.time - active.contactTime));
    return active.fromFeet.map((foot, index) => blend(foot, active.feet[index], progress));
  }
  const at = sampleActorBoardPositionV2(segment, actor, localTime);
  const feet = segment.shotSemantics?.playerId === actor ? segment.shotSemantics.contact.feet : segment.nextShotSemantics?.playerId === actor ? segment.nextShotSemantics.contact.feet : null;
  const origin = feet?.length === 2 ? center(feet) : at;
  return (feet?.length === 2 ? feet : [{ x: at.x - .42, y: at.y }, { x: at.x + .42, y: at.y }]).map(foot => Object.freeze({ x: at.x + foot.x - origin.x, y: at.y + foot.y - origin.y }));
}

// The movement allowance is continuous: any sampled interval may cover at most
// speed * seconds + tolerance feet. The tolerance is never renewed per phase or
// segment. It is the existing instructional route allowance, not paddle reach.
export const MOVEMENT_V2 = Object.freeze({ speedFeetPerSecond: 18, toleranceFeet: 3 });

export function inspectActorMovementV2(timeline, actor, model = MOVEMENT_V2) {
  const speed = model.speedFeetPerSecond, tolerance = model.toleranceFeet;
  if (!Number.isFinite(speed) || speed <= 0 || !Number.isFinite(tolerance) || tolerance < 0) throw new TypeError('Finite movement speed and tolerance are required.');
  let path = 0, minimum = null, previous = null, maxExcessFeet = 0;
  const failure = (segment, reason, details = {}) => Object.freeze({ valid: false, actor, stepId: segment.step.id, reason, ...details });
  for (const segment of timeline.segments) {
    const duration = Math.min(segment.duration, timeline.duration - segment.startTime);
    if (duration <= 0) continue;
    const original = segment.originalDuration ?? segment.duration;
    const contact = segment.contactTime, release = Math.min(original, contact + .12);
    // Between these boundaries the shared sampler follows one monotone straight
    // route with linear or quadratic progress. Momentum can replace that route
    // across segment boundaries, so include its absolute activation/hold times.
    const cuts = [0, duration, original, original / 2, contact, contact / 2,
      release, release + (original - release) / 2];
    for (const evidence of segment.model2Momentum || []) if (evidence.actor === actor) {
      cuts.push(evidence.contactTime - segment.startTime, evidence.time - segment.startTime);
    }
    const times = [...new Set(cuts.filter(time => Number.isFinite(time) && time >= 0 && time <= duration))].sort((a, b) => a - b);
    for (let index = 1; index < times.length; index++) {
      const start = times[index - 1], end = times[index], seconds = end - start;
      if (seconds < 1e-12) continue;
      const at = time => sampleActorBoardPositionV2(segment, actor, time);
      const from = at(start), to = at(end), middle = at((start + end) / 2);
      if (previous && Math.hypot(previous.x - from.x, previous.y - from.y) > 1e-5) return failure(segment, 'The sampled actor route jumps between stages.');
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const half = Math.hypot(middle.x - from.x, middle.y - from.y);
      const quadratic = 2 * length - 4 * half, linear = 4 * half - length;
      // Verify the actual sampler still has the supported analytic shape. A new
      // route type must extend this audit rather than silently evade its bound.
      for (const fraction of [.25, .75]) {
        const actual = at(start + seconds * fraction);
        const progress = length > 1e-12 ? (quadratic * fraction * fraction + linear * fraction) / length : 0;
        if (Math.hypot(actual.x - (from.x + (to.x - from.x) * progress), actual.y - (from.y + (to.y - from.y) * progress)) > 1e-5) {
          return failure(segment, 'The sampled actor route is discontinuous or has an unsupported movement shape.');
        }
      }
      if (linear < -1e-7 || 2 * quadratic + linear < -1e-7) return failure(segment, 'The sampled actor route reverses inside an unsplit movement phase.');
      const critical = Math.abs(quadratic) > 1e-12 ? (speed * seconds - linear) / (2 * quadratic) : -1;
      const fractions = [0, ...(critical > 0 && critical < 1 ? [critical] : []), 1];
      for (const fraction of fractions) {
        const time = segment.startTime + start + seconds * fraction;
        const traveled = path + quadratic * fraction * fraction + linear * fraction;
        const excess = traveled - speed * time;
        if (!minimum || excess < minimum.excess) minimum = { excess, time, path: traveled };
        const rise = excess - minimum.excess;
        maxExcessFeet = Math.max(maxExcessFeet, rise);
        if (rise > tolerance + .001) return failure(segment, 'The actual sampled route exceeds the bounded movement allowance.', {
          fromTime: minimum.time, toTime: time, distanceFeet: traveled - minimum.path,
          allowedFeet: speed * (time - minimum.time) + tolerance, maxExcessFeet: rise,
        });
      }
      path += length;
      previous = to;
    }
  }
  return Object.freeze({ valid: true, actor, distanceFeet: path, maxExcessFeet });
}
