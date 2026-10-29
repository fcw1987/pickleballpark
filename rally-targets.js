// Nominal policy targets and flights. This module uses supplied stream draws;
// trajectory construction belongs exclusively to the shared versioned solver.
import { isOnCourt } from './court-geometry.js';
import { receivingServiceBox, SERVICE_COURT_CONVENTION, teamForPlayer } from './rally-state.js';
import { PHYSICS_V2 } from './play-physics-v2.js';
import { planRallyFlightV1 } from './rally-flight-planner.js';

export const TARGETS_VERSION = 'rally-targets-v2';
export const CLEARANCE_PRIORS_V1 = Object.freeze({
  serve: 1.2, return: 1.2, drive: .7, drop: .6, reset: .6, dink: .35, volley: .5
});
export const OVERHEAD_LAUNCH_PRIORS_V1 = Object.freeze([-24, -18, -12, -8, -4, 0]);
const REGIONS = new Set(['deep-middle', 'deep-backhand', 'short-angle', 'short-middle', 'kitchen-cross',
  'kitchen-middle', 'kitchen-straight', 'kitchen-backhand', 'deep-feet', 'transition-feet', 'hip-middle', 'open-court', 'deep-overhead']);
const EPS = 1e-7;
const clamp = (number, low, high) => Math.max(low, Math.min(high, number));
const unit = (value, name) => {
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new TypeError(`${name} must be a supplied unit draw in [0,1).`);
  return value;
};
const point = (value, name, height = false) => {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || height && !Number.isFinite(value.heightFeet)) throw new TypeError(`${name} requires finite board coordinates${height ? ' and height' : ''}.`);
  return { x: value.x, y: value.y, ...(height ? { heightFeet: value.heightFeet } : {}) };
};
const assertTeam = team => {
  if (!['green', 'orange'].includes(team)) throw new TypeError('An explicit hitting team is required.');
  return team;
};
const opponentY = (team, baselineDepth) => team === 'green' ? 44 - baselineDepth : baselineDepth;
const jitter = (center, width, draw, minX, maxX) => {
  const half = Math.min(width, maxX - minX) / 2;
  return clamp(center, minX + half, maxX - half) + (draw - .5) * 2 * half;
};
const nominalSignature = candidate => ['erne', 'around-the-post'].includes(candidate?.intent);
const assertNominal = candidate => {
  if (!candidate || candidate.addsContact === false || !candidate.family) throw new TypeError('A paddle-contact candidate is required.');
  if (nominalSignature(candidate)) throw new RangeError('Signature shots require an explicit planned contact and flight; nominal helpers do not invent them.');
};

function opponents(situation, players, team) {
  return Object.keys(players || {}).sort().filter(id => teamForPlayer(id, players) !== team).map(id => {
    const record = players[id];
    if (!['green', 'orange'].includes(record.team) || !['left', 'right'].includes(record.handedness)) throw new TypeError('Target players require explicit team and handedness.');
    return { id, team: record.team, handedness: record.handedness, position: point(situation.positions?.[id], `positions.${id}`) };
  });
}
function defenderNear(records, lateral) {
  if (!records.length) throw new TypeError('A represented opponent is required.');
  return [...records].sort((a, b) => Math.abs(a.position.x - lateral) - Math.abs(b.position.x - lateral) || a.id.localeCompare(b.id))[0];
}
function behindDefenderDepth(defender, offsetFeet) {
  const depth = defender.team === 'green' ? defender.position.y : 44 - defender.position.y;
  // Behind means toward that defender's baseline. Near a court boundary the
  // in-court landing limit wins; a nominal target never invents an out ball.
  return clamp(depth - offsetFeet, .8, 21.2);
}
function backhandTarget(record, draw, minX, maxX) {
  const forehandDirection = (record.team === 'green' ? -1 : 1) * (record.handedness === 'left' ? -1 : 1);
  const direction = -forehandDirection;
  const space = direction > 0 ? maxX - record.position.x : record.position.x - minX;
  if (space <= EPS) throw new RangeError('The intended backhand has no interior legal target space.');
  const far = Math.min(3.5, space * .9), near = Math.min(1.5, far * .5);
  return record.position.x + direction * (near + draw * (far - near));
}
function openLane(records, draw) {
  const occupied = records.map(record => clamp(record.position.x, .8, 19.2)).sort((a, b) => a - b);
  const limits = [.8, ...occupied, 19.2];
  const gaps = limits.slice(1).map((right, index) => ({ left: limits[index], right, width: right - limits[index] }))
    .sort((a, b) => b.width - a.width || a.left - b.left);
  const gap = gaps[0];
  return gap.left + gap.width * (.2 + .6 * draw);
}

