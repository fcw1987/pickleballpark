import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILD_IDENTITY, normalizeBuildIdentity, snapshotBuildIdentity, isBuildIdentityVerified } from '../build-identity.js';

test('development identity is explicit and has digest exclusions', () => {
  const development = normalizeBuildIdentity();
  assert.equal(development.product, 'Pickleball Park');
  assert.equal(development.status, 'development');
  assert.equal(development.sourceRevision, null);
  assert.deepEqual(development.runtimeFileset.exclusions, ['version.json', 'build-metadata.js', 'build-info.json', 'runtime-manifest.json']);
  assert.equal(isBuildIdentityVerified(development), false);
});

test('identity normalization drops unsafe or malformed metadata', () => {
  const identity = normalizeBuildIdentity({
    status: 'verified',
    sourceRevision: '/Users/fdub/private',
    sourceBranch: 'review',
    runtimeSha256: 'not-a-digest',
    runtimeFileset: { exclusions: ['version.json', '/secret/path', ''] },
  });
  assert.equal(identity.sourceRevision, null);
  assert.equal(identity.runtimeSha256, null);
  assert.deepEqual(identity.runtimeFileset.exclusions, ['version.json']);
});

test('a dirty source cannot be presented as a verified release', () => {
  const identity = normalizeBuildIdentity({ status: 'verified', sourceState: 'dirty', sourceRevision: '1'.repeat(40), runtimeSha256: '2'.repeat(64) });
  assert.equal(identity.status, 'development');
  assert.equal(isBuildIdentityVerified(identity), false);
});

test('snapshots are detached and cannot be changed by caller mutation', () => {
  const value = snapshotBuildIdentity({ sourceBranch: 'branch', runtimeFileset: { exclusions: ['x'] } });
  assert.throws(() => { value.runtimeFileset.exclusions.push('draft.json'); }, TypeError);
  assert.equal(value.sourceBranch, 'branch');
});

test('untrusted packaged and verified claims are demoted without matching proof', () => {
  assert.equal(normalizeBuildIdentity({ status: 'packaged', sourceState: 'clean', sourceRevision: '1'.repeat(40) }).status, 'development');
  assert.equal(normalizeBuildIdentity({ status: 'verified', sourceState: 'clean', sourceRevision: '1'.repeat(40), runtimeSha256: '2'.repeat(64) }).status, 'development');
});

test('metadata labels are bounded and cannot carry paths', () => {
  const identity = normalizeBuildIdentity({ sourceBranch: '/Users/fdub/private', cacheVersion: 'x'.repeat(161), developmentStatus: '../../drafts' });
  assert.equal(identity.sourceBranch, null);
  assert.equal(identity.cacheVersion, null);
  assert.equal(identity.developmentStatus, 'unverified local source');
});

test('embedded identity exactly matches the stamped version snapshot', () => {
  const version = JSON.parse(readFileSync(new URL('../version.json', import.meta.url)));
  assert.deepEqual(BUILD_IDENTITY, normalizeBuildIdentity(version));
});
