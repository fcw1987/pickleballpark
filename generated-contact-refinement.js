// Bounded generation-only proposals. Exact route, spacing, grounded trainer
// and delivered-flight admission remain independent authorities.
// Exhausting this search proves nothing about physical reachability.
import { PHYSICS_V2 } from './play-physics-v2.js';
import { GENERATED_GROUNDED_SOLE_V1, groundedSoleClearsNVZV1 } from './generated-grounded-sole.js';
import { contactFeetCandidatesV1 } from './rally-movement.js';
import { generationDistanceBudgetV1 } from './generated-motion-limits.js';
import { GENERATED_CONTACT_SUPPORT_V1, generatedContactRadiusFeetV1 } from './generated-contact-support.js';
import { defaultFootHalfWidthFeetV1 } from './generated-foot-state.js';
import { resolveFlightParametersV1 } from './rally-targets.js';
import { assessGeneratedTrainerSupportV1 } from './generated-trainer-support.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export const GENERATED_CONTACT_REFINEMENT_V1 = Object.freeze({
  version: 'generated-contact-refinement-v1',
  scope: 'bounded-generation-proposals',
  maximumInputPairs: 256,
  maximumSeeds: 4,
  iterationsPerSeed: 48,
  directionsPerIteration: 10,
  maximumResults: 4,
  targetX: Object.freeze([3, 10, 17]),
  targetBaselineDepths: Object.freeze([3, 7]),
});

export function generatedRetrievalProbeTargetsV1(team) {
  if (!['green', 'orange'].includes(team)) throw new TypeError('An actual court team is required.');
  return Object.freeze(GENERATED_CONTACT_REFINEMENT_V1.targetX.flatMap(x =>
    GENERATED_CONTACT_REFINEMENT_V1.targetBaselineDepths.map(depth =>
      Object.freeze({ x, y: team === 'green' ? 44 - depth : depth }))));
}

