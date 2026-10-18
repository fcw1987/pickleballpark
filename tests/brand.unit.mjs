import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBrandFiles } from '../tools/check-brand.mjs';

const baseline = new Map([
  ['index.html', '<title>Pickleboard - Build a Play</title><img src="icons/icon.png">'],
  ['manifest.json', JSON.stringify({ name: 'Pickleboard', short_name: 'Pickleboard', start_url: './index.html', icons: [{ src: 'icons/icon.png' }] })],
  ['package.json', JSON.stringify({ name: 'pickleboard', description: 'Pickleboard app' })],
  ['package-lock.json', JSON.stringify({ name: 'pickleboard', packages: { '': { name: 'pickleboard' } } })],
  ['sw.js', "const CACHE_PREFIX = 'pickleboard-';\nconst STATIC_CACHE = `${CACHE_PREFIX}static-v28`;\nconsole.warn('Pickleboard static cache');"],
  ['README.md', '# Pickleboard\n'],
  ['tools/generate-park-art.mjs', "const glyphs={P:['1'],I:['1'],C:['1'],K:['1'],L:['1'],E:['1'],B:['1'],O:['1'],A:['1'],R:['1'],D:['1']}; text(c, 'PICKLEBOARD', 25, 11, C.x, 2);"],
  ['three-d-world.js', "lettering('PICKLE', 1.12, .235); lettering('BOARD', .80, .21);"],
  ['builder-ui.js', "el('strong', '', 'PICKLEBOARD')"],
  ['icons/icon.png', null]
]);
const errorsAfter = (file, content) => validateBrandFiles(new Map([...baseline, [file, content]]));

test('accepts Pickleboard with stable install and saved-data contracts', () => {
  const files = new Map(baseline);
  files.set('builder-storage.js', "export const STORAGE_KEY = 'pickleballpark-builder-v1';");
  files.set('script.js', 'class Pickleboard {}; window.pickleboard = new Pickleboard();');
  assert.deepEqual(validateBrandFiles(files), []);
});
test('rejects temporary park names in active UI, current docs and new evidence', () => {
  for (const name of ['Pickleball Park', 'Paddle Park', 'PICKLEBALL PARK', 'pickleball park']) {
    for (const file of ['index.html', 'README.md', 'docs/current.md', 'docs/park-coaching/new-current.md', 'tools/new-report.mjs']) {
      assert(errorsAfter(file, name).some(error => error.includes('unapproved product-name drift')));
    }
  }
});
test('requires exact current package identity and correctly cased references', () => {
  assert(errorsAfter('package.json', JSON.stringify({ name: 'pickleballpark', description: 'Pickleboard app' })).some(error => error.includes('package name')));
  assert(errorsAfter('index.html', '<title>Pickleboard - Build a Play</title><img src="icons/Icon.png">').some(error => error.includes('incorrectly cased')));
});
test('requires complete banner and village sign lettering', () => {
  assert(errorsAfter('tools/generate-park-art.mjs', "text(c, 'PARK', 1, 2, C.x);").some(error => error.includes('full PICKLEBOARD')));
  assert(errorsAfter('three-d-world.js', "lettering('PADDLE', 1.12, .235); lettering('PARK', .80, .21);").some(error => error.includes('village sign')));
  assert(errorsAfter('builder-ui.js', "el('strong', '', 'PARK')").some(error => error.includes('menu heading')));
});
test('allows named historical captures without exempting new sibling reports', () => {
  const capture = JSON.stringify({ actual: { title: 'Pickleball Park - Build a Play' } });
  assert.deepEqual(errorsAfter('docs/town-art-performance/final/matched-desktop.json', capture), []);
  assert(errorsAfter('docs/town-art-performance/final/new-report.json', capture).some(error => error.includes('unapproved')));
  assert.deepEqual(errorsAfter('docs/RELEASE_NOTES.md', '# Pickleboard current\n\n---\n\n# Pickleball Park historical'), []);
  assert(errorsAfter('docs/RELEASE_NOTES.md', '# Pickleball Park current\n\n---\n\n# Pickleball Park historical').some(error => error.includes('unapproved')));
});
test('preserves install identity and owned cache namespace across versions', () => {
  assert(errorsAfter('manifest.json', JSON.stringify({ name: 'Pickleboard', short_name: 'Pickleboard', start_url: '/new', id: '/new' })).some(error => error.includes('install identity')));
  assert(errorsAfter('sw.js', "const CACHE_PREFIX = 'new-';\nconst STATIC_CACHE = `${CACHE_PREFIX}static-v29`;\nconsole.warn('Pickleboard static cache');").some(error => error.includes('cache prefix')));
  assert.deepEqual(errorsAfter('sw.js', "const CACHE_PREFIX = 'pickleboard-';\nconst STATIC_CACHE = `${CACHE_PREFIX}static-v29`;\nconsole.warn('Pickleboard static cache');"), []);
});
