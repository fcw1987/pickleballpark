import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileEffectiveCandidate, evaluateCandidate } from '../rally-proposals.js';
import { DraftStore } from '../builder-storage.js';
import { validateDocument } from '../play-document.js';

const source = JSON.parse(readFileSync(new URL('./fixtures/overhead-short-hop-document.json', import.meta.url), 'utf8'));

test('imported overhead/Short hop surfaces the rule warning without rewriting the play or truncating preview', () => {
  const store = new DraftStore({ storage: { getItem: () => null, setItem: () => {} }, validate: validateDocument });
  const imported = store.importJSON(JSON.stringify(source));
  for (const autoShading of [false, true]) {
    const document = structuredClone(imported);
    document.assistance.autoShading = autoShading;
    const before = structuredClone(document);
    const compiled = compileEffectiveCandidate(document);
    const warning = compiled.findings.find(item => item.shotId === 'overhead' && item.kind === 'rule');
    assert.equal(warning?.severity, 'warning');
    assert.match(warning.message, /7 ft contact.*short-hop contact.*low contact height/);
    assert.match(warning.message, /Choose Automatic, Forehand, or Backhand/);
    assert.equal(compiled.validShotCount, document.shots.length);
    assert.equal(compiled.play.steps.at(-1).shot.contact.heightFeet, 7);
    assert.equal(compiled.play.steps.at(-1).shot.contact.kind, 'short-hop');
    assert.equal(evaluateCandidate(document).ok, false, 'a preview warning must not make Smart Rally accept an invalid contact');
    assert.deepEqual(document, before);
    assert.deepEqual(store.importJSON(store.exportJSON(document)), document);
  }
});

test('ordinary overhead contact choices clear the warning and remain valid', () => {
  for (const contactStyle of ['auto', 'forehand', 'backhand']) {
    const document = structuredClone(source);
    document.shots[1].contactStyle = contactStyle;
    const result = evaluateCandidate(document);
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual(result.findings, []);
  }
});

test('intentional coaching faults retain the overhead rule warning and authored ending', () => {
  const document = structuredClone(source);
  document.intentionalFault = true;
  document.ending = 'fault';
  const before = structuredClone(document);
  const compiled = compileEffectiveCandidate(document);
  assert.ok(compiled.findings.some(item => item.shotId === 'overhead' && item.kind === 'rule' && item.severity === 'warning'));
  assert.equal(compiled.validShotCount, 2);
  assert.equal(compiled.play.outcome.intentionalFault, true);
  assert.equal(compiled.play.outcome.afterShotId, 'overhead');
  assert.equal(compiled.play.ending, 'fault');
  assert.deepEqual(document, before);
});
