import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_OPPORTUNITY_VERSION, CONTACT_OPPORTUNITY_LIMITS, contactOpportunityPreferenceV1, compareContactOpportunityPreferencesV1, rankContactOpportunitiesV1 } from '../rally-contact-selection.js';
import { CONTACT_RANKING_VERSION } from '../rally-policy.js';

const players = {
  player1: { team: 'green', handedness: 'right' }, player2: { team: 'green', handedness: 'right' },
  player3: { team: 'orange', handedness: 'right' }, player4: { team: 'orange', handedness: 'right' },
};
const positions = { player1: { x: 6, y: 8 }, player2: { x: 14, y: 8 }, player3: { x: 6, y: 36 }, player4: { x: 14, y: 36 } };
const candidate = (overrides = {}) => {
  const stance = overrides.stance ?? { x: 6, y: 10 };
  return { opportunityId: 'early', actorId: 'player1', sourceIndex: 0, kind: 'volley',
    contact: { x: 6.5, y: 11, heightFeet: 2.2 }, availableSeconds: .8,
    stance, contactFeet: [{x:stance.x-.42,y:stance.y},{x:stance.x+.42,y:stance.y}], recoveryPosition: { ...stance }, feasibleReplyIds: ['drop', 'firm-volley'], attackingReplyAvailable: false,
    audit: { legal: true, routeValid: true, feetValid: true, peakFeetPerSecond: 17.95, minimumSpacingFeet: 8 }, ...overrides };
};
const select = (candidates, overrides = {}) => rankContactOpportunitiesV1({ players, positions, eligible: ['player1', 'player2'], candidates, ...overrides });

test('proposal preferences order unaudited facts without claiming physical acceptance or rejection', () => {
  const facts = { contact: { x: 19, y: 20, heightFeet: 9 }, stance: { x: 18, y: 19 }, origin: positions.player1,
    team: 'green', contactFeet: [{x:17.58,y:19},{x:18.42,y:19}], feasibleReplyIds: [], attackingReplyAvailable: false, availableSeconds: .01,
    audit: { legal: false, routeValid: false, feetValid: false, peakFeetPerSecond: 999 }, quality: 'excellent', outcome: { winner: 'green' } };
  const preference = contactOpportunityPreferenceV1(facts);
  assert.equal(preference.supportedReplyCount, 0); assert.equal(preference.contactHeightFeet, 9);
  assert.equal(preference.heightClass, 'neutral');
  assert.equal(Object.hasOwn(preference, 'audit'), false); assert.equal(Object.hasOwn(preference, 'legal'), false);
  assert.equal(Object.hasOwn(preference, 'accepted'), false); assert.equal(Object.hasOwn(preference, 'quality'), false);
  assert.equal(Object.hasOwn(preference, 'outcome'), false);
  assert.ok(Object.isFrozen(preference)); assert.equal(Object.isFrozen(facts.contact), false);
  assert.equal(compareContactOpportunityPreferencesV1({ opportunityId: 'a', preference }, { opportunityId: 'b', preference }), -1);
  const final = select([candidate({ contact: facts.contact, stance: facts.stance, recoveryPosition: facts.stance,
    feasibleReplyIds: [], availableSeconds: facts.availableSeconds })]);
  assert.equal(final.chosen, null, 'only the audited selector applies physical acceptance filters');
});

test('the proposal preference exactly matches final audited preference and ordering', () => {
  const rows = [candidate(), candidate({ opportunityId: 'later', sourceIndex: 1, availableSeconds: 1.1,
    contact: { x: 6.5, y: 10, heightFeet: .2 }, kind: 'groundstroke' })];
  const proposals = rows.map(row => ({ opportunityId: row.opportunityId, preference: contactOpportunityPreferenceV1({
    contact: row.contact, stance: row.stance, contactFeet: row.contactFeet, origin: positions[row.actorId], team: players[row.actorId].team,
    feasibleReplyIds: row.feasibleReplyIds, attackingReplyAvailable: row.attackingReplyAvailable, availableSeconds: row.availableSeconds,
  }) })).sort(compareContactOpportunityPreferencesV1);
  const final = select(rows);
  assert.deepEqual(final.ranked.map(({ opportunityId, preference }) => ({ opportunityId, preference })), proposals);
});

