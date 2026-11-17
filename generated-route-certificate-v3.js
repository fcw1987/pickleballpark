// A bounded adaptive proof for NEW generated full rest-to-rest eased routes.
// Historical v1/v2 remain unchanged. This refines uncertainty, never the
// selected 18 ft/s, 30 ft/s² or 3 ft paddle-reach policy. It is not a theorem
// about universal human reach or about intercepting midway through a route.
export const GENERATED_ROUTE_CERTIFICATE_VERSION_V3 = 'generated-contact-endpoint-route-v3';
const IDS = ['player1', 'player2', 'player3', 'player4'];
const APPLICABILITY = 'acceleration-bounded-full-eased-route-ending-at-interception';
const POSITIVE_MARGIN = 1e-7;
const PARAMETERS = Object.freeze({
  peakFeetPerSecond: 18,
  accelerationFeetPerSecondSquared: 30,
  endpointFeetPerSecond: 9,
  endpointAccelerationFactor: 7.5,
  paddleReachFeet: 3,
  reactionSeconds: 0,
  initialIntervalsPerStage: 32,
  maxRefinementDepth: 12,
  maxIntervalEvaluationsPerActor: 8192,
  allowanceLipschitzFeetPerSecond: 18,
});
const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);
const affinePoint = (stage, time) => ({
  x: stage.from.x + stage.vx * (time - stage.startTime),
  y: stage.from.y + stage.vz * (time - stage.startTime),
});
const consistentPoint = (actual, expected, stage, time) => point(actual) && point(expected)
  && ['x', 'y'].every((axis, index) => {
    const displacement = (index ? stage.vz : stage.vx) * (time - stage.startTime);
    const tolerance = 64 * Number.EPSILON * Math.max(1, Math.abs(actual[axis]), Math.abs(expected[axis]),
      Math.abs(stage.from[axis]), Math.abs(displacement));
    return Number.isFinite(tolerance) && Math.abs(actual[axis] - expected[axis]) <= tolerance;
  });
const keys = (value, names) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const own = Reflect.ownKeys(value);
  return own.length === names.length && names.every(name => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return descriptor && Object.hasOwn(descriptor, 'value');
  });
};
const boundedInteger = (value, maximum) => Number.isInteger(value) && value >= 0 && value <= maximum;
function actorValues(actors) {
  if (!Array.isArray(actors) || Object.getPrototypeOf(actors) !== Array.prototype) return null;
  const own = Reflect.ownKeys(actors);
  if (own.length !== 3 || !own.includes('0') || !own.includes('1') || !own.includes('length')) return null;
  const length = Object.getOwnPropertyDescriptor(actors, 'length');
  const first = Object.getOwnPropertyDescriptor(actors, '0'), second = Object.getOwnPropertyDescriptor(actors, '1');
  if (length?.value !== 2 || !first || !second || !Object.hasOwn(first, 'value') || !Object.hasOwn(second, 'value')) return null;
  return [first.value, second.value];
}
const actorShape = value => keys(value, ['actor', 'origin', 'continuousLowerBoundFeet', 'leafIntervals', 'intervalEvaluations', 'maxDepthUsed'])
  && IDS.includes(value.actor) && keys(value.origin, ['x', 'y']) && point(value.origin)
  && Number.isFinite(value.continuousLowerBoundFeet) && value.continuousLowerBoundFeet > POSITIVE_MARGIN
  && boundedInteger(value.leafIntervals, PARAMETERS.maxIntervalEvaluationsPerActor) && value.leafIntervals > 0
  && boundedInteger(value.intervalEvaluations, PARAMETERS.maxIntervalEvaluationsPerActor)
  && value.intervalEvaluations >= value.leafIntervals
  && boundedInteger(value.maxDepthUsed, PARAMETERS.maxRefinementDepth);

export function validGeneratedRouteCertificateShapeV3(certificate) {
  if (!keys(certificate, ['version', 'applicability', 'parameters', 'leadInSeconds', 'throughSeconds', 'actors'])) return false;
  const actors = actorValues(certificate.actors);
  return certificate.version === GENERATED_ROUTE_CERTIFICATE_VERSION_V3
    && certificate.applicability === APPLICABILITY
    && keys(certificate.parameters, Object.keys(PARAMETERS))
    && Object.keys(PARAMETERS).every(key => certificate.parameters[key] === PARAMETERS[key])
    && Number.isFinite(certificate.leadInSeconds) && certificate.leadInSeconds >= 0
    && Number.isFinite(certificate.throughSeconds) && certificate.throughSeconds > 0
    && actors !== null && actors.every(actorShape) && actors[0].actor !== actors[1].actor;
}

