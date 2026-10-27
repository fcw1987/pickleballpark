import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const GENERATORS = ['generate-replay-art.mjs', 'generate-art.mjs', 'generate-park-art.mjs', 'generate-menu-font.mjs', 'generate-pixel-park.mjs'];

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
};

export function parsePng(buffer, label = 'PNG') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${label}: invalid PNG signature`);
  const chunks = [];
  let offset = 8;
  let sawIend = false;
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw new Error(`${label}: truncated PNG chunk`);
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) throw new Error(`${label}: PNG chunk exceeds file length`);
    const typeBytes = buffer.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString('ascii');
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`${label}: invalid PNG chunk type`);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (crc32(Buffer.concat([typeBytes, data])) !== buffer.readUInt32BE(offset + 8 + length)) throw new Error(`${label}: invalid ${type} CRC`);
    chunks.push({ type, data: Buffer.from(data) });
    offset = end;
    if (type === 'IEND') {
      if (length !== 0 || offset !== buffer.length) throw new Error(`${label}: invalid IEND or trailing bytes`);
      sawIend = true;
      break;
    }
  }
  if (!sawIend) throw new Error(`${label}: missing IEND`);
  if (chunks[0]?.type !== 'IHDR' || chunks[0].data.length !== 13 || chunks.filter((chunk) => chunk.type === 'IHDR').length !== 1) throw new Error(`${label}: invalid IHDR`);
  const idatIndexes = chunks.map((chunk, index) => chunk.type === 'IDAT' ? index : -1).filter((index) => index >= 0);
  if (!idatIndexes.length || idatIndexes.some((index, i) => i && index !== idatIndexes[i - 1] + 1)) throw new Error(`${label}: IDAT chunks must exist and be consecutive`);
  const ihdr = chunks[0].data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr[9]];
  if (!width || !height || !channels || ihdr[10] !== 0 || ihdr[11] !== 0 || ihdr[12] !== 0) throw new Error(`${label}: unsupported or invalid PNG geometry/encoding`);
  const rowBytes = Math.ceil(width * channels * bitDepth / 8);
  const scanlines = inflateSync(Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)));
  if (scanlines.length !== height * (rowBytes + 1)) throw new Error(`${label}: invalid inflated scanline length`);
  for (let row = 0; row < height; row += 1) if (scanlines[row * (rowBytes + 1)] > 4) throw new Error(`${label}: invalid PNG row filter`);
  return {
    ihdr: Buffer.from(ihdr),
    scanlines,
    nonIdatChunks: chunks.filter((chunk) => chunk.type !== 'IDAT').map((chunk) => Buffer.concat([Buffer.from(chunk.type), chunk.data])),
  };
}

export function comparePngContent(expected, actual, label = 'PNG') {
  const left = parsePng(expected, `${label} expected`);
  const right = parsePng(actual, `${label} generated`);
  if (!left.ihdr.equals(right.ihdr)) throw new Error(`${label}: PNG geometry or pixel format changed`);
  if (left.nonIdatChunks.length !== right.nonIdatChunks.length || left.nonIdatChunks.some((chunk, i) => !chunk.equals(right.nonIdatChunks[i]))) throw new Error(`${label}: PNG metadata or non-image chunks changed`);
  if (!left.scanlines.equals(right.scanlines)) throw new Error(`${label}: PNG pixel scanlines changed`);
  return { encodedOnly: !expected.equals(actual) };
}

const walk = async (root, prefix = '') => (await Promise.all((await readdir(root, { withFileTypes: true })).map(async (entry) => (
  entry.isDirectory() ? walk(path.join(root, entry.name), `${prefix}${entry.name}/`) : `${prefix}${entry.name}`
)))).flat();
const snapshot = async (root) => {
  const paths = [...await walk(path.join(root, 'assets'), 'assets/'), ...await walk(path.join(root, 'icons'), 'icons/')].sort();
  return new Map(await Promise.all(paths.map(async (file) => [file, await readFile(path.join(root, file))])));
};

export function compareGeneratedTrees(expected, generated) {
  const expectedPaths = [...expected.keys()].sort();
  const generatedPaths = [...generated.keys()].sort();
  if (JSON.stringify(expectedPaths) !== JSON.stringify(generatedPaths)) throw new Error('Generated asset path set changed');
  let encodedOnlyPngs = 0;
  for (const file of expectedPaths) {
    const before = expected.get(file);
    const after = generated.get(file);
    if (before.equals(after)) continue;
    if (!file.endsWith('.png')) throw new Error(`${file}: generated non-PNG bytes changed`);
    if (comparePngContent(before, after, file).encodedOnly) encodedOnlyPngs += 1;
  }
  return { files: expectedPaths.length, encodedOnlyPngs };
}

// Imagegen proofs are reviewed source assets, not outputs of the pixel generators.
// Exact hashes keep this exception narrow and detect altered or missing art.
export function excludePreservedArt(expected, generated, inventory) {
  const remaining = new Map(expected);
  for (const [file, hash] of Object.entries(inventory)) {
    if (!/^assets\/reference-(?:athletes|depth)\/[^/]+$/.test(file) || !/^[0-9a-f]{64}$/.test(hash)) throw new Error(`Invalid preserved art entry: ${file}`);
    if (generated.has(file)) throw new Error(`Preserved art unexpectedly generated: ${file}`);
    const bytes = expected.get(file);
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Preserved art bytes changed or missing: ${file}`);
    remaining.delete(file);
  }
  return remaining;
}

async function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'pickleballpark-generated-'));
  try {
    await mkdir(path.join(temporaryRoot, 'assets', 'source'), { recursive: true });
    await mkdir(path.join(temporaryRoot, 'icons'));
    await mkdir(path.join(temporaryRoot, 'tools'));
    await cp(path.join(projectRoot, 'visual-theme.js'), path.join(temporaryRoot, 'visual-theme.js'));
    for (const script of GENERATORS) await cp(path.join(projectRoot, 'tools', script), path.join(temporaryRoot, 'tools', script));
    const expected = await snapshot(projectRoot);
    for (const script of GENERATORS) execFileSync(process.execPath, [path.join(temporaryRoot, 'tools', script)], { cwd: temporaryRoot, stdio: 'pipe' });
    const generated = await snapshot(temporaryRoot);
    const preservedArt = JSON.parse(await readFile(path.join(projectRoot, 'tools/preserved-art.json'), 'utf8'));
    const result = compareGeneratedTrees(excludePreservedArt(expected, generated, preservedArt), generated);
    console.log(`Node ${process.version}, zlib ${process.versions.zlib}: validated ${result.files} generated asset paths without modifying the checkout; ${result.encodedOnlyPngs} PNGs differed only in lossless compression bytes.`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