test('a higher early reachable opportunity beats a late floor contact using prechoice physical facts', () => {
  const early = candidate(), late = candidate({ opportunityId: 'late', sourceIndex: 1, kind: 'groundstroke',
    contact: { x: 6.5, y: 10, heightFeet: .2 }, availableSeconds: 1.2, feasibleReplyIds: ['drop', 'drive'] });
  const result = select([late, early]);
  assert.equal(result.version, CONTACT_OPPORTUNITY_VERSION);
  assert.equal(result.chosen.opportunityId, 'early'); assert.equal(result.chosen.sourceIndex, 0);
  assert.equal(result.chosen.preference.heightClass, 'neutral');
  assert.equal(result.ranked[1].preference.heightClass, 'low');
  assert.equal(result.comparisons[0].reason, 'better-supported-height-class');
  assert.deepEqual(result.chosen.criterionVector, [1, -0, 2, -4.25, 2, 2.2, -.8]);
});

test('actual peak, spacing, feet, route and legality failures discard an attractive early contact', () => {
  const safe = candidate({ opportunityId: 'safe', sourceIndex: 1, kind: 'groundstroke', contact: { x: 6.5, y: 11, heightFeet: 1.5 } });
  for (const [patch, reason] of [
    [{ peakFeetPerSecond: 18.01 }, 'actual-peak-bound'],
    [{ minimumSpacingFeet: 2.49 }, 'actual-spacing-bound'],
    [{ feetValid: false }, 'invalid-contact-feet'],
    [{ routeValid: false }, 'actual-route-infeasible'],
    [{ legal: false }, 'illegal-contact'],
    [{ peakFeetPerSecond: null }, 'missing-physical-metrics'],
  ]) {
    const attractive = candidate({ contact: { x: 6.5, y: 11, heightFeet: 7.8 }, attackingReplyAvailable: true });
    attractive.audit = { ...attractive.audit, ...patch };
    const result = select([attractive, safe]);
    assert.equal(result.chosen.opportunityId, 'safe', reason);
    assert.equal(result.excluded[0].reason, reason);
    assert.equal(result.ranked.length, 1);
  }
});

test('audits cannot manufacture replies, eligibility, horizontal reach or unsupported grounded height', () => {
  for (const [patch, reason] of [
    [{ feasibleReplyIds: [] }, 'no-supported-reply'],
    [{ actorId: 'player3' }, 'ineligible-actor'],
    [{ contact: { x: 19, y: 20, heightFeet: 3 }, availableSeconds: .01 }, 'outside-illustrative-reach'],
    [{ contact: { x: 6.5, y: 11, heightFeet: 8.51 } }, 'unsupported-grounded-height'],
  ]) {
    const result = select([candidate(patch)]);
    assert.equal(result.chosen, null, reason); assert.deepEqual(result.ranked, []);
    assert.equal(result.excluded[0].reason, reason); assert.deepEqual(result.comparisons, []);
  }
});

