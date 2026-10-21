// Validate every tar member before creating any publication files. Python's
// tar reader handles long names; extraction itself never follows archive links.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function extractPagesArtifact(archive, destination) {
  execFileSync('python3', ['-c', String.raw`
import pathlib, sys, tarfile
archive, output = sys.argv[1:]
target = pathlib.Path(output)
if target.exists() or target.is_symlink():
    raise ValueError('Extraction destination must not exist')
with tarfile.open(archive, 'r:') as stream:
    members = stream.getmembers()
    if len(members) > 1024 or sum(m.size for m in members) > 32 * 1024 * 1024:
        raise ValueError('Pages tar exceeds the runtime package budget')
    names = set()
    for member in members:
        raw = member.name
        parts = pathlib.PurePosixPath(raw).parts
        if raw.startswith('/') or '\\' in raw or '..' in parts:
            raise ValueError('Unsafe Pages tar path: ' + raw)
        name = str(pathlib.PurePosixPath(raw))
        if name in names:
            raise ValueError('Duplicate Pages tar member: ' + name)
        names.add(name)
        if not (member.isfile() or member.isdir()):
            raise ValueError('Pages tar contains a link or nonregular member: ' + raw)
        if name == '.' and not member.isdir():
            raise ValueError('Invalid root tar member')
    target.mkdir(parents=True)
    for member in members:
        name = str(pathlib.PurePosixPath(member.name))
        if name == '.':
            if not member.isdir(): raise ValueError('Invalid root tar member')
            continue
        output = target / name
        if member.isdir():
            output.mkdir(parents=True, exist_ok=True)
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            with output.open('xb') as result:
                result.write(stream.extractfile(member).read())
`, archive, destination], { stdio: ['ignore', 'pipe', 'pipe'] });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , archive, destination] = process.argv;
  if (!archive || !destination) throw Error('Usage: node tools/extract-pages-artifact.mjs <artifact.tar> <new-directory>');
  extractPagesArtifact(archive, destination);
}
