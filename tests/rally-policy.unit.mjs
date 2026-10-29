import test from 'node:test';
import assert from 'node:assert/strict';
import { POLICY_VERSION, CONTACT_RANKING_VERSION, FIFTH_CONTACT_PRIORS_VERSION, contactHeightBandV1, rankContactCandidatesV2, rankContactPairsV1, createSituationV1, listIntentCandidatesV1, chooseIntentV1 } from '../rally-policy.js';
import { resolveStyle } from '../rally-styles.js';
import { eligibleHitters } from '../rally-state.js';
import { PHYSICS_V2, localNetHeightFeet } from '../play-physics-v2.js';
import { sampleFeetStateV1 } from '../rally-movement.js';
import { compileDocument } from '../play-compiler.js';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';

const players = {
  player1: { team: 'green', handedness: 'right' }, player2: { team: 'green', handedness: 'right' },
  player3: { team: 'orange', handedness: 'right' }, player4: { team: 'orange', handedness: 'right' }
};
const positions = { player1: { x: 6, y: 14 }, player2: { x: 14, y: 14 }, player3: { x: 6, y: 30 }, player4: { x: 14, y: 30 } };
const service = { server: 'player1', receiver: 'player3', servingTeam: 'green', court: 'right', courtConvention: 'server-perspective-v1' };
const situation = overrides => createSituationV1({ players, positions, hitter: 'player1', contact: { x: 6, y: 14, heightFeet: 2.2 }, contactIndex: 6, service, ...overrides });

test('M2 middle-forehand ranking is correct for both teams and both handednesses', () => {
  for (const [team, hand, expected] of [['green', 'right', 'player2'], ['green', 'left', 'player1'], ['orange', 'right', 'player3'], ['orange', 'left', 'player4']]) {
    const records = structuredClone(players);
    const eligible = Object.keys(records).filter(id => records[id].team === team);
    for (const id of eligible) records[id].handedness = hand;
    const ranked = rankContactCandidatesV2({ eligible, positions, players: records, contact: { x: 10, y: team === 'green' ? 14 : 30 }, availableSeconds: .5 });
    assert.equal(ranked[0].id, expected, `${team}/${hand}`);
    assert.equal(ranked[0].forehand, true);
    assert.equal(ranked[0].version, CONTACT_RANKING_VERSION);
  }
});

test('a forehand tie preference cannot override better reach or designated receiver identity', () => {
  const sampled = structuredClone(positions); sampled.player1.x = 9;
  const ranked = rankContactCandidatesV2({ eligible: ['player1', 'player2'], positions: sampled, players, contact: { x: 10, y: 14 }, availableSeconds: .5 });
  assert.equal(ranked[0].id, 'player1'); assert.equal(ranked[0].forehand, false);
  const eligible = eligibleHitters({ players, service, contactIndex: 1, previousHitter: 'player1' });
  assert.deepEqual(eligible, ['player3']);
  const returner = rankContactCandidatesV2({ eligible, positions, players, contact: { x: 14, y: 30 }, availableSeconds: 0 });
  assert.deepEqual(returner.map(candidate => candidate.id), ['player3']);
  assert.equal(returner[0].reach.reachable, false, 'the legal receiver remains the receiver even when unreachable');
  assert.throws(() => situation({ contactIndex: 1, hitter: 'player4' }), /not eligible/);
});

test('per-actor contact pairs preserve stable source indices and never freeze trial state', () => {
  const trial = { mutable: true }, pairs = [
    { id: 'player4', contact: { x: 14, y: 30 }, availableSeconds: .3 },
    { id: 'player2', contact: { x: 10, y: 14 }, availableSeconds: .5, trial },
    { id: 'player1', contact: { x: 10, y: 14 }, availableSeconds: .5 }
  ];
  const before = JSON.stringify({ players, positions, pairs });
  const ranked = rankContactPairsV1({ pairs, eligible: ['player1', 'player2'], positions, players });
  assert.deepEqual(ranked.map(record => record.pairIndex), [1, 2]);
  assert.equal(ranked[0].trial, undefined); assert.equal(Object.isFrozen(trial), false);
  assert.equal(JSON.stringify({ players, positions, pairs }), before);
  assert.ok(Object.isFrozen(ranked[0]));
  assert.throws(() => rankContactCandidatesV2({ eligible: ['player1'], positions, players, contact: { x: 10, y: 14 }, availableSeconds: Infinity }), /finite/);
});

