// Versioned model-2 observations. Legacy rally-realism-v1 remains unchanged.
import { assessGeneratedFlightFeasibilityV1, GENERATED_FLIGHT_AUDIT_VERSION } from '../rally-flight-audit.js';
import { samplePlayState } from '../three-d-core.js';
import { PHYSICS_V2, localNetHeightFeet } from '../play-physics-v2.js';
import { distribution } from './rally-realism-metrics.mjs';

export const METRICS_VERSION_V2 = 'rally-realism-v2';
export const LINE_INITIATED_ATTACK_INTENTS_V2 = Object.freeze(['drive', 'third-shot-drive', 'speed-up', 'put-away']);
export const LINE_CONTROLLED_COUNTER_INTENTS_V2 = Object.freeze(['counter']);
export const CONTACT_SUPPORT_POLICY_V2 = Object.freeze({
  version: 'rally-contact-support-v1', generatorVersion: 'rally-engine-v1',
  scope: 'grounded generated model-2 contact height; not an official rule or import-validation restriction',
  maximumGroundedContactHeightFeet: 8.5, toleranceFeet: 1e-6,
});
export const MEASUREMENT_POLICY_V2 = Object.freeze({
  version: METRICS_VERSION_V2,
  positions: 'production logical actor positions sampled at each accepted contact',
  upDepthFeet: 12.5,
  upMeaning: 'own-half approach threshold, not certified foot legality',
  clearance: 'ball lower surface above local tape at the solved net crossing',
  incomingAffordance: 'actual contact height; execution-quality labels do not determine attackability',
  decisionEvidenceTime: 'first serve snapshots segment start before preparation; all other snapshots use the actual contact time; declared contact time must always match the physical contact',
  centerTapeReferenceFeet: 34 / 12,
  outcome: 'matching production expectedOutcomes, complete accepted source and explicit dead event',
  censoring: 'censored prefixes and failed selections remain visible and are excluded from natural outcome metrics',
  fifthShotCohort: 'all fifth contacts following a third-shot drive; blocked-drive subset separately reported',
  gameRates: 'not applicable until a game engine supplies games',
  lineAttackDiagnostics: 'initiated intents drive/third-shot-drive/speed-up/put-away and counter intent are reported separately; existing family-drive calibration is unchanged',
  contactSupport: CONTACT_SUPPORT_POLICY_V2,
});

const clone = value => structuredClone(value);
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
const ids = ['player1', 'player2', 'player3', 'player4'];
const teamDepth = (point, team) => team === 'green' ? point.y : 44 - point.y;
const up = (point, team) => point && teamDepth(point, team) >= 12.5 && teamDepth(point, team) < 22;
const finite = value => Number.isFinite(value);
const same = (a, b) => canonical(a) === canonical(b);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const rate = (numerator, denominator, reason = 'no eligible observations') => ({
  value: denominator ? numerator / denominator : null, numerator, denominator, unit: 'fraction',
  ...(denominator ? {} : { reason }),
});
const notApplicable = reason => ({ value: null, numerator: null, denominator: 0, status: 'NOT_APPLICABLE', reason });
export function heightAffordanceV2(heightFeet) {
  if (!finite(heightFeet) || heightFeet < 0) throw TypeError('A finite non-negative contact height is required');
  return heightFeet < 1.2 ? 'low' : heightFeet < 2.8 ? 'neutral' : heightFeet < 7 ? 'high' : 'overhead';
}
function expectedMatches(declared, candidate) {
  if (!declared || !candidate) return false;
  for (const key of ['winner', 'reason', 'shotId', 'ruleRef', 'faultingActor', 'struckActor']) if ((declared[key] ?? null) !== (candidate[key] ?? null)) return false;
  const point = candidate.evidencePosition ?? candidate.position;
  return point && ['x', 'y', 'heightFeet'].every(key => Math.abs(point[key] - declared.evidence?.position?.[key]) <= 1e-6)
    && Math.abs(candidate.afterContactSeconds - declared.evidence?.afterContactSeconds) <= 1e-6;
}

