import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractPagesArtifact } from '../tools/extract-pages-artifact.mjs';

const withArchive = (members, run) => {
  const root = mkdtempSync(path.join(tmpdir(), 'pickleballpark-tar-test-'));
  try {
    const archive = path.join(root, 'artifact.tar');
    execFileSync('python3', ['-c', `import io,json,sys,tarfile
with tarfile.open(sys.argv[1], 'w') as t:
 for item in json.loads(sys.argv[2]):
  m=tarfile.TarInfo(item['name']);kind=item.get('kind','file')
  if kind=='symlink': m.type=tarfile.SYMTYPE;m.linkname='/tmp/outside'
  elif kind=='hardlink': m.type=tarfile.LNKTYPE;m.linkname='/tmp/outside'
  elif kind=='directory': m.type=tarfile.DIRTYPE
  else: m.size=2
  t.addfile(m,io.BytesIO(b'ok') if kind=='file' else None)`, archive, JSON.stringify(members)]);
    run(archive, path.join(root, 'extracted'));
  } finally { rmSync(root, { recursive: true, force: true }); }
};

test('extracts regular runtime archive after validating every member', () => {
  withArchive([{ name: './', kind: 'directory' }, { name: './assets', kind: 'directory' }, { name: './assets/icon.png' }], (archive, output) => {
    extractPagesArtifact(archive, output);
    assert.equal(readFileSync(path.join(output, 'assets/icon.png'), 'utf8'), 'ok');
  });
});
test('rejects traversal, absolute paths, backslashes, duplicates and links before extraction', () => {
  for (const members of [
    [{ name: '../outside' }], [{ name: '/absolute' }], [{ name: 'assets\\outside' }],
    [{ name: './app.js' }, { name: 'app.js' }],
    [{ name: 'app.js', kind: 'symlink' }], [{ name: 'app.js', kind: 'hardlink' }]
  ]) withArchive(members, (archive, output) => {
    assert.throws(() => extractPagesArtifact(archive, output));
    assert.equal(existsSync(output), false);
  });
});
