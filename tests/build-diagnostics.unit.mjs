import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILD_IDENTITY, snapshotBuildIdentity } from '../build-identity.js';
import { createBuildDiagnostics, formatBuildDiagnostics } from '../build-diagnostics.js';

const running = snapshotBuildIdentity({
  status: 'packaged',
  developmentStatus: 'stamped local build',
  sourceRevision: '1'.repeat(40),
  sourceBranch: 'integration/test-source',
  sourceState: 'clean',
  packageRevision: '2'.repeat(40),
  evidenceRevision: '3'.repeat(40),
  runtimeSha256: '4'.repeat(64),
  cacheVersion: 'pickleboard-static-test',
  buildTime: '2026-09-15T12:00:00.000Z',
});

test('captures a loaded identity and keeps a later server response separate', async () => {
  const calls = [];
  const diagnostics = createBuildDiagnostics({
    loadedIdentity: running,
    locationHref: 'https://example.test/pickleboard/index.html',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return { ok: true, json: async () => ({ ...running, sourceRevision: 'a'.repeat(40), status: 'verified' }) };
    },
  });
  const before = diagnostics.snapshot();
  const after = await diagnostics.queryServerBuild();
  assert.equal(after.running.sourceRevision, '1'.repeat(40));
  assert.equal(after.server.identity.sourceRevision, 'a'.repeat(40));
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.headers['cache-control'], 'no-cache');
  assert.match(calls[0].url, /version\.json\?diagnostic=/);
  assert.equal(before.running.sourceRevision, '1'.repeat(40));
  assert.equal(diagnostics.running.sourceRevision, '1'.repeat(40));
});

test('offline diagnostics retain the loaded identity and report unavailable server state', async () => {
  const diagnostics = createBuildDiagnostics({
    loadedIdentity: running,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  const result = await diagnostics.queryServerBuild();
  assert.equal(result.running.sourceRevision, '1'.repeat(40));
  assert.equal(result.server.status, 'unavailable');
  assert.equal(result.serverFetch.status, 'unavailable');
  assert.match(diagnostics.report(), /Running build: Running build/);
  assert.match(diagnostics.report(), /Server build: unavailable/);
});

test('copy diagnostics has a compact metadata only report', async () => {
  let copied = '';
  const diagnostics = createBuildDiagnostics({ loadedIdentity: BUILD_IDENTITY, clipboard: { writeText: async text => { copied = text; } } });
  const result = await diagnostics.copy();
  assert.equal(result.ok, true);
  assert.equal(result.text, copied);
  assert.doesNotMatch(result.text, /pickleballpark-builder|\/Users\/|password|secret/i);
});

test('formatter distinguishes running and server labels', () => {
  const report = formatBuildDiagnostics({ running, server: { status: 'verified', identity: { ...running, sourceRevision: 'b'.repeat(40) } } });
  assert.match(report, /Source revision: 111111/);
  assert.match(report, /Server build: bbbbbbbbbbbb/);
  assert.match(report, /Runtime fileset: static application runtime files/);
});

