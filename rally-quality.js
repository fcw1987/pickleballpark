// Execution and causation are explicit tactical heuristics. Physical outcomes
// are established separately by the shared solver and model2 rule validator.
import { assessReach } from './rally-tactics.js';
import { solveFlightV2, solveFlightForClearanceV2, sampleFlightVelocityV2 } from './play-physics-v2.js';
import { isInNonVolleyZone } from './court-geometry.js';

export const QUALITY_VERSION = 'rally-quality-v1';
export const CAUSATION_VERSION = 'rally-causation-v1';
export const FORMATION_PRESSURE_VERSION = 'rally-formation-pressure-v1';
export const PHYSICAL_TRANSFORMATION_VERSION = 'rally-execution-physical-v1';
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

/** Perturb source parameters only. This does not claim that a sampled error
 * ended the point: the real solved geometry may supply a different result. */
export function applyExecutionV1({ execution, target, contact, team, physics, family = 'drive', pace = 'medium', arc = 'medium', draws } = {}) {
  point(target, 'target'); point(contact, 'contact');
  if (!Number.isFinite(contact.heightFeet) || contact.heightFeet < 0) throw new TypeError('Execution requires the actual finite contact height.');
  if (!['green', 'orange'].includes(team) || !['error', 'attackable', 'excellent', 'low', 'neutral'].includes(execution?.quality)) throw new TypeError('Execution quality and team are required.');
  const lateral = draw(draws?.lateral, 'lateral target draw'), depth = draw(draws?.depth, 'depth target draw');
  const spread = execution.quality === 'excellent' ? .15 : execution.quality === 'low' ? .2 : execution.quality === 'attackable' ? .75 : .4;
  const next = { x: clamp(target.x + (lateral - .5) * 2 * spread, -8, 28), y: clamp(target.y + (depth - .5) * 2 * spread, -8, 52) };
  let adjusted = physics ? { ...physics } : undefined;
  let transformation = 'target-precision', requestedClearanceFeet = null, solvedClearanceFeet = null;
  const solveAttempts = [];
  if (execution.quality === 'error') {
    if (execution.errorReason === 'net') {
      next.x = clamp(target.x, 2, 18);
      requestedClearanceFeet = -1.5;
      let meshFlight = null;
      // A low contact cannot be assigned a fixed downward launch: its tiny
      // ground time would create extreme horizontal speed or an under-net leg.
      // Ask the shared inverse for a coherent ball-surface mesh clearance, and
      // verify its actual obstruction before returning an error source recipe.
      for (const margin of [.6, .3, .1, .03, .01, .003]) {
        const candidate = { x: next.x, y: 22 + (team === 'green' ? margin : -margin) };
        try {
          const solved = solveFlightForClearanceV2({ from: contact, target: candidate, family, quality: execution.quality, pace, arc }, -1.5);
          if (solved.obstruction?.kind !== 'net' || solved.terminal?.reason !== 'net'
            || !Number.isFinite(solved.metadata.apexFeet) || solved.metadata.apexFeet > 30) {
            solveAttempts.push({ clearanceFeet: -1.5, target: candidate, accepted: false, reason: 'The solved flight does not reach the supported net mesh.' }); continue;
          }
          solveAttempts.push({ clearanceFeet: -1.5, target: candidate, accepted: true });
          meshFlight = solved; next.y = candidate.y; break;
        } catch (error) {
          if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
          solveAttempts.push({ clearanceFeet: -1.5, target: candidate, accepted: false, reason: error.message });
        }
      }
      if (!meshFlight) throw new RangeError('A net execution could not reach the supported mesh within six shared-solver trials.');
      adjusted = { launchVerticalFeetPerSecond: meshFlight.metadata.launchVerticalFeetPerSecond };
      transformation = 'net-mesh'; solvedClearanceFeet = meshFlight.metadata.netClearanceInches === null ? null : meshFlight.metadata.netClearanceInches / 12;
    } else if (execution.errorReason === 'long') next.y = team === 'green' ? 45 + depth * 3 : -1 - depth * 3;
    else if (execution.errorReason === 'wide') next.x = target.x < 10 ? -.5 - lateral * 3 : 20.5 + lateral * 3;
    else throw new TypeError('An execution error needs a supported target perturbation reason.');
    if (transformation !== 'net-mesh') transformation = 'error-target';
  } else if ((execution.quality === 'attackable' && SOFT_FAMILIES.has(family))
    || QUALITY_CLEARANCES[execution.quality]?.[family] !== undefined) {
    const popup = execution.quality === 'attackable';
    if (popup) {
      // A high short ball can still land before grounded line reach. A soft
      // misexecution may carry deeper as well as higher; the inverse supplies
      // one coherent flight, never a prescribed opponent contact height.
      const baselineDepth = 10 + depth * 2;
      next.x = clamp(next.x, .8, 19.2); next.y = team === 'green' ? 44 - baselineDepth : baselineDepth;
    }
    requestedClearanceFeet = popup ? family === 'drop' ? 1.6 : 1.2 : QUALITY_CLEARANCES[execution.quality][family];
    transformation = popup ? 'soft-popup' : 'controlled-clearance';
    let solved = null;
    for (const extra of [0, .2, .4]) {
      const clearanceFeet = requestedClearanceFeet + extra;
      try {
        const trial = solveFlightForClearanceV2({ from: contact, target: next, family, quality: execution.quality, pace, arc }, clearanceFeet);
        if (trial.obstruction || trial.terminal) throw new RangeError('The quality flight must remain playable.');
        solved = trial; solveAttempts.push({ clearanceFeet, accepted: true }); break;
      } catch (error) {
        if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
        solveAttempts.push({ clearanceFeet, accepted: false, reason: error.message });
      }
    }
    if (!solved) throw new RangeError('The physical quality transformation has no supported flight within three shared-solver trials.');
    adjusted = { launchVerticalFeetPerSecond: solved.metadata.launchVerticalFeetPerSecond };
    solvedClearanceFeet = solved.metadata.netClearanceInches / 12;
  } else if (['lob', 'overhead'].includes(family)) {
    transformation = adjusted ? 'explicit-flight-preserved' : 'family-flight-preserved';
  } else if (adjusted?.apexFeet !== undefined) {
    const shift = execution.quality === 'attackable' ? .6 : execution.quality === 'low' ? -.2 : 0;
    adjusted.apexFeet = clamp(adjusted.apexFeet + shift, finite(contact.heightFeet), 30);
    if (shift) transformation = 'apex-perturbation';
  } else if (adjusted?.launchVerticalFeetPerSecond !== undefined && execution.quality === 'attackable') {
    adjusted.launchVerticalFeetPerSecond = clamp(adjusted.launchVerticalFeetPerSecond + 2, -80, 80);
    transformation = 'launch-loft';
  }
  return freeze({ target: next, quality: execution.quality, pace, arc, ...(adjusted ? { physics: adjusted } : {}), intendedError: execution.errorReason,
    physicalTransformation: { version: PHYSICAL_TRANSFORMATION_VERSION, kind: transformation, family, quality: execution.quality,
      sourceContact: { x: contact.x, y: contact.y, heightFeet: contact.heightFeet }, sourceTarget: { x: target.x, y: target.y },
      sourcePhysics: physics ? { ...physics } : null, target: { ...next }, physics: adjusted ? { ...adjusted } : null,
      targetSpreadFeet: spread, requestedClearanceFeet, solvedClearanceFeet, solveAttempts } });
}

