import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';
import { readModel2Fixture } from './fixtures/model2/cases.mjs';

function initialShortHop(family, mirrored) {
  const document = model2Document({ shots: [model2Shot({ family, contactStyle: 'short-hop', target: { x: 7, y: 27 } })] });
  if (mirrored) {
    const ids = { player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' };
    document.initialLayout = Object.fromEntries(Object.entries(document.initialLayout).map(([id, p]) => [ids[id] ?? id, { x: 20 - p.x, y: 44 - p.y }]));
    document.shots[0].hitter = 'player3';
    document.shots[0].target = { x: 13, y: 17 };
  }
  return document;
}

for (const mirrored of [false, true]) {
  test(`a represented 7.5 ft opening short-hop is rejected as model infeasibility (${mirrored ? 'orange' : 'green'})`, () => {
    const document = initialShortHop('overhead', mirrored), before = JSON.stringify(document);
    const result = compileDocument(document), segment = result.timeline.segments[0];
    assert.equal(segment.shotSemantics.contact.kind, 'short-hop');
    assert.equal(segment.shotSemantics.contact.point.heightFeet, 7.5, 'do not hide contradictory source by lowering the contact');
    assert.equal(result.validShotCount, 0);
    const findings = result.findings.filter(item => item.severity === 'error');
    assert.equal(findings.length, 1); assert.equal(findings[0].kind, 'feasibility');
    const violations = validateRallyRules(result.play, result.timeline).violations;
    assert.equal(violations.length, 1); assert.equal(violations[0].code, 'short-hop-contact');
    assert.equal(violations[0].category, 'model', 'the illustrative height bound is not an official sport rule');
    assert.equal(JSON.stringify(document), before);
  });

  for (const family of ['dink', 'reset']) test(`an initial low ${family} short-hop may omit incoming bounce evidence (${mirrored})`, () => {
    const document = initialShortHop(family, mirrored), before = JSON.stringify(document), result = compileDocument(document);
    assert.equal(result.validShotCount, 1, JSON.stringify(result.findings));
    assert.deepEqual(result.findings, []);
    assert.equal(result.timeline.segments[0].shotSemantics.contact.point.heightFeet, .8);
    assert.equal(result.timeline.events.filter(event => event.type === 'contact').length, 1);
    assert.deepEqual(validateRallyRules(result.play, result.timeline).violations, []);
    assert.equal(JSON.stringify(document), before);
  });
}

test('represented incoming short-hop timing and height remain independent requirements', () => {
  for (const [delay, valid, low] of [[.08, true, true], [.2, false, false], [.72, false, true]]) {
    const document = readModel2Fixture('variable-bounced-contact');
    document.shots[1].contactStyle = 'short-hop';
    document.shots[1].contactTiming = { afterBounceSeconds: delay };
    const before = JSON.stringify(document), result = compileDocument(document);
    const contact = result.timeline.segments[1].shotSemantics.contact.point;
    assert.equal(contact.heightFeet <= 1.5, low);
    assert.equal(result.validShotCount, valid ? 2 : 0, JSON.stringify(result.findings));
    const violations = validateRallyRules(result.play, result.timeline).violations;
    assert.equal(violations.filter(item => item.code === 'short-hop-contact').length, valid ? 0 : 1);
    assert.ok(violations.every(item => item.category === 'model'));
    assert.equal(JSON.stringify(document), before);
  }
});
