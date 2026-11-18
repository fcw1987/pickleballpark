// Build only the explicit application allowlist and deterministic metadata.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimePackage } from './runtime-package.mjs';

export function buildSite({ sourceRoot = '.', output = path.join(sourceRoot, 'dist'), requireCommittedSource = false } = {}) {
  const data = createRuntimePackage({ sourceRoot, requireCommittedSource });
  for (const name of ['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js']) {
    const upstream = readFileSync(path.join(sourceRoot, 'node_modules/three/examples/jsm', name), 'utf8');
    const bundled = upstream.replace("} from 'three';", "} from '../../three.module.min.js';");
    if (data.files.get(`vendor/three-addons/${name}`)?.toString() !== bundled) throw Error(`Vendor differs from locked Three.js: ${name}`);
  }
  if (!data.files.get('vendor/three-addons/LICENSE.txt')?.equals(readFileSync(path.join(sourceRoot, 'node_modules/three/LICENSE')))) throw Error('Three.js addon license differs from installed dependency');
  output = path.resolve(output);
  if (output === path.resolve(sourceRoot) || path.resolve(sourceRoot).startsWith(`${output}${path.sep}`)) throw Error('Output cannot replace the source directory');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const [file, bytes] of [...data.files, ['runtime-manifest.json', data.manifestBytes], ['build-info.json', data.infoBytes]]) {
    mkdirSync(path.dirname(path.join(output, file)), { recursive: true });
    writeFileSync(path.join(output, file), bytes);
  }
  return data.info;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const info = buildSite({ requireCommittedSource: process.argv.includes('--require-clean') });
  console.log(`Packaged ${info.runtimeFiles} runtime files (${info.runtimeBytes} bytes) plus 2 metadata files; source ${info.revision} (${info.sourceState})`);
}