// Section 7 ranges are illustrative diagnostics, not simultaneous equations.
// Only the speed-up/counter delivered ceiling is an opportunity admission gate.
export const DELIVERED_FLIGHT_VERSION = 'rally-delivered-flight-v1';
export const DELIVERED_CLEARANCE_OFFSETS_V1 = Object.freeze([.05, .1, .2, .35, .5, .75, 1, 1.5, 2, 3]);
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
/** Post-execution admission: never resamples quality, edits an error, or adjusts
 * measured velocity. Every alternative is a fresh solution for the SAME target.
 * Raising clearance preserves the loft already supplied by execution, including
 * attackable popups. Ten explicit offsets bound work; failure asks the caller's
 * existing target/opportunity repair to continue, without inventing an ending. */
export function resolveDeliveredFlightV1({ candidate, contact, team, execution, applied, style } = {}) {
  point(contact, 'contact'); point(applied?.target, 'applied.target');
  if (!['green', 'orange'].includes(team) || !candidate?.family || !['error', 'attackable', 'excellent', 'low', 'neutral'].includes(execution?.quality)) throw new TypeError('Delivered flight requires a candidate, team and execution quality.');
  const base = { from: contact, target: applied.target, family: candidate.family, quality: execution.quality, pace: applied.pace, arc: applied.arc };
  let flight = solveFlightV2({ ...base, physics: applied.physics }), selected = applied;
  const source = deliveredFacts(flight, team), trials = [];
  const hardCeiling = execution.quality !== 'error' && ['speed-up', 'counter'].includes(candidate.intent);
  const eligible = facts => !facts.obstruction && !facts.terminalReason && facts.opponentLanding && facts.launchSpeedMph <= 45;
  trials.push({ kind: 'delivered-source', ...source, accepted: !hardCeiling || eligible(source) });
  if (hardCeiling && !eligible(source) && !source.obstruction && source.opponentLanding && source.netClearanceInches !== null) {
    for (const offset of DELIVERED_CLEARANCE_OFFSETS_V1) {
      const clearanceFeet = Math.max(2 / 12, source.netClearanceInches / 12) + offset;
      try {
        const alternative = solveFlightForClearanceV2(base, clearanceFeet), facts = deliveredFacts(alternative, team), accepted = eligible(facts);
        trials.push({ kind: 'raised-clearance', requestedClearanceFeet: clearanceFeet, ...facts, accepted });
        if (accepted) {
          flight = alternative;
          selected = { ...applied, physics: { launchVerticalFeetPerSecond: alternative.metadata.launchVerticalFeetPerSecond } };
          break;
        }
      } catch (error) {
        if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
        trials.push({ kind: 'raised-clearance', requestedClearanceFeet: clearanceFeet, accepted: false, reason: error.message });
      }
    }
  }
  const actual = deliveredFacts(flight, team), ranges = deliveredRanges(candidate, execution, style);
  const diagnostics = Object.entries(ranges).map(([metric, range]) => ({ metric, range, actual: actual[metric],
    withinRange: actual[metric] === null ? null : actual[metric] >= range[0] && actual[metric] <= range[1] }));
  const accepted = !hardCeiling || eligible(actual);
  const guidance = freeze({ version: DELIVERED_FLIGHT_VERSION, accepted, source, actual, diagnostics, trials,
    maximumTrials: 1 + DELIVERED_CLEARANCE_OFFSETS_V1.length,
    speedCeilingMph: hardCeiling ? 45 : null, repaired: selected !== applied,
    limitations: ['Constant gravity; no drag or spin forces.', 'Section 7 illustrative ranges are diagnostics, except the non-error speed-up/counter ceiling.',
      ...(execution.quality === 'error' ? ['Sampled error geometry preserved; guidance ranges do not reject intentional errors.'] : []),
      ...(!accepted ? ['No bounded coherent clearance alternative retains this target and meets the delivered speed ceiling.'] : [])] });
  if (!accepted) {
    const error = new RangeError('Delivered speed-up/counter opportunity rejected: no bounded coherent flight at or below 45 mph for this executed target.');
    error.guidance = guidance; throw error;
  }
  return freeze({ applied: selected, flight, guidance });
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
