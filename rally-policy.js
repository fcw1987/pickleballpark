// M2 policy projects information available before a choice. It owns no RNG,
// simulator clock, execution roll or future outcome and never changes a source.
import { localNetHeightFeet, PHYSICS_V2 } from './play-physics-v2.js';
import { isInNonVolleyZone } from './court-geometry.js';
import { assessReach, REACH_MODEL } from './rally-tactics.js';
import { teamForPlayer, oppositeTeam, eligibleHitters } from './rally-state.js';
import { resolveStyle, validateStyleProfile } from './rally-styles.js';

export const POLICY_VERSION = 'rally-policy-v1';
export const CONTACT_RANKING_VERSION = 'rally-contact-ranking-v2';
const EPS = 1e-9;
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const point = (value, name, height = false) => {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || height && !Number.isFinite(value.heightFeet)) throw new TypeError(`${name} requires finite board coordinates${height ? ' and height' : ''}.`);
  if (height && (value.heightFeet < 0 || value.heightFeet > 30)) throw new TypeError(`${name} height is outside the supported range.`);
  return { x: value.x, y: value.y, ...(height ? { heightFeet: value.heightFeet } : {}) };
};
const depth = (at, team) => team === 'green' ? at.y : 44 - at.y;
const isUp = (at, team) => depth(at, team) >= 12.5 && depth(at, team) < 22;
const intentOf = decision => decision?.intent ?? decision?.chosen?.intent ?? decision?.choice?.intent ?? null;
const familyOf = decision => decision?.family ?? decision?.chosen?.family ?? decision?.choice?.family ?? null;
const HANDS = new Set(['speed-up', 'counter', 'put-away']);
const optionalText = (value, name) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 80 || /[<>\u0000-\u001f\u007f]/.test(value)) throw new TypeError(`${name} must be bounded plain text.`);
  return value;
};

/** A height band describes geometry; the distinct attackable flag needs a flight affordance. */
export function contactHeightBandV1(contact) {
  const at = point(contact, 'contact', true);
  if (at.heightFeet < 1.2) return 'low';
  if (at.heightFeet >= 7) return 'overhead';
  return at.heightFeet - PHYSICS_V2.ballRadiusFeet > localNetHeightFeet(at.x) ? 'above-net' : 'neutral';
}

function rankPair({ id, contact, availableSeconds, kind = null, candidateId = null }, positions, players, pairIndex) {
  if (!players?.[id] || !positions?.[id]) throw new TypeError('Contact candidates must name a represented player.');
  const at = point(contact, 'contact'), origin = point(positions[id], `positions.${id}`);
  if (!Number.isFinite(availableSeconds) || availableSeconds < 0) throw new TypeError('Contact time must be finite and nonnegative.');
  const team = teamForPlayer(id, players), reach = assessReach(origin, at, availableSeconds);
  if (!['green', 'orange'].includes(team) || !['left', 'right'].includes(players[id].handedness)) throw new TypeError('Contact candidates need an explicit team and handedness.');
  const partner = Object.keys(players).find(other => other !== id && teamForPlayer(other, players) === team);
  const partnerAt = positions[partner];
  const crossesPartner = !!partnerAt && (at.x - partnerAt.x) * (origin.x - partnerAt.x) < 0;
  const crowded = !!partnerAt && Math.hypot(partnerAt.x - at.x, partnerAt.y - at.y) < 2.5;
  // Facing +y, Green's anatomical right is low x. Orange faces the other way.
  const forehandDirection = (team === 'green' ? -1 : 1) * (players[id].handedness === 'left' ? -1 : 1);
  const forehand = (at.x - origin.x) * forehandDirection > EPS;
  const requiredTravelFeet = Math.max(0, reach.distanceFeet - REACH_MODEL.paddleReachFeet);
  const availableTravelFeet = Math.max(0, reach.radiusFeet - REACH_MODEL.paddleReachFeet);
  return { id, pairIndex, kind: optionalText(kind, 'contact kind'), candidateId: optionalText(candidateId, 'candidateId'),
    contact: { ...at, ...(Number.isFinite(contact.heightFeet) ? { heightFeet: contact.heightFeet } : {}) }, availableSeconds, reach,
    version: CONTACT_RANKING_VERSION, travelMarginFeet: reach.radiusFeet - reach.distanceFeet,
    requiredTravelFeet, availableTravelFeet, score: requiredTravelFeet / Math.max(1, availableTravelFeet), crossesPartner, crowded, forehand,
    reasons: [reach.reachable ? 'within-illustrative-reach' : 'outside-illustrative-reach',
      ...(crossesPartner ? ['partner-lane-crossing'] : []), ...(crowded ? ['partner-spacing'] : []), ...(forehand ? ['forehand-tiebreak'] : [])] };
}
const compareContactTimes = (a, b) => a.availableSeconds - b.availableSeconds
  || String(a.kind ?? '').localeCompare(String(b.kind ?? ''))
  || a.contact.x - b.contact.x || a.contact.y - b.contact.y
  || (a.contact.heightFeet ?? 0) - (b.contact.heightFeet ?? 0)
  || String(a.candidateId ?? '').localeCompare(String(b.candidateId ?? '')) || a.pairIndex - b.pairIndex;
