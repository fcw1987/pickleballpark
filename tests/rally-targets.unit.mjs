import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTargetV1, resolveFlightParametersV1, CLEARANCE_PRIORS_V1, OVERHEAD_LAUNCH_PRIORS_V1 } from '../rally-targets.js';
import { receivingServiceBox, SERVICE_COURT_CONVENTION } from '../rally-state.js';
import { isInServiceBox, isInNonVolleyZone } from '../court-geometry.js';
import { PHYSICS_VERSION, PHYSICS_V2, solveFlightV2, interceptFlightV2 } from '../play-physics-v2.js';

const players = {
  player1: { team: 'green', handedness: 'right' }, player2: { team: 'green', handedness: 'right' },
  player3: { team: 'orange', handedness: 'right' }, player4: { team: 'orange', handedness: 'right' }
};
const positions = { player1: { x: 5, y: 4 }, player2: { x: 15, y: 4 }, player3: { x: 15, y: 40 }, player4: { x: 5, y: 40 } };
const candidate = (family, targetRegion, intent = family) => ({ id: `${intent}-${targetRegion}`, intent, family, targetRegion, pace: 'medium', arc: 'medium', addsContact: true });
const situation = (team = 'green', extra = {}) => ({ hittingTeam: team, hitter: team === 'green' ? 'player1' : 'player3',
  contact: { x: team === 'green' ? 5 : 15, y: team === 'green' ? 14 : 30, heightFeet: 2.2 }, positions, ...extra });
const draws = { lateral: .5, depth: .5 };

test('serve targets obey both declared courts at both ends without using tactical x as service identity', () => {
  for (const team of ['green', 'orange']) for (const court of ['right', 'left']) {
    const server = team === 'green' ? 'player1' : 'player3', receiver = team === 'green' ? 'player3' : 'player1';
    const service = { server, receiver, court, courtConvention: SERVICE_COURT_CONVENTION };
    // Deliberately keep x the same while changing the logical court.
    const context = situation(team, { service, contact: { x: 5, y: team === 'green' ? -1 : 45, heightFeet: 2.2 } });
    const box = receivingServiceBox({ ...service, servingTeam: team }, context.contact);
    for (let index = 0; index < 20; index++) {
      const target = resolveTargetV1({ candidate: candidate('serve', 'deep-middle'), situation: context, players,
        draws: { lateral: index / 20, depth: (19 - index) / 20 } });
      assert.ok(isInServiceBox(target, box), `${team}/${court}`);
      const depth = team === 'green' ? 44 - target.y : target.y;
      assert.ok(depth >= 3 && depth < 6);
      assert.ok(team === 'green' ? target.y > 29 : target.y < 15);
    }
  }
});

test('serve backhand targets respect designated receiving identity and handedness at both ends', () => {
  for (const team of ['green', 'orange']) for (const hand of ['right', 'left']) {
    const records = structuredClone(players), receiver = team === 'green' ? 'player3' : 'player1';
    records[receiver].handedness = hand;
    const context = situation(team, { service: { server: team === 'green' ? 'player1' : 'player3', receiver, court: 'right', courtConvention: SERVICE_COURT_CONVENTION } });
    const target = resolveTargetV1({ candidate: candidate('serve', 'deep-backhand'), situation: context, players: records, draws });
    const backhandDirection = (records[receiver].team === 'green' ? 1 : -1) * (hand === 'left' ? -1 : 1);
    assert.ok((target.x - positions[receiver].x) * backhandDirection > 0, `${team}/${hand}`);
  }
});

test('missing or legacy-marked service roles never fall back to nearest tactical positions', () => {
  const serve = candidate('serve', 'deep-middle');
  assert.throws(() => resolveTargetV1({ candidate: serve, situation: situation(), players, draws }), /explicit server-perspective/);
  const service = { server: 'player1', receiver: 'player3', court: 'right' };
  assert.throws(() => resolveTargetV1({ candidate: serve, situation: situation('green', { service }), players, draws }), /explicit server-perspective/);
  assert.throws(() => resolveTargetV1({ candidate: serve, situation: situation('green', { service: { ...service, receiver: 'player2', courtConvention: SERVICE_COURT_CONVENTION } }), players, draws }), /explicit server-perspective/);
});