export function refineGeneratedContactProposalsV1({ input, pairs, incoming, origins, defaultFootState }) {
  if (!Array.isArray(pairs) || pairs.length > GENERATED_CONTACT_REFINEMENT_V1.maximumInputPairs) {
    throw new RangeError('Contact refinement exceeds its finite proposal bound.');
  }
  let work = 0, poses = 0, flights = 0;
  const cache = new Map(), seeds = new Map();
  const half = defaultFootHalfWidthFeetV1(defaultFootState);

  const flight = (contact, target, player) => {
    const key = [contact.x, contact.y, contact.heightFeet, target.x, target.y, player.team, player.style].join(':');
    if (cache.has(key)) return cache.get(key);
    let reply = null;
    try {
      reply = resolveFlightParametersV1({
        candidate: { family: 'drive', pace: 'firm', arc: 'medium', intent: 'drive' },
        contact, target, team: player.team, style: player.style, materialization: 'first',
      });
      work += reply.planner.diagnostics.workUnits ?? reply.planner.diagnostics.solverCalls ?? 1;
    } catch (error) {
      if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
      work += error.plannerDiagnostics?.workUnits ?? error.plannerDiagnostics?.solverCalls ?? 1;
    }
    flights++;
    cache.set(key, reply);
    return reply;
  };

  const assess = (pair, feet, target) => {
    const player = input.players[pair.id], reply = flight(pair.contact, target, player);
    if (!reply) return null;
    const support = assessGeneratedTrainerSupportV1({
      contact: pair.contact, feet: feet.feet, stance: feet.stance,
      handedness: player.handedness, strokeSide: pair.contactStyle,
      family: 'drive', kind: pair.kind, outgoingFlight: reply.flight,
      incomingFlight: incoming, incomingTimeSeconds: pair.time,
      nearCourt: origins[pair.id].y < 22,
    });
    work++;
    poses++;
    if (!support.supported || !Number.isFinite(support.reachError)) return null;
    return { pair, feet, target, error: support.reachError, feasible: support.feasible };
  };

  // Retain only the best seed for each actor, actual stroke side and target.
  // These are nominal physical probes, never future execution draws.
  for (const pair of pairs) {
    work++;
    if (distance(pair.contact, origins[pair.id]) > 3 + generationDistanceBudgetV1(pair.time) + 1e-7) continue;
    const player = input.players[pair.id], team = player.team;
    const candidates = contactFeetCandidatesV1({
      contact: pair.contact, target: { x: 10, y: team === 'green' ? 36 : 8 },
      team, handedness: player.handedness, contactStyle: pair.contactStyle, kind: pair.kind,
      position: origins[pair.id], availableSeconds: pair.time, defaultFootState, refineAngular: true,
    }).filter(feet => feet.reachable && feet.legalVolleyFeet && feet.routeReachable);
    for (const target of generatedRetrievalProbeTargetsV1(team)) {
      const key = [pair.id, pair.contactStyle, pair.kind, target.x, target.y].join(':');
      for (const feet of candidates) {
        const row = assess(pair, feet, target);
        if (row && (!seeds.has(key) || row.error < seeds.get(key).error)) seeds.set(key, row);
      }
    }
  }

  const output = [];
  const ranked = [...seeds.values()].sort((a, b) => a.error - b.error)
    .slice(0, GENERATED_CONTACT_REFINEMENT_V1.maximumSeeds);

  // Lens coordinates preserve the selected travel and paddle disks as contact
  // time changes. Every resulting stance still crosses ordinary admission.
  const evaluate = (seed, values) => {
    work++;
    const [time, radialFraction, angleFraction] = values;
    const player = input.players[seed.pair.id], team = player.team, origin = origins[seed.pair.id];
    if (time <= 0 || time >= incoming.secondBounceTime
      || radialFraction < 0 || radialFraction > 1 || angleFraction < -1 || angleFraction > 1
      || (time < incoming.firstLandingTime) !== (seed.pair.kind === 'volley')) return null;
    const contact = incoming.sampleBoard(time);
    if (contact.heightFeet < PHYSICS_V2.ballRadiusFeet
      || contact.heightFeet > GENERATED_CONTACT_SUPPORT_V1.maximumContactHeightFeet) return null;
    const radiusMax = generatedContactRadiusFeetV1(contact.heightFeet);
    if (radiusMax === null) return null;

    const budget = generationDistanceBudgetV1(time) * (1 - 1e-7), d = distance(origin, contact);
    const minimumRadius = Math.max(.90001, d - budget + 1e-6);
    if (!(d > 0 && minimumRadius < radiusMax - 1e-5)) return null;
    const radius = minimumRadius + (radiusMax - 1e-5 - minimumRadius) * radialFraction;
    const cap = Math.acos(clamp((d * d + radius * radius - budget * budget) / (2 * d * radius), -1, 1));
    const angle = Math.atan2(origin.y - contact.y, origin.x - contact.x) + cap * angleFraction;
    const stance = { x: contact.x + radius * Math.cos(angle), y: contact.y + radius * Math.sin(angle) };
    const bodySide = (team === 'green' ? 1 : -1)
      * (player.handedness === 'right' ? 1 : -1) * (seed.pair.contactStyle === 'backhand' ? -1 : 1);
    if (radius < .9 || radius > radiusMax - 1e-5 || bodySide * (stance.x - contact.x) < .15
      || stance.x < Math.max(-7.5, -8 + half) || stance.x > Math.min(27.5, 28 - half)
      || stance.y < -7.5 || stance.y > 51.5 || (team === 'green' ? stance.y > 21.99 : stance.y < 22.01)) return null;

    const feet = [{ x: stance.x + half, y: stance.y }, { x: stance.x - half, y: stance.y }];
    const established = feet.every(groundedSoleClearsNVZV1);
    const sideHalf = half + GENERATED_GROUNDED_SOLE_V1.halfWidthFeet;
    const besideZone = stance.x < -sideHalf - 1e-5 || stance.x > 20 + sideHalf + 1e-5;
    const nearY = 15 - GENERATED_GROUNDED_SOLE_V1.halfDepthFeet - 1e-5;
    const farY = 29 + GENERATED_GROUNDED_SOLE_V1.halfDepthFeet + 1e-5;
    if (seed.pair.kind === 'volley' && (!established
      || (!besideZone && (team === 'green' ? stance.y > nearY : stance.y < farY)))) return null;

    const pair = {
      ...seed.pair, time, availableSeconds: time, contact,
      ...(seed.pair.kind === 'volley'
        ? { beforeBounceSeconds: incoming.firstLandingTime - time }
        : { delay: time - incoming.firstLandingTime }),
    };
    const footState = {
      feet, stance, grounded: true, reachable: true, legalVolleyFeet: true,
      feetEstablishedOutsideNVZ: established, originUsed: true, stanceFeasible: true,
      travelFeet: distance(origin, stance), bodyClearanceFeet: radius,
      routeReachable: true, arrivalPeakFeetPerSecond: 2 * distance(origin, stance) / time,
    };
    const row = assess(pair, footState, seed.target);
    return row && { ...row, values };
  };

  for (const seed of ranked) {
    const origin = origins[seed.pair.id], contact = seed.pair.contact, position = seed.feet.stance;
    const budget = generationDistanceBudgetV1(seed.pair.time) * (1 - 1e-7);
    const d = distance(origin, contact), radius = distance(position, contact);
    const minimumRadius = Math.max(.90001, d - budget + 1e-6);
    const maximumRadius = generatedContactRadiusFeetV1(contact.heightFeet) - 1e-5;
    if (!(maximumRadius > minimumRadius && d > 0)) continue;
    const cap = Math.acos(clamp((d * d + radius * radius - budget * budget) / (2 * d * radius), -1, 1));
    const angle = Math.atan2(position.y - contact.y, position.x - contact.x)
      - Math.atan2(origin.y - contact.y, origin.x - contact.x);
    const delta = Math.atan2(Math.sin(angle), Math.cos(angle));
    let here = evaluate(seed, [
      seed.pair.time, clamp((radius - minimumRadius) / (maximumRadius - minimumRadius), 0, 1),
      cap ? clamp(delta / cap, -1, 1) : 0,
    ]);
    if (!here) continue;
    let steps = [.002, .05, .1];
    for (let iteration = 0; iteration < GENERATED_CONTACT_REFINEMENT_V1.iterationsPerSeed && !here.feasible; iteration++) {
      let best = here;
      for (let dimension = 0; dimension < 3; dimension++) for (const sign of [-1, 1]) {
        const values = [...here.values];
        values[dimension] += sign * steps[dimension];
        const next = evaluate(seed, values);
        if (next && next.error < best.error - 1e-12) best = next;
      }
      for (const timeSign of [-1, 1]) for (const radialSign of [-1, 1]) {
        const values = [...here.values];
        values[0] += timeSign * steps[0];
        values[1] += radialSign * steps[1];
        const next = evaluate(seed, values);
        if (next && next.error < best.error - 1e-12) best = next;
      }
      if (best === here) {
        steps = steps.map(value => value / 2);
        if (steps[0] < 1e-8) break;
      } else here = best;
    }
    if (here.feasible) output.push({
      ...here.pair, feet: here.feet, refinedStance: here.feet,
      refinementTarget: here.target, refinementError: here.error,
    });
  }

  return {
    version: GENERATED_CONTACT_REFINEMENT_V1.version, pairs: output, work, poses, flights,
    seeds: ranked.map(row => ({
      id: row.pair.id, time: row.pair.time, target: row.target, error: row.error,
    })),
    found: output.length,
  };
}
