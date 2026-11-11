// Generation-only adapter for the active grounded trainer pose. It derives
// exact impact inputs, not a physiological limit or a new authored rule.
import { evaluateTrainerContactSupport } from './trainer-contact-support.js';
import { sampleActorBoardPositionV2, sampleActorFeetV2 } from './play-actors-v2.js';

export const GENERATED_TRAINER_SUPPORT_V1 = Object.freeze({
  version: 'generated-trainer-support-v1',
  scope: 'selected-generation-trainer-model',
  supportModuleSha256: '5bca9a3854b52a51908de7d592385bed9708e9caec7f69142deaa5367d6c991c',
});
const METRES_PER_FOOT = .3048;
const EPS = 1e-8;
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const boardPoint = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);
const worldPoint = value => value && ['x', 'y', 'z'].every(key => Number.isFinite(value[key]));
const world = (point, heightFeet = 0) => ({x: (point.x - 10) * METRES_PER_FOOT, y: heightFeet * METRES_PER_FOOT, z: (point.y - 22) * METRES_PER_FOOT});
const xyz = point => ({x: point.x, y: point.y, z: point.z});
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const unsupported = reason => freeze({supported: false, feasible: null, reason, code: 'unsupported-trainer-context', ...GENERATED_TRAINER_SUPPORT_V1});
const durationOf = flight => flight?.totalDuration ?? flight?.flightDuration;
function velocity(flight, endTime, atEnd) {
  const dt = Math.min(.0001, endTime / 4), a = atEnd ? endTime - dt : 0, b = atEnd ? endTime : dt;
  const from = flight.sample(a), to = flight.sample(b);
  if (!worldPoint(from) || !worldPoint(to)) throw new TypeError('Flight samples must be finite world points.');
  return {x: (to.x - from.x) / (b - a), y: (to.y - from.y) / (b - a), z: (to.z - from.z) / (b - a)};
}
const normalizeHorizontal = (value, fallback = {x: 0, z: 1}) => {
  const length = Math.hypot(value.x, value.z);
  return length > 1e-9 ? {x: value.x / length, z: value.z / length} : {...fallback};
};

/** Board-space contact/feet/stance plus shared solver flights. incomingTimeSeconds
 * is the actual selected incoming contact time, never an untruncated bounce end.
 * The returned input is detached exact world-space evidence for review/parity. */
export function assessGeneratedTrainerSupportV1({contact, feet, stance, handedness, strokeSide, family, kind,
  outgoingFlight, incomingFlight = null, incomingTimeSeconds = null, nearCourt} = {}) {
  if (!boardPoint(contact) || !Number.isFinite(contact.heightFeet) || contact.heightFeet < 0 || !boardPoint(stance)
    || !Array.isArray(feet) || feet.length !== 2 || !feet.every(boardPoint)) return unsupported('Finite board contact, grounded stance and two actual feet are required.');
  if (feet.some(foot => foot.heightFeet !== undefined && foot.heightFeet !== 0)
    || stance.heightFeet !== undefined && stance.heightFeet !== 0) return unsupported('Only grounded contact roots and sole targets are supported.');
  if (typeof nearCourt !== 'boolean' || !['left', 'right'].includes(handedness) || !['forehand', 'backhand'].includes(strokeSide)
    || !['serve', 'groundstroke', 'volley', 'short-hop'].includes(kind)) return unsupported('Actual court end, physical hand, resolved stroke side and contact kind are required.');
  const duration = durationOf(outgoingFlight);
  if (typeof outgoingFlight?.sample !== 'function' || !Number.isFinite(duration) || duration <= 0
    || !Number.isFinite(outgoingFlight.flightDuration) || outgoingFlight.flightDuration < 0) return unsupported('An actual outgoing shared-solver world flight is required.');
  if (incomingFlight !== null && (typeof incomingFlight?.sample !== 'function' || !Number.isFinite(durationOf(incomingFlight))
    || !Number.isFinite(incomingTimeSeconds) || incomingTimeSeconds <= 0 || incomingTimeSeconds > durationOf(incomingFlight) + EPS)) {
    return unsupported('Incoming flight requires its actual positive contact time inside the represented flight.');
  }
  if (incomingFlight === null && incomingTimeSeconds !== null) return unsupported('Incoming timing cannot be supplied without its flight.');
  try {
    const start = outgoingFlight.start ?? outgoingFlight.sample(0), after = outgoingFlight.sample(Math.min(.06, outgoingFlight.flightDuration));
    if (!worldPoint(start) || !worldPoint(after) || distance(start, world(contact, contact.heightFeet)) > EPS) return unsupported('Actual outgoing flight start must match the represented contact.');
    if (incomingFlight) {
      const incomingContact = incomingFlight.sample(incomingTimeSeconds);
      if (!worldPoint(incomingContact) || distance(incomingContact, start) > EPS) return unsupported('Actual incoming contact must match the outgoing flight start.');
    }
    const sorted = feet.map(foot => ({...foot})).sort((a, b) => a.x - b.x);
    const soles = {left: world(sorted[nearCourt ? 1 : 0]), right: world(sorted[nearCourt ? 0 : 1])};
    const court = {x: 0, z: nearCourt ? 1 : -1};
    // Match the presentation's outgoing tangent and final contact normalization.
    const outgoing = normalizeHorizontal({x: after.x - start.x, z: after.z - start.z});
    const bodyFacing = normalizeHorizontal(outgoing, court);
    const resolvedFamily = kind === 'short-hop' && !['serve', 'overhead'].includes(family) ? 'short-hop' : family;
    const input = {root: world(stance), contact: xyz(start), feet: soles, handedness, strokeSide, family: resolvedFamily, bodyFacing,
      outgoingVelocity: velocity(outgoingFlight, duration, false),
      incomingVelocity: incomingFlight ? velocity(incomingFlight, incomingTimeSeconds, true) : null,
      modelVersion: 2, phase: 1, grounded: true, planted: true,
      coachingFootwork: {mode: 'plant', load: .5, feet: soles,
        footYaw: {left: nearCourt ? 0 : Math.PI, right: nearCourt ? 0 : Math.PI}, footPitch: {left: 0, right: 0},
        pelvisDrop: 0, splitStepLift: 0, splitLoad: 0}};
    const evaluation = evaluateTrainerContactSupport(input);
    return freeze({...evaluation, ...GENERATED_TRAINER_SUPPORT_V1, input,
      code: !evaluation.supported ? 'unsupported-trainer-context' : evaluation.feasible ? null : 'unsupported-grounded-trainer-pose'});
  } catch (error) {
    if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
    return unsupported(error.message);
  }
}

