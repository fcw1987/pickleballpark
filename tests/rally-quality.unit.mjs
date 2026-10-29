import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPressureV1, sampleExecutionV1, applyExecutionV1, resolveDeliveredFlightV1, classifyOutcomeV1, FORMATION_PRESSURE_VERSION, PHYSICAL_TRANSFORMATION_VERSION, RISK_CONTEXT_VERSION } from '../rally-quality.js';
import { resolveStyle } from '../rally-styles.js';
import { solveFlightV2, solveFlightForClearanceV2, sampleFlightVelocityV2, interceptFlightV2, localNetHeightFeet, PHYSICS_V2 } from '../play-physics-v2.js';
import { contactFeetV1 } from '../rally-movement.js';
import { resolveFlightParametersV1 } from '../rally-targets.js';
import { isInNonVolleyZone } from '../court-geometry.js';
// Execution constructs preferences only; every physical assertion below uses
// the delivered planner and then an independent authoritative replay solve.
function applyAndResolve(input) {
  const applied=applyExecutionV1(input);
  return resolveDeliveredFlightV1({candidate:{family:input.family??'drive',intent:input.intent??input.family??'drive'},
    contact:input.contact,team:input.team,execution:input.execution,style:input.style??'advanced',applied}).applied;
}
const profile = { execution: { kitchen: { error: .1, attackable: .1, excellent: .1, low: .1 } }, pressureErrorScale: .2, errorWeights: { net: .5, long: .3, wide: .2 } };
const outcome = { type: 'fault', reason: 'net', shotId: 'shot-7', faultingActor: 'player1' };

test('pressure derives from actual reach, time, motion and incoming speed rather than execution labels', () => {
  const easy = assessPressureV1({ contact: { x: 7, y: 14, heightFeet: 2 }, position: { x: 7, y: 14 }, availableSeconds: 1 });
  const hard = assessPressureV1({ contact: { x: 14, y: 14, heightFeet: .7 }, position: { x: 7, y: 14 }, availableSeconds: .25,
    incomingFlight: { launchSpeedMph: 40 }, incomingIntent: 'speed-up', movementSpeedFeetPerSecond: 12 });
  assert.ok(hard.score > easy.score); assert.ok(hard.reachMarginFeet < easy.reachMarginFeet);
  assert.equal(hard.reachable, false); assert.equal(hard.contactHeightFeet, .7); assert.equal(hard.incomingSpeedMph, 40);
});

test('supplied execution draws are deterministic, bounded and cannot mutate the input pressure', () => {
  const situation = { phase: 'kitchen', pressure: { score: .5, availableSeconds: .3 } }, before = JSON.stringify(situation);
  const a = sampleExecutionV1({ profile, situation, draws: { quality: .05, error: .9 } });
  const b = sampleExecutionV1({ profile, situation, draws: { quality: .05, error: .9 } });
  assert.deepEqual(a, b); assert.equal(a.quality, 'error'); assert.equal(a.errorReason, 'wide');
  assert.equal(JSON.stringify(situation), before); assert.equal(Object.isFrozen(situation.pressure), false);
  assert.ok(Math.abs(Object.values(a.probabilities).reduce((x, y) => x + y) - 1) < 1e-9);
  for (const bad of [-1, 1, NaN]) assert.throws(() => sampleExecutionV1({ profile, situation, draws: { quality: bad, error: .5 } }), /draw/);
});

test('neutral receives unallocated probability and pressure increases risk without exceeding 1', () => {
  const low = sampleExecutionV1({ profile, situation: { phase: 'kitchen', pressure: { score: 0 } }, draws: { quality: .9 } });
  const high = sampleExecutionV1({ profile, situation: { phase: 'kitchen', pressure: { score: 1 } }, draws: { quality: .9 } });
  assert.equal(low.quality, 'neutral'); assert.ok(high.probabilities.error > low.probabilities.error);
  assert.ok(Object.values(high.probabilities).every(p => p >= 0 && p <= 1));
  assert.throws(() => sampleExecutionV1({ profile: { execution: { kitchen: { error: .8, excellent: .5 } } }, draws: { quality: .5 } }), /probabilities/);
});

test('error perturbations produce source parameters whose actual solver can demonstrate net, long and wide', () => {
  for (const team of ['green', 'orange']) for (const reason of ['net', 'long', 'wide']) {
    const contact = { x: 7, y: team === 'green' ? 14 : 30, heightFeet: 2.2 }, target = { x: 7, y: team === 'green' ? 35 : 9 };
    const result = applyAndResolve({ execution: { quality: 'error', errorReason: reason }, contact, target, team,
      physics: { apexFeet: 6 }, draws: { lateral: .6, depth: .5 } });
    const solved = solveFlightV2({ from: contact, target: result.target, family: 'drive', physics: result.physics });
    assert.equal(result.intendedError, reason);
    if (reason === 'net') assert.equal(solved.terminal.reason, 'net');
    if (reason === 'long') assert.ok(solved.landing.y < 0 || solved.landing.y > 44);
    if (reason === 'wide') assert.ok(solved.landing.x < 0 || solved.landing.x > 20);
  }
});

