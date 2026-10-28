import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterDocument, validateDocument } from '../play-document.js';
import { model2Document, declaredOutcome, clone } from './fixtures/model2/factories.mjs';

const change = mutate => { const value = model2Document(); mutate(value); return value; };
const rejects = (mutate, expression) => assert.throws(() => validateDocument(change(mutate)), expression);

test('model2 is explicit and cannot silently inherit or invent a physics version', () => {
  const value = model2Document();
  assert.equal(validateDocument(value), value);
  rejects(value => { delete value.physicsVersion; }, /physicsVersion/);
  rejects(value => { value.physicsVersion = 'play-physics-v1'; }, /physicsVersion/);
  rejects(value => { value.modelVersion = 3; }, /modelVersion/);
});

test('model2 metadata is strictly bounded without changing legacy extension validation', () => {
  for (const [key, nested] of [['physics', { apexFeet: 4, ignored: true }], ['contactTiming', { afterBounceSeconds: .2, ignored: true }]]) {
    rejects(value => { value.shots[0][key] = nested; }, /supported|unknown|allowed/);
  }
  rejects(value => { value.unversionedGenerator = {}; }, /supported|unknown|allowed/);
  rejects(value => { value.shots[0].ignored = true; }, /supported|unknown|allowed/);
  rejects(value => { value.shots[0].intent = 'make-a-winner'; }, /intent/);
  rejects(value => { value.shots[0].quality = 'certain-winner'; }, /quality/);
  rejects(value => { value.shots[0].physics = { apexFeet: 31 }; }, /apexFeet/);
  rejects(value => { value.shots[0].physics = { apexFeet: NaN }; }, /finite/);
});

test('model2 cannot smuggle physics through nested extension keys while legacy files retain their extension data', () => {
  for (const mutate of [
    value => { value.initialLayout.ball.heightFeet = 20; },
    value => { value.players.player1.style = 'invented-physics'; },
    value => { value.assistance.physics = 'unversioned'; },
    value => { value.shots[0].movement.teleport = true; }
  ]) rejects(mutate, /supported|unknown|allowed/);
  const legacy = createStarterDocument();
  legacy.extension = { source: 'Saved by a compatible client', retained: [1, 2, 3] };
  legacy.shots[0].extension = { note: 'Preserve authored metadata' };
  const bytes = JSON.stringify(legacy);
  assert.equal(validateDocument(legacy), legacy);
  assert.equal(JSON.stringify(legacy), bytes);
});

test('model2 narration is inert plain text and rejects markup, links and oversized copy', () => {
  for (const label of ['<b>Fault</b>', 'https://example.com', 'a'.repeat(41)]) {
    rejects(value => { value.shots[0].narration.label = label; }, /label|plain text|URL|link/);
  }
  for (const why of ['Click www.example.com', 'x'.repeat(161), 'bad\u0000text']) {
    rejects(value => { value.shots[0].narration.why = why; }, /why|plain text|control|URL|link/);
  }
  rejects(value => { value.shots[0].narration.html = 'No'; }, /supported|unknown|allowed/);
});

test('a signed vertical launch is versioned, bounded and cannot conflict with an independently declared apex', () => {
  const value = model2Document(); value.shots[0].physics = { launchVerticalFeetPerSecond: -18 };
  assert.equal(validateDocument(value), value);
  for (const velocity of [-80.1, 80.1, NaN]) rejects(document => { document.shots[0].physics = { launchVerticalFeetPerSecond: velocity }; }, /launchVerticalFeetPerSecond|finite/);
  rejects(document => { document.shots[0].physics = { apexFeet: 7, launchVerticalFeetPerSecond: -18 }; }, /choose one|apex|launch/);
});

test('apron contacts are reserved for signature geometry and remain bounded', () => {
  rejects(value => { value.shots[0].contactOverride = { x: -1, y: 18 }; }, /contactOverride|signature|Erne|erne/);
  for (const intent of ['erne', 'around-the-post']) {
    const value = model2Document();
    value.shots[0].intent = intent;
    value.shots[0].contactOverride = { x: -1.5, y: 18 };
    assert.equal(validateDocument(value), value);
    const outside = clone(value); outside.shots[0].contactOverride.x = -8.01;
    assert.throws(() => validateDocument(outside), /apron/);
  }
});

test('contact timing and physical foot evidence reject ambiguous or non-finite inputs', () => {
  for (const time of [0, -1, 1.51, Infinity]) rejects(value => { value.shots[0].contactTiming = { afterBounceSeconds: time }; }, /afterBounceSeconds|finite/);
  rejects(value => { value.shots[0].contactMode = 'volley'; value.shots[0].contactTiming = { afterBounceSeconds: .2 }; }, /contactTiming|bounc/);
  rejects(value => { value.shots[0].contactEvidence = { feet: [{ x: 7, y: 14 }], feetEstablishedOutsideNVZ: true }; }, /feet/);
  rejects(value => { value.shots[0].contactEvidence = { feet: [{ x: 7, y: 14 }, { x: 8, y: 14 }] }; }, /feetEstablishedOutsideNVZ/);
  rejects(value => { value.shots[0].contactEvidence = { feet: [{ x: 7, y: 14 }, { x: 8, y: 14 }], feetEstablishedOutsideNVZ: true, momentum: { afterContactSeconds: 0, feet: [{ x: 7, y: 15 }, { x: 8, y: 15 }], balanced: false } }; }, /afterContactSeconds/);
  rejects(value => { value.shots[0].contactEvidence = { feet: [{ x: 7, y: 14 }, { x: 8, y: 14 }], feetEstablishedOutsideNVZ: true, momentum: { afterContactSeconds: .3, feet: [{ x: 7, y: 15 }, { x: 8, y: 15 }], balanced: true } }; }, /balanced/);
});

test('completed points require actor and timed geometry evidence rather than an outcome label', () => {
  rejects(value => { value.ending = 'winner'; }, /outcome/);
  rejects(value => { value.outcome = declaredOutcome(); }, /stop|outcome/);
  const valid = model2Document({ ending: 'winner', outcome: declaredOutcome() });
  assert.equal(validateDocument(valid), valid);
  for (const field of ['faultingActor', 'evidence']) {
    const value = clone(valid); delete value.outcome[field];
    assert.throws(() => validateDocument(value), new RegExp(field));
  }
  for (const height of [-1, 30.1, NaN]) {
    const value = clone(valid); value.outcome.evidence.position.heightFeet = height;
    assert.throws(() => validateDocument(value), /heightFeet|finite/);
  }
  for (const time of [-1, 30.1, Infinity]) {
    const value = clone(valid); value.outcome.evidence.afterContactSeconds = time;
    assert.throws(() => validateDocument(value), /afterContactSeconds|finite/);
  }
  const wrongActor = clone(valid); wrongActor.outcome.struckActor = 'player4';
  assert.throws(() => validateDocument(wrongActor), /struckActor|faultingActor/);
});
