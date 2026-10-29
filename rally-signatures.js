// Bounded grounded signature affordances. These are feasible candidates, not
// point winners: the engine must still trial and independently validate source.
import { PHYSICS_VERSION, PHYSICS_V2, solveFlightV2, interceptFlightV2 } from './play-physics-v2.js';
import { createModel2SegmentV2 } from './play-timeline-v2.js';
import { resolveShotSemantics, boardToWorld } from './three-d-core.js';
import { inspectModel2SegmentV2 } from './play-outcome-v2.js';
import { eligibleHitters, contactRequiresBounce, teamForPlayer } from './rally-state.js';
import { sampleActorFeetV2 } from './play-actors-v2.js';
import { contactFeetV1, boundMovementV1, sampleFeetStateV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from './rally-movement.js';

export const SIGNATURE_VERSION = 'rally-signatures-v1';
export const SIGNATURE_LIMITS = Object.freeze({ volleyFractions: Object.freeze([.35, .5, .65, .8, .9, .95]),
  bounceDelays: Object.freeze([.03, .06, .12, .2, .28, .4, .6]), maxLaunchTrials: 8,
  maximumContactHeightFeet: 6.5, peakFeetPerSecond: 17.95 });
const IDS = Object.freeze(['player1', 'player2', 'player3', 'player4']);
const R = PHYSICS_V2.ballRadiusFeet, EPS = 1e-7;
const clone = value => structuredClone(value);
const xy = value => ({ x: value.x, y: value.y });
const center = feet => ({ x: (feet[0].x + feet[1].x) / 2, y: (feet[0].y + feet[1].y) / 2 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ownEnd = (p, team) => team === 'green' ? p.y + R <= 22 + EPS : p.y - R >= 22 - EPS;
const ownNVZBand = (p, team) => team === 'green' ? p.y >= 15 && p.y < 22 : p.y > 22 && p.y <= 29;
const apron = p => p.x >= -8 && p.x <= 28 && p.y >= -8 && p.y <= 52;
const outsideNVZ = p => p.x < 0 || p.x > 20 || p.y < 15 || p.y > 29;
const outsideSideline = p => p.x < 0 || p.x > 20;
const manual = p => ({ intent: 'manual', target: xy(p), pinned: false });
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const point = (p, name) => { if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError(`${name} needs finite board coordinates.`); };
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);

function strokeSide(player, origin, contact) {
  const forehandDirection = (player.team === 'green' ? -1 : 1) * (player.handedness === 'left' ? -1 : 1);
  return (contact.x - origin.x) * forehandDirection >= 0 ? 'forehand' : 'backhand';
}
function outgoingChoices(intent, contact, team) {
  const left = contact.x < 0, opposite = y => team === 'green' ? y : 44 - y;
  if (intent === 'erne') return [
    { target: { x: left ? 5 : 15, y: opposite(29) }, apex: Math.max(contact.heightFeet, 4) },
    { target: { x: left ? 5 : 15, y: opposite(29) }, apex: Math.max(contact.heightFeet, 5) },
    { target: { x: left ? 8 : 12, y: opposite(32) }, apex: Math.max(contact.heightFeet, 5) },
    { target: { x: left ? 15 : 5, y: opposite(30) }, apex: Math.max(contact.heightFeet, 6) },
  ];
  return [43, 40, 32, 42].flatMap((y, index) => [2.5, 4].map(apex => ({
    target: { x: left ? (index === 0 ? .25 : .5) : (index === 0 ? 19.75 : 19.5), y: opposite(y) },
    apex: Math.max(contact.heightFeet, apex),
  })));
}
function outgoingFlight(intent, contact, team, work) {
  for (const choice of outgoingChoices(intent, contact, team).slice(0, SIGNATURE_LIMITS.maxLaunchTrials)) {
    work.launchTrials++;
    try {
      if (choice.apex > 30) continue;
      const family = intent === 'erne' ? 'volley' : 'drive', physics = { apexFeet: choice.apex };
      const flight = solveFlightV2({ physicsVersion: PHYSICS_VERSION, from: contact, target: choice.target,
        family, arc: 'medium', pace: intent === 'erne' ? 'soft' : 'firm', quality: 'neutral', physics });
      if (flight.obstruction || !flight.events.some(event => event.type === 'net-crossing')) continue;
      if (intent === 'around-the-post' && !flight.events.some(event => event.type === 'net-crossing' && event.aroundPost)) continue;
      return { flight, physics, target: xy(choice.target), family };
    } catch (error) { if (!(error instanceof RangeError || error instanceof TypeError)) throw error; }
  }
  return null;
}
function prepareRoute({ pendingSegment, pendingRecipe, playerId, contact, feet, outgoing, kind, contactStyle, time }) {
  const previous = clone(pendingSegment.previous), step = clone(pendingSegment.step);
  const duration = pendingSegment.contactTime + time;
  const movement = {};
  for (const id of IDS) {
    const striking = id === pendingSegment.shotSemantics.playerId;
    const origin = striking ? center(pendingSegment.shotSemantics.contact.feet) : previous.positions[id];
    const desired = id === playerId ? feet.stance : step.positions[id];
    const available = striking ? Math.max(0, duration - pendingSegment.contactTime - .12) : duration;
    const target = id === playerId ? xy(desired) : boundMovementV1(origin, desired, available, SIGNATURE_LIMITS.peakFeetPerSecond);
    movement[id] = manual(target); step.positions[id] = xy(target);
  }
  const incomingHitter = pendingSegment.shotSemantics.playerId;
  const pendingMovement = { movement: movement[incomingHitter], playerMovement: Object.fromEntries(IDS.filter(id => id !== incomingHitter).map(id => [id, movement[id]])) };
  const supplied = pendingRecipe ?? step.shot.authoring;
  if (supplied?.movement?.pinned || Object.values(supplied?.playerMovement || {}).some(value => value.pinned)) return null;
  step.shot.authoring = { ...step.shot.authoring, ...clone(pendingMovement) };
  step.positions.ball = xy(contact); step.shot.to = xy(contact); step.shot.flight.bounces = kind === 'volley' ? 0 : 1;
  step.shot.physicsV2.endTimeSeconds = time; step.shot.physicsV2.endpoint = 'next-contact';
  const contactEvidence = { feet: clone(feet.feet), feetEstablishedOutsideNVZ: feet.feetEstablishedOutsideNVZ };
  const nextStep = { id: 'signature-contact', positions: clone(step.positions), shot: {
    from: xy(contact), to: outgoing.target, type: outgoing.family, stroke: outgoing.family, playerId,
    contact: { kind, point: { ...contact }, heightFeet: contact.heightFeet, strokeSide: contactStyle, ...contactEvidence },
  } };
  const resolved = createModel2SegmentV2({ previous, step, nextStep, index: pendingSegment.index,
    startTime: pendingSegment.startTime, model2Momentum: clone(pendingSegment.model2Momentum || []) }, { resolveShotSemantics, boardToWorld });
  const peak = inspectGeneratedMovementV1(resolved), spacing = inspectGeneratedSpacingV1(resolved);
  if (!peak.valid || !spacing.valid) return null;
  return { resolved, peak, spacing, pendingMovement,
    ...(pendingRecipe ? { pendingRecipe: { ...clone(pendingRecipe), ...clone(pendingMovement) } } : {}) };
}

/** Origins and footState refer to the pending segment's start. Grounded reset
 * can be proved along this modeled route; unseen airborne/balance history cannot.
 * At most one outgoing candidate per actor/intent is returned in stable order. */
export function probeSignatureCandidatesV1({ incomingFlight, pendingSegment, pendingRecipe,
  players, positions = pendingSegment?.previous?.positions, footState, service = {}, contactIndex = pendingSegment?.rallyLeg,
  opening = 'serve', eligibleIds, signatureShots = true } = {}) {
  if (typeof signatureShots !== 'boolean') throw new TypeError('signatureShots must be boolean.');
  const work = { contactTrials: 0, launchTrials: 0, routeTrials: 0 };
  if (!signatureShots) return freeze({ version: SIGNATURE_VERSION, candidates: [], exclusions: [{ code: 'disabled' }], work });
  if (incomingFlight?.physicsVersion !== PHYSICS_VERSION || typeof incomingFlight.sampleBoard !== 'function'
    || pendingSegment?.modelVersion !== 2 || !pendingSegment.shotSemantics || !Number.isFinite(incomingFlight.firstLandingTime)) throw new TypeError('An actual supported incoming flight and its pending model2 segment are required.');
  if (!Number.isInteger(contactIndex) || contactIndex < 1 || contactIndex > 98 || !['serve', 'midrally'].includes(opening)) throw new TypeError('A supported response index and opening are required.');
  const spec = pendingSegment.step?.shot?.physicsV2;
  if (!spec || distance(spec.from, incomingFlight.from) > EPS || distance(spec.target, incomingFlight.target) > EPS
    || Math.abs(spec.from.heightFeet - incomingFlight.from.heightFeet) > EPS) throw new TypeError('The incoming solution must belong to the pending segment.');
  const expectedFlight = pendingSegment.trajectory?.solved ?? solveFlightV2(spec);
  if (Math.abs(expectedFlight.firstLandingTime - incomingFlight.firstLandingTime) > EPS
    || Math.abs(expectedFlight.metadata.launchVerticalFeetPerSecond - incomingFlight.metadata?.launchVerticalFeetPerSecond) > EPS) throw new TypeError('The incoming physical arc must match the pending solution.');
  for (const time of [0, incomingFlight.firstLandingTime / 2, incomingFlight.firstLandingTime, incomingFlight.totalDuration]) {
    const expected = expectedFlight.sampleBoard(time), actual = incomingFlight.sampleBoard(time);
    if (distance(expected, actual) > 1e-6 || Math.abs(expected.heightFeet - actual.heightFeet) > 1e-6) throw new TypeError('Incoming samples must match the pending physical solution.');
  }
  if (pendingRecipe) {
    const base = clone(pendingSegment.step.shot.authoring); delete base.recipeId;
    const supplied = clone(pendingRecipe);
    for (const value of [base, supplied]) { delete value.movement; delete value.playerMovement; }
    if (canonical(base) !== canonical(supplied)) throw new TypeError('A signature probe may repair only pending movement fields.');
  }
  for (const id of IDS) { point(positions?.[id], `positions.${id}`); if (!players?.[id] || !['green', 'orange'].includes(players[id].team) || !['right', 'left'].includes(players[id].handedness)) throw new TypeError('Explicit players and handedness are required.'); }
  const legal = eligibleHitters({ players, service, contactIndex, opening, previousHitter: pendingSegment.shotSemantics.playerId });
  if (eligibleIds !== undefined && (!Array.isArray(eligibleIds) || new Set(eligibleIds).size !== eligibleIds.length || eligibleIds.some(id => !IDS.includes(id)))) throw new TypeError('Eligible identifiers must be unique represented players.');
  const actors = (eligibleIds ?? [...legal]).filter(id => legal.includes(id)).sort();
  const candidates = [], exclusions = (eligibleIds || []).filter(id => !legal.includes(id)).map(playerId => ({ playerId, code: 'ineligible-service-or-team-role' }));
  if (!actors.length) exclusions.push({ code: 'no-eligible-actors' });
  if (incomingFlight.obstruction) return freeze({ version: SIGNATURE_VERSION, candidates, exclusions: [{ code: 'blocked-incoming-flight' }], work });
  const play = { id: 'signature-probe', modelVersion: 2, physicsVersion: PHYSICS_VERSION, players: clone(players),
    rally: { openingBouncesSatisfied: opening === 'midrally', service: clone(service) }, ending: 'winner', intentionalFault: false };
  for (const playerId of actors) {
    const player = players[playerId], team = player.team, origin = positions[playerId], history = footState?.[playerId];
    if (distance(origin, pendingSegment.previous.positions[playerId]) > EPS) throw new TypeError('Signature origin must be the actual pending-route origin.');
    if (history?.grounded !== true || typeof history.feetEstablishedOutsideNVZ !== 'boolean' || history.feet?.length !== 2) { exclusions.push({ playerId, code: 'unsupported-grounded-history' }); continue; }
    if (history.feet.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) || distance(center(history.feet), origin) > .05) { exclusions.push({ playerId, code: 'grounded-origin-mismatch' }); continue; }
    if (history.feet.every(outsideNVZ) && history.feetEstablishedOutsideNVZ === false) { exclusions.push({ playerId, code: 'inconsistent-reset-history' }); continue; }
    for (const intent of ['erne', 'around-the-post']) {
      if (intent === 'erne' && contactRequiresBounce(contactIndex, opening)) { exclusions.push({ playerId, intent, code: 'opening-bounce-required' }); continue; }
      const probes = intent === 'erne' ? SIGNATURE_LIMITS.volleyFractions : SIGNATURE_LIMITS.bounceDelays;
      let accepted = false;
      for (const probe of probes) {
        work.contactTrials++;
        let intercept;
        try {
          intercept = intent === 'erne'
            ? interceptFlightV2(incomingFlight, { kind: 'volley', stance: origin, beforeBounceSeconds: incomingFlight.firstLandingTime * (1 - probe) })
            : interceptFlightV2(incomingFlight, { kind: 'groundstroke', stance: origin, afterBounceSeconds: probe });
        } catch (error) { if (error instanceof RangeError || error instanceof TypeError) continue; throw error; }
        const contact = { ...intercept.point }, kind = intent === 'erne' ? 'volley' : 'groundstroke';
        if (!apron(contact) || !ownEnd(contact, team) || !outsideSideline(contact) || contact.heightFeet < R || contact.heightFeet > SIGNATURE_LIMITS.maximumContactHeightFeet) continue;
        if (intent === 'erne' && !ownNVZBand(contact, team)) continue;
        if (intent === 'around-the-post' && (!ownNVZBand(contact, team)
          || !(contact.x < PHYSICS_V2.postInsideLeft - PHYSICS_V2.postDiameterFeet - R || contact.x > PHYSICS_V2.postInsideRight + PHYSICS_V2.postDiameterFeet + R))) continue;
        const outgoing = outgoingFlight(intent, contact, team, work); if (!outgoing) continue;
        const contactStyle = strokeSide(player, origin, contact);
        const feet = contactFeetV1({ contact, target: outgoing.target, team, handedness: player.handedness, contactStyle, kind, position: origin });
        if (!feet.reachable || !feet.legalVolleyFeet || intent === 'erne' && !feet.feet.every(p => outsideNVZ(p) && outsideSideline(p))) continue;
        work.routeTrials++;
        const route = prepareRoute({ pendingSegment, pendingRecipe, playerId, contact, feet, outgoing, kind, contactStyle, time: intercept.time });
        if (!route) continue;
        const inspection = inspectModel2SegmentV2(play, route.resolved, { index: route.resolved.rallyLeg - 1, terminal: false, solved: incomingFlight });
        if (inspection.violations.length || inspection.physicalCandidates.length || inspection.momentumCandidates.length) continue;
        if (intent === 'erne') {
          const before = sampleActorFeetV2(route.resolved, playerId, Math.max(0, route.resolved.duration - 1e-4));
          if (!before.every(p => outsideNVZ(p))) continue;
        }
        const contactEvidence = { feet: clone(feet.feet), feetEstablishedOutsideNVZ: feet.feetEstablishedOutsideNVZ };
        const recipe = { id: `signature-${intent}-${playerId}`, family: outgoing.family, intent, hitter: playerId, receiver: 'auto',
          contactStyle, contactMode: kind === 'volley' ? 'volley' : 'bounced', contactOverride: xy(contact),
          ...(intent === 'around-the-post' ? { contactTiming: { afterBounceSeconds: probe } } : {}),
          contactEvidence, target: outgoing.target, arc: 'medium', pace: intent === 'erne' ? 'soft' : 'firm',
          quality: 'neutral', physics: outgoing.physics, movement: { intent: 'hold', pinned: false } };
        candidates.push({ intent, playerId, kind, contact, time: intercept.time,
          contactTimeSeconds: route.resolved.endTime, contactStyle, feet, contactOverride: xy(contact),
          target: outgoing.target, physics: outgoing.physics, flight: outgoing.flight, recipe,
          pendingMovement: route.pendingMovement, ...(route.pendingRecipe ? { pendingRecipe: route.pendingRecipe } : {}),
          footState: sampleFeetStateV1(route.resolved, route.resolved.duration),
          route: { peak: route.peak, spacing: route.spacing, groundedResetVerified: intent !== 'erne' || contactEvidence.feetEstablishedOutsideNVZ },
          reason: intent === 'erne' ? 'A grounded route reaches the actual wide ball beside the NVZ before its bounce.' : 'The actual bounced ball is beyond the post and the solved return passes wholly outside it.' });
        accepted = true; break;
      }
      if (!accepted) exclusions.push({ playerId, intent, code: 'no-supported-contact-and-route' });
    }
  }
  return freeze({ version: SIGNATURE_VERSION, candidates, exclusions, work });
}
