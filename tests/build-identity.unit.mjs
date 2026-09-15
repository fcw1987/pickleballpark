import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILD_IDENTITY, normalizeBuildIdentity, snapshotBuildIdentity, isBuildIdentityVerified } from '../build-identity.js';

test('development identity is explicit and has digest exclusions', () => {
  assert.equal(BUILD_IDENTITY.product, 'Pickleball Park');
  assert.equal(BUILD_IDENTITY.status, 'development');
  assert.equal(BUILD_IDENTITY.sourceRevision, null);
  assert.deepEqual(BUILD_IDENTITY.runtimeFileset.exclusions, ['version.json', 'build-identity.js', 'build-info.json', 'runtime-manifest.json']);
  assert.equal(isBuildIdentityVerified(BUILD_IDENTITY), false);
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
