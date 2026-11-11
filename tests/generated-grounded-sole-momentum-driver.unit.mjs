import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';
import { GENERATED_DEFAULT_FOOT_STATE_V1 as marker, defaultFeetAtV1 } from '../generated-foot-state.js';
import { groundedSoleClearsNVZV1 } from '../generated-grounded-sole.js';
import { createEngineDriverV1 } from '../rally-engine-driver.js';
import { MODEL2_AUTHORING_FIELDS, validateDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { sampleActorFeetV2 } from '../play-actors-v2.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';

// Reach the real private inspector without weakening public rules or adding a
// production test seam. The public contact-actor gate rejects conflicting
// active momentum before the driver can reach its independent sole check.
const driverURL = new URL('../rally-engine-driver.js', import.meta.url);
const driverSource = (await readFile(driverURL, 'utf8')).replace(/from '(\.\/[^']+)'/g,
  (_, path) => `from '${new URL(path, driverURL).href}'`);
const { inspectGeneratedContactSoles } = await import(`data:text/javascript;base64,${Buffer.from(driverSource + '\nexport { inspectGeneratedContactSoles };').toString('base64')}`);

function volleySource({ far, active = false, overlap = true }) {
  const mirror = p => far ? { x: 20 - p.x, y: 44 - p.y } : p;
  const remap = id => far ? ({ player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' })[id] : id;
  const root = { x: 8, y: !active && overlap ? 14.8 : 14.25 };
  const layout = { player1: root, player2: { x: 17, y: 5 }, player3: { x: 8, y: 29.75 }, player4: { x: 19, y: 40 } };
  const initialLayout = Object.fromEntries(Object.entries(layout).map(([id, p]) => [remap(id), mirror(p)]));
  initialLayout.ball = mirror({ x: 7, y: root.y });
  const shots = [1, 2, 3].map(index => model2Shot({ id: `momentum-volley-${index}`, hitter: remap(index % 2 ? 'player1' : 'player3'),
    family: 'volley', intent: 'volley', contactMode: 'volley', target: mirror({ x: 7, y: index % 2 ? 40 : 4 }), physics: { apexFeet: 5 },
    // Explicit narrow plants remain authoritative in marked and unmarked
    // documents. Stationary later momentum also retains those exact feet.
    contactEvidence: { feet: defaultFeetAtV1(mirror(index === 1 ? root : index === 2 ? layout.player3 : { x: 8, y: 14.25 })), feetEstablishedOutsideNVZ: true } }));
  shots[1].contactEvidence.momentum = { afterContactSeconds: 1, feet: structuredClone(shots[1].contactEvidence.feet), balanced: false };
  if (active) shots[0].contactEvidence.momentum = { afterContactSeconds: 1, feet: defaultFeetAtV1(mirror({ x: 8, y: 14.8 })), balanced: false };
  else {
    shots[0].movement = { intent: 'manual', target: mirror({ x: 8, y: 14.25 }), pinned: false };
    shots[2].contactEvidence.momentum = { afterContactSeconds: 1, feet: structuredClone(shots[2].contactEvidence.feet), balanced: false };
  }
  for (const shot of shots) {
    shot.generation = { seed: 7, generatorVersion: 'rally-engine-v1' };
    shot.authoring = { ownership: 'automatic', fields: MODEL2_AUTHORING_FIELDS.filter(key => Object.hasOwn(shot, key)) };
  }
  const document = model2Document({ defaultFootState: marker, initialLayout, ending: 'stop', shots });
  return { status: 'censored', document, outcome: null, outcomeClassification: null, decisions: shots.map(shot => ({ shotId: shot.id })),
    stats: { shots: 3 }, diagnostics: { groundedSoles: { valid: true, checkedContacts: 3 } } };
}
const run = source => createEngineDriverV1(async () => source, { yieldControl: async () => {} })({ seed: 7, options: { maxShots: 3 } });

for (const far of [false, true]) {
  test(`active momentum feet override otherwise-clear contact feet without bypassing prior public rejection (${far ? 'far' : 'near'})`, async () => {
    const source = volleySource({ far, active: true }), before = JSON.stringify(source), document = source.document;
    validateDocument(document);
    const compiled = compileDocument(document), segment = compiled.timeline.segments[2], actor = segment.shotSemantics.playerId;
    assert.ok(segment.shotSemantics.contact.feet.every(groundedSoleClearsNVZV1));
    const actual = sampleActorFeetV2(segment, actor, segment.contactTime);
    assert.ok(actual.some(foot => !groundedSoleClearsNVZV1(foot)));
    const rules = validateRallyRules(compiled.play, compiled.timeline);
    assert.equal(rules.valid, false);
    assert.ok(rules.violations.some(item => item.code === 'contact-actor-mismatch' && item.stepId === segment.step.id));
    const result = await run(source);
    assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.code, 'final-validation');
    assert.ok(result.diagnostics.validation.ruleViolations.some(item => item.code === 'contact-actor-mismatch'));
    assert.equal(result.document, null); assert.equal(Object.hasOwn(result.diagnostics.validation, 'groundedSoles'), false);
    const audit = inspectGeneratedContactSoles(document, compiled.timeline);
    assert.equal(audit.valid, false); assert.equal(audit.reason, 'volley-sole-nvz'); assert.equal(audit.shotId, segment.step.id);
    assert.equal(audit.checkedContacts, 3); assert.deepEqual(audit.feet, actual);
    assert.notDeepEqual(audit.feet, segment.shotSemantics.contact.feet);
    assert.equal(JSON.stringify(source), before);
  });

  test(`future momentum cannot replace the current plant, with marked rejection and exact unmarked preservation (${far ? 'far' : 'near'})`, async () => {
    const source = volleySource({ far }), before = JSON.stringify(source), document = source.document;
    validateDocument(document);
    const compiled = compileDocument(document), segment = compiled.timeline.segments[0], actor = segment.shotSemantics.playerId;
    assert.equal(compiled.validShotCount, 3); assert.equal(validateRallyRules(compiled.play, compiled.timeline).valid, true);
    assert.equal(inspectGeneratedMovementV1(compiled.timeline, { maxAccelerationFeetPerSecondSquared: 30 }).valid, true);
    assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
    const future = segment.model2Momentum.filter(item => item.actor === actor);
    assert.equal(future.length, 1); assert.ok(future[0].contactTime > segment.startTime + segment.contactTime + 1e-9);
    assert.ok(future[0].fromFeet.every(groundedSoleClearsNVZV1)); assert.ok(future[0].feet.every(groundedSoleClearsNVZV1));
    const audit = inspectGeneratedContactSoles(document, compiled.timeline);
    assert.equal(audit.valid, false); assert.equal(audit.checkedContacts, 1); assert.equal(audit.shotId, segment.step.id);
    assert.strictEqual(audit.feet, segment.shotSemantics.contact.feet, 'future-only evidence retains the exact authoritative plant, without re-centering');
    const result = await run(source);
    assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.code, 'generated-grounded-sole');
    assert.equal(result.diagnostics.validation.groundedSoles.shotId, segment.step.id); assert.equal(result.document, null);
    assert.equal(JSON.stringify(source), before);

    const historical = structuredClone(source); delete historical.document.defaultFootState;
    const historicalBefore = JSON.stringify(historical), accepted = await run(historical);
    assert.equal(accepted.status, 'censored', JSON.stringify(accepted.diagnostics));
    assert.equal(Object.hasOwn(accepted.diagnostics.validation, 'groundedSoles'), false);
    assert.deepEqual(accepted.document.shots, historical.document.shots); assert.equal(JSON.stringify(historical), historicalBefore);
    assert.deepEqual(compileDocument(historical.document).play.steps, compiled.play.steps);

    const clear = volleySource({ far, overlap: false }), clearBefore = JSON.stringify(clear), positive = await run(clear);
    assert.equal(positive.status, 'censored', JSON.stringify(positive.diagnostics));
    assert.equal(positive.diagnostics.validation.groundedSoles.valid, true);
    assert.equal(positive.diagnostics.validation.groundedSoles.checkedContacts, 3); assert.equal(JSON.stringify(clear), clearBefore);
  });
}
