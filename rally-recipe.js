// Serializable origin of an engine point. This module never regenerates a
// document: authored edits remain independent of their recorded provenance.
import { SERVICE_COURT_CONVENTION } from './rally-state.js';

export const RALLY_ENGINE_VERSION = 'rally-engine-v1';
export const RALLY_POLICY_VERSION = 'rally-policy-v3';
export const RALLY_FLIGHT_PLANNER_VERSION = 'rally-flight-planner-v2';
export const RALLY_PHYSICS_VERSION = 'play-physics-v2';
export const RALLY_STYLE_IDS = Object.freeze(['pro', 'advanced', 'intermediate', 'beginner']);
export const RALLY_FLAVOUR_IDS = Object.freeze(['balanced', 'bangers', 'kitchen-masters', 'lobbers']);
export const RALLY_PLAYER_IDS = Object.freeze(['player1', 'player2', 'player3', 'player4']);
export const RALLY_DEFAULT_OPTIONS = Object.freeze({ lengthFeel: 'natural', winner: 'either', signatureShots: true, maxShots: 99 });
const TEAMS = ['green', 'orange'];
const INPUT_KEYS = ['players', 'layout', 'service', 'seed', 'options', 'signal', 'onProgress'];
const fail = (path, text) => { throw new TypeError(`${path} ${text}`); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function object(value, path, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'must be a plain object.');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail(path, 'contains an unsupported field.');
    if (!Object.getOwnPropertyDescriptor(value, key).hasOwnProperty('value')) fail(`${path}.${key}`, 'must not be an accessor.');
  }
  return value;
}
function required(value, keys, path) {
  for (const key of keys) if (!own(value, key)) fail(`${path}.${key}`, 'is required.');
}
function choice(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `must be one of: ${allowed.join(', ')}.`);
  return value;
}
function integer(value, low, high, path) {
  if (!Number.isInteger(value) || value < low || value > high) fail(path, `must be an integer from ${low} to ${high}.`);
  return value === 0 ? 0 : value;
}
function point(value, path) {
  object(value, path, ['x', 'y']); required(value, ['x', 'y'], path);
  for (const [axis, low, high] of [['x', -8, 28], ['y', -8, 52]]) if (!Number.isFinite(value[axis]) || value[axis] < low || value[axis] > high) fail(`${path}.${axis}`, `must be finite from ${low} to ${high} feet.`);
  return { x: value.x === 0 ? 0 : value.x, y: value.y === 0 ? 0 : value.y };
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function normalizePlayers(value) {
  if (value === undefined) value = Object.fromEntries(RALLY_PLAYER_IDS.map((id, index) => [id, { team: index < 2 ? 'green' : 'orange', handedness: 'right', style: 'advanced', flavour: 'balanced' }]));
  object(value, 'players', RALLY_PLAYER_IDS); required(value, RALLY_PLAYER_IDS, 'players');
  return Object.fromEntries(RALLY_PLAYER_IDS.map((id, index) => {
    const item = value[id], path = `players.${id}`;
    object(item, path, ['team', 'handedness', 'style', 'flavour']); required(item, ['team', 'handedness', 'style'], path);
    const team = choice(item.team, [index < 2 ? 'green' : 'orange'], `${path}.team`);
    return [id, { team, handedness: choice(item.handedness, ['right', 'left'], `${path}.handedness`),
      style: choice(item.style, RALLY_STYLE_IDS, `${path}.style`), flavour: choice(item.flavour === undefined ? 'balanced' : item.flavour, RALLY_FLAVOUR_IDS, `${path}.flavour`) }];
  }));
}
function normalizeService(value, players) {
  if (value === undefined) value = { server: 'player1', receiver: 'player3', court: 'right' };
  object(value, 'service', ['server', 'receiver', 'court', 'courtConvention', 'correctPositionsAtScoreCall']);
  required(value, ['server', 'receiver'], 'service');
  const server = choice(value.server, RALLY_PLAYER_IDS, 'service.server');
  const receiver = choice(value.receiver, RALLY_PLAYER_IDS, 'service.receiver');
  if (players[server].team === players[receiver].team) fail('service.receiver', 'must belong to the receiving team.');
  const result = { server, receiver, court: choice(value.court === undefined ? 'right' : value.court, ['right', 'left'], 'service.court'),
    courtConvention: choice(value.courtConvention === undefined ? SERVICE_COURT_CONVENTION : value.courtConvention, [SERVICE_COURT_CONVENTION], 'service.courtConvention') };
  if (value.correctPositionsAtScoreCall !== undefined) {
    if (typeof value.correctPositionsAtScoreCall !== 'boolean') fail('service.correctPositionsAtScoreCall', 'must be boolean.');
    result.correctPositionsAtScoreCall = value.correctPositionsAtScoreCall;
  }
  return result;
}
function defaultLayout(players, service) {
  const team = players[service.server].team, near = team === 'green';
  const serverX = near === (service.court === 'right') ? 5 : 15;
  const partner = RALLY_PLAYER_IDS.find(id => id !== service.server && players[id].team === team);
  const receiverPartner = RALLY_PLAYER_IDS.find(id => id !== service.receiver && players[id].team !== team);
  const positions = {
    [service.server]: { x: serverX, y: near ? -1 : 45 },
    [partner]: { x: 20 - serverX, y: near ? -1 : 45 },
    [service.receiver]: { x: 20 - serverX, y: near ? 42 : 2 },
    [receiverPartner]: { x: serverX, y: near ? 30 : 14 }
  };
  const handSign = (near ? -1 : 1) * (players[service.server].handedness === 'right' ? 1 : -1);
  return { ...Object.fromEntries(RALLY_PLAYER_IDS.map(id => [id, positions[id]])), ball: { x: serverX + handSign * .8, y: near ? 0 : 44 } };
}
function normalizeLayout(value, players, service) {
  if (value === undefined) value = defaultLayout(players, service);
  object(value, 'layout', [...RALLY_PLAYER_IDS, 'ball']); required(value, [...RALLY_PLAYER_IDS, 'ball'], 'layout');
  return Object.fromEntries([...RALLY_PLAYER_IDS, 'ball'].map(id => [id, point(value[id], `layout.${id}`)]));
}
function normalizeOptions(value) {
  if (value === undefined) value = {};
  object(value, 'options', Object.keys(RALLY_DEFAULT_OPTIONS));
  const signatureShots = own(value, 'signatureShots') ? value.signatureShots : true;
  if (typeof signatureShots !== 'boolean') fail('options.signatureShots', 'must be boolean.');
  return { lengthFeel: choice(value.lengthFeel === undefined ? 'natural' : value.lengthFeel, ['natural', 'short', 'long', 'epic'], 'options.lengthFeel'),
    winner: choice(value.winner === undefined ? 'either' : value.winner, ['either', ...TEAMS], 'options.winner'), signatureShots,
    maxShots: integer(value.maxShots === undefined ? 99 : value.maxShots, 1, 99, 'options.maxShots') };
}

/** Normalize values only; callback and AbortSignal validation belongs to the driver. */
export function normalizeRallyInputV1(value) {
  object(value, 'rally input', INPUT_KEYS);
  const seed = integer(value.seed, 0, 0xffffffff, 'seed');
  const players = normalizePlayers(value.players), service = normalizeService(value.service, players);
  return freeze({ players, layout: normalizeLayout(value.layout, players, service), service, seed, options: normalizeOptions(value.options) });
}

/** Strict persisted model2 origin. Returned input is never applied to edited shots. */
export function validateGenerationRecipeV1(value) {
  object(value, 'generation', ['mode', 'generatorVersion', 'policyVersion', 'flightPlannerVersion', 'physicsVersion', 'seed', 'input', 'selection']);
  required(value, ['mode', 'generatorVersion', 'policyVersion', 'physicsVersion', 'seed', 'input', 'selection'], 'generation');
  choice(value.mode, ['engine'], 'generation.mode');
  choice(value.generatorVersion, [RALLY_ENGINE_VERSION], 'generation.generatorVersion');
  choice(value.policyVersion, ['rally-policy-v1', 'rally-policy-v2', RALLY_POLICY_VERSION], 'generation.policyVersion');
  if (value.policyVersion !== 'rally-policy-v1') {
    required(value, ['flightPlannerVersion'], 'generation');
    choice(value.flightPlannerVersion, value.policyVersion === 'rally-policy-v2'
      ? ['rally-flight-planner-v1', RALLY_FLIGHT_PLANNER_VERSION] : [RALLY_FLIGHT_PLANNER_VERSION], 'generation.flightPlannerVersion');
  } else if (own(value, 'flightPlannerVersion')) fail('generation.flightPlannerVersion', 'is unsupported for rally-policy-v1.');
  choice(value.physicsVersion, [RALLY_PHYSICS_VERSION], 'generation.physicsVersion');
  const seed = integer(value.seed, 0, 0xffffffff, 'generation.seed');
  object(value.input, 'generation.input', ['players', 'layout', 'service', 'options']);
  required(value.input, ['players', 'layout', 'service', 'options'], 'generation.input');
  const normalized = normalizeRallyInputV1({ ...value.input, seed });
  const normalizedInput = { players: normalized.players, layout: normalized.layout, service: normalized.service, options: normalized.options };
  if (canonical(value.input) !== canonical(normalizedInput)) fail('generation.input', 'must record all normalized settings explicitly.');
  object(value.selection, 'generation.selection', ['attempts', 'selectedAttempt', 'selectedSeed']);
  required(value.selection, ['attempts', 'selectedAttempt', 'selectedSeed'], 'generation.selection');
  const attempts = integer(value.selection.attempts, 1, 64, 'generation.selection.attempts');
  integer(value.selection.selectedAttempt, 0, attempts - 1, 'generation.selection.selectedAttempt');
  integer(value.selection.selectedSeed, 0, 0xffffffff, 'generation.selection.selectedSeed');
  if (normalized.options.lengthFeel === 'natural' && normalized.options.winner === 'either' && (attempts !== 1 || value.selection.selectedAttempt !== 0)) fail('generation.selection', 'must record one attempt for unconditioned Natural generation.');
  return value;
}

/** Diagnostic request only; selection:null is never a document origin. */
export function createRallyRequestRecipeV1(normalized) {
  const input = normalizeRallyInputV1(normalized);
  return freeze({ mode: 'engine', generatorVersion: RALLY_ENGINE_VERSION, policyVersion: RALLY_POLICY_VERSION,
    flightPlannerVersion: RALLY_FLIGHT_PLANNER_VERSION, physicsVersion: RALLY_PHYSICS_VERSION, seed: input.seed,
    input: { players: input.players, layout: input.layout, service: input.service, options: input.options },
    selection: null });
}

export function createGenerationRecipeV1(normalized, selection = { attempts: 1, selectedAttempt: 0, selectedSeed: normalized?.seed }) {
  object(selection, 'generation.selection', ['attempts', 'selectedAttempt', 'selectedSeed']);
  required(selection, ['attempts', 'selectedAttempt', 'selectedSeed'], 'generation.selection');
  const recipe = { ...createRallyRequestRecipeV1(normalized),
    selection: { attempts: selection.attempts, selectedAttempt: selection.selectedAttempt, selectedSeed: selection.selectedSeed } };
  validateGenerationRecipeV1(recipe);
  return freeze(recipe);
}
