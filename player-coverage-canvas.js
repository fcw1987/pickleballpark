import { COVERAGE_COLORS, coverageSectors, getCoveragePreference, sectorOutline } from './player-coverage.js';
import { readCoverageSnapshot } from './player-coverage-snapshot.js';

/** Same world-space sectors for the retained Canvas2D planner. Draw before
 * regulation lines, net, players and ball; never over their visible pixels. */
export function drawPlayerCoverage(ctx, board, point) {
  if (!getCoveragePreference().enabled) return;
  const snapshot = readCoverageSnapshot({ board, timeSeconds: board.plays?.session?.clock.elapsed || 0, samples: board.pixelSamples || {} });
  const sectors = coverageSectors(snapshot);
  const path = sector => {
    ctx.beginPath(); sectorOutline(sector).forEach((p, i) => { const v = point(p.x, p.y); if (i) ctx.lineTo(v.x, v.y); else ctx.moveTo(v.x, v.y); }); ctx.closePath();
  };
  const clipHome = sector => {
    const a = point(-4, sector.position.y < 22 ? -4 : 22), b = point(24, sector.position.y < 22 ? 22 : 48);
    ctx.beginPath(); ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.clip();
  };
  ctx.save();
  const origin = point(-4, -4), end = point(24, 48); ctx.beginPath(); ctx.rect(origin.x, origin.y, end.x - origin.x, end.y - origin.y); ctx.clip();
  for (const sector of sectors) {
    ctx.save(); clipHome(sector);
    const at = point(sector.position.x, sector.position.y), edge = point(sector.position.x + sector.radius, sector.position.y), radius = edge.x - at.x;
    const gradient = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
    gradient.addColorStop(0, `${COVERAGE_COLORS[sector.team]}44`); gradient.addColorStop(.7, `${COVERAGE_COLORS[sector.team]}33`); gradient.addColorStop(1, `${COVERAGE_COLORS[sector.team]}00`);
    path(sector); ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = `${COVERAGE_COLORS[sector.team]}88`; ctx.lineWidth = .7; ctx.setLineDash(sector.team === 'orange' ? [2, 2] : []); ctx.stroke();
    const direction = Math.atan2(sector.direction.y, sector.direction.x), hand = sector.handedness === 'right' ? 1 : -1;
    ctx.setLineDash([]); ctx.beginPath(); ctx.arc(at.x, at.y, 2.6 * 4, direction + hand * .58 - .12, direction + hand * .58 + .12); ctx.stroke();
    ctx.restore();
  }
  ctx.setLineDash([]);
  for (let i = 0; i < sectors.length; i++) for (let j = i + 1; j < sectors.length; j++) {
    if (sectors[i].team !== sectors[j].team) continue;
    ctx.save(); clipHome(sectors[i]); clipHome(sectors[j]); path(sectors[i]); ctx.clip(); path(sectors[j]); ctx.clip();
    ctx.fillStyle = '#fff8e41a'; ctx.fillRect(origin.x, origin.y, end.x - origin.x, end.y - origin.y);
    ctx.strokeStyle = '#fff8e479'; ctx.lineWidth = .7;
    for (let x = -56; x < 80; x += .85) { const a = point(x, -4), b = point(x - 52, 48); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
}
