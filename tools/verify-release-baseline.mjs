// Explicit historical release check. Routine development does not run this.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonBytes, readRegularFile, runtimePaths, sha256 } from './runtime-package.mjs';

export function verifyReleaseBaseline(root = '.') {
  root = path.resolve(root);
  const pin = JSON.parse(readFileSync(path.join(root, 'tools/release-baseline.json')));
  const fixture = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/approved-runtime.json')));
  if (fixture.source !== pin.source || sha256(jsonBytes({ approvedSource: fixture.source, files: fixture.files })) !== pin.manifestSha256) throw Error('Frozen release manifest pin mismatch');
  if (JSON.stringify(fixture.files.map(file => file.path).sort()) !== JSON.stringify(runtimePaths(root))) throw Error('Frozen release path set mismatch');
  for (const file of fixture.files) {
    const bytes = readRegularFile(root, file.path);
    const frozen = execFileSync('git', ['show', `${pin.source}:${file.path}`], { cwd: root, maxBuffer: 20 * 1024 * 1024 });
    if (!bytes.equals(frozen) || bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw Error(`Frozen release runtime mismatch: ${file.path}`);
  }
  return { source: pin.source, runtimeFiles: fixture.files.length, manifestSha256: pin.manifestSha256 };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) console.log(JSON.stringify(verifyReleaseBaseline()));
