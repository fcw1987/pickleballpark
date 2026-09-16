import test from 'node:test';
import assert from 'node:assert/strict';

import { createStarterDocument, MAX_SHOTS, validateDocument } from '../play-document.js';
import {
  authorizeProposal,
  documentSourceIdentity,
  evaluateFullCandidate,
  proposeFamilyChange
} from '../rally-proposals.js';
import { proposeRandomRally, proposeSmartAdd } from '../smart-rally-generator.js';

const clone = value => structuredClone(value);

test('random boundary corpus is exact, effective-validator clean, and repeat deterministic', async () => {
  const lengths = [1, 7, 63, 64, 65, 98, 99];
  const seeds = [0, 5, 0x01352531, 0xffffffff];
  for (const length of lengths) {
    for (const seed of seeds) {
      const first = await proposeRandomRally({ length, seed });
      assert.equal(first.ok, true, `${length}/${seed}: ${first.reason}`);
      assert.equal(first.document.shots.length, length);
      assert.equal(first.document.generation.requestedHits, length);
      assert.equal(first.document.generation.seed, seed >>> 0);
      validateDocument(first.document);
      const effective = evaluateFullCandidate(first.document, { allowOpeningPrefix: length === 1 });
      assert.equal(effective.ok, true, `${length}/${seed}: ${effective.reason}`);
      assert.equal(effective.validShotCount, length);
      assert.equal(effective.compiled.coverage.length >= 0, true);
      if (length === 7 || length === 99) {
        const second = await proposeRandomRally({ length, seed });
        assert.deepEqual(second.document.shots, first.document.shots, `${length}/${seed} is not repeat deterministic`);
        assert.deepEqual(second.document.generation, first.document.generation);
      }
    }
  }
});

test('malformed lengths and nonfinite bounded search options never return a candidate', async () => {
  for (const length of [0, -1, 1.5, NaN, Infinity, 100, MAX_SHOTS + 1, '7', null]) {
    const result = await proposeRandomRally({ length, seed: 11 });
    assert.equal(result.ok, false, String(length));
    assert.equal(result.document, null, String(length));
  }
  for (const options of [{ maxAttempts: 0 }, { maxAttempts: 1.5 }, { maxAttempts: Infinity }, { maxAttempts: NaN }]) {
    const result = await proposeSmartAdd(createStarterDocument(), { seed: 4, ...options });
    assert.equal(result.ok, false);
    assert.match(result.reason, /finite integer/);
  }
  for (const options of [{ maxAttempts: 0 }, { maxAttempts: Infinity }, { maxBacktracks: -1 }, { maxBacktracks: NaN }]) {
    const result = await proposeRandomRally({ length: 1, seed: 4, ...options });
    assert.equal(result.ok, false);
    assert.match(result.reason, /finite integer/);
  }
});

test('Smart Add preserves an authored prefix, including explicit target and flight fields', async () => {
  const generated = await proposeRandomRally({ length: 7, seed: 1 });
  assert.equal(generated.ok, true, generated.reason);
  const source = clone(generated.document);
  source.shots[2].target = { x: 7, y: 31 };
  source.shots[2].arc = 'high';
  source.shots[2].pace = 'soft';
  source.shots[2].contactStyle = 'backhand';
  source.shots[2].receiver = 'player3';
  assert.equal(evaluateFullCandidate(source).ok, true);
  const beforePrefix = clone(source.shots);
  const proposal = await proposeSmartAdd(source, { seed: 0xdeadbeef });
  assert.equal(proposal.ok, true, proposal.reason);
  assert.deepEqual(proposal.document.shots.slice(0, beforePrefix.length), beforePrefix);
  assert.equal(proposal.document.shots.length, beforePrefix.length + 1);
  assert.equal(proposal.sourceIdentity, documentSourceIdentity(source));
  assert.deepEqual(source.shots, beforePrefix);
});

