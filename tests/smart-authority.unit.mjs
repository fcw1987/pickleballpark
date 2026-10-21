import test from 'node:test';
import assert from 'node:assert/strict';

import { proposeRandomRally } from '../smart-rally-generator.js';

test('Random Rally failure reports the caller supplied bounded search limits', async () => {
  const result = await proposeRandomRally({ length: 99, seed: 1, maxAttempts: 1, maxBacktracks: 0 });
  assert.equal(result.ok, false);
  assert.match(result.reason, /1 attempts per shot, 0 backtracks/);
  assert.doesNotMatch(result.reason, /48 attempts per shot, 12 backtracks/);
});
