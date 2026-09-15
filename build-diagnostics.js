import {
  BUILD_IDENTITY,
  buildIdentityLabel,
  normalizeBuildIdentity,
  snapshotBuildIdentity,
} from './build-identity.js';

const SAFE_STATUS = /^(development|local|packaged|verified|unavailable|error)$/;

const publicIdentity = identity => {
  const normalized = normalizeBuildIdentity(identity);
  return {
    schemaVersion: normalized.schemaVersion,
    product: normalized.product,
    status: normalized.status,
    developmentStatus: normalized.developmentStatus,
    sourceRevision: normalized.sourceRevision,
    sourceBranch: normalized.sourceBranch,
    sourceState: normalized.sourceState,
    packageRevision: normalized.packageRevision,
    evidenceRevision: normalized.evidenceRevision,
    runtimeSha256: normalized.runtimeSha256,
    runtimeDigest: normalized.runtimeDigest,
    runtimeFileset: normalized.runtimeFileset,
    cacheVersion: normalized.cacheVersion,
    buildTime: normalized.buildTime,
  };
};

const safeServerStatus = value => typeof value === 'string' && SAFE_STATUS.test(value) ? value : 'unavailable';

/**
 * A compact, copyable report.  It contains build metadata only; it never
 * serializes a builder document, a browser storage value, or a local path.
 */
export function formatBuildDiagnostics({ running = BUILD_IDENTITY, server = null, environment = 'online' } = {}) {
  const loaded = publicIdentity(running);
  const lines = [
    'Pickleball Park build diagnostics',
    `Running build: ${buildIdentityLabel(loaded)}`,
    `Running status: ${loaded.status} (${loaded.developmentStatus})`,
    `Source revision: ${loaded.sourceRevision || 'unavailable'}`,
    `Source branch: ${loaded.sourceBranch || 'unavailable'}`,
    `Source state: ${loaded.sourceState}`,
    `Package revision: ${loaded.packageRevision || 'unavailable'}`,
    `Evidence revision: ${loaded.evidenceRevision || 'unavailable'}`,
    `Runtime SHA-256: ${loaded.runtimeSha256 || loaded.runtimeDigest || 'unavailable'}`,
    `Runtime fileset: ${loaded.runtimeFileset.include}; excludes ${loaded.runtimeFileset.exclusions.join(', ')}`,
    `Cache version: ${loaded.cacheVersion || 'unavailable'}`,
    `Build time: ${loaded.buildTime || 'development source'}`,
    `Environment: ${environment}`,
  ];
  if (server?.identity) {
    const remote = publicIdentity(server.identity);
    lines.push(`Server build: ${remote.sourceRevision || 'revision unavailable'} (${remote.status})`);
    lines.push(`Server runtime SHA-256: ${remote.runtimeSha256 || remote.runtimeDigest || 'unavailable'}`);
  } else {
    lines.push(`Server build: ${server?.status || 'not queried'}`);
  }
  return lines.join('\n');
}

export const formatDiagnostics = formatBuildDiagnostics;

const requestURL = (versionPath, locationHref) => {
  const base = locationHref || (typeof location !== 'undefined' ? location.href : 'http://localhost/');
  const url = new URL(versionPath, base);
  url.searchParams.set('diagnostic', `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  return url;
};

/**
 * Create a diagnostic controller with a frozen running identity.  Server
 * metadata is an explicit, no-store comparison and cannot overwrite `running`.
 */
export function createBuildDiagnostics({
  loadedIdentity = BUILD_IDENTITY,
  fetchImpl = globalThis.fetch,
  versionPath = './version.json',
  locationHref,
  clipboard = globalThis.navigator?.clipboard,
} = {}) {
  const running = snapshotBuildIdentity(loadedIdentity);
  let server = null;
  let serverFetch = { status: 'not-requested', cache: 'no-store', path: versionPath };

  const snapshot = () => ({
    running: snapshotBuildIdentity(running),
    server: server ? { ...server, identity: server.identity ? snapshotBuildIdentity(server.identity) : undefined } : null,
    serverFetch: { ...serverFetch },
  });

  const queryServerBuild = async () => {
    if (typeof fetchImpl !== 'function') {
      serverFetch = { status: 'unavailable', cache: 'no-store', path: versionPath };
      server = { status: 'unavailable', reason: 'fetch-unavailable' };
      return snapshot();
    }
    const url = requestURL(versionPath, locationHref);
    serverFetch = { status: 'pending', cache: 'no-store', path: versionPath };
    try {
      const response = await fetchImpl(url, {
        cache: 'no-store',
        headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      server = { status: safeServerStatus(payload?.status), identity: normalizeBuildIdentity(payload) };
      serverFetch = { status: 'complete', cache: 'no-store', path: versionPath };
    } catch {
      server = { status: 'unavailable', reason: 'version-endpoint-unavailable' };
      serverFetch = { status: 'unavailable', cache: 'no-store', path: versionPath };
    }
    return snapshot();
  };

  const report = () => formatBuildDiagnostics({ running, server, environment: server?.status === 'unavailable' ? 'offline' : 'online' });
  const copy = async () => {
    const text = report();
    if (!clipboard || typeof clipboard.writeText !== 'function') return { ok: false, reason: 'clipboard-unavailable', text };
    try {
      await clipboard.writeText(text);
      return { ok: true, text };
    } catch {
      return { ok: false, reason: 'clipboard-write-failed', text };
    }
  };

  return Object.freeze({
    get running() { return snapshotBuildIdentity(running); },
    snapshot,
    report,
    queryServerBuild,
    copy,
  });
}

export const createBuildDiagnosticController = createBuildDiagnostics;
export const copyBuildDiagnostics = async (controller, options = {}) => {
  if (controller && typeof controller.copy === 'function') return controller.copy(options);
  const fallback = createBuildDiagnostics(options);
  return fallback.copy();
};