test('standing paddle reach ties prefer the earlier same-actor contact instead of waiting for a bounce', () => {
  const pairs = [
    { id: 'player1', contact: { x: 7, y: 14, heightFeet: 1.2 }, availableSeconds: 1.5, kind: 'groundstroke' },
    { id: 'player1', contact: { x: 8.8, y: 14, heightFeet: 2 }, availableSeconds: .45, kind: 'volley' }
  ];
  const ranked = rankContactPairsV1({ pairs, eligible: ['player1'], positions, players });
  assert.equal(ranked[0].kind, 'volley');
  assert.equal(ranked[0].requiredTravelFeet, 0); assert.equal(ranked[0].score, 0);
  assert.equal(ranked[1].score, 0);
  assert.deepEqual(ranked.map(record => record.pairIndex), [1, 0], 'later pairs remain available for actual-route fallback');
});

test('a timing preference cannot replace strictly better travel feasibility', () => {
  const pairs = [
    { id: 'player1', contact: { x: 11, y: 14 }, availableSeconds: .3, kind: 'volley' },
    { id: 'player1', contact: { x: 10, y: 14 }, availableSeconds: .9, kind: 'groundstroke' },
    { id: 'player2', contact: { x: 10, y: 14 }, availableSeconds: .01, kind: 'volley' }
  ];
  const ranked = rankContactPairsV1({ pairs, eligible: ['player1', 'player2'], positions, players });
  assert.equal(ranked[0].pairIndex, 1, 'the later contact needs less of the available travel');
  assert.equal(ranked.at(-1).id, 'player2', 'unreachable early volleys never displace reachable contacts');
});

test('equal-travel actor ordering remains transitive when later contacts switch forehand sides', () => {
  const pairs = [
    { id: 'player1', contact: { x: 8, y: 14 }, availableSeconds: .2, kind: 'volley' },
    { id: 'player1', contact: { x: 4, y: 14 }, availableSeconds: .8, kind: 'groundstroke' },
    { id: 'player2', contact: { x: 12, y: 14 }, availableSeconds: .4, kind: 'volley' }
  ];
  const signature = values => rankContactPairsV1({ pairs: values, eligible: ['player1', 'player2'], positions, players })
    .map(row => [row.id, row.availableSeconds, row.kind]);
  const expected = [['player2', .4, 'volley'], ['player1', .2, 'volley'], ['player1', .8, 'groundstroke']];
  for (const values of [pairs, pairs.toReversed(), [pairs[1], pairs[2], pairs[0]]]) assert.deepEqual(signature(values), expected);
});

test('height bands are exhaustive and use the ball surface above local tape', () => {
  for (const [heightFeet, band] of [[0, 'low'], [1.19999, 'low'], [1.2, 'neutral'], [2.8, 'neutral'], [3, 'above-net'], [6.999, 'above-net'], [7, 'overhead'], [30, 'overhead']]) {
    assert.equal(contactHeightBandV1({ x: 10, y: 14, heightFeet }), band);
  }
  const tape = localNetHeightFeet(0), radius = PHYSICS_V2.ballRadiusFeet;
  assert.equal(contactHeightBandV1({ x: 0, y: 14, heightFeet: tape + radius }), 'neutral');
  assert.equal(contactHeightBandV1({ x: 0, y: 14, heightFeet: tape + radius + 1e-6 }), 'above-net');
  for (const heightFeet of [-1, 30.01, Infinity, NaN]) assert.throws(() => contactHeightBandV1({ x: 10, y: 14, heightFeet }), TypeError);
});

