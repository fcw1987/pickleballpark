// Execution and causation are explicit tactical heuristics. Physical outcomes
// are established separately by the shared solver and model2 rule validator.
import { assessReach } from './rally-tactics.js';
import { PHYSICS_V2, sampleFlightVelocityV2 } from './play-physics-v2.js';
import { planRallyFlightV1, MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET } from './rally-flight-planner.js';
import { isInNonVolleyZone } from './court-geometry.js';

export const QUALITY_VERSION = 'rally-quality-v1';
export const CAUSATION_VERSION = 'rally-causation-v1';
export const FORMATION_PRESSURE_VERSION = 'rally-formation-pressure-v1';
export const PHYSICAL_TRANSFORMATION_VERSION = 'rally-execution-physical-v3';
export const DINK_POPUP_VERSION = 'rally-dink-popup-v1';
export const RISK_CONTEXT_VERSION = 'rally-execution-risk-v1';
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const point = (p, name) => { if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError(`${name} needs finite board coordinates.`); };
const draw = (n, name) => { if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError(`${name} must be in [0,1).`); return n; };
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const PHASES = new Set(['serve', 'return', 'third', 'transition', 'kitchen', 'hands', 'scramble']);
const ATTACKS = new Set(['drive', 'third-shot-drive', 'speed-up', 'counter', 'put-away', 'overhead']);
const FORMATIONS = new Set(['back', 'split', 'up']);
const VELOCITY_PHASES = new Set(['flight', 'post-bounce', 'net-drop']);
const SOFT_FAMILIES = new Set(['dink', 'drop', 'reset']);
const SOFT_INTENTS = new Set(['dink', 'cross-court-dink', 'middle-dink', 'straight-dink', 'backhand-dink', 'drop', 'third-shot-drop', 'reset', 'block']);
const QUALITY_CLEARANCES = Object.freeze({
  low: { serve: .8, return: .8, drive: .4, volley: .3, dink: .2, drop: .35, reset: .35 },
  excellent: { serve: 1, return: 1, drive: .55, volley: .4, dink: .28, drop: .48, reset: .48 },
});

function checkedContactVelocity(value, incomingFlight, contact) {
  if (value === null || value === undefined) return null;
  const fields = ['timeSeconds', 'xFeetPerSecond', 'yFeetPerSecond', 'heightFeetPerSecond', 'speedMph'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 'play-velocity-v2'
    || !VELOCITY_PHASES.has(value.phase) || fields.some(key => !Number.isFinite(value[key]))
    || value.timeSeconds < 0 || value.speedMph < 0) throw new TypeError('Incoming contact velocity requires supported finite sampled evidence.');
  const speedMph = Math.hypot(value.xFeetPerSecond, value.yFeetPerSecond, value.heightFeetPerSecond) / (22 / 15);
  if (Math.abs(speedMph - value.speedMph) > 1e-6) throw new RangeError('Incoming contact velocity components and speed must agree.');
  if (incomingFlight?.stages) {
    const actual = sampleFlightVelocityV2(incomingFlight, value.timeSeconds);
    if (actual.phase !== value.phase || fields.some(key => Math.abs(actual[key] - value[key]) > 1e-6)) throw new RangeError('Incoming contact velocity must match the supplied solved flight.');
    const at = incomingFlight.sampleBoard(value.timeSeconds);
    if (['x', 'y', 'heightFeet'].some(key => Math.abs(at[key] - contact[key]) > 1e-6)) throw new RangeError('Incoming contact velocity time must match the actual contact.');
  }
  return { version: value.version, phase: value.phase, ...Object.fromEntries(fields.map(key => [key, value[key]])) };
}

