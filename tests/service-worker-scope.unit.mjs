import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

async function activate(scope, initial) {
  const entries = new Map(Object.entries(initial).map(([name, urls]) => [name, new Set(urls)]));
  const events = new Map();
  let claimed = false, activation;
  const caches = {
    keys: async () => [...entries.keys()],
    delete: async name => entries.delete(name),
    open: async name => ({
      keys: async () => [...entries.get(name)].map(url => ({ url })),
      delete: async request => entries.get(name).delete(request.url),
    }),
  };
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), {
    URL, caches, console,
    self: { location: new URL('sw.js', scope), registration: { scope }, addEventListener: (name, handler) => events.set(name, handler), clients: { claim: async () => { claimed = true; } } },
  });
  events.get('activate')({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.equal(claimed, true);
  return entries;
}

test('path migration preserves old-path and unrelated caches, including mixed-scope entries', async () => {
  const state = await activate('https://example.test/pickleballpark/', {
    'pickleboard-static-v32': ['https://example.test/pickleballpark/index.html'],
    'pickleboard-static-v23': ['https://example.test/pickleboard/index.html', 'https://example.test/pickleboard/script.js'],
    'pickleboard-static-v30': ['https://example.test/pickleballpark/index.html', 'https://example.test/pickleboard/index.html', 'https://example.test/pickleballpark-other/index.html', 'https://other.test/pickleballpark/index.html'],
    'pickleboard-cache-v1': ['https://example.test/pickleballpark/index.html'],
    'unrelated-application-cache': ['https://example.test/pickleballpark/keep'],
  });
  assert.deepEqual([...state.get('pickleboard-static-v23')], ['https://example.test/pickleboard/index.html', 'https://example.test/pickleboard/script.js']);
  assert.deepEqual([...state.get('pickleboard-static-v30')], ['https://example.test/pickleboard/index.html', 'https://example.test/pickleballpark-other/index.html', 'https://other.test/pickleballpark/index.html']);
  assert.equal(state.has('pickleboard-cache-v1'), false);
  assert.deepEqual([...state.get('unrelated-application-cache')], ['https://example.test/pickleballpark/keep']);
  assert.deepEqual([...state.get('pickleboard-static-v32')], ['https://example.test/pickleballpark/index.html']);
});

test('same-path upgrades prune obsolete entries and remove empty owned caches', async () => {
  const state = await activate('https://example.test/pickleballpark/', {
    'pickleboard-static-v32': ['https://example.test/pickleballpark/index.html'],
    'pickleboard-static-v31': ['https://example.test/pickleballpark/index.html', 'https://example.test/pickleballpark/assets/park/banner.png'],
    'pickleboard-cache-v1': [],
    'unrelated-application-cache': [],
  });
  assert.deepEqual([...state.keys()].sort(), ['pickleboard-static-v32', 'unrelated-application-cache']);
});
