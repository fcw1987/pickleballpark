// Bounded reproducible report for real generated plays; no rejected-positive pass.
import assert from 'node:assert/strict';
import { proposeRandomRally } from '../smart-rally-generator.js';
import { compileEffectiveCandidate } from '../rally-proposals.js';

const seeds = [0, 5, 0x01352531, 0xffffffff];
const lengths = [1, 7, 63, 64, 65, 98, 99];
const observed = Object.fromEntries(['family', 'arc', 'pace', 'hitter', 'contactStyle', 'targetWidth', 'targetDepth'].map(key => [key, {}]));
const count = (key, value) => { observed[key][value] = (observed[key][value] || 0) + 1; };
const records = [];
for (const seed of seeds) for (const length of lengths) {
  const started = performance.now();
  const first = await proposeRandomRally({ seed, length });
  assert.ok(first.ok, `${seed}/${length}: ${first.reason}`);
  assert.equal(first.document.shots.length, length);
  const second = await proposeRandomRally({ seed, length });
  assert.ok(second.ok, second.reason);
  assert.deepEqual(second.document, first.document);
  const compiled = compileEffectiveCandidate(first.document);
  assert.equal(compiled.validShotCount, length);
  assert.equal(compiled.timeline.events.filter(event => event.type === 'contact').length, length);
  assert.equal(new Set(first.document.shots.map(shot => shot.id)).size, length);
  for (const shot of first.document.shots) {
    for (const key of ['family', 'arc', 'pace', 'hitter', 'contactStyle']) count(key, shot[key]);
    count('targetWidth', shot.target.x < 7 ? 'left' : shot.target.x > 13 ? 'right' : 'middle');
    const depth = Math.min(shot.target.y, 44 - shot.target.y);
    count('targetDepth', depth < 8 ? 'deep' : depth < 13 ? 'transition' : 'short');
  }
  records.push({ seed, hits: length, contacts: length, families: [...new Set(first.document.shots.map(shot => shot.family))], elapsedIncludingDeterminismMs: performance.now() - started });
}
console.log(JSON.stringify({ status: 'PASS', generatorVersion: 'smart-rally-v1', seeds, lengths, documents: records.length, repeatedGenerationChecks: records.length, authoredHits: records.reduce((sum, item) => sum + item.hits, 0), observed, records }, null, 2));
