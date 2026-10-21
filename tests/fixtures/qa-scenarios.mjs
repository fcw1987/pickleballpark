import { createStarterDocument } from '../../play-document.js';
import { generatedRally } from '../../tools/qa-generated.mjs';

const clone = value => structuredClone(value);

function midrally(id, title, x = 10) {
  const document = createStarterDocument();
  document.id = id;
  document.title = title;
  document.opening = 'midrally';
  document.initialLayout = {
    player1: { x, y: 14 }, player2: { x: x < 10 ? 15 : 5, y: 14 },
    player3: { x, y: 30 }, player4: { x: x < 10 ? 15 : 5, y: 30 },
    ball: { x, y: 14 }
  };
  document.shots = [];
  return document;
}

function shot(id, family, hitter, target, options = {}) {
  const green = ['player1', 'player2'].includes(hitter);
  return {
    id, family, hitter, receiver: options.receiver ?? 'auto',
    contactStyle: options.contactStyle ?? 'forehand', target,
    arc: options.arc ?? (['drive', 'volley'].includes(family) ? 'low' : 'medium'),
    pace: options.pace ?? (family === 'drive' ? 'firm' : ['drop', 'dink', 'reset'].includes(family) ? 'soft' : 'medium'),
    movement: options.movement ?? { intent: 'hold', pinned: false },
    ...(options.playerMovement ? { playerMovement: options.playerMovement } : {}),
    ...(family === 'serve' ? { serveMethod: options.serveMethod ?? 'volley' } : {}),
    _green: green
  };
}

function cleanShot(value) {
  const result = { ...value };
  delete result._green;
  return result;
}

function scenario(id, document, expected) {
  document.shots = document.shots.map(cleanShot);
  return Object.freeze({ id, document: Object.freeze(document), expected: Object.freeze(expected) });
}

const deepOpening = createStarterDocument();
deepOpening.id = 'qa-deep-serve-return';
deepOpening.title = 'Deep serve and deep return';
deepOpening.shots = deepOpening.shots.slice(0, 2);
deepOpening.shots[0].target = { x: 5, y: 42 };
deepOpening.shots[1].target = { x: 15, y: 2 };

const shortOpening = createStarterDocument();
shortOpening.id = 'qa-short-serve-return';
shortOpening.title = 'Legal short serve and short return';
shortOpening.shots = shortOpening.shots.slice(0, 2);
shortOpening.shots[0].target = { x: 5, y: 30.25 };
shortOpening.shots[1].target = { x: 15, y: 14.5 };

function fiveShot(thirdFamily) {
  const document = createStarterDocument();
  document.id = `qa-third-${thirdFamily}-fifth-drop`;
  document.title = `Third shot ${thirdFamily} and fifth shot drop`;
  document.shots[2] = {
    ...document.shots[2], family: thirdFamily,
    id: `${thirdFamily}-3`, arc: thirdFamily === 'drive' ? 'low' : 'high',
    pace: thirdFamily === 'drive' ? 'firm' : 'soft', receiver: 'player3'
  };
  document.shots.push(
    shot('drive-4', 'drive', 'player3', { x: 15, y: 8 }, { receiver: 'player1' }),
    shot('drop-5', 'drop', 'player1', { x: 7, y: 28 }, { receiver: 'auto', arc: 'high' })
  );
  return document;
}

const blockReset = midrally('qa-drive-block-reset', 'Drive, volley block, and short-hop reset');
blockReset.shots = [
  shot('drive-1', 'drive', 'player1', { x: 10, y: 34 }, { receiver: 'player3' }),
  shot('block-2', 'volley', 'player3', { x: 10, y: 10 }, { receiver: 'player1', pace: 'soft' }),
  shot('short-hop-3', 'reset', 'player1', { x: 10, y: 31 }, { receiver: 'player3', contactStyle: 'short-hop', arc: 'high' }),
  shot('reset-4', 'reset', 'player3', { x: 10, y: 13 }, { receiver: 'auto', contactStyle: 'backhand', arc: 'high' })
];

