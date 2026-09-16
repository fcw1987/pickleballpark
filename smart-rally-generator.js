// Offline, deterministic, bounded rally authoring.
//
// Every candidate is checked by the production document validator, compiler,
// and rule checker before it is returned. This module never applies a result
// to a live builder; the caller owns revision checks and Undo history.
import { compileDocument } from './play-compiler.js';
import { createStarterDocument, MAX_SHOTS, validateDocument } from './play-document.js';
import { validateRallyRules } from './rally-rules.js';
import {
  SMART_GENERATOR_VERSION, automaticOwnership, documentSourceIdentity,
  evaluateCandidate, makeProposal, proposalChanges
} from './rally-proposals.js';

const copy = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const PLAYER_IDS = Object.freeze(['player1', 'player2', 'player3', 'player4']);
const TEAM_PLAYERS = Object.freeze({ green: Object.freeze(['player1', 'player2']), orange: Object.freeze(['player3', 'player4']) });
const FAMILIES = Object.freeze(['drive', 'drop', 'dink', 'volley', 'reset', 'lob', 'overhead']);
const ARCS = Object.freeze(['low', 'medium', 'high']);
const PACES = Object.freeze(['soft', 'medium', 'firm']);
const OPENING_FAMILIES = Object.freeze(['drive', 'drop', 'dink', 'reset', 'lob']);
const MAX_ATTEMPTS_PER_SHOT = 48;
const MAX_BACKTRACKS = 12;
const DEFAULT_SEED = 0x51a7c0de;
const GENERATION_YIELD_INTERVAL = 4;

export const GENERATOR_LIMITS = Object.freeze({ maxAttemptsPerShot: MAX_ATTEMPTS_PER_SHOT, maxBacktracks: MAX_BACKTRACKS, maxShots: MAX_SHOTS });

function seededRandom(seed) {
  let state = (Number(seed) >>> 0);
  return () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 0x100000000);
}

const choose = (items, next) => items[Math.min(items.length - 1, Math.floor(next() * items.length))];
const shuffled = (items, next) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};
const opposite = team => team === 'green' ? 'orange' : 'green';
const waitTurn = () => new Promise(resolve => setTimeout(resolve, 0));
const abortError = () => Object.assign(new Error('Rally generation was cancelled.'), { name: 'AbortError' });

function checkCancelled(signal) {
  if (signal?.aborted) throw abortError();
}

function normalizedSeed(seed) {
  if (seed === undefined || seed === null) return DEFAULT_SEED;
  if (!Number.isFinite(Number(seed))) throw new RangeError('A rally seed must be finite.');
  return Number(seed) >>> 0;
}

function normalizedLength(length) {
  if (!Number.isInteger(length) || length < 1 || length > MAX_SHOTS) throw new RangeError(`A rally must contain an integer number of hits from 1 to ${MAX_SHOTS}.`);
  return length;
}

function normalizedAttempts(value, fallback, maximum, label, { allowZero = false } = {}) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > maximum) throw new RangeError(`${label} must be a finite integer from ${allowZero ? 0 : 1} to ${maximum}.`);
  return value;
}

function baseDocument(seed, length) {
  const starter = createStarterDocument();
  starter.id = `random-rally-${seed >>> 0}-${length}`;
  starter.title = `Random Rally · ${length} hits · seed ${seed >>> 0}`;
  starter.shots = [];
  delete starter.templateSource;
  starter.generation = { mode: 'random', generatorVersion: SMART_GENERATOR_VERSION, seed: seed >>> 0, requestedHits: length };
  return starter;
}

function familyChoices(index, opening, previous, next, { allowVolley = true } = {}) {
  if (index === 0 && opening === 'serve') return ['serve'];
  if (opening === 'serve' && index === 1) return ['return'];
  const previousFamily = previous?.family;
  let choices = index < 3 && opening === 'serve' ? OPENING_FAMILIES : FAMILIES;
  // Keep the first transition conservative and make repeated Adds feel less
  // mechanical without imposing artificial equal turns or family quotas.
  if (previousFamily && choices.length > 2 && next() < .68) choices = choices.filter(family => family !== previousFamily);
  if (!allowVolley) choices = choices.filter(family => family !== 'volley');
  return shuffled(choices, next);
}

