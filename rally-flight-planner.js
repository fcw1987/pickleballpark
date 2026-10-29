// Generation policy only. Saved Model 1/2 source and the authoritative solver
// keep their existing equations and interpretation.
import { PHYSICS_V2, solveFlightV2, localNetHeightFeet } from './play-physics-v2.js';

export const FLIGHT_PLANNER_VERSION = 'rally-flight-planner-v1';
export const MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET = 6;
export const GENERATION_FLIGHT_ENVELOPES_V1 = Object.freeze({
  serve: 40, return: 36, drive: Object.freeze({ pro: 45, other: 38 }),
  dink: 20, reset: 24, drop: 26, lob: 28, volley: 45,
  'firm-volley': 45, 'speed-up': 45, counter: 45, 'put-away': 45, overhead: 45,
});
const G = PHYSICS_V2.gravityFeetPerSecond2, R = PHYSICS_V2.ballRadiusFeet, MPH = 22 / 15;
// Inward construction margins survive the engine's nine-decimal source format.
// These are numerical margins, not relaxed checks on delivered measurements.
const SPEED_MARGIN = 1e-5, HEIGHT_MARGIN = 1e-6, TIME_MIN = .001000001;
const FAMILIES = Object.freeze(['serve', 'return', 'drive', 'dink', 'reset', 'drop', 'lob', 'volley', 'overhead',
  'firm-volley', 'speed-up', 'speedup', 'counter', 'put-away', 'putaway']);