export function assessPressureV1({ contact, position, availableSeconds = 1, incomingFlight = null,
  incomingIntent = null, movementSpeedFeetPerSecond = 0, selfPaced = false,
  ownFormation = null, opponentFormation = null, incomingContactVelocity = null } = {}) {
  point(contact, 'contact'); point(position, 'position');
  if (typeof selfPaced !== 'boolean') throw new TypeError('selfPaced must be boolean.');
  if ([ownFormation, opponentFormation].some(value => value !== null && !FORMATIONS.has(value))) throw new TypeError('Pressure formations must be back, split, up or unavailable.');
  if (!Number.isFinite(availableSeconds) || availableSeconds < 0 || !Number.isFinite(movementSpeedFeetPerSecond) || movementSpeedFeetPerSecond < 0) throw new TypeError('Pressure needs finite nonnegative time and movement speed.');
  const reach = assessReach(position, contact, availableSeconds), margin = reach.radiusFeet - reach.distanceFeet;
  if (!Number.isFinite(contact.heightFeet) || contact.heightFeet < 0) throw new TypeError('Pressure requires the actual finite contact height.');
  const heightFeet = contact.heightFeet;
  const velocity = checkedContactVelocity(incomingContactVelocity, incomingFlight, contact);
  const launchSpeed = Number.isFinite(incomingFlight?.launchSpeedMph) ? incomingFlight.launchSpeedMph
    : Number.isFinite(incomingFlight?.metadata?.launchSpeedMph) ? incomingFlight.metadata.launchSpeedMph : null;
  const incomingSpeedMph = velocity?.speedMph ?? launchSpeed ?? 0;
  // Serve preparation is self-paced, not a reaction to an incoming flight.
  // Retain the actual time/reach facts without charging incoming-time pressure.
  const reachLoad = selfPaced ? 0 : clamp(1 - margin / 6, 0, 1), shortTime = selfPaced ? 0 : clamp((.65 - availableSeconds) / .5, 0, 1);
  const movementLoad = clamp(movementSpeedFeetPerSecond / 14, 0, 1), speedLoad = ATTACKS.has(incomingIntent) ? clamp((incomingSpeedMph - 15) / 30, 0, 1) : 0;
  const lowLoad = heightFeet < 1.2 ? clamp((1.2 - heightFeet) / 1.2, 0, 1) : 0;
  // Court control can constrain a reply even when the incoming ball is easy
  // to reach. This heuristic depends on represented pair formations only;
  // service identity and a requested winner do not enter it.
  const formationLoad = selfPaced || opponentFormation !== 'up' ? 0 : ownFormation === 'back' ? .25 : ownFormation === 'split' ? .12 : 0;
  // Null (including omitted/undefined defaults) means unavailable evidence.
  const formation = ownFormation !== null || opponentFormation !== null
    ? { version: FORMATION_PRESSURE_VERSION, ownFormation, opponentFormation, pressureLoad: formationLoad } : null;
  const score = clamp(reachLoad * .4 + shortTime * .2 + movementLoad * .2 + speedLoad * .15 + lowLoad * .05 + formationLoad, 0, 1);
  return freeze({ version: QUALITY_VERSION, score, reachMarginFeet: margin, distanceFeet: reach.distanceFeet,
    reachable: reach.reachable, availableSeconds, movementSpeedFeetPerSecond, contactHeightFeet: heightFeet,
    incomingSpeedMph, incomingIntent: typeof incomingIntent === 'string' ? incomingIntent : null,
    incomingLaunchSpeedMph: launchSpeed, incomingSpeedBasis: velocity ? 'sampled-contact-velocity' : launchSpeed !== null ? 'launch-speed-fallback' : 'unavailable',
    ...(velocity ? { incomingContactVelocity: velocity } : {}),
    ...(selfPaced ? { selfPaced: true } : {}),
    ...(formation ? { formation } : {}),
    factors: { reachLoad, shortTime, movementLoad, speedLoad, lowLoad, ...(formation ? { formationLoad } : {}) } });
}