test('returns are deep and kitchen targets land inside the NVZ toward an outside-feet bounce', () => {
  for (const team of ['green', 'orange']) {
    const context = situation(team);
    for (const depth of [0, .35, .999999]) {
      const returned = resolveTargetV1({ candidate: candidate('return', 'deep-middle', 'deep-return'), situation: context, players, draws: { lateral: .3, depth } });
      const baselineDepth = team === 'green' ? 44 - returned.y : returned.y;
      assert.ok(baselineDepth >= 3 && baselineDepth < 6);
      for (const targetRegion of ['kitchen-cross', 'kitchen-middle', 'kitchen-straight']) {
        const target = resolveTargetV1({ candidate: candidate('dink', targetRegion), situation: context, players, draws: { lateral: .3, depth } });
        assert.ok(isInNonVolleyZone(target));
        const inside = team === 'green' ? 29 - target.y : target.y - 15;
        assert.ok(inside >= 1.5 && inside <= 3);
      }
    }
  }
});

test('cross-court and straight target regions remain distinct under continuous horizontal jitter', () => {
  const context = situation('green');
  const cross = resolveTargetV1({ candidate: candidate('dink', 'kitchen-cross'), situation: context, players, draws });
  const straight = resolveTargetV1({ candidate: candidate('dink', 'kitchen-straight'), situation: context, players, draws });
  assert.equal(cross.x, 15); assert.equal(straight.x, 5);
  const targets = Array.from({ length: 257 }, (_, index) => resolveTargetV1({ candidate: candidate('return', 'deep-middle'), situation: context, players,
    draws: { lateral: index / 257, depth: .5 } }).x);
  assert.equal(new Set(targets).size, 257, 'targets are not quantized into fixed lanes');
  assert.ok(targets.every((x, index) => index === 0 || x > targets[index - 1]));
});

test('deep attacks land beyond represented back defenders or in the open lane', () => {
  for (const targetRegion of ['deep-feet', 'hip-middle', 'open-court', 'deep-overhead']) {
    const target = resolveTargetV1({ candidate: candidate('drive', targetRegion), situation: situation(), players, draws });
    if (targetRegion === 'deep-feet') assert.equal(target.y, 41.25);
    else if (targetRegion === 'hip-middle') assert.equal(target.y, 43.2, 'the baseline clips the requested body-lane depth');
    else assert.ok(target.y >= 36 && target.y <= 42);
    assert.ok(target.x > 0 && target.x < 20);
  }
});

function defenderContext(team, ownDepth, extra = {}) {
  const near = team === 'green', sampled = structuredClone(positions);
  const selected = near ? 'player3' : 'player1', other = near ? 'player4' : 'player2';
  sampled[selected] = { x: near ? 13 : 7, y: near ? 44 - ownDepth : ownDepth };
  sampled[other] = { x: near ? 3 : 17, y: near ? 44 - ownDepth : ownDepth };
  return { context: situation(team, { positions: sampled, ...extra }), selected };
}

test('feet and hip lanes track a represented defender moving between back and up on both ends', () => {
  for (const team of ['green', 'orange']) for (const targetRegion of ['deep-feet', 'hip-middle']) {
    const choice = candidate('drive', targetRegion);
    for (const depth of [0, .5, .999999]) {
      const targets = [];
      for (const ownDepth of [4, 14.25]) {
        const { context, selected } = defenderContext(team, ownDepth), before = JSON.stringify(context);
        const target = resolveTargetV1({ candidate: choice, situation: context, players, draws: { lateral: .5, depth } });
        const offset = targetRegion === 'deep-feet' ? .5 + depth * 1.5 : 5 + depth * 2;
        const expectedDepth = Math.max(.8, Math.min(21.2, ownDepth - offset));
        assert.equal(target.x, context.positions[selected].x);
        assert.ok(Math.abs((team === 'green' ? 44 - target.y : target.y) - expectedDepth) < 1e-9);
        assert.ok(team === 'green' ? target.y > context.positions[selected].y : target.y < context.positions[selected].y);
        assert.deepEqual(Object.keys(target).sort(), ['x', 'y']); assert.equal(JSON.stringify(context), before);
        targets.push(target);
      }
      assert.notEqual(targets[0].y, targets[1].y, `${team}/${targetRegion}: moving the defender must change depth`);
    }
  }
});

