// Paths are an explicit source contract; byte hashes belong to each build.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createBuildMetadata, discoverRuntimeFiles, EXCLUSIONS } from './stamp-build.mjs';

export const PRODUCT = 'Pickleball Park';
export const PUBLICATION_METADATA = ['build-info.json', 'runtime-manifest.json'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
export const validRevision = value => /^[0-9a-f]{40}$/.test(value || '');
const safePath = file => typeof file === 'string' && file.length > 0 && !path.posix.isAbsolute(file)
  && !file.includes('\\') && file.split('/').every(part => part && part !== '.' && part !== '..');

export function runtimePaths(sourceRoot) {
  const files = JSON.parse(readFileSync(path.join(sourceRoot, 'tools/runtime-files.json')));
  if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length || files.some(file => !safePath(file))) throw Error('Invalid runtime path allowlist');
  for (const file of files) {
    if (file.split('/').some(part => part.startsWith('.')) || file.endsWith('.map')) throw Error(`Non-runtime allowlist path: ${file}`);
    if (!(file.includes('/') ? /^(?:assets\/(?!source\/)|icons\/|vendor\/)/.test(file) : /\.(?:js|css|html)$/.test(file) || ['manifest.json', 'version.json'].includes(file))) throw Error(`Non-runtime allowlist path: ${file}`);
  }
  for (const required of ['index.html', 'manifest.json', 'sw.js', 'version.json', 'build-metadata.js']) if (!files.includes(required)) throw Error(`Runtime allowlist is missing ${required}`);
  return files.slice().sort();
}

export function readRegularFile(root, file) {
  const rootStatus = lstatSync(root);
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) throw Error('Source/artifact root must be a real directory');
  let target = root;
  for (const part of file.split('/')) {
    target = path.join(target, part);
    const status = lstatSync(target);
    if (status.isSymbolicLink()) throw Error(`Source/artifact contains a symbolic link: ${file}`);
    if (target !== path.join(root, file) && !status.isDirectory()) throw Error(`Invalid source directory: ${file}`);
  }
  if (!lstatSync(target).isFile()) throw Error(`Source/artifact is not a regular file: ${file}`);
  return readFileSync(target);
}

export function regularFilePaths(root, relative = '') {
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw Error('Artifact root must be a real directory');
  return readdirSync(path.join(root, relative)).flatMap(name => {
    const file = relative ? `${relative}/${name}` : name;
    const status = lstatSync(path.join(root, file));
    if (status.isSymbolicLink()) throw Error(`Artifact contains a symbolic link: ${file}`);
    if (status.isDirectory()) return regularFilePaths(root, file);
    if (!status.isFile()) throw Error(`Artifact contains a non-regular file: ${file}`);
    return file;
  });
}

export function assertNoPrivatePaths(files) {
  for (const [file, bytes] of files) {
    // Also inspect embedded text in raster/font files and future asset types.
    if (/(?:\/Users\/|\/home\/[A-Za-z0-9_.-]+\/|[A-Za-z]:\\Users\\|file:\/\/\/)/.test(bytes.toString('utf8'))) throw Error(`Private local path in publication file: ${file}`);
  }
}

export function createRuntimePackage({ sourceRoot = '.', revision = git(sourceRoot, 'rev-parse', 'HEAD'), requireCommittedSource = false, verifyVendor = true } = {}) {
  sourceRoot = path.resolve(sourceRoot);
  if (!validRevision(revision) || git(sourceRoot, 'rev-parse', `${revision}^{commit}`) !== revision) throw Error('Expected revision must identify a full source commit');
  const paths = runtimePaths(sourceRoot);
  const discovered = discoverRuntimeFiles(sourceRoot).map(file => path.relative(sourceRoot, file).split(path.sep).join('/')).sort();
  if (JSON.stringify(discovered) !== JSON.stringify(paths)) throw Error('Runtime path set differs from explicit allowlist');
  const files = new Map(paths.map(file => [file, readRegularFile(sourceRoot, file)]));
  const cacheVersion = files.get('sw.js').toString().match(/static-(v\d+)/)?.[1];
  if (!cacheVersion) throw Error('Service worker must declare a versioned static cache');
  // Regenerate only dist metadata. Null branch and commit time are deterministic
  // across PR, main, workflow_run and detached checkouts of the same commit.
  const metadata = createBuildMetadata({ root: sourceRoot, sourceRevision: revision, sourceBranch: null,
    status: 'packaged', cacheVersion: `pickleboard-static-${cacheVersion}`,
    buildTime: git(sourceRoot, 'show', '-s', '--format=%cI', revision) });
  if (requireCommittedSource && (!metadata.runtimeMatchesSource || [...files].some(([file, bytes]) => {
    try { return !bytes.equals(execFileSync('git', ['show', `${revision}:${file}`], { cwd: sourceRoot, maxBuffer: 20 * 1024 * 1024 })); }
    catch { return true; }
  }))) throw Error('Publication runtime differs from the expected source commit');
  if (verifyVendor) {
    const lock = JSON.parse(readFileSync(path.join(sourceRoot, 'package-lock.json')));
    const installed = JSON.parse(readFileSync(path.join(sourceRoot, 'node_modules/three/package.json')));
    if (installed.version !== lock.packages?.['node_modules/three']?.version) throw Error('Installed Three.js differs from the lockfile');
    for (const name of ['three.module.min.js', 'three.core.min.js']) if (!files.get(`vendor/${name}`)?.equals(readFileSync(path.join(sourceRoot, 'node_modules/three/build', name)))) throw Error(`Vendor differs from locked Three.js: ${name}`);
  }
  files.set('version.json', jsonBytes(metadata));
  const metadataSource = files.get('build-metadata.js').toString('utf8');
  const marker = /export const BUILD_IDENTITY_METADATA = [\s\S]*?;\n/;
  if (!marker.test(metadataSource)) throw Error('build-metadata.js metadata marker is missing');
  files.set('build-metadata.js', Buffer.from(metadataSource.replace(marker, `export const BUILD_IDENTITY_METADATA = ${JSON.stringify(metadata, null, 2)};\n`)));
  assertNoPrivatePaths(files);
  const manifest = { schemaVersion: 2, sourceRevision: revision,
    files: [...files].map(([file, bytes]) => ({ path: file, bytes: bytes.length, sha256: sha256(bytes) })) };
  const manifestBytes = jsonBytes(manifest);
  const info = { schemaVersion: 2, product: PRODUCT, revision, sourceRevision: revision,
    sourceState: metadata.sourceState, runtimeDigest: metadata.runtimeSha256,
    runtimeManifestSha256: sha256(manifestBytes), runtimeFiles: files.size,
    runtimeBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0), publicationMetadata: [...PUBLICATION_METADATA] };
  return { files, manifest, manifestBytes, info, infoBytes: jsonBytes(info), metadata };
}

export function validateRuntimeDigest(manifest, version) {
  const runtimeFiles = manifest.files.filter(file => !EXCLUSIONS.includes(file.path));
  return version.runtimeSha256 === sha256(Buffer.from(`${JSON.stringify({ algorithm: 'sha256', files: runtimeFiles })}\n`));
}
