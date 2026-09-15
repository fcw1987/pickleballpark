/*
 * Build identity is imported with the application modules.  It is deliberately
 * an embedded snapshot: a later request for version.json must never change the
 * build that the running page reports.
 *
 * tools/stamp-build.mjs replaces the object between the metadata markers after
 * a source revision has been frozen.  The development object below is truthful
 * for an unstamped checkout and contains no machine paths, drafts, or secrets.
 */

const BUILD_IDENTITY_METADATA_START = {
  schemaVersion: 1,
  product: 'Pickleball Park',
  status: 'development',
  developmentStatus: 'unverified local source',
  sourceRevision: null,
  sourceBranch: 'work/smart-rally-diagnostics',
  sourceState: 'dirty',
  packageRevision: null,
  evidenceRevision: null,
  runtimeSha256: null,
  runtimeDigest: null,
  runtimeFileset: {
    algorithm: 'sha256',
    include: 'static application runtime files',
    exclusions: ['version.json', 'build-identity.js', 'build-info.json', 'runtime-manifest.json'],
  },
  cacheVersion: null,
  buildTime: null,
};

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const statuses = new Set(['development', 'local', 'packaged', 'verified']);

const copy = value => {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
};

const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
};

const optionalSha = (value, pattern) => typeof value === 'string' && pattern.test(value) ? value : null;
const optionalString = value => typeof value === 'string' && value.length > 0 ? value : null;

/**
 * Normalize metadata received from a checked-in or fetched version endpoint.
 * Unknown fields are ignored so diagnostics cannot accidentally expose an
 * absolute path or a saved play included by a future endpoint.
 */
export function normalizeBuildIdentity(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const fileset = source.runtimeFileset && typeof source.runtimeFileset === 'object' ? source.runtimeFileset : {};
  const exclusions = Array.isArray(fileset.exclusions)
    ? fileset.exclusions.filter(item => typeof item === 'string' && item.length > 0 && !item.startsWith('/') && !item.includes('\\') && !item.split('/').includes('..'))
    : ['version.json', 'build-identity.js', 'build-info.json', 'runtime-manifest.json'];
  const sourceState = ['clean', 'dirty', 'unknown'].includes(source.sourceState) ? source.sourceState : 'unknown';
  const requestedStatus = statuses.has(source.status) ? source.status : 'development';
  const status = sourceState === 'dirty' && requestedStatus === 'verified' ? 'development' : requestedStatus;
  const normalized = {
    schemaVersion: Number.isInteger(source.schemaVersion) ? source.schemaVersion : 1,
    product: source.product === 'Pickleball Park' ? source.product : 'Pickleball Park',
    status,
    developmentStatus: optionalString(source.developmentStatus) || (status === 'development' ? 'unverified local source' : status),
    sourceRevision: optionalSha(source.sourceRevision, SHA1),
    sourceBranch: optionalString(source.sourceBranch),
    sourceState,
    packageRevision: optionalSha(source.packageRevision, SHA1),
    evidenceRevision: optionalSha(source.evidenceRevision, SHA1),
    runtimeSha256: optionalSha(source.runtimeSha256, SHA256),
    runtimeDigest: optionalSha(source.runtimeDigest, SHA256),
    runtimeFileset: {
      algorithm: 'sha256',
      include: optionalString(fileset.include) || 'static application runtime files',
      exclusions: [...new Set(exclusions)],
    },
    cacheVersion: optionalString(source.cacheVersion),
    buildTime: optionalString(source.buildTime),
  };
  return freeze(normalized);
}

// BUILD_IDENTITY_METADATA_START is a stable replacement anchor for the stamp
// script.  Do not derive the running identity from a later network response.
export const BUILD_IDENTITY = normalizeBuildIdentity(BUILD_IDENTITY_METADATA_START);

/** Return a detached immutable snapshot for a page's startup state. */
export function snapshotBuildIdentity(identity = BUILD_IDENTITY) {
  return normalizeBuildIdentity(copy(identity));
}

/** Name makes the startup snapshot explicit at integration call sites. */
export const captureLoadedBuildIdentity = snapshotBuildIdentity;

export function isBuildIdentityVerified(identity = BUILD_IDENTITY) {
  const current = normalizeBuildIdentity(identity);
  return current.status === 'verified' && current.sourceState === 'clean' && Boolean(current.sourceRevision && current.runtimeSha256);
}

export function buildIdentityLabel(identity = BUILD_IDENTITY) {
  const current = normalizeBuildIdentity(identity);
  if (current.status === 'development') return 'Development build · running source snapshot is unverified';
  if (current.sourceRevision) return `Running build · source ${current.sourceRevision.slice(0, 12)}`;
  return 'Running build · source revision unavailable';
}
