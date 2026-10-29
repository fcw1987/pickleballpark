// Execution and causation are explicit tactical heuristics. Physical outcomes
// are established separately by the shared solver and model2 rule validator.
import { assessReach } from './rally-tactics.js';
import { solveFlightForClearanceV2 } from './play-physics-v2.js';

export const QUALITY_VERSION = 'rally-quality-v1';
export const CAUSATION_VERSION = 'rally-causation-v1';
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const point = (p, name) => { if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError(`${name} needs finite board coordinates.`); };
const draw = (n, name) => { if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError(`${name} must be in [0,1).`); return n; };
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const PHASES = new Set(['serve', 'return', 'third', 'transition', 'kitchen', 'hands', 'scramble']);
const ATTACKS = new Set(['drive', 'third-shot-drive', 'speed-up', 'counter', 'put-away', 'overhead']);

export function assessPressureV1({ contact, position, availableSeconds = 1, incomingFlight = null,
  incomingIntent = null, movementSpeedFeetPerSecond = 0, selfPaced = false } = {}) {
  point(contact, 'contact'); point(position, 'position');
  if (typeof selfPaced !== 'boolean') throw new TypeError('selfPaced must be boolean.');
  if (!Number.isFinite(availableSeconds) || availableSeconds < 0 || !Number.isFinite(movementSpeedFeetPerSecond) || movementSpeedFeetPerSecond < 0) throw new TypeError('Pressure needs finite nonnegative time and movement speed.');
  const reach = assessReach(position, contact, availableSeconds), margin = reach.radiusFeet - reach.distanceFeet;
  if (!Number.isFinite(contact.heightFeet) || contact.heightFeet < 0) throw new TypeError('Pressure requires the actual finite contact height.');
  const heightFeet = contact.heightFeet;
  const incomingSpeedMph = finite(incomingFlight?.launchSpeedMph, finite(incomingFlight?.metadata?.launchSpeedMph));
  // Serve preparation is self-paced, not a reaction to an incoming flight.
  // Retain the actual time/reach facts without charging incoming-time pressure.
  const reachLoad = selfPaced ? 0 : clamp(1 - margin / 6, 0, 1), shortTime = selfPaced ? 0 : clamp((.65 - availableSeconds) / .5, 0, 1);
  const movementLoad = clamp(movementSpeedFeetPerSecond / 14, 0, 1), speedLoad = ATTACKS.has(incomingIntent) ? clamp((incomingSpeedMph - 15) / 30, 0, 1) : 0;
  const lowLoad = heightFeet < 1.2 ? clamp((1.2 - heightFeet) / 1.2, 0, 1) : 0;
  const score = clamp(reachLoad * .4 + shortTime * .2 + movementLoad * .2 + speedLoad * .15 + lowLoad * .05, 0, 1);
  return freeze({ version: QUALITY_VERSION, score, reachMarginFeet: margin, distanceFeet: reach.distanceFeet,
    reachable: reach.reachable, availableSeconds, movementSpeedFeetPerSecond, contactHeightFeet: heightFeet,
    incomingSpeedMph, incomingIntent: typeof incomingIntent === 'string' ? incomingIntent : null,
    ...(selfPaced ? { selfPaced: true } : {}),
    factors: { reachLoad, shortTime, movementLoad, speedLoad, lowLoad } });
}

export function sampleExecutionV1({ profile, situation = {}, draws } = {}) {
  const phase = situation.phase === 'third-shot' ? 'third' : situation.phase === 'hands-battle' ? 'hands' : situation.phase ?? 'kitchen';
  if (!PHASES.has(phase)) throw new RangeError('Unsupported execution phase.');
  const source = profile?.execution?.[phase];
  if (!source) throw new TypeError(`No execution profile for phase ${phase}.`);
  const weights = Object.fromEntries(['error', 'attackable', 'excellent', 'low'].map(key => [key, source[key] ?? 0]));
  if (Object.values(weights).some(p => !Number.isFinite(p) || p < 0 || p > 1) || Object.values(weights).reduce((a, b) => a + b, 0) > 1 + 1e-9) throw new RangeError('Execution probabilities must be finite, nonnegative and sum to at most 1.');
  const pressure = situation.pressure ? structuredClone(situation.pressure) : null, pressureScore = clamp(finite(pressure?.score), 0, 1);
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
    pressure, draw: roll, ...(quality === 'error' ? { errorDraw: draws.error } : {}) });
}

/** Perturb source parameters only. This does not claim that a sampled error
 * ended the point: the real solved geometry may supply a different result. */
export function applyExecutionV1({ execution, target, contact, team, physics, family = 'drive', pace = 'medium', arc = 'medium', draws } = {}) {
  point(target, 'target'); point(contact, 'contact');
  if (!Number.isFinite(contact.heightFeet) || contact.heightFeet < 0) throw new TypeError('Execution requires the actual finite contact height.');
  if (!['green', 'orange'].includes(team) || !['error', 'attackable', 'excellent', 'low', 'neutral'].includes(execution?.quality)) throw new TypeError('Execution quality and team are required.');
  const lateral = draw(draws?.lateral, 'lateral target draw'), depth = draw(draws?.depth, 'depth target draw');
  const spread = execution.quality === 'excellent' ? .15 : execution.quality === 'attackable' ? .75 : .4;
  const next = { x: clamp(target.x + (lateral - .5) * 2 * spread, -8, 28), y: clamp(target.y + (depth - .5) * 2 * spread, -8, 52) };
  let adjusted = physics ? { ...physics } : undefined;
  if (execution.quality === 'error') {
    if (execution.errorReason === 'net') {
      next.x = clamp(target.x, 2, 18);
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
            || !Number.isFinite(solved.metadata.apexFeet) || solved.metadata.apexFeet > 30) continue;
          meshFlight = solved; next.y = candidate.y; break;
        } catch (error) {
          if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
        }
      }
      if (!meshFlight) throw new RangeError('A net execution could not reach the supported mesh within six shared-solver trials.');
      adjusted = { launchVerticalFeetPerSecond: meshFlight.metadata.launchVerticalFeetPerSecond };
    } else if (execution.errorReason === 'long') next.y = team === 'green' ? 45 + depth * 3 : -1 - depth * 3;
    else if (execution.errorReason === 'wide') next.x = target.x < 10 ? -.5 - lateral * 3 : 20.5 + lateral * 3;
    else throw new TypeError('An execution error needs a supported target perturbation reason.');
  } else if (adjusted?.apexFeet !== undefined) {
    const shift = execution.quality === 'attackable' ? .6 : execution.quality === 'low' ? -.2 : 0;
    adjusted.apexFeet = clamp(adjusted.apexFeet + shift, finite(contact.heightFeet), 30);
  } else if (adjusted?.launchVerticalFeetPerSecond !== undefined && execution.quality === 'attackable') {
    adjusted.launchVerticalFeetPerSecond = clamp(adjusted.launchVerticalFeetPerSecond + 2, -80, 80);
  }
  return freeze({ target: next, quality: execution.quality, pace, arc, ...(adjusted ? { physics: adjusted } : {}), intendedError: execution.errorReason });
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