export function sampleExecutionV1({ profile, situation = {}, choice = null, draws } = {}) {
  const phase = situation.phase === 'third-shot' ? 'third' : situation.phase === 'hands-battle' ? 'hands' : situation.phase ?? 'kitchen';
  if (!PHASES.has(phase)) throw new RangeError('Unsupported execution phase.');
  const source = profile?.execution?.[phase];
  if (!source) throw new TypeError(`No execution profile for phase ${phase}.`);
  const weights = Object.fromEntries(['error', 'attackable', 'excellent', 'low'].map(key => [key, source[key] ?? 0]));
  if (Object.values(weights).some(p => !Number.isFinite(p) || p < 0 || p > 1) || Object.values(weights).reduce((a, b) => a + b, 0) > 1 + 1e-9) throw new RangeError('Execution probabilities must be finite, nonnegative and sum to at most 1.');
  const pressure = situation.pressure ? structuredClone(situation.pressure) : null, pressureScore = clamp(finite(pressure?.score), 0, 1);
  if (profile.settledSoftError !== undefined && (!Number.isFinite(profile.settledSoftError) || profile.settledSoftError < 0 || profile.settledSoftError > 1)) throw new RangeError('Settled soft error must be finite in [0,1].');
  const selected = choice && typeof choice === 'object' && !Array.isArray(choice)
    ? Object.fromEntries(['family', 'pace', 'intent'].map(key => [key, typeof choice[key] === 'string' ? choice[key] : null])) : null;
  // These are narrow opportunity priors, not empirical player ratings. Every
  // required fact must be represented; an absent fact retains the phase risk.
  const conditions = {
    profilePrior: profile.settledSoftError !== undefined,
    kitchen: situation.phase === 'kitchen', allFourUp: situation.allFourUp === true,
    grounded: situation.hitterFootState?.grounded === true,
    outsideNVZ: situation.hitterFootState?.outsideNVZ === true,
    establishedOutsideNVZ: situation.hitterFootState?.establishedOutsideNVZ === true,
    actualOutsideFeet: Array.isArray(situation.feet) && situation.feet.length === 2 && situation.feet.every(foot =>
      foot && Number.isFinite(foot.x) && Number.isFinite(foot.y) && !isInNonVolleyZone(foot)),
    notAttackable: situation.attackable === false,
    incomingSoft: SOFT_FAMILIES.has(situation.incomingFamily) && situation.incomingPace === 'soft',
    selectedSoft: SOFT_FAMILIES.has(selected?.family) && selected?.pace === 'soft' && SOFT_INTENTS.has(selected?.intent),
    lowPressure: Number.isFinite(pressure?.score) && pressure.score >= 0 && pressure.score < .15,
    adequateTime: Number.isFinite(pressure?.availableSeconds) && pressure.availableSeconds >= .5,
    reachMargin: Number.isFinite(pressure?.reachMarginFeet) && pressure.reachMarginFeet >= 2,
    settledMovement: Number.isFinite(pressure?.movementSpeedFeetPerSecond) && pressure.movementSpeedFeetPerSecond >= 0 && pressure.movementSpeedFeetPerSecond <= 3,
    actualSoftSpeed: pressure?.incomingSpeedBasis === 'sampled-contact-velocity' && Number.isFinite(pressure?.incomingSpeedMph)
      && pressure.incomingSpeedMph >= 0 && pressure.incomingSpeedMph < 22,
  };
  const settled = Object.values(conditions).every(Boolean), phaseBaseError = weights.error;
  if (settled) weights.error = profile.settledSoftError;
  const baseError = weights.error;
  const errorScale = profile.pressureErrorScale ?? .15;
  if (!Number.isFinite(errorScale) || errorScale < 0 || errorScale > 1) throw new RangeError('Pressure error scale must be in [0,1].');
  const extraError = pressureScore * errorScale;
  weights.error = Math.min(.9, weights.error + extraError);
  const otherTotal = weights.attackable + weights.excellent + weights.low;
  if (otherTotal > 1 - weights.error) {
    const scale = (1 - weights.error) / otherTotal;
    for (const key of ['attackable', 'excellent', 'low']) weights[key] *= scale;
  }
  weights.neutral = Math.max(0, 1 - weights.error - weights.attackable - weights.excellent - weights.low);
  const roll = draw(draws?.quality, 'quality draw'); let cumulative = 0, quality = 'neutral';
  for (const key of ['error', 'attackable', 'excellent', 'low', 'neutral']) { cumulative += weights[key]; if (roll < cumulative) { quality = key; break; } }
  let errorReason = null;
  if (quality === 'error') {
    const errorWeights = profile.errorWeights ?? { net: .5, long: .3, wide: .2 };
    const total = ['net', 'long', 'wide'].reduce((sum, key) => sum + (errorWeights[key] ?? 0), 0);
    if (!(total > 0) || ['net', 'long', 'wide'].some(key => !Number.isFinite(errorWeights[key] ?? 0) || (errorWeights[key] ?? 0) < 0)) throw new RangeError('Error weights must be finite, nonnegative and nonempty.');
    const errorRoll = draw(draws?.error, 'error draw') * total; let bound = 0;
    for (const reason of ['net', 'long', 'wide']) { bound += errorWeights[reason] ?? 0; if (errorRoll < bound) { errorReason = reason; break; } }
  }
  return freeze({ version: QUALITY_VERSION, quality, errorReason, probabilities: weights,
    pressure, draw: roll, ...(quality === 'error' ? { errorDraw: draws.error } : {}),
    riskContext: { version: RISK_CONTEXT_VERSION, kind: settled ? 'settled-soft' : 'phase-default', phase,
      phaseBaseErrorProbability: phaseBaseError, baseErrorProbability: baseError, pressureErrorAddition: extraError,
      choice: selected, conditions, incomingSpeedBasis: pressure?.incomingSpeedBasis ?? null,
      incomingSpeedMph: Number.isFinite(pressure?.incomingSpeedMph) ? pressure.incomingSpeedMph : null } });
}