test('body-lane and feet target flights derive their distinct defender-plane heights through the same solver', () => {
  for (const team of ['green', 'orange']) {
    const { context, selected } = defenderContext(team, 14.25, { contact: { x: team === 'green' ? 7 : 13, y: team === 'green' ? 14.25 : 29.75, heightFeet: 3.5 } });
    const observed = {};
    for (const targetRegion of ['deep-feet', 'hip-middle']) {
      const choice = { ...candidate('volley', targetRegion), pace: 'firm', arc: 'low' };
      const target = resolveTargetV1({ candidate: choice, situation: context, players, draws });
      const input = { candidate: choice, contact: context.contact, target, team }, before = JSON.stringify(input);
      const solved = resolveFlightParametersV1(input), flight = solved.flight;
      const defenderY = context.positions[selected].y, time = (defenderY - context.contact.y) / flight.stages[0].vz;
      const interception = interceptFlightV2(flight, { kind: 'volley', stance: context.positions[selected], beforeBounceSeconds: flight.firstLandingTime - time });
      assert.ok(time > 0 && time < flight.firstLandingTime);
      assert.ok(Math.abs(interception.point.y - defenderY) < 1e-9);
      assert.ok(interception.point.heightFeet >= PHYSICS_V2.ballRadiusFeet);
      assert.equal(flight.obstruction, null); assert.equal(solved.outcome, undefined); assert.equal(target.heightFeet, undefined);
      const reconstructed = solveFlightV2({ from: context.contact, target, family: 'volley', pace: 'firm', arc: 'low', physics: solved.physics });
      assert.deepEqual(reconstructed.sampleBoard(time), flight.sampleBoard(time));
      assert.equal(JSON.stringify(input), before); observed[targetRegion] = interception.point.heightFeet;
    }
    assert.ok(observed['hip-middle'] > observed['deep-feet'] + .5, `${team}: deeper body lane must keep the ball higher at the actual defender plane`);
  }
});

test('third-shot drive feet targets remain physically feasible against up and back defenders at both ends', () => {
  for (const team of ['green', 'orange']) for (const ownDepth of [4, 14.25]) for (const depth of [0, .5, .999999]) {
    const { context } = defenderContext(team, ownDepth, { contact: { x: team === 'green' ? 7 : 13, y: team === 'green' ? 3 : 41, heightFeet: 1.4 } });
    const third = { ...candidate('drive', 'deep-feet', 'third-shot-drive'), pace: 'firm', arc: 'low' };
    const regular = { ...third, id: 'drive', intent: 'drive' };
    const target = resolveTargetV1({ candidate: third, situation: context, players, draws: { lateral: .5, depth } });
    assert.deepEqual(target, resolveTargetV1({ candidate: regular, situation: context, players, draws: { lateral: .5, depth } }));
    const actual = resolveFlightParametersV1({ candidate: third, contact: context.contact, target, team });
    assert.equal(actual.flight.obstruction, null); assert.equal(actual.flight.terminal, null);
    assert.ok(Math.abs(actual.flight.metadata.netClearanceInches - CLEARANCE_PRIORS_V1.drive * 12) < 1e-8);
    assert.ok(Number.isFinite(actual.flight.launchSpeedMph)); assert.equal(actual.outcome, undefined);
  }
});

test('defender-relative target bounds stay inside the opposing half and body jitter is continuous around that defender', () => {
  for (const team of ['green', 'orange']) for (const ownDepth of [-2, .25, 14.25, 24]) for (const targetRegion of ['deep-feet', 'hip-middle']) {
    const { context } = defenderContext(team, ownDepth);
    const points = Array.from({ length: 51 }, (_, index) => resolveTargetV1({ candidate: candidate('drive', targetRegion), situation: context, players, draws: { lateral: index / 51, depth: index / 51 } }));
    assert.equal(new Set(points.map(point => point.x)).size, 51);
    for (const target of points) {
      assert.ok(target.x >= .8 && target.x <= 19.2); assert.ok(target.y >= .8 && target.y <= 43.2);
      assert.ok(team === 'green' ? target.y > 22 : target.y < 22);
    }
  }
});

test('open-court lateral gaps still follow defenders while depth follows the contact geometry', () => {
  const choice = candidate('volley', 'open-court'), original = situation('green');
  const shifted = structuredClone(original); shifted.positions.player3.x = 3; shifted.positions.player4.x = 7;
  const a = resolveTargetV1({ candidate: choice, situation: original, players, draws });
  const b = resolveTargetV1({ candidate: choice, situation: shifted, players, draws });
  assert.notEqual(a.x, b.x); assert.equal(a.y, b.y);
});

