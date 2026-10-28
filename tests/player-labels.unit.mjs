import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlayerLabels, playerChoices } from '../player-labels.js';
import { createStarterDocument } from '../play-document.js';

test('player labels use team relative starting roles', () => {
  const labels = getPlayerLabels({ initialLayout: {
    player1: { x: 5, y: 14 }, player2: { x: 15, y: 14 },
    player3: { x: 5, y: 30 }, player4: { x: 15, y: 30 }
  } });
  assert.deepEqual(labels, {
    player1: 'Green Right', player2: 'Green Left',
    player3: 'Orange Left', player4: 'Orange Right'
  });
});

test('starter server and diagonal receiver labels agree with the declared left court', () => {
  const document = createStarterDocument(), labels = getPlayerLabels(document);
  assert.equal(document.service.court, 'left');
  assert.equal(labels[document.service.server], 'Green Left');
  assert.equal(labels[document.service.receiver], 'Orange Left');
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
