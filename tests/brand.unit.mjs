import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBrandFiles } from '../tools/check-brand.mjs';

const glyphs = "P:['1'],I:['1'],C:['1'],K:['1'],L:['1'],E:['1'],B:['1'],A:['1'],R:['1']";
const index = '<title>Pickleball Park - Build a Play</title><meta name="description" content="Pickleball Park coaching"><img src="icons/icon.png" alt="Pickleball Park"><h2>Pickleball Park</h2>';
const manifest = { name: 'Pickleball Park', short_name: 'Pickleball Park', description: 'Pickleball Park coaching', start_url: './index.html', icons: [{ src: 'icons/icon.png' }] };
const worker = "const CACHE_PREFIX = 'pickleboard-';\nconst STATIC_CACHE = `${CACHE_PREFIX}static-v30`;\nconsole.warn('Pickleball Park static cache');";
const script = "class Pickleboard {}; window.pickleboard = new Pickleboard(); new CustomEvent('pickleboard:ready'); localStorage.setItem('pickleboard-theme', 'dark'); localStorage.getItem('pickleboard-theme');";
const baseline = new Map([
  ['index.html', index],
  ['manifest.json', JSON.stringify(manifest)],
  ['package.json', JSON.stringify({ name: 'pickleboard', description: 'Pickleball Park app' })],
  ['package-lock.json', JSON.stringify({ name: 'pickleboard', packages: { '': { name: 'pickleboard' } } })],
  ['sw.js', worker],
  ['README.md', '# Pickleball Park\n'],
  ['tools/generate-park-art.mjs', `const glyphs={${glyphs}}; text(c, 'PICKLEBALL PARK', 9, 11, C.x, 2);`],
  ['three-d-world.js', `const glyphs={${glyphs}}; lettering('PICKLEBALL', 1.12, .18); lettering('PARK', .80, .21);`],
  ['builder-ui.js', "el('strong', '', 'PICKLEBALL PARK')"],
  ['script.js', script],
  ['builder-storage.js', "export const STORAGE_KEY = 'pickleballpark-builder-v1';"],
  ['version.json', JSON.stringify({ product: 'Pickleball Park', cacheVersion: 'pickleboard-static-v30' })],
  ['build-metadata.js', 'export const BUILD_IDENTITY_METADATA = { "product": "Pickleball Park" };'],
  ['icons/icon.png', null]
]);
const errorsAfter = (file, content) => validateBrandFiles(new Map([...baseline, [file, content]]));
const fails = (file, content, message) => assert(errorsAfter(file, content).some(error => error.includes(message)), `${file}: expected ${message}`);

