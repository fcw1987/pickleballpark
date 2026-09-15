// Generate truthful source/package metadata after a source revision is frozen.
// Generated metadata is excluded from the content digest to avoid self-hashing;
// the package manifest still records the bytes of these generated files.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const EXCLUSIONS = ['version.json', 'build-identity.js', 'build-info.json', 'runtime-manifest.json'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const validSha = value => /^[0-9a-f]{40}$/.test(value || '');

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const relative = `${directory}/${entry.name}`;
  if (entry.isDirectory()) return walk(relative);
  return relative;
});

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

export function createBuildMetadata({
  sourceRevision = git('rev-parse', 'HEAD'),
  sourceBranch = git('branch', '--show-current') || null,
  packageRevision = null,
  evidenceRevision = null,
  cacheVersion = null,
  buildTime = new Date().toISOString(),
  status,
  sourceState,
  root = '.',
} = {}) {
  if (!validSha(sourceRevision)) throw new Error('sourceRevision must be a full lowercase commit SHA');
  if (packageRevision !== null && !validSha(packageRevision)) throw new Error('packageRevision must be a full lowercase commit SHA or null');
  if (evidenceRevision !== null && !validSha(evidenceRevision)) throw new Error('evidenceRevision must be a full lowercase commit SHA or null');
  const dirty = Boolean(git('status', '--porcelain'));
  const state = sourceState || (dirty ? 'dirty' : 'clean');
  const resolvedStatus = status || (dirty ? 'development' : 'local');
  const fileset = runtimeFileset(root);
  return {
    schemaVersion: 1,
    product: 'Pickleball Park',
    status: resolvedStatus,
    developmentStatus: resolvedStatus === 'development' ? 'unverified local source' : 'stamped local build',
    sourceRevision,
    sourceBranch: sourceBranch || null,
    sourceState: state,
    packageRevision,
    evidenceRevision,
    runtimeSha256: fileset.digest,
    runtimeDigest: fileset.digest,
    runtimeFileset: {
      algorithm: fileset.algorithm,
      include: fileset.include,
      exclusions: fileset.exclusions,
    },
    cacheVersion,
    buildTime,
  };
}

export function writeBuildMetadata(metadata, root = '.') {
  const versionPath = path.join(root, 'version.json');
  writeFileSync(versionPath, `${JSON.stringify(metadata, null, 2)}\n`);
  const identityPath = path.join(root, 'build-identity.js');
  const original = readFileSync(identityPath, 'utf8');
  const marker = /const BUILD_IDENTITY_METADATA_START = [\s\S]*?;\n\nconst SHA1/;
  if (!marker.test(original)) throw new Error('build-identity.js metadata marker is missing');
  const replacement = `const BUILD_IDENTITY_METADATA_START = ${JSON.stringify(metadata, null, 2)};\n\nconst SHA1`;
  writeFileSync(identityPath, original.replace(marker, replacement));
  return { versionPath, identityPath };
}

const help = `Usage: node tools/stamp-build.mjs [options]\n\nOptions:\n  --source-revision <sha>  Frozen source commit (defaults to HEAD)\n  --package-revision <sha> Package/evidence commit when known\n  --evidence-revision <sha> Review evidence commit when known\n  --cache-version <name>   Service worker cache label\n  --status <value>         development, local, packaged, or verified\n  --build-time <ISO>       Explicit UTC build time\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = argumentMap(process.argv);
  if (args.help) {
    console.log(help);
  } else {
    const metadata = createBuildMetadata({
      sourceRevision: args['source-revision'],
      packageRevision: args['package-revision'] || null,
      evidenceRevision: args['evidence-revision'] || null,
      cacheVersion: args['cache-version'] || null,
      status: args.status,
      buildTime: args['build-time'] || undefined,
    });
    writeBuildMetadata(metadata);
    console.log(JSON.stringify({ ...metadata, runtimeFiles: runtimeFileset().files.length }, null, 2));
  }
}

