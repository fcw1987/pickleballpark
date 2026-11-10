/** Pedagogical floor sectors, deliberately separate from rules and biomechanics.
 * Coordinates are court feet (+y toward the orange baseline), never screen axes.
 * The angle and radius are design choices, not measured athletic capabilities.
 */
export const COVERAGE_MODEL = Object.freeze({ version: 2, angleDegrees: 116, radiusFeet: 9, featherFeet: 1.8, maxTurnDegrees: 28 });
// Teammate colours, not jersey colours. Their equal linear-light mix is violet.
export const COVERAGE_COLORS = Object.freeze({ rose: '#ff6a80', blue: '#69a9ff', shared: '#c68ed0' });
export const COVERAGE_PREFERENCE_KEY = 'pickleboard-player-coverage-v1';
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function unitDirection(value, fallback = { x: 0, y: 1 }) {
  const length = finitePoint(value) ? Math.hypot(value.x, value.y) : 0;
  return length > 1e-8 ? { x: value.x / length, y: value.y / length } : { ...fallback };
}

/** Ball-aware, but always net-facing on the player's physical court half.
 * Provider facing is a desired direction, never permission to turn sideways.
 * 28° turn + 58° half-width keeps the entire fan in front (at most 86°).
 * A positive forward floor avoids a discontinuity at a directly rearward ball;
 * easing at contact avoids a sudden turn as the ball crosses the player's feet.
 * No state => reverse seeks, camera orbit and side flips agree.
 */
export function coverageDirection(player, ball) {
  const forward = player.position.y < 22 ? 1 : -1;
  const net = { x: 0, y: forward };
  const delta = finitePoint(ball) ? { x: ball.x - player.position.x, y: ball.y - player.position.y } : null;
  const distance = delta ? Math.hypot(delta.x, delta.y) : Infinity;
  const desired = finitePoint(player.coverageFacing) && Math.hypot(player.coverageFacing.x, player.coverageFacing.y) > 1e-8
    ? player.coverageFacing : delta || player.facing;
  const target = unitDirection(desired, net);
  const limit = COVERAGE_MODEL.maxTurnDegrees * Math.PI / 180;
  const turn = clamp(Math.atan2(target.x, Math.max(.35, forward * target.y)), -limit, limit)
    * clamp(distance / 1.5, 0, 1);
  return { x: Math.sin(turn), y: forward * Math.cos(turn) };
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
  // Stable identity ordering keeps colours with players through crossing,
  // camera changes and providers that return players in a different order.
  const teammates = team => snapshot.players.filter(p => p.team === team).map(p => p.id).sort();
  const slots = Object.fromEntries(['green', 'orange'].flatMap(team => teammates(team).map((id, i) => [id, i % 2])));
  return snapshot.players.map(player => ({
    id: player.id, team: player.team, colorSlot: slots[player.id],
    color: slots[player.id] === 0 ? COVERAGE_COLORS.rose : COVERAGE_COLORS.blue, position: { ...player.position },
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
