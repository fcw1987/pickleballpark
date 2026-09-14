import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateDeploymentArtifact } from '../tools/verify-deployment-artifact.mjs';

const REVISION = '0'.repeat(40);
const fixture = JSON.parse(readFileSync('tests/fixtures/approved-runtime.json'));
const manifestBytes = Buffer.from(`${JSON.stringify({ approvedSource: fixture.source, files: fixture.files }, null, 2)}\n`);
const stage = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pickleballpark-deploy-test-'));
  for (const file of fixture.files) {
    const target = path.join(root, file.path);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(file.path, target);
  }
  writeFileSync(path.join(root, 'runtime-manifest.json'), manifestBytes);
  writeFileSync(path.join(root, 'build-info.json'), `${JSON.stringify({
    product: 'Pickleball Park', revision: REVISION, approvedSource: fixture.source,
    runtimeManifestSha256: '68e0163caede4f5057559f0730044022820178092f0024a5bb5880f1a44fba87',
    runtimeFiles: fixture.files.length,
    runtimeBytes: fixture.files.reduce((sum, file) => sum + file.bytes, 0),
    publicationMetadata: ['build-info.json', 'runtime-manifest.json'],
  }, null, 2)}\n`);
  return root;
};
const withStage = (run) => {
  const root = stage();
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
};

test('accepts the exact staged runtime fixture from the working tree', () => withStage((root) => {
  assert.deepEqual(validateDeploymentArtifact(root, REVISION), {
    revision: REVISION, runtimeFiles: 99, runtimeBytes: 1657572,
    manifestSha256: '68e0163caede4f5057559f0730044022820178092f0024a5bb5880f1a44fba87',
  });
}));

test('rejects missing and extra artifact files', () => {
  withStage((root) => { rmSync(path.join(root, fixture.files[0].path)); assert.throws(() => validateDeploymentArtifact(root, REVISION), /path set mismatch/); });
  withStage((root) => { writeFileSync(path.join(root, 'extra.txt'), 'extra'); assert.throws(() => validateDeploymentArtifact(root, REVISION), /path set mismatch/); });
});

test('rejects changed runtime bytes', () => withStage((root) => {
  writeFileSync(path.join(root, fixture.files[0].path), 'changed');
  assert.throws(() => validateDeploymentArtifact(root, REVISION), /Runtime file mismatch/);
}));

test('rejects the wrong expected revision', () => withStage((root) => {
  assert.throws(() => validateDeploymentArtifact(root, '1'.repeat(40)), /revision mismatch/);
}));

test('rejects a changed runtime manifest', () => withStage((root) => {
  writeFileSync(path.join(root, 'runtime-manifest.json'), `${manifestBytes} `);
  assert.throws(() => validateDeploymentArtifact(root, REVISION), /manifest digest/);
}));

test('rejects symbolic links', () => withStage((root) => {
  const target = path.join(root, fixture.files[0].path);
  rmSync(target);
  symlinkSync(path.join(process.cwd(), fixture.files[0].path), target);
  assert.throws(() => validateDeploymentArtifact(root, REVISION), /symbolic link/);
}));

test('rejects the obsolete hidden-file metadata contract', () => withStage((root) => {
  const file = path.join(root, 'build-info.json');
  const info = JSON.parse(readFileSync(file));
  info.publicationMetadata.push('.nojekyll');
  writeFileSync(file, JSON.stringify(info));
  assert.throws(() => validateDeploymentArtifact(root, REVISION), /Publication metadata set mismatch/);
}));
