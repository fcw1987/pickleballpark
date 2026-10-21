import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimePackage, PUBLICATION_METADATA, regularFilePaths, sha256, validateRuntimeDigest } from './runtime-package.mjs';

// Derive expected bytes from trusted source, not artifact-provided hashes.
export function validateDeploymentArtifact(root, expectedRevision, { sourceRoot = '.', requireCommittedSource = false } = {}) {
  const expected = createRuntimePackage({ sourceRoot, revision: expectedRevision, requireCommittedSource, verifyVendor: false });
  const actualPaths = regularFilePaths(root).sort();
  const expectedPaths = [...expected.files.keys(), ...PUBLICATION_METADATA].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) throw Error('Artifact path set mismatch');
  const manifestBytes = readFileSync(path.join(root, 'runtime-manifest.json'));
  if (!manifestBytes.equals(expected.manifestBytes)) throw Error('Runtime manifest differs from trusted source commit');
  const infoBytes = readFileSync(path.join(root, 'build-info.json'));
  if (!infoBytes.equals(expected.infoBytes)) throw Error('Build metadata differs from trusted source commit');
  for (const [file, bytes] of expected.files) if (!readFileSync(path.join(root, file)).equals(bytes)) throw Error(`Runtime file mismatch: ${file}`);
  const version = JSON.parse(readFileSync(path.join(root, 'version.json')));
  if (!validateRuntimeDigest(expected.manifest, version)) throw Error('Version metadata runtime digest mismatch');
  return { revision: expectedRevision, runtimeFiles: expected.info.runtimeFiles, runtimeBytes: expected.info.runtimeBytes, manifestSha256: sha256(manifestBytes) };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , root, revision] = process.argv;
  if (!root || !revision) throw Error('Usage: node tools/verify-deployment-artifact.mjs <artifact-root> <commit-sha> [--require-clean]');
  console.log(JSON.stringify(validateDeploymentArtifact(root, revision, { requireCommittedSource: process.argv.includes('--require-clean') })));
}
