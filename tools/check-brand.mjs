#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD_BRAND = /\b(?:pickle\s*ball\s+park|paddle\s+park)\b/gi;
const TEXT_FILE = /(?:^|\/)[^/]+\.(?:css|html|js|json|md|mjs|svg|txt|ya?ml)$/i;

// Immutable evidence, explicitly listed so a new archive cannot silently escape review.
const ARCHIVED_FILES = new Set([
  'docs/PARK_COACHING_VERIFICATION.md', 'docs/PIXEL_REPLAY_VERIFICATION.md',
  'docs/PIXEL_RELIABILITY.md', 'docs/SECOND_PASS_VERIFICATION.md', 'docs/VISUAL_VERIFICATION.md',
  'docs/review-luna-world.md', 'docs/review-sol-final.md', 'docs/review-sol-sample.md',
  'docs/park-coaching/after-native/cadence.json', 'docs/park-coaching/after/capture-metadata.json',
  'docs/park-coaching/before-native/cadence.json', 'docs/park-coaching/before/capture-metadata.json',
  'docs/park-coaching/evidence-manifest.json', 'docs/park-coaching/final-native/cadence.json',
  'docs/park-coaching/index.html', 'docs/park-coaching/loading-final.json',
  'docs/park-coaching/loading.json', 'docs/park-coaching/network-offline.json',
  'docs/park-coaching/rally-comparison/evidence.json', 'docs/park-coaching/review-visual.md',
  'docs/park-coaching/technical-review.md', 'docs/park-coaching/upgrade.json',
  'docs/park-coaching/visual-review-luna/3d-normal-video-results.json',
  'docs/park-coaching/visual-review-luna/capture-3d-normal-videos.mjs',
  'docs/park-coaching/visual-review-luna/capture-3d.mjs',
  'docs/park-coaching/visual-review-luna/capture-final-cue.mjs',
  'docs/park-coaching/visual-review-luna/capture-final-fourth-block.mjs',
  'docs/park-coaching/visual-review-luna/capture-final-short-hop.mjs',
  'docs/park-coaching/visual-review-luna/capture-latest-critical.mjs',
  'docs/park-coaching/visual-review-luna/capture-loop.mjs',
  'docs/park-coaching/visual-review-luna/capture-menu-settled.mjs',
  'docs/park-coaching/visual-review-luna/capture-normal-videos.mjs',
  'docs/park-coaching/visual-review-luna/capture-results.json',
  'docs/park-coaching/visual-review-luna/capture.mjs',
  'docs/park-coaching/visual-review-luna/final-cue-results.json',
  'docs/park-coaching/visual-review-luna/final-fourth-block-results.json',
  'docs/park-coaching/visual-review-luna/final-short-hop-results.json',
  'docs/park-coaching/visual-review-luna/normal-video-results.json',
  'docs/park-coaching/visual-review-luna/query-action.json',
  'docs/park-coaching/visual-review-luna/query-action.mjs',
  'docs/park-coaching/webkit-minimal-cache.json',
  'docs/pixel-replay/after-native/cadence.json', 'docs/pixel-replay/after/capture-metadata.json',
  'docs/pixel-replay/before-native/cadence.json', 'docs/pixel-replay/before/capture-metadata.json',
  'docs/pixel-replay/character-comparison.json', 'docs/pixel-replay/index.html',
  'docs/pixel-replay/checks-chromium.txt', 'docs/pixel-replay/checks-lifecycle-contact.txt',
  'docs/pixel-replay/checks-webkit-baseline.txt', 'docs/pixel-replay/checks-webkit.txt',
  'docs/pixel-replay/loading.json', 'docs/pixel-replay/motion/index.json', 'docs/pixel-replay/upgrade.json'
]);
const isArchived = file => ARCHIVED_FILES.has(file);

