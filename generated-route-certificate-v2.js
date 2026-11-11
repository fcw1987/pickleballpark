// A theorem for NEW generated full quadratic eased routes ending at contact.
// It is deliberately separate from the historical speed-only v1 theorem.
// For endpoint distance D and duration T, peak speed is 2D/T and acceleration
// magnitude is 4D/T^2. The selected 18 ft/s and 30 ft/s^2 bounds therefore give
// D <= min(9T, 7.5T^2). This is not universal human unreachability, nor a bound
// for a moving intermediate sample on a route that ends after interception.
export const GENERATED_ROUTE_CERTIFICATE_VERSION_V2 = 'generated-contact-endpoint-route-v2';
const IDS = ['player1', 'player2', 'player3', 'player4'];
const APPLICABILITY = 'acceleration-bounded-full-eased-route-ending-at-interception';
const PARAMETERS = Object.freeze({
  peakFeetPerSecond: 18,
  accelerationFeetPerSecondSquared: 30,
  endpointFeetPerSecond: 9,
  endpointAccelerationFactor: 7.5,
  paddleReachFeet: 3,
  reactionSeconds: 0,
  samplesPerStage: 512,
  allowanceLipschitzFeetPerSecond: 18,
});
const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);
// The theorem uses the represented affine stage, never inferred regularity of
// a caller-supplied sampler. Sampler/adjacent-stage checks below only reject
// inconsistent observations. Their roundoff tolerance adds no playable travel:
// each closed affine stage is independently included in the lower bound.
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
const actorShape = value => keys(value, ['actor', 'origin', 'continuousLowerBoundFeet'])
  && IDS.includes(value.actor) && keys(value.origin, ['x', 'y']) && point(value.origin)
  && Number.isFinite(value.continuousLowerBoundFeet) && value.continuousLowerBoundFeet > 1e-7;

function actorValues(actors) {
  if (!Array.isArray(actors) || Object.getPrototypeOf(actors) !== Array.prototype) return null;
  const own = Reflect.ownKeys(actors);
  if (own.length !== 3 || !own.includes('0') || !own.includes('1') || !own.includes('length')) return null;
  const length = Object.getOwnPropertyDescriptor(actors, 'length');
  const first = Object.getOwnPropertyDescriptor(actors, '0'), second = Object.getOwnPropertyDescriptor(actors, '1');
  if (length?.value !== 2 || !first || !second || !Object.hasOwn(first, 'value') || !Object.hasOwn(second, 'value')) return null;
  return [first.value, second.value];
}

export function validGeneratedRouteCertificateShapeV2(certificate) {
  if (!keys(certificate, ['version', 'applicability', 'parameters', 'leadInSeconds', 'throughSeconds', 'actors'])) return false;
  const actors = actorValues(certificate.actors);
  return certificate.version === GENERATED_ROUTE_CERTIFICATE_VERSION_V2
    && certificate.applicability === APPLICABILITY
    && keys(certificate.parameters, Object.keys(PARAMETERS))
    && Object.keys(PARAMETERS).every(key => certificate.parameters[key] === PARAMETERS[key])
    && Number.isFinite(certificate.leadInSeconds) && certificate.leadInSeconds >= 0
    && Number.isFinite(certificate.throughSeconds) && certificate.throughSeconds > 0
    && actors !== null
    && actors.every(actorShape) && actors[0].actor !== actors[1].actor;
}