function oneDink(id, fromX, targetX) {
  const document = midrally(id, id, fromX);
  document.shots = [shot(`${id}-1`, 'dink', 'player1', { x: targetX, y: 28 }, { contactStyle: 'auto' })];
  return document;
}

const speedup = midrally('qa-dink-speedup', 'Dink followed by expressible speedup');
speedup.shots = [
  shot('dink-1', 'dink', 'player1', { x: 10, y: 28 }, { receiver: 'player3' }),
  shot('speedup-2', 'drive', 'player3', { x: 10, y: 16 }, { receiver: 'auto', pace: 'firm', arc: 'low' })
];

const lobOverhead = midrally('qa-lob-overhead', 'Lob intercepted by overhead');
lobOverhead.shots = [
  shot('lob-1', 'lob', 'player1', { x: 10, y: 40 }, { receiver: 'player3', arc: 'high' }),
  shot('overhead-2', 'overhead', 'player3', { x: 10, y: 8 }, { receiver: 'auto', pace: 'firm', arc: 'high' })
];

const formation = midrally('qa-transition-one-up-one-back', 'Transition with one player up and one back');
formation.initialLayout.player1 = { x: 10, y: 8 };
formation.initialLayout.player2 = { x: 5, y: 14 };
formation.initialLayout.ball = { x: 10, y: 8 };
formation.shots = [shot('transition-drop-1', 'drop', 'player1', { x: 10, y: 30 }, {
  movement: { intent: 'advance', pinned: false },
  playerMovement: { player2: { intent: 'hold', pinned: false } }, arc: 'high'
})];

const pinShading = midrally('qa-manual-pin-shading', 'Manual pin with shading', 6);
pinShading.assistance = { autoShading: true, showGuides: true, team: 'both' };
pinShading.shots = [
  shot('pinned-dink-1', 'dink', 'player1', { x: 6, y: 30 }, {
    receiver: 'player3', movement: { intent: 'manual', pinned: true, target: { x: 4, y: 14 } }
  }),
  shot('reply-2', 'dink', 'player3', { x: 6, y: 14 }, { receiver: 'auto' })
];

function assistanceMode(id, autoShading, showGuides) {
  const document = midrally(id, id);
  document.assistance = { autoShading, showGuides, team: 'both' };
  document.shots = [shot(`${id}-1`, 'dink', 'player1', { x: 10, y: 30 }, { receiver: 'player3' })];
  return document;
}

function autoHand(id, handedness) {
  const document = midrally(id, id, 10);
  document.initialLayout.ball = { x: 12, y: 14 };
  document.players.player1.handedness = handedness;
  document.shots = [shot(`${id}-1`, 'drop', 'player1', { x: 12, y: 32 }, { contactStyle: 'auto', arc: 'high' })];
  return document;
}

const bouncedResponse = midrally('qa-bounced-response', 'Bounced response');
bouncedResponse.shots = [
  shot('ground-1', 'dink', 'player1', { x: 10, y: 28 }, { receiver: 'player3' }),
  shot('ground-2', 'dink', 'player3', { x: 10, y: 16 }, { receiver: 'auto' })
];

const infeasible = midrally('qa-infeasible-pin', 'Infeasible pinned contact');
infeasible.shots = [
  shot('pin-1', 'dink', 'player1', { x: 10, y: 30 }, {
    receiver: 'player3', movement: { intent: 'manual', pinned: true, target: { x: 0, y: 0 } }
  }),
  shot('reply-2', 'dink', 'player3', { x: 10, y: 14 }, { receiver: 'player1' }),
  shot('blocked-contact-3', 'dink', 'player1', { x: 10, y: 30 })
];

const ruleWarning = createStarterDocument();
ruleWarning.id = 'qa-intentional-serve-fault';
ruleWarning.title = 'Intentional terminal serve fault';
ruleWarning.shots[0].target = { x: 15, y: 38 };
ruleWarning.intentionalFault = true;
ruleWarning.ending = 'fault';