/** Perturb target and shape preferences without solving or preserving an old
 * vertical equality across a different landing. Delivery performs one joint solve. */
export function applyExecutionV1({ execution, target, contact, team, physics, family = 'drive', pace = 'medium', arc = 'medium',
  intent = null, style = 'advanced', route = 'over-net', draws } = {}) {
  point(target, 'target'); point(contact, 'contact');
  if (!Number.isFinite(contact.heightFeet) || contact.heightFeet < 0) throw new TypeError('Execution requires the actual finite contact height.');
  if (!['green', 'orange'].includes(team) || !['error', 'attackable', 'excellent', 'low', 'neutral'].includes(execution?.quality)) throw new TypeError('Execution quality and team are required.');
  const lateral = draw(draws?.lateral, 'lateral target draw'), depth = draw(draws?.depth, 'depth target draw');
  const spread = execution.quality === 'excellent' ? .15 : execution.quality === 'low' ? .2 : execution.quality === 'attackable' ? .75 : .4;
  const next = { x: clamp(target.x + (lateral - .5) * 2 * spread, -8, 28), y: clamp(target.y + (depth - .5) * 2 * spread, -8, 52) };
  const preferredFlight = Object.fromEntries(['speedMph', 'apexFeet', 'launchVerticalFeetPerSecond'].filter(key => Number.isFinite(physics?.[key])).map(key => [key, physics[key]]));
  let transformation = 'target-precision', requestedClearanceFeet = null, dinkPopup = null;
  if (execution.quality === 'error') {
    if (execution.errorReason === 'net') {
      // One fixed draw-derived mesh endpoint permits a real collision even
      // from a high contact. No clearance or endpoint retry cascade.
      next.x = clamp(target.x, 2, 18);
      next.y = 22 + (team === 'green' ? 1 : -1) * (.3 + .3 * depth);
      requestedClearanceFeet = -1.5;
      transformation = 'net-mesh';
    } else if (execution.errorReason === 'long') {
      next.y = team === 'green' ? 45 + depth * 3 : -1 - depth * 3;
      transformation = 'error-target';
    } else if (execution.errorReason === 'wide') {
      next.x = target.x < 10 ? -.5 - lateral * 3 : 20.5 + lateral * 3;
      transformation = 'error-target';
    } else throw new TypeError('An execution error needs a supported target perturbation reason.');
  } else if (execution.quality === 'attackable' && SOFT_FAMILIES.has(family)) {
    // A weak dink must carry its loft toward the receiver, rather than crest
    // at the net and fall below ordinary line reach. This fixed draw mapping
    // stays inside the intended NVZ; it does not certify an opponent attack.
    // Drop/reset retain their previous mapping until separately witnessed.
    if (isInNonVolleyZone(target)) {
      next.x = clamp(next.x, .8, 19.2);
      const baselineDepth = family === 'dink' ? 15.05 + .25 * depth : 15.2 + 1.2 * depth;
      next.y = team === 'green' ? 44 - baselineDepth : baselineDepth;
    }
    if (family === 'dink') {
      delete preferredFlight.launchVerticalFeetPerSecond;
      preferredFlight.apexFeet = Math.max(contact.heightFeet, 6.4);
      transformation = 'dink-popup';
      dinkPopup = { version: DINK_POPUP_VERSION, sampledWeakness: 'soft-popup',
        receiverOpportunity: { status: 'unestablished', scope: 'at-delivery',
          reason: 'Execution shape alone does not establish a legal opponent contact and attacking reply.' } };
    } else {
      requestedClearanceFeet = family === 'drop' ? 1.6 : 1.2;
      transformation = 'soft-popup';
    }
  } else if (QUALITY_CLEARANCES[execution.quality]?.[family] !== undefined) {
    requestedClearanceFeet = QUALITY_CLEARANCES[execution.quality][family];
    transformation = 'controlled-clearance';
  } else if (['lob', 'overhead'].includes(family)) {
    transformation = 'family-shape-preference';
  } else if (Number.isFinite(preferredFlight.apexFeet)) {
    const shift = execution.quality === 'attackable' ? .6 : execution.quality === 'low' ? -.2 : 0;
    preferredFlight.apexFeet = clamp(preferredFlight.apexFeet + shift, contact.heightFeet, 30);
    if (shift) transformation = 'apex-perturbation';
  } else if (Number.isFinite(preferredFlight.launchVerticalFeetPerSecond) && execution.quality === 'attackable') {
    preferredFlight.launchVerticalFeetPerSecond = clamp(preferredFlight.launchVerticalFeetPerSecond + 2, -80, 80);
    transformation = 'launch-loft';
  }
  if (requestedClearanceFeet !== null) {
    // The new quality hint supersedes the nominal vertical recipe rather than
    // imposing both constraints on the same landing.
    delete preferredFlight.launchVerticalFeetPerSecond; delete preferredFlight.apexFeet;
    preferredFlight.clearanceFeet = requestedClearanceFeet;
  }
  return freeze({ target: next, quality: execution.quality, pace, arc, preferredFlight, intent, style: typeof style === 'string' ? style : style?.id, route, intendedError: execution.errorReason,
    physicalTransformation: { version: PHYSICAL_TRANSFORMATION_VERSION, kind: transformation, family, quality: execution.quality,
      sourceContact: { x: contact.x, y: contact.y, heightFeet: contact.heightFeet }, sourceTarget: { x: target.x, y: target.y },
      sourcePhysics: physics ? { ...physics } : null, target: { ...next }, preferredFlight: { ...preferredFlight },
      physics: null, targetSpreadFeet: spread, requestedClearanceFeet, solvedClearanceFeet: null, solveAttempts: [],
      ...(dinkPopup ? { dinkPopup } : {}) } });
}