const comparePreferences = (a, b) => Number(a.crossesPartner) - Number(b.crossesPartner)
  || Number(a.crowded) - Number(b.crowded) || Number(b.forehand) - Number(a.forehand) || a.id.localeCompare(b.id);

function orderContactPairs(records) {
  // Subtract standing paddle reach before comparing travel. A later contact
  // cannot improve a zero-travel requirement just by waiting for more time.
  const byTravel = records.sort((a, b) => Number(b.reach.reachable) - Number(a.reach.reachable)
    || a.score - b.score || a.id.localeCompare(b.id) || compareContactTimes(a, b));
  const buckets = [];
  for (const record of byTravel) {
    const bucket = buckets.at(-1), first = bucket?.[0];
    if (!first || first.reach.reachable !== record.reach.reachable || record.score - first.score > EPS) buckets.push([record]);
    else bucket.push(record);
  }
  return buckets.flatMap(bucket => {
    const representative = new Map();
    for (const record of bucket) {
      const prior = representative.get(record.id);
      if (!prior || compareContactTimes(record, prior) < 0) representative.set(record.id, record);
    }
    // Use each actor's earliest equal-travel contact for cross-actor tie
    // preferences. A conditional same-actor comparator would be non-transitive
    // when one actor's later contact switches forehand side.
    return bucket.sort((a, b) => comparePreferences(representative.get(a.id), representative.get(b.id))
      || compareContactTimes(a, b));
  });
}

/** Corrected M2-only ranking: eligibility and better reach precede preferences. */
export function rankContactCandidatesV2({ eligible, positions, contact, players, availableSeconds = 1 }) {
  if (!Array.isArray(eligible)) throw new TypeError('Already-eligible identities are required.');
  return rankContactPairsV1({ eligible, positions, players,
    pairs: [...new Set(eligible)].map(id => ({ id, contact, availableSeconds })) });
}
export function rankContactPairsV1({ pairs, eligible, positions, players }) {
  if (!Array.isArray(pairs) || !Array.isArray(eligible)) throw new TypeError('Contact pairs and already-eligible identities are required.');
  const allowed = new Set(eligible);
  return freeze(orderContactPairs(pairs.map((pair, pairIndex) => ({ pair, pairIndex })).filter(({ pair }) => allowed.has(pair.id))
    .map(({ pair, pairIndex }) => rankPair(pair, positions, players, pairIndex))));
}

