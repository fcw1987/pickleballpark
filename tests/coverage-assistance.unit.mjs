import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCoverageAssistance } from '../coverage-assistance.js';

const players = {
  player1: { team: 'green', handedness: 'right' }, player2: { team: 'green', handedness: 'left' },
  player3: { team: 'orange', handedness: 'right' }, player4: { team: 'orange', handedness: 'left' }
};
const positions = () => ({
  player1: { x: 4, y: 9 }, player2: { x: 16, y: 8 },
  player3: { x: 3, y: 35 }, player4: { x: 17, y: 34 }
});
const makeInputs = ({ auto = true, guides = true, team = 'both', pin = null } = {}) => {
  const play = { id: 'coverage', steps: [
    { id: 's1', positions: positions(), shot: { playerId: 'player1', from: { x: 3, y: 9 }, to: { x: 18, y: 37 } } },
    { id: 's2', positions: positions(), shot: { playerId: 'player3', from: { x: 4, y: 35 }, to: { x: 2, y: 5 } } },
    { id: 's3', positions: positions(), shot: { playerId: 'player1', from: { x: 5, y: 9 }, to: { x: 17, y: 37 } } }
  ] };
  const document = { players, assistance: { autoShading: auto, showGuides: guides, team }, shots: [
    { id: 's1', hitter: 'player1', movement: { intent: 'hold', pinned: pin === 'player1' }, ...(pin === 'player4' ? {playerMovement:{player4:{intent:'manual',pinned:true,target:{x:17,y:34}}}} : {}) },
    { id: 's2', hitter: 'player3', movement: { intent: 'hold', pinned: pin === 'player3' } },
    { id: 's3', hitter: 'player1', movement: { intent: 'hold', pinned: false } }
  ] };
  const timeline = { segments: play.steps.map((step, index) => ({ index, step: { id: step.id }, duration: 0.25 })) };
  return { play, document, timeline };
};

test('default-off assistance clones the play without changing derived positions', () => {
  const inputs = makeInputs({ auto: false, guides: false });
  const result = applyCoverageAssistance(inputs.play, { players, shots: [] }, inputs.timeline);
  assert.deepEqual(result.play, inputs.play);
  assert.notEqual(result.play, inputs.play);
  assert.deepEqual(result.coverage, []);
});

test('coverage guides never enable movement and identify guide-only suggestions', () => {
  const inputs = makeInputs({ auto: false, guides: true });
  Object.freeze(inputs.play);
  const result = applyCoverageAssistance(inputs.play, inputs.document, inputs.timeline);
  assert.deepEqual(result.play, inputs.play);
  assert(result.coverage.length > 0);
  assert(result.coverage.every(item => item.explanation.includes('Guide only')));
});

test('uses a current-leg partner pin without changing the canonical assistance setting', () => {
  const inputs = makeInputs({ auto: true, guides: true, pin: 'player4' });
  const result = applyCoverageAssistance(inputs.play, inputs.document, inputs.timeline);
  assert(result.coverage.length > 0);
  assert.equal(result.play.steps[0].positions.player4.x, inputs.play.steps[0].positions.player4.x);
  assert.match(result.coverage[0].explanation, /Preserved .*player4/);
});

test('current-leg suggestions use contact origin and ignore the future authored target', () => {
  const first = makeInputs({ auto: false, guides: true });
  const changed = makeInputs({ auto: false, guides: true });
  changed.play.steps[1].shot.to = { x: 19, y: 3 };
  const a = applyCoverageAssistance(first.play, first.document, first.timeline).coverage[0];
  const b = applyCoverageAssistance(changed.play, changed.document, changed.timeline).coverage[0];
  assert.deepEqual(a, b);
  assert.deepEqual(a.threat, first.play.steps[0].shot.from);
});

test('auto shading preserves receiver, hitter, manual pins, depth, and all shot facts', () => {
  const inputs = makeInputs({ pin: 'player4' });
  const original = structuredClone(inputs.play);
  const result = applyCoverageAssistance(inputs.play, inputs.document, inputs.timeline);
  assert.deepEqual(inputs.play, original);
  assert.deepEqual(result.play.steps[0].positions, original.steps[0].positions);
  for (let index = 0; index < result.play.steps.length; index += 1) {
    assert.deepEqual(result.play.steps[index].shot, original.steps[index].shot);
    for (const id of Object.keys(original.steps[index].positions)) {
      assert.equal(result.play.steps[index].positions[id].y, original.steps[index].positions[id].y);
    }
  }
  assert(result.coverage[0].explanation.includes('Preserved player3, player4'));
});

test('applies selected-team movement in both team directions without hitter swaps', () => {
  const inputs = makeInputs();
  const result = applyCoverageAssistance(inputs.play, inputs.document, inputs.timeline);
  assert.equal(result.play.steps[0].shot.playerId, 'player1');
  assert.equal(result.play.steps[1].shot.playerId, 'player3');
  assert.notEqual(result.play.steps[0].positions.player4.x, inputs.play.steps[0].positions.player4.x);
  assert.notEqual(result.play.steps[1].positions.player2.x, inputs.play.steps[1].positions.player2.x);

  const greenOnly = makeInputs({ team: 'green' });
  const selected = applyCoverageAssistance(greenOnly.play, greenOnly.document, greenOnly.timeline);
  assert.deepEqual(selected.play.steps[0].positions, greenOnly.play.steps[0].positions);
  assert.notEqual(selected.play.steps[1].positions.player2.x, greenOnly.play.steps[1].positions.player2.x);
  assert(selected.coverage.every(item => item.team === 'green'));
});

test('bounds lateral travel by duration and court limits deterministically', () => {
  const inputs = makeInputs();
  inputs.play.steps[0].positions.player4.x = 19;
  inputs.timeline.segments[0].duration = 0.05;
  const first = applyCoverageAssistance(inputs.play, inputs.document, inputs.timeline);
  const second = applyCoverageAssistance(inputs.play, inputs.document, inputs.timeline);
  const moved = first.play.steps[0].positions.player4.x;
  assert(moved >= 1 && moved <= 19);
  assert(Math.abs(moved - 19) <= 13 * 0.05 + Number.EPSILON);
  assert.deepEqual(first, second);
});