test('prechoice situations contain geometry and prior facts without execution or outcome leakage', () => {
  const source = { players: structuredClone(players), positions: structuredClone(positions), incoming: { intent: 'cross-court-dink', family: 'dink', quality: 'attackable', outcome: { winner: 'orange' } } };
  const before = JSON.stringify(source);
  const result = situation({ ...source, contact: { x: 6, y: 14, heightFeet: 3.5 } });
  assert.equal(result.heightBand, 'above-net'); assert.equal(result.attackable, false);
  assert.equal(result.incomingHeightClass, 'above-net'); assert.equal(result.phase, 'kitchen');
  assert.equal(result.outcome, undefined); assert.equal(result.quality, undefined); assert.equal(result.incomingQuality, undefined);
  assert.equal(result.policyVersion, POLICY_VERSION);
  assert.equal(Object.isFrozen(source.incoming), false);
  assert.equal(JSON.stringify(source), before);
  assert.throws(() => situation({ incoming: { intent: {} } }), /bounded plain text/);
});

test('a quality label cannot create an attack and an explicit feasible flight changes the policy', () => {
  const neutral = situation({ incoming: { quality: 'attackable' }, contact: { x: 6, y: 14, heightFeet: 3.5 } });
  const base = listIntentCandidatesV1(neutral);
  assert.equal(base.candidates.some(candidate => candidate.intent === 'speed-up'), false);
  assert.ok(base.excluded.some(candidate => candidate.id === 'speed-up' && candidate.reason === 'no-achievable-attacking-flight'));
  const attack = listIntentCandidatesV1(situation({ contact: { x: 6, y: 14, heightFeet: 3.5 }, affordances: { attack: true } }));
  assert.equal(attack.candidates.find(candidate => candidate.id === 'speed-up').weight, 50);
  const low = listIntentCandidatesV1(situation({ contact: { x: 6, y: 14, heightFeet: .9 }, affordances: { attack: true } }));
  assert.equal(low.candidates.some(candidate => candidate.id === 'speed-up'), false);
});

test('a feasible below-tape drive is not a kitchen attack affordance', () => {
  const contact = { x: 6, y: 14, heightFeet: 2.2 };
  const low = situation({ contact, affordances: { drive: true, attack: false } });
  assert.equal(low.canDrive, true); assert.equal(low.attackable, false);
  const kitchen = listIntentCandidatesV1(low);
  assert.equal(kitchen.candidates.some(candidate => candidate.id === 'speed-up'), false);
  const contradictory = situation({ contact, affordances: { drive: true, attack: true } });
  assert.equal(contradictory.attackable, false, 'known ball surface below tape cannot become attackable by a flag');
  assert.equal(contradictory.affordances.attack, false);
  const noDrive = situation({ contact: { ...contact, heightFeet: 3.5 }, affordances: { drive: false, attack: true } });
  assert.equal(noDrive.canDrive, false); assert.equal(noDrive.attackable, false);
});

test('low third-shot drives and controlled hands counters retain their separate feasible-drive permission', () => {
  const third = listIntentCandidatesV1(situation({ contactIndex: 2, contact: { x: 6, y: 4, heightFeet: .9 },
    affordances: { drive: true, attack: false } }));
  assert.ok(third.candidates.some(candidate => candidate.id === 'third-shot-drive'));
  const hands = listIntentCandidatesV1(situation({ incoming: { family: 'volley', intent: 'speed-up' },
    contact: { x: 6, y: 14, heightFeet: 2.2 }, affordances: { drive: true, attack: false } }));
  assert.equal(hands.context, 'hands');
  assert.ok(hands.candidates.some(candidate => candidate.id === 'counter'));
  assert.equal(hands.candidates.some(candidate => candidate.id === 'put-away'), false);
  const impossible = listIntentCandidatesV1(situation({ incoming: { family: 'volley', intent: 'speed-up' },
    affordances: { drive: false, attack: false } }));
  assert.equal(impossible.candidates.some(candidate => candidate.id === 'counter'), false);
});