test('same Smart Add source and seed produce the same candidate without source mutation', async () => {
  const source = (await proposeRandomRally({ length: 5, seed: 0 })).document;
  const before = clone(source);
  const one = await proposeSmartAdd(source, { seed: 0x12345678 });
  const two = await proposeSmartAdd(source, { seed: 0x12345678 });
  assert.equal(one.ok, true, one.reason);
  assert.deepEqual(two, one);
  assert.deepEqual(source, before);
});

test('family changes preserve a directly authored target before a continuation', async () => {
  const source = (await proposeRandomRally({ length: 5, seed: 0 })).document;
  source.shots[2].target = { x: 7, y: 31 };
  const beforeTarget = clone(source.shots[2].target);
  const family = await proposeFamilyChange(source, { index: 2, family: 'drive' });
  assert.equal(family.ok, true, family.reason);
  assert.deepEqual(family.document.shots[2].target, beforeTarget);
  const add = await proposeSmartAdd(family.document, { seed: 11 });
  assert.equal(add.ok, true, add.reason);
  assert.deepEqual(add.document.shots[2].target, beforeTarget);
  assert.deepEqual(add.document.shots.slice(0, source.shots.length), family.document.shots);
});

test('Smart Add preserves supported waypoint data while validating the effective candidate', async () => {
  const source = (await proposeRandomRally({ length: 5, seed: 0 })).document;
  source.shots[0].movement.waypoints = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  const before = clone(source.shots[0].movement);
  assert.equal(evaluateFullCandidate(source).ok, true);
  const proposal = await proposeSmartAdd(source, { seed: 123 });
  assert.equal(proposal.ok, true, proposal.reason);
  assert.deepEqual(proposal.document.shots[0].movement, before);
  assert.equal(evaluateFullCandidate(proposal.document).ok, true);
});

test('proposal authorization rejects a stale source after an unrelated edit', async () => {
  const source = (await proposeRandomRally({ length: 5, seed: 0 })).document;
  const proposal = await proposeSmartAdd(source, { seed: 9 });
  assert.equal(proposal.ok, true, proposal.reason);
  const newer = clone(source);
  newer.title = 'Edited while proposal was pending';
  const guard = authorizeProposal(proposal, newer, { operation: 'smart-add' });
  assert.equal(guard.ok, false);
  assert.match(guard.reason, /changed while/);
  assert.deepEqual(source.shots, proposal.document.shots.slice(0, source.shots.length));
});

test('valid generated source can become a nonextendable dead end after bounded Smart Add', async () => {
  // This is the smallest deterministic reproduction found in the adversarial
  // seed sweep. It is valid under the complete compiler/rule boundary and has
  // no terminal/fault marker, but its next contact opportunity is unreachable
  // for every candidate family/hitter/target tried by the generator.
  const source = (await proposeRandomRally({ length: 3, seed: 5 })).document;
  assert.equal(source.ending, 'stop');
  assert.equal(source.intentionalFault, false);
  const evaluation = evaluateFullCandidate(source);
  assert.equal(evaluation.ok, true, evaluation.reason);
  assert.equal(evaluation.validShotCount, 3);
  const proposal = await proposeSmartAdd(source, { seed: 6 });
  assert.equal(proposal.ok, true, `A valid ${source.shots.length}-hit rally should offer a compatible continuation: ${proposal.reason}`);
  assert.equal(proposal.document.shots.length, 4);
  assert.equal(evaluateFullCandidate(proposal.document).ok, true);
});

test('short generated rallies remain extendable through five varied Adds across 100 seeds', async () => {
  for (let seed = 0; seed < 100; seed += 1) {
    let source = (await proposeRandomRally({ length: 3, seed })).document;
    for (let add = 0; add < 5; add += 1) {
      const proposal = await proposeSmartAdd(source, { seed: seed * 10 + add });
      assert.equal(proposal.ok, true, `seed ${seed}, Add ${add + 1}: ${proposal.reason}`);
      assert.equal(proposal.document.shots.length, 4 + add);
      assert.equal(evaluateFullCandidate(proposal.document).ok, true);
      source = proposal.document;
    }
  }
});