test('execution never overwrites contact height or manufactures an outcome', () => {
  const contact = { x: 7, y: 14, heightFeet: 4.1 }, target = { x: 8, y: 32 }, before = JSON.stringify({ contact, target });
  const result = applyAndResolve({ execution: { quality: 'attackable', errorReason: null }, contact, target, team: 'green', physics: { apexFeet: 5 }, draws: { lateral: .5, depth: .5 } });
  assert.equal(result.preferredFlight.apexFeet, 5.6); assert.equal(JSON.stringify({ contact, target }), before);
  assert.equal('outcome' in result, false); assert.equal('heightFeet' in result, false);
  assert.throws(() => applyAndResolve({ execution: { quality: 'error' }, contact, target, team: 'green', draws: { lateral: .5, depth: .5 } }), /reason/);
});

test('a quality roll alone is insufficient evidence of forced causation', () => {
  const unknown = classifyOutcomeV1({ outcome, execution: { quality: 'error' } });
  assert.equal(unknown.kind, 'unknown'); assert.equal(unknown.version, 'rally-causation-v1'); assert.equal(unknown.evidence.heuristic, true);
  const vague = classifyOutcomeV1({ outcome, execution: { quality: 'error' }, pressure: { score: 1 }, pressureDecisionId: 'previous', previousIntent: 'speed-up' });
  assert.equal(vague.kind, 'unknown');
  const forced = classifyOutcomeV1({ outcome, pressureDecisionId: 'decision-6', previousIntent: 'speed-up', pressure: {
    score: .8, reachMarginFeet: .7, availableSeconds: .25, movementSpeedFeetPerSecond: 10, incomingSpeedMph: 38, contactHeightFeet: .8,
  } });
  assert.equal(forced.kind, 'forced-error'); assert.equal(forced.pressureDecisionId, 'decision-6'); assert.equal(forced.actor, 'player1');
  assert.deepEqual(outcome, { type: 'fault', reason: 'net', shotId: 'shot-7', faultingActor: 'player1' });
});

test('unforced errors require represented low pressure and rule faults stay separate', () => {
  const pressure = { score: .1, reachMarginFeet: 4, availableSeconds: 1, movementSpeedFeetPerSecond: 0, incomingSpeedMph: 10, contactHeightFeet: 2 };
  assert.equal(classifyOutcomeV1({ outcome, pressure, execution: { quality: 'error' } }).kind, 'unforced-error');
  assert.equal(classifyOutcomeV1({ outcome, pressure, execution: { quality: 'excellent' } }).kind, 'unknown');
  assert.equal(classifyOutcomeV1({ outcome: { ...outcome, reason: 'nvz-foot' }, pressure }).kind, 'rule-fault');
  const winner = classifyOutcomeV1({ outcome: { ...outcome, type: 'winner', reason: 'unreachable', faultingActor: null }, actor: 'player2' });
  assert.equal(winner.kind, 'winner'); assert.equal(winner.actor, 'player2');
});


test('missing actual geometry and unknown phases fail rather than inventing neutral inputs', () => {
  assert.throws(() => assessPressureV1({ contact: { x: 7, y: 14 }, position: { x: 7, y: 14 } }), /actual.*height/);
  assert.throws(() => sampleExecutionV1({ profile, situation: { phase: 'invented' }, draws: { quality: .5 } }), /phase/);
});

test('net-error execution uses coherent shared mesh contact even just above the ball radius', () => {
  for (const team of ['green', 'orange']) for (const ownDepth of [5, 14.25]) for (const heightFeet of [.12140107611548556, .13, 2.2, 7.5, 18, 30]) {
    const contact = { x: 7, y: team === 'green' ? ownDepth : 44 - ownDepth, heightFeet };
    const target = { x: 10, y: team === 'green' ? 35 : 9 }, execution = { quality: 'error', errorReason: 'net' };
    const before = JSON.stringify({ contact, target, execution });
    const result = applyAndResolve({ execution, contact, target, team, physics: { apexFeet: 30 }, draws: { lateral: .5, depth: .5 } });
    const solved = solveFlightV2({ from: contact, target: result.target, family: 'drive', quality: result.quality, physics: result.physics });
    assert.equal(solved.obstruction.kind, 'net'); assert.equal(solved.terminal.reason, 'net');
    assert.ok(solved.launchSpeedMph < 50, `${team}/${ownDepth}/${heightFeet}: ${solved.launchSpeedMph}mph`);
    assert.ok(solved.metadata.apexFeet <= 30); assert.ok(solved.totalDuration > .02);
    assert.ok(team === 'green' ? result.target.y > 22 : result.target.y < 22);
    assert.ok(Math.abs(result.target.y - 22) <= .6 + 1e-9);
    assert.equal(result.quality, 'error'); assert.equal(JSON.stringify({ contact, target, execution }), before);
    assert.equal('outcome' in result, false);
  }
});

test('an unavailable bounded net solve fails without changing source quality or inventing a terminal outcome', () => {
  const input = { execution: { quality: 'error', errorReason: 'net' }, contact: { x: 7, y: 21.5, heightFeet: 30 },
    target: { x: 10, y: 35 }, team: 'green', draws: { lateral: .5, depth: .5 } };
  const before = JSON.stringify(input);
  assert.throws(() => applyAndResolve(input), /Delivered flight unavailable/);
  assert.equal(JSON.stringify(input), before);
});

