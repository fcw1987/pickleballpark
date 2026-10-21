// Build only the explicit application allowlist and deterministic metadata.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimePackage } from './runtime-package.mjs';

export function buildSite({ sourceRoot = '.', output = path.join(sourceRoot, 'dist'), requireCommittedSource = false } = {}) {
  const data = createRuntimePackage({ sourceRoot, requireCommittedSource });
  output = path.resolve(output);
  if (output === path.resolve(sourceRoot) || path.resolve(sourceRoot).startsWith(`${output}${path.sep}`)) throw Error('Output cannot replace the source directory');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const [file, bytes] of [...data.files, ['runtime-manifest.json', data.manifestBytes], ['build-info.json', data.infoBytes]]) {
    mkdirSync(path.dirname(path.join(output, file)), { recursive: true });
    writeFileSync(path.join(output, file), bytes);
  }
  return data.info;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const info = buildSite({ requireCommittedSource: process.argv.includes('--require-clean') });
  console.log(`Packaged ${info.runtimeFiles} runtime files (${info.runtimeBytes} bytes) plus 2 metadata files; source ${info.revision} (${info.sourceState})`);
}