function targetFor(team, family, next, openingPoint) {
  const x = choose([4.5, 7, 10, 13, 15.5], next);
  if (family === 'serve') {
    const x = choose([3.5, 5, 6.5, 8], next);
    // Preserve an authored starting side. The serve lands diagonally across
    // from the ball's opening contact, including a left-box custom setup.
    return { x: openingPoint?.x < 10 ? 20 - x : x, y: choose([33, 35, 37, 39, 41], next) };
  }
  const y = team === 'green'
    ? choose(family === 'lob' ? [31, 35, 39, 41] : [26, 28, 31, 34, 37, 40], next)
    : choose(family === 'return' ? [4, 6, 8, 10] : [4, 7, 10, 13], next);
  return { x, y };
}

function hittersFor(document, index, previous, next) {
  const priorTeam = previous ? document.players[previous.hitter].team : null;
  const team = priorTeam ? opposite(priorTeam) : document.players.player1.team;
  if (index === 0 && document.opening === 'serve') {
    const ball = document.initialLayout.ball;
    const nearest = [...TEAM_PLAYERS[team]].sort((a,b) => {
      const distance = id => Math.hypot(document.initialLayout[id].x-ball.x, document.initialLayout[id].y-ball.y);
      return distance(a)-distance(b) || a.localeCompare(b);
    });
    return nearest.slice(0,1);
  }
  const required = previous?.receiver && previous.receiver !== 'auto' ? [previous.receiver] : TEAM_PLAYERS[team];
  return shuffled(required.filter(id => PLAYER_IDS.includes(id)), next);
}

