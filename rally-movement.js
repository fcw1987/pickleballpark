// Grounded model-2 tactical movement. This plans targets; the shared sampler
// remains the authority for the path actually played and rendered.
import { sampleActorBoardPositionV2, sampleActorFeetV2 } from './play-actors-v2.js';
import { teamForPlayer } from './rally-state.js';

export const MOVEMENT_VERSION = 'rally-movement-v1';
// Supported grounded paddle reach for this generator, not an official rule.
export const GROUNDED_CONTACT_HEIGHT_FEET = 8.5;
export const GENERATOR_MOVEMENT = Object.freeze({ peakFeetPerSecond: 18, halfStanceFeet: .42, lineOffsetFeet: .75 });
const IDS = Object.freeze(['player1', 'player2', 'player3', 'player4']);
const EPS = 1e-7;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const xy = p => ({ x: p.x, y: p.y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (p, name) => {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError(`${name} must have finite board coordinates.`);
  return xy(p);
};
const outsideNVZ = p => p.x < 0 || p.x > 20 || p.y < 15 || p.y > 29;
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
function closestOriginStance(contact, preferred, origin, { team, hand, kind }) {
  const ownY = team === 'green' ? [-7.5, 22 - .01] : [22 + .01, 51.5];
  const boxes = kind === 'volley' ? [
    { x0: -7.5, x1: 27.5, y0: team === 'green' ? ownY[0] : 29.75, y1: team === 'green' ? 14.25 : ownY[1] },
    { x0: -7.5, x1: -.42 - 1e-5, y0: ownY[0], y1: ownY[1] },
    { x0: 20.42 + 1e-5, x1: 27.5, y0: ownY[0], y1: ownY[1] },
  ] : [{ x0: -7.5, x1: 27.5, y0: ownY[0], y1: ownY[1] }];
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
    for (const radius of [CONTACT_BODY_CLEARANCE, CONTACT_PADDLE_RADIUS]) {
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
        || radius < CONTACT_BODY_CLEARANCE - EPS || radius > CONTACT_PADDLE_RADIUS + EPS) continue;
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
export function contactFeetV1({ contact, target, team, handedness = 'right', contactStyle = 'forehand', kind = 'groundstroke', position, availableSeconds } = {}) {
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
  if (!(kind === 'serve' && position)) stance = { x: clamp(stance.x, -7.5, 27.5), y: clamp(stance.y, -7.5, 51.5) };
  if (kind === 'volley' && stance.x >= -.42 && stance.x <= 20.42) {
    stance.y = team === 'green' ? Math.min(14.25, stance.y) : Math.max(29.75, stance.y);
  }
  let originChoice = null;
  if (position && kind !== 'serve') {
    const origin = point(position, 'position');
    originChoice = closestOriginStance(contact, stance, origin, { team, hand, kind });
    if (originChoice) stance = originChoice.stance;
  }
  // First-contact serve positioning belongs to the declared layout. Do not
  // silently fix an illegal serve stance or move it to an inferred score slot.
  const leftSign = team === 'green' ? 1 : -1;
  const feet = [{ x: stance.x + leftSign * .42, y: stance.y }, { x: stance.x - leftSign * .42, y: stance.y }];
  const established = feet.every(outsideNVZ);
  return freeze({ feet, stance, grounded: true, feetEstablishedOutsideNVZ: established,
    reachable: distance(stance, contact) <= 3 + EPS && (!(position && kind !== 'serve') || !!originChoice),
    legalVolleyFeet: kind !== 'volley' || established,
    ...(position && kind !== 'serve' ? {
      originUsed: true, stanceFeasible: !!originChoice, travelFeet: originChoice?.travel ?? null,
      bodyClearanceFeet: distance(stance, contact),
      ...(availableSeconds !== undefined ? {
        routeReachable: !!originChoice && originChoice.travel <= 9 * availableSeconds + EPS,
        arrivalPeakFeetPerSecond: availableSeconds > 0 && originChoice ? 2 * originChoice.travel / availableSeconds : originChoice?.travel === 0 ? 0 : null,
      } : {}),
      ...(!originChoice ? { reason: 'No grounded stance satisfies paddle reach and the declared stroke side.' } : {}),
    } : {}) });
}

/** Bounded outgoing-aware alternatives. The established nearest pose stays first;
 * every alternative reports travel from the actual supplied player position.
 * Flight clearance and the sampled incoming route remain the caller's audit. */
export function contactFeetCandidatesV1(args = {}) {
  const first = contactFeetV1(args), candidates = [first];
  const { contact, target, team, handedness = 'right', contactStyle = 'forehand', kind = 'groundstroke', position, availableSeconds } = args;
  // Serves retain their declared layout, including any existing illegality.
  if (kind === 'serve') return freeze(candidates);
  const origin = position ? point(position, 'position') : null;
  const hand = (handedness === 'right' ? 1 : -1) * (contactStyle === 'backhand' ? -1 : 1);
  const bodySide = (team === 'green' ? 1 : -1) * hand;
  const dx = target.x - contact.x, dy = target.y - contact.y, length = Math.hypot(dx, dy);
  const forward = length ? { x: dx / length, y: dy / length } : { x: 0, y: team === 'green' ? 1 : -1 };
  const seen = new Set([`${first.stance.x.toFixed(8)},${first.stance.y.toFixed(8)}`]);
  for (const radius of [2.9, 1.8, .95]) for (const degrees of [90, -90, 135, -135, 180, 60, -60, 120, -120]) {
    const angle = degrees * Math.PI / 180;
    const stance = { x: contact.x + radius * (forward.x * Math.cos(angle) - forward.y * Math.sin(angle)),
      y: contact.y + radius * (forward.y * Math.cos(angle) + forward.x * Math.sin(angle)) };
    if (bodySide * (stance.x - contact.x) < CONTACT_SIDE_CLEARANCE - EPS
      || stance.x < -7.5 || stance.x > 27.5 || stance.y < -7.5 || stance.y > 51.5
      || (team === 'green' ? stance.y > 21.99 : stance.y < 22.01)) continue;
    const leftSign = team === 'green' ? 1 : -1;
    const feet = [{ x: stance.x + leftSign * .42, y: stance.y }, { x: stance.x - leftSign * .42, y: stance.y }];
    const established = feet.every(outsideNVZ);
    if (kind === 'volley' && (!established || (stance.x >= -.42 - 1e-5 && stance.x <= 20.42 + 1e-5
      && (team === 'green' ? stance.y > 14.25 : stance.y < 29.75)))) continue;
    const key = `${stance.x.toFixed(8)},${stance.y.toFixed(8)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const travel = origin ? distance(origin, stance) : null;
    candidates.push(freeze({ feet, stance, grounded: true, reachable: true, legalVolleyFeet: kind !== 'volley' || established,
      feetEstablishedOutsideNVZ: established,
      ...(origin ? { originUsed: true, stanceFeasible: true, travelFeet: travel, bodyClearanceFeet: distance(stance, contact),
        ...(availableSeconds !== undefined ? { routeReachable: travel <= 9 * availableSeconds + EPS,
          arrivalPeakFeetPerSecond: availableSeconds > 0 ? 2 * travel / availableSeconds : travel === 0 ? 0 : null } : {}) } : {}) }));
    if (candidates.length === 8) return freeze(candidates);
  }
  return freeze(candidates);
}

/** A full ease-in/ease-out route peaks at twice its average speed. */
export function boundMovementV1(from, desired, seconds, peakFeetPerSecond = GENERATOR_MOVEMENT.peakFeetPerSecond) {
  point(from, 'from'); point(desired, 'desired');
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(peakFeetPerSecond) || peakFeetPerSecond <= 0 || peakFeetPerSecond > 18) throw new TypeError('Finite nonnegative duration and a peak speed in (0,18] ft/s are required.');
  const length = distance(from, desired), budget = peakFeetPerSecond * seconds / 2;
  const fraction = length ? Math.min(1, budget / length) : 0;
  return freeze({ x: from.x + (desired.x - from.x) * fraction, y: from.y + (desired.y - from.y) * fraction });
}

/** Plan a pair together without giving either player the other's lane. The
 * endpoint is provisional until the pending leg gets its real next contact. */
export function planMovementV1({ positions, players, hitter, contact, target, durationSeconds, seconds,
  contactTime = 0, index = 0, service = {}, intent = '', family = '', incomingFamily = '', quality = 'neutral', pace = 'medium',
  opening = 'serve', kind = 'groundstroke', contactStyle = 'forehand', feetState = {}, contactFeet, peakFeetPerSecond = 18 } = {}) {
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
    handedness: players[hitter].handedness, kind, contactStyle, position: index === 0 ? positions[hitter] : undefined });
  const suppliedFeet = Array.isArray(chosenFeet) ? chosenFeet : chosenFeet.feet;
  if (suppliedFeet?.length !== 2) throw new TypeError('Two explicit grounded contact feet are required.');
  const feet = suppliedFeet.map(p => point(p, 'contact feet'));
  const stance = footCenter(feet), established = feet.every(outsideNVZ);
  if (kind === 'volley' && !established) return freeze({ ok: false, reason: 'A generated volley must establish both grounded feet outside the NVZ.' });
  if (distance(stance, contact) > 3 + EPS) return freeze({ ok: false, reason: 'The explicit contact stance exceeds paddle reach.' });
  const origins = Object.fromEntries(IDS.map(id => [id, id === hitter ? stance : xy(positions[id])]));
  const goals = {}, durations = {}, destinations = {}, diagnostics = [];
  const softAdvance = ['drop', 'third-shot-drop', 'reset', 'block', 'cross-court-dink', 'middle-dink', 'straight-dink', 'backhand-dink', 'dink'].includes(intent || family);
  // A controlled drive can create an approach opportunity too. This is a
  // paired tactical goal, not a forced line position or a fifth-shot choice.
  const controlled = quality !== 'error' && quality !== 'attackable';
  const driveAdvance = controlled && (family === 'drive' || ['drive', 'third-shot-drive'].includes(intent));
  const firmVolleyAdvance = controlled && pace === 'firm' && (family === 'volley' || ['volley', 'firm-volley'].includes(intent));
  for (const team of ['green', 'orange']) {
    const pair = IDS.filter(id => teamForPlayer(id, players) === team).sort((a, b) => positions[a].x - positions[b].x || a.localeCompare(b));
    const shift = clamp((target.x - 10) * (team === hittingTeam ? .18 : .28), -2, 2);
    const controlledApproach = team === hittingTeam && index >= 2 && (driveAdvance || firmVolleyAdvance);
    if (controlledApproach) diagnostics.push({ code: driveAdvance ? 'controlled-drive-approach' : 'firm-volley-approach', team });
    for (const [lane, id] of pair.entries()) {
      const from = origins[id], near = team === 'green', waiting = opening === 'serve' && index < 2 && team === servingTeam;
      const receiverWaiting = opening === 'serve' && index === 0 && id === service.receiver;
      const receivingApproach = team !== servingTeam && index >= 1;
      const ownApproach = team === hittingTeam && quality !== 'error' && (receivingApproach || index >= 2 && (controlled && softAdvance || driveAdvance || firmVolleyAdvance));
      const shouldAdvance = !waiting && !receiverWaiting && (ownApproach || team !== hittingTeam && receivingApproach || id !== service.receiver && index === 0 && team !== servingTeam);
      const lineY = near ? 14.25 : 29.75;
      let y = shouldAdvance ? lineY : from.y;
      if (family === 'lob' && team !== hittingTeam) y = near ? Math.min(from.y, 9) : Math.max(from.y, 35);
      // A grounded kitchen entry is followed by a bounded retreat. This goal
      // never claims reset until actual sampled feet have exited the zone.
      if (from.y >= 15 && from.y <= 29 && from.x >= 0 && from.x <= 20) y = lineY;
      goals[id] = waiting || receiverWaiting ? xy(from) : { x: clamp((lane ? 15 : 5) + shift, 1, 19), y };
      durations[id] = id === hitter ? Math.max(0, duration - Math.min(duration, contactTime + .12)) : duration;
    }
    // Common progress preserves a paired approach instead of racing the
    // already-near partner to the line while leaving the other behind.
    let progress = 1;
    for (const id of pair) {
      const length = distance(origins[id], goals[id]);
      if (length) progress = Math.min(progress, peakFeetPerSecond * durations[id] / (2 * length));
    }
    progress = clamp(progress, 0, 1);
    for (const id of pair) destinations[id] = { x: origins[id].x + (goals[id].x - origins[id].x) * progress, y: origins[id].y + (goals[id].y - origins[id].y) * progress };
    const initialSeparation = distance(origins[pair[0]], origins[pair[1]]), finalSeparation = distance(destinations[pair[0]], destinations[pair[1]]);
    if (initialSeparation >= 2.5 && finalSeparation < 2.5) {
      for (const id of pair) destinations[id] = xy(origins[id]);
      diagnostics.push({ code: 'pair-spacing-hold', team });
    }
  }
  const predicted = () => ({ modelVersion: 2, startTime: 0, endTime: duration, duration, originalDuration: duration, contactTime,
    previous: { positions: origins }, step: { id: 'planned-movement', positions: destinations },
    shotSemantics: { playerId: hitter, contact: { feet } }, model2Momentum: [] });
  for (const pair of [['player1', 'player2'], ['player3', 'player4']]) {
    const spacing = inspectGeneratedSpacingV1(predicted(), { pairs: [pair] });
    if (!spacing.valid) {
      for (const id of pair) destinations[id] = xy(origins[id]);
      diagnostics.push({ code: 'sampled-pair-spacing-hold', team: teamForPlayer(pair[0], players) });
      if (!inspectGeneratedSpacingV1(predicted(), { pairs: [pair] }).valid) return freeze({ ok: false, reason: 'The actual contact stance crowds its partner.' });
    }
  }
  const nextFeetState = {};
  for (const id of IDS) {
    const endFeet = [{ x: destinations[id].x - .42, y: destinations[id].y }, { x: destinations[id].x + .42, y: destinations[id].y }];
    nextFeetState[id] = { feet: endFeet, grounded: true, feetEstablishedOutsideNVZ: endFeet.every(outsideNVZ) };
    if (feetState[id]?.feetEstablishedOutsideNVZ === false && nextFeetState[id].feetEstablishedOutsideNVZ) diagnostics.push({ code: 'planned-grounded-reset', actor: id });
  }
  return freeze({ ok: true, movement: command(destinations[hitter]),
    playerMovement: Object.fromEntries(IDS.filter(id => id !== hitter).map(id => [id, command(destinations[id])])),
    contactEvidence: { feet: feet.map(xy), feetEstablishedOutsideNVZ: established },
    positions: destinations, feetState: nextFeetState,
    diagnostics: { version: MOVEMENT_VERSION, peakFeetPerSecond, provisional: true,
      arrivalNeedsPendingValidation: contactTime === 0 && distance(positions[hitter], stance) > EPS,
      goals, phaseSeconds: durations, notes: diagnostics } });
}

/** Resolve the one pending tactical plan against its actual contact/dead time.
 * Goals stay request-local; only these achievable destinations enter source. */
export function replanMovementV1({ plan, segment, players, durationSeconds, arrival,
  peakFeetPerSecond = 18 } = {}) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < segment.contactTime
    || !Number.isFinite(peakFeetPerSecond) || peakFeetPerSecond <= 0 || peakFeetPerSecond > 18) {
    throw new TypeError('Pending movement needs actual duration and a peak speed in (0,18].');
  }
  const hitter = segment.shotSemantics.playerId, feet = segment.shotSemantics.contact.feet;
  const origins = Object.fromEntries(IDS.map(id => [id, id === hitter ? footCenter(feet) : point(segment.previous.positions[id], id)]));
  const goals = Object.fromEntries(IDS.map(id => [id, point(plan.diagnostics.goals[id], `goal.${id}`)]));
  if (arrival && (!IDS.includes(arrival.id) || !arrival.stance)) throw new TypeError('An arrival needs a represented hitter and exact stance.');
  const destinations = {}, duration = durationSeconds;
  for (const team of ['green', 'orange']) {
    const pair = IDS.filter(id => teamForPlayer(id, players) === team);
    let progress = 1;
    for (const id of pair) {
      if (id === arrival?.id) continue;
      const seconds = id === hitter ? Math.max(0, duration - segment.contactTime - .12) : duration;
      const length = distance(origins[id], goals[id]);
      if (length) progress = Math.min(progress, peakFeetPerSecond * seconds / (2 * length));
    }
    progress = clamp(progress, 0, 1);
    for (const id of pair) destinations[id] = id === arrival?.id ? point(arrival.stance, 'arrival stance')
      : { x: origins[id].x + (goals[id].x - origins[id].x) * progress,
        y: origins[id].y + (goals[id].y - origins[id].y) * progress };
  }
  const predicted = () => ({ ...segment, endTime: segment.startTime + duration, duration, originalDuration: duration,
    step: { ...segment.step, positions: destinations } });
  for (const pair of [['player1', 'player2'], ['player3', 'player4']]) {
    if (!inspectGeneratedSpacingV1(predicted(), { pairs: [pair] }).valid) {
      for (const id of pair) if (id !== arrival?.id) destinations[id] = xy(origins[id]);
      if (!inspectGeneratedSpacingV1(predicted(), { pairs: [pair] }).valid) {
        return freeze({ ok: false, reason: 'The actual pending arrival crowds its partner.' });
      }
    }
  }
  const movement = inspectGeneratedMovementV1(predicted());
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

/** Exact derivative bounds on the shared sampler's linear/quadratic pieces.
 * Unlike M1's acceptance allowance, generated motion gets no distance slack. */
export function inspectGeneratedMovementV1(timelineOrSegment, { maxPeakFeetPerSecond = 18 } = {}) {
  if (!Number.isFinite(maxPeakFeetPerSecond) || maxPeakFeetPerSecond <= 0 || maxPeakFeetPerSecond > 18) throw new TypeError('Generated peak speed must be in (0,18] ft/s.');
  const timeline = asTimeline(timelineOrSegment);
  let maximum = 0;
  const previous = new Map(), byActor = {};
  const fail = (actor, segment, reason, details = {}) => freeze({ valid: false, actor, shotId: segment?.step?.id ?? null, reason, maxPeakFeetPerSecond: maximum, ...details });
  for (const segment of timeline.segments || []) {
    if (segment?.modelVersion !== 2) throw new TypeError('Generated movement inspection requires model2 segments.');
    const duration = Math.min(segment.duration, timeline.duration - segment.startTime);
    if (!(duration > 0)) continue;
    const original = segment.originalDuration ?? segment.duration, contact = segment.contactTime, release = Math.min(original, contact + .12);
    for (const actor of IDS) {
      const cuts = [0, duration, original, original / 2, contact, contact / 2, release, release + (original - release) / 2];
      for (const evidence of segment.model2Momentum || []) if (evidence.actor === actor) cuts.push(evidence.contactTime - segment.startTime, evidence.time - segment.startTime);
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
        const peak = Math.max(Math.hypot(b.x, b.y), Math.hypot(2 * a.x + b.x, 2 * a.y + b.y)) / seconds;
        maximum = Math.max(maximum, peak); byActor[actor] = Math.max(byActor[actor] || 0, peak);
        if (peak > maxPeakFeetPerSecond + 1e-6) return fail(actor, segment, 'The actual generated route exceeds the peak speed bound.', { track: trackIndex, peakFeetPerSecond: peak, fromTime: segment.startTime + start, toTime: segment.startTime + end });
        previous.set(key, xy(to));
      }
    }
  }
  return freeze({ valid: true, maxPeakFeetPerSecond: maximum, byActor, boundFeetPerSecond: maxPeakFeetPerSecond });
}
