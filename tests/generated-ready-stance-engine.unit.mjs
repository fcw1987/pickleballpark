import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateRally } from '../rally-engine.js';
import { compileDocument } from '../play-compiler.js';
import { normalizeRallyInputV1 } from '../rally-recipe.js';
import { validateRallyRules } from '../rally-rules.js';
import { sampleActorFeetV2, sampleActorBoardPositionV2 } from '../play-actors-v2.js';
import { contactFeetV1, contactFeetCandidatesV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { GENERATED_DEFAULT_FOOT_STATE_V1 } from '../generated-foot-state.js';
import { inspectGeneratedTrainerSupportV1 } from '../generated-trainer-support.js';
const ids = ['player1', 'player2', 'player3', 'player4'];
const outside = p => p.x < 0 || p.x > 20 || p.y < 15 || p.y > 29;

for (const near of [true, false]) test(`new mixed-hand rallies keep the declared adult-width neutral base through hitter and off-ball roles (${near})`, async () => {
  const players = Object.fromEntries(ids.map((id, index) => [id, {team: index < 2 ? 'green' : 'orange', handedness: index % 2 ? 'left' : 'right', style: 'advanced', flavour: 'balanced'}]));
  const result = await simulateRally({seed: 740, players, service: {server: near ? 'player1' : 'player3', receiver: near ? 'player3' : 'player1', court: 'right'}, options: {maxShots: 8}});
  assert.ok(['complete', 'censored'].includes(result.status), JSON.stringify(result.diagnostics));
  assert.deepEqual(result.document.defaultFootState, GENERATED_DEFAULT_FOOT_STATE_V1);
  const compiled = compileDocument(result.document);
  assert.equal(compiled.validShotCount, result.document.shots.length); assert.equal(validateRallyRules(compiled.play, compiled.timeline).valid, true);
  assert.equal(inspectGeneratedMovementV1(compiled.timeline, {maxAccelerationFeetPerSecondSquared: 30}).valid, true);
  assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
  assert.equal(inspectGeneratedTrainerSupportV1({timeline: compiled.timeline, players: result.document.players}).valid, true);
  let last = null;
  for (const segment of compiled.timeline.segments) {
    assert.deepEqual(segment.defaultFootState, GENERATED_DEFAULT_FOOT_STATE_V1);
    for (const time of [0, segment.contactTime, segment.duration / 4, segment.duration / 2, segment.duration]) for (const id of ids) {
      const feet = sampleActorFeetV2(segment, id, time), root = sampleActorBoardPositionV2(segment, id, time);
      assert.ok(Math.abs(Math.hypot(feet[1].x - feet[0].x, feet[1].y - feet[0].y) - 1.44) < 1e-8);
      assert.ok(Math.hypot((feet[0].x + feet[1].x) / 2 - root.x, (feet[0].y + feet[1].y) / 2 - root.y) < 1e-8);
    }
    const start = Object.fromEntries(ids.map(id => [id, sampleActorFeetV2(segment, id, 0).toSorted((a,b) => a.x - b.x)]));
    if (last) for (const id of ids) for (let foot = 0; foot < 2; foot++) assert.ok(Math.hypot(last[id][foot].x - start[id][foot].x, last[id][foot].y - start[id][foot].y) < 1e-6, `${id} cannot change width at a role boundary`);
    last = Object.fromEntries(ids.map(id => [id, sampleActorFeetV2(segment, id, segment.duration).toSorted((a,b) => a.x - b.x)]));
  }
});

test('the wider neutral base respects side-NVZ and apron feet rather than testing only body centers', () => {
  for (const team of ['green', 'orange']) for (const handedness of ['right', 'left']) {
    const near = team === 'green', x = near ? -1.5 : 21.5, y = near ? 17 : 27;
    const args = {contact: {x, y, heightFeet: 2}, target: {x: 10, y: near ? 32 : 12}, team, handedness, kind: 'volley', position: {x: near ? -.6 : 20.6, y}, availableSeconds: 1, defaultFootState: GENERATED_DEFAULT_FOOT_STATE_V1};
    for (const candidate of contactFeetCandidatesV1(args)) if (candidate.legalVolleyFeet) {
      assert.ok(candidate.feet.every(outside));
      assert.ok(candidate.feet.every(p => p.x >= -8 && p.x <= 28));
      assert.ok(Math.abs(Math.abs(candidate.feet[0].x - candidate.feet[1].x) - 1.44) < 1e-8);
    }
    const apron = contactFeetV1({...args, kind: 'groundstroke', contact: {x: near ? -7.8 : 27.8, y: near ? 10 : 34, heightFeet: 2}, position: undefined});
    assert.ok(apron.feet.every(p => p.x >= -8 - 1e-8 && p.x <= 28 + 1e-8));
  }
});

test('new ready stance does not silently move a user-supplied illegal serve layout', () => {
  const position = {x: .5, y: -1}, contact = {x: 1.3, y: 0, heightFeet: 2.2};
  const feet = contactFeetV1({contact, target: {x: 5, y: 40}, team: 'green', kind: 'serve', position, defaultFootState: GENERATED_DEFAULT_FOOT_STATE_V1});
  assert.deepEqual(feet.stance, position); assert.equal(feet.feet.some(p => p.x < 0), true);
});

for (const x of [-8, 28]) test(`new generation rejects an off-ball initial foot outside the apron without repairing the layout (${x})`, async () => {
  const input = structuredClone(normalizeRallyInputV1({seed: 740, options: {maxShots: 1}}));
  input.layout.player2.x = x;
  const before = JSON.stringify(input), result = await simulateRally(input);
  assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.code, 'generated-foot-apron', JSON.stringify(result.diagnostics));
  assert.equal(result.diagnostics.validation.footApron.actor, 'player2');
  assert.equal(result.diagnostics.validation.footApron.time, 0);
  assert.equal(result.document, null); assert.equal(JSON.stringify(input), before);
});