// Section 7 ranges are illustrative diagnostics, not simultaneous equations.
// Every newly generated family is constrained by the shared planner envelope.
export const DELIVERED_FLIGHT_VERSION = 'rally-delivered-flight-v2';
function deliveredRanges(candidate, execution, style) {
  if (['speed-up', 'counter'].includes(candidate.intent)) return { speedMph: [30, 45], netClearanceInches: [2, 12], apexFeet: [0, 4.5] };
  const rec = (typeof style === 'string' ? style : style?.id) !== 'pro';
  return ({
    serve: { speedMph: [25, 40], netClearanceInches: [12, 30], apexFeet: [6, 8] },
    return: { speedMph: [22, 36], netClearanceInches: [12, 30], apexFeet: [6, 8] },
    drive: { speedMph: rec ? [28, 38] : [35, 45], netClearanceInches: [6, 16], apexFeet: [3.5, 5] },
    drop: { speedMph: [15, 22], netClearanceInches: [6, 18], apexFeet: [5.5, 7] },
    dink: execution.quality === 'attackable'
      ? { speedMph: [10, 16], netClearanceInches: [14, 24], apexFeet: [4.5, 5.5] }
      : { speedMph: [8, 14], netClearanceInches: [2, 10], apexFeet: [3.4, 4.2] },
    reset: { speedMph: [10, 16], netClearanceInches: [2, 10], apexFeet: [3.4, 4.5] },
    lob: { speedMph: [18, 25], apexFeet: [15, 22] },
    overhead: { speedMph: [35, 45], contactHeightFeet: [7, 8.5] },
  })[candidate.family] ?? {};
}
function deliveredFacts(flight, team) {
  const m = flight.metadata, landing = flight.landing;
  return { source: 'play-physics-v2', launchSpeedMph: m.launchSpeedMph,
    speedMph: m.launchSpeedMph, launchVerticalFeetPerSecond: m.launchVerticalFeetPerSecond,
    netClearanceInches: m.netClearanceInches, apexFeet: m.apexFeet, contactHeightFeet: m.contactHeightFeet,
    landing: { x: landing.x, y: landing.y, heightFeet: landing.heightFeet },
    opponentLanding: landing.x >= 0 && landing.x <= 20 && (team === 'green' ? landing.y > 22 && landing.y <= 44 : landing.y >= 0 && landing.y < 22),
    obstruction: flight.obstruction?.kind ?? null, terminalReason: flight.terminal?.reason ?? null };
}
/** All generated families and errors receive one bounded joint solve after
 * perturbation. External source physics is a preference, never an admission flag. */
