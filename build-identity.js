/*
 * Build identity is imported with the application modules.  It is deliberately
 * an embedded snapshot: a later request for version.json must never change the
 * build that the running page reports.
 *
 * tools/stamp-build.mjs replaces the generated build-metadata.js snapshot after
 * a source revision has been frozen.  The development object is truthful for
 * an unstamped checkout and contains no machine paths, drafts, or secrets.
 */
import { BUILD_IDENTITY_METADATA } from './build-metadata.js';

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const statuses = new Set(['development', 'local', 'packaged', 'verified']);
const MAX_STRING_LENGTH = 160;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._/@:+ -]*$/;
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._/@:+ -]*$/;

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
const optionalString = (value, pattern = SAFE_LABEL) => (
  typeof value === 'string' && value.length > 0 && value.length <= MAX_STRING_LENGTH && pattern.test(value)
    && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..')
    ? value
    : null
);

const optionalBoolean = value => typeof value === 'boolean' ? value : false;

/**
 * Normalize metadata received from a checked-in or fetched version endpoint.
 * Unknown fields are ignored so diagnostics cannot accidentally expose an
 * absolute path or a saved play included by a future endpoint.
 */
export function normalizeBuildIdentity(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const fileset = source.runtimeFileset && typeof source.runtimeFileset === 'object' ? source.runtimeFileset : {};
  const exclusions = Array.isArray(fileset.exclusions)
    ? fileset.exclusions.filter(item => typeof item === 'string' && item.length > 0 && item.length <= 120 && SAFE_PATH.test(item) && !item.startsWith('/') && !item.includes('\\') && !item.split('/').includes('..')).slice(0, 16)
    : ['version.json', 'build-metadata.js', 'build-info.json', 'runtime-manifest.json'];
  const sourceState = ['clean', 'dirty', 'unknown'].includes(source.sourceState) ? source.sourceState : 'unknown';
  const requestedStatus = statuses.has(source.status) ? source.status : 'development';
  const sourceRevisionVerified = optionalBoolean(source.sourceRevisionVerified);
  const runtimeMatchesSource = optionalBoolean(source.runtimeMatchesSource);
  const packageVerified = optionalBoolean(source.packageVerified);
  const sourceProof = sourceRevisionVerified
    && runtimeMatchesSource
    && sourceState === 'clean'
    && optionalSha(source.sourceRevision, SHA1)
    && optionalSha(source.runtimeSha256, SHA256);
  const status = requestedStatus === 'verified' && !(sourceProof && packageVerified)
    ? 'development'
    : (requestedStatus === 'packaged' && !sourceProof ? 'development' : requestedStatus);
  const normalized = {
    schemaVersion: Number.isInteger(source.schemaVersion) ? source.schemaVersion : 1,
    product: source.product === 'Pickleboard' ? source.product : 'Pickleboard',
    status,
    developmentStatus: optionalString(source.developmentStatus) || (status === 'development' ? 'unverified local source' : status),
    sourceRevision: optionalSha(source.sourceRevision, SHA1),
    sourceBranch: optionalString(source.sourceBranch),
    sourceState,
    sourceRevisionVerified,
    runtimeMatchesSource,
    packageRevision: optionalSha(source.packageRevision, SHA1),
    evidenceRevision: optionalSha(source.evidenceRevision, SHA1),
    packageVerified,
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

// Do not derive the running identity from a later network response.
export const BUILD_IDENTITY = normalizeBuildIdentity(BUILD_IDENTITY_METADATA);

/** Return a detached immutable snapshot for a page's startup state. */
export function snapshotBuildIdentity(identity = BUILD_IDENTITY) {
  return normalizeBuildIdentity(copy(identity));
}

/** Name makes the startup snapshot explicit at integration call sites. */
export const captureLoadedBuildIdentity = snapshotBuildIdentity;

export function isBuildIdentityVerified(identity = BUILD_IDENTITY) {
  const current = normalizeBuildIdentity(identity);
  return current.status === 'verified'
    && current.sourceState === 'clean'
    && current.sourceRevisionVerified
    && current.runtimeMatchesSource
    && current.packageVerified
    && Boolean(current.sourceRevision && current.runtimeSha256);
}

export function buildIdentityLabel(identity = BUILD_IDENTITY) {
  const current = normalizeBuildIdentity(identity);
  if (current.status === 'development') return 'Development build · running source snapshot is unverified';
  if (current.sourceRevision) return `Running build · source ${current.sourceRevision.slice(0, 12)}`;
  return 'Running build · source revision unavailable';
}
