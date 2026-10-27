/** Original pixel drawing commands, dependency-free Node regeneration. No external art. */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
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

const commands=[
  ["polygon",[[9,2],[22,2],[22,4],[27,4],[27,8],[30,8],[30,13],[31,13],[31,29],[28,29],[28,33],[23,33],[23,36],[8,36],[8,34],[3,34],[3,30],[0,30],[0,13],[2,13],[2,8],[6,8],[6,4],[9,4]],"#234c3b"],
  ["rect",[12,31,21,43],"#433f2b"],
  ["rect",[14,33,19,45],"#865431"],
  ["rect",[16,33,20,41],"#ac7341"],
  ["rect",[11,44,23,46],"#476b3b"],
  ["polygon",[[9,5],[22,5],[22,7],[26,7],[26,11],[29,11],[29,28],[25,28],[25,32],[20,32],[20,34],[9,34],[9,31],[5,31],[5,27],[2,27],[2,14],[5,14],[5,10],[9,10]],"#326d3e"],
  ["rect",[9,8,16,18],"#69a94a"],
  ["rect",[7,11,18,15],"#69a94a"],
  ["rect",[16,5,21,16],"#86bc50"],
  ["rect",[14,8,23,13],"#86bc50"],
  ["rect",[22,11,26,23],"#5b9e43"],
  ["rect",[20,14,28,20],"#5b9e43"],
  ["rect",[5,16,11,27],"#4d9443"],
  ["rect",[3,19,13,24],"#4d9443"],
  ["rect",[12,14,21,25],"#71b34b"],
  ["rect",[10,17,23,22],"#71b34b"],
  ["rect",[22,22,26,29],"#478a40"],
  ["rect",[20,25,28,26],"#478a40"],
  ["rect",[9,25,17,32],"#4d9343"],
  ["rect",[7,28,19,29],"#4d9343"],
  ["rect",[10,8,12,10],"#b5d56a"],
  ["rect",[16,5,18,7],"#b5d56a"],
  ["rect",[19,8,21,10],"#a1cc5d"],
  ["rect",[5,17,7,19],"#8fbe55"],
  ["rect",[13,16,15,18],"#9fca5c"],
  ["rect",[22,15,24,17],"#84b64e"],
  ["rect",[8,25,10,27],"#77ad4b"],
  ["rect",[19,25,21,27],"#6aa347"],
  ["rect",[4,27,6,29],"#2a6240"],
  ["rect",[15,30,17,32],"#2a6240"],
  ["rect",[25,26,27,28],"#2a6240"],
  ["polygon",[[36,3],[42,1],[47,5],[48,12],[44,16],[35,16],[32,12],[32,7]],"#234c3b"],
  ["polygon",[[36,4],[42,3],[46,7],[46,12],[42,14],[35,13],[34,8]],"#4d9346"],
  ["rect",[37,5,42,8],"#9dce58"],
  ["rect",[35,8,39,10],"#78b94f"],
  ["rect",[49,17,71,21],"#41613c"],
  ["rect",[50,6,70,15],"#514734"],
  ["rect",[51,4,69,8],"#e5b961"],
  ["rect",[51,9,69,12],"#bd8c45"],
  ["rect",[49,14,71,17],"#f0c871"],
  ["rect",[50,18,52,22],"#4c4939"],
  ["rect",[68,18,70,22],"#4c4939"],
  ["rect",[74,11,76,16],"#2c7242"],
  ["rect",[72,13,77,15],"#3d8b43"],
  ["rect",[73,7,76,10],"#ce5142"],
  ["rect",[72,8,77,9],"#f77b4a"],
  ["rect",[74,8,75,9],"#ffe17a"],
  ["rect",[80,8,82,13],"#2c7242"],
  ["rect",[78,10,83,12],"#3d8b43"],
  ["rect",[79,4,82,7],"#ce5142"],
  ["rect",[78,5,83,6],"#f77b4a"],
  ["rect",[80,5,81,6],"#ffe17a"],
  ["rect",[84,13,86,18],"#2c7242"],
  ["rect",[82,15,87,17],"#3d8b43"],
  ["rect",[83,9,86,12],"#ce5142"],
  ["rect",[82,10,87,11],"#f77b4a"],
  ["rect",[84,10,85,11],"#ffe17a"],
  ["rect",[96,7,127,9],"#304b50"],
  ["rect",[96,3,127,5],"#a1b8b6"],
  ["rect",[96,4,127,4],"#dde9d7"],
  ["rect",[96,10,127,11],"#637f83"],
  ["rect",[98,1,101,13],"#45616b"],
  ["rect",[98,1,100,11],"#adbfbe"],
  ["rect",[98,1,99,3],"#edf0d8"],
  ["rect",[110,1,113,13],"#45616b"],
  ["rect",[110,1,112,11],"#adbfbe"],
  ["rect",[110,1,111,3],"#edf0d8"],
  ["rect",[122,1,125,13],"#45616b"],
  ["rect",[122,1,124,11],"#adbfbe"],
  ["rect",[122,1,123,3],"#edf0d8"],
  ["rect",[53,81,110,93],"#467347"],
  ["rect",[53,58,109,88],"#334d54"],
  ["rect",[55,58,107,86],"#a7bab7"],
  ["rect",[55,60,107,61],"#7e999c"],
  ["rect",[55,65,107,66],"#7e999c"],
  ["rect",[55,70,107,71],"#7e999c"],
  ["rect",[55,75,107,76],"#7e999c"],
  ["rect",[55,80,107,81],"#7e999c"],
  ["rect",[55,85,107,86],"#7e999c"],
  ["polygon",[[49,50],[58,35],[101,35],[111,50],[111,63],[49,63]],"#583f3e"],
  ["polygon",[[51,50],[59,37],[100,37],[109,50],[109,59],[51,59]],"#b84c3f"],
  ["polygon",[[54,48],[61,39],[98,39],[106,48]],"#e67b56"],
  ["rect",[54,49,106,52],"#d8684b"],
  ["rect",[51,57,109,59],"#8a3f38"],
  ["rect",[61,40,62,52],"#bb513e"],
  ["rect",[68,40,69,52],"#bb513e"],
  ["rect",[75,40,76,52],"#bb513e"],
  ["rect",[82,40,83,52],"#bb513e"],
  ["rect",[89,40,90,52],"#bb513e"],
  ["rect",[96,40,97,52],"#bb513e"],
  ["rect",[76,65,88,87],"#3a4c53"],
  ["rect",[78,67,86,86],"#ac4e3e"],
  ["rect",[79,69,85,72],"#d0724e"],
  ["rect",[79,75,85,81],"#c45a43"],
  ["rect",[84,76,85,77],"#f4d787"],
  ["rect",[59,66,69,77],"#445c67"],
  ["rect",[60,67,68,75],"#4389bb"],
  ["rect",[61,67,63,70],"#70b8dd"],
  ["rect",[64,67,64,75],"#c2d0c4"],
  ["rect",[58,77,70,79],"#e0dfcd"],
  ["rect",[94,66,104,77],"#445c67"],
  ["rect",[95,67,103,75],"#4389bb"],
  ["rect",[96,67,98,70],"#70b8dd"],
  ["rect",[99,67,99,75],"#c2d0c4"],
  ["rect",[93,77,105,79],"#e0dfcd"],
  ["rect",[71,58,93,66],"#4e5051"],
  ["rect",[73,59,91,64],"#f3e2aa"],
  ["rect",[0,64,15,79],"#78bd72"],
  ["rect",[1,68,2,70],"#64ad67"],
  ["rect",[3,69,3,71],"#64ad67"],
  ["rect",[9,65,10,67],"#64ad67"],
  ["rect",[11,66,11,68],"#64ad67"],
  ["rect",[6,75,7,77],"#64ad67"],
  ["rect",[8,76,8,78],"#64ad67"],
  ["rect",[13,72,14,74],"#64ad67"],
  ["rect",[15,73,15,75],"#64ad67"],
  ["rect",[112,64,127,79],"#78bd72"],
  ["rect",[115,67,115,69],"#6eb36b"],
  ["rect",[116,69,117,69],"#6eb36b"],
  ["rect",[123,75,123,77],"#6eb36b"],
  ["rect",[124,77,125,77],"#6eb36b"],
  ["rect",[128,64,143,79],"#78bd72"],
  ["rect",[136,70,136,72],"#6eb36b"],
  ["rect",[137,72,138,72],"#6eb36b"],
  ["rect",[129,77,129,79],"#6eb36b"],
  ["rect",[130,79,131,79],"#6eb36b"],
  ["rect",[141,66,141,68],"#6eb36b"],
  ["rect",[142,68,143,68],"#6eb36b"],
  ["rect",[144,64,159,79],"#78bd72"],
  ["rect",[149,75,149,77],"#6eb36b"],
  ["rect",[150,77,151,77],"#6eb36b"],
  ["rect",[156,72,156,74],"#6eb36b"],
  ["rect",[157,74,158,74],"#6eb36b"],
  ["rect",[74,59,74,59],"#3a4c53"],
  ["rect",[75,59,75,59],"#3a4c53"],
  ["rect",[74,60,74,60],"#3a4c53"],
  ["rect",[76,60,76,60],"#3a4c53"],
  ["rect",[74,61,74,61],"#3a4c53"],
  ["rect",[75,61,75,61],"#3a4c53"],
  ["rect",[74,62,74,62],"#3a4c53"],
  ["rect",[74,63,74,63],"#3a4c53"],
  ["rect",[79,59,79,59],"#3a4c53"],
  ["rect",[78,60,78,60],"#3a4c53"],
  ["rect",[80,60,80,60],"#3a4c53"],
  ["rect",[78,61,78,61],"#3a4c53"],
  ["rect",[79,61,79,61],"#3a4c53"],
  ["rect",[80,61,80,61],"#3a4c53"],
  ["rect",[78,62,78,62],"#3a4c53"],
  ["rect",[80,62,80,62],"#3a4c53"],
  ["rect",[78,63,78,63],"#3a4c53"],
  ["rect",[80,63,80,63],"#3a4c53"],
  ["rect",[82,59,82,59],"#3a4c53"],
  ["rect",[83,59,83,59],"#3a4c53"],
  ["rect",[82,60,82,60],"#3a4c53"],
  ["rect",[84,60,84,60],"#3a4c53"],
  ["rect",[82,61,82,61],"#3a4c53"],
  ["rect",[83,61,83,61],"#3a4c53"],
  ["rect",[82,62,82,62],"#3a4c53"],
  ["rect",[84,62,84,62],"#3a4c53"],
  ["rect",[82,63,82,63],"#3a4c53"],
  ["rect",[84,63,84,63],"#3a4c53"],
  ["rect",[86,59,86,59],"#3a4c53"],
  ["rect",[88,59,88,59],"#3a4c53"],
  ["rect",[86,60,86,60],"#3a4c53"],
  ["rect",[87,60,87,60],"#3a4c53"],
  ["rect",[86,61,86,61],"#3a4c53"],
  ["rect",[86,62,86,62],"#3a4c53"],
  ["rect",[87,62,87,62],"#3a4c53"],
  ["rect",[86,63,86,63],"#3a4c53"],
  ["rect",[88,63,88,63],"#3a4c53"],
  ["rect",[16,64,31,79],"#e8ce8b"],
  ["rect",[19,67,20,68],"#d9ba78"],
  ["rect",[27,73,28,74],"#d9ba78"],
  ["rect",[21,78,23,78],"#f4dda0"],
  ["polygon",[[7,80],[26,80],[31,86],[31,121],[27,127],[4,127],[0,122],[0,88]],"#766b43"],
  ["polygon",[[8,83],[25,83],[28,87],[28,120],[25,124],[5,124],[3,120],[3,90]],"#356f9c"],
  ["polygon",[[8,85],[24,85],[26,89],[26,119],[23,122],[6,122],[5,118],[5,91]],"#428fc3"],
  ["rect",[8,90,15,90],"#68b3da"],
  ["rect",[13,91,17,91],"#68b3da"],
  ["rect",[18,99,25,99],"#68b3da"],
  ["rect",[23,100,27,100],"#68b3da"],
  ["rect",[6,112,13,112],"#68b3da"],
  ["rect",[11,113,15,113],"#68b3da"],
  ["rect",[17,117,24,117],"#68b3da"],
  ["rect",[22,118,26,118],"#68b3da"]
];

const atlas=new Canvas(160,144);
for(const [kind,points,hex] of commands){
 const color=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).concat(255);
 if(kind==='rect'){const [x,y,x1,y1]=points;atlas.rect(x,y,x1-x+1,y1-y+1,color);}
 else atlas.polygon(points,color);
}
await mkdir(path.join(root,'assets/pixel-park'),{recursive:true});
await writeFile(path.join(root,'assets/pixel-park/atlas.png'),encodePng(atlas));