test('accepts Pickleball Park with stable technical identities and saved-data contracts', () => {
  const files = new Map(baseline);
  files.set('script.js', `${script}\nconst namespace = 'pickleboard-play.json'; const projection = window.PickleboardProjection; const visual = PICKLEBOARD_VISUAL;`);
  files.set('README.md', '# Pickleball Park\nCompatibility class `Pickleboard` exposes `window.pickleboard`.\nRepository: <https://github.com/fcw1987/pickleboard>\n\n```js\nclass Pickleboard {}\n```');
  files.set('build-identity.js', "const oldProduct = source.product === 'Pickleboard'; const product = 'Pickleball Park';");
  assert.deepEqual(validateBrandFiles(files), []);
});
test('rejects superseded brands in current interface labels and current guidance', () => {
  for (const name of ['Pickleboard', 'PICKLEBOARD', 'pickleboard', 'Paddle Park']) {
    for (const file of ['index.html', 'README.md', 'docs/RENAME_HANDOFF.md', 'docs/BUILD_DIAGNOSTICS.md', 'docs/PARK_ART.md']) fails(file, name, 'unapproved product-name drift');
    fails('new-ui.js', `const label = 'Welcome to ${name}';`, 'unapproved product-name drift');
  }
});
test('requires canonical title, banner alternative, help heading and menu independently', () => {
  for (const [oldText, newText, error] of [
    ['<title>Pickleball Park - Build a Play</title>', '<title>Park</title>', 'canonical title'],
    ['alt="Pickleball Park"', 'alt="Park"', 'banner alternative'],
    ['<h2>Pickleball Park</h2>', '<h2>Park</h2>', 'help heading'],
    ['content="Pickleball Park coaching"', 'content="Coaching"', 'canonical description']
  ]) fails('index.html', index.replace(oldText, newText), error);
  fails('builder-ui.js', "const unused = 'PICKLEBALL PARK'; el('strong', '', 'PARK')", 'menu heading');
});
test('requires canonical manifest labels and package description while preserving internal package names', () => {
  for (const field of ['name', 'short_name', 'description']) fails('manifest.json', JSON.stringify({ ...manifest, [field]: 'Pickleboard' }), field);
  fails('package.json', JSON.stringify({ name: 'pickleballpark', description: 'Pickleball Park app' }), 'package name');
  fails('package.json', JSON.stringify({ name: 'pickleboard', description: 'Pickleboard app' }), 'description');
  for (const lock of [{ name: 'pickleballpark', packages: { '': { name: 'pickleboard' } } }, { name: 'pickleboard', packages: { '': { name: 'pickleballpark' } } }]) fails('package-lock.json', JSON.stringify(lock), 'root names');
  fails('index.html', index.replace('icons/icon.png', 'icons/Icon.png'), 'incorrectly cased');
});
test('requires complete raster and village sign wording and authored glyphs', () => {
  fails('tools/generate-park-art.mjs', `const glyphs={${glyphs}}; text(c, 'PICKLEBOARD', 9, 11, C.x, 2);`, 'full PICKLEBALL PARK');
  fails('three-d-world.js', `const glyphs={${glyphs}}; lettering('PICKLE', 1.12, .18); lettering('BOARD', .80, .21);`, 'village sign');
  fails('three-d-world.js', `const glyphs={${glyphs}}; lettering('PICKLEBALL', 1.12, .18);`, 'village sign');
  for (const file of ['tools/generate-park-art.mjs', 'three-d-world.js']) fails(file, baseline.get(file).replace("B:['1'],", ''), 'sign glyph B');
});
test('retains historical reports, captures and earlier release entries while checking current sections', () => {
  for (const file of ['docs/REBRAND_VERIFICATION.md', 'docs/town-art-performance/final/matched-desktop.json', 'docs/stroke-instruction/verification/performance-phone.json']) assert.deepEqual(errorsAfter(file, 'Pickleboard / Paddle Park historical capture'), []);
  assert.deepEqual(errorsAfter('docs/RELEASE_NOTES.md', '# Pickleball Park current\n\n---\n\n# Pickleboard historical'), []);
  fails('docs/RELEASE_NOTES.md', '# Pickleboard current\n\n---\n\n# Pickleball Park historical', 'unapproved');
  const provenance = '# Asset provenance\n\nOriginal Pickleball Park art.\n\n## Pickleboard restoration (historical)\n\nPickleboard sign.\n\n## Pickleball Park current\n\nPICKLEBALL PARK lettering.';
  assert.deepEqual(errorsAfter('docs/ASSET_PROVENANCE.md', provenance), []);
  fails('docs/ASSET_PROVENANCE.md', provenance.replace('Original Pickleball Park', 'Original Pickleboard'), 'unapproved');
  fails('docs/ASSET_PROVENANCE.md', provenance.replace('PICKLEBALL PARK lettering', 'PICKLEBOARD lettering'), 'unapproved');
});
test('preserves install, cache, theme, draft and public API identities across versions', () => {
  fails('manifest.json', JSON.stringify({ ...manifest, start_url: '/new', id: '/new' }), 'install identity');
  fails('manifest.json', JSON.stringify({ ...manifest, start_url: '/new' }), 'start_url');
  fails('sw.js', worker.replace("'pickleboard-'", "'pickleballpark-'"), 'cache prefix');
  fails('sw.js', worker.replace('static-v30', 'new-static-v30'), 'cache identity');
  assert.deepEqual(errorsAfter('sw.js', worker.replace('static-v30', 'static-v31')), []);
  fails('script.js', script.replaceAll('pickleboard-theme', 'park-theme'), 'theme preference');
  fails('script.js', script.replace('window.pickleboard =', 'window.pickleballpark ='), 'browser API');
  fails('script.js', script.replace('pickleboard:ready', 'park:ready'), 'browser API');
  fails('builder-storage.js', "export const STORAGE_KEY = 'pickleballpark-builder-v2';", 'draft key');
});
test('requires current product in generated build metadata and version metadata', () => {
  fails('version.json', JSON.stringify({ product: 'Pickleboard' }), 'product must be Pickleball Park');
  fails('build-metadata.js', '{ "product": "Pickleboard" }', 'product must be Pickleball Park');
});
test('reports malformed manifest JSON without throwing during reference checks', () => {
  fails('manifest.json', '{broken', 'invalid JSON');
});

test('JavaScript templates and comments cannot turn compatibility identifiers into labels', () => {
  const code = "const hint = `Player's camera ${globalThis.pickleboard?.threeD ? 'ready' : 'loading'}`;\n" +
    "/* user's compatibility class Pickleboard */ const view = globalThis.pickleboard; // player's Pickleboard API\n" +
    "addEventListener('pickleboard:camera-ready', () => {});" +
    `const pattern = /["']/g; const divided = 10 / 2; const api = globalThis.pickleboard;`;
  assert.deepEqual(errorsAfter('new-ui.js', code), []);
  fails('new-ui.js', code + "const label = 'Welcome to Pickleboard';", 'unapproved product-name drift');
  fails('new-ui.js', "const label = `Player's Pickleboard camera`;", 'unapproved product-name drift');
  fails('new-ui.js', "const label = `Welcome ${'Pickleboard'}`;", 'unapproved product-name drift');
  fails('new-ui.js', "const label = `Welcome ${`Pickleboard`}`;", 'unapproved product-name drift');
});
test('inline startup scripts preserve compatibility APIs while visible and scripted labels remain checked', () => {
  const startup = "<script>window.pickleboard?.threeD?.cancelLoading?.(); addEventListener('pickleboard:ready', () => {});</script>";
  assert.deepEqual(errorsAfter('index.html', index + startup), []);
  fails('index.html', index + startup + '<button>Pickleboard</button>', 'unapproved product-name drift');
  fails('index.html', index + '<script>button.textContent = "Pickleboard";</script>', 'unapproved product-name drift');
});