test('actors at a fixed opportunity use existing reach/lane/hand ranking before opportunity preferences', () => {
  const fixed = { x: 10, y: 10, heightFeet: 2.2 };
  const left = candidate({ contact: fixed, stance: { x: 8, y: 9 }, recoveryPosition: { x: 8, y: 9 }, feasibleReplyIds: ['drop', 'drive', 'lob'] });
  const right = candidate({ actorId: 'player2', sourceIndex: 1, contact: fixed, stance: { x: 12, y: 9 }, recoveryPosition: { x: 12, y: 9 }, feasibleReplyIds: ['drop'] });
  const tied = select([left, right]);
  assert.equal(tied.ranked.length, 1); assert.equal(tied.chosen.actorId, 'player2', 'anatomical forehand wins the fixed-contact equal-reach tie');
  assert.equal(tied.chosen.actorRanking[0].version, CONTACT_RANKING_VERSION);
  assert.deepEqual(tied.chosen.actorRanking.map(row => row.id), ['player2', 'player1']);
  assert.equal(tied.chosen.preference.supportedReplyCount, 1, 'reply count does not replace fixed-contact actor responsibility');
  const closer = select([left, right], { positions: { ...positions, player1: { x: 9, y: 9 } } });
  assert.equal(closer.chosen.actorId, 'player1', 'strictly better reach precedes a forehand preference');
  const failedForehand = select([left, { ...right, audit: { ...right.audit, feetValid: false } }]);
  assert.equal(failedForehand.chosen.actorId, 'player1', 'an actor with illegal feet never enters fixed-opportunity ranking');
});

test('contact kind gives no automatic volley priority', () => {
  const air = candidate({ contact: { x: 6.5, y: 11, heightFeet: .8 } });
  const bounced = candidate({ opportunityId: 'bounced', sourceIndex: 1, kind: 'groundstroke',
    contact: { x: 6.5, y: 11, heightFeet: 2.2 }, feasibleReplyIds: ['drop', 'drive'], availableSeconds: 1 });
  const result = select([air, bounced]);
  assert.equal(result.chosen.kind, 'groundstroke');
  assert.equal(result.comparisons[0].reason, 'better-supported-height-class');
});

test('above-net geometry gains attack priority only with an actual attacking reply', () => {
  const high = candidate({ contact: { x: 6.5, y: 11, heightFeet: 3.7 } });
  const advanced = candidate({ opportunityId: 'advanced', sourceIndex: 1, stance: { x: 6, y: 12 },
    contact: { x: 6.5, y: 13, heightFeet: 2.2 }, recoveryPosition: { x: 6, y: 12 } });
  const unsupported = select([high, advanced]);
  assert.equal(unsupported.chosen.opportunityId, 'advanced');
  assert.equal(unsupported.ranked[1].preference.geometryHeightBand, 'above-net');
  assert.equal(unsupported.ranked[1].preference.heightClass, 'neutral');
  assert.equal(unsupported.comparisons[0].reason, 'more-ready-line-improvement');
  const supported = select([{ ...high, attackingReplyAvailable: true }, advanced]);
  assert.equal(supported.chosen.opportunityId, 'early'); assert.equal(supported.chosen.preference.heightClass, 'attack');
  assert.equal(supported.comparisons[0].reason, 'better-supported-height-class');
});

test('small height changes within a class cannot displace forward progress or recovery', () => {
  const tall = candidate({ contact: { x: 6.5, y: 11, heightFeet: 2.21 } });
  const forward = candidate({ opportunityId: 'forward', sourceIndex: 1, stance: { x: 6, y: 12 },
    recoveryPosition: { x: 6, y: 12 }, contact: { x: 6.5, y: 13, heightFeet: 2.2 } });
  assert.equal(select([tall, forward]).chosen.opportunityId, 'forward');
  const recovered = candidate({ opportunityId: 'recovered', actorId: 'player2', sourceIndex: 1, stance: { x: 14, y: 14 },
    recoveryPosition: { x: 14, y: 14 }, contact: { x: 14.5, y: 14.5, heightFeet: 2.2 }, availableSeconds: 1.2 });
  const result = select([tall, recovered], { positions: { ...positions, player2: { x: 14, y: 12 } } });
  assert.equal(result.chosen.opportunityId, 'recovered');
  assert.equal(result.comparisons[0].reason, 'closer-recovery-to-line');
});

