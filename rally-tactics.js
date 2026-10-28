// Read-only tactical projections. Rules live in rally-state/rally-rules;
// all speeds, reaches, responsibilities and preferences here are heuristics.
import { samplePlayState, FEET_TO_METERS } from './three-d-core.js';
import { eligibleHitters, resolveServiceContext, rallyPhase, contactRequiresBounce, teamForPlayer, oppositeTeam } from './rally-state.js';

export const REACH_MODEL = Object.freeze({ speedFeetPerSecond: 14, reactionSeconds: .12, paddleReachFeet: 3, recoverySpeedFeetPerSecond: 9 });
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const copy = value => structuredClone(value);
const unit = (from, to, fallback) => {
  const length = distance(from, to);
  return length > 1e-8 ? { x: (to.x - from.x) / length, y: (to.y - from.y) / length } : { ...fallback };
};
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

export function assessReach(position, contact, seconds, model = REACH_MODEL) {
  const availableSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const distanceFeet = distance(position, contact);
  const travelSeconds = Math.max(0, availableSeconds - model.reactionSeconds);
  const radiusFeet = model.paddleReachFeet + travelSeconds * model.speedFeetPerSecond;
  return Object.freeze({ model: 'illustrative-reach-v1', availableSeconds, distanceFeet, radiusFeet, reachable: distanceFeet <= radiusFeet + 1e-9 });
}

/** Rank already-eligible players. No tactical score can override service identity. */
export function rankContactCandidates({ eligible, positions, contact, players, availableSeconds = 1 }) {
  return eligible.map(id => {
    const position = positions[id], team = teamForPlayer(id, players);
    const partner = Object.keys(players).find(other => other !== id && teamForPlayer(other, players) === team);
    const partnerPosition = positions[partner];
    const reach = assessReach(position, contact, availableSeconds);
    const crossesPartner = partnerPosition && (contact.x - partnerPosition.x) * (position.x - partnerPosition.x) < 0;
    const crowded = partnerPosition && distance(partnerPosition, contact) < 2.5;
    const forehandDirection = (team === 'green' ? 1 : -1) * (players[id].handedness === 'left' ? -1 : 1);
    const forehand = (contact.x - position.x) * forehandDirection >= 0;
    const score = reach.distanceFeet / Math.max(1, reach.radiusFeet) + (reach.reachable ? 0 : 10) + (crossesPartner ? .35 : 0) + (crowded ? .5 : 0) - (forehand ? .05 : 0);
    return { id, score, reach, reasons: [reach.reachable ? 'within-illustrative-reach' : 'outside-illustrative-reach', ...(crossesPartner ? ['partner-lane-crossing'] : []), ...(crowded ? ['partner-spacing'] : []), ...(forehand ? ['forehand-tiebreak'] : [])] };
  }).sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
}

/** Bounded pair recovery. The original half assignment survives a brief poach. */
export function tacticalRecovery(positions, { players, hitter, family, target, seconds, index, opening = 'serve', servingTeam = 'green', protectedIds = new Set(), homePositions = positions }) {
  const result = copy(positions), ids = Object.keys(players);
  const hittingTeam = teamForPlayer(hitter, players);
  const soft = ['drop', 'dink', 'reset'].includes(family);
  const leftPlayers = new Map();
  for (const team of new Set(ids.map(id => teamForPlayer(id, players)))) {
    const pair = ids.filter(id => teamForPlayer(id, players) === team && positions[id]);
    if (pair.length !== 2) continue;
    pair.sort((a, b) => homePositions[a].x - homePositions[b].x || a.localeCompare(b));
    // Resolve the pair together: a substantial crossover switches both roles.
    // A small poach keeps home responsibility. Independent per-player flips
    // could assign both partners the same lane.
    leftPlayers.set(team, positions[pair[0]].x > positions[pair[1]].x + 2.5 ? pair[1] : pair[0]);
  }
  for (const id of ids) {
    if (!positions[id] || protectedIds.has(id)) continue;
    const team = teamForPlayer(id, players), near = team === 'green';
    const partner = ids.find(other => other !== id && teamForPlayer(other, players) === team);
    if (!partner || !positions[partner]) continue;
    const left = leftPlayers.get(team) === id;
    const defending = team !== hittingTeam;
    const shift = clamp((target.x - 10) * (defending ? .28 : .18), -2, 2);
    const halfWidth = Math.abs(target.x - 10) < 3 ? 4 : 5;
    const x = clamp(10 + (left ? -halfWidth : halfWidth) + shift, 2, 18);
    const servingWait = opening === 'serve' && index < 2 && team === servingTeam;
    const approach = team === hittingTeam && (family === 'return' || ((soft || family === 'volley') && seconds >= .12));
    const defendLob = defending && family === 'lob';
    const y = servingWait ? positions[id].y : defendLob ? (near ? clamp(target.y + 4, 5, 12) : clamp(target.y - 4, 32, 39)) : approach ? (near ? 14 : 30) : positions[id].y;
    const from = positions[id], length = distance(from, { x, y });
    const fraction = length ? Math.min(1, Math.max(0, seconds) * REACH_MODEL.recoverySpeedFeetPerSecond / length) : 0;
    result[id] = { x: from.x + (x - from.x) * fraction, y: from.y + (y - from.y) * fraction };
    if (protectedIds.has(partner)) {
      // Stop before the protected partner's space, including along the route.
      // A pin never grants permission to move the pinned player out of the way.
      const pin = positions[partner], dx = result[id].x - from.x, dy = result[id].y - from.y;
      const rx = from.x - pin.x, ry = from.y - pin.y;
      const a = dx * dx + dy * dy, b = 2 * (rx * dx + ry * dy), c = rx * rx + ry * ry - 2.5 ** 2;
      const discriminant = b * b - 4 * a * c;
      if (c < 0) result[id] = { ...from };
      else if (a > 1e-12 && discriminant >= 0) {
        const entry = (-b - Math.sqrt(discriminant)) / (2 * a);
        if (entry >= 0 && entry < 1) {
          const safe = Math.max(0, entry - 1e-7);
          result[id] = { x: from.x + dx * safe, y: from.y + dy * safe };
        }
      }
    }
  }
  return result;
}

