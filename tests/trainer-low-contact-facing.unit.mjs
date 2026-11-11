import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trainerContactFacing, evaluateTrainerContactSupport, TRAINER_CONTACT_SUPPORT_REVISION, TRAINER_SUPPORT_LIMITS } from '../trainer-contact-support.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/trainer-low-contact-facing-v3.json', import.meta.url), 'utf8'));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angular = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const yaw = facing => Math.atan2(facing.x, facing.z);
const input = (height = .2) => ({ rawFacing: { x: -.7, z: .7 }, root: { x: 0, y: 0, z: -3 },
  contact: { x: .15, y: height, z: -2.3 }, family: 'drop', strokeSide: 'forehand', modelVersion: 2 });

test('low-contact facing is an explicit Model-2 posture preference with unchanged hard dimensions', () => {
  assert.equal(TRAINER_CONTACT_SUPPORT_REVISION, 'trainer-contact-support-v3');
  assert.deepEqual(TRAINER_SUPPORT_LIMITS, { profileVersion: 'human-athlete-profile-v1',
    maximumArmReach: .33 + .29 - 1e-6, minimumArmReach: Math.abs(.33 - .29) + 1e-6,
    maximumLegReach: .45 + .43 - 1e-6, minimumLegReach: Math.abs(.45 - .43) + 1e-6,
    minimumHipHeight: .36, maximumHipHeight: .985, maximumHipHorizontalOffset: .24 });
  const original = input(), before = JSON.stringify(original), active = trainerContactFacing(original);
  const legacy = trainerContactFacing({ ...original, modelVersion: 1 });
  assert.ok(Math.abs(angular(yaw(active), yaw(legacy))) > .1);
  assert.deepEqual(trainerContactFacing({ ...original, modelVersion: undefined }), legacy);
  assert.deepEqual(trainerContactFacing({ ...original, modelVersion: null }), legacy);
  const planar = { ...original, contact: { x: original.contact.x, z: original.contact.z } };
  assert.deepEqual(trainerContactFacing(planar), trainerContactFacing({ ...planar, modelVersion: 1 }));
  assert.equal(JSON.stringify(original), before);
});

test('high contacts, rearward contacts, serve, lob and overhead keep their prior facing', () => {
  for (const family of ['serve', 'lob', 'overhead', 'ready']) for (const height of [.2, .5, 1.1]) {
    const value = { ...input(height), family };
    assert.deepEqual(trainerContactFacing(value), trainerContactFacing({ ...value, modelVersion: 1 }));
  }
  for (const height of [.8, 1, 2.3]) {
    const value = input(height);
    assert.deepEqual(trainerContactFacing(value), trainerContactFacing({ ...value, modelVersion: 1 }));
  }
  for (const x of [-.3, -1e-9, 0, 1e-9, .3]) {
    const value = { ...input(), contact: { x, y: .2, z: -4 } };
    assert.deepEqual(trainerContactFacing(value), trainerContactFacing({ ...value, modelVersion: 1 }),
      'directly rearward ambiguity is unchanged, not a new yaw flip');
  }
});

test('the added preference is continuous at height, proximity and rear-sector blend boundaries', () => {
  const addedYaw = value => angular(yaw(trainerContactFacing(value)), yaw(trainerContactFacing({ ...value, modelVersion: 1 })));
  for (const epsilon of [1e-5, 1e-6, 1e-7]) {
    for (const boundary of [.3, .8]) assert.ok(Math.abs(addedYaw(input(boundary - epsilon)) - addedYaw(input(boundary + epsilon))) < epsilon * 2);
    for (const radius of [.1, .3]) {
      const sample = r => ({ ...input(), contact: { x: r * .6, y: .2, z: -3 + r * .8 } });
      assert.ok(Math.abs(addedYaw(sample(radius - epsilon)) - addedYaw(sample(radius + epsilon))) < epsilon * 2,
        'the new increment vanishes at the existing close-contact early-return boundary');
    }
    for (const cosine of [-.8, -.2]) {
      const sample = c => ({ ...input(), contact: { x: .7 * Math.sqrt(1 - c * c), y: .2, z: -3 + .7 * c } });
      // acos(c) has derivative 1/sqrt(1-c*c), which is already > 1
      // at both boundaries. The target yaw is clamped throughout this rear
      // sector. Bound the unchanged bearing variation analytically, plus the
      // new smoothstep's quadratic endpoint error; do not assume unit slope.
      const bearingVariation = 2 * epsilon / Math.sqrt(1 - (Math.abs(cosine) + epsilon) ** 2);
      const blendVariation = 3 * (epsilon / .6) ** 2 * (5 * Math.PI / 6);
      assert.ok(Math.abs(addedYaw(sample(cosine - epsilon)) - addedYaw(sample(cosine + epsilon)))
        <= bearingVariation + blendVariation + 1e-12);
    }
  }
});

function transform(source, mode) {
  const result = structuredClone(source);
  const vector = p => ({ ...p, x: -p.x, ...(mode === 'rotate' ? { z: -p.z } : {}) });
  for (const key of ['root', 'contact', 'bodyFacing', 'outgoingVelocity', 'incomingVelocity']) if (result[key]) result[key] = vector(result[key]);
  result.feet = mode === 'reflect' ? { left: vector(source.feet.right), right: vector(source.feet.left) }
    : { left: vector(source.feet.left), right: vector(source.feet.right) };
  if (mode === 'reflect') result.handedness = source.handedness === 'left' ? 'right' : 'left';
  if (result.coachingFootwork) {
    result.coachingFootwork.feet = structuredClone(result.feet);
    result.coachingFootwork.footYaw = { left: result.root.z < 0 ? 0 : Math.PI, right: result.root.z < 0 ? 0 : Math.PI };
  }
  return result;
}
for (const witness of fixture.cases) test(`fixed source obtains genuine grounded contact without moving feet or changing hand: ${witness.id}`, () => {
  const before = JSON.stringify(witness.input), base = evaluateTrainerContactSupport(witness.input);
  assert.equal(base.supported, true); assert.equal(base.feasible, true);
  assert.ok(base.reachError <= 1e-5); assert.ok(base.legError < 1e-7); assert.ok(base.diagnostics.boundsError < 1e-7);
  assert.ok(distance(base.world.face, witness.input.contact) <= 1e-5);
  for (const mode of ['reflect', 'rotate']) {
    const value = transform(witness.input, mode), saved = JSON.stringify(value), result = evaluateTrainerContactSupport(value);
    assert.equal(result.feasible, true); assert.ok(Math.abs(result.reachError - base.reachError) < 1e-8);
    assert.ok(distance(result.world.face, value.contact) <= 1e-5); assert.equal(JSON.stringify(value), saved);
  }
  assert.equal(JSON.stringify(witness.input), before);
});
