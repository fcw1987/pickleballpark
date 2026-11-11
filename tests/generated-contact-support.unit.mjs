import test from 'node:test';
import assert from 'node:assert/strict';
import { HUMAN_ATHLETE_PROFILE_V1 } from '../human-athlete-profile.js';
import { GENERATED_CONTACT_SUPPORT_V1, generatedContactRadiusFeetV1, assessGeneratedContactSupportV1, inspectGeneratedContactSupportV1 } from '../generated-contact-support.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { createEngineDriverV1 } from '../rally-engine-driver.js';
import { MODEL2_AUTHORING_FIELDS } from '../play-document.js';
import { GROUNDED_CONTACT_HEIGHT_FEET } from '../play-actors-v2.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';

const feetAt = (x, y) => [{x: x - .42, y}, {x: x + .42, y}];
const rotate = point => ({...point, x: 20 - point.x, y: 44 - point.y});
function highLateralDocument(mirrored = false, hand = 'right') {
  const document = model2Document({ shots: [model2Shot({id: 'high-lateral', family: 'overhead', intent: 'overhead',
    target: {x: 7, y: 38}, contactEvidence: {feet: feetAt(10, 14), feetEstablishedOutsideNVZ: true}})] });
  document.initialLayout.player1 = {x: 10, y: 14};
  document.initialLayout.player3 = {x: 15, y: 30};
  document.initialLayout.player4 = {x: 18, y: 30};
  if (mirrored) {
    const ids = {player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2'};
    document.initialLayout = Object.fromEntries(Object.entries(document.initialLayout).map(([id, point]) => [ids[id] ?? id, rotate(point)]));
    for (const shot of document.shots) {
      shot.hitter = ids[shot.hitter]; shot.target = rotate(shot.target);
      shot.contactEvidence.feet = shot.contactEvidence.feet.map(rotate);
    }
  }
  for (const player of Object.values(document.players)) player.handedness = hand;
  return document;
}

test('versioned support is a necessary adult-model envelope, separate from authored acceptance', () => {
  assert.equal(HUMAN_ATHLETE_PROFILE_V1.version, 'human-athlete-profile-v1');
  assert.ok(Object.isFrozen(HUMAN_ATHLETE_PROFILE_V1));
  assert.equal(GENERATED_CONTACT_SUPPORT_V1.necessaryOnly, true);
  assert.equal(GENERATED_CONTACT_SUPPORT_V1.scope, 'necessary-generation-envelope');
  assert.equal(GENERATED_CONTACT_SUPPORT_V1.profileVersion, HUMAN_ATHLETE_PROFILE_V1.version);
  assert.equal(GENERATED_CONTACT_SUPPORT_V1.maximumHipHeightMetres, .98);
  assert.equal(GENERATED_CONTACT_SUPPORT_V1.armPaddleReachMetres, .863);
  assert.equal(GROUNDED_CONTACT_HEIGHT_FEET, 8.5, 'authored model ceiling is unchanged');
  assert.deepEqual(GENERATED_CONTACT_SUPPORT_V1.descendingProposalHeightsFeet, [7.5, 7, 6.5]);
  assert.ok(GENERATED_CONTACT_SUPPORT_V1.descendingProposalHeightsFeet.every(h => generatedContactRadiusFeetV1(h) !== null));
});

test('low dinks retain horizontal reach instead of being excluded by an upright shoulder sphere', () => {
  for (const heightFeet of [.3, .8, 1.5, 3, 6.5, 7]) {
    assert.equal(generatedContactRadiusFeetV1(heightFeet), 3);
    assert.equal(assessGeneratedContactSupportV1({contact: {x: 7, y: 14, heightFeet}, feet: feetAt(10, 14)}).supported, true);
  }
});

test('height and horizontal reach are coupled with exact boundary rejection and outward-rounded constants', () => {
  const radius = generatedContactRadiusFeetV1(7.5);
  const independent = (.24 + Math.sqrt((Math.hypot(.22, .54, .055) + .33 + .29 + .243) ** 2 - (7.5 * .3048 - .98) ** 2)) / .3048;
  assert.ok(Math.abs(radius - independent) < 1e-12);
  assert.ok(radius < 3 && radius > 2.8);
  const assessment = distance => assessGeneratedContactSupportV1({contact: {x: 7, y: 14, heightFeet: 7.5}, feet: feetAt(7 + distance, 14)});
  assert.equal(assessment(radius).supported, true);
  assert.equal(assessment(radius + 1e-5).supported, false);
  assert.equal(assessment(3).reason, 'unsupported-grounded-pose');
  const cap = GENERATED_CONTACT_SUPPORT_V1.maximumContactHeightFeet;
  assert.ok(generatedContactRadiusFeetV1(cap) > 0);
  assert.equal(generatedContactRadiusFeetV1(cap + 1e-5), null);
  assert.equal(assessGeneratedContactSupportV1({contact: {x: 7, y: 14, heightFeet: 8.5}, feet: feetAt(7, 14)}).supported, false);
});

test('archived 50001 high-lateral contact is excluded without changing its exact geometry', () => {
  // Exact archived contact/root world evidence, expressed in the board units
  // accepted by this necessary-envelope API. No historical source is rewritten.
  const contact = {x: .3752 / .3048 + 10, y: 4.2554 / .3048 + 22, heightFeet: 2.5907997 / .3048};
  const feet = feetAt(.8160 / .3048 + 10, 3.4543 / .3048 + 22);
  const source = JSON.stringify({contact, feet}), result = assessGeneratedContactSupportV1({contact, feet});
  assert.ok(result.actualHorizontalFeet < 3.001);
  assert.ok(contact.heightFeet < 8.5);
  assert.equal(result.supported, false); assert.equal(result.reason, 'unsupported-grounded-pose');
  assert.equal(result.maximumHorizontalFeet, null);
  assert.equal(JSON.stringify({contact, feet}), source);
});

for (const mirrored of [false, true]) for (const hand of ['left', 'right']) {
  test(`authored high-lateral geometry remains accepted while the generated envelope excludes it (${mirrored}/${hand})`, () => {
    const document = highLateralDocument(mirrored, hand), source = JSON.stringify(document), compiled = compileDocument(document);
    assert.equal(compiled.validShotCount, 1); assert.deepEqual(compiled.findings, []);
    assert.equal(validateRallyRules(compiled.play, compiled.timeline).valid, true);
    const support = inspectGeneratedContactSupportV1(compiled.timeline);
    assert.equal(support.valid, false); assert.equal(support.checkedContacts, 1);
    assert.equal(support.violations[0].shotId, 'high-lateral');
    assert.equal(support.violations[0].contactHeightFeet, 7.5);
    assert.equal(support.violations[0].actualHorizontalFeet, 3);
    assert.equal(support.necessaryOnly, true);
    assert.equal(JSON.stringify(document), source);
  });
}

test('independent driver rejects fabricated support claims using actual serialized feet without retry or repair', async () => {
  const document = highLateralDocument(), shot = document.shots[0];
  shot.generation = {seed: 7, generatorVersion: 'rally-engine-v1'};
  shot.authoring = {ownership: 'automatic', fields: MODEL2_AUTHORING_FIELDS.filter(field => Object.hasOwn(shot, field))};
  const provisional = {status: 'censored', document, outcome: null, outcomeClassification: null,
    decisions: [{shotId: shot.id}], stats: {shots: 1}, contactSupport: {valid: true}};
  const before = JSON.stringify(provisional); let attempts = 0;
  const result = await createEngineDriverV1(async () => { attempts++; return provisional; }, {yieldControl: async () => {}})({seed: 7, options: {maxShots: 1}});
  assert.equal(attempts, 1); assert.equal(result.status, 'failed'); assert.equal(result.document, null);
  assert.equal(result.diagnostics.code, 'unsupported-grounded-pose', JSON.stringify(result.diagnostics));
  assert.equal(result.diagnostics.validation.contactSupport.valid, false);
  assert.equal(result.diagnostics.validation.contactSupport.violations[0].contactHeightFeet, 7.5);
  assert.equal(JSON.stringify(provisional), before);
});

test('malformed support geometry cannot acquire a successful audit', () => {
  for (const height of [-1, NaN, Infinity, undefined]) assert.throws(() => generatedContactRadiusFeetV1(height), TypeError);
  for (const feet of [undefined, [], [{x: 0, y: 0}], [{x: NaN, y: 0}, {x: 1, y: 0}]]) {
    assert.throws(() => assessGeneratedContactSupportV1({contact: {x: 0, y: 0, heightFeet: 1}, feet}), TypeError);
  }
  assert.throws(() => inspectGeneratedContactSupportV1({}), TypeError);
  assert.throws(() => inspectGeneratedContactSupportV1({segments: [{modelVersion: 1}]}), TypeError);
});