/**
 * Camera-independent feet-space API for every renderer. positions is an
 * optional sampled actor-position map in board feet, for renderers whose
 * contact plants differ from logical timeline interpolation. It is read-only.
 * Facing is tracking intent, not a command to overwrite stroke/torso poses.
 */
export function createTacticalSnapshot({ play, timeline, elapsed = 0, players = play?.players, positions: sampledPositions } = {}) {
  if (!play || !timeline || !Number.isFinite(elapsed)) throw new TypeError('A Play, compiled timeline and finite elapsed time are required.');
  const sampled = samplePlayState(timeline, elapsed), segment = sampled.segment;
  const records = players ?? Object.fromEntries(Object.keys(sampled.positions).filter(id => id !== 'ball').map(id => [id, { team: teamForPlayer(id), handedness: 'right' }]));
  const positions = sampledPositions ?? sampled.positions;
  const service = resolveServiceContext(play);
  const opening = play.rally?.openingBouncesSatisfied ? 'midrally' : 'serve';
  const shotIndex = segment?.rallyLeg ? segment.rallyLeg - 1 : 0;
  const inPreparation = !sampled.ball.launched;
  const receivingIndex = inPreparation ? shotIndex : shotIndex + 1;
  const currentHitter = segment?.shotSemantics?.playerId ?? service.server;
  const authoredReceiver = inPreparation ? currentHitter : segment?.nextShotSemantics?.playerId ?? null;
  const eligible = inPreparation && (opening === 'midrally' || shotIndex > 0) ? (currentHitter ? [currentHitter] : []) : eligibleHitters({ players: records, service, contactIndex: receivingIndex, opening, previousHitter: inPreparation ? null : currentHitter });
  const nextContact = inPreparation ? segment?.shotSemantics?.contact.point ?? sampled.ball.board : segment?.nextShotSemantics?.contact.point ?? segment?.step.shot?.to ?? sampled.ball.board;
  const contactTime = inPreparation ? (segment?.startTime ?? 0) + (segment?.contactTime ?? 0) : segment?.endTime;
  const seconds = Math.max(0, (contactTime ?? sampled.time) - sampled.time);
  const ranking = rankContactCandidates({ eligible, positions, contact: nextContact, players: records, availableSeconds: seconds });
  if (authoredReceiver && eligible.includes(authoredReceiver)) {
    ranking.sort((a, b) => Number(b.id === authoredReceiver) - Number(a.id === authoredReceiver) || a.score - b.score);
    ranking[0].reasons.push('authored-next-contact');
  }
  const incomingBounced = timeline.events.some(event => event.type === 'bounce' && event.rallyLeg === segment?.rallyLeg && event.time <= sampled.time);
  const terminal = sampled.time >= timeline.duration && timeline.duration > 0;
  const activeTeam = inPreparation ? teamForPlayer(currentHitter, records) : oppositeTeam(teamForPlayer(currentHitter, records));
  const ball = { x: sampled.ball.board.x, y: sampled.ball.board.y, heightFeet: sampled.ball.y / FEET_TO_METERS, phase: sampled.ball.phase };
  const actors = Object.fromEntries(Object.entries(records).filter(([id]) => positions[id]).map(([id, player]) => {
    const position = { x: positions[id].x, y: positions[id].y };
    const facing = unit(position, ball, { x: 0, y: player.team === 'green' ? 1 : -1 });
    const ranked = ranking.find(item => item.id === id);
    return [id, { id, team: player.team, handedness: player.handedness ?? 'right', position, facing,
      trackingTarget: { x: ball.x, y: ball.y, heightFeet: ball.heightFeet },
      responsibility: terminal ? 'complete' : id === service.receiver && receivingIndex === 1 && opening === 'serve' ? 'designated-returner' : ranked && ranking[0]?.id === id ? 'primary' : player.team === activeTeam ? 'support' : 'recover',
      eligible: !terminal && eligible.includes(id), coveragePriority: ranked ? ranking.indexOf(ranked) + 1 : null,
      reach: ranked?.reach ?? null, reasons: ranked?.reasons ?? [] }];
  }));
  return freeze({ version: 1, coordinateSystem: 'board-feet', court: { width: 20, length: 44, netY: 22, kitchenDepth: 7 },
    time: sampled.time, shotId: segment?.step.id ?? null, phase: terminal ? 'complete' : rallyPhase(receivingIndex, opening),
    ball, players: actors, service: { ...service }, designatedReceiver: service.receiver, authoredReceiver,
    legalReceiver: !terminal && opening === 'serve' && receivingIndex === 1 ? service.receiver : null,
    eligibleHitters: terminal ? [] : [...eligible], mustBounceBeforeContact: !terminal && contactRequiresBounce(receivingIndex, opening) && !incomingBounced,
    explanation: 'Responsibilities and reach are illustrative tactical guidance; declared service roles and timeline bounce facts determine opening eligibility.' });
}