/** A generator-model height envelope, independent of rule acceptance. */
export function assessContactSupportV2(contacts, { generated = false, physicallyValid = true } = {}) {
  const policy = CONTACT_SUPPORT_POLICY_V2;
  if (!generated) return { status: 'NOT_APPLICABLE', policy, checkedContacts: 0, unsupportedContacts: 0, violations: [], reason: 'This diagnostic applies only to the grounded rally-engine-v1 model, not manual/model1 documents' };
  if (!physicallyValid || !contacts.length) return { status: 'NOT_EVALUATED', policy, checkedContacts: 0, unsupportedContacts: 0, violations: [], reason: 'No completely accepted physical contact sequence is available' };
  const violations = [];
  for (const contact of contacts) {
    const heightFeet = contact.contact?.heightFeet;
    if (!finite(heightFeet) || heightFeet < 0) throw TypeError('Contact support requires actual finite nonnegative compiled contact heights');
    if (heightFeet > policy.maximumGroundedContactHeightFeet + policy.toleranceFeet) violations.push({
      code: 'grounded-contact-above-supported-height', shotId: contact.shotId, ordinal: contact.ordinal,
      family: contact.family, intent: contact.intent, heightFeet, maximumHeightFeet: policy.maximumGroundedContactHeightFeet,
      groundedEvidence: contact.groundedEvidence ?? null,
      interpretation: 'Unsupported by this grounded generator model; not an official pickleball fault',
    });
  }
  return { status: violations.length ? 'FAIL' : 'PASS', policy, checkedContacts: contacts.length,
    unsupportedContacts: violations.length, maximumObservedHeightFeet: Math.max(...contacts.map(contact => contact.contact.heightFeet)), violations };
}

function lineActionDiagnostics(contacts, { intents = null, family = null } = {}) {
  const rows = contacts.filter(contact => contact.hitterUp && (family ? contact.family === family : intents.includes(contact.intent)));
  const matched = rows.filter(contact => contact.decisionEvidence?.matched === true && typeof contact.incomingAttackable === 'boolean');
  const above = rows.filter(contact => contact.aboveLocalTape);
  const available = matched.filter(contact => contact.incomingAttackable);
  const combined = available.filter(contact => contact.aboveLocalTape);
  return {
    ...(intents ? { intents: [...intents] } : { family }), contacts: rows.length,
    matchedPreChoiceContacts: matched.length, missingPreChoiceContacts: rows.length - matched.length,
    aboveLocalTapeContacts: above.length, atOrBelowLocalTapeContacts: rows.length - above.length,
    matchedAffordanceTrueContacts: available.length, matchedAffordanceFalseContacts: matched.length - available.length,
    matchedAboveTapeAndAffordanceContacts: combined.length,
    matchedPreChoiceEvidence: rate(matched.length, rows.length), aboveLocalTape: rate(above.length, rows.length),
    aboveTapeAndAffordance: rate(combined.length, rows.length),
    calibration: 'DIAGNOSTIC_ONLY; not substituted into the existing family-drive gate',
  };
}

