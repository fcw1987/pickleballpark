import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { NVZ_MODEL_LIMITS_NOTE, validateRallyRules } from '../rally-rules.js';

function contactDocument(family, { contactStyle = 'forehand', movementY = 16 } = {}) {
  const document = createStarterDocument();
  document.opening = 'midrally';
  document.initialLayout.ball = { x: 7, y: 14 };
  document.initialLayout.player1 = { x: 7, y: 14 };
  document.shots = [{
    id: 'nvz-contact', family, hitter: 'player1', receiver: 'auto', contactStyle,
    target: { x: 7, y: 32 }, arc: 'medium', pace: 'medium',
    movement: { intent: 'manual', pinned: true, target: { x: 7, y: movementY } }
  }];
  return document;
}

test('volley entry explains unmodeled NVZ history without inventing a fault or changing authored movement', () => {
  for (const family of ['volley', 'reset', 'overhead']) {
    const document = contactDocument(family);
    const before = structuredClone(document);
    const result = compileDocument(document);
    const warning = result.findings.find(item => item.kind === 'context');
    assert.equal(result.validShotCount, 1, family);
    assert.equal(warning?.severity, 'warning', family);
    assert.equal(warning?.shotId, document.shots[0].id, family);
    assert.ok(warning.message.includes(NVZ_MODEL_LIMITS_NOTE), family);
    assert.equal(result.findings.some(item => item.severity === 'error'), false, family);
    assert.equal(validateRallyRules(result.play, result.timeline).valid, true, family);
    assert.deepEqual(document, before, family);
    assert.deepEqual(result.play.steps[1].positions.player1, document.shots[0].movement.target, family);
    assert.deepEqual(result.play.steps[1].shot.authoring.movement, document.shots[0].movement, family);
  }
});

test('the NVZ uncertainty finding stays scoped to airborne contacts followed by zone entry', () => {
  for (const [family, options] of [
    ['volley', { movementY: 14 }], ['reset', { movementY: 14 }], ['overhead', { movementY: 14 }],
    ['dink', {}], ['reset', { contactStyle: 'short-hop' }]
  ]) {
    const result = compileDocument(contactDocument(family, options));
    assert.equal(result.validShotCount, 1, `${family}: ${JSON.stringify(options)}`);
    assert.equal(result.findings.some(item => item.message.includes(NVZ_MODEL_LIMITS_NOTE)), false,
      `${family}: ${JSON.stringify(options)}`);
  }
});