export function resolveDeliveredFlightV1({ candidate, contact, team, execution, applied, style = applied?.style ?? 'advanced',
  intent = candidate?.intent ?? applied?.intent ?? null, route = applied?.route ?? 'over-net' } = {}) {
  point(contact, 'contact'); point(applied?.target, 'applied.target');
  if (!['green', 'orange'].includes(team) || !candidate?.family || !['error', 'attackable', 'excellent', 'low', 'neutral'].includes(execution?.quality)) throw new TypeError('Delivered flight requires a candidate, team and execution quality.');
  const preferred = applied.preferredFlight ?? Object.fromEntries(['speedMph', 'apexFeet', 'launchVerticalFeetPerSecond']
    .filter(key => Number.isFinite(applied.physics?.[key])).map(key => [key, applied.physics[key]]));
  // A fixed wide execution can miss outside a post without becoming an ATP
  // tactical selection. Nominal route admission remains strict; only delivered
  // geometry follows the exact sampled contact-to-target chord.
  const errorReason = execution.quality === 'error' ? execution.errorReason ?? applied.intendedError ?? null : null;
  const fraction = (22 - contact.y) / (applied.target.y - contact.y);
  const netX = contact.x + (applied.target.x - contact.x) * fraction;
  const incidentalAroundPost = route === 'over-net' && errorReason === 'wide' && fraction > 0 && fraction < 1
    && (netX < -1.25 - PHYSICS_V2.ballRadiusFeet || netX > 21.25 + PHYSICS_V2.ballRadiusFeet);
  const deliveredRoute = incidentalAroundPost ? 'around-the-post' : route;
  const planner = planRallyFlightV1({ from: contact, target: applied.target, family: candidate.family, intent, style,
    quality: execution.quality, pace: applied.pace ?? candidate.pace ?? 'medium', arc: applied.arc ?? candidate.arc ?? 'medium',
    preferred, route: deliveredRoute, allowNetFault: true, errorReason });
  const shared = { version: DELIVERED_FLIGHT_VERSION, plannerVersion: planner.plannerVersion,
    accepted: planner.status === 'solved', nominalRoute: route, deliveredRoute, incidentalAroundPost,
    source: { target: { ...applied.target }, preferredFlight: { ...preferred } },
    trials: planner.diagnostics.trials, maximumTrials: MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET,
    speedCeilingMph: planner.diagnostics.speedCeilingMph, plannerDiagnostics: planner.diagnostics,
    limitations: ['Constant gravity; no drag or spin forces.', 'Section 7 illustrative ranges are preferences; actual generation envelopes are enforced.',
      ...(execution.quality === 'error' ? ['Sampled error target and quality preserved; actual earlier physical faults remain authoritative.'] : [])] };
  if (planner.status !== 'solved') {
    const error = new RangeError(`Delivered flight unavailable: ${planner.diagnostics.reason}`);
    error.guidance = freeze(shared); error.plannerDiagnostics = planner.diagnostics; throw error;
  }
  const ranges = deliveredRanges(candidate, execution, style), sourceApplied = structuredClone(applied);
  const solutions = planner.solutions.map((solution, selectionIndex) => {
    const { flight, physics, evidence } = solution, actual = deliveredFacts(flight, team);
    const diagnostics = Object.entries(ranges).map(([metric, range]) => ({ metric, range, actual: actual[metric],
      withinRange: actual[metric] === null ? null : actual[metric] >= range[0] && actual[metric] <= range[1] }));
    const selected = { ...sourceApplied, physics, ...(sourceApplied.physicalTransformation ? { physicalTransformation: {
      ...sourceApplied.physicalTransformation, physics, solvedClearanceFeet: evidence.actual.clearanceFeet,
      plannerVersion: planner.plannerVersion } } : {}) };
    return { applied: selected, flight, evidence,
      guidance: { ...shared, actual, diagnostics, selectionIndex, evidence,
        repaired: JSON.stringify(applied.physics ?? null) !== JSON.stringify(physics) } };
  });
  return freeze({ ...solutions[0], solutions });
}

