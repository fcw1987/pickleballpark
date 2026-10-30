import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateRally } from '../rally-engine.js';
import { validateDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';

// Exact complete job.input records from failed-8-full-records.json in the
// pr26-quality-40992222059 archive. These are individual fixed regressions,
// not a new holdout/cohort run or a recalibration of that archived evidence.
for (const [style, seed] of [['pro', 51127], ['intermediate', 50175]]) {
  test(`archived ${style} ${seed} does not confuse saved signature identity with reply intent`, async () => {
    const input = { seed, players: Object.fromEntries(['player1', 'player2', 'player3', 'player4'].map((id, index) =>
      [id, { team: index < 2 ? 'green' : 'orange', handedness: 'right', style, flavour: 'balanced' }])),
      service: { server: 'player3', receiver: 'player1', court: 'left', courtConvention: 'server-perspective-v1' },
      options: { lengthFeel: 'natural', winner: 'either', signatureShots: true, maxShots: 99 } };
    const result = await simulateRally(input);
    assert.doesNotMatch(JSON.stringify(result.diagnostics), /Reply support requires bounded known paddle-contact candidate IDs/);
    assert.ok(['complete', 'censored'].includes(result.status), JSON.stringify(result.diagnostics));
    validateDocument(result.document);
    const compiled = compileDocument(result.document);
    assert.equal(compiled.validShotCount, result.document.shots.length, JSON.stringify(compiled.findings));
    assert.deepEqual(compiled.findings.filter(item => item.severity === 'error'), []);
    assert.deepEqual(validateRallyRules(compiled.play, compiled.timeline).violations, []);
  });
}