const winner = oneDink('qa-declared-winner', 10, 10);
winner.ending = 'winner';

const longMixed = generatedRally({ seed: 0xb37a, length: 30 });
const fixtureContactKind = value => value.contactStyle === 'short-hop'
  ? 'short-hop'
  : ['volley', 'overhead'].includes(value.family) || (value.family === 'reset' && value.contactStyle !== 'short-hop')
    ? 'volley'
    : 'groundstroke';
const longContacts = longMixed.shots.map(fixtureContactKind);
const longBounces = longMixed.shots.map((value, index) => index === longMixed.shots.length - 1 || longContacts[index + 1] !== 'volley' ? 1 : 0);

export const QA_SCENARIOS = Object.freeze([
  scenario('deep-serve-return', deepOpening, { intents: ['deep serve', 'deep return'], contacts: ['serve', 'groundstroke'], bounces: [1, 1], responsibility: ['player1', 'player3'], terminal: 'stop', visual: ['intended targets', 'contact events'] }),
  scenario('short-serve-return', shortOpening, { intents: ['legal short serve', 'legal short return'], contacts: ['serve', 'groundstroke'], bounces: [1, 1], responsibility: ['player1', 'player3'], terminal: 'stop', visual: ['service-box landing', 'bounce markers'] }),
  scenario('third-drop-fifth-drop', fiveShot('drop'), { intents: ['third-shot drop', 'fourth drive', 'fifth-shot drop'], contacts: ['serve', 'groundstroke', 'groundstroke', 'groundstroke', 'groundstroke'], bounces: [1, 1, 1, 1, 1], responsibility: ['player1', 'player3', 'player1', 'player3', 'player1'], terminal: 'stop', visual: ['soft high arcs', 'stable shot ids'] }),
  scenario('third-drive-fifth-drop', fiveShot('drive'), { intents: ['third-shot drive', 'fifth-shot drop'], contacts: ['serve', 'groundstroke', 'groundstroke', 'groundstroke', 'groundstroke'], bounces: [1, 1, 1, 1, 1], responsibility: ['player1', 'player3', 'player1', 'player3', 'player1'], terminal: 'stop', visual: ['low firm third', 'high soft fifth'] }),
  scenario('drive-block-reset', blockReset, { intents: ['drive', 'volley used as block', 'short-hop reset', 'volley reset'], contacts: ['groundstroke', 'volley', 'short-hop', 'volley'], bounces: [0, 1, 0, 1], responsibility: ['player1', 'player3', 'player1', 'player3'], terminal: 'stop', visual: ['early interception', 'low short-hop contact'] }),
  scenario('straight-dink', oneDink('qa-straight-dink', 4, 4), { intents: ['straight dink'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['straight target'] }),
  scenario('cross-dink', oneDink('qa-cross-dink', 4, 16), { intents: ['crosscourt dink'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['wide diagonal target'] }),
  scenario('middle-dink', oneDink('qa-middle-dink', 4, 10), { intents: ['middle dink'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['center target'] }),
  scenario('dink-speedup', speedup, { intents: ['dink', 'firm drive used as speedup'], contacts: ['groundstroke', 'groundstroke'], bounces: [1, 1], responsibility: ['player1', 'player3'], terminal: 'stop', visual: ['pace contrast'] }),
  scenario('lob-overhead', lobOverhead, { intents: ['lob', 'overhead'], contacts: ['groundstroke', 'volley'], bounces: [0, 1], responsibility: ['player1', 'player3'], terminal: 'stop', visual: ['high arc', 'early interception'] }),
  scenario('transition-one-up-one-back', formation, { intents: ['transition drop', 'one-up/one-back hold'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['transition movement', 'kitchen partner depth'] }),
  scenario('manual-pin-shading', pinShading, { intents: ['manual pinned dink', 'automatic shading'], contacts: ['groundstroke', 'groundstroke'], bounces: [1, 1], responsibility: ['player1', 'player3'], terminal: 'stop', visual: ['pin unchanged', 'coverage guides'] }),
  scenario('shading-off-guides-off', assistanceMode('qa-shading-off-guides-off', false, false), { intents: ['authored movement only'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['no guides', 'no shading'] }),
  scenario('shading-off-guides-on', assistanceMode('qa-shading-off-guides-on', false, true), { intents: ['guide-only coverage'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['guides visible', 'positions unchanged'] }),
  scenario('shading-on-guides-off', assistanceMode('qa-shading-on-guides-off', true, false), { intents: ['automatic shading'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['derived lateral movement', 'guides hidden by UI setting'] }),
  scenario('shading-on-guides-on', assistanceMode('qa-shading-on-guides-on', true, true), { intents: ['automatic shading with guides'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['derived lateral movement', 'guides visible'] }),
  scenario('right-handed-auto-contact', autoHand('qa-right-hand-auto', 'right'), { intents: ['automatic contact side'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['right-handed forehand'] }),
  scenario('left-handed-auto-contact', autoHand('qa-left-hand-auto', 'left'), { intents: ['automatic contact side'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['left-handed backhand'] }),
  scenario('wide-target', oneDink('qa-wide-target', 1, 1), { intents: ['wide target'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['x=1 target'] }),
  scenario('center-target', oneDink('qa-center-target', 10, 10), { intents: ['center target'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'stop', visual: ['x=10 target'] }),
  scenario('bounced-response', bouncedResponse, { intents: ['bounced response'], contacts: ['groundstroke', 'groundstroke'], bounces: [1, 1], responsibility: ['player1', 'player3'], terminal: 'stop', visual: ['landing then incoming contact'] }),
  scenario('long-mixed', longMixed, { intents: ['30-shot mixed supported-family rally'], contacts: longContacts, bounces: longBounces, responsibility: Array.from({ length: 30 }, (_, index) => index % 2 ? 'player3' : 'player1'), terminal: 'stop', visual: ['bounded event stream', 'stable seek'] }),
  scenario('infeasible-pin', infeasible, { intents: ['infeasible pinned dependency'], contacts: ['groundstroke', 'groundstroke'], bounces: [1, 1], responsibility: ['player1', 'player3'], terminal: 'stop', visual: ['playable prefix', 'pin finding'], finding: { kind: 'feasibility', shotId: 'blocked-contact-3' }, validShotCount: 2 }),
  scenario('intentional-rule-warning', ruleWarning, { intents: ['intentional serve fault'], contacts: ['serve'], bounces: [1], responsibility: ['player1'], terminal: 'fault', visual: ['warning', 'terminal fault label'], finding: { kind: 'rule', severity: 'warning' }, validShotCount: 1 }),
  scenario('declared-winner', winner, { intents: ['declared winner'], contacts: ['groundstroke'], bounces: [1], responsibility: ['player1'], terminal: 'winner', visual: ['winner label'] })
]);

export const QA_FUTURE_GAPS = Object.freeze([
  'A distinct authored block family and block-specific ball/paddle behavior; model v1 maps block intent to volley/reset.',
  'A distinct speedup family with attackability and counter semantics; model v1 can only author a firm drive or volley.',
  'Erne/ATP, poach, switch, stacking, scoring, spin selection, measured biomechanics, and predictive tactics.',
  'Intermediate waypoint path planning; model v1 preserves waypoints and samples only the final destination.',
  'Outcome detection from physics; winner and fault are explicit authored terminal declarations.',
  'Full officiating beyond the documented standing-doubles rule subset.'
]);

export function copyScenarioDocument(id) {
  const found = QA_SCENARIOS.find(item => item.id === id);
  if (!found) throw new RangeError(`Unknown QA scenario: ${id}`);
  return clone(found.document);
}
