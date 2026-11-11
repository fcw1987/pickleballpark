import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterDocument } from '../play-document.js';
import { compileDocument, automaticActorPeakSpeed } from '../play-compiler.js';
import { evaluateCandidate, automaticOwnership, SMART_GENERATOR_VERSION } from '../rally-proposals.js';
import { proposeRandomRally, proposeSmartAdd } from '../smart-rally-generator.js';
import { samplePlayState } from '../three-d-core.js';

const ids = ['player1', 'player2', 'player3', 'player4'];
const logicalPeak = (segment, id) => {
  const from = segment.previous.positions[id], to = segment.step.positions[id];
  return 2 * Math.hypot(to.x - from.x, to.y - from.y) / segment.duration;
};

// Keep the failing choices explicit: regenerating a seed after the repair must
// not erase the input that exposed the independent logical/plant route bounds.
function shortenedPlantRoute() {
  const source = createStarterDocument();
  delete source.templateSource;
  source.shots = [
    ['serve', 'player1', 3.5, 37, 'low', 'medium'],
    ['return', 'player3', 15.5, 5, 'medium', 'firm'],
    ['drop', 'player1', 15.5, 28, 'medium', 'soft'],
    ['volley', 'player4', 10, 14, 'low', 'medium'],
    ['dink', 'player1', 13, 27, 'high', 'soft']
  ].map(([family, hitter, x, y, arc, pace], index) => ({
    id: `smart-shot-${index + 1}`, family, hitter,
    receiver: index === 0 ? 'player3' : 'auto', contactStyle: 'auto',
    target: {x, y}, arc, pace, movement: {intent: 'advance', pinned: false},
    authoring: automaticOwnership(['family', 'hitter', 'receiver', 'contactStyle', 'target', 'arc', 'pace', 'movement', 'serveMethod']),
    ...(family === 'serve' ? {serveMethod: 'volley'} : {}),
    generation: {seed: 42, generatorVersion: SMART_GENERATOR_VERSION}
  }));
  return source;
}

test('Smart admission rejects a fast logical route even when the contact plant makes the actor route safe', async () => {
  const source = shortenedPlantRoute(), before = structuredClone(source);
  const evaluation = evaluateCandidate(source);
  assert.equal(evaluation.ok, true, 'generic authored compilation and sport rules remain separate from Smart tactical admission');
  const segment = evaluation.compiled.timeline.segments.find(segment => segment.step.id === 'smart-shot-4');
  const peak = logicalPeak(segment, 'player1');
  assert.ok(peak > 18, `reproduced logical peak ${peak}`);
  assert.ok(automaticActorPeakSpeed(segment, 'player1', source.players.player1.handedness) < 18,
    'the actual planted body route alone cannot detect this failure');
  // Verify the failing route against the production board sampler as well as
  // endpoint arithmetic. Its midpoint derivative approaches the exact peak.
  const half = segment.startTime + segment.duration / 2, delta = 1e-5;
  const a = samplePlayState(evaluation.compiled.timeline, half - delta).positions.player1;
  const b = samplePlayState(evaluation.compiled.timeline, half + delta).positions.player1;
  const sampledSpeed = Math.hypot(b.x - a.x, b.y - a.y) / (2 * delta);
  assert.ok(sampledSpeed > 18 && Math.abs(sampledSpeed - peak) < .001);
  const proposal = await proposeSmartAdd(source, {seed: 1});
  assert.equal(proposal.ok, false, 'an existing unsafe automatic prefix must be rejected before appending');
  assert.match(proposal.reason, /recovery time or doubles spacing/);
  assert.deepEqual(source, before, 'rejecting an unsafe prefix does not rewrite its choices');
});

test('Smart route bounds preserve the existing authored movement acceptance boundary', async () => {
  const source = shortenedPlantRoute();
  source.shots[3].authoring = {ownership: 'authored', fields: []};
  source.shots[3].movement = {intent: 'hold', pinned: false};
  const before = structuredClone(source), compiled = compileDocument(source);
  assert.ok(logicalPeak(compiled.timeline.segments[3], 'player1') > 18);
  const proposal = await proposeSmartAdd(source, {seed: 1});
  assert.equal(proposal.ok, true, proposal.reason);
  assert.deepEqual(source, before);
  assert.deepEqual(proposal.document.shots.slice(0, source.shots.length), source.shots);
});

for (const [length, seed] of [[7, 42], [60, 42], [60, 17]]) {
  test(`Smart ${length}-hit seed ${seed} bounds logical and planted routes independently`, async () => {
    const proposal = await proposeRandomRally({length, seed});
    assert.equal(proposal.ok, true, proposal.reason);
    const source = structuredClone(proposal.document), compiled = compileDocument(proposal.document);
    assert.equal(compiled.validShotCount, length);
    for (const segment of compiled.timeline.segments) for (const id of ids) {
      assert.ok(logicalPeak(segment, id) <= 18 + 1e-8,
        `${segment.step.id}/${id}: bounded logical eased route`);
      assert.ok(automaticActorPeakSpeed(segment, id, source.players[id].handedness) <= 18 + 1e-8,
        `${segment.step.id}/${id}: bounded actual planted route`);
    }
    assert.deepEqual(proposal.document, source);
  });
}
