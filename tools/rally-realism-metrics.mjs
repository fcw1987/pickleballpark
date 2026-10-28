// Headless observation only. This module never changes a document or compiler.
import { FEET_TO_METERS, samplePlayState } from '../three-d-core.js';
import { COURT_DIMENSIONS } from '../court-geometry.js';

export const METRICS_VERSION = 'rally-realism-v1';
export const MEASUREMENT_POLICY = Object.freeze({
  positionModel: 'compiled logical player positions sampled at each contact',
  upDepthFeet: 12.5,
  upMeaning: 'at or beyond the approach threshold, on the player own half; not a foot-legality finding',
  splitMeaning: 'exactly one partner up; the other may be back or in transition',
  afterShot: 6,
  naturalEndEvidence: 'an explicit outcome, a compiled terminal event and no validation errors',
  censoring: 'fixed-count stop documents are right-censored; their counts are not natural rally lengths',
  timing: 'generation wall time only; compile and measurement time are separate',
});

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  const n = sorted.length;
  const quantile = q => {
    if (!n) return null;
    const i = (n - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  };
  return { n, mean: n ? sorted.reduce((a, b) => a + b, 0) / n : null,
    min: n ? sorted[0] : null, median: quantile(.5), p95: quantile(.95), max: n ? sorted.at(-1) : null };
}

const rate = (numerator, denominator, reason = null) => ({
  value: denominator ? numerator / denominator : null, numerator, denominator,
  unit: 'fraction', ...(denominator ? {} : { reason: reason ?? 'no eligible observations' }),
});
const unknown = reason => ({ value: null, numerator: null, denominator: 0, unit: 'fraction', reason });
const depth = (position, team) => team === 'green' ? position.y : 44 - position.y;
const isUp = (position, team) => position && depth(position, team) >= MEASUREMENT_POLICY.upDepthFeet && depth(position, team) < 22;
const terminalTypes = new Set(['dead', 'fault', 'out', 'second-bounce', 'net-touch']);

/** Extract facts from accepted compiled contacts, never from rejected recipes. */
export function observeRally({ document, compiled, rules, result = {}, seed, settings, generationMs = null }) {
  const sourceBefore = JSON.stringify(document);
  const errors = (compiled.findings ?? []).filter(f => f.severity === 'error');
  const violations = rules?.violations ?? [];
  const segments = compiled.timeline.segments.filter(s => s.shotSemantics);
  const contacts = segments.map((segment, index) => {
    const semantics = segment.shotSemantics;
    const time = segment.startTime + segment.contactTime;
    const sampled = samplePlayState(compiled.timeline, time);
    const positions = Object.fromEntries(Object.keys(document.players).map(id => [id, { ...sampled.positions[id] }]));
    const recipe = document.shots.find(shot => shot.id === segment.step.shot?.authoring?.recipeId) ?? document.shots[index];
    const family = segment.step.shot?.authoring?.family ?? recipe?.family ?? null;
    const teams = ['green', 'orange'].map(team => {
      const ids = Object.keys(document.players).filter(id => document.players[id].team === team);
      const up = ids.filter(id => isUp(positions[id], team)).length;
      return { team, up, players: ids.length, split: ids.length === 2 && up === 1 };
    });
    const hittingTeam = document.players[semantics.playerId].team;
    const opponent = teams.find(team => team.team !== hittingTeam);
    const netHeight = segment.trajectory?.netCrossingHeightMeters;
    return { ordinal: index + 1, shotId: recipe?.id ?? segment.step.id, time, family,
      hitter: semantics.playerId, hittingTeam, kind: semantics.contact.kind,
      contact: { ...semantics.contact.point }, positions, teams,
      allFourUp: teams.every(team => team.players === 2 && team.up === 2),
      opponentNotUp: opponent ? opponent.up < opponent.players : null,
      hitterUp: isUp(positions[semantics.playerId], hittingTeam),
      netClearanceInches: Number.isFinite(netHeight) ? (netHeight / FEET_TO_METERS - COURT_DIMENSIONS.netCenterHeightFeet) * 12 : null,
      // Intent/quality are not inferred from a family name or a nice trajectory.
      intent: segment.step.shot?.intent ?? null,
      incomingQuality: semantics.contact.incomingQuality ?? segments[index - 1]?.step.shot?.quality ?? null,
      pace: recipe?.pace ?? null };
  });
  const declared = result.outcome;
  const last = contacts.at(-1);
  const terminal = compiled.timeline.events.some(event => terminalTypes.has(event.type) && event.rallyLeg === segments.at(-1)?.rallyLeg);
  const outcomeKnown = !!(declared && ['green', 'orange'].includes(declared.winner) &&
    declared.shotId === last?.shotId && terminal && errors.length === 0 && violations.length === 0 &&
    compiled.validShotCount === document.shots.length && document.ending !== 'stop' && result.censored !== true && !result.incomplete);
  let run = 0, longestDinkRun = 0;
  for (const contact of contacts) { run = contact.family === 'dink' ? run + 1 : 0; longestDinkRun = Math.max(longestDinkRun, run); }
  if (JSON.stringify(document) !== sourceBefore) throw Error('Observation mutated its source document');
  const service = compiled.play.rally?.service ?? document.service ?? null;
  const servingTeam = document.opening === 'serve' && service?.server === contacts[0]?.hitter
    ? document.players[service.server]?.team ?? null : null;
  return { seed, settings, requestedShots: settings?.length ?? null, shots: contacts.length, incomplete: !!result.incomplete,
    censored: !outcomeKnown,
    censorReason: outcomeKnown ? null : result.incomplete ? 'generator reported incomplete' : document.ending === 'stop' ? 'fixed-count stop; natural outcome is not represented' : 'no validated compiled terminal-outcome evidence',
    outcome: outcomeKnown ? { ...declared } : null,
    service, servingTeam,
    validation: { acceptedShots: compiled.validShotCount, sourceShots: document.shots.length,
      compilerErrors: errors, ruleViolations: violations },
    firstAllFourUpShot: contacts.find(c => c.allFourUp)?.ordinal ?? null,
    longestDinkRun, generationMs, contacts };
}

