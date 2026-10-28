import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playBackupFilename } from '../builder-ui.js';

test('backup filenames include the product and a portable play title', () => {
  assert.equal(playBackupFilename('Kitchen rally'), 'PickleballPark-Kitchen rally.json');
  assert.equal(playBackupFilename(' ../Serve\\Return: "A"?*<>|\u0000 '), 'PickleballPark-Serve-Return- -A.json');
  assert.equal(playBackupFilename('CON'), 'PickleballPark-CON.json');
  assert.equal(playBackupFilename(''), 'PickleballPark-Untitled play.json');
  assert.equal(playBackupFilename('...'), 'PickleballPark-Untitled play.json');
  assert.equal(playBackupFilename('  Dink   exchange  '), 'PickleballPark-Dink exchange.json');
  assert.equal(playBackupFilename('é'.repeat(150)), `PickleballPark-${'é'.repeat(100)}.json`);
});


test('long Unicode filenames stay within portable byte limits without splitting emoji', () => {
  assert.equal(playBackupFilename('🏓'.repeat(100)), `PickleballPark-${'🏓'.repeat(50)}.json`);
  assert.equal(playBackupFilename(`a${'🏓'.repeat(100)}`), `PickleballPark-a${'🏓'.repeat(49)}.json`);
  const name = playBackupFilename('球'.repeat(100));
  assert(new TextEncoder().encode(name).byteLength < 255);
  assert(!/[\uD800-\uDBFF]$/.test(name.replace(/\.json$/, '')));
});
