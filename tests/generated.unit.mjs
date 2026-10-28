import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

import { excludePreservedArt, comparePngContent, parsePng, compareGeneratedTrees } from '../tools/check-generated.mjs';

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const name = Buffer.from(type);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return result;
};
const png = ({ width = 1, height = 1, pixels = Buffer.from([255, 0, 0, 255]), level = 6, metadata = [] } = {}) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row += 1) pixels.copy(scanlines, row * (width * 4 + 1) + 1, row * width * 4, (row + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    ...metadata.map(([type, data]) => chunk(type, Buffer.from(data))),
    chunk('IDAT', deflateSync(scanlines, { level })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

test('accepts different lossless encodings of identical PNG scanlines', () => {
  const lowCompression = png({ level: 1 });
  const highCompression = png({ level: 9 });
  assert.notDeepEqual(lowCompression, highCompression);
  assert.deepEqual(comparePngContent(lowCompression, highCompression), { encodedOnly: true });
});

test('rejects changed PNG pixels', () => {
  assert.throws(() => comparePngContent(png(), png({ pixels: Buffer.from([254, 0, 0, 255]) })), /pixel scanlines changed/);
});

test('rejects changed PNG geometry', () => {
  const pixels = Buffer.from([255, 0, 0, 255, 255, 0, 0, 255]);
  assert.throws(() => comparePngContent(png(), png({ width: 2, pixels })), /geometry or pixel format changed/);
});

test('rejects changed PNG metadata', () => {
  assert.throws(() => comparePngContent(png(), png({ metadata: [['tEXt', 'author=test']] })), /metadata or non-image chunks changed/);
});

test('rejects structurally corrupt PNG chunks', () => {
  const corrupt = png();
  corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => parsePng(corrupt), /invalid IEND CRC/);
});


test('rejects missing or extra generated paths and altered non-PNG metadata', () => {
  const base = new Map([['metadata.json', Buffer.from('{"version":1}')]]);
  assert.throws(() => compareGeneratedTrees(base, new Map()), /path set changed/);
  assert.throws(() => compareGeneratedTrees(base, new Map([...base, ['extra.png', png()]])), /path set changed/);
  assert.throws(() => compareGeneratedTrees(base, new Map([['metadata.json', Buffer.from('{"version":2}')]])), /non-PNG bytes changed/);
});

 test('preserved art requires explicit exact hashes and cannot hide generated or unexpected assets', () => {
  const file = 'assets/reference-depth/tree.png';
  const bytes = Buffer.from('approved art');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const expected = new Map([[file, bytes], ['assets/generated.png', bytes]]);
  const generated = new Map([['assets/generated.png', bytes]]);
  assert.deepEqual([...excludePreservedArt(expected, generated, { [file]: hash }).keys()], ['assets/generated.png']);
  assert.throws(() => excludePreservedArt(expected, generated, { [file]: '0'.repeat(64) }), /bytes changed/);
  assert.throws(() => excludePreservedArt(new Map(), generated, { [file]: hash }), /missing/);
  assert.throws(() => excludePreservedArt(expected, new Map([[file, bytes]]), { [file]: hash }), /unexpectedly generated/);
  assert.throws(() => excludePreservedArt(expected, generated, { 'assets/other.png': hash }), /Invalid preserved/);
  assert.throws(() => compareGeneratedTrees(excludePreservedArt(new Map([...expected, ['assets/unregistered.png', bytes]]), generated, { [file]: hash }), generated), /path set changed/);
});