test('self-paced serve preparation retains real facts without incoming reaction-time pressure', () => {
  const source = { contact: { x: 5, y: -.75, heightFeet: 2.2 }, position: { x: 5, y: -.75 }, availableSeconds: .2 };
  const reactive = assessPressureV1(source), selfPaced = assessPressureV1({ ...source, selfPaced: true });
  assert.deepEqual(assessPressureV1({ ...source, selfPaced: false }), reactive);
  assert.ok(reactive.score > 0); assert.equal(selfPaced.score, 0);
  assert.equal(selfPaced.availableSeconds, .2); assert.equal(selfPaced.contactHeightFeet, 2.2);
  assert.equal(selfPaced.reachMarginFeet, reactive.reachMarginFeet); assert.equal(selfPaced.distanceFeet, reactive.distanceFeet);
  assert.equal(selfPaced.reachable, reactive.reachable); assert.equal(selfPaced.selfPaced, true);
  assert.equal(selfPaced.factors.reachLoad, 0); assert.equal(selfPaced.factors.shortTime, 0);
  assert.throws(() => assessPressureV1({ ...source, selfPaced: 'true' }), /boolean/);
});

test('court control adds bounded pressure for a back or split pair against opponents up in mirrored courts', () => {
  for (const y of [4, 40]) {
    const source = { contact: { x: 7, y, heightFeet: 2 }, position: { x: 7, y }, availableSeconds: 1 };
    const easy = assessPressureV1(source);
    for (const [ownFormation, load] of [['back', .25], ['split', .12], ['up', 0]]) {
      const actual = assessPressureV1({ ...source, ownFormation, opponentFormation: 'up' });
      assert.equal(actual.score, easy.score + load);
      assert.deepEqual(actual.formation, { version: FORMATION_PRESSURE_VERSION, ownFormation, opponentFormation: 'up', pressureLoad: load });
      assert.equal(actual.factors.formationLoad, load);
      for (const key of ['reachMarginFeet', 'distanceFeet', 'reachable', 'availableSeconds', 'movementSpeedFeetPerSecond', 'contactHeightFeet', 'incomingSpeedMph']) assert.equal(actual[key], easy[key]);
      assert.equal(Object.isFrozen(actual.formation), true);
    }
    for (const opponentFormation of ['back', 'split']) assert.equal(assessPressureV1({ ...source, ownFormation: 'back', opponentFormation }).score, easy.score);
  }
  const overloaded = assessPressureV1({ contact: { x: 14, y: 14, heightFeet: 0 }, position: { x: 7, y: 14 }, availableSeconds: 0,
    movementSpeedFeetPerSecond: 14, incomingFlight: { launchSpeedMph: 45 }, incomingIntent: 'speed-up', ownFormation: 'back', opponentFormation: 'up' });
  assert.equal(overloaded.score, 1);
});

test('unavailable formation preserves existing pressure and unsupported formation fails explicitly', () => {
  const source = { contact: { x: 7, y: 14, heightFeet: 2 }, position: { x: 7, y: 14 }, availableSeconds: 1 };
  const baseline = assessPressureV1(source);
  assert.deepEqual(assessPressureV1({ ...source, ownFormation: null, opponentFormation: null }), baseline);
  assert.deepEqual(assessPressureV1({ ...source, ownFormation: undefined, opponentFormation: undefined }), baseline);
  assert.equal('formation' in baseline, false); assert.equal('formationLoad' in baseline.factors, false);
  for (const unknown of [{ ownFormation: 'back' }, { opponentFormation: 'up' }]) assert.equal(assessPressureV1({ ...source, ...unknown }).score, baseline.score);
  for (const value of ['unknown', '', 0, true, {}]) {
    assert.throws(() => assessPressureV1({ ...source, ownFormation: value }), /formations/);
    assert.throws(() => assessPressureV1({ ...source, opponentFormation: value }), /formations/);
  }
});

test('self-paced preparation suppresses formation pressure and formation cannot force an error or forced-error label', () => {
  const source = { contact: { x: 7, y: 14, heightFeet: 2 }, position: { x: 7, y: 14 }, availableSeconds: 1, ownFormation: 'back', opponentFormation: 'up' };
  const pressure = assessPressureV1(source), selfPaced = assessPressureV1({ ...source, selfPaced: true });
  assert.equal(selfPaced.score, 0); assert.equal(selfPaced.formation.pressureLoad, 0); assert.equal(selfPaced.factors.formationLoad, 0);
  assert.equal(selfPaced.formation.ownFormation, 'back'); assert.equal(selfPaced.formation.opponentFormation, 'up');
  const sampled = sampleExecutionV1({ profile, situation: { phase: 'kitchen', pressure }, draws: { quality: .9 } });
  assert.equal(sampled.quality, 'neutral'); assert.ok(Math.abs(sampled.probabilities.error - .15) < 1e-12);
  assert.equal(classifyOutcomeV1({ outcome, pressure, execution: { quality: 'error' }, pressureDecisionId: 'previous', previousIntent: 'speed-up' }).kind, 'unforced-error');
});