/** The caller must use the real public document/compiler/rules boundaries. */
export function observeRallyV2({ document, compiled, rules, result, seed, settings = {}, generationMs = null, validationMs = null }) {
  if (!result || typeof result.status !== 'string') throw TypeError('An explicit engine result status is required');
  const source = document ? JSON.stringify(document) : null;
  const compilerErrors = compiled?.findings?.filter(item => item.severity === 'error') ?? [];
  const ruleViolations = rules?.violations ?? [];
  const accepted = !!document && document.modelVersion === 2 && document.physicsVersion === 'play-physics-v2'
    && compiled?.validShotCount === document.shots.length && compilerErrors.length === 0
    && rules?.valid === true && ruleViolations.length === 0;
  const contacts = accepted ? compiled.timeline.segments.filter(segment => segment.shotSemantics).map((segment, index) => {
    const semantics = segment.shotSemantics, time = segment.startTime + segment.contactTime;
    const sampled = samplePlayState(compiled.timeline, time);
    const recipe = document.shots.find(shot => shot.id === segment.step.shot.authoring?.recipeId) ?? document.shots[index];
    const positions = Object.fromEntries(ids.map(id => [id, { ...sampled.positions[id] }]));
    const teams = ['green', 'orange'].map(team => {
      const players = ids.filter(id => document.players[id].team === team);
      const atLine = players.filter(id => up(positions[id], team)).length;
      return { team, players: players.length, up: atLine, split: atLine === 1 };
    });
    const hittingTeam = document.players[semantics.playerId].team, opponent = teams.find(team => team.team !== hittingTeam);
    const decision = result.decisions?.find(item => item.shotId === recipe.id && item.situation?.contactIndex === index && item.situation?.hitter === semantics.playerId);
    const before = decision?.situation;
    const expectedSampleTime = index === 0 && document.opening === 'serve' && semantics.contact.kind === 'serve' ? segment.startTime : time;
    const evidenceTimeMatches = finite(before?.sampleTimeSeconds) && finite(before?.contactTimeSeconds)
      && Math.abs(before.sampleTimeSeconds - expectedSampleTime) <= 1e-6 && Math.abs(before.contactTimeSeconds - time) <= 1e-6;
    const evidencePositions = evidenceTimeMatches ? samplePlayState(compiled.timeline, expectedSampleTime).positions : null;
    const contactMatches = evidenceTimeMatches && before?.policyVersion === (document.generation?.policyVersion ?? 'rally-policy-v1') && ['x', 'y', 'heightFeet'].every(axis => Math.abs(before.contact?.[axis] - semantics.contact.point[axis]) <= 1e-6)
      && ids.every(id => ['x', 'y'].every(axis => Math.abs(before.positions?.[id]?.[axis] - evidencePositions[id][axis]) <= 1e-6));
    const incomingAttackable = contactMatches && typeof before.attackable === 'boolean' && before.affordances?.attack === before.attackable ? before.attackable : null;
    const crossing = compiled.timeline.events.find(event => event.type === 'net-crossing' && event.rallyLeg === segment.rallyLeg);
    const crossingX = crossing ? crossing.position.x / PHYSICS_V2.feetToMeters + 10 : null;
    const clearance = crossing && !crossing.aroundPost
      ? (crossing.position.y / PHYSICS_V2.feetToMeters - PHYSICS_V2.ballRadiusFeet - localNetHeightFeet(crossingX)) * 12 : null;
    return {
      ordinal: index + 1, shotId: recipe.id, time, hitter: semantics.playerId, hittingTeam,
      family: recipe.family, intent: recipe.intent ?? segment.step.shot.authoring?.intent ?? null,
      executionQuality: recipe.quality ?? null, pace: recipe.pace, kind: semantics.contact.kind,
      incomingAttackable, // Matched pre-choice shared-solver affordance; height alone remains a proxy.
      groundedEvidence: contactMatches && typeof before.hitterFootState?.grounded === 'boolean' ? before.hitterFootState.grounded : null,
      decisionEvidence: { sampleTimeSeconds: finite(before?.sampleTimeSeconds) ? before.sampleTimeSeconds : null,
        contactTimeSeconds: finite(before?.contactTimeSeconds) ? before.contactTimeSeconds : null, matched: !!contactMatches },
      contact: { ...semantics.contact.point }, heightAffordance: heightAffordanceV2(semantics.contact.point.heightFeet),
      aboveLocalTape: semantics.contact.point.heightFeet - PHYSICS_V2.ballRadiusFeet > localNetHeightFeet(semantics.contact.point.x),
      // This is a height observation, not a proof that an unchosen attacking flight exists.
      aroundPostCrossing: crossing?.aroundPost ?? false,
      positions, teams, allFourUp: teams.every(team => team.players === 2 && team.up === 2),
      opponentNotUp: opponent.up !== 2, hitterUp: up(positions[semantics.playerId], hittingTeam),
      netClearanceInches: clearance,
    };
  }) : [];
  const expected = accepted && document.outcome && same(result.outcome, document.outcome)
    ? rules.expectedOutcomes?.find(candidate => expectedMatches(document.outcome, candidate)) : null;
  const dead = expected && compiled.timeline.events.find(event => event.type === 'dead' && event.shotId === expected.shotId && event.reason === expected.reason);
  const complete = accepted && result.status === 'complete' && document.ending !== 'stop' && !!expected && !!dead;
  const censored = accepted && result.status === 'censored' && document.ending === 'stop' && !document.outcome && !result.outcome;
  const outcome = complete ? {
    ...clone(document.outcome), violationOccurrenceTime: expected.violationOccurrenceTime ?? expected.time,
    evidenceObservedTime: expected.evidenceObservedTime ?? expected.time,
    physicalDeadTime: expected.physicalDeadTime ?? dead.time,
  } : null;
  const sourceUnchanged = source === (document ? JSON.stringify(document) : null);
  if (!sourceUnchanged) throw Error('Observation mutated the source document');
  let run = 0, longestDinkRun = 0;
  for (const contact of contacts) { run = contact.family === 'dink' ? run + 1 : 0; longestDinkRun = Math.max(longestDinkRun, run); }
  const service = document?.service ?? compiled?.play?.rally?.service ?? null;
  const generated = document?.generation?.mode === 'engine' && document.generation.generatorVersion === CONTACT_SUPPORT_POLICY_V2.generatorVersion;
  const modelSupport = assessContactSupportV2(contacts, { generated, physicallyValid: accepted });
  return {
    seed, settings: clone(settings), status: result.status,
    physicallyValid: accepted, accepted: accepted && (complete || censored), complete, censored,
    documentPresent: !!document, shots: contacts.length, sourceShots: document?.shots?.length ?? null,
    modelSupport,
    generatedFlightFeasibility: assessGeneratedFlightFeasibilityV1({ document, compiled }),
    outcome, outcomeClassification: result.outcomeClassification ? clone(result.outcomeClassification) : null,
    service: service ? clone(service) : null,
    servingTeam: service?.server ? document?.players?.[service.server]?.team ?? null : null,
    firstAllFourUpShot: contacts.find(contact => contact.allFourUp)?.ordinal ?? null, longestDinkRun,
    generationMs, validationMs,
    attempts: result.recipe?.selection?.attempts ?? result.diagnostics?.attempts ?? document?.generation?.selection?.attempts ?? null,
    selectedAttempt: result.recipe?.selection?.selectedAttempt ?? document?.generation?.selection?.selectedAttempt ?? null,
    conditioned: (settings.options?.lengthFeel ?? result.recipe?.input?.options?.lengthFeel ?? 'natural') !== 'natural'
      || (settings.options?.winner ?? result.recipe?.input?.options?.winner ?? 'either') !== 'either',
    validation: { acceptedShots: compiled?.validShotCount ?? null, compilerErrors, ruleViolations, outcomeMatched: !!expected, terminalMatched: !!dead, sourceUnchanged },
    contacts,
  };
}