test('generic drives require an above-tape attack from the line while a back player may use a low feasible drive', () => {
  const sampled = structuredClone(positions); sampled.player2.y = 4;
  const line = listIntentCandidatesV1(situation({ positions: sampled, affordances: { drive: true, attack: false } }));
  assert.equal(line.candidates.some(candidate => candidate.id === 'drive'), false);
  assert.ok(line.excluded.some(candidate => candidate.id === 'drive' && candidate.reason === 'no-line-attack-affordance'));
  sampled.player1.y = 4;
  const back = listIntentCandidatesV1(situation({ positions: sampled, contact: { x: 6, y: 4, heightFeet: .9 },
    affordances: { drive: true, attack: false } }));
  assert.ok(back.candidates.some(candidate => candidate.id === 'drive'));
  sampled.player1.y = 14;
  const high = listIntentCandidatesV1(situation({ positions: sampled, contact: { x: 6, y: 14, heightFeet: 3.5 },
    affordances: { drive: true, attack: true } }));
  assert.ok(high.candidates.some(candidate => candidate.id === 'drive'));
});

test('serve and return preserve explicit target choices with legal persisted intents', () => {
  const serve = listIntentCandidatesV1(situation({ contactIndex: 0, hitter: 'player1', contact: { x: 5, y: -1, heightFeet: 2.2 } }));
  assert.equal(serve.context, 'serve'); assert.equal(serve.candidates.length, 3);
  assert.ok(serve.candidates.every(candidate => candidate.intent === 'serve' && candidate.family === 'serve'));
  assert.equal(new Set(serve.candidates.map(candidate => candidate.id)).size, 3);
  const response = listIntentCandidatesV1(situation({ contactIndex: 1, hitter: 'player3', contact: { x: 14, y: 40, heightFeet: 2 }, incoming: { hitter: 'player1' } }));
  assert.equal(response.context, 'return'); assert.equal(response.candidates.length, 3);
  assert.ok(response.candidates.every(candidate => candidate.family === 'return'));
});

test('fifth-shot priors following a third drive are not restricted to a fourth-shot block', () => {
  const result = listIntentCandidatesV1(situation({ contactIndex: 4,
    priorDecisions: [{ intent: 'serve' }, { intent: 'deep-return' }, { intent: 'third-shot-drive', family: 'drive' }, { intent: 'counter' }],
    incoming: { family: 'volley', intent: 'counter' }, contact: { x: 6, y: 14, heightFeet: 3.5, kind: 'volley' }, affordances: { attack: true } }), { profile: resolveStyle('pro') });
  assert.equal(result.context, 'fifthDrive');
  assert.equal(result.candidates.find(candidate => candidate.id === 'drop').weight, 58);
  assert.equal(result.candidates.find(candidate => candidate.id === 'firm-volley').weight, 40);
  assert.deepEqual(result.conditioning, { version: FIFTH_CONTACT_PRIORS_VERSION, fact: 'contactKind', value: 'volley',
    profileRow: 'fifthDriveAir', basis: 'model-contact-conditional-prior', referenceRow: 'fifthDrive' });
  assert.ok(Object.isFrozen(result.conditioning));
  assert.deepEqual(resolveStyle('pro').weights.fifthDrive, { drop: 66, 'firm-volley': 31, drive: 2, lob: 1 }, 'the marginal reference stays separate');
});

