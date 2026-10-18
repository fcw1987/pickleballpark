// Generate truthful source/package metadata after a source revision is frozen.
// Generated metadata is excluded from the content digest to avoid a recursive
// self reference. Runtime code, including build-identity.js, remains covered.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXCLUSIONS = ['version.json', 'build-metadata.js', 'build-info.json', 'runtime-manifest.json'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const validSha = value => /^[0-9a-f]{40}$/.test(value || '');

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const gitBytes = (root, revision, relative) => execFileSync('git', ['show', `${revision}:${relative}`], { cwd: root, maxBuffer: 20 * 1024 * 1024 });

const walk = (directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(relative);
    return relative;
  });
};

/** The same runtime discovery used by the local package and pin workflows. */
export function discoverRuntimeFiles(root = '.') {
  const rootFiles = readdirSync(root).filter(file => /\.(?:js|css|html)$/.test(file) || ['manifest.json', 'version.json'].includes(file));
  const nested = [...walk(path.join(root, 'icons')), ...walk(path.join(root, 'vendor')), ...walk(path.join(root, 'assets'))]
    .filter(file => !file.startsWith(path.join(root, 'assets', 'source')));
  return [...rootFiles.map(file => path.join(root, file)), ...nested].sort();
}

export function runtimeFileset(root = '.') {
  const files = discoverRuntimeFiles(root)
    .map(file => ({ path: path.relative(root, file).split(path.sep).join('/'), bytes: readFileSync(file) }))
    .filter(file => !EXCLUSIONS.includes(file.path))
    .map(file => ({ path: file.path, bytes: file.bytes.length, sha256: sha256(file.bytes) }));
  return {
    algorithm: 'sha256',
    include: 'static application runtime files',
    exclusions: [...EXCLUSIONS],
    files,
    digest: sha256(Buffer.from(`${JSON.stringify({ algorithm: 'sha256', files })}\n`)),
  };
}

const sourceRuntimePaths = (root, revision) => git(root, 'ls-tree', '-r', '--name-only', revision)
  .split('\n')
  .filter(Boolean)
  .filter(file => (!file.includes('/') && /\.(?:js|css|html)$/.test(file)) || ['manifest.json', 'version.json'].includes(file)
    || file.startsWith('icons/') || file.startsWith('vendor/') || (file.startsWith('assets/') && !file.startsWith('assets/source/')))
  .filter(file => !EXCLUSIONS.includes(file));

/** Compare current runtime bytes and paths with the frozen source revision. */
export function runtimeMatchesSource(root, revision, fileset = runtimeFileset(root)) {
  const current = fileset.files.map(file => file.path).sort();
  const frozen = sourceRuntimePaths(root, revision).sort();
  if (JSON.stringify(current) !== JSON.stringify(frozen)) return false;
  return fileset.files.every(file => {
    try {
      const bytes = gitBytes(root, revision, file.path);
      return bytes.length === file.bytes && sha256(bytes) === file.sha256;
    } catch {
      return false;
    }
  });
}

const argumentMap = argv => {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);
    const name = argument.slice(2);
    if (name === 'help') return { help: true };
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    result[name] = value;
  }
  return result;
};

export function createBuildMetadata(options = {}) {
  const root = options.root || '.';
  const sourceRevision = options.sourceRevision || git(root, 'rev-parse', 'HEAD');
  if (!validSha(sourceRevision)) throw new Error('sourceRevision must be a full lowercase commit SHA');
  try {
    if (git(root, 'rev-parse', '--verify', `${sourceRevision}^{commit}`) !== sourceRevision) throw new Error('not exact');
  } catch {
    throw new Error(`Unknown source revision: ${sourceRevision}`);
  }
  const packageRevision = options.packageRevision ?? null;
  const evidenceRevision = options.evidenceRevision ?? null;
  if (packageRevision !== null && !validSha(packageRevision)) throw new Error('packageRevision must be a full lowercase commit SHA or null');
  if (evidenceRevision !== null && !validSha(evidenceRevision)) throw new Error('evidenceRevision must be a full lowercase commit SHA or null');

  const fileset = runtimeFileset(root);
  const sourceRevisionVerified = true;
  const runtimeMatches = runtimeMatchesSource(root, sourceRevision, fileset);
  const sourceBranch = options.sourceBranch === undefined ? (git(root, 'branch', '--show-current') || null) : options.sourceBranch;
  const requestedStatus = options.status || (runtimeMatches ? 'local' : 'development');
  if (!['development', 'local', 'packaged', 'verified'].includes(requestedStatus)) throw new Error(`Unsupported status: ${requestedStatus}`);
  const packageVerified = options.packageVerified === true;
  if (requestedStatus === 'verified' && !(runtimeMatches && packageVerified && packageRevision)) {
    throw new Error('verified status requires a matching frozen runtime and package proof');
  }
  const status = runtimeMatches ? requestedStatus : 'development';
  const developmentStatus = status === 'development'
    ? (runtimeMatches ? 'unverified local source' : 'runtime differs from frozen source revision')
    : (status === 'verified' ? 'verified source and package' : 'stamped local build');
  return {
    schemaVersion: 1,
    product: 'Pickleboard',
    status,
    developmentStatus,
    sourceRevision,
    sourceBranch,
    sourceState: runtimeMatches ? 'clean' : 'dirty',
    sourceRevisionVerified,
    runtimeMatchesSource: runtimeMatches,
    packageRevision,
    evidenceRevision,
    packageVerified,
    runtimeSha256: fileset.digest,
    runtimeDigest: fileset.digest,
    runtimeFileset: {
      algorithm: fileset.algorithm,
      include: fileset.include,
      exclusions: fileset.exclusions,
    },
    cacheVersion: options.cacheVersion ?? null,
    buildTime: options.buildTime || new Date().toISOString(),
  };
}

export function writeBuildMetadata(metadata, root = '.') {
  const versionPath = path.join(root, 'version.json');
  writeFileSync(versionPath, `${JSON.stringify(metadata, null, 2)}\n`);
  const metadataPath = path.join(root, 'build-metadata.js');
  const original = readFileSync(metadataPath, 'utf8');
  const marker = /export const BUILD_IDENTITY_METADATA = [\s\S]*?;\n/;
  if (!marker.test(original)) throw new Error('build-metadata.js metadata marker is missing');
  const replacement = `export const BUILD_IDENTITY_METADATA = ${JSON.stringify(metadata, null, 2)};\n`;
  writeFileSync(metadataPath, original.replace(marker, replacement));
  return { versionPath, metadataPath };
}

const help = `Usage: node tools/stamp-build.mjs [options]\n\nOptions:\n  --source-revision <sha>  Frozen source commit (defaults to HEAD)\n  --package-revision <sha> Package/evidence commit when known\n  --evidence-revision <sha> Review evidence commit when known\n  --cache-version <name>   Service worker cache label\n  --status <value>         development, local, packaged, or verified\n  --build-time <ISO>       Explicit UTC build time\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = argumentMap(process.argv);
  if (args.help) {
    console.log(help);
  } else {
    const metadata = createBuildMetadata({
      root: args.root || '.',
      sourceRevision: args['source-revision'],
      packageRevision: args['package-revision'] || null,
      evidenceRevision: args['evidence-revision'] || null,
      cacheVersion: args['cache-version'] || null,
      status: args.status,
      buildTime: args['build-time'] || undefined,
    });
    writeBuildMetadata(metadata, args.root || '.');
    console.log(JSON.stringify({ ...metadata, runtimeFiles: runtimeFileset(args.root || '.').files.length }, null, 2));
  }
}