// These checked-in reports describe earlier named builds. New files are checked.
const HISTORICAL_BRAND_FILES = new Set([
  'docs/BETA_STABILIZATION_REPORT.md',
  'docs/PARK_COACHING_VERIFICATION.md',
  'docs/PIXEL_GAME_LUNA_REVIEW.md',
  'docs/REBRAND_VERIFICATION.md',
  'docs/RELEASE_PUBLICATION_SUMMARY.md',
  'docs/VISUAL_DIRECTION.md',
  'docs/art-overhaul/OFFLINE_ENGINE_CONTROL.md',
  'docs/art-overhaul/before/README.md',
  'docs/art-overhaul/build-stamp.json',
  'docs/art-overhaul/final/package-verification.json',
  'docs/art-overhaul/review.html',
  'docs/court-first/index.html',
  'docs/fidelity/REPORT.md',
  'docs/fidelity/review-wave1/observations.json',
  'docs/fidelity/review-wave1.md',
  'docs/fidelity/review-wave2.md',
  'docs/fidelity/review-wave3.md',
  'docs/smart-visible/report.md',
  'docs/town-art/review.html',
  'docs/town-art/verification/package-verification.json',
  'docs/town-art-performance/final/matched-desktop.json',
  'docs/town-art-performance/final/matched-phone.json',
  'docs/town-art-performance/final/pre-memory-fix/matched-desktop.json',
  'docs/town-art-performance/final/pre-memory-fix/matched-phone.json',
  'docs/town-art-performance/review.html',
  'docs/town-art-performance/verification/cache-pixel-final-resumed.json',
  'docs/town-art-performance/verification/final-preview-http.json',
  'docs/town-art-performance/verification/package-v28.json',
  'docs/town-art-performance/verification/package-verification.json',
]);
const removeApprovedHistoricalLabels = (file, source) => {
  if (HISTORICAL_BRAND_FILES.has(file) || ['tools/check-brand.mjs', 'tests/brand.unit.mjs'].includes(file)) return '';
  if (file === 'tests/rebrand.spec.mjs') source = source.replace('/\\b(?:Pickleball Park|Paddle Park)\\b/i', '[rejected temporary names]');
  // Only the retained historical release entries and art-history section are exempt.
  if (file === 'docs/RELEASE_NOTES.md') source = source.split('\n---\n')[0];
  if (file === 'docs/ASSET_PROVENANCE.md') {
    const historyStart = source.indexOf('## Pickleball Park rebrand (historical)');
    const historyEnd = source.indexOf('## Pickleboard name restoration (current candidate)');
    if (historyStart >= 0 && historyEnd > historyStart) source = source.slice(0, historyStart) + source.slice(historyEnd);
    source = source.replace('local Pickleball Park palette', 'local palette');
  }
  if (file === 'docs/RENAME_HANDOFF.md') source = source.replace('Earlier Pickleball Park and Paddle Park labels were temporary naming drift;', 'Earlier labels were temporary naming drift;');
  return source;
};

