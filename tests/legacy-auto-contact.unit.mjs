import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { rankContactCandidatesV2 } from '../rally-policy.js';

function specimen(team, handedness, lateral, contactStyle = 'auto') {
  const document = createStarterDocument();
  const hitter = team === 'green' ? 'player1' : 'player3';
  const y = team === 'green' ? 14 : 30;
  document.opening = 'midrally';
  document.players[hitter].handedness = handedness;
  document.initialLayout[hitter] = { x: 10, y };
  document.initialLayout.ball = { x: 10 + lateral, y };
  document.shots = [{ id: 'automatic-side', family: 'drive', hitter, receiver: 'auto', contactStyle,
    target: { x: 10, y: team === 'green' ? 32 : 12 }, arc: 'medium', pace: 'medium',
    movement: { intent: 'hold', pinned: false } }];
  return document;
}

for (const team of ['green', 'orange']) for (const handedness of ['left', 'right']) {
  test(`legacy automatic contact follows anatomical ${handedness} hand on ${team} end`, () => {
    // Board +y faces world +z. A Green right hand is therefore toward low x;
    // Orange and left-handed contacts reflect that sign independently.
    const forehandSign = (team === 'green' ? -1 : 1) * (handedness === 'right' ? 1 : -1);
    for (const lateral of [-2, 2]) {
      const document = specimen(team, handedness, lateral), before = structuredClone(document);
      const expected = lateral * forehandSign > 0 ? 'forehand' : 'backhand';
      const compiled = compileDocument(document);
      assert.equal(compiled.validShotCount, 1);
      assert.deepEqual(compiled.findings, []);
      const actual = compiled.play.steps[1].shot.contact.strokeSide;
      assert.equal(actual, expected);
      const hitter = document.shots[0].hitter;
      const ranked = rankContactCandidatesV2({ eligible: [hitter], players: document.players,
        positions: document.initialLayout, contact: document.initialLayout.ball, availableSeconds: 0 });
      assert.equal(ranked[0].forehand, expected === 'forehand', 'legacy auto and physical ranking agree');
      assert.deepEqual(document, before, 'inference never rewrites the source');
    }
  });
}

test('explicit legacy forehand/backhand remains authoritative on either side of either hand', () => {
  for (const team of ['green', 'orange']) for (const hand of ['left', 'right']) {
    for (const lateral of [-2, 2]) for (const side of ['forehand', 'backhand']) {
      const document = specimen(team, hand, lateral, side), before = structuredClone(document);
      assert.equal(compileDocument(document).play.steps[1].shot.contact.strokeSide, side);
      assert.deepEqual(document, before);
    }
  }
});

test('legacy automatic near-center deadband retains its stable forehand convention', () => {
  for (const team of ['green', 'orange']) for (const hand of ['left', 'right']) {
    for (const lateral of [-.149, 0, .149]) {
      assert.equal(compileDocument(specimen(team, hand, lateral)).play.steps[1].shot.contact.strokeSide, 'forehand');
    }
  }
});

for (const team of ['green', 'orange']) for (const hand of ['left', 'right']) {
  test(`legacy automatic return renders its resolved contact side for ${team}/${hand}`, () => {
    const forehandSign = (team === 'green' ? -1 : 1) * (hand === 'right' ? 1 : -1);
    for (const lateral of [-2, 2]) {
      const document = specimen(team, hand, lateral);
      document.shots[0].family = 'return';
      const before = structuredClone(document), compiled = compileDocument(document);
      const expected = lateral * forehandSign > 0 ? 'forehand' : 'backhand';
      assert.equal(compiled.validShotCount, 1);
      assert.deepEqual(compiled.findings, []);
      const shot = compiled.play.steps[1].shot, semantics = compiled.timeline.segments[0].shotSemantics;
      assert.equal(shot.contact.strokeSide, expected);
      assert.equal(shot.type, expected);
      assert.equal(shot.stroke, expected);
      assert.equal(semantics.artAction, expected);
      assert.equal(semantics.visualStroke, expected);
      assert.deepEqual(document, before);
    }
  });
}
