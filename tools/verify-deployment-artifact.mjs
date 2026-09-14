import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPROVED_SOURCE = 'e0177cc706e316a8011db348deed133fcaf3ec47';
const APPROVED_MANIFEST_SHA256 = '2b619132a2ad7e971dc76fb0b79bb02a33b904f281f4a692b8e767423aa74ee5';
const METADATA_FILES = ['build-info.json', 'runtime-manifest.json'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safePath = (file) => typeof file === 'string' && file.length > 0 && !path.posix.isAbsolute(file) && !file.split('/').includes('..') && !file.includes('\\');

const walkRegularFiles = (root, relative = '') => {
  const directory = path.join(root, relative);
  return readdirSync(directory).flatMap((name) => {
    const file = relative ? `${relative}/${name}` : name;
    const status = lstatSync(path.join(root, file));
    if (status.isSymbolicLink()) throw new Error(`Artifact contains a symbolic link: ${file}`);
    if (status.isDirectory()) return walkRegularFiles(root, file);
    if (!status.isFile()) throw new Error(`Artifact contains a non-regular file: ${file}`);
    return file;
  });
};

export function validateDeploymentArtifact(root, expectedRevision) {
  if (!/^[0-9a-f]{40}$/.test(expectedRevision ?? '')) throw new Error('Expected revision must be a full lowercase commit SHA');
  const status = lstatSync(root);
  if (status.isSymbolicLink() || !status.isDirectory()) throw new Error('Artifact root must be a real directory');
  const actualPaths = walkRegularFiles(root).sort();

  const manifestBytes = readFileSync(path.join(root, 'runtime-manifest.json'));
  if (sha256(manifestBytes) !== APPROVED_MANIFEST_SHA256) throw new Error('Unapproved runtime manifest digest');
  const manifest = JSON.parse(manifestBytes);
  const info = JSON.parse(readFileSync(path.join(root, 'build-info.json')));
  if (manifest.approvedSource !== APPROVED_SOURCE || info.approvedSource !== APPROVED_SOURCE) throw new Error('Approved source mismatch');
  if (info.product !== 'Pickleball Park') throw new Error('Artifact product mismatch');
  if (info.revision !== expectedRevision) throw new Error('Artifact revision mismatch');
  if (info.runtimeManifestSha256 !== APPROVED_MANIFEST_SHA256) throw new Error('Build metadata manifest digest mismatch');
  if (JSON.stringify(info.publicationMetadata) !== JSON.stringify(METADATA_FILES)) throw new Error('Publication metadata set mismatch');
  if (!Array.isArray(manifest.files) || manifest.files.length !== 99) throw new Error('Runtime manifest must contain exactly 99 files');

  const runtimePaths = manifest.files.map((file) => file.path);
  if (runtimePaths.some((file) => !safePath(file))) throw new Error('Runtime manifest contains an unsafe path');
  if (new Set(runtimePaths).size !== runtimePaths.length) throw new Error('Runtime manifest contains duplicate paths');
  const expectedPaths = [...runtimePaths, ...METADATA_FILES].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) throw new Error('Artifact path set mismatch');

  let runtimeBytes = 0;
  for (const file of manifest.files) {
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[0-9a-f]{64}$/.test(file.sha256 ?? '')) throw new Error(`Invalid runtime metadata: ${file.path}`);
    const bytes = readFileSync(path.join(root, file.path));
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`Runtime file mismatch: ${file.path}`);
    runtimeBytes += bytes.length;
  }
  if (info.runtimeFiles !== manifest.files.length) throw new Error('Runtime file count mismatch');
  if (info.runtimeBytes !== runtimeBytes) throw new Error('Runtime byte count mismatch');
  return { revision: expectedRevision, runtimeFiles: manifest.files.length, runtimeBytes, manifestSha256: APPROVED_MANIFEST_SHA256 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , root, revision] = process.argv;
  if (!root || !revision) throw new Error('Usage: node tools/verify-deployment-artifact.mjs <artifact-root> <commit-sha>');
  console.log(JSON.stringify(validateDeploymentArtifact(root, revision)));
}
