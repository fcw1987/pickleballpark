#!/usr/bin/env node
/*
 * Deterministic Pickleboard artwork generator.
 *
 * The pixel canvas is intentionally tiny. Shapes are authored on a 48x48
 * grid and encoded with only Node's standard library, so regeneration never
 * depends on a browser, font, image package, or network asset.
 */
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
await import(pathToFileURL(path.join(root, 'visual-theme.js')));
const palette = globalThis.PICKLEBOARD_VISUAL.palette;

const rgba = (hex, alpha = 255) => {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16), alpha];
};

class PixelCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
  }

  set(x, y, color) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data.set(color, i);
  }

  rect(x, y, width, height, color) {
    for (let yy = y; yy < y + height; yy += 1) {
      for (let xx = x; xx < x + width; xx += 1) this.set(xx, yy, color);
    }
  }

  polygon(points, color) {
    const minY = Math.max(0, Math.floor(Math.min(...points.map(point => point[1]))));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(...points.map(point => point[1]))));
    for (let y = minY; y <= maxY; y += 1) {
      const crossings = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if ((yi > y) !== (yj > y)) crossings.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i < crossings.length; i += 2) {
        for (let x = Math.ceil(crossings[i]); x <= Math.floor(crossings[i + 1] ?? crossings[i]); x += 1) this.set(x, y, color);
      }
    }
  }

  line(x1, y1, x2, y2, color) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i += 1) this.set(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, color);
  }

  blit(source, dx, dy, scale = 1) {
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const i = (y * source.width + x) * 4;
        const color = source.data.subarray(i, i + 4);
        if (color[3] === 0) continue;
        for (let yy = 0; yy < scale; yy += 1) {
          for (let xx = 0; xx < scale; xx += 1) this.set(dx + x * scale + xx, dy + y * scale + yy, color);
        }
      }
    }
  }

  png() { return encodePng(this.width, this.height, this.data); }
}

const chunk = (type, body) => {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, body])) >>> 0);
  return Buffer.concat([length, typeBuffer, body, crc]);
};

const crc32 = buffer => {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const encodePng = (width, height, rgbaData) => {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    scanlines[row] = 0;
    rgbaData.copy(scanlines, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
};

// Replay atlases are deliberately dependency-free RGBA PNGs. Decode just the
// format this repository emits so the compact board export can reuse the
// approved body/action pixels without copying or reauthoring them.
const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
const decodePng = bytes => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error('Invalid replay PNG signature');
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset); offset += 4;
    const type = bytes.toString('ascii', offset, offset + 4); offset += 4;
    const body = bytes.subarray(offset, offset + length); offset += length + 4;
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      bitDepth = body[8]; colorType = body[9]; interlace = body[12];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) throw new Error('Unsupported replay PNG format');
  const stride = width * 4;
  const filtered = inflateSync(Buffer.concat(idat));
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[y * (stride + 1)];
    const row = y * stride, source = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[source + x];
      const left = x >= 4 ? data[row + x - 4] : 0;
      const up = y > 0 ? data[row - stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? data[row - stride + x - 4] : 0;
      data[row + x] = filter === 0 ? raw : filter === 1 ? raw + left : filter === 2 ? raw + up
        : filter === 3 ? raw + Math.floor((left + up) / 2) : filter === 4 ? raw + paeth(left, up, upperLeft) : raw;
    }
  }
  const canvas = new PixelCanvas(width, height);
  canvas.data = data;
  return canvas;
};

const crop = (source, [x, y, width, height]) => {
  const result = new PixelCanvas(width, height);
  for (let row = 0; row < height; row += 1) source.data.copy(result.data, row * width * 4, ((y + row) * source.width + x) * 4, ((y + row) * source.width + x + width) * 4);
  return result;
};

const C = Object.fromEntries(Object.entries(palette).map(([name, hex]) => [name, rgba(hex)]));
// The app icon is an established product mark; park material updates do not
// silently redraw it.
const iconCourt = rgba('#648f86');
const iconKitchen = rgba('#b4c8b0');
const ink = C.ink;
const transparent = [0, 0, 0, 0];