export function summarizeObservations(observations) {
  const valid = observations.filter(o => o.validation.compilerErrors.length === 0 && o.validation.ruleViolations.length === 0 &&
    o.shots === o.validation.sourceShots && o.validation.acceptedShots === o.validation.sourceShots);
  const contacts = valid.flatMap(o => o.contacts);
  const natural = valid.filter(o => !o.censored);
  const thirds = valid.flatMap(o => o.contacts[2] ? [o.contacts[2]] : []);
  const thirdsDriveDrop = thirds.filter(c => ['drive', 'drop'].includes(c.family));
  const dinks = contacts.filter(c => c.family === 'dink');
  const lineDrives = contacts.filter(c => c.family === 'drive' && c.hitterUp);
  const teamOpportunities = contacts.filter(c => c.ordinal > MEASUREMENT_POLICY.afterShot).flatMap(c => c.teams);
  const lineRallies = valid.filter(o => o.firstAllFourUpShot !== null);
  const familyFlight = Object.fromEntries([...new Set(contacts.map(c => c.family))].sort().map(family => {
    const rows = contacts.filter(c => c.family === family);
    return [family, { contacts: rows.length, contactHeightFeet: distribution(rows.map(c => c.contact.heightFeet)),
      netClearanceInches: distribution(rows.map(c => c.netClearanceInches)) }];
  }));
  const serviceKnown = natural.filter(o => o.servingTeam);
  const receivingWins = serviceKnown.filter(o => o.outcome.winner !== o.servingTeam).length;
  const naturalThirds = natural.filter(o => o.contacts[2]);
  const driveRallies = naturalThirds.filter(o => o.contacts[2].family === 'drive');
  const serves = natural.filter(o => o.contacts[0]?.kind === 'serve');
  const fifthOpportunities = valid.filter(o => o.contacts[2]?.family === 'drive' && o.contacts[3]?.intent === 'block' && o.contacts[4]);
  const unknownFourthIntent = valid.filter(o => o.contacts[2]?.family === 'drive' && o.contacts[3] && o.contacts[3].intent === null).length;
  const knownQualityDrives = lineDrives.filter(c => ['low', 'neutral', 'attackable', 'excellent'].includes(c.incomingQuality));
  const unavailableOutcome = 'legacy fixed-count observations do not represent natural winners/errors/faults';
  return { denominators: { observedRallies: observations.length, validRallies: valid.length,
    invalidRallies: observations.length - valid.length, observedContacts: contacts.length,
    censoredRallies: valid.filter(o => o.censored).length, incompleteRallies: valid.filter(o => o.incomplete).length, naturalRallies: natural.length,
    thirdContacts: thirds.length, thirdDrivesOrDrops: thirdsDriveDrop.length,
    lineReachedRallies: lineRallies.length, postSixthTeamContacts: teamOpportunities.length,
    dinks: dinks.length, lineDrives: lineDrives.length, knownQualityLineDrives: knownQualityDrives.length,
    naturalThirds: naturalThirds.length, naturalDriveRallies: driveRallies.length,
    knownServiceNaturalRallies: serviceKnown.length, unknownFourthIntent },
  metrics: {
    naturalShotCount: distribution(natural.map(o => o.shots)),
    naturalNineShotsOrFewer: natural.length ? rate(natural.filter(o => o.shots <= 9).length, natural.length) : unknown(unavailableOutcome),
    naturalThirtyShotsOrMore: natural.length ? rate(natural.filter(o => o.shots >= 30).length, natural.length) : unknown(unavailableOutcome),
    observedShotCount: distribution(valid.map(o => o.shots)),
    allFourUpBeforeCensoring: rate(lineRallies.length, valid.length),
    firstAllFourUpShot: distribution(lineRallies.map(o => o.firstAllFourUpShot)),
    thirdDriveShareOfDriveDrop: rate(thirdsDriveDrop.filter(c => c.family === 'drive').length, thirdsDriveDrop.length),
    thirdLobShare: rate(thirds.filter(c => c.family === 'lob').length, thirds.length),
    thirdShotKeptInPlay: naturalThirds.length ? rate(naturalThirds.filter(o => o.shots > 3 || o.outcome.winner === o.contacts[2].hittingTeam).length, naturalThirds.length)
      : unknown('requires explicit terminal-outcome evidence; observed continuation is reported separately'),
    observedThirdHasFourthContact: rate(valid.filter(o => o.contacts.length >= 4).length, thirds.length),
    fifthAfterBlockedDrive: { drop: rate(fifthOpportunities.filter(o => o.contacts[4].family === 'drop').length, fifthOpportunities.length, 'no observed fifth contact after an explicitly identified block'),
      firmVolley: rate(fifthOpportunities.filter(o => o.contacts[4].family === 'volley' && o.contacts[4].pace === 'firm').length, fifthOpportunities.length), unknownFourthIntent },
    driveRalliesOverByFourth: driveRallies.length ? rate(driveRallies.filter(o => o.shots <= 4).length, driveRallies.length) : unknown(unavailableOutcome),
    receivingTeamWins: serviceKnown.length ? rate(receivingWins, serviceKnown.length) : unknown('no natural outcomes with explicit serving-team identity'),
    lobShare: rate(contacts.filter(c => c.family === 'lob').length, contacts.length),
    longestDinkRunAmongLineRallies: distribution(lineRallies.map(o => o.longestDinkRun)),
    teamSplitAfterSixth: rate(teamOpportunities.filter(team => team.split).length, teamOpportunities.length),
    dinksWhileOpponentNotUp: rate(dinks.filter(c => c.opponentNotUp === true).length, dinks.filter(c => c.opponentNotUp !== null).length),
    lineDrivesWithoutAttackableBall: knownQualityDrives.length ? rate(knownQualityDrives.filter(c => ['low', 'neutral'].includes(c.incomingQuality)).length, knownQualityDrives.length)
      : unknown('legacy contact height alone does not establish tactical quality or intent'),
    lineDriveBelowNetHeightProxy: rate(lineDrives.filter(c => c.contact.heightFeet <= COURT_DIMENSIONS.netCenterHeightFeet).length, lineDrives.length),
    serveFaults: serves.length ? rate(serves.filter(o => o.shots === 1 && o.outcome.winner !== o.contacts[0].hittingTeam).length, serves.length) : unknown(unavailableOutcome),
    ernesPerGame: { value: null, denominator: 0, reason: 'no games or verified Erne outcomes are represented' },
    aroundThePostPerGame: { value: null, denominator: 0, reason: 'no games or verified around-the-post outcomes are represented' },
    generationMs: distribution(valid.map(o => o.generationMs)),
    twelveShotGenerationMs: distribution(valid.filter(o => o.requestedShots === 12).map(o => o.generationMs)),
    familyFlight },
  measurementPolicy: MEASUREMENT_POLICY };
}