test('pressure uses actual sampled velocity, retains launch evidence and explicitly identifies unavailable/fallback speed', () => {
  const flight = solveFlightForClearanceV2({ from: { x: 5, y: 14.25, heightFeet: 2 }, target: { x: 15, y: 37 }, family: 'drive', pace: 'firm', arc: 'low' }, .7);
  for (const time of [flight.firstLandingTime * .7, flight.firstLandingTime, flight.firstLandingTime + .16]) {
    const velocity = sampleFlightVelocityV2(flight, time), contact = flight.sampleBoard(time);
    const source = { contact, position: contact, availableSeconds: time, incomingFlight: flight, incomingIntent: 'drive', incomingContactVelocity: velocity };
    const before = JSON.stringify(source), actual = assessPressureV1(source);
    assert.equal(actual.incomingSpeedMph, velocity.speedMph); assert.equal(actual.incomingLaunchSpeedMph, flight.launchSpeedMph);
    assert.equal(actual.incomingSpeedBasis, 'sampled-contact-velocity'); assert.deepEqual(actual.incomingContactVelocity, velocity);
    assert.equal(actual.factors.speedLoad, Math.max(0, Math.min(1, (velocity.speedMph - 15) / 30)));
    assert.equal(JSON.stringify(source), before); assert.equal(Object.isFrozen(actual.incomingContactVelocity), true);
    const inconsistent = { ...velocity, xFeetPerSecond: velocity.xFeetPerSecond + 1 };
    assert.throws(() => assessPressureV1({ ...source, incomingContactVelocity: inconsistent }), /components/);
    const otherTime = sampleFlightVelocityV2(flight, time + .01);
    assert.throws(() => assessPressureV1({ ...source, incomingContactVelocity: { ...otherTime, timeSeconds: time } }), /solved flight/);
    assert.throws(() => assessPressureV1({ ...source, incomingContactVelocity: otherTime }), /actual contact/);
  }
  const base = { contact: { x: 7, y: 14, heightFeet: 2 }, position: { x: 7, y: 14 } };
  const fallback = assessPressureV1({ ...base, incomingFlight: { launchSpeedMph: 35 } });
  assert.equal(fallback.incomingSpeedMph, 35); assert.equal(fallback.incomingSpeedBasis, 'launch-speed-fallback');
  assert.equal('incomingContactVelocity' in fallback, false);
  assert.equal(assessPressureV1(base).incomingSpeedBasis, 'unavailable');
  assert.equal(assessPressureV1(base).incomingLaunchSpeedMph, null);
  const valid = sampleFlightVelocityV2(flight, .2);
  for (const invalid of [false, [], {}, { ...valid, version: 'invented' }, { ...valid, phase: 'bounce' }, { ...valid, timeSeconds: -1 },
    ...['timeSeconds', 'xFeetPerSecond', 'yFeetPerSecond', 'heightFeetPerSecond', 'speedMph'].map(key => ({ ...valid, [key]: NaN })), { ...valid, speedMph: -1 }]) {
    assert.throws(() => assessPressureV1({ ...base, incomingContactVelocity: invalid }), /velocity/);
  }
});

test('low and excellent supply distinct clearance preferences with bounded coherent delivery in mirrored courts', () => {
  for (const team of ['green', 'orange']) for (const family of ['dink', 'drop', 'reset', 'drive', 'volley', 'serve', 'return']) {
    const contact = { x: 7, y: team === 'green' ? 14.25 : 29.75, heightFeet: 1.4 };
    const target = { x: 13, y: team === 'green' ? (['dink', 'drop', 'reset'].includes(family) ? 26.5 : 38) : (['dink', 'drop', 'reset'].includes(family) ? 17.5 : 6) };
    const nominal = solveFlightForClearanceV2({ from: contact, target, family, pace: 'soft', arc: 'medium' }, ['dink'].includes(family) ? .35 : ['drop', 'reset'].includes(family) ? .6 : 1.2);
    const source = { contact, target, team, family, pace: 'soft', arc: 'medium', physics: { launchVerticalFeetPerSecond: nominal.metadata.launchVerticalFeetPerSecond }, draws: { lateral: .75, depth: .75 } };
    const before = JSON.stringify(source), flights = {};
    for (const quality of ['neutral', 'low', 'excellent']) {
      const actual = applyAndResolve({ ...source, execution: { quality, errorReason: null } });
      flights[quality] = solveFlightV2({ from: contact, target: actual.target, family, quality, pace: actual.pace, arc: actual.arc, physics: actual.physics });
      assert.equal(flights[quality].obstruction, null); assert.equal(actual.physicalTransformation.version, PHYSICAL_TRANSFORMATION_VERSION);
      assert.equal(actual.physicalTransformation.sourceContact.heightFeet, contact.heightFeet);
      assert.equal('outcome' in actual, false); assert.equal('heightFeet' in actual, false);
      if (quality !== 'neutral') {
        assert.equal(actual.physicalTransformation.kind, 'controlled-clearance');
        assert.equal(actual.physicalTransformation.solveAttempts.length,0);
        assert.ok(Math.abs(flights[quality].metadata.netClearanceInches / 12 - actual.physicalTransformation.solvedClearanceFeet) < 1e-8);
        assert.ok(Math.abs(actual.target.x - target.x) < .2);
      }
    }
    assert.notEqual(flights.low.metadata.netClearanceInches, flights.excellent.metadata.netClearanceInches);
    assert.ok(flights.low.launchSpeedMph<=({serve:40,return:36,drive:38,volley:45,dink:20,drop:26,reset:24})[family]);
    assert.equal(JSON.stringify(source), before);
  }
});