function drawPaddle(c, side, high = false) {
  const left = side === 'left'; const dy = high ? -4 : 0;
  const blade = left ? [[2, 12 + dy], [10, 9 + dy], [15, 14 + dy], [13, 21 + dy], [5, 21 + dy]] : [[46, 12 + dy], [38, 9 + dy], [33, 14 + dy], [35, 21 + dy], [43, 21 + dy]];
  c.polygon(blade, ink);
  const face = left ? [[4, 13 + dy], [10, 11 + dy], [13, 15 + dy], [11, 19 + dy], [6, 19 + dy]] : [[44, 13 + dy], [38, 11 + dy], [35, 15 + dy], [37, 19 + dy], [42, 19 + dy]];
  c.polygon(face, C.navyLight); c.rect(left ? 5 : 39, 13 + dy, 6, 2, C.shoe);
  c.line(left ? 12 : 36, 19 + dy, left ? 23 : 25, 30 + dy, C.navyDark);
  c.line(left ? 13 : 35, 20 + dy, left ? 22 : 26, 30 + dy, C.navyLight);
  c.rect(left ? 20 : 28, 27 + dy, 4, 4, C.navyDark);
}

function drawAthlete(team, handedness, view = 'front', swing = false) {
  const c = new PixelCanvas(48, 48);
  const accent = team === 'green' ? C.green : C.orange;
  const accentLight = team === 'green' ? C.greenLight : C.orangeLight;
  const accentDark = team === 'green' ? C.greenDark : C.orangeDark;
  const rear = view === 'back'; const side = view === 'side';
  const paddleSide = handedness === 'right' ? (rear ? 'right' : 'left') : (rear ? 'left' : 'right');
  c.rect(13, 44, 22, 1, [38, 52, 73, 90]);
  // Last painted shoe row is y=45; lower-edge anchor is y=46; short legs remain distinct at native size.
  c.rect(16, 32, 7, 12, ink); c.rect(26, 32, 7, 12, ink);
  c.rect(18, 33, 4, 9, rear ? C.navyLight : C.navy); c.rect(27, 33, 4, 9, C.navyLight);
  c.rect(14, 41, 10, 4, ink); c.rect(25, 41, 11, 4, ink);
  c.rect(16, 42, 8, 2, C.shoe); c.rect(27, 42, 8, 2, C.shoe);
  c.rect(17, 42, 5, 1, C.navyLight); c.rect(28, 42, 5, 1, C.navyLight);
  // Paddle arm and a second physical hand both touch the handle.
  drawPaddle(c, paddleSide, swing);
  const left = paddleSide === 'left';
  const arm = left ? [[15, 20], [9, 24], [11, 29], [20, 28], [20, 22]] : [[33, 20], [39, 24], [37, 29], [28, 28], [28, 22]];
  c.polygon(arm, ink); c.polygon(left ? [[15,22],[11,25],[13,28],[19,26]] : [[33,22],[37,25],[35,28],[29,26]], C.navyLight);
  c.rect(left ? 10 : 35, 27, 5, 4, C.skin); c.rect(left ? 11 : 35, 29, 3, 2, C.skinShade);
  // Support arm crosses the jacket; the small skin pixels visibly wrap the grip.
  c.polygon(left ? [[32,21],[35,24],[29,29],[24,28],[27,24]] : [[16,21],[13,24],[19,29],[24,28],[21,24]], ink);
  c.polygon(left ? [[31,23],[33,25],[28,28],[25,27],[28,24]] : [[17,23],[15,25],[20,28],[23,27],[20,24]], C.navy);
  c.rect(22, 26, 5, 4, C.skin); c.rect(23, 29, 3, 2, C.skinShade);
  // Jacket is deliberately team-forward: a broad 12x9 panel breaks the navy mass.
  c.polygon([[15,17],[20,15],[28,15],[34,17],[36,28],[32,33],[16,33],[12,28]], ink);
  c.polygon([[17,18],[21,17],[27,17],[32,19],[33,27],[30,30],[18,30],[15,27]], C.navy);
  if (rear) c.rect(18, 20, 12, 9, accentDark); else c.rect(18, 20, 12, 9, accent);
  c.rect(19, 21, 10, 2, accentLight); c.rect(20, 24, 8, 5, rear ? accent : accentDark);
  c.rect(20, 30, 8, 2, C.navyDark);
  // Reassert the support hand over the jacket panel so both physical hands
  // remain readable at native resolution, wrapped around the lower grip.
  c.rect(22, 26, 5, 4, C.skin); c.rect(23, 29, 3, 2, C.skinShade);
  c.rect(21, 26, 1, 3, C.navyDark); c.rect(27, 27, 1, 3, C.navyDark);
  // Oversized cap/head, faceless by design.
  c.polygon([[18,8],[30,8],[33,12],[31,18],[27,20],[20,18],[16,13]], ink);
  c.polygon([[19,10],[29,10],[31,13],[29,17],[26,18],[21,17],[18,13]], rear ? C.skinShade : C.skin);
  c.polygon([[15,6],[20,3],[29,3],[33,6],[34,11],[29,12],[18,11],[14,9]], ink);
  c.polygon([[19,5],[21,4],[28,4],[31,6],[31,10],[20,9]], C.navy);
  c.rect(18,9,13,2, accentDark); c.rect(20,9,10,1, accent);
  c.polygon([[15,10],[25,11],[29,13],[19,13],[14,12]], ink); c.rect(17,11,9,1,C.navyLight);
  return c;
}

