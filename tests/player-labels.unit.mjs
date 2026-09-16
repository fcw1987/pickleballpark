import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlayerLabels, playerChoices } from '../player-labels.js';

test('player labels use team relative starting roles', () => {
  const labels = getPlayerLabels({ initialLayout: {
    player1: { x: 5, y: 14 }, player2: { x: 15, y: 14 },
    player3: { x: 5, y: 30 }, player4: { x: 15, y: 30 }
  } });
  assert.deepEqual(labels, {
    player1: 'Green Left', player2: 'Green Right',
    player3: 'Orange Right', player4: 'Orange Left'
  });
});

test('stacked and missing starting layouts fall back to stable id order', () => {
  const stacked = getPlayerLabels({ initialLayout: {
    player1: { x: 10, y: 14 }, player2: { x: 10, y: 14 },
    player3: { x: 15, y: 30 }, player4: { x: 15, y: 30 }
  } });
  assert.equal(stacked.player1, 'Green A');
  assert.equal(stacked.player2, 'Green B');
  assert.equal(stacked.player3, 'Orange A');
  assert.equal(stacked.player4, 'Orange B');
  assert.deepEqual(playerChoices({}), [
    ['player1', 'Green A'], ['player2', 'Green B'],
    ['player3', 'Orange A'], ['player4', 'Orange B']
  ]);
});
