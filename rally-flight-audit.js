// Generation-only analysis of public compiled, serialized model-2 flights.
// This diagnostic is deliberately separate from saved-document rule validity.
import { PHYSICS_V2, sampleFlightVelocityV2 } from './play-physics-v2.js';
import { generationFlightCeilingMphV1 } from './rally-flight-planner.js';

export const GENERATED_FLIGHT_AUDIT_VERSION = 'rally-generated-flight-feasibility-v1';
const TOLERANCE = 1e-6;
const FAST_INTENTS = new Set(['speed-up', 'speedup', 'counter', 'firm-volley', 'put-away', 'putaway']);
const finite = Number.isFinite;
const point = value => ({ x: value.x, y: value.y, heightFeet: value.heightFeet });
const validPoint = value => value && ['x', 'y', 'heightFeet'].every(key => finite(value[key]));
const empty = (status, reason) => ({ version: GENERATED_FLIGHT_AUDIT_VERSION, status, checkedFlights: 0, violations: [], flights: [], reason });

/** Call after the public compiler; this never changes source or replay validity. */
export function assessGeneratedFlightFeasibilityV1({ document, compiled } = {}) {
  if (!document) return empty('NOT_EVALUATED', 'No selected source document is available.');
  if (document.modelVersion !== 2 || document.generation?.mode !== 'engine' || document.generation.generatorVersion !== 'rally-engine-v1') {
    return empty('NOT_APPLICABLE', 'Only generated model-2 flights use this model envelope.');
  }
  const segments = compiled?.timeline?.segments?.filter(segment => segment.shotSemantics);
  if (!segments || !Array.isArray(document.shots) || !document.shots.length || document.shots.length > 99
      || compiled.validShotCount !== document.shots.length || segments.length !== document.shots.length
      || compiled.findings?.some(item => item.severity === 'error')) {
    return empty('NOT_EVALUATED', 'A completely accepted public compiled flight sequence is required.');
  }
  const flights = [], violations = [];
  for (const [index, segment] of segments.entries()) {
    const recipe = document.shots[index], solved = segment.trajectory?.solved;
    const family = recipe.family, intent = recipe.intent ?? null, quality = recipe.quality ?? 'neutral';
    const style = document.generation.input?.players?.[recipe.hitter]?.style ?? 'advanced';
    const identity = { shotId: recipe.id, ordinal: index + 1, family, intent, quality };
    const fail = (code, details = {}) => violations.push({ ...identity, code, ...details });
    if (!solved || !validPoint(solved.from) || !validPoint(segment.shotSemantics.contact.point) || !solved.stages?.length) {
      fail('missing-compiled-flight'); flights.push({ ...identity, status: 'FAIL' }); continue;
    }
    // The actual stage derivative is authoritative; no metadata speed, planner
    // diagnostic, or accepted flag participates in this measurement.
    const velocity = sampleFlightVelocityV2(solved, 0), from = solved.from;
    const vx = velocity.xFeetPerSecond, vz = velocity.yFeetPerSecond, vy = velocity.heightFeetPerSecond;
    const speedMph = Math.hypot(vx, vy, vz) / (22 / 15);
    const gravity = PHYSICS_V2.gravityFeetPerSecond2, radius = PHYSICS_V2.ballRadiusFeet;
    const ballisticTimeSeconds = (vy + Math.sqrt(vy * vy + 2 * gravity * (from.heightFeet - radius))) / gravity;
    const apexFeet = from.heightFeet + Math.max(0, vy) ** 2 / (2 * gravity);
    const landing = solved.sampleBoard(solved.firstLandingTime);
    const maximumSpeedMph = generationFlightCeilingMphV1({ family, intent, style, quality });
    const fast = ['drive', 'overhead'].includes(family) || FAST_INTENTS.has(intent) || FAST_INTENTS.has(family);
    const minimumSpeedMph = quality !== 'error' && fast ? 22 : null;
    const minimumApexFeet = family === 'lob' && quality !== 'error' ? Math.max(15, from.heightFeet) : from.heightFeet;
    const before = violations.length;
    if (![vx, vy, vz, speedMph, apexFeet, ballisticTimeSeconds, solved.firstLandingTime, maximumSpeedMph].every(finite)
        || !validPoint(landing) || ballisticTimeSeconds <= .001 || solved.firstLandingTime <= 0) fail('invalid-flight-kinematics');
    if (['x', 'y', 'heightFeet'].some(key => Math.abs(from[key] - segment.shotSemantics.contact.point[key]) > TOLERANCE)) fail('compiled-contact-mismatch');
    if (speedMph > maximumSpeedMph + TOLERANCE) fail('launch-speed-above-envelope', { speedMph, maximumSpeedMph, toleranceMph: TOLERANCE });
    if (minimumSpeedMph !== null && speedMph < minimumSpeedMph - TOLERANCE) fail('launch-speed-below-fast-floor', { speedMph, minimumSpeedMph });
    if (apexFeet < minimumApexFeet - TOLERANCE || apexFeet > 30 + TOLERANCE) fail('apex-outside-envelope', { apexFeet, minimumApexFeet, maximumApexFeet: 30 });
    if (vy < -80 - TOLERANCE || vy > 80 + TOLERANCE) fail('vertical-launch-outside-envelope', { launchVerticalFeetPerSecond: vy });
    if (family === 'overhead' && vy > TOLERANCE) fail('overhead-launch-upward', { launchVerticalFeetPerSecond: vy });
    if (Math.abs(landing.heightFeet - radius) > TOLERANCE) fail('landing-above-surface', { landing: point(landing) });
    flights.push({ ...identity, status: violations.length === before ? 'PASS' : 'FAIL',
      launchSpeedMph: speedMph, maximumSpeedMph, minimumSpeedMph, launchVerticalFeetPerSecond: vy,
      apexFeet, minimumApexFeet, ballisticTimeSeconds, firstLandingTimeSeconds: solved.firstLandingTime,
      from: point(from), landing: point(landing), obstruction: solved.obstruction?.kind ?? null });
  }
  return { version: GENERATED_FLIGHT_AUDIT_VERSION, status: violations.length ? 'FAIL' : 'PASS',
    checkedFlights: flights.length, violations, flights };
}