export function classifyOutcomeV1({ outcome, pressure = null, pressureDecisionId = null, execution = null,
  actor = outcome?.faultingActor ?? null, previousIntent = pressure?.incomingIntent } = {}) {
  if (!outcome || typeof outcome.shotId !== 'string') throw new TypeError('A physically validated outcome is required.');
  const facts = pressure ? {
    score: clamp(finite(pressure.score), 0, 1), reachMarginFeet: finite(pressure.reachMarginFeet, 999),
    availableSeconds: finite(pressure.availableSeconds, 999), movementSpeedFeetPerSecond: finite(pressure.movementSpeedFeetPerSecond),
    incomingSpeedMph: finite(pressure.incomingSpeedMph), contactHeightFeet: finite(pressure.contactHeightFeet, 2.2),
  } : null;
  let kind = 'unknown', basis = 'insufficient represented tactical evidence';
  if (outcome.type === 'winner' && outcome.reason === 'unreachable') { kind = 'winner'; basis = 'independently validated unreachable result'; }
  else if (['body', 'nvz-foot', 'nvz-momentum', 'two-bounce'].includes(outcome.reason)) { kind = 'rule-fault'; basis = 'independently validated rule ending'; }
  else if (['net', 'long', 'wide'].includes(outcome.reason) && facts) {
    const pressuredFacts = [facts.reachMarginFeet < 1.2, facts.availableSeconds < .45, facts.movementSpeedFeetPerSecond > 7, facts.incomingSpeedMph > 25, facts.contactHeightFeet < 1.2].filter(Boolean).length;
    if (facts.score >= .6 && pressuredFacts >= 2 && ATTACKS.has(previousIntent) && typeof pressureDecisionId === 'string' && pressureDecisionId.length > 0 && pressureDecisionId.length <= 128) {
      kind = 'forced-error'; basis = 'preceding attack plus multiple represented pressure facts';
    } else if (facts.score < .35 && facts.reachMarginFeet >= 2 && facts.availableSeconds >= .5 && facts.movementSpeedFeetPerSecond <= 3 && execution?.quality === 'error') {
      kind = 'unforced-error'; basis = 'sampled execution error with represented low-pressure opportunity';
    }
  }
  return freeze({ version: CAUSATION_VERSION, kind, shotId: outcome.shotId, actor,
    pressureDecisionId: typeof pressureDecisionId === 'string' && pressureDecisionId.length <= 128 ? pressureDecisionId : null,
    evidence: { heuristic: true, basis, facts, previousIntent: typeof previousIntent === 'string' ? previousIntent.slice(0, 40) : null } });
}
