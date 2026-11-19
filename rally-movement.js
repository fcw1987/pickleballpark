// Grounded model-2 tactical movement. This plans targets; the shared sampler
// remains the authority for the path actually played and rendered.
import { sampleActorBoardPositionV2, sampleActorFeetV2 } from './play-actors-v2.js';
export { GROUNDED_CONTACT_HEIGHT_FEET } from './play-actors-v2.js';
import { teamForPlayer } from './rally-state.js';
import { doublesCoverageLanes } from './rally-tactics.js';
import { stackingTeamPlanV1 } from './rally-stacking.js';
import { generatedContactRadiusFeetV1, GENERATED_CONTACT_SUPPORT_V1 } from './generated-contact-support.js';
import { GENERATION_MOTION_V1, generationDistanceBudgetV1 } from './generated-motion-limits.js';
import { defaultFootHalfWidthFeetV1, defaultFeetAtV1 } from './generated-foot-state.js';
import { GENERATED_GROUNDED_SOLE_V1, groundedSoleClearsNVZV1 } from './generated-grounded-sole.js';

export const MOVEMENT_VERSION = 'rally-movement-v2';
export const GENERATOR_MOVEMENT = Object.freeze({ peakFeetPerSecond: 18, halfStanceFeet: .42, lineOffsetFeet: .75 });
const IDS = Object.freeze(['player1', 'player2', 'player3', 'player4']);
const EPS = 1e-7;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const xy = p => ({ x: p.x, y: p.y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearReadyLine = (y, line) => clamp(3 - Math.abs(y - line), 0, 1);
const point = (p, name) => {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError(`${name} must have finite board coordinates.`);
  return xy(p);
};
const outsideNVZ = p => p.x < 0 || p.x > 20 || p.y < 15 || p.y > 29;
const outsideContactNVZ = (p, defaultFootState) => defaultFootState === undefined ? outsideNVZ(p) : groundedSoleClearsNVZV1(p);
const stanceFeet = (p, defaultFootState) => defaultFeetAtV1(p, defaultFootState);
const needsGroundedExit = (from, goal, feet, defaultFootState) => (feet ?? stanceFeet(from, defaultFootState)).some(p => !outsideNVZ(p))
  && stanceFeet(goal, defaultFootState).every(outsideNVZ);
const footCenter = feet => ({ x: (feet[0].x + feet[1].x) / 2, y: (feet[0].y + feet[1].y) / 2 });
const command = p => ({ intent: 'manual', target: xy(p), pinned: false });
const freeze = object => {
  if (object && typeof object === 'object' && !Object.isFrozen(object)) {
    Object.values(object).forEach(freeze); Object.freeze(object);
  }
  return object;
};

// With an actual origin, choose the nearest grounded stance in a clipped
// paddle-reach annulus. The inner radius clears the torso proxy; the lateral
// half-plane preserves the declared forehand/backhand side. A tiny outer inset
// leaves room for source-coordinate rounding without enlarging paddle reach.
const CONTACT_BODY_CLEARANCE = .9, CONTACT_PADDLE_RADIUS = 3 - 1e-5, CONTACT_SIDE_CLEARANCE = .15;
// Missing height is a legacy geometric-helper call, not generated evidence.
// Actual generation always supplies height and the driver checks it again.
const supportedPaddleRadius = contact => contact.heightFeet === undefined ? CONTACT_PADDLE_RADIUS
  : Math.max(0, (generatedContactRadiusFeetV1(contact.heightFeet) ?? 0) - 1e-5);
function closestOriginStance(contact, preferred, origin, { team, hand, kind, paddleRadius = CONTACT_PADDLE_RADIUS, defaultFootState }) {
  const half = defaultFootHalfWidthFeetV1(defaultFootState), x0 = Math.max(-7.5, -8 + half), x1 = Math.min(27.5, 28 - half);
  const sole = defaultFootState === undefined ? null : GENERATED_GROUNDED_SOLE_V1;
  const sideHalf = half + (sole?.halfWidthFeet ?? 0), inset = sole?.plannerInsetFeet ?? 1e-5;
  const nearContactY = sole ? 15 - sole.halfDepthFeet - inset : 14.25, farContactY = sole ? 29 + sole.halfDepthFeet + inset : 29.75;
  const ownY = team === 'green' ? [-7.5, 22 - .01] : [22 + .01, 51.5];
  const boxes = kind === 'volley' ? [
    { x0, x1, y0: team === 'green' ? ownY[0] : farContactY, y1: team === 'green' ? nearContactY : ownY[1] },
    { x0, x1: -sideHalf - inset, y0: ownY[0], y1: ownY[1] },
    { x0: 20 + sideHalf + inset, x1, y0: ownY[0], y1: ownY[1] },
  ] : [{ x0, x1, y0: ownY[0], y1: ownY[1] }];
  const bodySide = (team === 'green' ? 1 : -1) * hand;
  let best = null;
  for (const originalBox of boxes) {
    const box = { ...originalBox };
    if (bodySide > 0) box.x0 = Math.max(box.x0, contact.x + CONTACT_SIDE_CLEARANCE);
    else box.x1 = Math.min(box.x1, contact.x - CONTACT_SIDE_CLEARANCE);
    if (box.x0 > box.x1 || box.y0 > box.y1) continue;
    const candidates = [];
    const add = (x, y) => candidates.push({ x, y });
    add(clamp(origin.x, box.x0, box.x1), clamp(origin.y, box.y0, box.y1));
    for (const x of [box.x0, box.x1]) { add(x, clamp(origin.y, box.y0, box.y1)); for (const y of [box.y0, box.y1]) add(x, y); }
    for (const y of [box.y0, box.y1]) add(clamp(origin.x, box.x0, box.x1), y);
    for (const radius of [CONTACT_BODY_CLEARANCE, paddleRadius]) {
      for (const direction of [origin, preferred]) {
        const dx = direction.x - contact.x, dy = direction.y - contact.y, length = Math.hypot(dx, dy);
        if (length > 1e-12) add(contact.x + radius * dx / length, contact.y + radius * dy / length);
      }
      for (const x of [box.x0, box.x1]) {
        const dx = x - contact.x;
        if (Math.abs(dx) <= radius + EPS) { const dy = Math.sqrt(Math.max(0, radius * radius - dx * dx)); add(x, contact.y - dy); add(x, contact.y + dy); }
      }
      for (const y of [box.y0, box.y1]) {
        const dy = y - contact.y;
        if (Math.abs(dy) <= radius + EPS) { const dx = Math.sqrt(Math.max(0, radius * radius - dy * dy)); add(contact.x - dx, y); add(contact.x + dx, y); }
      }
    }
    for (const candidate of candidates) {
      const radius = distance(candidate, contact);
      if (candidate.x < box.x0 - EPS || candidate.x > box.x1 + EPS || candidate.y < box.y0 - EPS || candidate.y > box.y1 + EPS
        || radius < CONTACT_BODY_CLEARANCE - EPS || radius > paddleRadius + EPS) continue;
      const travel = distance(origin, candidate), preference = distance(preferred, candidate);
      if (!best || travel < best.travel - 1e-10 || Math.abs(travel - best.travel) <= 1e-10 && (preference < best.preference - 1e-10
        || Math.abs(preference - best.preference) <= 1e-10 && (candidate.x < best.stance.x || candidate.x === best.stance.x && candidate.y < best.stance.y))) {
        best = { stance: candidate, travel, preference };
      }
    }
  }
  return best;
}

/** Source feet are explicit, grounded points. Their stance accounts for hand
 * and stroke side; anatomical left/right is independent of handedness. */
export function contactFeetV1({ contact, target, team, handedness = 'right', contactStyle = 'forehand', kind = 'groundstroke', position, availableSeconds, defaultFootState } = {}) {
  const half = defaultFootHalfWidthFeetV1(defaultFootState), x0 = Math.max(-7.5, -8 + half), x1 = Math.min(27.5, 28 - half);
  const sole = defaultFootState === undefined ? null : GENERATED_GROUNDED_SOLE_V1;
  const sideHalf = half + (sole?.halfWidthFeet ?? 0), inset = sole?.plannerInsetFeet ?? 0;
  const nearContactY = sole ? 15 - sole.halfDepthFeet - inset : 14.25, farContactY = sole ? 29 + sole.halfDepthFeet + inset : 29.75;
  point(contact, 'contact'); point(target, 'target');
  if (!['green', 'orange'].includes(team) || !['left', 'right'].includes(handedness)) throw new TypeError('A team and handedness are required.');
  if (availableSeconds !== undefined && (!Number.isFinite(availableSeconds) || availableSeconds < 0)) throw new TypeError('Available stance time must be finite and nonnegative.');
  const dx = target.x - contact.x, dy = target.y - contact.y, length = Math.hypot(dx, dy) || 1;
  const forward = { x: dx / length, y: dy / length };
  const hand = (handedness === 'right' ? 1 : -1) * (contactStyle === 'backhand' ? -1 : 1);
  let stance = kind === 'serve' && position ? point(position, 'position') : {
    x: contact.x - forward.x * .8 + forward.y * .8 * hand,
    y: contact.y - forward.y * .8 - forward.x * .8 * hand,
  };
  if (!(kind === 'serve' && position)) stance = { x: clamp(stance.x, x0, x1), y: clamp(stance.y, -7.5, 51.5) };
  if (kind === 'volley' && stance.x >= -sideHalf - inset && stance.x <= 20 + sideHalf + inset) {
    stance.y = team === 'green' ? Math.min(nearContactY, stance.y) : Math.max(farContactY, stance.y);
  }
  const paddleRadius = supportedPaddleRadius(contact);
  let originChoice = null;
  if (position && kind !== 'serve') {
    const origin = point(position, 'position');
    originChoice = closestOriginStance(contact, stance, origin, { team, hand, kind, paddleRadius, defaultFootState });
    if (originChoice) stance = originChoice.stance;
  }
  // First-contact serve positioning belongs to the declared layout. Do not
  // silently fix an illegal serve stance or move it to an inferred score slot.
  const leftSign = team === 'green' ? 1 : -1;
  const feet = [{ x: stance.x + leftSign * half, y: stance.y }, { x: stance.x - leftSign * half, y: stance.y }];
  const established = feet.every(foot => outsideContactNVZ(foot, defaultFootState));
  return freeze({ feet, stance, grounded: true, feetEstablishedOutsideNVZ: established,
    reachable: paddleRadius > 0 && distance(stance, contact) <= paddleRadius + EPS && (!(position && kind !== 'serve') || !!originChoice),
    legalVolleyFeet: kind !== 'volley' || established,
    ...(position && kind !== 'serve' ? {
      originUsed: true, stanceFeasible: !!originChoice, travelFeet: originChoice?.travel ?? null,
      bodyClearanceFeet: distance(stance, contact),
      ...(availableSeconds !== undefined ? {
        routeReachable: !!originChoice && originChoice.travel <= generationDistanceBudgetV1(availableSeconds) + EPS,
        arrivalPeakFeetPerSecond: availableSeconds > 0 && originChoice ? 2 * originChoice.travel / availableSeconds : originChoice?.travel === 0 ? 0 : null,
      } : {}),
      ...(!originChoice ? { reason: 'No grounded stance satisfies paddle reach and the declared stroke side.' } : {}),
    } : {}) });
}

/** Bounded outgoing-aware alternatives. The established nearest pose stays first;
 * every alternative reports travel from the actual supplied player position.
 * Flight clearance and the sampled incoming route remain the caller's audit. */
function ordinaryContactFeetCandidatesV1(args = {}) {
  const first = contactFeetV1(args), candidates = [first];
  const { contact, target, team, handedness = 'right', contactStyle = 'forehand', kind = 'groundstroke', position, availableSeconds, defaultFootState } = args;
  const half = defaultFootHalfWidthFeetV1(defaultFootState), x0 = Math.max(-7.5, -8 + half), x1 = Math.min(27.5, 28 - half);
  const sole = defaultFootState === undefined ? null : GENERATED_GROUNDED_SOLE_V1;
  const sideHalf = half + (sole?.halfWidthFeet ?? 0), inset = sole?.plannerInsetFeet ?? 1e-5;
  const nearContactY = sole ? 15 - sole.halfDepthFeet - inset : 14.25, farContactY = sole ? 29 + sole.halfDepthFeet + inset : 29.75;
  // Serves retain their declared layout, including any existing illegality.
  if (kind === 'serve') return freeze(candidates);
  const origin = position ? point(position, 'position') : null;
  const hand = (handedness === 'right' ? 1 : -1) * (contactStyle === 'backhand' ? -1 : 1);
  const bodySide = (team === 'green' ? 1 : -1) * hand;
  const dx = target.x - contact.x, dy = target.y - contact.y, length = Math.hypot(dx, dy);
  const forward = length ? { x: dx / length, y: dy / length } : { x: 0, y: team === 'green' ? 1 : -1 };
  const paddleRadius = supportedPaddleRadius(contact);
  if (paddleRadius < CONTACT_BODY_CLEARANCE) return freeze(candidates);
  const seen = new Set([`${first.stance.x.toFixed(8)},${first.stance.y.toFixed(8)}`]);
  const add = (stance, minimumClearance = CONTACT_BODY_CLEARANCE) => {
    const radius = distance(stance, contact);
    if (radius < minimumClearance - EPS || radius > paddleRadius + EPS
      || bodySide * (stance.x - contact.x) < CONTACT_SIDE_CLEARANCE - EPS
      || stance.x < x0 || stance.x > x1 || stance.y < -7.5 || stance.y > 51.5
      || (team === 'green' ? stance.y > 21.99 : stance.y < 22.01)) return;
    const leftSign = team === 'green' ? 1 : -1;
    const feet = [{ x: stance.x + leftSign * half, y: stance.y }, { x: stance.x - leftSign * half, y: stance.y }];
    const established = feet.every(foot => outsideContactNVZ(foot, defaultFootState));
    const besideZone = sole ? stance.x <= -sideHalf - inset || stance.x >= 20 + sideHalf + inset
      : stance.x < -half - 1e-5 || stance.x > 20 + half + 1e-5;
    if (kind === 'volley' && (!established || (!besideZone && (team === 'green' ? stance.y > nearContactY : stance.y < farContactY)))) return;
    const key = `${stance.x.toFixed(8)},${stance.y.toFixed(8)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const travel = origin ? distance(origin, stance) : null;
    candidates.push(freeze({ feet, stance, grounded: true, reachable: true, legalVolleyFeet: kind !== 'volley' || established,
      feetEstablishedOutsideNVZ: established,
      ...(origin ? { originUsed: true, stanceFeasible: true, travelFeet: travel, bodyClearanceFeet: radius,
        ...(availableSeconds !== undefined ? { routeReachable: travel <= generationDistanceBudgetV1(availableSeconds) + EPS,
          arrivalPeakFeetPerSecond: availableSeconds > 0 ? 2 * travel / availableSeconds : travel === 0 ? 0 : null } : {}) } : {}) }));
  };
  // Reserve a nearer paddle plant before angle sampling consumes the budget.
  // Unlike fixed outgoing-relative angles, the clipped nearest-origin search
  // can shorten extension while keeping the same legal ready-line depth.
  if (origin) {
    const comfortable = closestOriginStance(contact, first.stance, origin,
      { team, hand, kind, paddleRadius: Math.min(1.8, paddleRadius), defaultFootState });
    if (comfortable) add(comfortable.stance);
    // A fast ball may permit an intermediate extension that neither the
    // comfortable 1.8 ft nor emergency 3 ft radius grid represents. Reserve the
    // smallest clipped radius reachable from the actual origin in real time.
    // This is only a proposal; exact route, spacing and trainer checks follow.
    if (availableSeconds !== undefined && first.stanceFeasible && paddleRadius > 1.8) {
      const budget = generationDistanceBudgetV1(availableSeconds) * (1 - 1e-8);
      if (first.travelFeet <= budget && (!comfortable || comfortable.travel > budget)) {
        let low = 1.8, high = paddleRadius, timed = { stance: first.stance };
        for (let iteration = 0; iteration < 20; iteration++) {
          const radius = (low + high) / 2;
          const candidate = closestOriginStance(contact, first.stance, origin, { team, hand, kind, paddleRadius: radius, defaultFootState });
          if (candidate && candidate.travel <= budget) { high = radius; timed = candidate; }
          else low = radius;
        }
        add(timed.stance);
      }
    }
  }
  // Reserve a court-facing plant behind the ball, independent of the outgoing
  // angle. Staying at the line is not an advantage if it requires reaching
  // backward at full extension. Admission still checks actual travel and feet.
  add(contactFeetV1({ ...args, target: { x: contact.x, y: contact.y + (team === 'green' ? 10 : -10) },
    position: undefined, availableSeconds: undefined }).stance);
  add(contactFeetV1({ ...args, position: undefined, availableSeconds: undefined }).stance);
  // A high ball needs the player under it, not merely somewhere in the outer
  // reach cylinder. Reserve the existing compact radius before the wider angle
  // grid consumes the eight-proposal budget. These are new-generation plants,
  // not changes to explicit authored feet or a guarantee of anatomical reach.
  if (defaultFootState !== undefined && contact.heightFeet > GENERATED_CONTACT_SUPPORT_V1.maximumShoulderHeightMetres / .3048) {
    // At 7 ft the ball is above the adult head, so these two generated
    // proposals can move under it. All ordinary torso-clearance plants stay
    // unchanged; selected-hand pose, sole and route checks still admit the reply.
    const compactRadius = contact.heightFeet >= 7 ? .6 : .95;
    const courtTarget = { x: contact.x, y: contact.y + (team === 'green' ? 10 : -10) };
    for (const target of [args.target, courtTarget]) {
      const natural = contactFeetV1({ ...args, target, position: undefined, availableSeconds: undefined }).stance;
      const dx = natural.x - contact.x, dy = natural.y - contact.y, length = Math.hypot(dx, dy);
      if (length > 0) add({ x: contact.x + dx * compactRadius / length, y: contact.y + dy * compactRadius / length }, Math.min(CONTACT_BODY_CLEARANCE, compactRadius));
    }
  }
  for (const radius of [...new Set([Math.min(2.9, paddleRadius), Math.min(1.8, paddleRadius), .95])].filter(r => r <= paddleRadius)) {
    for (const degrees of [90, -90, 135, -135, 180, 60, -60, 120, -120]) {
      const angle = degrees * Math.PI / 180;
      add({ x: contact.x + radius * (forward.x * Math.cos(angle) - forward.y * Math.sin(angle)),
        y: contact.y + radius * (forward.y * Math.cos(angle) + forward.x * Math.sin(angle)) });
      if (candidates.length === 8) return freeze(candidates);
    }
  }
  return freeze(candidates);
}

/** A full rest-to-rest ease obeys both peak speed and acceleration bounds. */
export function boundMovementV1(from, desired, seconds, peakFeetPerSecond = GENERATOR_MOVEMENT.peakFeetPerSecond) {
  point(from, 'from'); point(desired, 'desired');
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(peakFeetPerSecond) || peakFeetPerSecond <= 0 || peakFeetPerSecond > 18) throw new TypeError('Finite nonnegative duration and a peak speed in (0,18] ft/s are required.');
  const length = distance(from, desired), budget = generationDistanceBudgetV1(seconds, peakFeetPerSecond);
  const fraction = length ? Math.min(1, budget / length) : 0;
  return freeze({ x: from.x + (desired.x - from.x) * fraction, y: from.y + (desired.y - from.y) * fraction });
}

// Recover legal ready depth before restoring a preferred lateral role. This
// fallback leaves the other partner still, then undergoes the same continuous
// spacing check. If even this path is unsafe, it is not declared a reset.
function groundedExitOrHold(from, goal, seconds, peakFeetPerSecond, feet, defaultFootState) {
  return needsGroundedExit(from, goal, feet, defaultFootState)
    ? boundMovementV1(from, { x: from.x, y: goal.y }, seconds, peakFeetPerSecond) : xy(from);
}

/** Plan a pair together without giving either player the other's lane. The
 * endpoint is provisional until the pending leg gets its real next contact. */
export function planMovementV1({ positions, players, hitter, contact, target, durationSeconds, seconds,
  contactTime = 0, index = 0, service = {}, stacking, intent = '', family = '', incomingFamily = '', quality = 'neutral', pace = 'medium',
  opening = 'serve', kind = 'groundstroke', contactStyle = 'forehand', feetState = {}, contactFeet, peakFeetPerSecond = 18, defaultFootState,
  pairedCoverage = false } = {}) {
  defaultFootHalfWidthFeetV1(defaultFootState);
  const duration = durationSeconds ?? seconds;
  if (!['low', 'neutral', 'attackable', 'excellent', 'error'].includes(quality)) throw new TypeError('Movement needs a supported execution quality.');
  if (!['soft', 'medium', 'firm'].includes(pace)) throw new TypeError('Movement needs a supported pace.');
  if (!Number.isFinite(peakFeetPerSecond) || peakFeetPerSecond <= 0 || peakFeetPerSecond > 18) throw new RangeError('Generated peak speed must be in (0,18] ft/s.');
  if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(contactTime) || contactTime < 0 || contactTime > duration + EPS) throw new TypeError('Movement needs its actual bounded segment duration and contact time.');
  if (!IDS.includes(hitter) || !Number.isInteger(index) || index < 0 || index > 98) throw new TypeError('Movement needs a represented hitter and contact index.');
  for (const id of IDS) { point(positions?.[id], `positions.${id}`); if (!players?.[id]) throw new TypeError(`Missing player ${id}.`); }
  point(contact, 'contact'); point(target, 'target');
  const hittingTeam = teamForPlayer(hitter, players), servingTeam = service.servingTeam ?? teamForPlayer(service.server, players);
  const chosenFeet = contactFeet ?? contactFeetV1({ contact, target, team: hittingTeam,
    handedness: players[hitter].handedness, kind, contactStyle, defaultFootState, position: index === 0 ? positions[hitter] : undefined });
  const suppliedFeet = Array.isArray(chosenFeet) ? chosenFeet : chosenFeet.feet;
  if (suppliedFeet?.length !== 2) throw new TypeError('Two explicit grounded contact feet are required.');
  const feet = suppliedFeet.map(p => point(p, 'contact feet'));
  const stance = footCenter(feet), established = feet.every(foot => outsideContactNVZ(foot, defaultFootState));
  if (kind === 'volley' && !established) return freeze({ ok: false, reason: 'A generated volley must establish both grounded feet outside the NVZ.' });
  if (distance(stance, contact) > 3 + EPS) return freeze({ ok: false, reason: 'The explicit contact stance exceeds paddle reach.' });
  const origins = Object.fromEntries(IDS.map(id => [id, id === hitter ? stance : xy(positions[id])]));
  const goals = {}, durations = {}, destinations = {}, diagnostics = [];
  const softAdvance = ['drop', 'reset', 'dink'].includes(family) || !family
    && ['drop', 'third-shot-drop', 'reset', 'block', 'cross-court-dink', 'middle-dink', 'straight-dink', 'backhand-dink', 'dink'].includes(intent);
  // A controlled drive can create an approach opportunity too. This is a
  // paired tactical goal, not a forced line position or a fifth-shot choice.
  const controlled = quality !== 'error' && quality !== 'attackable';
  const driveAdvance = controlled && (family === 'drive' || ['drive', 'third-shot-drive'].includes(intent));
  const firmVolleyAdvance = controlled && pace === 'firm' && (family === 'volley' || ['volley', 'firm-volley'].includes(intent));
  const openRally = opening === 'midrally' || index >= 2;
  for (const team of ['green', 'orange']) {
    const stackingPlan = stackingTeamPlanV1({ stacking, players, team, service, opening, index });
    const pair = stackingPlan?.usePreferredLanes ? [...stackingPlan.lanes]
      : IDS.filter(id => teamForPlayer(id, players) === team).sort((a, b) => positions[a].x - positions[b].x || a.localeCompare(b));
    if (stackingPlan) diagnostics.push({ code: 'stacking-phase', team, phase: stackingPlan.phase, lanes: [...stackingPlan.lanes] });
    const shift = clamp((target.x - 10) * (team === hittingTeam ? .18 : .28), -2, 2);
    const lineY = team === 'green' ? 14.25 : 29.75;
    const coverageWeight = pairedCoverage && openRally && softAdvance
      ? Math.min(...pair.map(id => nearReadyLine(origins[id].y, lineY))) : 0;
    const readyLanes = coverageWeight ? doublesCoverageLanes(target.x) : null;
    const pairInTransition = pair.some(id => team === 'green' ? origins[id].y < 12.25 : origins[id].y > 31.75);
    const controlledApproach = team === hittingTeam && openRally && (driveAdvance || firmVolleyAdvance);
    if (controlledApproach) diagnostics.push({ code: driveAdvance ? 'controlled-drive-approach' : 'firm-volley-approach', team });
    for (const [lane, id] of pair.entries()) {
      const from = origins[id], near = team === 'green', waiting = opening === 'serve' && index < 2 && team === servingTeam;
      const receiverWaiting = opening === 'serve' && index === 0 && id === service.receiver;
      // Receiving is an opening role, not a permanent right to advance. Once
      // the return is over, either pair earns progress behind its own controlled
      // shot. A defender may close behind an observed soft incoming ball, but
      // holds ready depth against a fast attack. The contact planner still
      // independently finds the actual ball. This also makes midrally starts
      // behave like an open rally from their first represented contact.
      const returningNow = opening === 'serve' && index === 1 && team !== servingTeam;
      const ownApproach = team === hittingTeam && quality !== 'error' && (returningNow
        || openRally && (controlled && softAdvance || driveAdvance || firmVolleyAdvance));
      const receiverPartnerSetup = opening === 'serve' && index === 0 && team !== servingTeam && id !== service.receiver;
      // An established kitchen pair stays balanced rather than creeping to an
      // exact coordinate on every dink. Only a transitional pair needs to close.
      const incomingSoftApproach = team !== hittingTeam && pairInTransition && openRally && softAdvance && quality !== 'error';
      const shouldAdvance = !waiting && !receiverWaiting && (ownApproach || incomingSoftApproach || receiverPartnerSetup);
      let y = shouldAdvance ? lineY : from.y;
      // A short return that sits up earns little approach time. Take a step
      // and split in transition; the partner already at the line can hold it.
      if (pairedCoverage && returningNow && quality === 'attackable' && Math.abs(target.y - 22) < 12) {
        y = near ? Math.min(lineY, from.y + 2) : Math.max(lineY, from.y - 2);
      }
      if (family === 'lob' && team !== hittingTeam) y = near ? Math.min(from.y, 9) : Math.max(from.y, 35);
      // A grounded kitchen entry is followed by a bounded retreat. This goal
      // never claims reset until actual sampled feet have exited the zone.
      if ((id === hitter ? feet : stanceFeet(from, defaultFootState)).some(p => !outsideNVZ(p))) y = lineY;
      // Stacking changes lateral preferences, never who serves/returns or the
      // two-bounce requirement. The serving partner holds the setup through
      // the serve; the server can unwind only after its sampled contact hold.
      // A receiving stack waits until the designated return starts the move.
      const stackSetupHold = stackingPlan?.holdOpeningFormation
        || stackingPlan?.protectOpeningDepth && index === 0 && id !== hitter;
      const canUnwindDeep = stackingPlan?.protectOpeningDepth && stackingPlan.usePreferredLanes;
      const hold = receiverWaiting || stackSetupHold || waiting && !canUnwindDeep;
      if (waiting) y = from.y;
      let x = clamp((lane ? 15 : 5) + shift, 1, 19);
      if (readyLanes) x += (readyLanes[lane] - x) * coverageWeight;
      goals[id] = hold ? xy(from) : { x, y };
      durations[id] = id === hitter ? Math.max(0, duration - Math.min(duration, contactTime + .12)) : duration;
    }
    // Forward approaches share progress. An urgent grounded NVZ exit has its
    // own reachable progress: a far-back partner must not trap a player inside
    // the kitchen. Both actual routes still pass the continuous spacing audit.
    const fractions = {}, exiting = {};
    let progress = 1;
    for (const id of pair) {
      const length = distance(origins[id], goals[id]);
      fractions[id] = length ? clamp(generationDistanceBudgetV1(durations[id], peakFeetPerSecond) / length, 0, 1) : 1;
      exiting[id] = needsGroundedExit(origins[id], goals[id], id === hitter ? feet : undefined, defaultFootState);
      if (!exiting[id]) progress = Math.min(progress, fractions[id]);
      else diagnostics.push({ code: 'independent-grounded-exit', actor: id });
    }
    for (const id of pair) {
      const fraction = exiting[id] ? fractions[id] : progress;
      destinations[id] = { x: origins[id].x + (goals[id].x - origins[id].x) * fraction, y: origins[id].y + (goals[id].y - origins[id].y) * fraction };
    }
    const initialSeparation = distance(origins[pair[0]], origins[pair[1]]), finalSeparation = distance(destinations[pair[0]], destinations[pair[1]]);
    if (initialSeparation >= 2.5 && finalSeparation < 2.5) {
      for (const id of pair) destinations[id] = groundedExitOrHold(origins[id], goals[id], durations[id], peakFeetPerSecond, id === hitter ? feet : undefined, defaultFootState);
      diagnostics.push({ code: 'pair-spacing-recovery', team });
    }
  }
  const predicted = () => ({ modelVersion: 2, ...(defaultFootState ? { defaultFootState } : {}), startTime: 0, endTime: duration, duration, originalDuration: duration, contactTime,
    previous: { positions: origins }, step: { id: 'planned-movement', positions: destinations },
    shotSemantics: { playerId: hitter, contact: { feet } }, model2Momentum: [] });
  for (const pair of [['player1', 'player2'], ['player3', 'player4']]) {
    const spacing = inspectGeneratedSpacingV1(predicted(), { pairs: [pair] });
    if (!spacing.valid) {
      for (const id of pair) destinations[id] = groundedExitOrHold(origins[id], goals[id], durations[id], peakFeetPerSecond, id === hitter ? feet : undefined, defaultFootState);
      const recovered = pair.some(id => distance(destinations[id], origins[id]) > EPS);
      diagnostics.push({ code: recovered ? 'sampled-pair-spacing-grounded-exit' : 'sampled-pair-spacing-hold', team: teamForPlayer(pair[0], players) });
      if (!inspectGeneratedSpacingV1(predicted(), { pairs: [pair] }).valid) {
        for (const id of pair) destinations[id] = xy(origins[id]);
        diagnostics.push({ code: 'unsafe-grounded-exit-hold', team: teamForPlayer(pair[0], players) });
        if (!inspectGeneratedSpacingV1(predicted(), { pairs: [pair] }).valid) return freeze({ ok: false, reason: 'The actual contact stance crowds its partner.' });
      }
    }
  }
  const nextFeetState = {};
  for (const id of IDS) {
    const endFeet = stanceFeet(destinations[id], defaultFootState);
    nextFeetState[id] = { feet: endFeet, grounded: true, feetEstablishedOutsideNVZ: endFeet.every(outsideNVZ) };
    if (feetState[id]?.feetEstablishedOutsideNVZ === false && nextFeetState[id].feetEstablishedOutsideNVZ) diagnostics.push({ code: 'planned-grounded-reset', actor: id });
  }
  return freeze({ ok: true, movement: command(destinations[hitter]),
    playerMovement: Object.fromEntries(IDS.filter(id => id !== hitter).map(id => [id, command(destinations[id])])),
    contactEvidence: { feet: feet.map(xy), feetEstablishedOutsideNVZ: established },
    positions: destinations, feetState: nextFeetState,
    diagnostics: { version: MOVEMENT_VERSION, peakFeetPerSecond, provisional: true,
      arrivalNeedsPendingValidation: contactTime === 0 && distance(positions[hitter], stance) > EPS,
      goals, phaseSeconds: durations, notes: diagnostics,
      kitchenSupport: { enabled: openRally && softAdvance && quality !== 'error', hittingTeam,
        ...(pairedCoverage ? { pairedCoverage: true } : {}) } } });
}

/** Resolve the one pending tactical plan against its actual contact/dead time.
 * Goals stay request-local; only these achievable destinations enter source. */
export function replanMovementV1({ plan, segment, players, durationSeconds, arrival,
  peakFeetPerSecond = 18 } = {}) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < segment.contactTime
    || !Number.isFinite(peakFeetPerSecond) || peakFeetPerSecond <= 0 || peakFeetPerSecond > 18) {
    throw new TypeError('Pending movement needs actual duration and a peak speed in (0,18].');
  }
  const hitter = segment.shotSemantics.playerId, feet = segment.shotSemantics.contact.feet, defaultFootState = segment.defaultFootState;
  const origins = Object.fromEntries(IDS.map(id => [id, id === hitter ? footCenter(feet) : point(segment.previous.positions[id], id)]));
  const goals = Object.fromEntries(IDS.map(id => [id, point(plan.diagnostics.goals[id], `goal.${id}`)]));
  if (arrival && (!IDS.includes(arrival.id) || !arrival.stance)) throw new TypeError('An arrival needs a represented hitter and exact stance.');
  // A contact beyond the sideline can be farther out than the nominal landing.
  // For a soft kitchen exchange, the far partner closes the exposed middle as
  // the actual receiver gets pulled wide. This is a continuous tactical guide,
  // not a rule or universal T destination: central poaches, deep defense and
  // fast attacks keep their original goals. Explicit arrival feet never move.
  if (arrival?.contact && plan.diagnostics.kitchenSupport?.enabled) {
    const team = teamForPlayer(arrival.id, players), lineY = team === 'green' ? 14.25 : 29.75;
    const partner = IDS.find(id => id !== arrival.id && teamForPlayer(id, players) === team);
    const at = point(arrival.stance, 'arrival stance'), contact = point(arrival.contact, 'arrival contact');
    const height = arrival.contact.heightFeet, side = Math.sign(contact.x - 10);
    const wide = clamp((Math.abs(contact.x - 10) - 8) / 3, 0, 1);
    // Smoothly retain this support on repeated wide exchanges too. Requiring
    // a fresh outward step or a partner strictly beyond x=10 would send an
    // already-set partner away from the middle on the very next dink.
    const lineReadiness = nearReadyLine(at.y, lineY) * nearReadyLine(origins[partner].y, lineY);
    const wideStance = clamp((side * (at.x - 10) - 5) / 3, 0, 1);
    const lowContact = Number.isFinite(height) ? clamp(5 - height, 0, 1) : 0;
    const support = wide * wideStance * lineReadiness * lowContact;
    if (team !== plan.diagnostics.kitchenSupport.hittingTeam && side * (goals[partner].x - 10) < 0 && support > 0) {
      goals[partner].x += (10 - goals[partner].x) * support;
    }
    if (plan.diagnostics.kitchenSupport.pairedCoverage && team !== plan.diagnostics.kitchenSupport.hittingTeam) {
      // The nominal landing can be several feet from the actual dink contact.
      // Let the outside player receive it. Their partner closes a wide seam
      // or gives a middle receiver paddle room, while retaining their own lane.
      const lane = Math.sign(goals[partner].x - goals[arrival.id].x);
      if (lane * (origins[partner].x - at.x) > 0) {
        const gap = lane * (goals[partner].x - at.x);
        const spaced = at.x + lane * clamp(gap, 7, 9);
        const cover = lane > 0 ? clamp(spaced, 10, 18) : clamp(spaced, 2, 10);
        goals[partner].x += (cover - goals[partner].x) * lineReadiness * lowContact;
      }
    }
  }
  const destinations = {}, duration = durationSeconds;
  for (const team of ['green', 'orange']) {
    const pair = IDS.filter(id => teamForPlayer(id, players) === team);
    let progress = 1;
    const fractions = {}, exiting = {};
    for (const id of pair) {
      if (id === arrival?.id) continue;
      const seconds = id === hitter ? Math.max(0, duration - segment.contactTime - .12) : duration;
      const length = distance(origins[id], goals[id]);
      fractions[id] = length ? clamp(generationDistanceBudgetV1(seconds, peakFeetPerSecond) / length, 0, 1) : 1;
      exiting[id] = needsGroundedExit(origins[id], goals[id], id === hitter ? feet : undefined, defaultFootState);
      if (!exiting[id]) progress = Math.min(progress, fractions[id]);
    }
    for (const id of pair) {
      const fraction = exiting[id] ? fractions[id] : progress;
      destinations[id] = id === arrival?.id ? point(arrival.stance, 'arrival stance')
        : { x: origins[id].x + (goals[id].x - origins[id].x) * fraction,
          y: origins[id].y + (goals[id].y - origins[id].y) * fraction };
    }
  }
  const predicted = () => ({ ...segment, endTime: segment.startTime + duration, duration, originalDuration: duration,
    step: { ...segment.step, positions: destinations } });
  for (const pair of [['player1', 'player2'], ['player3', 'player4']]) {
    if (!inspectGeneratedSpacingV1(predicted(), { pairs: [pair] }).valid) {
      for (const id of pair) if (id !== arrival?.id) {
        const seconds = id === hitter ? Math.max(0, duration - segment.contactTime - .12) : duration;
        destinations[id] = groundedExitOrHold(origins[id], goals[id], seconds, peakFeetPerSecond, id === hitter ? feet : undefined, defaultFootState);
      }
      if (!inspectGeneratedSpacingV1(predicted(), { pairs: [pair] }).valid) {
        for (const id of pair) if (id !== arrival?.id) destinations[id] = xy(origins[id]);
        if (!inspectGeneratedSpacingV1(predicted(), { pairs: [pair] }).valid) return freeze({ ok: false, reason: 'The actual pending arrival crowds its partner.' });
      }
    }
  }
  const movement = inspectGeneratedMovementV1(predicted(), {
    maxAccelerationFeetPerSecondSquared: GENERATION_MOTION_V1.accelerationFeetPerSecondSquared,
  });
  if (!movement.valid) return freeze({ ok: false, reason: 'The actual pending arrival exceeds the generated route bound.' });
  return freeze({ ok: true, movement: command(destinations[hitter]),
    playerMovement: Object.fromEntries(IDS.filter(id => id !== hitter).map(id => [id, command(destinations[id])])),
    positions: destinations });
}

/** Read actual sampled grounded feet; do not install a provisional endpoint's
 * reset status before its pending leg has been resolved. */
export function sampleFeetStateV1(segment, localTime) {
  return freeze(Object.fromEntries(IDS.map(id => {
    const feet = sampleActorFeetV2(segment, id, localTime).map(xy);
    return [id, { feet, grounded: true, feetEstablishedOutsideNVZ: feet.every(outsideNVZ) }];
  })));
}

const quadraticRoots = (a, b, c) => {
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  return discriminant < 0 ? [] : [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)];
};
function unitCubicRoots(a, b, c, d) {
  if (Math.abs(a) < 1e-12) return quadraticRoots(b, c, d).filter(t => t >= 0 && t <= 1);
  const at = t => ((a * t + b) * t + c) * t + d;
  const cuts = [0, ...quadraticRoots(3 * a, 2 * b, c).filter(t => t > 0 && t < 1), 1].sort((x, y) => x - y);
  const roots = cuts.filter(t => Math.abs(at(t)) < 1e-10);
  for (let index = 1; index < cuts.length; index++) {
    let low = cuts[index - 1], high = cuts[index], lowValue = at(low);
    if (lowValue * at(high) >= 0) continue;
    for (let step = 0; step < 50; step++) {
      const middle = (low + high) / 2, value = at(middle);
      if (lowValue * value <= 0) high = middle;
      else { low = middle; lowValue = value; }
    }
    roots.push((low + high) / 2);
  }
  return roots;
}
const asTimeline = value => value?.segments ? value : { segments: [value], duration: value?.endTime ?? value?.duration };
const phaseCuts = (segment, actors, duration) => {
  const original = segment.originalDuration ?? segment.duration, contact = segment.contactTime, release = Math.min(original, contact + .12);
  const cuts = [0, duration, original, original / 2, contact, contact / 2, release, release + (original - release) / 2];
  for (const evidence of segment.model2Momentum || []) if (actors.includes(evidence.actor)) cuts.push(evidence.contactTime - segment.startTime, evidence.time - segment.startTime);
  return [...new Set(cuts.filter(t => Number.isFinite(t) && t >= 0 && t <= duration))].sort((a, b) => a - b);
};

/** The squared separation of two quadratic sampled routes is quartic. Its
 * extrema come from this cubic derivative, rather than sparse frame samples. */
export function inspectGeneratedSpacingV1(timelineOrSegment, { minimumFeet = 2.5, pairs = [['player1', 'player2'], ['player3', 'player4']] } = {}) {
  if (!Number.isFinite(minimumFeet) || minimumFeet < 0) throw new TypeError('A finite nonnegative separation is required.');
  const timeline = asTimeline(timelineOrSegment);
  let minimum = Infinity;
  for (const segment of timeline.segments || []) {
    if (segment?.modelVersion !== 2) throw new TypeError('Generated spacing requires model2 segments.');
    const duration = Math.min(segment.duration, timeline.duration - segment.startTime);
    if (!(duration > 0)) continue;
    for (const pair of pairs) {
      const times = phaseCuts(segment, pair, duration);
      const relative = t => {
        const left = sampleActorBoardPositionV2(segment, pair[0], t), right = sampleActorBoardPositionV2(segment, pair[1], t);
        return { x: right.x - left.x, y: right.y - left.y };
      };
      for (let index = 1; index < times.length; index++) {
        const start = times[index - 1], end = times[index], seconds = end - start;
        if (seconds < 1e-12) continue;
        const c = relative(start), middle = relative((start + end) / 2), to = relative(end);
        if (![c, middle, to].every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return freeze({ valid: false, pair: [...pair], shotId: segment.step.id, reason: 'Generated pair samples must be finite.' });
        const a = { x: 2 * (to.x + c.x - 2 * middle.x), y: 2 * (to.y + c.y - 2 * middle.y) };
        const b = { x: to.x - c.x - a.x, y: to.y - c.y - a.y };
        const at = t => ({ x: a.x * t * t + b.x * t + c.x, y: a.y * t * t + b.y * t + c.y });
        for (const q of [.25, .75]) if (distance(relative(start + seconds * q), at(q)) > 1e-6) return freeze({ valid: false, pair: [...pair], shotId: segment.step.id, reason: 'Unsupported generated pair route shape.' });
        const aa = a.x * a.x + a.y * a.y, ab = a.x * b.x + a.y * b.y, ac = a.x * c.x + a.y * c.y;
        const bb = b.x * b.x + b.y * b.y, bc = b.x * c.x + b.y * c.y;
        const points = [0, 1, ...unitCubicRoots(4 * aa, 6 * ab, 2 * (bb + 2 * ac), 2 * bc)];
        for (const q of points) {
          const p = at(q), separation = Math.hypot(p.x, p.y); minimum = Math.min(minimum, separation);
          if (separation < minimumFeet - 1e-6) return freeze({ valid: false, pair: [...pair], shotId: segment.step.id,
            reason: 'Actual generated partners enter each other’s tactical space.', separationFeet: separation,
            time: segment.startTime + start + seconds * q, minimumFeet });
        }
      }
    }
  }
  return freeze({ valid: true, minimumSeparationFeet: Number.isFinite(minimum) ? minimum : null, boundFeet: minimumFeet });
}

// Derivatives of the sampler's represented phase, evaluated from its full
// source duration. Fitting three nearly equal positions on a tiny dead-clipped
// interval catastrophically loses acceleration precision. The actual samples
// below still verify this phase model; authored paths are never replaced.
function generatedPhaseDynamics(segment, actor, trackIndex, start, end) {
  const middle = (start + end) / 2, absolute = segment.startTime + middle;
  const evidence = segment.model2Momentum || [];
  let active = null;
  if (trackIndex === 0) {
    for (const item of evidence) if (item.actor === actor && item.contactTime <= absolute + 1e-9
      && (!active || item.contactTime > active.contactTime)) active = item;
  } else {
    for (const item of evidence) if (item.actor === actor && item.contactTime <= absolute + 1e-9) active = item;
  }
  const zero = () => ({ startVelocity: { x: 0, y: 0 }, endVelocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 } });
  let from, to, phaseStart, seconds, linear = false;
  if (active) {
    phaseStart = active.contactTime - segment.startTime;
    seconds = trackIndex === 0 ? active.time - active.contactTime : Math.max(.001, active.time - active.contactTime);
    if (!(seconds > 0) || middle >= phaseStart + seconds) return zero();
    linear = true;
    if (trackIndex === 0) { from = active.from; to = active.to; }
    else {
      const fraction = clamp((middle - phaseStart) / seconds, 0, 1);
      const indexed = active.fromFeet.map((foot, index) => ({ index,
        x: foot.x + (active.feet[index].x - foot.x) * fraction,
        y: foot.y + (active.feet[index].y - foot.y) * fraction })).sort((a, b) => a.x - b.x || a.y - b.y);
      const index = indexed[trackIndex - 1].index;
      from = active.fromFeet[index]; to = active.feet[index];
    }
  } else {
    const original = segment.originalDuration ?? segment.duration;
    if (middle >= original) return zero();
    from = segment.previous.positions[actor]; to = segment.step.positions[actor];
    if (segment.shotSemantics?.playerId === actor) {
      const plant = footCenter(segment.shotSemantics.contact.feet), contact = segment.contactTime;
      const release = Math.min(original, contact + .12);
      if (middle < contact) { to = plant; phaseStart = 0; seconds = contact; }
      else if (middle <= release) return zero();
      else { from = plant; phaseStart = release; seconds = Math.max(.001, original - release); }
    } else { phaseStart = 0; seconds = Math.max(.001, original); }
  }
  const delta = { x: to.x - from.x, y: to.y - from.y };
  const velocity = time => {
    const fraction = clamp((time - phaseStart) / seconds, 0, 1);
    const factor = linear ? 1 / seconds : 4 * Math.min(fraction, 1 - fraction) / seconds;
    return { x: delta.x * factor, y: delta.y * factor };
  };
  const factor = linear ? 0 : ((middle - phaseStart) / seconds < .5 ? 4 : -4) / (seconds * seconds);
  return { startVelocity: velocity(start), endVelocity: velocity(end), acceleration: { x: delta.x * factor, y: delta.y * factor } };
}

/** Exact derivative bounds on the shared sampler's linear/quadratic pieces.
 * Unlike M1's acceptance allowance, generated motion gets no distance slack. */
export function inspectGeneratedMovementV1(timelineOrSegment, { maxPeakFeetPerSecond = 18, maxAccelerationFeetPerSecondSquared } = {}) {
  if (!Number.isFinite(maxPeakFeetPerSecond) || maxPeakFeetPerSecond <= 0 || maxPeakFeetPerSecond > 18) throw new TypeError('Generated peak speed must be in (0,18] ft/s.');
  const dynamics = maxAccelerationFeetPerSecondSquared !== undefined;
  if (dynamics && (!Number.isFinite(maxAccelerationFeetPerSecondSquared) || maxAccelerationFeetPerSecondSquared <= 0
    || maxAccelerationFeetPerSecondSquared > GENERATION_MOTION_V1.accelerationFeetPerSecondSquared)) {
    throw new TypeError('Generated acceleration must be in (0,30] ft/s².');
  }
  const timeline = asTimeline(timelineOrSegment);
  let maximum = 0, maximumAcceleration = 0;
  const previous = new Map(), previousVelocity = new Map(), byActor = {};
  const dynamicsDiagnostics = () => dynamics ? { maxAccelerationFeetPerSecondSquared: maximumAcceleration,
    boundAccelerationFeetPerSecondSquared: maxAccelerationFeetPerSecondSquared } : {};
  const fail = (actor, segment, reason, details = {}) => freeze({ valid: false, actor, shotId: segment?.step?.id ?? null, reason, maxPeakFeetPerSecond: maximum, ...dynamicsDiagnostics(), ...details });
  for (const segment of timeline.segments || []) {
    if (segment?.modelVersion !== 2) throw new TypeError('Generated movement inspection requires model2 segments.');
    const duration = Math.min(segment.duration, timeline.duration - segment.startTime);
    if (!(duration > 0)) continue;
    const original = segment.originalDuration ?? segment.duration, contact = segment.contactTime, release = Math.min(original, contact + .12);
    for (const actor of IDS) {
      const cuts = !dynamics ? [0, duration, original, original / 2, contact, contact / 2, release, release + (original - release) / 2]
        : segment.shotSemantics?.playerId === actor
          ? [0, duration, original, contact, contact / 2, release, release + Math.max(.001, original - release) / 2]
          : [0, duration, original, Math.max(.001, original) / 2];
      for (const evidence of segment.model2Momentum || []) if (evidence.actor === actor) {
        cuts.push(evidence.contactTime - segment.startTime, evidence.time - segment.startTime);
        if (dynamics) cuts.push(evidence.contactTime + Math.max(.001, evidence.time - evidence.contactTime) - segment.startTime);
      }
      const times = [...new Set(cuts.filter(t => Number.isFinite(t) && t >= 0 && t <= duration))].sort((a, b) => a - b);
      // Inspection-local reuse only: every distinct time still reaches the shared
      // samplers, and each new actor, segment, and inspection starts fresh.
      const boardSamples = new Map(), feetSamples = new Map();
      const boardAt = time => {
        if (!boardSamples.has(time)) boardSamples.set(time, sampleActorBoardPositionV2(segment, actor, time));
        return boardSamples.get(time);
      };
      const feetAt = time => {
        if (!feetSamples.has(time)) feetSamples.set(time, sampleActorFeetV2(segment, actor, time).toSorted((a, b) => a.x - b.x || a.y - b.y));
        return feetSamples.get(time);
      };
      const tracks = [boardAt, ...[0, 1].map(index => time => feetAt(time)[index])];
      for (const [trackIndex, at] of tracks.entries()) for (let i = 1; i < times.length; i++) {
        const start = times[i - 1], end = times[i], seconds = end - start;
        if (seconds < 1e-12) continue;
        const from = at(start), to = at(end), middle = at((start + end) / 2), key = `${actor}:${trackIndex}`;
        if (![from, to, middle].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return fail(actor, segment, 'Generated movement samples must be finite.', { track: trackIndex });
        const before = previous.get(key);
        if (before && distance(before, from) > 1e-6) return fail(actor, segment, 'The generated sampled route jumps between stages.', { track: trackIndex });
        const a = { x: 2 * (to.x + from.x - 2 * middle.x), y: 2 * (to.y + from.y - 2 * middle.y) };
        const b = { x: to.x - from.x - a.x, y: to.y - from.y - a.y };
        for (const q of [.25, .75]) {
          const actual = at(start + seconds * q), expected = { x: from.x + a.x * q * q + b.x * q, y: from.y + a.y * q * q + b.y * q };
          if (distance(actual, expected) > 1e-6) return fail(actor, segment, 'Unsupported generated movement shape.', { track: trackIndex });
        }
        const phase = dynamics ? generatedPhaseDynamics(segment, actor, trackIndex, start, end) : null;
        if (phase) for (const q of [.25, .5, .75, 1]) {
          const elapsed = seconds * q, actual = at(start + elapsed);
          const expected = { x: from.x + phase.startVelocity.x * elapsed + phase.acceleration.x * elapsed * elapsed / 2,
            y: from.y + phase.startVelocity.y * elapsed + phase.acceleration.y * elapsed * elapsed / 2 };
          if (distance(actual, expected) > 1e-6) return fail(actor, segment, 'Unsupported generated movement derivative model.', { track: trackIndex });
        }
        const peak = phase ? Math.max(Math.hypot(phase.startVelocity.x, phase.startVelocity.y), Math.hypot(phase.endVelocity.x, phase.endVelocity.y))
          : Math.max(Math.hypot(b.x, b.y), Math.hypot(2 * a.x + b.x, 2 * a.y + b.y)) / seconds;
        maximum = Math.max(maximum, peak); byActor[actor] = Math.max(byActor[actor] || 0, peak);
        if (peak > maxPeakFeetPerSecond + 1e-6) return fail(actor, segment, 'The actual generated route exceeds the peak speed bound.', { track: trackIndex, peakFeetPerSecond: peak, fromTime: segment.startTime + start, toTime: segment.startTime + end });
        if (dynamics) {
          const acceleration = Math.hypot(phase.acceleration.x, phase.acceleration.y);
          maximumAcceleration = Math.max(maximumAcceleration, acceleration);
          if (acceleration > maxAccelerationFeetPerSecondSquared + 1e-6) return fail(actor, segment,
            'The actual generated route exceeds the acceleration bound.', { track: trackIndex,
              accelerationFeetPerSecondSquared: acceleration, fromTime: segment.startTime + start, toTime: segment.startTime + end });
          const { startVelocity, endVelocity } = phase;
          const preceding = previousVelocity.get(key), fromTime = segment.startTime + start;
          // Bounded acceleration requires continuous velocity at every joined
          // phase, including momentum overrides and contact/segment boundaries.
          // A clipped dead-ball endpoint need not finish its planned deceleration.
          if (preceding && Math.abs(preceding.time - fromTime) <= 1e-7) {
            const change = distance(preceding.velocity, startVelocity);
            if (change > 1e-6) return fail(actor, segment, 'The actual generated route changes velocity instantaneously.', {
              track: trackIndex, velocityChangeFeetPerSecond: change, time: fromTime });
          }
          previousVelocity.set(key, { velocity: endVelocity, time: segment.startTime + end });
        }
        previous.set(key, xy(to));
      }
    }
  }
  return freeze({ valid: true, maxPeakFeetPerSecond: maximum, byActor, boundFeetPerSecond: maxPeakFeetPerSecond, ...dynamicsDiagnostics() });
}

/** Fallback-only boundary proposals in the intersection of the selected travel
 * disk and unchanged paddle-reach disk. Ordinary calls retain their exact set. */
export function contactFeetCandidatesV1(args = {}) {
  const ordinary = ordinaryContactFeetCandidatesV1(args);
  if (!args.refineAngular || args.kind === 'serve' || !args.position || !(args.availableSeconds > 0)) return ordinary;
  const { contact, position, team, handedness = 'right', contactStyle = 'forehand',
    kind = 'groundstroke', defaultFootState } = args;
  const radiusMax = supportedPaddleRadius(contact);
  const budget = generationDistanceBudgetV1(args.availableSeconds) * (1 - 1e-7);
  const d = distance(contact, position), radiusMin = Math.max(CONTACT_BODY_CLEARANCE + 1e-5, d - budget + 1e-6);
  if (!(radiusMin > 1.8 && radiusMin < radiusMax && d > 0)) return ordinary;
  const half = defaultFootHalfWidthFeetV1(defaultFootState), leftSign = team === 'green' ? 1 : -1;
  const hand = (handedness === 'right' ? 1 : -1) * (contactStyle === 'backhand' ? -1 : 1);
  const bodySide = (team === 'green' ? 1 : -1) * hand;
  const base = Math.atan2(position.y - contact.y, position.x - contact.x), result = [...ordinary];
  const seen = new Set(ordinary.map(feet => feet.stance.x.toFixed(8) + ',' + feet.stance.y.toFixed(8)));
  const sole = defaultFootState ? GENERATED_GROUNDED_SOLE_V1 : null;
  const sideHalf = half + (sole?.halfWidthFeet ?? 0);
  const depthMargin = sole ? sole.halfDepthFeet + 1e-5 : .75;
  for (const fraction of [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1]) {
    const radius = radiusMin + (radiusMax - radiusMin) * fraction;
    const cap = Math.acos(clamp((d * d + radius * radius - budget * budget) / (2 * d * radius), -1, 1));
    for (const sign of [-1, 1]) {
      const angle = base + sign * cap;
      const stance = { x: contact.x + radius * Math.cos(angle), y: contact.y + radius * Math.sin(angle) };
      if (bodySide * (stance.x - contact.x) < CONTACT_SIDE_CLEARANCE - EPS
        || stance.x < Math.max(-7.5, -8 + half) || stance.x > Math.min(27.5, 28 - half)
        || stance.y < -7.5 || stance.y > 51.5 || (team === 'green' ? stance.y > 21.99 : stance.y < 22.01)) continue;
      const feet = [
        { x: stance.x + leftSign * half, y: stance.y },
        { x: stance.x - leftSign * half, y: stance.y },
      ];
      const established = feet.every(foot => outsideContactNVZ(foot, defaultFootState));
      const travel = distance(position, stance);
      const besideZone = stance.x < -sideHalf - 1e-5 || stance.x > 20 + sideHalf + 1e-5;
      const withinDepth = team === 'green' ? stance.y <= 15 - depthMargin : stance.y >= 29 + depthMargin;
      if (travel > generationDistanceBudgetV1(args.availableSeconds) + EPS
        || kind === 'volley' && (!established || (!besideZone && !withinDepth))) continue;
      const key = stance.x.toFixed(8) + ',' + stance.y.toFixed(8);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(freeze({
        feet, stance, grounded: true, reachable: true, legalVolleyFeet: kind !== 'volley' || established,
        feetEstablishedOutsideNVZ: established, originUsed: true, stanceFeasible: true,
        travelFeet: travel, bodyClearanceFeet: radius, routeReachable: true,
        arrivalPeakFeetPerSecond: 2 * travel / args.availableSeconds,
      }));
    }
  }
  return freeze(result);
}
