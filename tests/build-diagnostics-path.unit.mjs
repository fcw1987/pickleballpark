import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBuildDiagnostics } from '../build-diagnostics.js';

test('version endpoint resolves from a project subpath like a packaged static site', async () => {
  const source = JSON.parse(readFileSync(new URL('../version.json', import.meta.url)));
  let requested;
  const diagnostics = createBuildDiagnostics({
    locationHref: 'https://example.test/pickleboard/index.html',
    versionPath: './version.json',
    fetchImpl: async url => {
      requested = String(url);
      return { ok: true, json: async () => source };
    },
  });
  const result = await diagnostics.queryServerBuild();
  assert.match(requested, /\/pickleboard\/version\.json\?diagnostic=/);
  assert.equal(result.serverFetch.status, 'complete');
  assert.equal(result.server.identity.product, 'Pickleball Park');
});
