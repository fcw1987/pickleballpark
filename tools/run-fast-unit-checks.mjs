// Local feedback only. Required Quality CI continues to use the complete
// tests/*.unit.mjs catalog through npm run check.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// These standalone corpus/rig sweeps are deliberately explicit: newly added
// unit files are included by default, and every omitted file stays in check.
const extendedFiles = new Set([
  'doubles-strategy.unit.mjs',
  'reference-athletes-camera-range.unit.mjs',
  'reference-athletes-sleeves.unit.mjs',
  'smart-adversarial.unit.mjs',
  'smart-domain.unit.mjs',
  'smart-rally-generator.unit.mjs',
]);
const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(file => file.endsWith('.unit.mjs') && !extendedFiles.has(file))
  .sort()
  .map(file => `tests/${file}`);
console.log(`Fast local unit checks: ${files.length} files; ${extendedFiles.size} standalone sweeps remain in npm run check.`);
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