/** Keep callbacks, trajectories and all execution/outcome data out of this snapshot. */
export function createSituationV1({ players, positions, feet = {}, footState = {}, hitter, contact, contactIndex,
  opening = 'serve', service = {}, incoming = {}, priorDecisions = [], affordances = {} }) {
  if (!players || !positions || !Array.isArray(priorDecisions)) throw new TypeError('Players, positions and prior decisions are required.');
  if (!Number.isInteger(contactIndex) || contactIndex < 0 || contactIndex > 98) throw new TypeError('contactIndex must be an integer from 0 to 98.');
  if (!['serve', 'midrally'].includes(opening)) throw new TypeError('Unsupported rally opening.');
  hitter ??= contactIndex === 0 && opening === 'serve' ? service.server : null;
  if (!players[hitter]) throw new TypeError('A represented hitter is required.');
  const at = point(contact, 'contact', true), ids = Object.keys(players).sort();
  const sampled = Object.fromEntries(ids.map(id => [id, point(positions[id], `positions.${id}`)]));
  const hittingTeam = teamForPlayer(hitter, players), opponentTeam = oppositeTeam(hittingTeam);
  const eligible = eligibleHitters({ players, service, contactIndex, opening, previousHitter: incoming.hitter ?? null })
    .filter(id => teamForPlayer(id, players) === hittingTeam);
  if (!eligible.includes(hitter)) throw new TypeError('The selected hitter is not eligible for this rally contact.');
  const formations = Object.fromEntries(['green', 'orange'].map(team => {
    const pair = ids.filter(id => teamForPlayer(id, players) === team);
    const up = pair.filter(id => isUp(sampled[id], team)).length;
    return [team, pair.length === 2 && up === 2 ? 'up' : up === 1 ? 'split' : 'back'];
  }));
  const band = contactHeightBandV1(at);
  const servingTeam = service.servingTeam ?? teamForPlayer(service.server, players);
  if (servingTeam !== null && !['green', 'orange'].includes(servingTeam)) throw new TypeError('Unsupported serving team.');
  const actions = Object.fromEntries(['attack', 'drive', 'overhead', 'erne', 'aroundPost', 'letGo', 'lob', 'volley', 'bounced'].map(name => [name, affordances[name] === true]));
  // A coherent low drive or controlled counter is not automatically an
  // above-net attack. Explicit attack proof can also certify drive feasibility
  // for callers using the earlier API; an explicit false drive wins that tie.
  actions.drive = affordances.drive === true || (affordances.drive === undefined && affordances.attack === true);
  actions.attack = actions.attack && actions.drive && ['above-net', 'overhead'].includes(band);
  const actualFeet = Array.isArray(feet[hitter]) && feet[hitter].length === 2
    ? feet[hitter].map((value, index) => point(value, `feet.${hitter}[${index}]`)) : [];
  const footFacts = { outsideNVZ: actualFeet.length === 2 && actualFeet.every(foot => !isInNonVolleyZone(foot)),
    grounded: footState[hitter]?.grounded === true,
    // Production movement samples carry the same fact as persisted contact
    // evidence. Do not turn a missing or differently named flag into a reset.
    establishedOutsideNVZ: footState[hitter]?.feetEstablishedOutsideNVZ === true };
  const incomingIntent = optionalText(incoming.intent, 'incoming intent'), incomingFamily = optionalText(incoming.family, 'incoming family');
  let handsExchanges = 0;
  for (let i = priorDecisions.length - 1; i >= 0 && HANDS.has(intentOf(priorDecisions[i])); i--) handsExchanges++;
  const allFourUp = formations.green === 'up' && formations.orange === 'up';
  const phase = opening === 'serve' && contactIndex < 3 ? ['serve', 'return', 'third'][contactIndex]
    : incomingFamily === 'lob' ? 'scramble' : HANDS.has(incomingIntent) ? 'hands' : allFourUp ? 'kitchen' : 'transition';
  const snapshot = { policyVersion: POLICY_VERSION, contactIndex, opening, hitter, hittingTeam, opponentTeam,
    contact: at, contactKind: optionalText(contact.kind ?? incoming.contactKind, 'contact kind'),
    positions: sampled, feet: actualFeet, hitterFootState: footFacts,
    ownFormation: formations[hittingTeam], opponentFormation: formations[opponentTeam], allFourUp,
    hitterUp: isUp(sampled[hitter], hittingTeam), heightBand: band, incomingHeightClass: band,
    attackable: actions.attack, canDrive: actions.drive, affordances: actions, phase, handsExchanges,
    incomingIntent, incomingFamily, incomingPace: optionalText(incoming.pace, 'incoming pace'),
    priorThirdIntent: optionalText(intentOf(priorDecisions[2]), 'prior third intent'), priorThirdFamily: optionalText(familyOf(priorDecisions[2]), 'prior third family'),
    servingTeam,
    eligible: [...eligible] };
  return freeze(snapshot);
}

