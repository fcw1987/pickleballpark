import test from 'node:test';
import assert from 'node:assert/strict';
import { narrateShotV1, summarizePointV1, excitementScoreV1, NARRATED_INTENTS } from '../rally-narration.js';
import { MODEL2_INTENTS, validateDocument } from '../play-document.js';
import { model2Document } from './fixtures/model2/factories.mjs';

test('every persisted intent has deterministic bounded inert narration', () => {
  assert.deepEqual(NARRATED_INTENTS.toSorted(), [...new Set(MODEL2_INTENTS)].toSorted());
  for (const intent of NARRATED_INTENTS) for (const draw of [0, .4, .999999]) {
    const situation = { hittingTeam: 'green', opponentTeam: 'orange', incomingHeightClass: 'neutral' };
    const first = narrateShotV1({ intent, situation, draw });
    assert.deepEqual(first, narrateShotV1({ intent, situation, draw }));
    assert.ok(first.label.length <= 40 && first.why.length <= 160);
    const document = model2Document(); document.shots[0].narration = first;
    assert.equal(validateDocument(document), document);
  }
});

test('template variety consumes only the supplied narration draw', () => {
  const situation = { hittingTeam: 'orange', phase: 'kitchen', opponentFormation: 'up' };
  const choices = [0, .4, .8].map(draw => narrateShotV1({ intent: 'cross-court-dink', situation, draw }));
  assert.equal(new Set(choices.map(choice => choice.why)).size, 3);
  assert.ok(choices.every(choice => choice.why.startsWith('Orange:')));
  assert.throws(() => narrateShotV1({ intent: 'invent-a-winner' }), /supported/);
  for (const draw of [-1, 1, NaN, Infinity]) assert.throws(() => narrateShotV1({ intent: 'serve', draw }), /draw/);
});

test('arbitrary labels, markup and prototype identifiers never enter emitted copy', () => {
  for (const hittingTeam of ['<script>', 'https://example.com', 'constructor', '__proto__']) {
    const output = narrateShotV1({ intent: 'reset', situation: { hittingTeam } });
    assert.equal(output.why.includes(hittingTeam), false);
    assert.doesNotMatch(output.why, /[<>]|https:/);
  }
  for (const intent of ['constructor', '__proto__']) assert.throws(() => narrateShotV1({ intent }), /supported/);
});

test('point summaries retain physical reasons without claiming heuristic causation as fact', () => {
  const outcome = { winner: 'green', reason: 'long', shotId: 's2' };
  const decisions = [{ intent: 'cross-court-dink', situation: { attackable: false } }, { intent: 'counter', situation: { attackable: true } }];
  const value = summarizePointV1({ outcome, decisions, classification: { kind: 'forced-error' }, draw: 0 });
  assert.match(value, /Point Green: the ball landed long/);
  assert.match(value, /Key moment: shot 2, counter/);
  assert.doesNotMatch(value, /forced|unforced|certain/);
  assert.equal(value, summarizePointV1({ outcome, decisions, classification: { kind: 'unknown' }, draw: 0 }));
  for (const reason of ['net', 'wide', 'unreachable', 'second-bounce', 'body', 'nvz-foot', 'nvz-momentum', 'two-bounce']) {
    assert.ok(summarizePointV1({ outcome: { ...outcome, reason }, decisions }).length <= 240);
  }
  assert.throws(() => summarizePointV1({ outcome: { winner: 'constructor', reason: 'long' } }), /physical outcome/);
  assert.throws(() => summarizePointV1({ outcome: { winner: 'green', reason: '__proto__' } }), /physical outcome/);
});

test('excitement is an explicit stable heuristic with bounded components', () => {
  const input = { shots: 25, handsExchanges: 4, paceChanges: 6, signatureShots: 1, retrievals: 2, pressureSwings: 3 };
  const before = JSON.stringify(input), score = excitementScoreV1(input);
  assert.deepEqual(score, excitementScoreV1(input));
  assert.equal(score.version, 'rally-excitement-v1'); assert.equal(score.heuristic, true);
  assert.ok(score.score >= 0 && score.score <= 100); assert.ok(Object.isFrozen(score.components));
  assert.equal(JSON.stringify(input), before);
  assert.ok(excitementScoreV1({ shots: 30 }).score > excitementScoreV1({ shots: 3 }).score);
  for (const value of [-1, 100, NaN, 1.5]) assert.throws(() => excitementScoreV1({ shots: value }), /integer/);
});