function drawFrontSprite(team, handedness) { return drawAthlete(team, handedness, 'front'); }
function drawRearSprite(team, handedness) { return drawAthlete(team, handedness, 'back'); }
function drawSideSprite(team, handedness) {
  const c = new PixelCanvas(48, 48);
  const accent = team === 'green' ? C.green : C.orange;
  const accentLight = team === 'green' ? C.greenLight : C.orangeLight;
  const accentDark = team === 'green' ? C.greenDark : C.orangeDark;
  c.rect(18, 44, 15, 1, [38, 52, 73, 90]);
  // Deliberate profile: one narrow leg in front of the other and a 12 px torso.
  c.rect(21, 31, 7, 13, ink); c.rect(26, 33, 6, 11, ink);
  c.rect(23, 33, 4, 9, C.navy); c.rect(27, 34, 4, 8, C.navyLight);
  c.rect(19, 41, 10, 4, ink); c.rect(26, 41, 9, 4, ink);
  c.rect(21, 42, 8, 2, C.shoe); c.rect(27, 42, 7, 2, C.shoe);
  // Paddle-side shoulder and a small support hand tuck into the chest.
  c.polygon([[24,19],[30,20],[35,25],[32,30],[27,28]], ink);
  c.polygon([[25,21],[29,21],[33,25],[31,27],[27,26]], C.navyLight);
  c.rect(31, 27, 4, 4, C.skin); c.rect(32, 29, 2, 2, C.skinShade);
  c.polygon([[20,17],[26,15],[31,18],[33,28],[29,33],[19,31],[18,23]], ink);
  c.polygon([[21,19],[26,18],[29,20],[30,27],[27,30],[20,29],[20,23]], C.navy);
  c.rect(21, 21, 8, 8, accent); c.rect(22, 22, 7, 2, accentLight); c.rect(23, 27, 6, 2, accentDark);
  // Profile cap points toward the paddle side; no facial features are added.
  c.polygon([[22,8],[29,8],[33,11],[32,17],[28,20],[22,18],[20,13]], ink);
  c.polygon([[23,10],[29,10],[31,12],[30,16],[27,18],[23,16],[22,12]], C.skinShade);
  c.polygon([[20,6],[23,3],[29,3],[33,6],[34,11],[25,11],[19,9]], ink);
  c.polygon([[23,5],[25,4],[29,4],[31,6],[31,9],[23,9]], C.navy);
  c.rect(22,9,10,2,accentDark); c.rect(24,9,8,1,accent);
  c.polygon([[28,10],[38,11],[38,13],[29,13]], ink); c.rect(30,11,7,1,C.navyLight);
  drawPaddle(c, handedness === 'right' ? 'right' : 'left');
  c.line(handedness === 'right' ? 35 : 13, 20, handedness === 'right' ? 31 : 17, 29, C.navyDark);
  return c;
}
function drawSwingSprite(team, handedness) {
  const c = drawAthlete(team, handedness, 'front');
  const left = handedness === 'right';
  // Contact pose: dominant arm is fully extended across/outward and the free
  // leg opens for a visible counterbalance. This is intentionally distinct
  // from the upright runtime token pose.
  if (left) {
    drawPaddle(c, 'left', true);
    c.polygon([[17,22],[11,19],[6,15],[8,12],[15,17],[22,23]], ink);
    c.polygon([[15,20],[10,17],[8,15],[11,16],[18,22]], C.navyLight);
    c.rect(5, 13, 4, 4, C.skin);
    c.rect(27, 34, 10, 4, ink); c.rect(31, 37, 8, 4, C.navyLight);
  } else {
    drawPaddle(c, 'right', true);
    c.polygon([[31,22],[37,19],[42,15],[40,12],[33,17],[26,23]], ink);
    c.polygon([[33,20],[38,17],[40,15],[37,16],[30,22]], C.navyLight);
    c.rect(39, 13, 4, 4, C.skin);
    c.rect(11, 34, 10, 4, ink); c.rect(9, 37, 8, 4, C.navyLight);
  }
  return c;
}