const definitions = {
  'serve-deep-middle': ['serve', 'serve', 'deep-middle', 'medium', 'high'],
  'serve-backhand': ['serve', 'serve', 'deep-backhand', 'medium', 'high'],
  'serve-short-angle': ['serve', 'serve', 'short-angle', 'soft', 'medium'],
  'return-deep-middle': ['deep-return', 'return', 'deep-middle', 'medium', 'high'],
  'return-backhand': ['deep-return', 'return', 'deep-backhand', 'medium', 'high'],
  'return-short': ['return', 'return', 'short-middle', 'soft', 'medium'],
  'third-shot-drop': ['third-shot-drop', 'drop', 'kitchen-cross', 'soft', 'high'],
  'third-shot-drive': ['third-shot-drive', 'drive', 'deep-feet', 'firm', 'low'],
  drop: ['drop', 'drop', 'kitchen-cross', 'soft', 'high'],
  drive: ['drive', 'drive', 'deep-feet', 'firm', 'low'],
  'firm-volley': ['volley', 'volley', 'deep-middle', 'firm', 'low'],
  'cross-court-dink': ['cross-court-dink', 'dink', 'kitchen-cross', 'soft', 'medium'],
  'middle-dink': ['middle-dink', 'dink', 'kitchen-middle', 'soft', 'medium'],
  'straight-dink': ['straight-dink', 'dink', 'kitchen-straight', 'soft', 'medium'],
  'backhand-dink': ['backhand-dink', 'dink', 'kitchen-backhand', 'soft', 'medium'],
  block: ['block', 'reset', 'transition-feet', 'soft', 'low'],
  reset: ['reset', 'reset', 'kitchen-middle', 'soft', 'high'],
  'speed-up': ['speed-up', 'volley', 'hip-middle', 'firm', 'low'],
  counter: ['counter', 'volley', 'hip-middle', 'firm', 'low'],
  'put-away': ['put-away', 'volley', 'open-court', 'firm', 'low'],
  lob: ['lob', 'lob', 'deep-overhead', 'medium', 'high'],
  overhead: ['overhead', 'overhead', 'open-court', 'firm', 'low'],
  erne: ['erne', 'volley', 'open-court', 'firm', 'low'],
  'around-the-post': ['around-the-post', 'drive', 'open-court', 'firm', 'low'],
  'let-go': ['let-go', null, null, null, null]
};
const rowFor = situation => situation.phase === 'serve' || situation.phase === 'return' || situation.phase === 'third' ? situation.phase
  : situation.opening === 'serve' && situation.contactIndex === 3 && situation.incomingFamily === 'drop' ? 'fourthDrop'
  : situation.opening === 'serve' && situation.contactIndex === 3 && situation.incomingFamily === 'drive' ? 'fourthDrive'
  : situation.opening === 'serve' && situation.contactIndex === 4 && (situation.priorThirdIntent === 'third-shot-drive' || situation.priorThirdFamily === 'drive') ? 'fifthDrive'
  : situation.phase === 'scramble' ? 'lobDefence' : situation.phase === 'hands' ? 'hands'
  : situation.allFourUp ? 'kitchen' : ['above-net', 'overhead'].includes(situation.heightBand) ? 'transitionHigh' : 'transitionLow';

