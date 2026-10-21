// Explicitly replace the frozen release baseline, never routine build contracts.
// This writes no runtime metadata, commits, pushes, or deployments.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { git, jsonBytes, readRegularFile, runtimePaths, sha256, validRevision } from './runtime-package.mjs';
const source = process.argv[2];
if (!validRevision(source) || git('.', 'rev-parse', `${source}^{commit}`) !== source) throw Error('Provide the full committed runtime revision to pin');
const files = runtimePaths('.').map(file => {
  const bytes = readRegularFile('.', file);
  const committed = execFileSync('git', ['show', `${source}:${file}`], { maxBuffer: 20 * 1024 * 1024 });
  if (!bytes.equals(committed)) throw Error(`Uncommitted or different runtime: ${file}`);
  return { path: file, bytes: bytes.length, sha256: sha256(bytes) };
});
const old = JSON.parse(readFileSync('tests/fixtures/approved-runtime.json'));
const manifestSha256 = sha256(jsonBytes({ approvedSource: source, files }));
writeFileSync('tests/fixtures/approved-runtime.json', jsonBytes({ source, files }));
writeFileSync('tools/release-baseline.json', jsonBytes({ source, manifestSha256 }));
console.log(JSON.stringify({ source, manifestSha256, runtimeFiles: files.length,
  runtimeBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  deltaBytes: files.reduce((sum, file) => sum + file.bytes, 0) - old.files.reduce((sum, file) => sum + file.bytes, 0),
  note: 'Frozen release baseline updated. Routine package generation remains independent.' }, null, 2));
