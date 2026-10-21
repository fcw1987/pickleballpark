const DISCLOSURE = 'Intermediate path will not be followed; preview uses final destination; original points remain in saved/exported play.';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

// A small, synchronous content hash keeps the policy usable in browsers and in
// unit tests without making acknowledgement depend on Web Crypto availability.
function fingerprint(value) {
  const text = JSON.stringify(stableValue(value));
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Describes the acknowledgement required before previewing imported movement
 * paths that model version 1 cannot follow. This function never alters source.
 */
export function getWaypointPolicy(document, acknowledgedKey = null) {
  const shots = Array.isArray(document?.shots) ? document.shots : [];
  const affected = shots.flatMap((shot, index) => {
    return [[shot.hitter, shot.movement], ...Object.entries(shot.playerMovement || {})].flatMap(([player, movement]) => {
      const waypoints = movement?.waypoints;
      if (!Array.isArray(waypoints) || waypoints.length === 0) return [];
      return [{shotId: typeof shot.id === 'string' ? shot.id : null, number: index + 1,
        player, pointCount: waypoints.length}];
    });
  });

  if (affected.length === 0) {
    return Object.freeze({ key: null, requiresConfirmation: false, affected: Object.freeze([]), message: '' });
  }

  const relevant = {
    documentId: document?.id ?? null,
    shots: affected.map(({ shotId, number }) => {
      const shot = shots[number - 1];
      return {
        shotId,
        number,
        hitter: shot?.hitter ?? null,
        playerMovement: shot?.playerMovement ?? null,
        target: shot?.target ?? null,
        movement: {
          intent: shot?.movement?.intent ?? null,
          target: shot?.movement?.target ?? null,
          waypoints: shot?.movement?.waypoints
        }
      };
    })
  };
  const key = `waypoints-v1-${fingerprint(relevant)}`;
  const details = affected.map(item => `Shot ${item.number} · ${item.player || 'unknown player'} · ${item.pointCount} intermediate ${item.pointCount === 1 ? 'point' : 'points'}`).join('; ');
  const frozenAffected = Object.freeze(affected.map(item => Object.freeze(item)));
  return Object.freeze({
    key,
    requiresConfirmation: acknowledgedKey !== key,
    affected: frozenAffected,
    message: `${details}. ${DISCLOSURE}`
  });
}

export const WAYPOINT_DISCLOSURE = DISCLOSURE;