test('regular flight parameters reproduce their exact ball-surface clearance through the shared solver', () => {
  for (const team of ['green', 'orange']) for (const family of Object.keys(CLEARANCE_PRIORS_V1)) {
    const near = team === 'green', close = ['dink', 'reset', 'volley'].includes(family);
    const contact = { x: 7, y: near ? close ? 14 : 4 : close ? 30 : 40, heightFeet: family === 'volley' ? 3.5 : 2.2 };
    const target = { x: 12, y: near ? close && family !== 'volley' ? 27 : 40 : close && family !== 'volley' ? 17 : 4 };
    const choice = candidate(family, 'deep-middle');
    const result = resolveFlightParametersV1({ candidate: choice, contact, target, team });
    assert.ok(Math.abs(result.flight.metadata.netClearanceInches - CLEARANCE_PRIORS_V1[family] * 12) < 1e-8, `${team}/${family}`);
    assert.deepEqual(Object.keys(result.physics), ['launchVerticalFeetPerSecond']);
    const reconstructed = solveFlightV2({ from: contact, target, family, arc: choice.arc, pace: choice.pace, quality: 'neutral', physics: result.physics });
    for (const fraction of [0, .3, .7, 1]) assert.deepEqual(reconstructed.sampleBoard(reconstructed.firstLandingTime * fraction), result.flight.sampleBoard(result.flight.firstLandingTime * fraction));
    assert.equal(result.flight.physicsVersion, PHYSICS_VERSION);
    assert.equal(result.flight.obstruction, null);
  }
});

test('an actual fast, low-clearance flight creates an attack affordance; height and labels alone do not', () => {
  const fast = resolveFlightParametersV1({ candidate: candidate('drive', 'deep-feet'), contact: { x: 7, y: 3, heightFeet: 2.2 }, target: { x: 12, y: 40 }, team: 'green' });
  assert.equal(fast.attacking, true); assert.ok(fast.flight.launchSpeedMph >= 22);
  assert.ok(fast.flight.metadata.netClearanceInches <= 16);
  const highSoft = resolveFlightParametersV1({ candidate: candidate('dink', 'kitchen-cross'), contact: { x: 7, y: 14, heightFeet: 3.5 }, target: { x: 12, y: 27 }, team: 'green', quality: 'excellent' });
  assert.equal(highSoft.attacking, false); assert.ok(highSoft.flight.launchSpeedMph < 22);
  assert.equal(highSoft.reason, 'solved-flight-below-attack-pace');
  const labelledError = resolveFlightParametersV1({ candidate: candidate('dink', 'kitchen-cross'), contact: { x: 7, y: 14, heightFeet: 3.5 }, target: { x: 12, y: 27 }, team: 'green', quality: 'error' });
  assert.equal(labelledError.flight.terminal, null); assert.equal(labelledError.outcome, undefined);
});

test('lob apex and bounded overhead launches do not impose incompatible independent speed or clearance', () => {
  const lob = resolveFlightParametersV1({ candidate: candidate('lob', 'deep-overhead'), contact: { x: 7, y: 14, heightFeet: 2.2 }, target: { x: 12, y: 40 }, team: 'green' });
  assert.deepEqual(lob.physics, { apexFeet: 18 }); assert.equal(lob.flight.metadata.apexFeet, 18);
  assert.equal(lob.attacking, false);
  const overhead = resolveFlightParametersV1({ candidate: { ...candidate('overhead', 'open-court'), pace: 'firm' }, contact: { x: 7, y: 14, heightFeet: 7.5 }, target: { x: 14, y: 31 }, team: 'green' });
  const unchangedDefault = solveFlightV2({ from: { x: 7, y: 14, heightFeet: 7.5 }, target: { x: 14, y: 31 }, family: 'overhead', pace: 'firm' });
  assert.equal(unchangedDefault.metadata.launchVerticalFeetPerSecond, -24, 'M1 defaults remain independent of the new generator policy');
  assert.ok(unchangedDefault.launchSpeedMph > 45);
  assert.deepEqual(overhead.physics, { launchVerticalFeetPerSecond: -18 });
  assert.equal(overhead.flight.metadata.apexFeet, 7.5);
  assert.notEqual(overhead.flight.metadata.netClearanceInches, .5 * 12);
  assert.equal(overhead.guidance.withinBand, true);
  assert.ok(overhead.flight.launchSpeedMph >= 35 && overhead.flight.launchSpeedMph <= 45);
});

test('deep and transition overheads choose a coherent guidance-band launch on mirrored courts', () => {
  for (const near of [true, false]) for (const y of [5, 10, 14]) {
    const contact = { x: 7, y: near ? y : 44 - y, heightFeet: 8.5 };
    const target = { x: 11, y: near ? 30 : 14 }, team = near ? 'green' : 'orange';
    const choice = { ...candidate('overhead', 'open-court'), pace: 'firm' };
    const result = resolveFlightParametersV1({ candidate: choice, contact, target, team });
    assert.equal(result.guidance.withinBand, true, `${team}/${y}`);
    assert.equal(result.guidance.attempts.length, OVERHEAD_LAUNCH_PRIORS_V1.length);
    assert.ok(result.flight.launchSpeedMph >= 35 - 1e-7 && result.flight.launchSpeedMph <= 45 + 1e-7);
    assert.equal(result.flight.obstruction, null);
    assert.deepEqual(result.flight.target, target);
    const chosen = result.physics.launchVerticalFeetPerSecond;
    const first = result.guidance.attempts.find(attempt => attempt.unobstructed && attempt.launchSpeedMph >= 35 - 1e-7 && attempt.launchSpeedMph <= 45 + 1e-7);
    assert.equal(chosen, first.launchVerticalFeetPerSecond);
    const reconstructed = solveFlightV2({ from: contact, target, family: 'overhead', arc: choice.arc, pace: choice.pace, quality: 'neutral', physics: result.physics });
    assert.deepEqual(reconstructed.sampleBoard(reconstructed.firstLandingTime / 2), result.flight.sampleBoard(result.flight.firstLandingTime / 2));
  }
});

