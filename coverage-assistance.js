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
  return clamp(fromX + clamp(desiredX - fromX, -maximum, maximum), COURT_MIN_X, COURT_MAX_X);
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
    const nearSideline = threat.x < 10 ? COURT_MIN_X : COURT_MAX_X;
    const nearer = [...defenders].sort((a, b) => {
      const distance = Math.abs(step.positions[a.id].x - threat.x) - Math.abs(step.positions[b.id].x - threat.x);
      return distance || a.id.localeCompare(b.id);
    })[0];
    const partner = defenders.find(player => player.id !== nearer.id);
    const suggested = {
      [nearer.id]: {
        x: clamp(step.positions[nearer.id].x + (nearSideline - step.positions[nearer.id].x) * 0.22, COURT_MIN_X, COURT_MAX_X),
        y: step.positions[nearer.id].y
      },
      [partner.id]: {
        x: clamp(step.positions[partner.id].x + (10 - step.positions[partner.id].x) * 0.32, COURT_MIN_X, COURT_MAX_X),
        y: step.positions[partner.id].y
      }
    };

    const nextReceiverId = steps[index + 1]?.shot?.playerId;
    const protectedIds = new Set([hitterId, nextReceiverId, ...(protection.get(step.id) || [])]);
    const receiverIsDefender = defenders.some(player => player.id === nextReceiverId);
    const coveragePartner = receiverIsDefender
      ? defenders.find(player => player.id !== nextReceiverId)
      : partner;
    const eligible = coveragePartner && !protectedIds.has(coveragePartner.id) ? [coveragePartner] : [];
    const applied = [];
    if (settings.auto) {
      const seconds = legDuration(timeline, step, index);
      for (const player of eligible) {
        const position = step.positions[player.id];
        position.x = boundedMoveX(position.x, suggested[player.id].x, seconds);
        // Coverage assistance is lateral only; depth stays compiler-owned.
        applied.push(player.id);
      }
    }

    const locked = defenders.map(player => player.id).filter(id => !eligible.some(player => player.id === id));
    let explanation = 'Suggested Coverage: lateral adjustment from the visible opponent contact origin.';
    if (settings.auto && applied.length) explanation += ` Applied to ${applied.join(', ')}.`;
    else if (!settings.auto) explanation += ' Guide only; Auto Shading is off.';
    else explanation += ' No movement applied because eligible players are locked or reserved for contact.';
    if (locked.length) explanation += ` Preserved ${locked.join(', ')}.`;
    coverage.push({ shotId: step.id, team: defendingTeam, threat, positions: suggested, explanation });
  }
  return { play: clonedPlay, coverage };
}