function nextShotId(document, index) {
  const used = new Set(document.shots.map(shot => shot.id));
  const base = `smart-shot-${index + 1}`;
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix <= MAX_SHOTS + 1; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${document.shots.length + 1}`;
}

function shotCandidate(document, index, family, hitter, next, { smartAdd = false, generationSeed } = {}) {
  const team = document.players[hitter].team;
  const contactStyle = family === 'reset' && index > 2 && next() < .2 ? 'short-hop' : 'auto';
  const shot = {
    id: nextShotId(document, index),
    family,
    hitter,
    receiver: 'auto',
    contactStyle,
    target: targetFor(team, family, next, document.initialLayout.ball),
    arc: family === 'lob' ? 'high' : choose(ARCS, next),
    pace: family === 'dink' || family === 'drop' || family === 'reset' ? choose(['soft', 'soft', 'medium'], next) : choose(PACES, next),
    movement: { intent: smartAdd ? 'advance' : 'hold', pinned: false },
    authoring: automaticOwnership(['family', 'hitter', 'receiver', 'contactStyle', 'target', 'arc', 'pace', 'movement', 'serveMethod'])
  };
  if (family === 'serve') shot.serveMethod = next() < .78 ? 'volley' : 'drop';
  if (smartAdd && generationSeed !== undefined) shot.generation = { seed: generationSeed >>> 0, generatorVersion: SMART_GENERATOR_VERSION };
  return shot;
}

function completeEvaluation(document, { allowOpeningPrefix = true } = {}) {
  const evaluation = evaluateCandidate(document, { allowOpeningPrefix });
  if (!evaluation.ok) return evaluation;
  // Keep the check explicit here: evaluateCandidate already calls the same
  // rule boundary, but this makes the generator's acceptance condition clear
  // and protects it if the shared evaluator gains a warning-only mode later.
  const rules = validateRallyRules(evaluation.compiled.play, evaluation.compiled.timeline);
  // A one-hit serve is an intentional, inspectable short demonstration and
  // an empty/one-hit prefix is a valid state while Smart Add is in progress.
  // Full candidates (two or more hits) must satisfy the complete opening rule.
  const shortOpening = allowOpeningPrefix && document.opening === 'serve' && document.shots.length <= 1 &&
    rules.violations.every(item => ['return-bounce', 'serve-bounce', 'opening-serve'].includes(item.code));
  return rules.valid || shortOpening ? { ...evaluation, ok: true, rules } : { ...evaluation, ok: false, rules, reason: rules.violations[0]?.message || 'The candidate violated rally rules.' };
}

async function appendNext(document, index, random, { signal, maxAttempts = MAX_ATTEMPTS_PER_SHOT, allowVolley = true, generationSeed } = {}) {
  const previous = document.shots.at(-1);
  const families = familyChoices(index, document.opening, previous, random, { allowVolley });
  const attempted = new Set();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    checkCancelled(signal);
    if (attempt && attempt % 4 === 0) await waitTurn();
    const family = families[attempt % families.length];
    const hitters = hittersFor(document, index, previous, random);
    for (const hitter of hitters) {
      const candidateShot = shotCandidate(document, index, family, hitter, random, { smartAdd: generationSeed !== undefined, generationSeed });
      const key = `${family}/${hitter}/${JSON.stringify(candidateShot.target)}/${candidateShot.arc}/${candidateShot.pace}`;
      if (attempted.has(key)) continue;
      attempted.add(key);
      const candidate = copy(document);
      candidate.shots.push(candidateShot);
      const result = completeEvaluation(candidate);
      if (result.ok && result.validShotCount === candidate.shots.length) {
        // Smart Add is itself the next user-visible step. Keep a candidate
        // only when the resulting state has at least one bounded continuation
        // available, otherwise a valid Add can immediately strand the next
        // Add. The lookahead uses an independent deterministic stream and is
        // not exposed as a mutation or progress event.
        const needsLookahead = generationSeed !== undefined && candidate.shots.length < MAX_SHOTS;
        if (needsLookahead) {
          const lookaheadSeed = (generationSeed + Math.imul(index + 1, 0x45d9f3b)) >>> 0;
          const continuation = await appendNext(candidate, index + 1, seededRandom(lookaheadSeed), {
            signal, maxAttempts, allowVolley
          });
          if (!continuation.document) continue;
        }
        return { document: candidate, result };
      }
    }
  }
  return { document: null, result: { ok: false, reason: `No compatible continuation was found after ${maxAttempts} bounded attempts.` } };
}

async function buildRally(length, seed, { signal, onProgress, base = null, maxAttempts = MAX_ATTEMPTS_PER_SHOT, maxBacktracks = MAX_BACKTRACKS } = {}) {
  const initial = base ? copy(base) : baseDocument(seed, length);
  initial.shots = Array.isArray(initial.shots) ? initial.shots.slice(0, 0) : [];
  delete initial.templateSource;
  initial.generation = { mode: 'random', generatorVersion: SMART_GENERATOR_VERSION, seed: seed >>> 0, requestedHits: length };
  validateDocument(initial);
  // A valid prefix can still strand both eligible receivers at its final
  // landing point. Build one bounded lookahead hit whenever the shared limit
  // permits it, then trim that hit from the returned document. This keeps
  // Random Rally outputs naturally extendable by Smart Add without changing
  // the requested length or exposing progress beyond the requested count.
  const generationLength = Math.min(length + 1, MAX_SHOTS);
  const random = seededRandom(seed);
  const stack = [{ document: initial, attempts: 0 }];
  let backtracks = 0;
  while (stack.length) {
    checkCancelled(signal);
    const state = stack.at(-1);
    const index = state.document.shots.length;
    if (index >= generationLength) {
      const result = state.document;
      if (generationLength > length) result.shots = result.shots.slice(0, length);
      return result;
    }
    const next = await appendNext(state.document, index, random, { signal, maxAttempts });
    state.attempts += 1;
    if (next.document) {
      stack.push({ document: next.document, attempts: 0 });
      if (next.document.shots.length <= length) {
        onProgress?.({ shot: next.document.shots.length, requestedHits: length, backtracks });
      }
      if (next.document.shots.length % GENERATION_YIELD_INTERVAL === 0) await waitTurn();
      continue;
    }
    if (stack.length === 1 || backtracks >= maxBacktracks) break;
    stack.pop();
    backtracks += 1;
    if (backtracks % 2 === 0) await waitTurn();
  }
  return null;
}

function failure({ operation, sourceDocument = null, seed = null, reason }) {
  return makeProposal({ operation, sourceDocument, seed, generatorVersion: SMART_GENERATOR_VERSION, reason });
}

/** Propose one compatible continuation while preserving every prior field. */
export async function proposeSmartAdd(sourceDocument, options = {}) {
  const source = copy(sourceDocument);
  let seed = null;
  try {
    seed = normalizedSeed(options.seed);
    validateDocument(source);
    if (source.ending !== 'stop' || source.intentionalFault) {
      return failure({ operation: 'smart-add', sourceDocument: source, seed, reason: 'A rally with an explicit terminal outcome or intentional fault cannot accept another shot. Reopen it before appending.' });
    }
    const maxAttempts = normalizedAttempts(options.maxAttempts, MAX_ATTEMPTS_PER_SHOT, MAX_ATTEMPTS_PER_SHOT, 'maxAttempts');
    const current = completeEvaluation(source);
    if (!current.ok || current.validShotCount !== source.shots.length) {
      return failure({ operation: 'smart-add', sourceDocument: source, seed, reason: current.reason || 'Correct the existing rally with Coach before adding a continuation.' });
    }
    if (source.shots.length >= MAX_SHOTS) return failure({ operation: 'smart-add', sourceDocument: source, seed, reason: `The shared rally limit of ${MAX_SHOTS} hits has been reached.` });
    const result = await appendNext(source, source.shots.length, seededRandom(seed), { ...options, maxAttempts, allowVolley: true, generationSeed: seed });
    if (!result.document) return failure({ operation: 'smart-add', sourceDocument: source, seed, reason: result.result.reason });
    // Verify that the source prefix is byte-equivalent in canonical JSON.
    const prefix = result.document.shots.slice(0, source.shots.length);
    if (JSON.stringify(prefix) !== JSON.stringify(source.shots)) return failure({ operation: 'smart-add', sourceDocument: source, seed, reason: 'The continuation would alter the authored prefix and was rejected.' });
    return makeProposal({ operation: 'smart-add', sourceDocument: source, document: result.document, seed, generatorVersion: SMART_GENERATOR_VERSION, changes: proposalChanges(source, result.document), reason: `Added a validated ${result.document.shots.at(-1).family} continuation for ${result.document.shots.at(-1).hitter}.` });
  } catch (error) {
    if (error.name === 'AbortError') return failure({ operation: 'smart-add', sourceDocument: source, seed, reason: error.message });
    return failure({ operation: 'smart-add', sourceDocument: source, seed, reason: error.message });
  }
}

/** Propose a fresh exact-length rally. The current document is never replaced here. */
export async function proposeRandomRally({ length, seed = DEFAULT_SEED, sourceDocument = null, signal, onProgress, maxAttempts, maxBacktracks } = {}) {
  let normalized;
  let normalizedSeedValue;
  try {
    normalized = normalizedLength(length);
    normalizedSeedValue = normalizedSeed(seed);
  } catch (error) {
    return makeProposal({ operation: 'random-rally', sourceDocument, seed: Number.isFinite(Number(seed)) ? Number(seed) >>> 0 : null, reason: error.message });
  }
  try {
    const boundedAttempts = normalizedAttempts(maxAttempts, MAX_ATTEMPTS_PER_SHOT, MAX_ATTEMPTS_PER_SHOT, 'maxAttempts');
    const boundedBacktracks = normalizedAttempts(maxBacktracks, MAX_BACKTRACKS, MAX_BACKTRACKS, 'maxBacktracks', { allowZero: true });
    const document = await buildRally(normalized, normalizedSeedValue, { signal, onProgress, maxAttempts: boundedAttempts, maxBacktracks: boundedBacktracks });
    if (!document) return makeProposal({ operation: 'random-rally', sourceDocument, seed: normalizedSeedValue, reason: `Could not produce exactly ${normalized} valid hits within bounded search (${boundedAttempts} attempts per shot, ${boundedBacktracks} backtracks).` });
    const evaluation = completeEvaluation(document, { allowOpeningPrefix: normalized === 1 });
    if (!evaluation.ok || evaluation.validShotCount !== normalized) return makeProposal({ operation: 'random-rally', sourceDocument, seed: normalizedSeedValue, reason: evaluation.reason || 'The generated rally did not pass complete validation.' });
    return makeProposal({ operation: 'random-rally', sourceDocument: sourceDocument || document, document, seed: normalizedSeedValue, generatorVersion: SMART_GENERATOR_VERSION, changes: [{ path: 'document', before: undefined, after: 'new exact-length rally', ownership: 'automatic' }], reason: `Generated exactly ${normalized} validated hits.` });
  } catch (error) {
    return makeProposal({ operation: 'random-rally', sourceDocument, seed: normalizedSeedValue, reason: error.name === 'AbortError' ? error.message : error.message });
  }
}

// Descriptive aliases for callers that prefer “generate” terminology. Both
// return the same proposal contract and remain asynchronous for cancellation.
export const generateRandomRally = proposeRandomRally;
export const smartAdd = proposeSmartAdd;

export { seededRandom };