export function certifyGeneratedRouteExclusionV2(play, segment, solved) {
  const end = solved?.secondBounceTime, lead = segment?.contactTime;
  if (play?.modelVersion !== 2 || segment?.modelVersion !== 2
    || !Number.isFinite(end) || end <= 0 || !Number.isFinite(lead) || lead < 0
    || !Array.isArray(solved.stages) || !solved.stages.length
    || typeof solved.sampleBoard !== 'function'
    || segment.model2Momentum !== undefined && (!Array.isArray(segment.model2Momentum) || segment.model2Momentum.length)) return null;
  const hitter = segment.shotSemantics?.playerId;
  if (!IDS.includes(hitter) || IDS.some(id => !['green', 'orange'].includes(play.players?.[id]?.team))) return null;
  const team = play.players[hitter].team, defenders = IDS.filter(id => play.players[id].team !== team);
  if (defenders.length !== 2) return null;
  // Establish complete ordered coverage before computing any bound. Even a
  // tiny positive gap is unproved time; no numerical gap tolerance is used.
  const stages = [];
  let covered = 0, priorEnd = null;
  for (const stage of solved.stages) {
    if (covered === end) break;
    if (!stage || ![stage.startTime, stage.endTime, stage.vx, stage.vz].every(Number.isFinite)
      || !point(stage.from) || stage.startTime !== covered || stage.endTime <= stage.startTime) return null;
    if (priorEnd && !consistentPoint(stage.from, priorEnd.position, priorEnd.stage, covered)) return null;
    const stop = Math.min(end, stage.endTime);
    stages.push({stage, start: stage.startTime, stop});
    priorEnd = {stage, position: affinePoint(stage, stop)};
    if (!point(priorEnd.position)) return null;
    covered = stop;
  }
  if (covered !== end) return null;
  const actors = [];
  for (const actor of defenders) {
    const origin = segment.previous?.positions?.[actor];
    if (!point(origin)) return null;
    let lower = Infinity;
    for (const {stage, start, stop} of stages) {
      const count = PARAMETERS.samplesPerStage, dt = (stop - start) / count;
      let minimum = Infinity;
      for (let index = 0; index <= count; index++) {
        // Select the exact endpoints rather than introducing a final ulp gap.
        const time = index === count ? stop : start + dt * index;
        const ball = affinePoint(stage, time), duration = lead + time;
        if (!point(ball) || !Number.isFinite(duration)) return null;
        // This is a consistency diagnostic only. The proof and its Lipschitz
        // constant come from the finite affine stage coefficients above.
        if (!consistentPoint(solved.sampleBoard(time), ball, stage, time)) return null;
        const allowance = Math.min(9 * duration, 7.5 * duration * duration);
        minimum = Math.min(minimum, Math.hypot(ball.x - origin.x, ball.y - origin.y) - 3 - allowance);
      }
      // On a shared-solver horizontal stage, distance to a fixed origin is
      // hypot(vx,vz)-Lipschitz. A(T)=min(9T,7.5T^2) is continuous for T>=0;
      // A'(T)=15T for T<1.2, then9 for T>1.2. Its GLOBAL slope bound is18,
      // not9. Every time is within dt/2 of a sampled endpoint/interior point.
      const penalty = (Math.hypot(stage.vx, stage.vz) + PARAMETERS.allowanceLipschitzFeetPerSecond) * dt / 2;
      lower = Math.min(lower, minimum - penalty);
    }
    if (!Number.isFinite(lower) || lower <= 1e-7) return null;
    actors.push({actor, origin: {x: origin.x, y: origin.y}, continuousLowerBoundFeet: lower});
  }
  return {version: GENERATED_ROUTE_CERTIFICATE_VERSION_V2, applicability: APPLICABILITY,
    parameters: {...PARAMETERS}, leadInSeconds: lead, throughSeconds: end, actors};
}

export function matchesGeneratedRouteCertificateV2(declared, current) {
  if (!validGeneratedRouteCertificateShapeV2(declared) || !validGeneratedRouteCertificateShapeV2(current)) return false;
  // Generated source is serialized to nine decimal places. This comparison
  // tolerates only that representation, not a change to the theorem's inputs.
  const near = (left, right) => Math.abs(left - right) <= 1e-8;
  return near(declared.leadInSeconds, current.leadInSeconds) && near(declared.throughSeconds, current.throughSeconds)
    && declared.actors.every((actor, index) => actor.actor === current.actors[index].actor
      && near(actor.origin.x, current.actors[index].origin.x) && near(actor.origin.y, current.actors[index].origin.y)
      && near(actor.continuousLowerBoundFeet, current.actors[index].continuousLowerBoundFeet));
}
