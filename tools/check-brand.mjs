#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD_BRAND = /\b(?:pickleboard|paddle\s+park)\b/gi;
const TEXT_FILE = /(?:^|\/)[^/]+\.(?:css|html|js|json|md|mjs|svg|txt|ya?ml)$/i;

// Current guidance is checked explicitly. Earlier reports, screenshots, capture
// metadata, and release entries describe their actual builds and are immutable.
// New current guidance belongs here; historical evidence is never rewritten to
// make a repository-wide name search pass.
const CURRENT_DOCS = new Set([
  'README.md', 'docs/RENAME_HANDOFF.md', 'docs/BUILD_DIAGNOSTICS.md', 'docs/PARK_ART.md'
]);
const proseOnly = source => source
  .replace(/^(`{3,}|~{3,}).*\n[\s\S]*?^\1[^\n]*$/gm, '')
  .replace(/`[^`\n]+`/g, '')
  .replace(/https?:\/\/[^\s<>\])]+/g, '');
const currentProse = (file, source) => {
  if (CURRENT_DOCS.has(file)) return proseOnly(source);
  if (file === 'docs/RELEASE_NOTES.md') return proseOnly(source.split('\n---\n')[0]);
  if (file === 'docs/ASSET_PROVENANCE.md') {
    // The introduction and last revision describe the current artwork; all
    // intervening entries preserve the asset and lettering history.
    const firstEntry = source.indexOf('\n## '), lastEntry = source.lastIndexOf('\n## ');
    return proseOnly(firstEntry < 0 ? source : source.slice(0, firstEntry) + source.slice(lastEntry));
  }
  return null;
};
// Read JavaScript literals without allowing an apostrophe in a template or a
// comment to turn later identifiers into apparent display text. Template
// expressions are scanned as code, so their actual string labels still count.
const javascriptLabels = source => {
  const labels = [];
  let i = 0;
  const scan = (inExpression = false) => {
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      if (c === '/' && source[i + 1] === '/') {
        i += 2; while (i < source.length && source[i] !== '\n') i++;
      } else if (c === '/' && source[i + 1] === '*') {
        i += 2; while (i < source.length && source.slice(i, i + 2) !== '*/') i++; i += 2;
      } else if (c === '/' && /(?:^|[=([{,:;!?&|]|=>|\b(?:return|throw|case|typeof|void|delete|yield))\s*$/.test(source.slice(0, i))) {
        // Regex literals may contain quotes and comment-like characters.
        let characterClass = false;
        i++;
        while (i < source.length) {
          const token = source[i++];
          if (token === '\\') i++;
          else if (token === '[') characterClass = true;
          else if (token === ']') characterClass = false;
          else if (token === '/' && !characterClass) break;
        }
        while (/[a-z]/i.test(source[i] || '') && i < source.length) i++;
      } else if (c === "'" || c === '"' || c === '`') {
        const quote = c;
        let label = '';
        i++;
        while (i < source.length) {
          if (source[i] === '\\') { label += source.slice(i, i + 2); i += 2; }
          else if (source[i] === quote) { i++; break; }
          else if (quote === '`' && source.slice(i, i + 2) === '${') {
            labels.push(label); label = ''; i += 2; scan(true);
          } else label += source[i++];
        }
        labels.push(label);
      } else if (inExpression && c === '}' && depth === 0) { i++; return; }
      else { if (c === '{') depth++; if (c === '}') depth--; i++; }
    }
  };
  scan();
  return labels;
};
const runtimeLabels = source => javascriptLabels(source).filter(label => {
  // Stable namespaced strings and these two API diagnostics are compatibility
  // contracts; identifiers are never collected in the first place.
  if (/^(?:https?:\/\/|pickleboard[-:]\S*$)/i.test(label)) return false;
  return label !== 'Pickleboard projection is unavailable' && label !== 'GuidedPixelActors requires a Pickleboard board instance.';
}).join('\n');
const htmlLabels = source => {
  const scripts = [];
  const markup = source.replace(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi, (_, code) => {
    scripts.push(runtimeLabels(code));
    return '';
  });
  return markup + '\n' + scripts.join('\n');
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
    if (!manifest.description?.includes('Pickleball Park')) errors.push('manifest.json: description must name Pickleball Park');
    if (manifest.start_url !== './index.html') errors.push('manifest.json: start_url must remain ./index.html');
    if (Object.hasOwn(manifest, 'id')) errors.push('manifest.json: id must remain absent to preserve install identity');
  } catch (error) { errors.push(`manifest.json: invalid JSON (${error.message})`); }
  try {
    const pkg = JSON.parse(packageText), lock = JSON.parse(lockText);
    if (pkg.name !== 'pickleboard') errors.push('package.json: package name must be pickleboard');
    if (!pkg.description?.includes('Pickleball Park')) errors.push('package.json: description must name Pickleball Park');
    if (lock.name !== 'pickleboard' || lock.packages?.['']?.name !== 'pickleboard') errors.push('package-lock.json: root names must be pickleboard');
  } catch (error) { errors.push(`package metadata: invalid JSON (${error.message})`); }
  if (!/<title>Pickleball Park - Build a Play<\/title>/.test(index)) errors.push('index.html: canonical title is missing');
  if (!/<img\b[^>]*\balt=["']Pickleball Park["'][^>]*>/.test(index)) errors.push('index.html: canonical banner alternative text is missing');
  if (!/<h2>Pickleball Park<\/h2>/.test(index)) errors.push('index.html: canonical help heading is missing');
  if (!/<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["']Pickleball Park\b/.test(index)) errors.push('index.html: canonical description is missing');
  if (!/^# Pickleball Park\b/m.test(readme)) errors.push('README.md: canonical heading is missing');
  if (!/const CACHE_PREFIX = 'pickleboard-';/.test(worker)) errors.push('sw.js: compatibility cache prefix changed');
  if (!/const STATIC_CACHE = `\$\{CACHE_PREFIX\}static-v\d+`;/.test(worker)) errors.push('sw.js: versioned compatibility cache identity is missing');
  if (!/Pickleball Park static cache/.test(worker)) errors.push('sw.js: current cache diagnostic name is missing');
  if (!/text\(c,\s*'PICKLEBALL PARK'\s*,/.test(generator)) errors.push('tools/generate-park-art.mjs: sign must emit full PICKLEBALL PARK lettering');
  const world = required('three-d-world.js'), builder = required('builder-ui.js');
  if (!/lettering\('PICKLEBALL',/.test(world) || !/lettering\('PARK',/.test(world)) errors.push('three-d-world.js: village sign must spell PICKLEBALL PARK');
  if (!/el\('strong',\s*'',\s*'PICKLEBALL PARK'\)/.test(builder)) errors.push('builder-ui.js: Pickleball Park menu heading is missing');
  for (const [file, source] of [['tools/generate-park-art.mjs', generator], ['three-d-world.js', world]]) {
    for (const letter of new Set('PICKLEBALLPARK')) {
      if (!new RegExp(`(?:^|[,{\\s])${letter}:\\s*\\[`, 'm').test(source)) errors.push(`${file}: sign glyph ${letter} is missing`);
    }
  }
  const script = required('script.js'), storage = required('builder-storage.js');
  if (!/localStorage\.setItem\('pickleboard-theme',/.test(script) || !/localStorage\.getItem\('pickleboard-theme'\)/.test(script)) errors.push('script.js: compatibility theme preference key changed');
  if (!/class Pickleboard\b/.test(script) || !/window\.pickleboard = new Pickleboard\(\)/.test(script) || !/new CustomEvent\('pickleboard:ready'/.test(script)) errors.push('script.js: compatibility browser API changed');
  if (!/export const STORAGE_KEY = 'pickleballpark-builder-v1';/.test(storage)) errors.push('builder-storage.js: compatibility draft key changed');
  try {
    if (JSON.parse(required('version.json')).product !== 'Pickleball Park') errors.push('version.json: product must be Pickleball Park');
  } catch (error) { errors.push(`version.json: invalid JSON (${error.message})`); }
  if (!/["']product["']:\s*["']Pickleball Park["']/.test(required('build-metadata.js'))) errors.push('build-metadata.js: product must be Pickleball Park');
  for (const [file, source] of files) {
    if (typeof source !== 'string') continue;
    let remaining = currentProse(file, source);
    if (remaining === null && /^[^/]+\.html$/.test(file)) remaining = htmlLabels(source);
    // Metadata products are checked above. build-identity may recognize old
    // metadata as input so server diagnostics retain the name they actually report.
    if (remaining === null && /^[^/]+\.js$/.test(file) && !['build-metadata.js', 'build-identity.js'].includes(file)) remaining = runtimeLabels(source);
    if (remaining === null) continue;
    for (const match of remaining.matchAll(OLD_BRAND)) errors.push(`${file}: unapproved product-name drift ${JSON.stringify(match[0])}`);
  }
  for (const file of ['manifest.json', 'sw.js', 'index.html']) {
    const source = files.get(file);
    if (typeof source !== 'string') continue;
    try {
      for (const reference of localReferences(file, source)) {
        const normalized = path.posix.normalize(reference);
        if (normalized.startsWith('../') || !files.has(normalized)) errors.push(`${file}: missing or incorrectly cased local reference ${reference}`);
      }
    } catch { /* Invalid manifest JSON is already reported above. */ }
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
