import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Small independent source repository: these tests do not freeze app bytes.
export function makePackageSource() {
  const root = mkdtempSync(path.join(tmpdir(), 'pickleballpark-package-source-'));
  const paths = ['app.js', 'build-identity.js', 'build-metadata.js', 'index.html', 'manifest.json', 'sw.js', 'version.json', 'vendor/three.core.min.js', 'vendor/three.module.min.js'].sort();
  const files = {
    'app.js': 'export const app = 1;\n',
    'build-identity.js': 'export const product = "Pickleball Park";\n',
    'build-metadata.js': 'export const BUILD_IDENTITY_METADATA = {};\n',
    'index.html': '<!doctype html><title>Pickleball Park</title>\n',
    'manifest.json': '{"name":"Pickleball Park","start_url":"./index.html"}\n',
    'sw.js': 'const CACHE_PREFIX = "pickleboard-"; const STATIC_CACHE = `${CACHE_PREFIX}static-v1`;\n',
    'version.json': '{"historical":true}\n',
    'vendor/three.core.min.js': 'export const core = true;\n',
    'vendor/three.module.min.js': 'export const three = true;\n',
    'tools/runtime-files.json': JSON.stringify(paths),
    'package-lock.json': JSON.stringify({ packages: { 'node_modules/three': { version: '0.0.0' } } }),
    'node_modules/three/package.json': '{"version":"0.0.0"}',
    'node_modules/three/build/three.core.min.js': 'export const core = true;\n',
    'node_modules/three/build/three.module.min.js': 'export const three = true;\n',
    '.gitignore': 'node_modules/\ndist/\n',
    'docs/private.md': 'This source-only file must never be published.',
    'tests/private.txt': 'This test-only file must never be published.',
  };
  for (const [file, value] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), value);
  }
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Package Test');
  git('add', '.');
  git('commit', '-qm', 'fixture source');
  return { root, revision: git('rev-parse', 'HEAD'), paths };
}
