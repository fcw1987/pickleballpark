import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createBuildMetadata, runtimeFileset, runtimeMatchesSource } from '../tools/stamp-build.mjs';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const makeRepo = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pickleballpark-stamp-test-'));
  mkdirSync(path.join(root, 'icons'));
  mkdirSync(path.join(root, 'tests'));
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'tests', 'fixture.html'), '<p>Test-only fixture</p>');
  writeFileSync(path.join(root, 'docs', 'viewer.js'), 'export const documentation = true;');
  writeFileSync(path.join(root, 'app.js'), 'export const app = 1;\n');
  writeFileSync(path.join(root, 'build-identity.js'), 'export const identity = 1;\n');
  writeFileSync(path.join(root, 'build-metadata.js'), 'export const BUILD_IDENTITY_METADATA = {};\n');
  writeFileSync(path.join(root, 'version.json'), '{}\n');
  writeFileSync(path.join(root, 'README.md'), 'source\n');
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'user.name', 'Stamp Test');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'source');
  return root;
};

const withRepo = run => {
  const root = makeRepo();
  try { return run(root, git(root, 'rev-parse', 'HEAD')); } finally { rmSync(root, { recursive: true, force: true }); }
};

test('createBuildMetadata uses the supplied root for git and branch discovery', () => withRepo((root, revision) => {
  const metadata = createBuildMetadata({ root, sourceRevision: revision, status: 'packaged' });
  assert.equal(metadata.sourceRevision, revision);
  assert.equal(metadata.sourceBranch, git(root, 'branch', '--show-current'));
  assert.equal(metadata.sourceState, 'clean');
  assert.equal(metadata.runtimeMatchesSource, true);
  assert.equal(metadata.status, 'packaged');
  assert.ok(metadata.runtimeSha256);
}));

test('unknown source revisions and changed runtime bytes cannot be packaged', () => withRepo((root, revision) => {
  assert.throws(() => createBuildMetadata({ root, sourceRevision: 'f'.repeat(40), status: 'packaged' }), /Unknown source revision/);
  writeFileSync(path.join(root, 'app.js'), 'export const app = 2;\n');
  const metadata = createBuildMetadata({ root, sourceRevision: revision, status: 'packaged' });
  assert.equal(metadata.sourceState, 'dirty');
  assert.equal(metadata.runtimeMatchesSource, false);
  assert.equal(metadata.status, 'development');
  assert.match(metadata.developmentStatus, /differs/);
}));

test('docs and generated metadata changes do not invalidate a frozen runtime', () => withRepo((root, revision) => {
  writeFileSync(path.join(root, 'README.md'), 'review notes\n');
  writeFileSync(path.join(root, 'version.json'), '{"sourceRevision":"local metadata"}\n');
  const metadata = createBuildMetadata({ root, sourceRevision: revision, status: 'packaged' });
  assert.equal(runtimeMatchesSource(root, revision), true);
  assert.equal(metadata.sourceState, 'clean');
  assert.equal(metadata.status, 'packaged');
}));

test('runtime digest includes build identity logic but excludes only generated metadata', () => withRepo((root, revision) => {
  const before = runtimeFileset(root);
  writeFileSync(path.join(root, 'build-identity.js'), 'export const identity = 2;\n');
  assert.notEqual(runtimeFileset(root).digest, before.digest);
  writeFileSync(path.join(root, 'build-metadata.js'), 'export const BUILD_IDENTITY_METADATA = { changed: true };\n');
  writeFileSync(path.join(root, 'version.json'), '{"changed":true}\n');
  assert.notEqual(runtimeFileset(root).digest, before.digest); // build identity remains changed
  assert.equal(runtimeMatchesSource(root, revision), false);
}));