test('fifth-shot contact conditioning uses actual incoming contacts before feasibility filtering and choice', () => {
  for (const style of ['pro', 'advanced', 'intermediate']) for (const incoming of [
    { family: 'volley', intent: 'counter' }, { family: 'volley', intent: 'block' }, { family: 'reset', intent: 'reset' },
  ]) {
    const settings = { contactIndex: 4, positions: { ...positions, player1: { x: 6, y: 4 }, player2: { x: 14, y: 4 } },
      priorDecisions: [{}, {}, { chosen: { family: 'drive', intent: 'third-shot-drive' } }], incoming,
      contact: { x: 6, y: 4, heightFeet: .9, kind: 'volley' }, affordances: { drive: true, volley: true } };
    const profile = resolveStyle(style), before = JSON.stringify(profile);
    const air = listIntentCandidatesV1(situation(settings), { profile });
    assert.equal(air.candidates.find(candidate => candidate.id === 'firm-volley').probability, .4);
    assert.ok(air.candidates.every(candidate => candidate.reasons.includes(`conditioning:${FIFTH_CONTACT_PRIORS_VERSION}`)
      && candidate.reasons.includes('profile-row:fifthDriveAir') && candidate.reasons.includes('contact-kind:volley')));
    const bounced = listIntentCandidatesV1(situation({ ...settings,
      contact: { ...settings.contact, kind: 'groundstroke' }, affordances: { drive: true, bounced: true } }), { profile });
    assert.equal(bounced.conditioning.profileRow, 'fifthDrive');
    assert.equal(bounced.candidates.some(candidate => candidate.id === 'firm-volley'), false);
    assert.equal(bounced.candidates.find(candidate => candidate.id === 'drop').probability, 66 / 69);
    const excluded = bounced.excluded.find(candidate => candidate.id === 'firm-volley');
    assert.equal(excluded.reason, 'no-volley-contact'); assert.equal(excluded.weight, 31);
    assert.ok(excluded.reasons.includes('contact-kind:groundstroke'));
    const filtered = listIntentCandidatesV1(situation(settings), { profile, availableCandidateIds: ['drop', 'drive', 'lob'] });
    assert.equal(filtered.candidates.some(candidate => candidate.id === 'firm-volley'), false);
    assert.equal(filtered.excluded.find(candidate => candidate.id === 'firm-volley').reason, 'candidate-flight-unavailable');
    assert.equal(filtered.candidates.find(candidate => candidate.id === 'drop').probability, 58 / 60);
    assert.equal(chooseIntentV1(filtered.candidates, .7).id, 'drop');
    assert.equal(JSON.stringify(profile), before);
  }
});

test('fifth air priors preserve flavour weights and do not condition later or third-drop contacts', () => {
  const source = situation({ contactIndex: 4, positions: { ...positions, player1: { x: 6, y: 4 }, player2: { x: 14, y: 4 } },
    priorDecisions: [{}, {}, { family: 'drive' }],
    contact: { x: 6, y: 4, heightFeet: .9, kind: 'volley' }, affordances: { drive: true, volley: true } });
  const banger = listIntentCandidatesV1(source, { profile: resolveStyle('pro', 'bangers') });
  assert.equal(banger.candidates.find(candidate => candidate.id === 'drop').weight, 58 * .75);
  assert.equal(banger.candidates.find(candidate => candidate.id === 'firm-volley').weight, 40);
  assert.equal(banger.candidates.find(candidate => candidate.id === 'drive').weight, 1.6);
  for (const patch of [{ contactIndex: 5 }, { priorThirdFamily: 'drop', priorThirdIntent: 'third-shot-drop' }]) {
    const other = listIntentCandidatesV1({ ...source, ...patch });
    assert.equal(other.conditioning, undefined);
    assert.ok(other.candidates.every(candidate => !candidate.reasons.some(reason => reason.startsWith('conditioning:'))));
  }
});

test('leaving an out flight is an audited defensive action and never an extra paddle contact', () => {
  const result = listIntentCandidatesV1(situation({ contactIndex: 3, incoming: { family: 'drive' }, affordances: { letGo: true } }));
  assert.equal(result.context, 'fourthDrive');
  const leave = result.candidates.find(candidate => candidate.id === 'let-go');
  assert.equal(leave.addsContact, false); assert.equal(leave.family, null);
  const noLeave = listIntentCandidatesV1(situation({ contactIndex: 3, incoming: { family: 'drive' } }));
  assert.ok(noLeave.excluded.some(candidate => candidate.id === 'let-go'));
});

test('signature candidates require explicit feasible geometry and established grounded feet', () => {
  const settings = { incoming: { family: 'dink', intent: 'cross-court-dink' }, affordances: { erne: true, aroundPost: true },
    feet: { player1: [{ x: -.7, y: 14 }, { x: -1.5, y: 14 }] },
    footState: { player1: { grounded: true, feetEstablishedOutsideNVZ: true } } };
  const source = situation(settings), enabled = listIntentCandidatesV1(source);
  assert.ok(enabled.candidates.some(candidate => candidate.id === 'erne'));
  assert.ok(enabled.candidates.some(candidate => candidate.id === 'around-the-post'));
  const disabled = listIntentCandidatesV1(source, { signatureShots: false });
  assert.equal(disabled.candidates.some(candidate => ['erne', 'around-the-post'].includes(candidate.id)), false);
  const noHistory = listIntentCandidatesV1(situation({ ...settings, footState: {} }));
  assert.ok(noHistory.excluded.some(candidate => candidate.id === 'erne' && candidate.reason === 'no-supported-grounded-erne'));
  const onLine = listIntentCandidatesV1(situation({ ...settings, feet: { player1: [{ x: 6, y: 15 }, { x: 7, y: 15 }] } }));
  assert.equal(onLine.candidates.some(candidate => candidate.id === 'erne'), false);
});

