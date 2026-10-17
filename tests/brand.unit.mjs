import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBrandFiles } from '../tools/check-brand.mjs';

const baseline = new Map([
  ['index.html', '<title>Pickleball Park - Build a Play</title><img src="icons/icon.png">'],
  ['manifest.json', JSON.stringify({ name: 'Pickleball Park', short_name: 'Pickleball Park', start_url: './index.html', icons: [{ src: 'icons/icon.png' }] })],
  ['package.json', JSON.stringify({ name: 'pickleballpark', description: 'Pickleball Park app' })],
  ['package-lock.json', JSON.stringify({ name: 'pickleballpark', packages: { '': { name: 'pickleballpark' } } })],
  ['sw.js', "const CACHE_PREFIX = 'pickleboard-';\nconst STATIC_CACHE = `${CACHE_PREFIX}static-v25`;\nconsole.warn('Pickleball Park static cache');"],
  ['README.md', '# Pickleball Park\n'],
  ['tools/generate-park-art.mjs', "const glyphs={P:['1'],I:['1'],C:['1'],K:['1'],L:['1'],E:['1'],B:['1'],A:['1'],R:['1']}; text(c, 'PICKLEBALL', 1, 1, C.x); text(c, 'PARK', 1, 2, C.x);"],
  ['icons/icon.png', null]
]);
const errorsAfter = (file, content) => validateBrandFiles(new Map([...baseline, [file, content]]));

test('accepts canonical metadata and exact compatibility identities', () => assert.deepEqual(validateBrandFiles(baseline), []));
test('rejects former branding in active UI, README, and current docs', () => {
  assert(errorsAfter('index.html', '<title>Pickleboard</title><img src="icons/icon.png">').some(error => error.includes('index.html')));
  assert(errorsAfter('index.html', '<title>Pickle Board</title><img src="icons/icon.png">').some(error => error.includes('index.html')));
  assert(errorsAfter('index.html', '<title>PB Court Planner</title><img src="icons/icon.png">').some(error => error.includes('index.html')));
  assert(errorsAfter('README.md', '# Pickleboard\n').some(error => error.includes('README.md')));
  assert(errorsAfter('docs/current.md', '# Pickleboard release\n').some(error => error.includes('docs/current.md')));
  assert(errorsAfter('docs/park-coaching/new-current.md', '# Pickleboard returns\n').some(error => error.includes('new-current.md')));
  assert(errorsAfter('tools/new-report.mjs', "console.log('pickleboard app')").some(error => error.includes('new-report.mjs')));
});
test('rejects stale package metadata and incorrectly cased asset references', () => {
  assert(errorsAfter('package.json', JSON.stringify({ name: 'pickleboard', description: 'Pickleboard app' })).some(error => error.includes('package.json')));
  assert(errorsAfter('index.html', '<title>Pickleball Park - Build a Play</title><img src="icons/Icon.png">').some(error => error.includes('incorrectly cased')));
});
test('rejects an incomplete generated sign while allowing exact archive and contract exceptions', () => {
  assert(errorsAfter('tools/generate-park-art.mjs', "const glyphs={P:['1'],A:['1'],R:['1'],K:['1']}; text(c, 'PARK', 1, 2, C.x);").some(error => error.includes('full PICKLEBALL')));
  const allowed = new Map(baseline);
  allowed.set('script.js', 'class Pickleboard {}; window.pickleboard = new Pickleboard(); const x = PICKLEBOARD_VISUAL;');
  allowed.set('docs/park-coaching/technical-review.md', '# Pickleboard historical evidence');
  assert.deepEqual(validateBrandFiles(allowed), []);
});

test('allows only the actual accepted before title in comparison metadata', () => {
  const records = [{name:'before', revision:'dd0c3fa', actual:{title:'Pickleboard - Pickleball Court Planner'}}, {name:'after', actual:{title:'Pickleball Park - Build a Play'}}];
  assert.deepEqual(errorsAfter('docs/rebrand/capture-metadata.json', JSON.stringify({records})), []);
  records[1].actual.title = 'Pickleboard - Pickleball Court Planner';
  assert(errorsAfter('docs/rebrand/capture-metadata.json', JSON.stringify({records})).some(error => error.includes('unapproved')));
});

test('catches case-insensitive spaced brand variants without treating lowercase Paeth variables as a wordmark', () => {
  for (const name of ['PICKLE BOARD', 'pickle board', 'pIcKlEbOaRd']) assert(errorsAfter('docs/new.md', name).some(error => error.includes('unapproved')));
});