const hold = () => ({ intent: 'hold', pinned: false });
const mirrorIds = { player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2', green: 'orange', orange: 'green' };
const mirrorCourt = value => Array.isArray(value) ? value.map(mirrorCourt) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key, child]) => [mirrorIds[key] ?? key,
    key === 'x' && Number.isFinite(child) ? 20 - child : key === 'y' && Number.isFinite(child) ? 44 - child : mirrorCourt(child)]))
  : typeof value === 'string' ? mirrorIds[value] ?? value : value;

function popupFixture(family, mirrored = false) {
  const players = Object.fromEntries(['player1', 'player2', 'player3', 'player4'].map((id, i) => [id, { team: i < 2 ? 'green' : 'orange', handedness: 'right' }]));
  const positions = { player1: { x: 5, y: 14.25 }, player2: { x: 15, y: 14.25 }, player3: { x: 4.2, y: 29.75 }, player4: { x: 15, y: 29.75 }, ball: { x: 5, y: 28.5 } };
  const first = solveFlightForClearanceV2({ from: { ...positions.ball, heightFeet: 2.2 }, target: { x: 15, y: 17 }, family: 'dink', pace: 'soft', arc: 'medium' }, .35);
  const incoming = interceptFlightV2(first, { kind: 'groundstroke', stance: positions.player2, afterBounceSeconds: .16 });
  const feet = contactFeetV1({ contact: incoming.point, target: { x: 5, y: 26.5 }, team: 'green', position: positions.player2, kind: 'groundstroke', contactStyle: 'backhand' });
  const source = { contact: incoming.point, target: { x: 5, y: 26.5 }, team: 'green', family, pace: 'soft', arc: 'medium', draws: { lateral: .5, depth: .5 } };
  const doc = { schemaVersion: 1, modelVersion: 2, physicsVersion: 'play-physics-v2', id: 'quality-popup', title: 'Quality popup fixture', players, initialLayout: positions,
    assistance: { autoShading: false, showGuides: false, team: 'green' }, opening: 'midrally', ending: 'stop', intentionalFault: false, annotations: [],
    shots: [{ id: 'incoming', family: 'dink', hitter: 'player3', receiver: 'auto', contactStyle: 'forehand', target: { x: 15, y: 17 }, arc: 'medium', pace: 'soft', quality: 'neutral',
      physics: { launchVerticalFeetPerSecond: first.metadata.launchVerticalFeetPerSecond }, movement: hold(), playerMovement: { player1: hold(), player2: { intent: 'manual', target: feet.stance, pinned: false }, player4: hold() },
      contactEvidence: { feet: [{ x: positions.player3.x - .42, y: 29.75 }, { x: positions.player3.x + .42, y: 29.75 }], feetEstablishedOutsideNVZ: true } },
    { id: 'soft', family, hitter: 'player2', receiver: 'auto', contactStyle: 'backhand', target: source.target, arc: 'medium', pace: 'soft', quality: 'attackable', contactMode: 'bounced', contactTiming: { afterBounceSeconds: .16 },
      movement: hold(), playerMovement: { player1: hold(), player3: hold(), player4: hold() }, contactEvidence: { feet: feet.feet, feetEstablishedOutsideNVZ: feet.feetEstablishedOutsideNVZ } }] };
  return mirrored ? { doc: mirrorCourt(doc), source: mirrorCourt(source) } : { doc, source };
}

test('soft attackable transformations preserve their short region with an independently replayable higher shape',()=>{
  for(const family of ['dink','drop','reset']) for(const mirrored of [false,true]) {
    const {source}=popupFixture(family,mirrored),before=JSON.stringify(source);
    const applied=applyAndResolve({...source,execution:{quality:'attackable',errorReason:null}});
    const flight=solveFlightV2({from:source.contact,target:applied.target,family,quality:applied.quality,pace:applied.pace,arc:applied.arc,physics:applied.physics});
    assert.equal(applied.physicalTransformation.kind,'soft-popup');assert.equal(flight.obstruction,null);
    assert.equal(applied.target.x,source.target.x);assert.ok(Math.abs(applied.target.y-(mirrored?15.8:28.2))<1e-8);assert.ok(isInNonVolleyZone(applied.target));assert.ok(flight.launchSpeedMph<=({dink:20,drop:26,reset:24})[family]);
    assert.ok(flight.metadata.netClearanceInches>=14);assert.equal(JSON.stringify(source),before);
    assert.equal(Object.isFrozen(applied.physicalTransformation),true);
  }
});

test('physical quality transformations retain lob/overhead shape preferences and reject infeasible geometry honestly', () => {
  for (const family of ['lob', 'overhead']) for (const quality of ['attackable', 'low', 'excellent', 'neutral']) {
    const physics = family === 'lob' ? { apexFeet: 18 } : { launchVerticalFeetPerSecond: -12 };
    const result = applyAndResolve({ execution: { quality, errorReason: null }, family, contact: { x: 7, y: 14, heightFeet: 7.5 }, target: { x: 13, y: 38 }, team: 'green', physics, draws: { lateral: .5, depth: .5 } });
    assert.deepEqual(result.preferredFlight,physics);assert.equal(result.physicalTransformation.kind,'family-shape-preference');
    const flight=solveFlightV2({from:{x:7,y:14,heightFeet:7.5},target:result.target,family,physics:result.physics});
    if(family==='lob')assert.ok(flight.metadata.apexFeet>=15);else assert.ok(flight.metadata.launchVerticalFeetPerSecond<=0);
  }
  for (const team of ['green', 'orange']) for (const quality of ['attackable', 'low', 'excellent']) {
    const source = { execution: { quality, errorReason: null }, family: 'dink', contact: { x: 0, y: team === 'green' ? 0 : 44, heightFeet: .13 }, target: { x: 20, y: team === 'green' ? 44 : 0 }, team, draws: { lateral: .5, depth: .5 } };
    const before = JSON.stringify(source);
    assert.throws(() => applyAndResolve(source), /Delivered flight unavailable/);
    assert.equal(JSON.stringify(source), before);
  }
});

