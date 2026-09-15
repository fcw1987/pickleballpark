// An explicit runtime-only package. Approved application bytes are immutable.
import { readFile, writeFile, mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Frozen release contract, independently compared with the locally retained approved source.
const approvedManifestSha256 = '678199f3d3136f12bce20451507524111b81b0b5f4659655c5a372959abe7f0b';
const approved = JSON.parse(await readFile('tests/fixtures/approved-runtime.json'));
const rootFiles = await readdir('.');
const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async e => e.isDirectory() ? walk(`${dir}/${e.name}`) : `${dir}/${e.name}`))).flat();
const actualPaths = [...rootFiles.filter(p => /\.(?:js|css|html)$/.test(p) || ['manifest.json', 'version.json'].includes(p)), ...await walk('icons'), ...await walk('vendor'), ...(await walk('assets')).filter(p => !p.startsWith('assets/source/'))].sort();
if (JSON.stringify(actualPaths) !== JSON.stringify(approved.files.map(f => f.path).sort())) throw Error('Runtime path set differs from approved source; explicit review required');
const files = [];
for (const file of approved.files) {
  const bytes = await readFile(file.path);
  if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes) throw Error(`Unapproved runtime change: ${file.path}`);
  files.push(file);
}
const lock = JSON.parse(await readFile('package-lock.json'));
for (const name of ['three.module.min.js', 'three.core.min.js']) {
  if (hash(await readFile(`vendor/${name}`)) !== hash(await readFile(`node_modules/three/build/${name}`))) throw Error(`Vendor differs from locked Three.js ${lock.packages['node_modules/three'].version}: ${name}`);
}
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of files) { await mkdir(path.dirname(`dist/${file.path}`), { recursive: true }); await copyFile(file.path, `dist/${file.path}`); }
const manifest = JSON.stringify({ approvedSource: approved.source, files }, null, 2) + '\n';
if (hash(manifest) !== approvedManifestSha256) throw Error('Approved manifest changed; a new reviewed baseline is required');
await writeFile('dist/runtime-manifest.json', manifest);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await writeFile('dist/build-info.json', JSON.stringify({ product: 'Pickleball Park', revision, approvedSource: approved.source, runtimeManifestSha256: hash(manifest), runtimeFiles: files.length, runtimeBytes: files.reduce((n, f) => n + f.bytes, 0), publicationMetadata: ['build-info.json', 'runtime-manifest.json'] }, null, 2) + '\n');
console.log(`Packaged ${files.length} unchanged approved runtime files (${files.reduce((n, f) => n + f.bytes, 0)} bytes), plus 2 publication metadata files; revision ${revision}`);