function movingMomentumAtContact(segment, actor) {
  const absolute = segment.startTime + segment.contactTime;
  const active = (segment.model2Momentum || []).filter(item => item.actor === actor && item.contactTime <= absolute + 1e-9);
  const root = active.reduce((best, item) => !best || item.contactTime > best.contactTime ? item : best, null), foot = active.at(-1);
  const moving = (from, to) => Math.hypot(to.x - from.x, to.y - from.y) > 1e-10;
  return root && absolute < root.time - 1e-9 && moving(root.from, root.to)
    || foot && absolute < foot.contactTime + Math.max(.001, foot.time - foot.contactTime) - 1e-9
      && foot.fromFeet.some((from, index) => moving(from, foot.feet[index]));
}

/** Recompute only actual compiled contact evidence. Neither generated audit
 * metadata nor a counterfactual hand establishes support. */
export function inspectGeneratedTrainerSupportV1({timeline, players} = {}) {
  if (!Array.isArray(timeline?.segments)) throw new TypeError('A compiled Model-2 timeline is required for trainer support inspection.');
  const violations = [], unsupportedContexts = [];
  let checkedContacts = 0, maximumReachErrorMetres = 0, maximumLegErrorMetres = 0;
  for (const [index, segment] of timeline.segments.entries()) {
    const actor = segment.shotSemantics?.playerId, shotId = segment.step?.id ?? null;
    let result;
    if (segment.modelVersion !== 2 || !actor) result = unsupported('Only represented Model-2 shot contacts are supported.');
    else if (movingMomentumAtContact(segment, actor)) result = unsupported('An active moving momentum contact is outside stationary grounded trainer support.');
    else {
      const prior = timeline.segments[index - 1], semantics = segment.shotSemantics;
      result = assessGeneratedTrainerSupportV1({
        contact: semantics.contact.point, feet: sampleActorFeetV2(segment, actor, segment.contactTime),
        stance: sampleActorBoardPositionV2(segment, actor, segment.contactTime),
        handedness: players?.[actor]?.handedness, strokeSide: semantics.strokeSide,
        family: segment.step.shot?.authoring?.family ?? semantics.shotType ?? semantics.stroke,
        kind: semantics.contact.kind, nearCourt: segment.previous.positions[actor].y < 22,
        outgoingFlight: segment.trajectory, incomingFlight: prior?.trajectory ?? null,
        incomingTimeSeconds: prior ? durationOf(prior.trajectory) : null,
      });
    }
    checkedContacts++;
    if (!result.supported) unsupportedContexts.push(freeze({shotId, actor, code: result.code, reason: result.reason}));
    else {
      maximumReachErrorMetres = Math.max(maximumReachErrorMetres, result.reachError);
      maximumLegErrorMetres = Math.max(maximumLegErrorMetres, result.legError);
      if (!result.feasible) violations.push(freeze({shotId, actor, code: result.code, reason: result.reason,
        reachErrorMetres: result.reachError, legErrorMetres: result.legError, diagnostics: result.diagnostics}));
    }
  }
  return freeze({...GENERATED_TRAINER_SUPPORT_V1, valid: !violations.length && !unsupportedContexts.length,
    supported: !unsupportedContexts.length, checkedContacts, maximumReachErrorMetres, maximumLegErrorMetres,
    violations, unsupportedContexts});
}