const normalize = id => ({ speedup: 'speed-up', putaway: 'put-away' })[id] ?? id;
export function generationFlightCeilingMphV1({ family, intent = null, style = 'advanced', quality = 'neutral' } = {}) {
  if (!FAMILIES.includes(family)) throw new RangeError('Unsupported generation flight family.');
  if (intent !== null && typeof intent !== 'string') throw new TypeError('intent must be a string or null.');
  const styleId = typeof style === 'string' ? style : style?.id;
  if (!['pro', 'advanced', 'intermediate', 'beginner'].includes(styleId)) throw new RangeError('Unsupported generation style.');
  if (!['neutral', 'excellent', 'low', 'attackable', 'error'].includes(quality)) throw new RangeError('Unsupported generation quality.');
  family = normalize(family);
  const envelope = GENERATION_FLIGHT_ENVELOPES_V1[family];
  const ceiling = family === 'drive' ? envelope[styleId === 'pro' ? 'pro' : 'other'] : envelope;
  return quality === 'error' ? Math.min(50, 1.25 * ceiling) : ceiling;
}
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const finite = (value, name) => { if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`); return value; };
const boundPoint = (p, name, contact = false) => {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new TypeError(`${name} needs finite board coordinates.`);
  const result = { x: finite(p.x, `${name}.x`), y: finite(p.y, `${name}.y`) };
  if (result.x < -8 || result.x > 28 || result.y < -8 || result.y > 52) throw new RangeError(`${name} must lie within the supported 8-foot apron.`);
  if (contact) {
    result.heightFeet = finite(p.heightFeet, `${name}.heightFeet`);
    if (result.heightFeet < R || result.heightFeet > 30) throw new RangeError('Contact height must be between the ball radius and 30 feet.');
  }
  return result;
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const timeForVertical = (v, height) => {
  const root = Math.sqrt(v * v + 2 * G * (height - R));
  // Rationalization avoids cancellation for a downward launch near the ground.
  return v < 0 ? 2 * (height - R) / (root - v) : (v + root) / G;
};

// speed² = chord² / T² + g*delta + g²*T²/4. Solve in u=T²
// with a stable product-of-roots form, including a double-root tangent.
function speedTimes(speedMph, chordSquared, delta) {
  const a = G * G / 4, b = G * delta - (speedMph * MPH) ** 2, c = chordSquared;
  let discriminant = b * b - 4 * a * c;
  const tolerance = 32 * Number.EPSILON * (b * b + Math.abs(4 * a * c));
  if (discriminant < -tolerance || b >= 0) return null;
  discriminant = Math.max(0, discriminant);
  const q = -.5 * (b - Math.sqrt(discriminant));
  if (!(q > 0)) return null;
  return [Math.sqrt(c / q), Math.sqrt(q / a)];
}

function preferredRanges(family, intent, quality, style) {
  if (['speed-up', 'counter'].includes(intent)) return { speedMph: [30, 45], clearanceFeet: [2 / 12, 1], apexFeet: [0, 4.5] };
  return ({
    serve: { speedMph: [25, 40], clearanceFeet: [1, 2.5], apexFeet: [6, 8] },
    return: { speedMph: [22, 36], clearanceFeet: [1, 2.5], apexFeet: [6, 8] },
    drive: { speedMph: style === 'pro' ? [35, 45] : [28, 38], clearanceFeet: [.5, 16 / 12], apexFeet: [3.5, 5] },
    drop: { speedMph: [15, 22], clearanceFeet: [.5, 1.5], apexFeet: [5.5, 7] },
    dink: quality === 'attackable'
      ? { speedMph: [10, 16], clearanceFeet: [14 / 12, 2], apexFeet: [4.5, 5.5] }
      : { speedMph: [8, 14], clearanceFeet: [2 / 12, 10 / 12], apexFeet: [3.4, 4.2] },
    reset: { speedMph: [10, 16], clearanceFeet: [2 / 12, 10 / 12], apexFeet: [3.4, 4.5] },
    lob: { speedMph: [18, 25], apexFeet: [15, 22] },
    overhead: { speedMph: [35, 45], contactHeightFeet: [7, 8.5] },
    volley: { speedMph: [22, 45], clearanceFeet: [2 / 12, 1], apexFeet: [3.4, 4.5] },
  })[family] ?? { speedMph: [22, 45], clearanceFeet: [2 / 12, 1] };
}

function measurements(flight) {
  const m = flight.metadata, first = flight.stages[0];
  // Mesh obstruction clears netPoint in the solver; measure the original
  // ballistic segment at the plane rather than reporting a missing clearance.
  const fraction = (22 - flight.from.y) / (flight.target.y - flight.from.y);
  const t = (22 - flight.from.y) / first.vz, x = flight.from.x + first.vx * t;
  const planeHeight = flight.from.heightFeet + first.vy * t - .5 * G * t * t;
  return {
    source: 'play-physics-v2', launchSpeedMph: m.launchSpeedMph, speedMph: m.launchSpeedMph,
    launchVerticalFeetPerSecond: m.launchVerticalFeetPerSecond, apexFeet: m.apexFeet,
    contactHeightFeet: m.contactHeightFeet, flightTimeSeconds: timeForVertical(first.vy, flight.from.heightFeet),
    firstLandingTimeSeconds: flight.firstLandingTime,
    clearanceFeet: planeHeight - R - localNetHeightFeet(x), netClearanceInches: m.netClearanceInches,
    netPlane: { fraction, x, heightFeet: planeHeight },
    landing: { ...flight.landing }, obstruction: flight.obstruction?.kind ?? null,
    aroundPost: flight.events.some(e => e.type === 'net-crossing' && e.aroundPost),
    terminalReason: flight.terminal?.reason ?? null,
  };
}
function preferencesEvidence(actual, preferred, ranges) {
  const departures = Object.entries(preferred).map(([metric, requested]) => ({
    metric, requested, actual: actual[metric], departure: actual[metric] - requested,
  }));
  const rangeDepartures = Object.entries(ranges).map(([metric, range]) => {
    const measured = actual[metric], departure = measured - clamp(measured, range[0], range[1]);
    return { metric, range: [...range], actual: measured, departure, withinRange: departure === 0 };
  });
  // Dimensionless units keep mph from overwhelming clearance/apex hints.
  const scale = { speedMph: 10, clearanceFeet: 1, apexFeet: 3, launchVerticalFeetPerSecond: 15 };
  // Finite, wildly out-of-envelope hints still cannot produce Infinity in a
  // serialized preference score. This cap is far above any physical input.
  const score = departures.reduce((sum, d) => sum + Math.min(1e100, Math.abs(d.departure) / scale[d.metric]), 0)
    + rangeDepartures.reduce((sum, d) => sum + .1 * Math.abs(d.departure) / (scale[d.metric] ?? 3), 0);
  return { preferredDepartures: departures, rangeDepartures, preferenceScore: score };
}

/** One exact landing target, at most six authoritative solves. Preferred
 * values are ranked hints; feasibility always precedes preference. No RNG,
 * cache, inverse-clearance solver, target repair or outcome relabeling. */
export function planRallyFlightV1({ from, target, family, intent = null, style = 'advanced', quality = 'neutral',
  pace = 'medium', arc = 'medium', preferred = {}, route = 'over-net', errorReason = null } = {}) {
  from = boundPoint(from, 'from', true); target = boundPoint(target, 'target');
  if (!FAMILIES.includes(family)) throw new RangeError('Unsupported generation flight family.');
  family = normalize(family);
  if (intent !== null && typeof intent !== 'string') throw new TypeError('intent must be a string or null.');
  intent = normalize(intent);
  const styleId = typeof style === 'string' ? style : style?.id;
  if (!['pro', 'advanced', 'intermediate', 'beginner'].includes(styleId)) throw new RangeError('Unsupported generation style.');
  if (!['neutral', 'excellent', 'low', 'attackable', 'error'].includes(quality)) throw new RangeError('Unsupported generation quality.');
  if (!['soft', 'medium', 'firm'].includes(pace) || !['low', 'medium', 'high'].includes(arc)) throw new RangeError('Unsupported pace or arc.');
  if (!['over-net', 'around-the-post'].includes(route)) throw new RangeError('Unsupported generation route.');
  if (errorReason !== null && !['net', 'long', 'wide'].includes(errorReason)) throw new RangeError('Unsupported policy error construction.');
  if (!preferred || typeof preferred !== 'object' || Array.isArray(preferred)) throw new TypeError('preferred must be an object.');
  const hints = {};
  for (const [key, value] of Object.entries(preferred)) {
    if (!['speedMph', 'clearanceFeet', 'apexFeet', 'launchVerticalFeetPerSecond'].includes(key)) throw new TypeError(`Unsupported preferred hint: ${key}.`);
    hints[key] = finite(value, `preferred.${key}`);
  }
  const isError = quality === 'error' || errorReason !== null;
  const familyCeiling = generationFlightCeilingMphV1({ family, intent, style, quality: 'neutral' });
  const speedCeilingMph = generationFlightCeilingMphV1({ family, intent, style, quality: isError ? 'error' : quality });
  const fast = !isError && (['drive', 'overhead'].includes(family) || ['speed-up', 'counter', 'firm-volley', 'put-away', 'overhead'].includes(intent)
    || ['firm-volley', 'speed-up', 'counter', 'put-away'].includes(family));
  const minimumSpeedMph = fast ? 22 : 0, ranges = preferredRanges(family, intent, quality, styleId);
  const diagnostics = { speedCeilingMph, familyCeilingMph: familyCeiling, minimumSpeedMph,
    maxSolverCalls: MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET, solverCalls: 0, feasibleTimeIntervals: [], trials: [], reason: null };
  const unavailable = reason => freeze({ status: 'unavailable', plannerVersion: FLIGHT_PLANNER_VERSION,
    physics: null, flight: null, solutions: [], diagnostics: { ...diagnostics, reason } });
  const fraction = (22 - from.y) / (target.y - from.y);
  if (!(fraction > 0 && fraction < 1)) return unavailable('The exact target does not cross the net plane from the contact end.');
  const netX = from.x + (target.x - from.x) * fraction;
  const around = netX < -1.25 - R || netX > 21.25 + R;
  if (route === 'around-the-post' && !around) return unavailable('The exact horizontal path does not pass wholly outside a post.');
  if (route === 'over-net' && around) return unavailable('The exact horizontal path is around a post, not over the net.');
  if (route === 'around-the-post' && errorReason === 'net') return unavailable('An around-post route cannot construct a net mesh error.');
  const dx = target.x - from.x, dy = target.y - from.y, delta = R - from.heightFeet;
  const chordSquared = dx * dx + dy * dy + delta * delta;
  const ceilingTimes = speedTimes(speedCeilingMph - SPEED_MARGIN, chordSquared, delta);
  if (!ceilingTimes) return unavailable('The exact target has no flight below the generation speed ceiling.');
  let low = Math.max(TIME_MIN, ceilingTimes[0], timeForVertical(-80 + HEIGHT_MARGIN, from.heightFeet));
  const maxVertical = Math.min(80 - HEIGHT_MARGIN, Math.max(0, Math.sqrt(2 * G * (30 - from.heightFeet)) - HEIGHT_MARGIN));
  let high = Math.min(ceilingTimes[1], timeForVertical(maxVertical, from.heightFeet));
  if (family === 'overhead') high = Math.min(high, timeForVertical(0, from.heightFeet));
  if (family === 'lob' && !isError && from.heightFeet < 15) low = Math.max(low, timeForVertical(Math.sqrt(2 * G * (15 + HEIGHT_MARGIN - from.heightFeet)), from.heightFeet));
  const tape = localNetHeightFeet(netX), planeBase = from.heightFeet * (1 - fraction) + R * fraction;
  const planeFactor = .5 * G * fraction * (1 - fraction);
  const timeForPlaneHeight = height => Math.sqrt(Math.max(0, (height - planeBase) / planeFactor));
  if (!around) {
    const mesh = netX >= PHYSICS_V2.netLeft && netX <= PHYSICS_V2.netRight;
    const post = netX + R >= -1.25 && netX - R <= -1 || netX + R >= 21 && netX - R <= 21.25;
    if (errorReason === 'net') {
      if (!mesh) return unavailable('The exact horizontal path does not intersect supported net mesh.');
      low = Math.max(low, timeForPlaneHeight(tape - 2.5 - R + HEIGHT_MARGIN));
      if (!(tape + R - HEIGHT_MARGIN > planeBase)) return unavailable('The exact chord lies above the intended net mesh collision.');
      high = Math.min(high, timeForPlaneHeight(tape + R - HEIGHT_MARGIN));
    } else if (!isError || !mesh) {
      low = Math.max(low, timeForPlaneHeight(tape + R + HEIGHT_MARGIN));
    } else {
      // Long/wide errors may hit the mesh first, but unsupported under-net,
      // net-gap and post paths are never presented as those chosen outcomes.
      low = Math.max(low, timeForPlaneHeight(tape - 2.5 - R + HEIGHT_MARGIN));
    }
    if (post) low = Math.max(low, timeForPlaneHeight(3 + R + HEIGHT_MARGIN));
  }
  if (!(high >= low && high > TIME_MIN)) return unavailable('Speed, route and family shape constraints have no common flight time.');
  let intervals = [[low, high]];
  if (minimumSpeedMph) {
    const floorTimes = speedTimes(minimumSpeedMph + SPEED_MARGIN, chordSquared, delta);
    if (floorTimes) intervals = [[low, Math.min(high, floorTimes[0])], [Math.max(low, floorTimes[1]), high]].filter(([a, b]) => b >= a);
  }
  diagnostics.feasibleTimeIntervals = intervals.map(([a, b]) => ({ minimumSeconds: a, maximumSeconds: b }));
  if (!intervals.length) return unavailable('The exact target cannot preserve the minimum attacking pace with the required family shape.');
  const defaultSpeed = (ranges.speedMph[0] + ranges.speedMph[1]) / 2;
  const defaultClearance = errorReason === 'net' ? -1.5 : ranges.clearanceFeet ? (ranges.clearanceFeet[0] + ranges.clearanceFeet[1]) / 2 : 1;
  const baseApex = ({ serve: 7, return: 7, drive: 4.5, drop: 6, dink: 4, reset: 4.1, lob: 18, volley: 4.2 })[family] ?? 4.2;
  const defaultApex = Math.max(from.heightFeet, baseApex + (arc === 'high' ? .6 : arc === 'low' ? -.5 : 0)
    + (quality === 'attackable' ? .8 : quality === 'low' ? -.35 : 0) + (pace === 'soft' ? .35 : pace === 'firm' ? -.2 : 0));
  const rankingHints = Object.keys(hints).length ? hints : family === 'lob' ? { apexFeet: 18 } : family === 'overhead'
    ? { launchVerticalFeetPerSecond: pace === 'soft' ? -12 : pace === 'firm' ? -24 : -18, speedMph: defaultSpeed }
    : { clearanceFeet: defaultClearance, speedMph: defaultSpeed, apexFeet: defaultApex };
  const rawTimes = [];
  const speedHint = hints.speedMph ?? defaultSpeed;
  const speedRoots = speedTimes(Math.max(SPEED_MARGIN, speedHint), chordSquared, delta);
  if (speedRoots) rawTimes.push(...speedRoots);
  rawTimes.push(timeForPlaneHeight(tape + R + (hints.clearanceFeet ?? defaultClearance)));
  const apexHint = hints.apexFeet ?? (family === 'lob' ? 18 : defaultApex);
  rawTimes.push(timeForVertical(Math.sqrt(Math.max(0, 2 * G * (apexHint - from.heightFeet))), from.heightFeet));
  if (hints.launchVerticalFeetPerSecond !== undefined || family === 'overhead') rawTimes.push(timeForVertical(hints.launchVerticalFeetPerSecond
    ?? (pace === 'soft' ? -12 : pace === 'firm' ? -24 : -18), from.heightFeet));
  const candidates = [];
  const add = time => {
    if (!Number.isFinite(time) || candidates.some(other => Math.abs(other - time) < 1e-10)) return;
    candidates.push(time);
  };
  // Every hint is projected into an already feasible interval. Reserve both
  // boundaries so a preferred chord cannot consume the whole call budget.
  for (const [a, b] of intervals) { add(a); add(b); }
  const analyticScore = time => {
    const vy = delta / time + G * time / 2, height = planeBase + planeFactor * time * time;
    return preferencesEvidence({ speedMph: Math.sqrt(chordSquared / (time * time) + G * delta + G * G * time * time / 4) / MPH,
      clearanceFeet: height - R - tape, apexFeet: from.heightFeet + Math.max(0, vy) ** 2 / (2 * G),
      launchVerticalFeetPerSecond: vy, contactHeightFeet: from.heightFeet }, rankingHints, ranges).preferenceScore;
  };
  const projected = rawTimes.flatMap(time => intervals.map(([a, b]) => clamp(time, a, b))).filter(Number.isFinite)
    .sort((a, b) => analyticScore(a) - analyticScore(b) || a - b);
  for (const time of projected) { if (candidates.length >= MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET) break; add(time); }
  candidates.sort((a, b) => analyticScore(a) - analyticScore(b) || a - b);
  const solutions = [];
  for (const time of candidates.slice(0, MAX_AUTHORITATIVE_SOLVER_CALLS_PER_TARGET)) {
    const physics = { launchVerticalFeetPerSecond: Number((delta / time + G * time / 2).toFixed(9)) || 0 };
    diagnostics.solverCalls++;
    const flight = solveFlightV2({ from, target, family, quality, pace, arc, physics });
    const actual = measurements(flight), crossing = flight.events.find(e => e.type === 'net-crossing');
    let reason = null;
    if (actual.speedMph > speedCeilingMph || actual.speedMph < minimumSpeedMph) reason = 'Actual launch speed violates the generation envelope.';
    else if (actual.apexFeet < from.heightFeet || actual.apexFeet > 30 || actual.launchVerticalFeetPerSecond < -80 || actual.launchVerticalFeetPerSecond > 80) reason = 'Actual vertical shape violates the generation envelope.';
    else if (family === 'overhead' && actual.launchVerticalFeetPerSecond > 0) reason = 'An overhead must launch downward.';
    else if (family === 'lob' && !isError && from.heightFeet < 15 && actual.apexFeet < 15) reason = 'A lob must retain a meaningful high apex.';
    else if (errorReason === 'net' && flight.obstruction?.kind !== 'net') reason = 'The intended net error does not hit net mesh.';
    else if (flight.obstruction && !isError) reason = 'The actual non-error flight is obstructed.';
    else if (flight.obstruction && flight.obstruction.kind !== 'net') reason = 'Unsupported under-net, net-gap or post policy construction.';
    else if (!flight.obstruction && (!crossing || Boolean(crossing.aroundPost) !== (route === 'around-the-post'))) reason = 'The actual flight does not satisfy the requested route.';
    const preferences = preferencesEvidence(actual, rankingHints, ranges);
    const evidence = { plannerVersion: FLIGHT_PLANNER_VERSION, actual, ...preferences,
      requestedPreferred: { ...hints }, effectivePreferred: { ...rankingHints }, speedCeilingMph, minimumSpeedMph,
      intendedError: errorReason, route, target: { ...target } };
    diagnostics.trials.push({ timeSeconds: time, physics: { ...physics }, accepted: reason === null, reason, actual });
    if (!reason) solutions.push({ physics, flight, evidence });
  }
  solutions.sort((a, b) => a.evidence.preferenceScore - b.evidence.preferenceScore
    || a.evidence.actual.flightTimeSeconds - b.evidence.actual.flightTimeSeconds);
  if (!solutions.length) return unavailable('No bounded authoritative solve satisfied the generation envelope and route.');
  return freeze({ status: 'solved', plannerVersion: FLIGHT_PLANNER_VERSION, ...solutions[0], solutions,
    diagnostics: { ...diagnostics, reason: null } });
}
