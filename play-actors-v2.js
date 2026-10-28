// Shared logical actor geometry for model 2 collision checks and both views.
// All times come from the CoachingSession timeline, including evidence observed
// after the ball became dead. Legacy actor routes never enter this module.
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t < .5 ? 2 * t * t : 1 - (1 - t) ** 2 * 2; };
const blend = (a, b, t) => Object.freeze({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const center = feet => ({ x: (feet[0].x + feet[1].x) / 2, y: (feet[0].y + feet[1].y) / 2 });

export function sampleMomentumV2(evidence, actor, absoluteTime) {
  const candidates = (evidence || []).filter(item => item.actor === actor && item.contactTime <= absoluteTime + 1e-9);
  const active = candidates.sort((a, b) => b.contactTime - a.contactTime)[0];
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
  const active = [...(segment.model2Momentum || [])].reverse().find(item => item.actor === actor && item.contactTime <= absoluteTime + 1e-9);
  if (active) {
    const progress = clamp((absoluteTime - active.contactTime) / Math.max(.001, active.time - active.contactTime));
    return active.fromFeet.map((foot, index) => blend(foot, active.feet[index], progress));
  }
  const at = sampleActorBoardPositionV2(segment, actor, localTime);
  const feet = segment.shotSemantics?.playerId === actor ? segment.shotSemantics.contact.feet : segment.nextShotSemantics?.playerId === actor ? segment.nextShotSemantics.contact.feet : null;
  const origin = feet?.length === 2 ? center(feet) : at;
  return (feet?.length === 2 ? feet : [{ x: at.x - .42, y: at.y }, { x: at.x + .42, y: at.y }]).map(foot => Object.freeze({ x: at.x + foot.x - origin.x, y: at.y + foot.y - origin.y }));
}