test('shared-solver reply count then exact height and time resolve otherwise equal opportunities', () => {
  const base = candidate();
  for (const [patch, reason] of [
    [{ feasibleReplyIds: ['drop', 'drive', 'lob'] }, 'more-supported-replies'],
    [{ contact: { ...base.contact, heightFeet: 2.21 } }, 'higher-actual-contact'],
    [{ availableSeconds: .7 }, 'earlier-equal-opportunity'],
  ]) {
    const alternative = candidate({ opportunityId: 'other', sourceIndex: 1, ...patch });
    const result = select([base, alternative]);
    assert.equal(result.chosen.opportunityId, 'other'); assert.equal(result.comparisons[0].reason, reason);
  }
});

test('source order and unknown soft labels cannot alter selection or leak into its prechoice evidence', () => {
  const first = candidate({ opportunityId: 'a', quality: 'error', outcome: { winner: 'orange' }, unknown: { future: true } });
  const second = candidate({ opportunityId: 'b', sourceIndex: 1, quality: 'excellent', winner: 'green' });
  const input = { players: structuredClone(players), positions: structuredClone(positions), eligible: ['player1', 'player2'], candidates: [second, first] };
  const before = JSON.stringify(input), result = rankContactOpportunitiesV1(input);
  assert.equal(result.chosen.opportunityId, 'a'); assert.equal(result.comparisons[0].reason, 'stable-opportunity-id');
  assert.deepEqual(result, rankContactOpportunitiesV1({ ...input, candidates: [first, second] }));
  assert.equal(JSON.stringify(input), before); assert.equal(Object.isFrozen(input.candidates[0]), false);
  assert.ok(Object.isFrozen(result.chosen.contact)); assert.ok(Object.isFrozen(result.chosen.audit));
  assert.ok(Object.isFrozen(result.comparisons));
  const keys = value => value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]) : [];
  assert.equal(keys(result).some(key => ['quality', 'outcome', 'winner', 'unknown', 'future'].includes(key)), false);
});

test('orange progress and recovery use the same court-relative criteria', () => {
  const mirror = row => ({ ...row, actorId: 'player3', contact: { ...row.contact, y: 44 - row.contact.y },
    stance: { ...row.stance, y: 44 - row.stance.y }, contactFeet: row.contactFeet.map(foot=>({...foot,y:44-foot.y})), recoveryPosition: { ...row.recoveryPosition, y: 44 - row.recoveryPosition.y } });
  const result = select([mirror(candidate())], { eligible: ['player3', 'player4'] });
  assert.equal(result.chosen.preference.readyLineImprovementFeet, 2);
  assert.equal(result.chosen.preference.recoveryLineDistanceFeet, 4.25);
});

test('bounded serializable facts cannot disguise different contacts as one opportunity or use outgoing recovery', () => {
  assert.throws(() => select(Array.from({ length: CONTACT_OPPORTUNITY_LIMITS.candidates + 1 }, (_, sourceIndex) => candidate({ sourceIndex }))), /bounded/);
  assert.throws(() => select([candidate(), candidate({ actorId: 'player2', sourceIndex: 1, contact: { x: 6.5, y: 11, heightFeet: 2.21 } })]), /identical/);
  assert.throws(() => select([candidate(), candidate({ actorId: 'player2' })]), /indices must be unique/);
  assert.throws(() => select([candidate(), candidate({ sourceIndex: 1 })]), /only once/);
  assert.throws(() => select([candidate({ recoveryPosition: { x: 6, y: 14.25 } })]), /actual sampled stance/);
  assert.throws(() => select([candidate({ feasibleReplyIds: ['winner'] })]), /known paddle-contact/);
  assert.throws(() => select([candidate({ attackingReplyAvailable: undefined })]), /attacking-reply/);
  assert.throws(() => select([candidate({ audit: { legal: true, routeValid: true } })]), /Explicit/);
  assert.throws(() => select([candidate({ availableSeconds: Infinity })]), /finite/);
  assert.throws(() => select([], { eligible: ['player1', 'player3'] }), /one hitting team/);
  assert.equal(select([]).chosen, null);
});
