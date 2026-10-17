#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD_BRAND = /\bpickle\s*board\b/gi;
const OLD_WORDMARK = /\bPB\b/g;
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

const removeApprovedLegacyContracts = (file, source) => {
  if (['docs/art-overhaul/SOURCE.md', 'docs/art-overhaul/before/README.md'].includes(file)) source = source.replaceAll('/Users/fdub/Geese/pickleboard', '[canonical repository path]');
  if (file === 'docs/rebrand/capture-metadata.json') {
    const data = JSON.parse(source);
    for (const record of data.records || []) {
      if (record.name === 'before' && record.revision === 'dd0c3fa' && record.actual?.title === 'Pickleboard - Pickleball Court Planner') record.actual.title = '[verified historical title]';
    }
    source = JSON.stringify(data);
  }

  if (['tools/check-brand.mjs', 'tests/brand.unit.mjs', '.goose/memory/project.txt'].includes(file)) return '';
  let text = source
    .replace(/https:\/\/github\.com\/fcw1987\/pickleboard(?:\.git)?\/?/gi, '')
    .replace(/https:\/\/fcw1987\.github\.io\/pickleboard\/?/gi, '')
    .replace(/\bPICKLEBOARD_(?:VISUAL|PLAYS|TEST_URL)\b/g, '')
    .replace(/\bPickleboardProjection\b/g, '')
    .replace(/\bwindow\.pickleboard\b|\bpickleboard(?=[?.\[])|\bpickleboard:ready\b/g, '')
    .replace(/=\s*pickleboard\b/g, '=')
    .replace(/\bpickleboard-theme\b|pickleboard-/g, '')
    .replace(/--pb-[a-z0-9-]+/g, '')
    .replace(/\b(?:class\s+|new\s+)Pickleboard\b/g, '');
  if (['README.md', 'docs/RELEASE_NOTES.md'].includes(file)) text = text.replace(/\b[Ff]ormerly Pickleboard\b/g, '');
  if (['README.md', 'docs/REBRAND_STATUS.md', 'docs/rebrand/technical-notes.md', 'docs/rebrand/technical-review.md'].includes(file)) {
    text = text.replace(/`Pickleboard`/g, '').replace(/\bPickleboard releases\b/g, 'releases');
  }
  if (file === 'docs/REBRAND_STATUS.md' || file === 'docs/rebrand/technical-notes.md') text = text.replace(/`?pickleboard`?/g, '');
  if (file === 'docs/RENAME_HANDOFF.md') {
    text = text.replace(/\bfcw1987\/pickleboard\b/g, '');
  }
  if (file === 'tools/diagnose-webkit-cache.mjs') text = text.replace(/Old Pickleboard/g, '');
  if (file === 'tests/fixtures/cache-setup.html' || file === 'tests/service-worker.spec.mjs') text = text.replace(/Old Pickleboard/g, '');
  if (['tests/service-worker.spec.mjs', 'tools/webkit-policy.mjs'].includes(file)) text = text.replace(/old Pickleboard caches/g, 'old caches');
  if (file === 'tools/generate-art.mjs') text = text.replace(/\bpb\b/g, '');
  if (file === 'docs/REBRAND_STATUS.md') text = text.replace(/visible PB wordmark/g, 'visible wordmark').replace(/lowercase `pb`/g, 'lowercase');
  if (file === 'docs/ASSET_PROVENANCE.md') text = text.replace(/old PB lettering/g, 'old lettering');
  if (file === 'docs/rebrand/art-review/README.md') text = text.replace(/old `PB` or product lettering/g, 'old product lettering').replace(/`PB` or new acronym/g, 'new acronym');
  if (file === 'docs/rebrand/technical-review.md') text = text.replace(/the spaced `Pickle Board` variant/g, 'the spaced-name variant').replace(/uppercase `PB` wordmark/g, 'uppercase acronym wordmark');
  return text;
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
    if (manifest.name !== 'Pickleball Park') errors.push('manifest.json: name must be Pickleball Park');
    if (manifest.short_name !== 'Pickleball Park') errors.push('manifest.json: short_name must be Pickleball Park');
    if (manifest.start_url !== './index.html') errors.push('manifest.json: start_url must remain ./index.html');
    if (Object.hasOwn(manifest, 'id')) errors.push('manifest.json: id must remain absent to preserve install identity');
  } catch (error) { errors.push(`manifest.json: invalid JSON (${error.message})`); }
  try {
    const pkg = JSON.parse(packageText), lock = JSON.parse(lockText);
    if (pkg.name !== 'pickleballpark') errors.push('package.json: package name must be pickleballpark');
    if (!pkg.description?.includes('Pickleball Park')) errors.push('package.json: description must name Pickleball Park');
    if (lock.name !== 'pickleballpark' || lock.packages?.['']?.name !== 'pickleballpark') errors.push('package-lock.json: root names must be pickleballpark');
  } catch (error) { errors.push(`package metadata: invalid JSON (${error.message})`); }
  if (!/<title>Pickleball Park - Build a Play<\/title>/.test(index)) errors.push('index.html: canonical title is missing');
  if (!/^# Pickleball Park\b/m.test(readme)) errors.push('README.md: canonical heading is missing');
  if (!/const CACHE_PREFIX = 'pickleboard-';/.test(worker)) errors.push('sw.js: compatibility cache prefix changed');
  if (!/const STATIC_CACHE = `\$\{CACHE_PREFIX\}static-v25`;/.test(worker)) errors.push('sw.js: v25 cache identity is missing');
  if (!/Pickleball Park static cache/.test(worker)) errors.push('sw.js: current cache diagnostic name is missing');
  if (!/text\(c,\s*'PICKLEBALL'\s*,/.test(generator) || !/text\(c,\s*'PARK'\s*,/.test(generator)) errors.push('tools/generate-park-art.mjs: sign must emit full PICKLEBALL and PARK lettering');
  for (const letter of new Set('PICKLEBALLPARK')) {
    if (!new RegExp(`(?:^|[,{\\s])${letter}:\\s*\\[`, 'm').test(generator)) errors.push(`tools/generate-park-art.mjs: sign glyph ${letter} is missing`);
  }
  for (const [file, source] of files) {
    if (typeof source !== 'string' || !TEXT_FILE.test(file) || isArchived(file)) continue;
    const remaining = removeApprovedLegacyContracts(file, source);
    for (const match of [...remaining.matchAll(OLD_BRAND), ...remaining.matchAll(OLD_WORDMARK)]) {
      const line = remaining.slice(0, match.index).split('\n').length;
      errors.push(`${file}:${line}: unapproved former brand token ${JSON.stringify(match[0])}`);
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
  console.log('Pickleball Park brand integrity checks passed; generated sign source still needs visual review.');
}