function drawIcon(size) {
  const c = new PixelCanvas(size, size);
  const unit = size / 64;
  const p = (value) => Math.round(value * unit);
  c.rect(0, 0, size, size, C.navyDark);
  // Stepped paper/card corners.
  c.rect(p(6), p(3), p(52), p(58), C.navy);
  c.rect(p(4), p(8), p(56), p(48), C.navy);
  // Court and kitchen geometry.
  c.rect(p(12), p(17), p(40), p(30), iconCourt);
  c.rect(p(12), p(28), p(40), p(8), iconKitchen);
  c.rect(p(12), p(17), p(40), p(30), C.line);
  c.rect(p(14), p(19), p(36), p(26), iconCourt);
  c.rect(p(14), p(29), p(36), p(6), iconKitchen);
  c.rect(p(31), p(19), p(2), p(26), C.line);
  c.rect(p(14), p(28), p(36), p(2), C.line);
  c.rect(p(14), p(35), p(36), p(2), C.line);
  // A compact navy paddle crossing the near court with a team-green edge.
  c.polygon([[p(36), p(11)], [p(48), p(15)], [p(44), p(27)], [p(34), p(23)]], ink);
  c.polygon([[p(37), p(13)], [p(46), p(16)], [p(43), p(24)], [p(35), p(21)]], C.navyLight);
  c.line(p(42), p(25), p(48), p(33), C.navyDark);
  c.line(p(43), p(25), p(49), p(32), C.orange);
  c.rect(p(39), p(13), p(6), p(1), C.green);
  c.rect(p(15), p(40), p(5), p(2), C.green);
  c.rect(p(44), p(40), p(5), p(2), C.orange);
  c.rect(p(26), p(22), p(5), p(5), C.ball);
  c.rect(p(27), p(21), p(3), p(1), C.ball);
  return c;
}

const replayRoot = path.join(root, 'assets/replay');
const replayMetadata = JSON.parse(await readFile(path.join(replayRoot, 'metadata.json'), 'utf8'));
const loadBoardSprite = async (team, handedness) => {
  const direction = team === 'green' ? 'front' : 'back';
  const atlas = replayMetadata.atlases[`${team}/${handedness}/${direction}`];
  if (!atlas) throw new Error(`Missing replay board source: ${team}/${handedness}/${direction}`);
  const ready = atlas.frames.find(frame => frame.action === 'ready');
  if (!ready || ready.rect.join(',') !== '0,0,64,64' || ready.pivot.join(',') !== '32,54') throw new Error(`Invalid replay ready frame: ${team}/${handedness}/${direction}`);
  const bodySheet = decodePng(await readFile(path.join(replayRoot, atlas.bodyFile)));
  const actionSheet = decodePng(await readFile(path.join(replayRoot, atlas.actionFile)));
  const sprite = new PixelCanvas(64, 64);
  sprite.blit(crop(bodySheet, ready.rect), 0, 0);
  sprite.blit(crop(actionSheet, ready.rect), 0, 0);
  const skin = new Set([C.skin.join(','), C.skinShade.join(',')]);
  for (let y = 34; y < 64; y += 1) for (let x = 24; x <= 40; x += 1) {
    const pixel = sprite.data.subarray((y * 64 + x) * 4, (y * 64 + x + 1) * 4);
    if (pixel[3] && skin.has([...pixel].join(','))) throw new Error(`Central flesh regression in ${team}/${handedness}`);
  }
  return sprite;
};

