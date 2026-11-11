import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateRally } from '../rally-engine.js';
import { normalizeRallyInputV1 } from '../rally-recipe.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { inspectGeneratedTrainerSupportV1 } from '../generated-trainer-support.js';
const ids = ['player1', 'player2', 'player3', 'player4'];
for (const mirrored of [false, true]) test(`all 16 physical hand combinations retain legal coordinated stacks and exact trainer support (${mirrored})`, async () => {
  for (let pattern = 0; pattern < 16; pattern++) {
    const players = Object.fromEntries(ids.map((id, index) => [id, {
      team: index < 2 ? 'green' : 'orange', handedness: pattern & (1 << index) ? 'left' : 'right', style: 'advanced', flavour: 'balanced',
    }]));
    const service = { server: mirrored ? 'player3' : 'player1', receiver: mirrored ? 'player1' : 'player3',
      court: Boolean(pattern & 1) !== mirrored ? 'left' : 'right' };
    const stacking = { version: 'stacking-v1', teams: {
      green: { mode: 'full', leftPlayer: pattern & 2 ? 'player1' : 'player2' },
      orange: { mode: 'full', leftPlayer: pattern & 4 ? 'player3' : 'player4' },
    } };
    const input = { seed: 740 + pattern, players, service, stacking, options: { maxShots: 8 } };
    const before = JSON.stringify(input), normalized = normalizeRallyInputV1(input), result = await simulateRally(input);
    assert.ok(['complete', 'censored'].includes(result.status), JSON.stringify({ pattern, mirrored, diagnostics: result.diagnostics }));
    assert.equal(result.document.shots[0].hitter, service.server);
    if (result.document.shots.length > 1) assert.equal(result.document.shots[1].hitter, service.receiver);
    assert.deepEqual(result.document.initialLayout, normalized.layout);
    assert.deepEqual(result.document.stacking, stacking, 'physical hand must never silently select or exchange the preferred side');
    assert.deepEqual(result.recipe.input.stacking, stacking);
    for (const id of ids) assert.equal(result.document.players[id].handedness, players[id].handedness);
    const compiled = compileDocument(result.document), rules = validateRallyRules(compiled.play, compiled.timeline);
    assert.equal(compiled.validShotCount, result.document.shots.length); assert.deepEqual(compiled.findings.filter(row => row.severity === 'error'), []);
    assert.equal(rules.valid, true, JSON.stringify(rules.violations));
    const movement = inspectGeneratedMovementV1(compiled.timeline, { maxAccelerationFeetPerSecondSquared: 30 });
    assert.equal(movement.valid, true, JSON.stringify(movement)); assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
    const trainer = inspectGeneratedTrainerSupportV1({ timeline: compiled.timeline, players: result.document.players });
    assert.equal(trainer.valid, true, JSON.stringify(trainer)); assert.equal(trainer.checkedContacts, result.document.shots.length);
    for (const decision of result.decisions) {
      assert.equal(decision.resolution.trainerSupport.feasible, true);
      const attempts = decision.resolution.choiceAttempts.filter(attempt => attempt.executionDraws);
      assert.equal(attempts.length, 1, 'supported physical hand and stance may not be bought by rerolling execution');
      assert.deepEqual(attempts[0].executionDraws, decision.draws.execution);
    }
    assert.equal(JSON.stringify(input), before);
  }
});
