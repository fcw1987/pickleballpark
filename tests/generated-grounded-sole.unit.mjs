import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_GROUNDED_SOLE_V1 as sole, groundedSoleBoundsV1, groundedSoleClearsNVZV1, groundedSoleClearsServeV1 } from '../generated-grounded-sole.js';
import { GENERATED_DEFAULT_FOOT_STATE_V1 as marker, defaultFeetAtV1 } from '../generated-foot-state.js';
import { contactFeetV1, contactFeetCandidatesV1, planMovementV1 } from '../rally-movement.js';

test('planted sole geometry uses the verified centered enclosure without changing actor size', () => {
  assert.ok(Object.isFrozen(sole)); assert.equal(sole.version, 'generated-grounded-sole-v1');
  assert.equal(sole.scope, 'planted-contact-only');
  assert.equal(sole.halfWidthMetres, .0525); assert.equal(sole.halfDepthMetres, .135);
  assert.equal(sole.halfWidthFeet, .0525 / .3048); assert.equal(sole.halfDepthFeet, .135 / .3048);
  assert.equal(sole.plannerInsetFeet, 1e-5);
  const foot = { x: 5, y: 14.25 }, before = JSON.stringify(foot), bounds = groundedSoleBoundsV1(foot);
  assert.deepEqual(bounds, { minX: foot.x - sole.halfWidthFeet, maxX: foot.x + sole.halfWidthFeet,
    minY: foot.y - sole.halfDepthFeet, maxY: foot.y + sole.halfDepthFeet });
  assert.ok(Object.isFrozen(bounds)); assert.equal(JSON.stringify(foot), before);
  for (const bad of [null, {}, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) {
    for (const inspect of [groundedSoleBoundsV1, groundedSoleClearsNVZV1]) assert.throws(() => inspect(bad), /finite/);
  }
});

test('NVZ sole contact at every edge and corner is rejected; genuine clearance is strict', () => {
  const x = sole.halfWidthFeet, y = sole.halfDepthFeet, delta = 1e-8;
  for (const [foot, clear, overlap] of [
    [{ x: -x, y: 22 }, { x: -x - delta, y: 22 }, { x: -x + delta, y: 22 }],
    [{ x: 20 + x, y: 22 }, { x: 20 + x + delta, y: 22 }, { x: 20 + x - delta, y: 22 }],
    [{ x: 10, y: 15 - y }, { x: 10, y: 15 - y - delta }, { x: 10, y: 15 - y + delta }],
    [{ x: 10, y: 29 + y }, { x: 10, y: 29 + y + delta }, { x: 10, y: 29 + y - delta }],
  ]) {
    assert.equal(groundedSoleClearsNVZV1(foot), false); assert.equal(groundedSoleClearsNVZV1(clear), true);
    assert.equal(groundedSoleClearsNVZV1(overlap), false);
  }
  for (const xx of [-x, 20 + x]) for (const yy of [15 - y, 29 + y]) assert.equal(groundedSoleClearsNVZV1({ x: xx, y: yy }), false);
});

for (const team of ['green', 'orange']) for (const court of ['right', 'left']) {
  test(`serve sole permits lateral extension equality but never baseline contact (${team}/${court})`, () => {
    const near = team === 'green', minX = near === (court === 'right') ? 0 : 10, maxX = minX + 10;
    const y = near ? -1 : 45, context = { team, court }, delta = 1e-8;
    for (const [x, outsideX] of [[minX + sole.halfWidthFeet, minX + sole.halfWidthFeet - delta],
      [maxX - sole.halfWidthFeet, maxX - sole.halfWidthFeet + delta]]) {
      assert.equal(groundedSoleClearsServeV1({ x, y }, context), true);
      assert.equal(groundedSoleClearsServeV1({ x: outsideX, y }, context), false);
    }
    const x = (minX + maxX) / 2, boundary = near ? -sole.halfDepthFeet : 44 + sole.halfDepthFeet;
    assert.equal(groundedSoleClearsServeV1({ x, y: boundary }, context), false);
    assert.equal(groundedSoleClearsServeV1({ x, y: boundary + (near ? -delta : delta) }, context), true);
    assert.equal(groundedSoleClearsServeV1({ x, y: boundary + (near ? delta : -delta) }, context), false);
    assert.equal(groundedSoleClearsServeV1({ x, y }, { team, court: court === 'right' ? 'left' : 'right' }), false);
    for (const hand of ['left', 'right']) {
      const position = { x, y: near ? -.1 : 44.1 }, before = JSON.stringify(position);
      const candidate = contactFeetV1({ contact: { x, y: near ? 0 : 44, heightFeet: 2.2 }, target: { x: 20 - x, y: near ? 40 : 4 },
        team, handedness: hand, kind: 'serve', position, defaultFootState: marker });
      assert.deepEqual(candidate.stance, position); assert.equal(JSON.stringify(position), before);
      assert.ok(candidate.feet.every(foot => !groundedSoleClearsServeV1(foot, context)), 'an explicit illegal serve layout is never repaired');
    }
  });
}

for (const team of ['green', 'orange']) for (const left of [true, false]) for (const handedness of ['left', 'right']) {
  test(`marked side-volley candidates clear the actual sole (${team}/${left ? 'left' : 'right'}/${handedness})`, () => {
    const near = team === 'green', args = { contact: { x: left ? -1.5 : 21.5, y: near ? 17 : 27, heightFeet: 2 },
      target: { x: 10, y: near ? 32 : 12 }, position: { x: left ? -.6 : 20.6, y: near ? 17 : 27 },
      team, handedness, kind: 'volley', availableSeconds: 1, defaultFootState: marker };
    const before = JSON.stringify(args), candidates = contactFeetCandidatesV1(args);
    assert.ok(candidates.length <= 8); assert.ok(candidates.some(candidate => candidate.reachable && candidate.legalVolleyFeet));
    for (const candidate of candidates.filter(item => item.legalVolleyFeet)) assert.ok(candidate.feet.every(groundedSoleClearsNVZV1));
    assert.equal(JSON.stringify(args), before);
  });
}

for (const team of ['green', 'orange']) test(`legal nearer-line contacts remain distinct from the recovery preference (${team})`, () => {
  const near = team === 'green', map = p => near ? p : { x: 20 - p.x, y: 44 - p.y };
  const args = { contact: { ...map({ x: 10, y: 15.14 }), heightFeet: 1.1 }, target: map({ x: 10, y: 32 }),
    team, handedness: 'right', kind: 'volley', position: map({ x: 11, y: 14.49 }), availableSeconds: .25 };
  const generated = contactFeetV1({ ...args, defaultFootState: marker }), legacy = contactFeetV1(args);
  assert.deepEqual(generated.stance, args.position); assert.equal(generated.travelFeet, 0);
  assert.ok(generated.feet.every(groundedSoleClearsNVZV1));
  assert.equal(legacy.stance.y, near ? 14.25 : 29.75, 'unmarked helper keeps the old ready-line clipping');
  const hitter = near ? 'player1' : 'player3';
  const positions = { player1: { x: 5, y: 14.25 }, player2: { x: 17, y: 14.25 }, player3: { x: 5, y: 29.75 }, player4: { x: 17, y: 29.75 } };
  positions[hitter] = generated.stance;
  const players = Object.fromEntries(Object.keys(positions).map((id, index) => [id, { team: index < 2 ? 'green' : 'orange', handedness: 'right' }]));
  const movement = planMovementV1({ positions, players, hitter, contact: args.contact, target: args.target, durationSeconds: 1,
    opening: 'midrally', index: 3, family: 'dink', kind: 'volley', contactFeet: generated.feet, defaultFootState: marker });
  assert.equal(movement.ok, true); assert.equal(movement.diagnostics.goals[hitter].y, near ? 14.25 : 29.75);
});

test('new contact-foot validation rejects explicit sole overlap without widening or moving its source', () => {
  const positions = { player1: { x: 8, y: 14.8 }, player2: { x: 17, y: 14 }, player3: { x: 5, y: 30 }, player4: { x: 17, y: 30 } };
  const players = Object.fromEntries(Object.keys(positions).map((id, index) => [id, { team: index < 2 ? 'green' : 'orange', handedness: 'right' }]));
  const args = { positions, players, hitter: 'player1', contact: { x: 7, y: 14.8 }, target: { x: 7, y: 30 }, durationSeconds: 1,
    opening: 'midrally', index: 3, family: 'volley', kind: 'volley', contactFeet: defaultFeetAtV1(positions.player1, marker) };
  const before = JSON.stringify(args);
  assert.equal(planMovementV1({ ...args, defaultFootState: marker }).ok, false);
  assert.equal(planMovementV1(args).ok, true, 'old unmarked point-foot helper behavior stays available');
  assert.equal(JSON.stringify(args), before);
});