/** Every accepted leaf covers its whole closed interval. No finite search
 * failure, endpoint observation or exhausted work cap establishes exclusion. */
export function certifyGeneratedRouteExclusionV3(play, segment, solved) {
  const end = solved?.secondBounceTime, lead = segment?.contactTime;
  if (play?.modelVersion !== 2 || segment?.modelVersion !== 2
    || !Number.isFinite(end) || end <= 0 || !Number.isFinite(lead) || lead < 0
    || !Array.isArray(solved.stages) || !solved.stages.length
    || solved.stages.length > Math.floor(PARAMETERS.maxIntervalEvaluationsPerActor / PARAMETERS.initialIntervalsPerStage)
    || typeof solved.sampleBoard !== 'function'
    || segment.model2Momentum !== undefined && (!Array.isArray(segment.model2Momentum) || segment.model2Momentum.length)) return null;
  const hitter = segment.shotSemantics?.playerId;
  if (!IDS.includes(hitter) || IDS.some(id => !['green', 'orange'].includes(play.players?.[id]?.team))) return null;
  const team = play.players[hitter].team, defenders = IDS.filter(id => play.players[id].team !== team);
  if (defenders.length !== 2) return null;
  const origins = defenders.map(actor => segment.previous?.positions?.[actor]);
  if (!origins.every(point)) return null;
  // Snapshot finite coefficients and origins. A diagnostic sampler cannot
  // mutate the affine theorem while it is being evaluated.
  const actorOrigins = origins.map(origin => ({x: origin.x, y: origin.y}));
  const stages = [];
  let covered = 0, priorEnd = null;
  for (const supplied of solved.stages) {
    if (covered === end) break;
    if (!supplied || ![supplied.startTime, supplied.endTime, supplied.vx, supplied.vz].every(Number.isFinite)
      || !point(supplied.from) || supplied.startTime !== covered || supplied.endTime <= supplied.startTime) return null;
    const stage = {startTime: supplied.startTime, endTime: supplied.endTime, vx: supplied.vx, vz: supplied.vz,
      from: {x: supplied.from.x, y: supplied.from.y}};
    if (priorEnd && !consistentPoint(stage.from, priorEnd.position, priorEnd.stage, covered)) return null;
    const stop = Math.min(end, stage.endTime), velocity = Math.hypot(stage.vx, stage.vz);
    if (!Number.isFinite(velocity)) return null;
    stages.push({stage, start: stage.startTime, stop, lipschitz: (velocity + PARAMETERS.allowanceLipschitzFeetPerSecond) * (1 + 8 * Number.EPSILON)});
    priorEnd = {stage, position: affinePoint(stage, stop)};
    if (!point(priorEnd.position)) return null;
    covered = stop;
  }
  if (covered !== end) return null;
  const actors = [];
  for (const [actorIndex, actor] of defenders.entries()) {
    const origin = actorOrigins[actorIndex];
    let lower = Infinity, leafIntervals = 0, intervalEvaluations = 0, maxDepthUsed = 0;
    for (const {stage, start, stop, lipschitz} of stages) {
      if (!Number.isFinite(lipschitz)) return null;
      const samples = new Map();
      const gap = time => {
        if (samples.has(time)) return samples.get(time);
        const ball = affinePoint(stage, time), duration = lead + time;
        if (!point(ball) || !Number.isFinite(duration)) return null;
        let observed;
        try { observed = solved.sampleBoard(time); } catch { return null; }
        // Only a consistency diagnostic. Finite affine coefficients, not
        // arbitrary callback samples, establish the Lipschitz bound.
        if (!consistentPoint(observed, ball, stage, time)) return null;
        const allowance = Math.min(PARAMETERS.endpointFeetPerSecond * duration,
          PARAMETERS.endpointAccelerationFactor * duration * duration);
        // Subtract origins before adding displacement, so a large world
        // translation cannot round away real relative travel. The outward
        // operation guard also makes extreme finite cancellation fail closed.
        // Its scale covers subtraction/addition, time products, hypot and
        // allowance arithmetic; the global18 slope covers lead+time rounding.
        const local = time - stage.startTime;
        const dx = (stage.from.x - origin.x) + stage.vx * local;
        const dy = (stage.from.y - origin.y) + stage.vz * local;
        const value = Math.hypot(dx, dy) - PARAMETERS.paddleReachFeet - allowance;
        const scale = 1 + Math.abs(stage.from.x) + Math.abs(origin.x) + Math.abs(stage.from.y) + Math.abs(origin.y)
          + (Math.abs(stage.vx) + Math.abs(stage.vz)) * (Math.abs(time) + Math.abs(stage.startTime))
          + PARAMETERS.paddleReachFeet + Math.abs(allowance)
          + PARAMETERS.allowanceLipschitzFeetPerSecond * (Math.abs(lead) + Math.abs(time));
        const error = 64 * Number.EPSILON * scale, conservative = value - error;
        if (!Number.isFinite(allowance) || !Number.isFinite(value) || !Number.isFinite(error)
          || !Number.isFinite(conservative)) return null;
        samples.set(time, conservative);
        return conservative;
      };
      const inspect = (a, b, depth) => {
        if (intervalEvaluations >= PARAMETERS.maxIntervalEvaluationsPerActor) return false;
        intervalEvaluations++; maxDepthUsed = Math.max(maxDepthUsed, depth);
        const width = b - a, middle = a + width / 2;
        if (!Number.isFinite(width) || !(width > 0) || !(middle > a && middle < b)) return false;
        const values = [gap(a), gap(middle), gap(b)];
        if (values.some(value => value === null)) return false;
        const sampledMinimum = Math.min(...values);
        // In exact arithmetic the three-node cover radius is width/4.
        // Use the actual rounded midpoint's larger half-gap, rounded outward,
        // rather than silently assuming it divides the interval perfectly.
        // A(T)=min(9T,7.5T²) has global slope at most18, including T=1.2.
        const coverRadius = Math.max(middle - a, b - middle) / 2
          + 8 * Number.EPSILON * (1 + Math.abs(a) + Math.abs(b));
        const bound = sampledMinimum - lipschitz * coverRadius;
        if (!Number.isFinite(bound)) return false;
        if (bound > POSITIVE_MARGIN) {
          leafIntervals++; lower = Math.min(lower, bound); return true;
        }
        if (sampledMinimum <= POSITIVE_MARGIN || depth >= PARAMETERS.maxRefinementDepth) return false;
        return inspect(a, middle, depth + 1) && inspect(middle, b, depth + 1);
      };
      let a = start;
      for (let index = 1; index <= PARAMETERS.initialIntervalsPerStage; index++) {
        const b = index === PARAMETERS.initialIntervalsPerStage ? stop
          : start + (stop - start) * index / PARAMETERS.initialIntervalsPerStage;
        if (!inspect(a, b, 0)) return null;
        a = b;
      }
    }
    if (!Number.isFinite(lower) || lower <= POSITIVE_MARGIN) return null;
    actors.push({actor, origin, continuousLowerBoundFeet: lower, leafIntervals, intervalEvaluations, maxDepthUsed});
  }
  return {version: GENERATED_ROUTE_CERTIFICATE_VERSION_V3, applicability: APPLICABILITY,
    parameters: {...PARAMETERS}, leadInSeconds: lead, throughSeconds: end, actors};
}

export function matchesGeneratedRouteCertificateV3(declared, current) {
  if (!validGeneratedRouteCertificateShapeV3(declared) || !validGeneratedRouteCertificateShapeV3(current)) return false;
  // Only nine-decimal source serialization tolerance. Work counters are exact.
  const near = (left, right) => Math.abs(left - right) <= 1e-8;
  return near(declared.leadInSeconds, current.leadInSeconds) && near(declared.throughSeconds, current.throughSeconds)
    && declared.actors.every((actor, index) => actor.actor === current.actors[index].actor
      && near(actor.origin.x, current.actors[index].origin.x) && near(actor.origin.y, current.actors[index].origin.y)
      && near(actor.continuousLowerBoundFeet, current.actors[index].continuousLowerBoundFeet)
      && actor.leafIntervals === current.actors[index].leafIntervals
      && actor.intervalEvaluations === current.actors[index].intervalEvaluations
      && actor.maxDepthUsed === current.actors[index].maxDepthUsed);
}
