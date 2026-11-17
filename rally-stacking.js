// Opt-in doubles side preferences. Stacking is tactical source, never a new
// service identity, score inference, legality exemption or movement override.
import { effectiveServiceCourt, teamForPlayer } from './rally-state.js';

export const STACKING_VERSION = 'stacking-v1';
export const STACKING_MODES = Object.freeze(['serve-only', 'full']);
const IDS = Object.freeze(['player1', 'player2', 'player3', 'player4']);
const TEAMS = Object.freeze(['green', 'orange']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fail = (path, message) => { throw new TypeError(`${path} ${message}`); };
const xy = point => ({ x: point.x, y: point.y });
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

function object(value, path, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'must be a plain object.');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail(path, 'contains an unsupported field.');
    if (!own(Object.getOwnPropertyDescriptor(value, key), 'value')) fail(`${path}.${key}`, 'must not be an accessor.');
  }
  for (const key of required) if (!own(value, key)) fail(`${path}.${key}`, 'is required.');
  return value;
}

function teamPair(players, team) {
  const pair = IDS.filter(id => players?.[id]?.team === team);
  if (pair.length !== 2) fail('stacking', `requires exactly two represented ${team} players.`);
  return pair;
}

/** Validation is read-only and does not add defaults to a saved document. */
export function validateStackingV1(value, players) {
  if (value === undefined) return value;
  object(value, 'stacking', ['version', 'teams']);
  if (value.version !== STACKING_VERSION) fail('stacking.version', `must be ${STACKING_VERSION}.`);
  object(value.teams, 'stacking.teams', TEAMS, []);
  if (!Object.keys(value.teams).length) fail('stacking.teams', 'must contain at least one enabled team; omit stacking to turn it off.');
  for (const team of TEAMS) {
    if (!own(value.teams, team)) continue;
    const config = object(value.teams[team], `stacking.teams.${team}`, ['mode', 'leftPlayer']);
    if (!STACKING_MODES.includes(config.mode)) fail(`stacking.teams.${team}.mode`, 'must be serve-only or full.');
    if (!teamPair(players, team).includes(config.leftPlayer)) fail(`stacking.teams.${team}.leftPlayer`, 'must name a player on that team.');
  }
  return value;
}

/** A detached, stable field order for generator input, not a saved-play migration. */
export function normalizeStackingV1(value, players) {
  validateStackingV1(value, players);
  if (value === undefined) return undefined;
  return freeze({ version: STACKING_VERSION, teams: Object.fromEntries(TEAMS.filter(team => own(value.teams, team))
    .map(team => [team, { mode: value.teams[team].mode, leftPlayer: value.teams[team].leftPlayer }])) });
}

/** Left/right are always the players' view facing the net. Green's left is
 * high board X; orange's left is low board X. Hands never choose these roles. */
export function stackingTeamPlanV1({ stacking, players, team, service = {}, opening = 'serve', index = 0 } = {}) {
  validateStackingV1(stacking, players);
  if (!TEAMS.includes(team)) fail('stacking team', 'must be green or orange.');
  if (!['serve', 'midrally'].includes(opening)) fail('stacking opening', 'must be serve or midrally.');
  if (!Number.isInteger(index) || index < 0 || index > 98) fail('stacking contact index', 'must be an integer from 0 to 98.');
  const config = stacking?.teams?.[team];
  if (!config) return null;
  // A midrally start has no known service rotation. Do not infer one from
  // current positions, the first hitter, a score or the recorded left player.
  const knownRoles = IDS.includes(service.server) && IDS.includes(service.receiver)
    && teamForPlayer(service.server, players) !== teamForPlayer(service.receiver, players);
  const servingTeam = opening === 'serve' && knownRoles ? teamForPlayer(service.server, players) : null;
  if (config.mode === 'serve-only' && servingTeam !== team) return null;
  const pair = teamPair(players, team), leftPlayer = config.leftPlayer;
  const rightPlayer = pair.find(id => id !== leftPlayer);
  const lanes = team === 'green' ? [rightPlayer, leftPlayer] : [leftPlayer, rightPlayer];
  const returningTeam = opening === 'serve' && servingTeam && team !== servingTeam;
  const phase = opening === 'midrally' ? 'preferred-sides'
    : !servingTeam ? 'unknown-service'
      : returningTeam && index === 0 ? 'waiting-for-return'
        : team === servingTeam && index < 2 ? 'serve-unwind'
          : returningTeam && index === 1 ? 'return-unwind' : 'preferred-sides';
  return freeze({ version: STACKING_VERSION, team, mode: config.mode, leftPlayer, rightPlayer, lanes, phase,
    usePreferredLanes: !['waiting-for-return', 'unknown-service'].includes(phase),
    holdOpeningFormation: phase === 'waiting-for-return',
    protectOpeningDepth: phase === 'serve-unwind' });
}

/** Used only while creating an OMITTED generated layout. Existing layouts,
 * even unconventional or invalid ones, must never be passed here to fix them.
 * Standard return stacking enters from outside the receiving-side sideline;
 * it does not cross two baseline partners through one another. */
export function createDefaultStackingLayoutV1({ layout, players, service, stacking } = {}) {
  validateStackingV1(stacking, players);
  const result = Object.fromEntries([...IDS, 'ball'].map(id => {
    const point = layout?.[id];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.x < -8 || point.x > 28 || point.y < -8 || point.y > 52) fail(`layout.${id}`, 'must be a finite point in the supported apron.');
    return [id, xy(point)];
  }));
  if (stacking === undefined) return freeze(result);
  if (!IDS.includes(service?.server) || !IDS.includes(service?.receiver)
    || players[service.server]?.team === players[service.receiver]?.team
    || !['right', 'left'].includes(service?.court)) fail('stacking service', 'requires the declared server, opposing receiver and serving court.');
  const servingTeam = players[service.server].team, court = effectiveServiceCourt(service);
  for (const team of TEAMS) {
    const plan = stackingTeamPlanV1({ stacking, players, team, service, index: 0 });
    if (!plan) continue;
    const serving = team === servingTeam, actor = serving ? service.server : service.receiver;
    const preferredCourt = plan.leftPlayer === actor ? 'left' : 'right';
    if (preferredCourt === court) continue;
    const partner = teamPair(players, team).find(id => id !== actor), point = result[actor];
    if (serving) {
      // Both players remain deep. Only the server is constrained to their
      // serving area; the partner may stand in the court apron.
      result[partner] = { x: point.x + (point.x < 10 ? -4 : 4), y: point.y };
    } else {
      result[partner] = { x: point.x < 10 ? -1.25 : 21.25, y: team === 'green' ? 14.25 : 29.75 };
    }
    if (result[partner].x < -8 || result[partner].x > 28) fail('stacking default layout', 'cannot place the partner inside the supported apron.');
  }
  return freeze(result);
}
