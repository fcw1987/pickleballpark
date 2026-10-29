// Pure M2 prechoice selection. The caller supplies shared-solver reply support
// and actual route/feet audits; this module neither constructs nor repairs them.
import { contactHeightBandV1, rankContactCandidatesV2 } from './rally-policy.js';
import { GENERATOR_MOVEMENT, GROUNDED_CONTACT_HEIGHT_FEET } from './rally-movement.js';
import { teamForPlayer } from './rally-state.js';

export const CONTACT_OPPORTUNITY_VERSION = 'rally-contact-opportunities-v1';
export const CONTACT_OPPORTUNITY_LIMITS = Object.freeze({ candidates: 128, replies: 24 });
const EPS = 1e-6;
const REPLIES = new Set(['serve-deep-middle', 'serve-backhand', 'serve-short-angle',
  'return-deep-middle', 'return-backhand', 'return-short', 'third-shot-drop', 'third-shot-drive',
  'drop', 'drive', 'firm-volley', 'cross-court-dink', 'middle-dink', 'straight-dink',
  'backhand-dink', 'block', 'reset', 'speed-up', 'counter', 'put-away', 'lob', 'overhead', 'erne', 'around-the-post']);
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const finite = (value, name, minimum = -Infinity) => {
  if (!Number.isFinite(value) || value < minimum) throw new TypeError(`${name} must be finite and at least ${minimum}.`);
  return value;
};
const point = (value, name, height = false) => {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} requires board coordinates.`);
  return { x: finite(value.x, `${name}.x`), y: finite(value.y, `${name}.y`),
    ...(height ? { heightFeet: finite(value.heightFeet, `${name}.heightFeet`, 0) } : {}) };
};
const identifier = (value, name) => {
  if (typeof value !== 'string' || !value.length || value.length > 80 || /[<>\u0000-\u001f\u007f]/.test(value)) throw new TypeError(`${name} must be a bounded identifier.`);
  return value;
};
const depth = (at, team) => team === 'green' ? at.y : 44 - at.y;
const lineDistance = (at, team) => Math.abs(depth(at, team) - (22 - 7 - GENERATOR_MOVEMENT.lineOffsetFeet));
const replyIds = values => {
  if (!Array.isArray(values) || values.length > CONTACT_OPPORTUNITY_LIMITS.replies
    || values.some(id => !REPLIES.has(id))) throw new TypeError('Reply support requires bounded known paddle-contact candidate IDs.');
  return [...new Set(values)].sort();
};

/** Proposal preference only: this makes no acceptance or physical-audit claim. */
export function contactOpportunityPreferenceV1({ contact, stance, origin, team, feasibleReplyIds, attackingReplyAvailable, availableSeconds } = {}) {
  const at = point(contact, 'contact', true), feet = point(stance, 'stance'), from = point(origin, 'origin');
  if (!['green', 'orange'].includes(team)) throw new TypeError('An explicit hitting team is required.');
  if (typeof attackingReplyAvailable !== 'boolean') throw new TypeError('An explicit shared-solver attacking-reply fact is required.');
  const replies = replyIds(feasibleReplyIds), seconds = finite(availableSeconds, 'availableSeconds', 0);
  const geometryHeightBand = contactHeightBandV1(at);
  const heightClass = attackingReplyAvailable && ['above-net', 'overhead'].includes(geometryHeightBand)
    ? 'attack' : geometryHeightBand === 'low' ? 'low' : 'neutral';
  return freeze({ geometryHeightBand, heightClass, heightClassRank: { low: 0, neutral: 1, attack: 2 }[heightClass],
    contactHeightFeet: at.heightFeet, forwardProgressFeet: depth(feet, team) - depth(from, team),
    supportedReplyCount: replies.length, recoveryLineDistanceFeet: lineDistance(feet, team), availableSeconds: seconds });
}

function candidateFacts(candidate) {
  const opportunityId = identifier(candidate?.opportunityId, 'opportunityId');
  const actorId = identifier(candidate.actorId, 'actorId');
  if (!Number.isInteger(candidate.sourceIndex) || candidate.sourceIndex < 0) throw new TypeError('sourceIndex must be a nonnegative integer.');
  if (!['volley', 'groundstroke', 'short-hop'].includes(candidate.kind)) throw new TypeError('A supported incoming contact kind is required.');
  const feasibleReplyIds = replyIds(candidate.feasibleReplyIds);
  if (typeof candidate.attackingReplyAvailable !== 'boolean') throw new TypeError('An explicit shared-solver attacking-reply fact is required.');
  const audit = candidate.audit;
  if (!audit || ['legal', 'routeValid', 'feetValid'].some(key => typeof audit[key] !== 'boolean')) throw new TypeError('Explicit legality, actual-route and feet audits are required.');
  const metric = (value, name) => value === null ? null : finite(value, name, 0);
  const stance = point(candidate.stance, 'stance'), recoveryPosition = point(candidate.recoveryPosition, 'recoveryPosition');
  if (Math.hypot(stance.x - recoveryPosition.x, stance.y - recoveryPosition.y) > EPS) throw new TypeError('Recovery position must be the actual sampled stance at this contact.');
  return { opportunityId, actorId, sourceIndex: candidate.sourceIndex, kind: candidate.kind,
    contact: point(candidate.contact, 'contact', true), availableSeconds: finite(candidate.availableSeconds, 'availableSeconds', 0),
    stance, recoveryPosition: { ...stance }, attackingReplyAvailable: candidate.attackingReplyAvailable,
    feasibleReplyIds,
    audit: { legal: audit.legal, routeValid: audit.routeValid, feetValid: audit.feetValid,
      peakFeetPerSecond: metric(audit.peakFeetPerSecond, 'peakFeetPerSecond'),
      minimumSpacingFeet: metric(audit.minimumSpacingFeet, 'minimumSpacingFeet') } };
}

function exclusion(facts, eligible) {
  if (!eligible.has(facts.actorId)) return 'ineligible-actor';
  if (!facts.audit.legal) return 'illegal-contact';
  if (!facts.audit.feetValid) return 'invalid-contact-feet';
  if (!facts.audit.routeValid) return 'actual-route-infeasible';
  if (facts.audit.peakFeetPerSecond === null || facts.audit.minimumSpacingFeet === null) return 'missing-physical-metrics';
  if (facts.audit.peakFeetPerSecond > GENERATOR_MOVEMENT.peakFeetPerSecond + EPS) return 'actual-peak-bound';
  if (facts.audit.minimumSpacingFeet < 2.5 - EPS) return 'actual-spacing-bound';
  if (facts.contact.heightFeet > GROUNDED_CONTACT_HEIGHT_FEET + EPS) return 'unsupported-grounded-height';
  if (!facts.feasibleReplyIds.length) return 'no-supported-reply';
  return null;
}

// Geometry earns attack priority only with a shared-solver attacking reply.
// Within a class, meaningful progress/recovery precede tiny height changes.
// These are explicit model preferences, not observed win probabilities.
const criteria = [
  ['heightClassRank', 'better-supported-height-class', -1],
  ['forwardProgressFeet', 'more-forward-progress', -1],
  ['recoveryLineDistanceFeet', 'closer-recovery-to-line', 1],
  ['supportedReplyCount', 'more-supported-replies', -1],
  ['contactHeightFeet', 'higher-actual-contact', -1],
  ['availableSeconds', 'earlier-equal-opportunity', 1],
];
/** Compare proposal preferences; neither argument needs or receives an audit. */
export function compareContactOpportunityPreferencesV1(left, right) {
  for (const row of [left, right]) {
    identifier(row?.opportunityId, 'opportunityId');
    for (const [key] of criteria) finite(row.preference?.[key], `preference.${key}`);
  }
  for (const [key, , direction] of criteria) {
    const difference = left.preference[key] - right.preference[key];
    if (difference !== 0) return difference * direction;
  }
  return left.opportunityId.localeCompare(right.opportunityId);
}
function explain(chosen, alternative) {
  for (const [key, reason] of criteria) if (chosen.preference[key] !== alternative.preference[key]) return {
    alternativeOpportunityId: alternative.opportunityId, criterion: key, reason,
    chosenValue: chosen.preference[key], alternativeValue: alternative.preference[key],
  };
  return { alternativeOpportunityId: alternative.opportunityId, criterion: 'opportunityId', reason: 'stable-opportunity-id',
    chosenValue: chosen.opportunityId, alternativeValue: alternative.opportunityId };
}

/**
 * A candidate is one actor at one fixed incoming opportunity. sourceIndex maps
 * the result back to caller-owned trials. recoveryPosition is sampled before
 * choosing an outgoing intent; it must not be an outgoing execution endpoint.
 */
export function rankContactOpportunitiesV1({ players, positions, eligible, candidates } = {}) {
  if (!Array.isArray(eligible) || eligible.some(id => !players?.[id] || !positions?.[id])) throw new TypeError('Represented eligible actors and origin positions are required.');
  if (!Array.isArray(candidates) || candidates.length > CONTACT_OPPORTUNITY_LIMITS.candidates) throw new TypeError('A bounded contact-candidate array is required.');
  const allowed = new Set(eligible), teams = new Set(eligible.map(id => teamForPlayer(id, players)));
  if (teams.size > 1 || [...teams].some(team => !['green', 'orange'].includes(team))) throw new TypeError('Contact opportunities must belong to one hitting team.');
  const groups = new Map(), excluded = [], sourceIndices = new Set();
  for (const candidate of candidates) {
    const facts = candidateFacts(candidate);
    if (sourceIndices.has(facts.sourceIndex)) throw new TypeError('Candidate source indices must be unique.');
    sourceIndices.add(facts.sourceIndex);
    const group = groups.get(facts.opportunityId) ?? [];
    const same = group[0];
    if (same && (same.kind !== facts.kind || same.availableSeconds !== facts.availableSeconds
      || ['x', 'y', 'heightFeet'].some(key => same.contact[key] !== facts.contact[key]))) throw new TypeError('A fixed opportunity must have identical contact, kind and time for every actor.');
    if (group.some(row => row.actorId === facts.actorId)) throw new TypeError('An actor may occur only once per opportunity.');
    group.push(facts); groups.set(facts.opportunityId, group);
  }
  const ranked = [];
  for (const group of groups.values()) {
    const feasible = [];
    for (const facts of group) {
      const reason = exclusion(facts, allowed);
      if (reason) excluded.push({ ...facts, reason }); else feasible.push(facts);
    }
    if (!feasible.length) continue;
    const opportunity = feasible[0];
    const actorRanking = rankContactCandidatesV2({ players, positions, eligible: feasible.map(row => row.actorId),
      contact: opportunity.contact, availableSeconds: opportunity.availableSeconds });
    const reachable = actorRanking.filter(row => row.reach.reachable);
    for (const row of actorRanking.filter(row => !row.reach.reachable)) excluded.push({ ...feasible.find(facts => facts.actorId === row.id), reason: 'outside-illustrative-reach' });
    if (!reachable.length) continue;
    const selected = feasible.find(row => row.actorId === reachable[0].id), team = teamForPlayer(selected.actorId, players);
    const preference = contactOpportunityPreferenceV1({ contact: selected.contact, stance: selected.stance,
      origin: positions[selected.actorId], team, feasibleReplyIds: selected.feasibleReplyIds,
      attackingReplyAvailable: selected.attackingReplyAvailable, availableSeconds: selected.availableSeconds });
    ranked.push({ ...selected, actorRanking: reachable, preference,
      criterionVector: criteria.map(([key, , direction]) => preference[key] * -direction),
      reasons: ['audited-legal-contact', 'audited-actual-route', 'audited-contact-feet', 'shared-solver-supported-replies',
        'fixed-opportunity-actor-ranking', `geometry-height-band:${preference.geometryHeightBand}`, `supported-height-class:${preference.heightClass}`] });
  }
  ranked.sort(compareContactOpportunityPreferencesV1);
  excluded.sort((a, b) => a.sourceIndex - b.sourceIndex);
  const chosen = ranked[0] ?? null;
  return freeze({ version: CONTACT_OPPORTUNITY_VERSION, strategy: 'feasibility-then-fixed-opportunity-actors-then-opportunities',
    chosen, ranked, excluded, comparisons: chosen ? ranked.slice(1).map(row => explain(chosen, row)) : [] });
}