/** Continuous jittered targets; service roles come from the declared recipe. */
export function resolveTargetV1({ candidate, situation, players, draws }) {
  assertNominal(candidate);
  if (!REGIONS.has(candidate.targetRegion)) throw new TypeError('Unsupported nominal target region.');
  const lateral = unit(draws?.lateral, 'lateral'), depth = unit(draws?.depth, 'depth');
  const contact = point(situation?.contact, 'contact'), team = assertTeam(situation.hittingTeam);
  const records = opponents(situation, players, team), oppositeLane = clamp(20 - contact.x, .8, 19.2);
  let minX = .8, maxX = 19.2, serviceReceiver = null;
  if (candidate.family === 'serve') {
    const service = situation.service;
    if (!service || service.courtConvention !== SERVICE_COURT_CONVENTION || !['right', 'left'].includes(service.court)
      || !players?.[service.server] || !players?.[service.receiver]
      || teamForPlayer(service.server, players) !== team || teamForPlayer(service.receiver, players) === team
      || situation.hitter !== undefined && situation.hitter !== service.server) throw new TypeError('Serve targets require explicit server-perspective service roles.');
    const box = receivingServiceBox({ ...service, servingTeam: team }, contact);
    minX = box.minX + .5; maxX = box.maxX - .5;
    serviceReceiver = records.find(record => record.id === service.receiver);
  }
  const region = candidate.targetRegion;
  let x, baselineDepth;
  if (region === 'deep-middle') {
    x = candidate.family === 'serve' ? jitter(minX >= 10 ? minX + 1.5 : maxX - 1.5, 3, lateral, minX, maxX)
      : jitter(10, 4, lateral, minX, maxX);
    baselineDepth = 3 + depth * 3;
  } else if (region === 'deep-backhand' || region === 'kitchen-backhand') {
    x = backhandTarget(serviceReceiver ?? defenderNear(records, oppositeLane), lateral, minX, maxX);
    baselineDepth = region === 'deep-backhand' ? 3 + depth * 3 : 16.5 + depth * 1.5;
  } else if (region === 'short-angle') {
    // A short serve still lands beyond the NVZ line, inside its diagonal box.
    const outside = minX >= 10 ? maxX - 1.25 : maxX <= 10 ? minX + 1.25 : contact.x < 10 ? maxX - 1.25 : minX + 1.25;
    x = jitter(outside, 2.5, lateral, minX, maxX);
    baselineDepth = 11.5 + depth * 2;
  } else if (region === 'short-middle') {
    x = jitter(10, 5, lateral, minX, maxX); baselineDepth = 10 + depth * 3;
  } else if (region.startsWith('kitchen-')) {
    x = region === 'kitchen-middle' ? jitter(10, 4, lateral, minX, maxX)
      : jitter(region === 'kitchen-straight' ? contact.x : oppositeLane, 3, lateral, minX, maxX);
    baselineDepth = 16.5 + depth * 1.5;
  } else if (region === 'transition-feet') {
    // A block takes pace off the incoming drive and sends it toward the
    // approaching pair's feet. It is not automatically a perfect short drop.
    const defender = defenderNear(records, oppositeLane);
    x = jitter(defender.position.x, 3.5, lateral, minX, maxX);
    const ownDepth = defender.team === 'green' ? defender.position.y : 44 - defender.position.y;
    baselineDepth = clamp(ownDepth + 1 + depth * 2, 6, 13);
  } else if (region === 'deep-feet') {
    const defender = defenderNear(records, oppositeLane);
    x = jitter(defender.position.x, 3.5, lateral, minX, maxX);
    baselineDepth = behindDefenderDepth(defender, .5 + depth * 1.5);
  } else if (region === 'hip-middle') {
    const defender = defenderNear(records, oppositeLane);
    x = jitter(defender.position.x, 2, lateral, minX, maxX);
    // A body-directed lane needs a ground landing beyond the represented
    // player. The shared flight decides its height at that player's plane.
    baselineDepth = behindDefenderDepth(defender, 5 + depth * 2);
  } else if (region === 'open-court') {
    x = openLane(records, lateral);
    // The open lane already follows the represented defender gaps. It has no
    // named defender for a feet/body offset; depth follows contact geometry.
    // Higher contacts can attack a shorter open landing without imposing an
    // impossible low net crossing on a long high-origin ballistic chord.
    baselineDepth = candidate.family === 'overhead' ? 10 + depth * 5
      : situation.contact.heightFeet >= 4.5 ? 14 + depth * 3 : 3 + depth * 5;
  } else { // deep-overhead
    x = jitter(oppositeLane, 5, lateral, minX, maxX); baselineDepth = 3 + depth * 2;
  }
  const target = { x: clamp(x, minX, maxX), y: opponentY(team, baselineDepth) };
  if (!isOnCourt(target) || (team === 'green' ? target.y <= 22 : target.y >= 22)) throw new RangeError('The nominal target must land in the opponent court.');
  return Object.freeze(target);
}

