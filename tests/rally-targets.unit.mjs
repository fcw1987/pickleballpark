import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTargetV1, resolveFlightParametersV1, CLEARANCE_PRIORS_V1, OVERHEAD_LAUNCH_PRIORS_V1 } from '../rally-targets.js';
import { receivingServiceBox, SERVICE_COURT_CONVENTION } from '../rally-state.js';
import { isInServiceBox, isInNonVolleyZone } from '../court-geometry.js';
import { PHYSICS_VERSION, PHYSICS_V2, solveFlightV2 } from '../play-physics-v2.js';

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

test('deep attacks aim beyond the line so interception can happen before the nominal bounce', () => {
  for (const targetRegion of ['deep-feet', 'hip-middle', 'open-court', 'deep-overhead']) {
    const target = resolveTargetV1({ candidate: candidate('drive', targetRegion), situation: situation(), players, draws });
    assert.ok(target.y >= 36 && target.y <= 42);
    assert.ok(target.x > 0 && target.x < 20);
  }
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
