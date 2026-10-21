import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildSite } from '../tools/build-site.mjs';
import { assertNoPrivatePaths, createRuntimePackage, jsonBytes, regularFilePaths, sha256 } from '../tools/runtime-package.mjs';
import { validateDeploymentArtifact } from '../tools/verify-deployment-artifact.mjs';
import { makePackageSource } from './helpers/package-source.mjs';

const withStage = run => {
  const source = makePackageSource();
  const root = path.join(source.root, 'dist');
  try {
    buildSite({ sourceRoot: source.root, output: root, requireCommittedSource: true });
    return run({ ...source, sourceRoot: source.root, artifact: root });
  } finally { rmSync(source.root, { recursive: true, force: true }); }
};
const validate = data => validateDeploymentArtifact(data.artifact, data.revision, { sourceRoot: data.sourceRoot, requireCommittedSource: true });

test('packages only runtime files with deterministic exact-commit metadata without changing root stamps', () => withStage(data => {
  const result = validate(data);
  assert.equal(result.revision, data.revision);
  assert.equal(result.runtimeFiles, data.paths.length);
  assert.deepEqual(regularFilePaths(data.artifact).sort(), [...data.paths, 'build-info.json', 'runtime-manifest.json'].sort());
  const version = JSON.parse(readFileSync(path.join(data.artifact, 'version.json')));
  const module = readFileSync(path.join(data.artifact, 'build-metadata.js'), 'utf8');
  assert.equal(version.sourceRevision, data.revision);
  assert.equal(version.sourceBranch, null);
  assert.equal(version.runtimeMatchesSource, true);
  assert.equal(version.status, 'packaged');
  assert(module.includes(JSON.stringify(version, null, 2)));
  assert.equal(readFileSync(path.join(data.sourceRoot, 'version.json'), 'utf8'), '{"historical":true}\n');
  assert.equal(sha256(readFileSync(path.join(data.artifact, 'runtime-manifest.json'))), result.manifestSha256);
}));

test('routine build accepts a one-line edit with truthful dirty identity and no pin/stamp update', () => withStage(data => {
  writeFileSync(path.join(data.sourceRoot, 'app.js'), 'export const app = 2;\n');
  const info = buildSite({ sourceRoot: data.sourceRoot, output: data.artifact });
  assert.equal(info.sourceState, 'dirty');
  assert.equal(JSON.parse(readFileSync(path.join(data.artifact, 'version.json'))).status, 'development');
  assert.doesNotThrow(() => validateDeploymentArtifact(data.artifact, data.revision, { sourceRoot: data.sourceRoot }));
  assert.throws(() => validate(data), /differs from the expected source commit/);
  assert.throws(() => buildSite({ sourceRoot: data.sourceRoot, requireCommittedSource: true }), /differs from the expected source commit/);
}));

test('rejects missing and extra artifact files including source documents', () => {
  withStage(data => { rmSync(path.join(data.artifact, 'app.js')); assert.throws(() => validate(data), /path set mismatch/); });
  withStage(data => { writeFileSync(path.join(data.artifact, 'README.md'), 'source-only'); assert.throws(() => validate(data), /path set mismatch/); });
});

test('rejects modified runtime and even a self-consistently rehashed forged manifest', () => withStage(data => {
  writeFileSync(path.join(data.artifact, 'app.js'), 'forged');
  assert.throws(() => validate(data), /Runtime file mismatch/);
  const manifest = JSON.parse(readFileSync(path.join(data.artifact, 'runtime-manifest.json')));
  const entry = manifest.files.find(file => file.path === 'app.js');
  entry.bytes = 6; entry.sha256 = sha256(Buffer.from('forged'));
  const bytes = jsonBytes(manifest);
  writeFileSync(path.join(data.artifact, 'runtime-manifest.json'), bytes);
  const info = JSON.parse(readFileSync(path.join(data.artifact, 'build-info.json')));
  info.runtimeManifestSha256 = sha256(bytes);
  writeFileSync(path.join(data.artifact, 'build-info.json'), jsonBytes(info));
  assert.throws(() => validate(data), /manifest differs from trusted source/);
}));

test('rejects a wrong commit identity or altered generated metadata', () => {
  withStage(data => assert.throws(() => validateDeploymentArtifact(data.artifact, 'f'.repeat(40), { sourceRoot: data.sourceRoot }), /revision|commit|git/));
  withStage(data => { writeFileSync(path.join(data.artifact, 'version.json'), '{}'); assert.throws(() => validate(data), /Runtime file mismatch/); });
  withStage(data => { writeFileSync(path.join(data.artifact, 'build-info.json'), '{}'); assert.throws(() => validate(data), /Build metadata/); });
});

test('rejects artifact and source symlinks and unexpected runtime paths', () => {
  withStage(data => {
    const file = path.join(data.artifact, 'app.js'); rmSync(file); symlinkSync(path.join(data.sourceRoot, 'app.js'), file);
    assert.throws(() => validate(data), /symbolic link/);
  });
  withStage(data => {
    const file = path.join(data.sourceRoot, 'app.js'); rmSync(file); symlinkSync(path.join(data.sourceRoot, 'index.html'), file);
    assert.throws(() => createRuntimePackage({ sourceRoot: data.sourceRoot }), /symbolic link/);
  });
  withStage(data => { writeFileSync(path.join(data.sourceRoot, 'secret.js'), 'private'); assert.throws(() => createRuntimePackage({ sourceRoot: data.sourceRoot }), /path set differs/); });
});

test('rejects vendor divergence, private paths and unsafe allowlist entries', () => {
  withStage(data => { writeFileSync(path.join(data.sourceRoot, 'vendor/three.module.min.js'), 'modified'); assert.throws(() => createRuntimePackage({ sourceRoot: data.sourceRoot }), /Vendor differs/); });
  withStage(data => { writeFileSync(path.join(data.sourceRoot, 'app.js'), 'const path = "/Users/private/source";'); assert.throws(() => createRuntimePackage({ sourceRoot: data.sourceRoot }), /Private local path/); });
  withStage(data => { writeFileSync(path.join(data.sourceRoot, 'tools/runtime-files.json'), '["../private"]'); assert.throws(() => createRuntimePackage({ sourceRoot: data.sourceRoot }), /Invalid runtime/); });
});

test('private-path scanning covers SVG, text and embedded binary asset strings', () => {
  for (const file of ['assets/icon.svg', 'vendor/notice.txt', 'icons/font.ttf']) {
    assert.throws(() => assertNoPrivatePaths(new Map([[file, Buffer.from('embedded /Users/private/source')]])), /Private local path/);
  }
});