/** Choose a bounded coherent flight. Section 7 values are preferences; the
 * shared planner jointly chooses time, speed and vertical shape. */
export function resolveFlightParametersV1({ candidate, contact, target, team, quality = 'neutral', style = 'advanced', route = 'over-net', materialization = 'all' }) {
  assertNominal(candidate); assertTeam(team);
  if (candidate.physics !== undefined) throw new TypeError('Choose nominal policy physics or an explicit planned flight, not both.');
  const from = point(contact, 'contact', true), landing = point(target, 'target');
  if (!['low', 'neutral', 'attackable', 'excellent', 'error'].includes(quality)) throw new TypeError('Unsupported execution quality.');
  const ownContact = team === 'green' ? from.y + PHYSICS_V2.ballRadiusFeet <= 22 + EPS : from.y - PHYSICS_V2.ballRadiusFeet >= 22 - EPS;
  const opponentLanding = isOnCourt(landing) && (team === 'green' ? landing.y > 22 : landing.y < 22);
  if (!ownContact || !opponentLanding) throw new RangeError('A nominal flight needs a whole-ball own-side contact and opponent landing.');
  const preferred = candidate.family === 'lob' ? { apexFeet: 18 }
    : candidate.family === 'overhead' ? { launchVerticalFeetPerSecond: -18, speedMph: 40 }
      : CLEARANCE_PRIORS_V1[candidate.family] === undefined ? {} : { clearanceFeet: CLEARANCE_PRIORS_V1[candidate.family] };
  const planner = planRallyFlightV1({ from, target: landing, family: candidate.family, intent: candidate.intent ?? null,
    pace: candidate.pace ?? 'medium', arc: candidate.arc ?? 'medium', quality, style, preferred, route, materialization });
  if (planner.status !== 'solved') {
    const error = new RangeError(`Nominal flight unavailable: ${planner.diagnostics.reason}`);
    error.plannerDiagnostics = planner.diagnostics;
    throw error;
  }
  const { physics, flight } = planner, clearanceInches = flight.metadata.netClearanceInches;
  const attacking = flight.launchSpeedMph >= 22 - EPS && Number.isFinite(clearanceInches)
    && clearanceInches >= -EPS && clearanceInches <= 16 + EPS && !flight.obstruction && opponentLanding;
  return Object.freeze({ version: TARGETS_VERSION, physics, flight, attacking,
    reason: attacking ? 'solved-pace-and-clearance' : flight.launchSpeedMph < 22 ? 'solved-flight-below-attack-pace' : 'solved-flight-clearance-outside-attack-band',
    guidance: Object.freeze({ version: planner.plannerVersion, ...planner.evidence, diagnostics: planner.diagnostics }),
    solutions: planner.solutions, planner });
}
