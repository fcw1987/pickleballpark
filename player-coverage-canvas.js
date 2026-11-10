import { coverageSectors, coverageWeight, getCoveragePreference, sectorOutline } from './player-coverage.js';
import { readCoverageSnapshot } from './player-coverage-snapshot.js';
import { updatePlayerCoverageContext } from './player-coverage-ui.js';

// The retained planner is already a quarter-foot pixel canvas. Cache a small
// field at that density; mix pigments once per pixel before compositing onto
// the court, so provider order cannot change the overlap or its feathering.
const fields = new WeakMap();
const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const srgb = value => Math.round(255 * (value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055));
function coverageField(ctx, sectors) {
  let field = fields.get(ctx);
  if (!field) {
    const canvas = ctx.canvas.ownerDocument.createElement('canvas');
    canvas.width = 112; canvas.height = 208;
    const paint = canvas.getContext('2d');
    field = { canvas, paint, pixels: paint.createImageData(112, 208), key: null }; fields.set(ctx, field);
  }
  const key = JSON.stringify(sectors);
  if (field.key === key) return field.canvas;
  const ordered = [...sectors].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const colors = ordered.map(s => s.color.slice(1).match(/../g).map(value => linear(parseInt(value, 16) / 255)));
  const data = field.pixels.data;
  for (let y = 0; y < 208; y++) for (let x = 0; x < 112; x++) {
    const point = { x: -4 + (x + .5) / 4, y: -4 + (y + .5) / 4 };
    let weight = 0, maximum = 0, overlap = 0, red = 0, green = 0, blue = 0;
    const teams = { green: 0, orange: 0 };
    for (let i = 0; i < ordered.length; i++) {
      const s = ordered[i], w = coverageWeight(s, point);
      overlap = Math.max(overlap, Math.min(teams[s.team], w)); teams[s.team] = Math.max(teams[s.team], w);
      maximum = Math.max(maximum, w); weight += w;
      red += colors[i][0] * w; green += colors[i][1] * w; blue += colors[i][2] * w;
    }
    const at = (y * 112 + x) * 4;
    const hatch = Math.abs(((point.x + point.y) / .85 % 1 + 1) % 1 - .5) < .10 ? 1 : 0;
    data[at] = weight ? srgb(red / weight) : 0;
    data[at + 1] = weight ? srgb(green / weight) : 0;
    data[at + 2] = weight ? srgb(blue / weight) : 0;
    data[at + 3] = Math.round(255 * Math.min(.88, maximum * .70 + overlap * (.10 + hatch * .08)));
  }
  field.paint.putImageData(field.pixels, 0, 0); field.key = key;
  return field.canvas;
}

/** Same world-space sectors for the retained Canvas2D planner. Draw before
 * regulation lines, net, players and ball; never over their visible pixels. */
export function drawPlayerCoverage(ctx, board, point) {
  if (!getCoveragePreference().enabled) { updatePlayerCoverageContext([]); return; }
  const snapshot = readCoverageSnapshot({ board, timeSeconds: board.plays?.session?.clock.elapsed || 0, samples: board.pixelSamples || {} });
  const sectors = coverageSectors(snapshot).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  updatePlayerCoverageContext(sectors);
  const path = sector => {
    ctx.beginPath(); sectorOutline(sector).forEach((p, i) => { const v = point(p.x, p.y); if (i) ctx.lineTo(v.x, v.y); else ctx.moveTo(v.x, v.y); }); ctx.closePath();
  };
  const clipHome = sector => {
    const a = point(-4, sector.position.y < 22 ? -4 : 22), b = point(24, sector.position.y < 22 ? 22 : 48);
    ctx.beginPath(); ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.clip();
  };
  ctx.save();
  const origin = point(-4, -4), end = point(24, 48);
  ctx.beginPath(); ctx.rect(origin.x, origin.y, end.x - origin.x, end.y - origin.y); ctx.clip();
  ctx.drawImage(coverageField(ctx, sectors), origin.x, origin.y, end.x - origin.x, end.y - origin.y);
  for (const sector of sectors) {
    ctx.save(); clipHome(sector);
    const at = point(sector.position.x, sector.position.y);
    path(sector); ctx.strokeStyle = `${sector.color}e6`; ctx.lineWidth = .9; ctx.setLineDash(sector.team === 'orange' ? [2, 2] : []); ctx.stroke();
    const direction = Math.atan2(sector.direction.y, sector.direction.x), hand = sector.handedness === 'right' ? 1 : -1;
    ctx.setLineDash([]); ctx.strokeStyle = '#fff7fc'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(at.x, at.y, 2.6 * 4, direction + hand * .58 - .14, direction + hand * .58 + .14); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