test('an unattainable overhead speed band returns a conservative coherent flight with an explicit limitation', () => {
  const contact = { x: 7, y: 14, heightFeet: 8.5 }, target = { x: 8, y: 26 };
  const result = resolveFlightParametersV1({ candidate: candidate('overhead', 'open-court'), contact, target, team: 'green' });
  assert.equal(result.guidance.withinBand, false);
  assert.ok(result.limitation); assert.equal(result.limitation.kind, 'overhead-speed-guidance');
  assert.equal(result.reason, 'overhead-speed-guidance-unattainable-conservative-flight');
  const available = result.guidance.attempts.filter(attempt => attempt.unobstructed);
  assert.equal(result.flight.launchSpeedMph, Math.min(...available.map(attempt => attempt.launchSpeedMph)));
  assert.equal(result.flight.obstruction, null); assert.deepEqual(result.flight.target, target);
  assert.equal(result.outcome, undefined, 'guidance exhaustion is not a fabricated point result');
});

test('infeasible inverse flights fail instead of shifting their target or fabricating an ending', () => {
  const input = { candidate: candidate('volley', 'hip-middle'), contact: { x: 7, y: 14, heightFeet: 8 }, target: { x: 12, y: 40 }, team: 'green' };
  const before = JSON.stringify(input);
  assert.throws(() => resolveFlightParametersV1(input), /coherent ballistic/);
  assert.equal(JSON.stringify(input), before);
  assert.throws(() => resolveFlightParametersV1({ ...input, candidate: { ...input.candidate, physics: { apexFeet: 9 } } }), /not both/);
  assert.throws(() => resolveFlightParametersV1({ ...input, contact: { x: 7, y: 22 - PHYSICS_V2.ballRadiusFeet / 2, heightFeet: 2.2 } }), /whole-ball/);
});

test('nominal helpers reject signature invention, leaving decisions, malformed draws and unknown regions', () => {
  for (const intent of ['erne', 'around-the-post']) {
    const choice = candidate('volley', 'open-court', intent);
    assert.throws(() => resolveTargetV1({ candidate: choice, situation: situation(), players, draws }), /explicit planned contact/);
    assert.throws(() => resolveFlightParametersV1({ candidate: choice, contact: { x: 7, y: 14, heightFeet: 3 }, target: { x: 12, y: 40 }, team: 'green' }), /explicit planned contact/);
  }
  assert.throws(() => resolveTargetV1({ candidate: { addsContact: false }, situation: situation(), players, draws }), /paddle-contact/);
  for (const lateral of [undefined, -1, 1, Infinity, NaN]) assert.throws(() => resolveTargetV1({ candidate: candidate('drive', 'deep-middle'), situation: situation(), players, draws: { lateral, depth: .5 } }), /unit draw/);
  assert.throws(() => resolveTargetV1({ candidate: candidate('drive', 'unknown'), situation: situation(), players, draws }), /Unsupported/);
});

test('target and flight helpers are deterministic and preserve all source values', () => {
  const input = { candidate: candidate('drive', 'deep-feet'), situation: situation('green', { contact: { x: 7, y: 4, heightFeet: 2.2 } }), players: structuredClone(players), draws: { lateral: .2345, depth: .6789 } };
  const before = JSON.stringify(input), one = resolveTargetV1(input), two = resolveTargetV1(input);
  assert.deepEqual(one, two);
  const flightInput = { candidate: input.candidate, contact: input.situation.contact, target: one, team: 'green' };
  const a = resolveFlightParametersV1(flightInput), b = resolveFlightParametersV1(flightInput);
  assert.deepEqual(a.physics, b.physics); assert.equal(a.attacking, b.attacking);
  assert.deepEqual(a.flight.sampleBoard(.3), b.flight.sampleBoard(.3));
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(input.situation), false);
});