export function summarizeObservationsV2(observations) {
  const valid = observations.filter(row => row.accepted), natural = valid.filter(row => row.complete && !row.conditioned);
  const contacts = natural.flatMap(row => row.contacts), thirds = natural.filter(row => row.contacts[2]);
  const thirdContacts = thirds.map(row => row.contacts[2]);
  const driveDrop = thirdContacts.filter(contact => ['drive', 'drop'].includes(contact.family));
  const line = natural.filter(row => row.firstAllFourUpShot !== null);
  const dinks = contacts.filter(contact => contact.family === 'dink');
  const drivesAtLine = contacts.filter(contact => contact.family === 'drive' && contact.hitterUp);
  const attackabilityKnown = drivesAtLine.filter(contact => typeof contact.incomingAttackable === 'boolean');
  const teamOpportunities = contacts.filter(contact => contact.ordinal > 6).flatMap(contact => contact.teams);
  const thirdDrives = thirds.filter(row => row.contacts[2].family === 'drive');
  const fifths = thirdDrives.filter(row => row.contacts[4]);
  const blockedFifths = fifths.filter(row => row.contacts[3].intent === 'block');
  const serviceKnown = natural.filter(row => row.servingTeam);
  const serves = natural.filter(row => row.contacts[0]?.kind === 'serve');
  const familyFlight = Object.fromEntries([...new Set(contacts.map(contact => contact.family))].sort().map(family => {
    const rows = contacts.filter(contact => contact.family === family);
    return [family, { contacts: rows.length, contactHeightFeet: distribution(rows.map(contact => contact.contact.heightFeet)),
      lowerSurfaceLocalTapeClearanceInches: distribution(rows.map(contact => contact.netClearanceInches)) }];
  }));
  const fifthMetric = rows => ({ drop: rate(rows.filter(row => row.contacts[4].family === 'drop').length, rows.length),
    firmVolley: rate(rows.filter(row => row.contacts[4].family === 'volley' && row.contacts[4].pace === 'firm').length, rows.length) });
  const timing = rows => ({ all: distribution(rows.map(row => row.generationMs)),
    twelveContacts: distribution(rows.filter(row => row.shots === 12).map(row => row.generationMs)),
    twelveContactRallies: rows.filter(row => row.shots === 12).length });
  const supportRows = observations.filter(row => row.modelSupport && row.modelSupport.status !== 'NOT_APPLICABLE');
  const supportViolations = supportRows.flatMap(row => row.modelSupport.violations.map(violation => ({ seed: row.seed, ...violation })));
  const checkedSupportRows = supportRows.filter(row => ['PASS', 'FAIL'].includes(row.modelSupport.status));
  const modelSupport = { status: supportViolations.length ? 'FAIL' : checkedSupportRows.length ? 'PASS' : supportRows.length ? 'NOT_EVALUATED' : 'NOT_APPLICABLE',
    policy: CONTACT_SUPPORT_POLICY_V2, checkedRallies: checkedSupportRows.length,
    checkedContacts: checkedSupportRows.reduce((sum, row) => sum + row.modelSupport.checkedContacts, 0),
    unsupportedContacts: supportViolations.length, violations: supportViolations };
  const feasibilityRows = observations.map(row => ({ row, audit: row.generatedFlightFeasibility ?? {
    status: 'NOT_EVALUATED', checkedFlights: 0, violations: [], flights: [],
  } }));
  const checkedFeasibility = feasibilityRows.filter(({ audit }) => ['PASS', 'FAIL'].includes(audit.status));
  const feasibilityViolations = feasibilityRows.flatMap(({ row, audit }) => audit.violations.map(violation => ({ seed: row.seed, ...violation })));
  const feasibilityFlights = checkedFeasibility.flatMap(({ audit }) => audit.flights);
  const generatedFlightFeasibility = {
    version: GENERATED_FLIGHT_AUDIT_VERSION,
    status: feasibilityRows.some(({ audit }) => audit.status === 'FAIL') ? 'FAIL'
      : !feasibilityRows.length || feasibilityRows.some(({ audit }) => audit.status === 'NOT_EVALUATED') ? 'NOT_EVALUATED'
      : checkedFeasibility.length ? 'PASS' : 'NOT_APPLICABLE',
    attemptedRallies: observations.length, checkedRallies: checkedFeasibility.length,
    checkedFlights: checkedFeasibility.reduce((sum, { audit }) => sum + audit.checkedFlights, 0),
    statusCounts: Object.fromEntries(['PASS', 'FAIL', 'NOT_EVALUATED', 'NOT_APPLICABLE'].map(status => [status, feasibilityRows.filter(({ audit }) => audit.status === status).length])),
    families: Object.fromEntries([...new Set(feasibilityFlights.map(flight => flight.family))].sort().map(family => {
      const rows = feasibilityFlights.filter(flight => flight.family === family);
      return [family, { checkedFlights: rows.length, passedFlights: rows.filter(flight => flight.status === 'PASS').length,
        failedFlights: rows.filter(flight => flight.status === 'FAIL').length,
        launchSpeedMph: distribution(rows.map(flight => flight.launchSpeedMph)) }];
    })),
    violations: feasibilityViolations,
  };
  return {
    modelSupport,
    generatedFlightFeasibility,
    diagnostics: {
      status: 'DIAGNOSTIC_ONLY; existing calibration bands and denominators remain unchanged',
      scope: 'Valid unconditioned complete natural-rally contacts; model-support checks separately include censored and conditioned outputs',
      lineInitiatedAttacks: lineActionDiagnostics(contacts, { intents: LINE_INITIATED_ATTACK_INTENTS_V2 }),
      lineControlledCounters: lineActionDiagnostics(contacts, { intents: LINE_CONTROLLED_COUNTER_INTENTS_V2 }),
      familyDriveSubset: lineActionDiagnostics(contacts, { family: 'drive' }),
    },
    denominators: {
      attemptedRallies: observations.length, validDocuments: valid.length, invalidOrMissing: observations.length - valid.length,
      naturalCompleteRallies: natural.length, conditionedCompleteRallies: valid.filter(row => row.complete && row.conditioned).length,
      censoredRallies: valid.filter(row => row.censored).length, observedNaturalContacts: contacts.length,
      thirdContacts: thirdContacts.length, thirdDrivesOrDrops: driveDrop.length, naturalDriveRallies: thirdDrives.length,
      fifthAfterDrive: fifths.length, fifthAfterBlockedDrive: blockedFifths.length,
      lineReachedRallies: line.length, postSixthTeamContacts: teamOpportunities.length,
      dinks: dinks.length, lineDrives: drivesAtLine.length, lineDrivesWithAttackabilityEvidence: attackabilityKnown.length, knownServiceRallies: serviceKnown.length,
    },
    classificationCounts: Object.fromEntries(['winner', 'forced-error', 'unforced-error', 'rule-fault', 'unknown'].map(kind => [kind, natural.filter(row => (row.outcomeClassification?.kind ?? 'unknown') === kind).length])),
    resultStatuses: Object.fromEntries(['complete', 'censored', 'unsatisfied', 'cancelled', 'failed'].map(status => [status, observations.filter(row => row.status === status).length])),
    metrics: {
      naturalShotCount: distribution(natural.map(row => row.shots)),
      naturalNineShotsOrFewer: rate(natural.filter(row => row.shots <= 9).length, natural.length),
      naturalThirtyShotsOrMore: rate(natural.filter(row => row.shots >= 30).length, natural.length),
      allFourUp: rate(line.length, natural.length),
      firstAllFourUpShot: distribution(line.map(row => row.firstAllFourUpShot)),
      thirdDriveShareOfDriveDrop: rate(driveDrop.filter(contact => contact.family === 'drive').length, driveDrop.length),
      thirdLobShare: rate(thirdContacts.filter(contact => contact.family === 'lob').length, thirdContacts.length),
      thirdShotKeptInPlay: rate(thirds.filter(row => row.outcome.shotId !== row.contacts[2].shotId || row.outcome.winner === row.contacts[2].hittingTeam).length, thirds.length),
      fifthAfterDrive: fifthMetric(fifths), fifthAfterBlockedDrive: fifthMetric(blockedFifths),
      driveRalliesOverByFourth: rate(thirdDrives.filter(row => row.shots <= 4).length, thirdDrives.length),
      receivingTeamWins: rate(serviceKnown.filter(row => row.outcome.winner !== row.servingTeam).length, serviceKnown.length),
      lobShare: rate(contacts.filter(contact => contact.family === 'lob').length, contacts.length),
      longestDinkRunAmongLineRallies: distribution(line.map(row => row.longestDinkRun)),
      teamSplitAfterSixth: rate(teamOpportunities.filter(team => team.split).length, teamOpportunities.length),
      dinksWhileOpponentNotUp: rate(dinks.filter(contact => contact.opponentNotUp).length, dinks.length),
      lineDrivesWithoutAttackableBall: rate(attackabilityKnown.filter(contact => !contact.incomingAttackable).length, attackabilityKnown.length, 'no matched pre-choice feasible-attack evidence'),
      lineDrivesWithoutAboveTapeContact: rate(drivesAtLine.filter(contact => !contact.aboveLocalTape).length, drivesAtLine.length),
      serveFaults: rate(serves.filter(row => row.outcome.shotId === row.contacts[0].shotId && row.outcome.faultingActor === row.contacts[0].hitter).length, serves.length),
      ernesPerGame: notApplicable('M2 observes rallies, not games'), aroundThePostPerGame: notApplicable('M2 observes rallies, not games'),
      generationTiming: { natural: timing(valid.filter(row => !row.conditioned && row.complete)), conditioned: timing(valid.filter(row => row.conditioned && row.complete)),
        censored: timing(valid.filter(row => row.censored)), failedOrMissing: timing(observations.filter(row => !row.accepted)) },
      attempts: distribution(observations.map(row => row.attempts)),
      independentValidationMs: distribution(observations.map(row => row.validationMs)),
      familyFlight,
    },
    measurementPolicy: MEASUREMENT_POLICY_V2,
  };
}

