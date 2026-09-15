#!/usr/bin/env node
/* Deterministic original park textures and quiet pixel landmarks. */
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(path.join(root, 'visual-theme.js')));
const palette = globalThis.PICKLEBOARD_VISUAL.palette;
const rgba = (hex, alpha = 255) => {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16), alpha];
};
const C = Object.fromEntries(Object.entries(palette).map(([name, value]) => [name, rgba(value)]));
const mix = (a, b, amount) => a.map((value, index) => Math.round(value * (1 - amount) + b[index] * amount));

class Canvas {
  constructor(width, height) { this.width = width; this.height = height; this.data = Buffer.alloc(width * height * 4); }
  set(x, y, color) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data.set(color, (y * this.width + x) * 4);
  }
  rect(x, y, width, height, color) { for (let yy = y; yy < y + height; yy += 1) for (let xx = x; xx < x + width; xx += 1) this.set(xx, yy, color); }
  polygon(points, color) {
    const minY = Math.max(0, Math.floor(Math.min(...points.map(point => point[1]))));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(...points.map(point => point[1]))));
    for (let y = minY; y <= maxY; y += 1) {
      const crossings = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if ((yi > y) !== (yj > y)) crossings.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i < crossings.length; i += 2) for (let x = Math.ceil(crossings[i]); x <= Math.floor(crossings[i + 1] ?? crossings[i]); x += 1) this.set(x, y, color);
    }
  }
}