const localReferences = (file, source) => {
  const refs = [];
  if (file === 'manifest.json') for (const icon of JSON.parse(source).icons || []) refs.push(icon.src);
  if (file === 'sw.js') for (const match of source.matchAll(/^[ \t]*['"]\.\/([^'"]+)['"],?$/gm)) refs.push(match[1]);
  if (file === 'index.html') {
    for (const match of source.matchAll(/\b(?:href|src)=["']([^"'#?]+)["']/gi)) {
      if (!/^(?:[a-z]+:|\/\/)/i.test(match[1])) refs.push(match[1].replace(/^\.\//, ''));
    }
  }
  return refs;
};

export function validateBrandFiles(files) {
  const errors = [];
  const required = file => {
    const value = files.get(file);
    if (typeof value !== 'string') errors.push(`${file}: required file is missing`);
    return value || '';
  };
  const index = required('index.html'), manifestText = required('manifest.json');
  const packageText = required('package.json'), lockText = required('package-lock.json');
  const worker = required('sw.js'), readme = required('README.md');
  const generator = required('tools/generate-park-art.mjs');
  try {
    const manifest = JSON.parse(manifestText);
    if (manifest.name !== 'Pickleboard') errors.push('manifest.json: name must be Pickleboard');
    if (manifest.short_name !== 'Pickleboard') errors.push('manifest.json: short_name must be Pickleboard');
    if (manifest.start_url !== './index.html') errors.push('manifest.json: start_url must remain ./index.html');
    if (Object.hasOwn(manifest, 'id')) errors.push('manifest.json: id must remain absent to preserve install identity');
  } catch (error) { errors.push(`manifest.json: invalid JSON (${error.message})`); }
  try {
    const pkg = JSON.parse(packageText), lock = JSON.parse(lockText);
    if (pkg.name !== 'pickleboard') errors.push('package.json: package name must be pickleboard');
    if (!pkg.description?.includes('Pickleboard')) errors.push('package.json: description must name Pickleboard');
    if (lock.name !== 'pickleboard' || lock.packages?.['']?.name !== 'pickleboard') errors.push('package-lock.json: root names must be pickleboard');
  } catch (error) { errors.push(`package metadata: invalid JSON (${error.message})`); }
  if (!/<title>Pickleboard - Build a Play<\/title>/.test(index)) errors.push('index.html: canonical title is missing');
  if (!/^# Pickleboard\b/m.test(readme)) errors.push('README.md: canonical heading is missing');
  if (!/const CACHE_PREFIX = 'pickleboard-';/.test(worker)) errors.push('sw.js: compatibility cache prefix changed');
  if (!/const STATIC_CACHE = `\$\{CACHE_PREFIX\}static-v\d+`;/.test(worker)) errors.push('sw.js: versioned compatibility cache identity is missing');
  if (!/Pickleboard static cache/.test(worker)) errors.push('sw.js: current cache diagnostic name is missing');
  if (!/text\(c,\s*'PICKLEBOARD'\s*,/.test(generator)) errors.push('tools/generate-park-art.mjs: sign must emit full PICKLEBOARD lettering');
  const world = required('three-d-world.js'), builder = required('builder-ui.js');
  if (!/lettering\('PICKLE',/.test(world) || !/lettering\('BOARD',/.test(world)) errors.push('three-d-world.js: village sign must spell PICKLEBOARD');
  if (!/PICKLEBOARD/.test(builder)) errors.push('builder-ui.js: Pickleboard menu heading is missing');
  for (const letter of new Set('PICKLEBOARD')) {
    if (!new RegExp(`(?:^|[,{\\s])${letter}:\\s*\\[`, 'm').test(generator)) errors.push(`tools/generate-park-art.mjs: sign glyph ${letter} is missing`);
  }
  for (const [file, source] of files) {
    if (typeof source !== 'string' || !TEXT_FILE.test(file) || isArchived(file)) continue;
    const remaining = removeApprovedHistoricalLabels(file, source);
    for (const match of remaining.matchAll(OLD_BRAND)) {
      const line = remaining.slice(0, match.index).split('\n').length;
      errors.push(`${file}:${line}: unapproved product-name drift ${JSON.stringify(match[0])}`);
    }
  }
  for (const file of ['manifest.json', 'sw.js', 'index.html']) {
    const source = files.get(file);
    if (typeof source !== 'string') continue;
    for (const reference of localReferences(file, source)) {
      const normalized = path.posix.normalize(reference);
      if (normalized.startsWith('../') || !files.has(normalized)) errors.push(`${file}: missing or incorrectly cased local reference ${reference}`);
    }
  }
  return errors;
}

async function repositoryFiles() {
  const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
  const names = stdout.toString().split('\0').filter(Boolean);
  const entries = await Promise.all(names.map(async file => {
    if (!TEXT_FILE.test(file)) return [file, null];
    const bytes = await readFile(path.join(root, file)).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!bytes) return null;
    return [file, bytes.includes(0) ? null : bytes.toString('utf8')];
  }));
  return new Map(entries.filter(Boolean));
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const errors = validateBrandFiles(await repositoryFiles());
  if (errors.length) throw new Error(`Brand integrity failures:\n${errors.map(error => `- ${error}`).join('\n')}`);
  console.log('Pickleboard brand integrity checks passed; generated sign source still needs visual review.');
}