const outputs = [];
const writePng = async (relativePath, canvas) => {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const bytes = canvas.png();
  await writeFile(target, bytes);
  outputs.push({ relativePath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 12) });
};

const spriteCanvases = [];
for (const team of ['green', 'orange']) {
  for (const handedness of ['left', 'right']) {
    const sprite = await loadBoardSprite(team, handedness);
    spriteCanvases.push(sprite);
    await writePng(`assets/players/${team}-${handedness}-handed.png`, sprite);
  }
}

const iconFiles = [
  ['icons/icon-72x72.png', 72], ['icons/icon-96x96.png', 96], ['icons/icon-128x128.png', 128],
  ['icons/icon-144x144.png', 144], ['icons/icon-152x152.png', 152], ['icons/icon-192x192.png', 192],
  ['icons/icon-384x384.png', 384], ['icons/icon-512x512.png', 512], ['icons/apple-icon-180.png', 180],
  ['icons/icon-192.png', 192], ['icons/icon-512.png', 512]
];
for (const [file, size] of iconFiles) await writePng(file, drawIcon(size));

// QA contact sheets are generated from the same source canvases. They make
// the intentional one-pixel construction and the 4x4 court artwork size easy
// to inspect without changing any runtime asset dimensions.
// Design references: front, side, rear and contact swing are original authored
// pixel poses. Runtime keeps the four filenames above; these sheets document
// the silhouette at native scale and at the intended court projection.
const poseSheet = new PixelCanvas(4 * 128 + 5 * 16, 128 + 32);
poseSheet.rect(0, 0, poseSheet.width, poseSheet.height, C.paper);
spriteCanvases.forEach((sprite, index) => {
  poseSheet.blit(sprite, 16 + index * 144, 16);
  poseSheet.blit(sprite, 16 + index * 144, 144, 2);
});
await writePng('assets/source/players-poses.png', poseSheet);
const native = new PixelCanvas(4 * 64 + 5 * 8, 80);
native.rect(0, 0, native.width, native.height, C.paper);
spriteCanvases.forEach((sprite, index) => {
  native.rect(8 + index * 72, 8, 64, 64, C.navyDark);
  native.blit(sprite, 8 + index * 72, 8);
});
await writePng('assets/source/players-native.png', native);

const large = new PixelCanvas(4 * 64 * 4 + 5 * 16, 64 * 4 + 32);
large.rect(0, 0, large.width, large.height, C.paper);
spriteCanvases.forEach((sprite, index) => large.blit(sprite, 16 + index * 272, 16, 4));
await writePng('assets/source/players-large.png', large);

// Scale reference: 12 pixels per foot makes the 64px source exactly 16/3 ft.
const courtPreview = new PixelCanvas(20 * 12 + 160, 44 * 12);
courtPreview.rect(0, 0, courtPreview.width, courtPreview.height, C.paper);
courtPreview.rect(0, 0, 240, 528, C.line);
courtPreview.rect(2, 2, 236, 524, C.court);
courtPreview.rect(2, 168, 236, 168, C.kitchen);
courtPreview.rect(119, 2, 2, 166, C.line);
courtPreview.rect(119, 338, 2, 188, C.line);
courtPreview.rect(2, 167, 236, 2, C.line);
courtPreview.rect(2, 335, 236, 2, C.line);
courtPreview.blit(spriteCanvases[1], 18, 24);
courtPreview.blit(spriteCanvases[3], 272, 24, 2);
await writePng('assets/source/player-court-preview.png', courtPreview);

const density = new PixelCanvas(4 * 128 + 5 * 16, 64 + 16 + 128 + 24);
density.rect(0, 0, density.width, density.height, C.paper);
spriteCanvases.forEach((sprite, index) => {
  density.blit(sprite, 16 + index * 144, 8);
  density.blit(sprite, 16 + index * 144, 88, 2);
});
await writePng('assets/source/density-compare.png', density);

console.log(JSON.stringify({ palette: palette.ink, outputs }, null, 2));