function unavailable(id, situation, signatureShots) {
  if (id === 'let-go' && !situation.affordances.letGo) return 'incoming-flight-does-not-support-leaving';
  if (['speed-up', 'put-away'].includes(id) && !situation.attackable) return 'no-achievable-attacking-flight';
  if (['drive', 'third-shot-drive', 'counter'].includes(id) && !situation.canDrive) return 'no-achievable-drive-flight';
  if (id === 'drive' && situation.hitterUp && !situation.attackable) return 'no-line-attack-affordance';
  if (id === 'speed-up' && situation.heightBand === 'low') return 'low-contact-favours-reset';
  if (id === 'firm-volley' && situation.contactKind !== 'volley' && !situation.affordances.volley) return 'no-volley-contact';
  if (id === 'overhead' && (situation.heightBand !== 'overhead' || !situation.affordances.overhead)) return 'no-reachable-overhead';
  if (['erne', 'around-the-post'].includes(id)) {
    if (!signatureShots) return 'signature-shots-disabled';
    if (id === 'erne' && (!situation.affordances.erne || situation.incomingFamily !== 'dink' || !situation.hitterUp
      || !situation.hitterFootState.outsideNVZ || !situation.hitterFootState.grounded || !situation.hitterFootState.establishedOutsideNVZ)) return 'no-supported-grounded-erne';
    if (id === 'around-the-post' && !situation.affordances.aroundPost) return 'no-supported-around-post-flight';
  }
  if (id === 'lob' && situation.phase === 'kitchen' && !situation.affordances.lob) return 'no-lob-affordance';
  return null;
}

/** Finite contextual candidates; exclusions are retained for decision audit. */
export function listIntentCandidatesV1(situation, { profile = resolveStyle(), availableIntents = null, availableCandidateIds = null, signatureShots = true } = {}) {
  if (situation?.policyVersion !== POLICY_VERSION) throw new TypeError('A versioned prechoice situation is required.');
  if (typeof signatureShots !== 'boolean') throw new TypeError('signatureShots must be boolean.');
  for (const values of [availableIntents, availableCandidateIds]) if (values !== null && (!(Array.isArray(values) || values instanceof Set) || [...values].some(value => typeof value !== 'string'))) throw new TypeError('Availability must be an explicit array or set of candidate identifiers.');
  validateStyleProfile(profile);
  const row = rowFor(situation), weights = { ...profile.weights[row] };
  if (row === 'kitchen') weights['speed-up'] = situation.attackable ? 50 : situation.heightBand === 'low' ? 1 : weights['speed-up'];
  if (situation.incomingFamily === 'dink' && situation.hitterUp) weights.erne = profile.signature.erneWeight;
  if (situation.affordances.aroundPost) weights['around-the-post'] = profile.signature.aroundPostWeight;
  const available = availableIntents === null ? null : new Set(availableIntents);
  const candidateIds = availableCandidateIds === null ? null : new Set(availableCandidateIds);
  const candidates = [], excluded = [];
  for (const id of Object.keys(weights).sort()) {
    const [intent, family, targetRegion, pace, arc] = definitions[id];
    const weight = weights[id];
    const reason = weight <= 0 ? 'zero-profile-weight' : unavailable(id, situation, signatureShots)
      ?? (available && !available.has(intent) ? 'intent-flight-unavailable' : null)
      ?? (candidateIds && !candidateIds.has(id) ? 'candidate-flight-unavailable' : null);
    if (reason) { excluded.push({ id, intent, weight, reason }); continue; }
    candidates.push({ id, intent, family, targetRegion, pace, arc, weight, probability: 0,
      addsContact: id !== 'let-go', reasons: [`context:${row}`, `style:${profile.id}`, `flavour:${profile.flavour ?? 'balanced'}`] });
  }
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  for (const candidate of candidates) candidate.probability = candidate.weight / totalWeight;
  return freeze({ policyVersion: POLICY_VERSION, context: row, candidates, excluded, totalWeight });
}

/** The caller supplies a stream draw; this helper has no random state. */
export function chooseIntentV1(candidates, draw) {
  if (!Array.isArray(candidates) || !candidates.length) throw new RangeError('No feasible intent candidates remain.');
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new RangeError('A deterministic draw in [0,1) is required.');
  const total = candidates.reduce((sum, candidate) => sum + candidate.probability, 0);
  if (Math.abs(total - 1) > 1e-9 || candidates.some(candidate => !Number.isFinite(candidate.probability) || candidate.probability < 0)) throw new TypeError('Candidate probabilities must form a normalized distribution.');
  let cumulative = 0;
  for (const candidate of candidates) { cumulative += candidate.probability; if (draw < cumulative) return candidate; }
  return candidates.at(-1);
}