export const CALIBRATION_BANDS_V2 = deepFreeze({
  pro: { mean: [9, 11], nine: [.5, .62], thirty: [.02, .05], up: [.55, .7], drive: [.35, .45], thirdLob: [0, .03, true], thirdKept: [.92, 1], earlyDrive: [0, .2, true], receiving: [.55, .65], lob: [0, .05, true], dink: [4, Infinity], split: [0, .15, true], dinkBack: [0, .1, true], lineDrive: [0, .02, true], serve: [0, .02, true] },
  advanced: { mean: [6.8, 7.8], nine: [.65, .75], thirty: [0, .02, true], up: [.4, .55], drive: [.44, .52], thirdLob: [0, .03, true], thirdKept: [.85, 1], earlyDrive: [0, .3, true], receiving: [.55, .65], lob: [0, .07, true], dink: [3, Infinity], split: [0, .2, true], dinkBack: [0, .15, true], lineDrive: [0, .04, true], serve: [0, .03, true] },
  intermediate: { mean: [6, 7], nine: [.7, .8], thirty: [0, .01, true], up: [.3, .45], drive: [.44, .54], thirdLob: [0, .05, true], thirdKept: [.8, 1], earlyDrive: [0, .35, true], receiving: [.5, .6], lob: [0, .09, true], dink: [2, Infinity], split: [0, .3, true], dinkBack: [0, .2, true], lineDrive: [0, .06, true], serve: [0, .05, true] },
});