function settledSoftSituation() {
  const flight = solveFlightForClearanceV2({ from: { x: 7, y: 29.75, heightFeet: 2.2 }, target: { x: 7, y: 17.5 }, family: 'dink', pace: 'soft', arc: 'medium' }, .35);
  const time = flight.firstLandingTime + .16, contact = flight.sampleBoard(time);
  const pressure = assessPressureV1({ contact, position: { x: 7, y: 14.25 }, availableSeconds: time,
    incomingFlight: flight, incomingIntent: 'cross-court-dink', incomingContactVelocity: sampleFlightVelocityV2(flight, time) });
  return { phase: 'kitchen', allFourUp: true, attackable: false, incomingFamily: 'dink', incomingPace: 'soft', contact,
    feet: [{ x: 6.58, y: 14.25 }, { x: 7.42, y: 14.25 }], hitterFootState: { grounded: true, outsideNVZ: true, establishedOutsideNVZ: true }, pressure };
}
const softChoice = { family: 'dink', pace: 'soft', intent: 'cross-court-dink' };
const sampleRisk = (situation, choice = softChoice, profile = resolveStyle('pro')) => sampleExecutionV1({ profile, situation, choice, draws: { quality: .9, error: .5 } });

test('only proven settled soft opportunities substitute the explicit style prior before ordinary pressure addition', () => {
  for (const style of ['pro', 'advanced', 'intermediate', 'beginner']) {
    const value = resolveStyle(style), situation = settledSoftSituation(); situation.pressure = { ...situation.pressure, score: .1 };
    const before = JSON.stringify({ value, situation, softChoice });
    const ordinary = sampleRisk(situation, null, value), settled = sampleRisk(situation, softChoice, value);
    assert.equal(settled.riskContext.version, RISK_CONTEXT_VERSION); assert.equal(settled.riskContext.kind, 'settled-soft');
    assert.ok(Object.values(settled.riskContext.conditions).every(Boolean));
    assert.equal(settled.riskContext.phaseBaseErrorProbability, value.execution.kitchen.error);
    assert.equal(settled.riskContext.baseErrorProbability, value.settledSoftError);
    assert.equal(settled.riskContext.pressureErrorAddition, .1 * value.pressureErrorScale);
    assert.ok(Math.abs(settled.probabilities.error - (value.settledSoftError + .1 * value.pressureErrorScale)) < 1e-12);
    assert.ok(Math.abs(ordinary.probabilities.error - (value.execution.kitchen.error + .1 * value.pressureErrorScale)) < 1e-12);
    for (const result of [ordinary, settled]) {
      assert.ok(Math.abs(Object.values(result.probabilities).reduce((a, b) => a + b, 0) - 1) < 1e-12);
      assert.ok(Object.values(result.probabilities).every(p => p >= 0 && p <= 1));
    }
    for (const quality of ['attackable', 'excellent', 'low']) assert.equal(settled.probabilities[quality], ordinary.probabilities[quality]);
    assert.equal(JSON.stringify({ value, situation, softChoice }), before);
    assert.equal(Object.isFrozen(situation), false); assert.equal(Object.isFrozen(softChoice), false);
    assert.equal(Object.isFrozen(settled.riskContext.choice), true);
  }
  for (const [family, intent] of [['dink', 'middle-dink'], ['reset', 'reset'], ['drop', 'drop']]) {
    assert.equal(sampleRisk({ ...settledSoftSituation(), incomingFamily: family }, { family, pace: 'soft', intent }).riskContext.kind, 'settled-soft');
  }
});