const crc32 = buffer => {
  let crc = 0xffffffff;
  for (const value of buffer) { crc ^= value; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, body) => {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(body.length); crc.writeUInt32BE(crc32(Buffer.concat([name, body])));
  return Buffer.concat([length, name, body, crc]);
};
const encodePng = canvas => {
  const scanlines = Buffer.alloc((canvas.width * 4 + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) { scanlines[y * (canvas.width * 4 + 1)] = 0; canvas.data.copy(scanlines, y * (canvas.width * 4 + 1) + 1, y * canvas.width * 4, (y + 1) * canvas.width * 4); }
  const header = Buffer.alloc(13); header.writeUInt32BE(canvas.width); header.writeUInt32BE(canvas.height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
};

// Original tile language: broad material bands with a few deliberate pixel
// clusters. The tiles are calm at court scale, but still reward a closer look.
// Nothing uses isolated citron or cream pixels that could be mistaken for the ball.
const texture = (base, accents, seed, pattern = 0) => {
  const c = new Canvas(128, 128); c.rect(0, 0, 128, 128, base);
  if (seed === 3) {
    const grout = C.pathShade, mortar = mix(base, C.parkShadow, .16);
    for (let row = 0; row < 8; row += 1) for (let col = -1; col < 5; col += 1) {
      const x = col * 32 + (row % 2 ? 16 : 0), y = row * 16;
      c.rect(x, y, 32, 1, grout); c.rect(x, y, 1, 16, grout);
      c.rect(x + 2, y + 2, 28, 1, mortar); c.rect(x + 2, y + 3, 1, 10, mortar);
      c.rect(x + 29, y + 4, 1, 10, accents[0]); c.rect(x + 4, y + 14, 26, 1, accents[0]);
      if ((row + col) % 3 === 0) c.rect(x + 9, y + 8, 7, 1, accents[1]);
    }
    return c;
  }
  if (seed === 1) {
    // Court texture is a quiet woven field, not noise. Wide bands keep the
    // surface legible while preserving the exact line and target contrast.
    const shade = accents[0], light = accents[1];
    for (let row = 0; row < 8; row += 1) {
      const y = row * 16;
      if (row % 2 === 0) c.rect(0, y, 128, 2, mix(base, shade, .16));
      c.rect((row % 3) * 19, y + 7, 43, 1, mix(base, light, .18));
      c.rect(73 + (row % 2) * 9, y + 12, 34, 1, mix(base, shade, .12));
    }
    return c;
  }
  // Grass uses low contrast stepped ribbons and a handful of clustered tufts.
  // The layout is intentionally asymmetric so repetition is hard to perceive.
  const shade = accents[0], light = accents[1], deep = mix(base, C.grassDeep, .3);
  const patches = [[5, 8, 24, 6], [43, 3, 34, 8], [91, 18, 28, 7], [16, 42, 30, 7], [65, 48, 36, 8], [103, 70, 20, 6], [2, 88, 26, 8], [47, 78, 34, 7], [82, 104, 30, 7], [20, 116, 42, 7]];
  for (const [x, y, width, height] of patches) {
    const patchTone = mix(base, deep, .13);
    c.rect(x, y + 2, width, height - 3, patchTone);
    c.rect(x + 4, y, width - 10, 2, mix(base, shade, .18));
    c.rect(x + 2, y + height - 1, width - 8, 1, mix(base, deep, .16));
    if (pattern === 1) c.rect(x + width - 8, y - 2, 2, 2, mix(base, light, .36));
  }
  const clusters = [[8, 29], [37, 7], [78, 20], [111, 9], [26, 61], [59, 43], [97, 55], [7, 88], [45, 93], [81, 99], [113, 86], [31, 115], [66, 120]];
  for (const [i, [x, y]] of clusters.entries()) {
    if (pattern === 2 && i % 3) continue;
    const color = i % 3 === 0 ? shade : light;
    c.rect(x, y, 4, 2, color); c.rect(x + 2, y - 2, 2, 2, color);
    c.rect(x + 7, y + 1, 3, 1, mix(base, deep, .48));
    if (i % 2 === 0) c.rect(x + 4, y + 3, 5, 1, mix(base, deep, .4));
  }
  return c;
};

const tree = () => {
  const c = new Canvas(64, 64);
  const shadow=[...C.parkShadow.slice(0,3),74],barkLight=mix(C.parkWood,C.parkSign,.35);
  c.rect(14,56,38,4,shadow);c.rect(8,58,49,2,shadow);
  c.polygon([[26,29],[37,29],[37,49],[42,57],[35,57],[31,53],[24,57],[27,49]],C.parkShadow);
  c.rect(28,32,7,22,C.parkWood); c.rect(29,33,2,19,barkLight); c.rect(33,40,2,13,C.orangeDark);
  c.rect(25,37,5,3,C.parkWood); c.rect(23,33,4,5,C.parkWood); c.rect(35,50,7,2,barkLight);
  // Uneven stepped canopy with three overlapping lobes. The outer navy edge
  // gives the tree a readable silhouette beside the approved athletes.
  c.polygon([[22,2],[36,2],[36,5],[45,5],[45,9],[52,9],[52,15],[57,15],[57,25],[60,25],[60,36],[55,36],[55,42],[47,42],[47,46],[38,46],[38,49],[21,49],[21,46],[12,46],[12,42],[6,42],[6,34],[4,34],[4,23],[8,23],[8,14],[14,14],[14,7],[22,7]],C.parkShadow);
  c.polygon([[22,5],[35,5],[35,8],[43,8],[43,12],[50,12],[50,18],[54,18],[54,27],[57,27],[57,34],[51,34],[51,40],[43,40],[43,44],[22,44],[22,42],[14,42],[14,38],[9,38],[9,31],[7,31],[7,24],[11,24],[11,16],[17,16],[17,10],[22,10]],C.grassDeep);
  c.polygon([[22,7],[33,7],[33,10],[40,10],[40,14],[46,14],[46,20],[51,20],[51,28],[45,28],[45,33],[34,33],[34,36],[21,36],[21,33],[13,33],[13,28],[10,28],[10,21],[15,21],[15,14],[22,14]],C.grassMid);
  c.polygon([[23,8],[32,8],[32,11],[38,11],[38,15],[43,15],[43,20],[35,20],[35,23],[24,23],[24,26],[16,26],[16,21],[13,21],[13,17],[18,17],[18,12],[23,12]],C.grassLight);
  c.rect(26,7,7,2,C.grassSun); c.rect(18,13,7,2,C.grassSun); c.rect(39,16,6,2,C.grassLight); c.rect(47,23,5,2,C.grassLight);
  const leaf=mix(C.grassLight,C.grassMid,.35);
  for(const [x,y,w] of [[20,11,6],[29,9,6],[36,16,6],[13,25,6],[22,30,8],[35,31,6],[45,27,5],[49,35,4]]) { c.rect(x,y,w,2,leaf); c.rect(x+1,y+2,w-2,1,C.grassMid); }
  c.rect(13,36,8,2,C.parkShadow); c.rect(27,39,7,2,C.parkShadow); c.rect(43,35,7,2,C.parkShadow); c.rect(9,31,4,2,C.grassLight);
  return c;
};
const shrub = () => {
  const c = new Canvas(64, 64);
  c.rect(7,50,51,5,[...C.parkShadow.slice(0,3),74]);
  c.polygon([[7,50],[7,39],[11,39],[11,32],[17,32],[17,27],[25,27],[25,30],[32,30],[32,25],[40,25],[40,29],[48,29],[48,34],[54,34],[54,40],[58,40],[58,50]],C.parkShadow);
  c.polygon([[11,48],[11,39],[15,39],[15,33],[21,33],[21,29],[27,29],[27,34],[35,34],[35,29],[42,29],[42,33],[49,33],[49,38],[54,38],[54,48]],C.grassDeep);
  c.rect(16,36,34,11,C.grassMid); c.rect(20,31,8,7,C.grassLight); c.rect(37,30,8,6,C.grassLight); c.rect(28,34,9,4,C.grassSun);
  c.rect(13,39,10,3,C.grassLight); c.rect(27,40,10,2,C.grassLight); c.rect(43,37,8,2,C.grassLight);
  c.rect(17,45,12,2,C.parkShadow); c.rect(37,43,11,2,C.parkShadow); c.rect(11,48,15,2,C.grassMid); c.rect(42,48,13,2,C.grassMid);
  return c;
};
const bench = () => {
  const c = new Canvas(64, 64);
  c.rect(6, 52, 52, 5, [...C.parkShadow.slice(0, 3), 90]);
  c.rect(10, 28, 44, 8, C.parkWood); c.rect(10, 39, 44, 7, C.parkWood); c.rect(13, 30, 38, 3, C.pathShade);
  c.rect(14, 46, 5, 9, C.navyDark); c.rect(45, 46, 5, 9, C.navyDark); c.rect(8, 26, 5, 24, C.navyDark); c.rect(51, 26, 5, 24, C.navyDark);
  c.rect(13,28,38,1,C.parkWoodLight); c.rect(13,39,38,1,C.parkWoodLight);
  c.rect(16,33,12,1,C.pathShade); c.rect(32,42,15,1,C.pathShade);
  c.rect(10,26,2,22,C.navyLight); c.rect(52,27,1,21,C.navyLight);
  c.rect(14, 47, 3, 5, C.navyLight); c.rect(47, 47, 3, 5, C.navyLight);
  return c;
};
const glyphs = {
  P: ['110','101','110','100','100'], I: ['111','010','010','010','111'], C: ['111','100','100','100','111'], K: ['101','101','110','101','101'], L: ['100','100','100','100','111'], E: ['111','100','110','100','111'], B: ['110','101','110','101','110'], A: ['010','101','111','101','101'], R: ['110','101','110','101','101'], H: ['101','101','111','101','101']
};
const text = (c, value, x, y, color, scale = 1) => {
  for (const letter of value) {
    const pattern = glyphs[letter];
    if (!pattern) { x += 4 * scale; continue; }
    pattern.forEach((row, dy) => [...row].forEach((pixel, dx) => { if (pixel === '1') c.rect(x + dx * scale, y + dy * scale, scale, scale, color); }));
    x += 4 * scale;
  }
};
const banner = () => {
  const c = new Canvas(128, 32);
  c.rect(1, 1, 126, 30, C.navyDark);
  c.rect(4, 4, 120, 24, C.parkSign);
  c.rect(6, 6, 116, 20, C.line);
  // A compact two-line wordmark keeps every doubled pixel legible in the park border.
  text(c, 'PICKLEBALL', 24, 7, C.navyDark, 2);
  text(c, 'PARK', 48, 18, C.navyDark, 2);
  return c;
};

// Original 24px nine-slice dialogue frame. Eight source pixels per edge keep
// the two-pixel stepped corners crisp while only the middle regions stretch.
const menuFrame = dark => {
  const c=new Canvas(24,24),edge=rgba(dark?'#a6bea0':'#243d4b'),paper=rgba(dark?'#1d3542':'#fff6d9'),shade=rgba(dark?'#102733':'#d2bb83'),light=rgba(dark?'#41606a':'#fffdf0');
  c.rect(4,0,16,24,edge);c.rect(0,4,24,16,edge);c.rect(2,2,20,20,edge);
  c.rect(4,2,16,20,shade);c.rect(2,4,20,16,shade);
  c.rect(5,4,14,16,paper);c.rect(4,5,16,14,paper);
  c.rect(5,4,14,1,light);c.rect(4,5,1,14,light);
  c.rect(5,2,14,1,light);c.rect(2,5,1,14,light);
  return c;
};

const assets = [
  ['quiet-court.png', texture(C.court, [C.courtShade, C.courtLight], 1, 2)],
  ['grass.png', texture(C.surround, [C.grassDeep, C.grassLight], 2, 1)],
  ['path.png', texture(C.path, [C.pathShade, C.pathLight], 3, 1)],
  ['tree.png', tree()], ['shrub.png', shrub()], ['bench.png', bench()], ['banner.png', banner()],
  ['menu-frame-light.png',menuFrame(false)],['menu-frame-dark.png',menuFrame(true)]
];
const output = [];
for (const [name, canvas] of assets) {
  const bytes = encodePng(canvas); const target = path.join(root, 'assets/park', name);
  await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes);
  output.push({ name: `assets/park/${name}`, width: canvas.width, height: canvas.height, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 12) });
}
console.log(JSON.stringify({ output }, null, 2));