/** Numerical bands are unchanged; insufficient conditional cohorts never pass. */
export function evaluateCalibrationV2(summary, { style, expectedRallies = 300, minConditionalSamples = 10, minPerformanceSamples = 10 } = {}) {
  const bands = CALIBRATION_BANDS_V2[style];
  if (!bands) return { status: 'NOT_APPLICABLE', style, reason: 'No numerical acceptance bands exist for this style/flavour cohort', gates: [] };
  const m = summary.metrics, d = summary.denominators;
  const gates = [];
  const add = (name, observation, band, { min = minConditionalSamples, field = 'value' } = {}) => {
    const count = observation.denominator ?? observation.n ?? 0, value = observation[field];
    const sufficient = count >= min && finite(value);
    const inside = sufficient && value >= band[0] && (band[2] ? value < band[1] : value <= band[1]);
    gates.push({ name, status: !sufficient ? 'INSUFFICIENT_SAMPLE' : inside ? 'PASS' : 'FAIL', value: finite(value) ? value : null,
      numerator: observation.numerator ?? null, denominator: count, minimumSamples: min,
      band: { minimum: band[0], maximum: finite(band[1]) ? band[1] : null, exclusiveMaximum: !!band[2] } });
  };
  gates.push({ name: 'completeNaturalCorpus', status: d.naturalCompleteRallies === expectedRallies && d.invalidOrMissing === 0 && d.censoredRallies === 0 && d.conditionedCompleteRallies === 0 ? 'PASS' : 'FAIL', value: d.naturalCompleteRallies, expectedRallies });
  gates.push({ name: 'lineDriveAffordanceEvidence', status: d.lineDrives >= minConditionalSamples && d.lineDrivesWithAttackabilityEvidence === d.lineDrives ? 'PASS' : 'INSUFFICIENT_SAMPLE',
    denominator: d.lineDrives, matchedContacts: d.lineDrivesWithAttackabilityEvidence, minimumSamples: minConditionalSamples, reason: 'All line-drive contacts need matched pre-choice geometry and feasible-attack evidence' });
  add('meanShots', m.naturalShotCount, bands.mean, { min: expectedRallies, field: 'mean' });
  for (const [name, metric, band] of [
    ['nineShotsOrFewer', m.naturalNineShotsOrFewer, bands.nine], ['thirtyShotsOrMore', m.naturalThirtyShotsOrMore, bands.thirty],
    ['allFourUp', m.allFourUp, bands.up], ['thirdDriveShare', m.thirdDriveShareOfDriveDrop, bands.drive],
    ['thirdLobShare', m.thirdLobShare, bands.thirdLob], ['thirdShotKeptInPlay', m.thirdShotKeptInPlay, bands.thirdKept],
    ['fifthAfterDriveDrop', m.fifthAfterDrive.drop, [.55, .75]], ['fifthAfterDriveFirmVolley', m.fifthAfterDrive.firmVolley, [.25, .4]],
    ['driveRalliesOverByFourth', m.driveRalliesOverByFourth, bands.earlyDrive], ['receivingTeamWins', m.receivingTeamWins, bands.receiving],
    ['lobShare', m.lobShare, bands.lob], ['teamSplitAfterSixth', m.teamSplitAfterSixth, bands.split],
    ['dinksWhileOpponentBack', m.dinksWhileOpponentNotUp, bands.dinkBack], ['lineDrivesWithoutAttackableBall', m.lineDrivesWithoutAttackableBall, bands.lineDrive], ['serveFaults', m.serveFaults, bands.serve],
  ]) add(name, metric, band);
  add('longestDinkRunMedian', m.longestDinkRunAmongLineRallies, bands.dink, { field: 'median' });
  add('twelveContactGenerationMedianMs', m.generationTiming.natural.twelveContacts, [0, 50, true], { min: minPerformanceSamples, field: 'median' });
  add('twelveContactGenerationP95Ms', m.generationTiming.natural.twelveContacts, [0, 100, true], { min: minPerformanceSamples, field: 'p95' });
  return { status: gates.some(gate => gate.status === 'FAIL') ? 'FAIL' : gates.some(gate => gate.status === 'INSUFFICIENT_SAMPLE') ? 'INSUFFICIENT_SAMPLE' : 'PASS', style,
    policy: { expectedRallies, minConditionalSamples, minPerformanceSamples, naturalUnconditionedOnly: true }, gates,
    notApplicable: { ernesPerGame: m.ernesPerGame, aroundThePostPerGame: m.aroundThePostPerGame } };
}