test('pop-ups, attacks, fast incoming soft labels, moving contacts and unsafe feet retain ordinary risk', () => {
  const original = settledSoftSituation();
  const mutations = [
    s => { s.attackable = true; }, s => { s.allFourUp = false; }, s => { s.incomingFamily = 'drive'; }, s => { s.incomingPace = 'firm'; },
    s => { s.hitterFootState.grounded = false; }, s => { s.hitterFootState.outsideNVZ = false; }, s => { s.hitterFootState.establishedOutsideNVZ = false; },
    s => { s.feet[0].y = 15; }, s => { s.feet[0].x = NaN; },
    s => { s.pressure.score = .15; }, s => { s.pressure.availableSeconds = .499; }, s => { s.pressure.reachMarginFeet = 1.99; }, s => { s.pressure.movementSpeedFeetPerSecond = 3.001; },
    s => { s.pressure.incomingSpeedMph = 22; }, s => { s.pressure.incomingSpeedBasis = 'launch-speed-fallback'; },
  ];
  const fast = solveFlightForClearanceV2({ from: { x: 7, y: 14.25, heightFeet: 3.5 }, target: { x: 13, y: 43.2 }, family: 'dink', pace: 'soft', arc: 'low' }, .5);
  const fastVelocity = sampleFlightVelocityV2(fast, fast.firstLandingTime * .7);
  assert.ok(fastVelocity.speedMph > 22);
  mutations.push(s => { s.pressure.incomingSpeedMph = fastVelocity.speedMph; s.pressure.incomingContactVelocity = fastVelocity; });
  for (const mutate of mutations) {
    const changed = structuredClone(original); mutate(changed);
    const result = sampleRisk(changed), ordinary = sampleRisk(changed, null);
    assert.equal(result.riskContext.kind, 'phase-default'); assert.deepEqual(result.probabilities, ordinary.probabilities);
  }
  for (const phase of ['serve', 'return', 'third', 'third-shot', 'transition', 'hands', 'hands-battle', 'scramble']) {
    const changed = { ...original, phase };
    assert.deepEqual(sampleRisk(changed).probabilities, sampleRisk(changed, null).probabilities, phase);
    assert.equal(sampleRisk(changed).riskContext.kind, 'phase-default');
  }
  for (const choice of [null, {}, { ...softChoice, family: 'drive', intent: 'drive' }, { ...softChoice, intent: 'speed-up' }, { ...softChoice, pace: 'firm' },
    { ...softChoice, family: 'volley', intent: 'counter' }, { ...softChoice, family: 'overhead', intent: 'overhead' }, { ...softChoice, intent: 'unknown' }]) {
    assert.equal(sampleRisk(original, choice).riskContext.kind, 'phase-default');
  }
});

test('missing settled facts and absent policy priors never become easy-opportunity defaults', () => {
  const original = settledSoftSituation();
  for (const key of ['phase', 'allFourUp', 'attackable', 'incomingFamily', 'incomingPace', 'feet', 'hitterFootState', 'pressure']) {
    const changed = structuredClone(original); delete changed[key];
    assert.equal(sampleRisk(changed).riskContext.kind, 'phase-default', key);
  }
  for (const key of ['score', 'availableSeconds', 'reachMarginFeet', 'movementSpeedFeetPerSecond', 'incomingSpeedMph', 'incomingSpeedBasis']) {
    for (const replacement of [undefined, null, NaN]) {
      const changed = structuredClone(original); changed.pressure[key] = replacement;
      assert.equal(sampleRisk(changed).riskContext.kind, 'phase-default', key);
    }
  }
  for (const key of ['grounded', 'outsideNVZ', 'establishedOutsideNVZ']) {
    const changed = structuredClone(original); delete changed.hitterFootState[key];
    assert.equal(sampleRisk(changed).riskContext.kind, 'phase-default', key);
  }
  for (const key of ['family', 'pace', 'intent']) {
    const choice = { ...softChoice }; delete choice[key];
    assert.equal(sampleRisk(original, choice).riskContext.kind, 'phase-default', key);
  }
  assert.equal(sampleRisk(original, softChoice, profile).riskContext.kind, 'phase-default');
  for (const invalid of [NaN, Infinity, -.1, 1.1, null, '0.07', true]) assert.throws(() => sampleRisk(original, softChoice, { ...profile, settledSoftError: invalid }), /Settled soft error/);
});

test('an actual solved pop-up retains ordinary risk when the measured reply opportunity is attackable',()=>{
  const {source}=popupFixture('dink');
  const applied=applyAndResolve({...source,execution:{quality:'attackable',errorReason:null}});
  const flight=solveFlightV2({from:source.contact,target:applied.target,family:'dink',quality:applied.quality,pace:applied.pace,arc:applied.arc,physics:applied.physics});
  const time=flight.firstLandingTime*.6,contact=flight.sampleBoard(time);
  assert.ok(contact.heightFeet-PHYSICS_V2.ballRadiusFeet>localNetHeightFeet(contact.x));
  const situation={...settledSoftSituation(),contact,attackable:true};
  const execution=sampleRisk(situation);
  assert.equal(execution.riskContext.kind,'phase-default');assert.equal(execution.riskContext.conditions.notAttackable,false);
  for(const [key,value]of Object.entries(execution.riskContext.conditions))if(key!=='notAttackable')assert.equal(value,true,key);
  assert.deepEqual(execution.probabilities,sampleRisk(situation,null).probabilities);
});

test('settled opportunity thresholds include their documented boundaries and do not depend on role, seed or rally length', () => {
  const situation = settledSoftSituation();
  situation.pressure = { ...situation.pressure, score: .149999, availableSeconds: .5, reachMarginFeet: 2, movementSpeedFeetPerSecond: 3, incomingSpeedMph: 21.999999 };
  const expected = sampleRisk(situation);
  assert.equal(expected.riskContext.kind, 'settled-soft');
  for (const team of ['green', 'orange']) for (const servingTeam of ['green', 'orange']) for (const contactIndex of [5, 28, 98]) {
    const changed = { ...situation, hittingTeam: team, servingTeam, contactIndex, seed: contactIndex * 17, requestedWinner: team };
    assert.deepEqual(sampleRisk(changed).probabilities, expected.probabilities);
    assert.deepEqual(sampleRisk(changed).riskContext, expected.riskContext);
  }
});

