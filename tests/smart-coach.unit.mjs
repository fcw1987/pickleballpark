import test from 'node:test';
import assert from 'node:assert/strict';

import { authorizeProposal, documentSourceIdentity, evaluateFullCandidate, proposalChanges } from '../rally-proposals.js';
import { proposeCoachFix, proposeCoachOptions } from '../rally-coach.js';
import {
  automaticRepairScenario,
  laterBreakScenario,
  noFeasibleScenario,
  protectedPinScenario,
  validScenario
} from './fixtures/smart-coach-scenarios.mjs';

const clone = value => structuredClone(value);

test('Coach repairs an automatic derived movement through the complete downstream rally', async () => {
  const source = await automaticRepairScenario();
  const before = clone(source);
  const proposal = await proposeCoachFix(source);

  assert.equal(proposal.ok, true);
  assert.equal(proposal.requiresConsent, false);
  assert.equal(proposal.sourceIdentity, documentSourceIdentity(source));
  assert.equal(proposal.operation, 'coach-fix');
  assert.equal(proposal.document.shots.length, source.shots.length);
  assert.equal(evaluateFullCandidate(proposal.document).ok, true);
  assert.equal(proposal.document.shots[2].movement.intent, 'advance');
  assert.deepEqual(source, before, 'Coach evaluates a copy and leaves source intent untouched');
  assert.deepEqual(proposal.changes.map(change => change.path), ['shots[2].movement']);
  assert.equal(proposal.changes[0].ownership, 'automatic');
});

test('Coach never silently releases a protected pin and offers only evaluated consent options', async () => {
  const source = protectedPinScenario();
  const before = clone(source);
  const fix = await proposeCoachFix(source);
  assert.equal(fix.ok, false);
  assert.match(fix.reason, /Protected targets, pins|cannot find an automatic repair/);
  assert.deepEqual(source, before);

  const options = await proposeCoachOptions(source);
  assert.ok(Array.isArray(options));
  assert.equal(options.sourceIdentity, documentSourceIdentity(source));
  assert.ok(options.some(option => option.requiresConsent && option.changes.some(change => change.path === 'shots[0].movement')));
  for (const option of options) {
    assert.equal(option.sourceIdentity, documentSourceIdentity(source));
    assert.equal(option.ok, true);
    assert.equal(evaluateFullCandidate(option.document).ok, true, option.reason);
    assert.ok(option.changes.length > 0);
    if (option.requiresConsent) assert.ok(option.consentReason);
  }
  assert.deepEqual(source, before, 'Showing options does not mutate the protected draft');
});

test('Broad generated metadata cannot authorize an explicit manual destination', async () => {
  const source = validScenario();
  source.shots[0].authoring = {
    ownership: 'automatic',
    fields: ['movement', 'target', 'arc', 'pace', 'hitter', 'receiver', 'family', 'playerMovement']
  };
  source.shots[0].playerMovement = { player2: { intent: 'manual', pinned: false, target: { x: 0, y: 44 } } };
  const fix = await proposeCoachFix(source);
  assert.equal(fix.ok, false);
  const options = await proposeCoachOptions(source);
  assert.ok(options.some(option => option.requiresConsent && option.changes.some(change => change.path === 'shots[0].playerMovement')));
});

test('Coach evaluates the entire downstream candidate and rejects a repair that leaves a later pin broken', async () => {
  const source = laterBreakScenario();
  const proposal = await proposeCoachFix(source);
  assert.equal(proposal.ok, false);
  assert.match(proposal.reason, /could not find an automatic repair/);
  assert.match(proposal.reason, /pinned|cannot reach/);
  assert.equal(proposal.document, null);
});

test('Coach distinguishes a valid or tactical draft from a repairable issue', async () => {
  const source = validScenario();
  const before = clone(source);
  const fix = await proposeCoachFix(source);
  const options = await proposeCoachOptions(source);
  assert.equal(fix.ok, false);
  assert.match(fix.reason, /no hard rule|tactical choices/);
  assert.equal(options.length, 0);
  assert.match(options.reason, /no hard issue/);
  assert.deepEqual(source, before);
});

test('Coach cancellation is bounded and never returns a partial candidate', async () => {
  const source = await automaticRepairScenario();
  const signal = AbortSignal.abort();
  const fix = await proposeCoachFix(source, { signal });
  assert.equal(fix.ok, false);
  assert.match(fix.reason, /cancelled/i);
  const options = await proposeCoachOptions(source, { signal });
  assert.deepEqual([...options], []);
  assert.equal(options.cancelled, true);
  assert.match(options.reason, /cancelled/i);
});

test('Coach proposal source identity makes a later application stale', async () => {
  const source = await automaticRepairScenario();
  const proposal = await proposeCoachFix(source);
  assert.equal(proposal.ok, true);
  const newer = clone(source);
  newer.title = 'Edited after Coach started';
  const guard = authorizeProposal(proposal, newer, { operation: 'coach-fix' });
  assert.equal(guard.ok, false);
  assert.match(guard.reason, /changed while/);
});

test('Coach proposal survives JSON round trip with concrete changes and full validity', async () => {
  const source = await automaticRepairScenario();
  const proposal = await proposeCoachFix(source);
  const roundTrip = JSON.parse(JSON.stringify(proposal));
  assert.equal(roundTrip.sourceIdentity, proposal.sourceIdentity);
  assert.deepEqual(roundTrip.changes, proposal.changes);
  assert.equal(evaluateFullCandidate(roundTrip.document).ok, true);
  assert.equal(roundTrip.requiresConsent, false);
});

test('Coach reports a genuine no-feasible-search case with protected locks intact', async () => {
  const source = noFeasibleScenario();
  const before = clone(source);
  const [fix, options] = await Promise.all([proposeCoachFix(source), proposeCoachOptions(source)]);
  assert.equal(fix.ok, false);
  assert.match(fix.reason, /could not find an automatic repair|Protected/);
  assert.deepEqual([...options], []);
  assert.match(options.reason, /No evaluated Coach option resolves|cannot reach|pinned/);
  assert.deepEqual(source, before);
});

test('Coach marks a combined automatic and initial-layout candidate as consented', async () => {
  const source = await automaticRepairScenario();
  const candidate = clone(source);
  candidate.initialLayout.player1 = { ...candidate.initialLayout.player1, x: candidate.initialLayout.player1.x + 1 };
  const changes = proposalChanges(source, candidate);
  assert.ok(changes.some(change => change.path === 'initialLayout.player1.x'));
  assert.equal(changes.find(change => change.path === 'initialLayout.player1.x').ownership, 'authored');
});
