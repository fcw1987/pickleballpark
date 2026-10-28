/** Pedagogical floor sectors, deliberately separate from rules and biomechanics.
 * Coordinates are court feet (+y toward the orange baseline), never screen axes.
 * The angle and radius are design choices, not measured athletic capabilities.
 */
export const COVERAGE_MODEL = Object.freeze({ version: 1, angleDegrees: 116, radiusFeet: 9, featherFeet: 1.8 });
export const COVERAGE_COLORS = Object.freeze({ green: '#96f0db', orange: '#ffd49b', shared: '#fff8e4' });
export const COVERAGE_PREFERENCE_KEY = 'pickleboard-player-coverage-v1';
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function unitDirection(value, fallback = { x: 0, y: 1 }) {
  const length = finitePoint(value) ? Math.hypot(value.x, value.y) : 0;
  return length > 1e-8 ? { x: value.x / length, y: value.y / length } : { ...fallback };
}

/** Turn gently toward the actual ball from strategic facing. A nearby contact
 * cannot flip the guide behind the player. Stateless => reverse seeks agree.
 * A future provider may supply an already ball-aware coverageFacing directly.
 */
export function coverageDirection(player, ball) {
  const base = unitDirection(player.facing, { x: 0, y: player.position.y < 22 ? 1 : -1 });
  if (finitePoint(player.coverageFacing)) return unitDirection(player.coverageFacing, base);
  if (!finitePoint(ball)) return base;
  const delta = { x: ball.x - player.position.x, y: ball.y - player.position.y };
  const distance = Math.hypot(delta.x, delta.y);
  if (distance < .01) return base;
  const target = unitDirection(delta);
  // A ball passing directly behind the player must not jump between ±pi.
  const angle = Math.atan2(base.x * target.y - base.y * target.x, Math.max(.35, base.x * target.x + base.y * target.y));
  const turn = clamp(angle, -Math.PI / 5, Math.PI / 5) * .62 * clamp(distance / 3, 0, 1);
  return { x: base.x * Math.cos(turn) - base.y * Math.sin(turn), y: base.x * Math.sin(turn) + base.y * Math.cos(turn) };
}

/** Validate the versioned read-only seam. Unknown versions fail closed. */
export function isCoverageSnapshot(snapshot) {
  return snapshot?.version === 1 && Number.isFinite(snapshot.timeSeconds) && finitePoint(snapshot.ball)
    && Array.isArray(snapshot.players) && snapshot.players.length <= 4
    && new Set(snapshot.players.map(p => p?.id)).size === snapshot.players.length
    && snapshot.players.every(p => typeof p?.id === 'string' && ['green', 'orange'].includes(p.team)
      && finitePoint(p.position) && finitePoint(p.facing) && ['left', 'right'].includes(p.handedness));
}

export function coverageSectors(snapshot) {
  if (!isCoverageSnapshot(snapshot)) return [];
  return snapshot.players.map(player => ({
    id: player.id, team: player.team, position: { ...player.position },
    direction: coverageDirection(player, snapshot.ball), handedness: player.handedness,
    halfAngle: COVERAGE_MODEL.angleDegrees * Math.PI / 360, radius: COVERAGE_MODEL.radiusFeet,
    legalReceiver: player.legalReceiver ?? null, priority: player.coveragePriority ?? null
  }));
}

export function coverageWeight(sector, point) {
  if (sector.position.y < 22 ? point.y >= 22 : point.y <= 22) return 0;
  const dx = point.x - sector.position.x, dy = point.y - sector.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance > sector.radius || distance < .05) return 0;
  const angle = Math.acos(clamp((dx * sector.direction.x + dy * sector.direction.y) / distance, -1, 1));
  if (angle > sector.halfAngle) return 0;
  return clamp((sector.radius - distance) / COVERAGE_MODEL.featherFeet, 0, 1)
    * clamp((sector.halfAngle - angle) / .07, 0, 1);
}

export function sharedCoverageAt(sectors, point) {
  return ['green', 'orange'].filter(team => sectors.filter(s => s.team === team && coverageWeight(s, point) > 0).length > 1);
}

export function sectorOutline(sector, segments = 40) {
  const angle = Math.atan2(sector.direction.y, sector.direction.x);
  return [{ ...sector.position }, ...Array.from({ length: segments + 1 }, (_, i) => {
    const a = angle - sector.halfAngle + i * sector.halfAngle * 2 / segments;
    return { x: sector.position.x + Math.cos(a) * sector.radius, y: sector.position.y + Math.sin(a) * sector.radius };
  })];
}

export function createCoveragePreference(storage) {
  let enabled = false;
  try { enabled = storage?.getItem(COVERAGE_PREFERENCE_KEY) === 'on'; } catch { /* Session use still works. */ }
  const listeners = new Set();
  return {
    get enabled() { return enabled; },
    set(value) {
      enabled = value === true;
      let persisted = false;
      try { storage?.setItem(COVERAGE_PREFERENCE_KEY, enabled ? 'on' : 'off'); persisted = Boolean(storage); } catch { /* No authoring data is touched. */ }
      for (const listener of listeners) listener(enabled);
      return { enabled, persisted };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
let preference;
export function getCoveragePreference() {
  if (!preference) {
    let storage;
    try { storage = globalThis.localStorage; } catch { /* Private/denied storage. */ }
    preference = createCoveragePreference(storage);
  }
  return preference;
}