test('foot-reset facts normalize the actual production sampler field without accepting a legacy typo', () => {
  const document = readModel2Fixture('transition-volley'), compiled = compileDocument(document);
  const segment = compiled.timeline.segments[0], footState = sampleFeetStateV1(segment, segment.contactTime);
  const feet = Object.fromEntries(Object.entries(footState).map(([id, state]) => [id, state.feet]));
  const source = situation({ feet, footState });
  assert.equal(source.hitterFootState.grounded, true);
  assert.equal(footState.player1.feetEstablishedOutsideNVZ, true);
  assert.equal(source.hitterFootState.establishedOutsideNVZ, footState.player1.feetEstablishedOutsideNVZ);
  assert.equal(situation({ feet, footState: { player1: { grounded: true, establishedOutsideNVZ: true } } }).hitterFootState.establishedOutsideNVZ, false);
  assert.equal(situation({ feet, footState: { player1: { grounded: true, feetEstablishedOutsideNVZ: false, establishedOutsideNVZ: true } } }).hitterFootState.establishedOutsideNVZ, false);
  const invalid = readModel2Fixture('nvz-momentum-after-dead'), ending = compileDocument(invalid);
  const last = ending.timeline.segments.at(-1), laterState = sampleFeetStateV1(last, last.duration);
  const laterFeet = Object.fromEntries(Object.entries(laterState).map(([id, state]) => [id, state.feet]));
  const late = situation({ feet: laterFeet, footState: laterState });
  assert.equal(late.hitterFootState.establishedOutsideNVZ, false);
  assert.equal(late.hitterFootState.outsideNVZ, false);
});

test('unavailable flights are excluded before normalization and empty choices stay explicit', () => {
  const source = situation({ contact: { x: 6, y: 14, heightFeet: 3.5 }, affordances: { attack: true, lob: true } });
  const result = listIntentCandidatesV1(source, { availableCandidateIds: ['middle-dink', 'speed-up'] });
  assert.deepEqual(result.candidates.map(candidate => candidate.id), ['middle-dink', 'speed-up']);
  assert.ok(Math.abs(result.candidates.reduce((sum, candidate) => sum + candidate.probability, 0) - 1) < 1e-12);
  assert.ok(result.excluded.every(candidate => typeof candidate.reason === 'string'));
  const empty = listIntentCandidatesV1(source, { availableIntents: [] });
  assert.deepEqual(empty.candidates, []); assert.equal(empty.totalWeight, 0);
  assert.throws(() => chooseIntentV1(empty.candidates, .5), /No feasible/);
  assert.throws(() => listIntentCandidatesV1(source, { availableIntents: 'drive' }), /explicit array/);
});

test('stable candidate ordering and supplied draws give deterministic choices without mutation', () => {
  const source = situation({ affordances: { attack: true, lob: true } });
  const before = JSON.stringify(source), first = listIntentCandidatesV1(source), second = listIntentCandidatesV1(source);
  assert.deepEqual(first, second);
  assert.deepEqual(first.candidates.map(candidate => candidate.id), first.candidates.map(candidate => candidate.id).toSorted());
  assert.equal(chooseIntentV1(first.candidates, 0), first.candidates[0]);
  assert.equal(chooseIntentV1(first.candidates, 1 - Number.EPSILON), first.candidates.at(-1));
  for (const draw of [-.1, 1, Infinity, NaN]) assert.throws(() => chooseIntentV1(first.candidates, draw), RangeError);
  assert.equal(JSON.stringify(source), before);
});