test('execution perturbation emits preferences without running or retaining a solved equality',()=>{
  const input={execution:{quality:'low',errorReason:null},contact:{x:7,y:14,heightFeet:4.1},target:{x:13,y:38},team:'green',family:'drive',physics:{launchVerticalFeetPerSecond:-10},draws:{lateral:.75,depth:.75}};
  const before=JSON.stringify(input),applied=applyExecutionV1(input);
  assert.equal(applied.physics,undefined);assert.deepEqual(applied.preferredFlight,{clearanceFeet:.4});
  assert.equal(applied.physicalTransformation.solvedClearanceFeet,null);assert.deepEqual(applied.physicalTransformation.solveAttempts,[]);
  assert.equal(JSON.stringify(input),before);assert.equal(input.execution.quality,'low');
  const result=resolveDeliveredFlightV1({candidate:{family:'drive',intent:'drive'},contact:input.contact,team:'green',execution:input.execution,applied});
  assert.ok(result.flight.launchSpeedMph<=38);assert.equal(result.flight.obstruction,null);
});

test('soft popup carry follows the fixed draw within the back NVZ band at both ends',()=>{
  for(const family of ['dink','drop','reset'])for(const team of ['green','orange'])for(const depth of [0,.5,.999999]) {
    const near=team==='green',contact={x:7,y:near?14:30,heightFeet:2.2},target={x:13,y:near?26.5:17.5};
    const execution={quality:'attackable',errorReason:null},input={contact,target,team,family,pace:'soft',execution,draws:{lateral:.5,depth}},before=JSON.stringify(input);
    const raw=applyExecutionV1(input),result=resolveDeliveredFlightV1({candidate:{family,intent:family},contact,team,execution,applied:raw});
    const baselineDepth=near?44-result.applied.target.y:result.applied.target.y;
    assert.ok(Math.abs(baselineDepth-(15.2+1.2*depth))<1e-8);assert.ok(isInNonVolleyZone(result.applied.target));
    assert.ok(near?result.applied.target.y>target.y:result.applied.target.y<target.y);
    assert.equal(result.applied.physicalTransformation.kind,'soft-popup');assert.ok(result.guidance.plannerDiagnostics.solverCalls<=6);
    assert.ok(result.flight.launchSpeedMph<=({dink:20,drop:26,reset:24})[family]);
    const independent=solveFlightV2({from:contact,target:result.applied.target,family,pace:'soft',arc:'medium',quality:'attackable',physics:result.applied.physics});
    assert.deepEqual(independent.metadata,result.flight.metadata);assert.equal(JSON.stringify(input),before);
  }
});
test('known low and high soft contacts gain a real ordinary line air attack through popup loft and NVZ carry',()=>{
  for(const team of ['green','orange'])for(const source of [{y:20,heightFeet:.6},{y:21,heightFeet:2.2}]) {
    const near=team==='green',contact={x:7,y:near?source.y:44-source.y,heightFeet:source.heightFeet},target={x:7,y:near?26.5:17.5};
    const flights={};
    for(const quality of ['low','excellent','attackable']) {
      const execution={quality,errorReason:null},raw=applyExecutionV1({contact,target,team,family:'dink',pace:'soft',execution,draws:{lateral:.5,depth:.5}});
      const result=resolveDeliveredFlightV1({candidate:{family:'dink',intent:'middle-dink'},contact,team,execution,applied:raw});
      const independent=solveFlightV2({from:contact,target:result.applied.target,family:'dink',pace:'soft',arc:'medium',quality,physics:result.applied.physics});
      assert.deepEqual(independent.metadata,result.flight.metadata);assert.equal(result.flight.obstruction,null);assert.ok(isInNonVolleyZone(result.applied.target));
      assert.ok(result.flight.launchSpeedMph<=20);flights[quality]=result.flight;
    }
    const planeY=near?26.8:17.2;
    // The good short balls land before the earliest grounded line reach.
    for(const quality of ['low','excellent'])assert.ok(near?flights[quality].landing.y<planeY:flights[quality].landing.y>planeY);
    const flight=flights.attackable,time=(planeY-contact.y)/flight.stages[0].vz;
    assert.ok(time>0&&time<flight.firstLandingTime);
    const at=flight.sampleBoard(time),opponent=near?'orange':'green',replyTarget={x:7,y:near?3:41};
    assert.ok(at.heightFeet-PHYSICS_V2.ballRadiusFeet>localNetHeightFeet(at.x));
    const feet=contactFeetV1({contact:at,target:replyTarget,team:opponent,position:{x:6.5,y:near?29.75:14.25},kind:'volley',contactStyle:near?'backhand':'forehand',handedness:'right',availableSeconds:time});
    assert.equal(feet.reachable,true);assert.equal(feet.routeReachable,true);assert.equal(feet.legalVolleyFeet,true);
    assert.ok(feet.feet.every(foot=>!isInNonVolleyZone(foot)));assert.ok(feet.arrivalPeakFeetPerSecond<18);
    const reply=resolveFlightParametersV1({candidate:{family:'drive',intent:'drive',pace:'firm',arc:'low'},contact:at,target:replyTarget,team:opponent});
    assert.equal(reply.attacking,true);assert.equal(reply.flight.obstruction,null);assert.ok(reply.flight.launchSpeedMph<=38);
  }
});
