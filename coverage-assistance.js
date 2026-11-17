import {movementProtection} from './play-document.js';
const COURT_MIN_X = 1;
const COURT_MAX_X = 19;
const MAX_LATERAL_SPEED_FPS = 13;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const clone = value => structuredClone(value);

function readAssistance(document) {
  const source = document?.assistance || {};
  return {
    auto: source.autoShading === true,
    guides: source.showGuides === true,
    team: ['green', 'orange', 'both'].includes(source.team) ? source.team : 'both'
  };
}

function playerRecords(document, play) {
  const source = document?.players;
  const records = source && typeof source === 'object' && !Array.isArray(source)
    ? Object.entries(source).map(([id, value]) => ({ id, ...value }))
    : [];
  const result = new Map(records.filter(record => typeof record?.id === 'string').map(record => [record.id, record]));
  const ids = new Set();
  for (const step of play?.steps || []) {
    Object.keys(step.positions || {}).filter(id => id !== 'ball').forEach(id => ids.add(id));
  }
  for (const id of ids) {
    if (!result.has(id)) result.set(id, { id });
    const record = result.get(id);
    if (!record.team) {
      if (/^(player)?[12]$/.test(id)) record.team = 'green';
      else if (/^(player)?[34]$/.test(id)) record.team = 'orange';
    }
  }
  return result;
}

function selectedTeam(setting, team) {
  return setting === 'both' || setting === team;
}

function legDuration(timeline, step, index) {
  const segment = timeline?.segments?.find(item => item.step?.id === step.id || item.shotId === step.id || item.index === index);
  return Number.isFinite(segment?.duration) && segment.duration >= 0 ? segment.duration : 0;
}

function boundedMoveX(fromX, desiredX, seconds) {
  const maximum = MAX_LATERAL_SPEED_FPS * seconds;
  // A valid authored player can begin on the apron. Bound the journey back
  // toward the inset goal instead of teleporting that origin onto the court.
  return fromX + clamp(desiredX - fromX, -maximum, maximum);
}

// Scale a simultaneous lateral adjustment before either partner enters the
// other's clearance circle. Already-close authored geometry may not get worse.
function safePairScale(defenders, positions, targets) {
  const [a, b] = defenders.map(player => player.id);
  const dx = positions[a].x - positions[b].x;
  const dy = positions[a].y - positions[b].y;
  const delta = targets[a].x - positions[a].x - (targets[b].x - positions[b].x);
  const radius = Math.min(2.5, Math.hypot(dx, dy));
  if (Math.abs(dy) >= radius || dx * delta >= 0) return 1;
  const clearanceX = Math.sqrt(Math.max(0, radius * radius - dy * dy));
  return clamp((Math.abs(dx) - clearanceX) / Math.abs(delta), 0, 1);
}

function limitPair(defenders, positions, targets) {
  const scale = safePairScale(defenders, positions, targets);
  return Object.fromEntries(defenders.map(({id}) => [id, {
    x: positions[id].x + (targets[id].x - positions[id].x) * scale,
    y: positions[id].y
  }]));
}

/**
 * Applies a deliberately small lateral doubles-coverage heuristic to compiled
 * step positions. Authored data and timeline facts are read-only inputs.
 */
export function applyCoverageAssistance(play, document, timeline) {
  const clonedPlay = clone(play);
  const settings = readAssistance(document);
  if (!settings.auto && !settings.guides) return { play: clonedPlay, coverage: [] };

  const players = playerRecords(document, clonedPlay);
  const coverage = [];
  const protection = movementProtection(document);
  const steps = clonedPlay.steps || [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const shot = step.shot;
    if (!shot?.from || !Number.isFinite(shot.from.x) || !Number.isFinite(shot.from.y)) continue;
    const hitterId = shot.playerId;
    const hitterTeam = players.get(hitterId)?.team;
    if (!hitterTeam) continue;
    const defendingTeam = hitterTeam === 'green' ? 'orange' : hitterTeam === 'orange' ? 'green' : null;
    if (!defendingTeam || !selectedTeam(settings.team, defendingTeam)) continue;
    const defenders = [...players.values()].filter(player => player.team === defendingTeam && step.positions?.[player.id]);
    if (defenders.length !== 2) continue;

    const threat = { x: shot.from.x, y: shot.from.y };
    const nextReceiverId = steps[index + 1]?.shot?.playerId;
    const protectedIds = new Set([hitterId, nextReceiverId, ...(protection.get(step.id) || [])]);
    const eligible = defenders.filter(player => !protectedIds.has(player.id));
    const ordered = [...defenders].sort((a, b) => step.positions[a.id].x - step.positions[b.id].x);
    // A coincident lateral pair has no observable left/right assignment. Hold
    // rather than introducing an identity-dependent, non-mirrored tie break.
    const distinctLanes = Math.abs(step.positions[ordered[0].id].x - step.positions[ordered[1].id].x) > 1e-9;
    const side = clamp((threat.x - 10) / 10, -1, 1);
    const center = 10 + 3 * side;
    const halfWidth = 5 - side * side;
    const targets = Object.fromEntries(ordered.map((player, slot) => {
      const position = step.positions[player.id];
      const lane = center + (slot ? halfWidth : -halfWidth);
      return [player.id, {
        x: distinctLanes && !protectedIds.has(player.id)
          ? clamp(position.x + (lane - position.x) * .25, COURT_MIN_X, COURT_MAX_X) : position.x,
        y: position.y
      }];
    }));
    const suggested = limitPair(defenders, step.positions, targets);

    const applied = [];
    if (settings.auto) {
      const seconds = legDuration(timeline, step, index);
      const bounded = Object.fromEntries(defenders.map(player => [player.id, {
        x: protectedIds.has(player.id) ? step.positions[player.id].x
          : boundedMoveX(step.positions[player.id].x, suggested[player.id].x, seconds),
        y: step.positions[player.id].y
      }]));
      const safe = limitPair(defenders, step.positions, bounded);
      for (const player of eligible) {
        const position = step.positions[player.id];
        if (Math.abs(position.x - safe[player.id].x) > 1e-9) applied.push(player.id);
        position.x = safe[player.id].x;
        // Coverage assistance is lateral only; depth stays compiler-owned.
      }
    }

    const locked = defenders.map(player => player.id).filter(id => !eligible.some(player => player.id === id));
    let explanation = 'Suggested Coverage: lateral adjustment from the visible opponent contact origin.';
    if (settings.auto && applied.length) explanation += ` Applied to ${applied.join(', ')}.`;
    else if (!settings.auto) explanation += ' Guide only; Auto Shading is off.';
    else explanation += ' No additional lateral movement was needed or permitted.';
    if (locked.length) explanation += ` Preserved ${locked.join(', ')}.`;
    coverage.push({ shotId: step.id, team: defendingTeam, threat, positions: suggested, explanation });
  }
  return { play: clonedPlay, coverage };
}
