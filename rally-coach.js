// Bounded repair proposals over the production document/compiler contract.
// Coach evaluates copies only. Applying a proposal, checking a live revision,
// and recording one Undo transaction belong to the builder owner.
import {
  documentSourceIdentity,
  evaluateFullCandidate,
  fieldOwnership,
  makeProposal,
  proposalChanges
} from './rally-proposals.js';
import { MAX_SHOTS, validateDocument } from './play-document.js';

export const COACH_VERSION = 'coach-v1';
export const COACH_LIMITS = Object.freeze({
  maxAutomaticCandidates: 96,
  maxOptionCandidates: 192,
  maxChangeDepth: 2,
  yieldEvery: 12
});

const PLAYER_IDS = Object.freeze(['player1', 'player2', 'player3', 'player4']);
const FAMILIES = Object.freeze(['serve', 'return', 'drive', 'drop', 'dink', 'volley', 'reset', 'lob', 'overhead']);
const ARCS = Object.freeze(['low', 'medium', 'high']);
const PACES = Object.freeze(['soft', 'medium', 'firm']);
const clone = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const opposite = team => team === 'green' ? 'orange' : 'green';

const abortError = () => Object.assign(new Error('Coach repair was cancelled.'), { name: 'AbortError' });
function checkCancelled(signal) {
  if (signal?.aborted) throw abortError();
}

async function yieldIfNeeded(index, signal) {
  checkCancelled(signal);
  if (index > 0 && index % COACH_LIMITS.yieldEvery === 0) {
    await new Promise(resolve => setTimeout(resolve, 0));
    checkCancelled(signal);
  }
}

function sourceIdentityOf(source) {
  try { return documentSourceIdentity(source); } catch { return null; }
}

function failure(source, reason, operation = 'coach-fix', extra = {}) {
  return Object.freeze({
    ...makeProposal({ operation, sourceDocument: source, generatorVersion: COACH_VERSION, reason }),
    ...extra
  });
}

function sourceEvaluation(source) {
  try { return evaluateFullCandidate(source); }
  catch (error) {
    return { ok: false, validShotCount: 0, findings: [], rules: { valid: false, violations: [] }, reason: error.message, compiled: null };
  }
}

function firstIssue(evaluation) {
  return evaluation.findings?.find(item => item.severity === 'error') ||
    evaluation.rules?.violations?.[0] || null;
}

function issueReason(evaluation) {
  const issue = firstIssue(evaluation);
  return issue?.message || evaluation.reason || 'The draft does not pass the production rally checks.';
}

function focusIndex(source, evaluation) {
  const issue = firstIssue(evaluation);
  const id = issue?.shotId || issue?.stepId;
  const direct = source.shots?.findIndex(shot => shot.id === id);
  if (Number.isInteger(direct) && direct >= 0) return direct;
  return Math.min(source.shots?.length || 1, Math.max(0, evaluation.validShotCount || 0));
}

function hasWaypoints(movement) {
  return Array.isArray(movement?.waypoints) && movement.waypoints.length > 0;
}

function shotHasWaypoints(shot) {
  return hasWaypoints(shot?.movement) || Object.values(shot?.playerMovement || {}).some(hasWaypoints);
}

function hasAuthoredMovementChoice(movement) {
  return Boolean(movement?.pinned || movement?.intent === 'manual' || movement?.target || hasWaypoints(movement));
}

function isAutomatic(source, index, field) {
  return fieldOwnership(source, `shots[${index}].${field}`) === 'automatic';
}

function indexDistance(index, focus) {
  return Math.abs(index - focus);
}

function enumNeighbors(value, values) {
  const index = values.indexOf(value);
  if (index < 0) return [];
  return [values[index - 1], values[index + 1]].filter(Boolean);
}

function teamPlayers(source, team) {
  return PLAYER_IDS.filter(id => source.players?.[id]?.team === team);
}

function movementValue(movement, intent, { release = false } = {}) {
  const next = { ...clone(movement), intent };
  if (release) {
    next.pinned = false;
    delete next.target;
  }
  // A manual movement target is meaningful only for a manual movement. Keep
  // unsupported waypoint data intact; callers skip waypoint paths entirely.
  if (intent !== 'manual') delete next.target;
  return next;
}

function automaticDescriptors(source, focus) {
  const descriptors = [];
  for (let index = 0; index < source.shots.length; index += 1) {
    const shot = source.shots[index];
    const distance = indexDistance(index, focus);
    // Automatic provenance never grants permission to erase a manual target,
    // pin, or waypoint. Those are authored movement choices.
    if (isAutomatic(source, index, 'movement') && !hasAuthoredMovementChoice(shot.movement)) {
      const intents = ['hold', 'recover', 'advance'].filter(intent => intent !== shot.movement.intent);
      for (const intent of intents) descriptors.push({
        path: `shots[${index}].movement`, index, field: 'movement', distance,
        label: `adjusted automatic ${intent} movement on Shot ${index + 1}`,
        apply(candidate) { candidate.shots[index].movement = movementValue(shot.movement, intent); }
      });
    }
    if (isAutomatic(source, index, 'playerMovement') && shot.playerMovement &&
        !Object.values(shot.playerMovement).some(hasAuthoredMovementChoice)) {
      const held = Object.fromEntries(Object.entries(shot.playerMovement).map(([player, movement]) => [
        player, movementValue(movement, 'hold')
      ]));
      descriptors.push({
        path: `shots[${index}].playerMovement`, index, field: 'playerMovement', distance,
        label: `adjusted automatic partner movement on Shot ${index + 1}`,
        apply(candidate) { candidate.shots[index].playerMovement = clone(held); }
      });
    }
    // Flight settings are always explicit Coach consent points. A generated
    // source may carry automatic provenance for them, but that must not permit
    // a silent arc or pace rewrite.
    if (shot.receiver === 'auto' && isAutomatic(source, index, 'receiver')) {
      const nextHitter = source.shots[index + 1]?.hitter;
      const eligible = teamPlayers(source, opposite(source.players[shot.hitter]?.team));
      const values = [nextHitter, ...eligible].filter((id, position, all) => id && all.indexOf(id) === position && id !== shot.hitter);
      for (const receiver of values) descriptors.push({
        path: `shots[${index}].receiver`, index, field: 'receiver', distance,
        label: `selected automatic receiver ${receiver} on Shot ${index + 1}`,
        apply(candidate) { candidate.shots[index].receiver = receiver; }
      });
    }
  }
  return descriptors.sort((left, right) => left.distance - right.distance || left.path.localeCompare(right.path));
}

function pointVariants(point) {
  const values = [];
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2], [2, 0], [-2, 0]]) {
    const x = Math.max(0, Math.min(20, point.x + dx));
    const y = Math.max(0, Math.min(44, point.y + dy));
    if (!values.some(item => item.x === x && item.y === y)) values.push({ x, y });
  }
  return values;
}

function protectedDescriptors(source, focus) {
  const descriptors = [];
  for (let index = 0; index < source.shots.length; index += 1) {
    const shot = source.shots[index], distance = indexDistance(index, focus);
    const movement = shot.movement;
    if (movement?.pinned || movement?.intent === 'manual' || movement?.target || hasWaypoints(movement)) {
      descriptors.push({
        path: `shots[${index}].movement`, index, field: 'movement', distance, protected: true,
        label: `released the protected movement choice on Shot ${index + 1}`,
        consentReason: 'This proposal changes an authored movement or pin.',
        apply(candidate) { candidate.shots[index].movement = movementValue(movement, 'recover', { release: true }); }
      });
      if (movement.target) for (const target of pointVariants(movement.target)) descriptors.push({
        path: `shots[${index}].movement`, index, field: 'movement', distance, protected: true,
        label: `moved the protected movement destination on Shot ${index + 1}`,
        consentReason: 'This proposal changes an authored movement destination.',
        apply(candidate) { candidate.shots[index].movement = { ...clone(movement), target }; }
      });
    }
    for (const [player, playerMovement] of Object.entries(shot.playerMovement || {})) {
      if (!hasAuthoredMovementChoice(playerMovement)) continue;
      const path = `shots[${index}].playerMovement`;
      descriptors.push({
        path, index, field: 'playerMovement', distance, protected: true,
        label: `released the protected movement choice for ${player} on Shot ${index + 1}`,
        consentReason: 'This proposal changes an authored partner movement or destination.',
        apply(candidate) {
          const next = { ...clone(playerMovement), intent: 'hold', pinned: false };
          delete next.target;
          candidate.shots[index].playerMovement = { ...candidate.shots[index].playerMovement, [player]: next };
        }
      });
      if (playerMovement.target && !hasWaypoints(playerMovement)) for (const target of pointVariants(playerMovement.target).slice(0, 4)) descriptors.push({
        path, index, field: 'playerMovement', distance, protected: true,
        label: `moved the protected partner destination for ${player} on Shot ${index + 1}`,
        consentReason: 'This proposal changes an authored partner movement destination.',
        apply(candidate) {
          candidate.shots[index].playerMovement = { ...candidate.shots[index].playerMovement, [player]: { ...clone(playerMovement), target } };
        }
      });
    }
    if (shot.target) for (const target of pointVariants(shot.target).slice(0, 4)) descriptors.push({
      path: `shots[${index}].target`, index, field: 'target', distance, protected: true,
      label: `moved the authored ball target on Shot ${index + 1}`,
      consentReason: 'This proposal changes an authored ball target.',
      apply(candidate) { candidate.shots[index].target = target; }
    });
    for (const [field, values] of [['arc', ARCS], ['pace', PACES]]) {
      for (const value of enumNeighbors(shot[field], values)) descriptors.push({
        path: `shots[${index}].${field}`, index, field, distance, protected: true,
        label: `changed the authored ${field} on Shot ${index + 1}`,
        consentReason: 'This proposal changes an authored flight setting.',
        apply(candidate) { candidate.shots[index][field] = value; }
      });
    }
    if (shot.receiver !== 'auto') descriptors.push({
      path: `shots[${index}].receiver`, index, field: 'receiver', distance, protected: true,
      label: `released the authored receiver on Shot ${index + 1}`,
      consentReason: 'This proposal changes an authored receiver.',
      apply(candidate) { candidate.shots[index].receiver = 'auto'; }
    });
    const alternateHitters = teamPlayers(source, source.players[shot.hitter]?.team)
      .filter(player => player !== shot.hitter);
    for (const hitter of alternateHitters) descriptors.push({
      path: `shots[${index}].hitter`, index, field: 'hitter', distance, protected: true,
      label: `changed the authored hitter to ${hitter} on Shot ${index + 1}`,
      consentReason: 'This proposal changes an authored hitter.',
      apply(candidate) { candidate.shots[index].hitter = hitter; }
    });
    for (const family of FAMILIES) {
      if (family === shot.family || (index === 0 && source.opening === 'serve' && family !== 'serve')) continue;
      descriptors.push({
        path: `shots[${index}].family`, index, field: 'family', distance, protected: true,
        label: `changed the authored family to ${family} on Shot ${index + 1}`,
        consentReason: 'This proposal changes an authored shot family.',
        apply(candidate) {
          candidate.shots[index].family = family;
          if (family === 'serve') candidate.shots[index].serveMethod = shot.serveMethod || 'volley';
          else delete candidate.shots[index].serveMethod;
        }
      });
    }
  }
  // Initial layout changes are deliberately sparse and explicit. Coach never
  // silently moves a starting athlete, but can show an evaluated option.
  for (const player of PLAYER_IDS) {
    const position = source.initialLayout?.[player];
    if (!position) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) descriptors.push({
      path: `initialLayout.${player}`, index: 0, field: 'initialLayout', distance: 0, protected: true,
      label: `moved the authored starting position of ${player}`,
      consentReason: 'This proposal changes an authored initial position.',
      apply(candidate) { candidate.initialLayout[player] = { x: position.x + dx, y: position.y + dy }; }
    });
  }
  return descriptors.sort((left, right) => left.distance - right.distance || left.path.localeCompare(right.path));
}

function changesFor(source, candidate) {
  return proposalChanges(source, candidate);
}

function automaticChangeAllowed(source, change) {
  const match = /^shots\[(\d+)\]\.([^.]+)$/.exec(change.path || '');
  if (!match) return false;
  const index = Number(match[1]), field = match[2], shot = source.shots?.[index];
  if (!shot || shotHasWaypoints(shot)) return false;
  if (field === 'movement') return isAutomatic(source, index, field) && !hasAuthoredMovementChoice(shot.movement);
  if (field === 'playerMovement') return isAutomatic(source, index, field) &&
    !Object.values(shot.playerMovement || {}).some(hasAuthoredMovementChoice);
  if (field === 'receiver') return isAutomatic(source, index, field) && shot.receiver === 'auto';
  // Arc and pace are authored flight choices even when a generator marks
  // their provenance automatic.
  return false;
}

function scoreProposal(source, candidate, descriptor, changes) {
  const affected = changes.map(change => {
    const match = /^shots\[(\d+)\]/.exec(change.path || '');
    return match ? Number(match[1]) : 0;
  });
  const distance = affected.length ? Math.min(...affected.map(index => Math.abs(index - (descriptor?.focus ?? 0)))) : 0;
  const delta = changes.reduce((sum, change) => {
    if (typeof change.before === 'number' && typeof change.after === 'number') return sum + Math.abs(change.after - change.before);
    return sum + (change.before === change.after ? 0 : 1);
  }, 0);
  return Object.freeze({ changedFields: changes.length, localImpact: distance, delta, rationale: 'Ranked by fewer changed fields, local impact, and smaller bounded deltas; this is not an optimality claim.' });
}

function concreteProposal(source, candidate, descriptors, evaluation, { operation, focus }) {
  const changes = changesFor(source, candidate);
  const requiresConsent = changes.some(change => !automaticChangeAllowed(source, change));
  const score = scoreProposal(source, candidate, { ...(descriptors[0] || {}), focus }, changes);
  const labels = descriptors.map(descriptor => descriptor.label).filter(Boolean);
  const reason = `${labels.length ? labels.join(' and ') : 'Proposed a bounded repair'}; ${requiresConsent ? 'explicit consent is required' : 'automatic ownership permits this repair'}. ${score.rationale}`;
  return Object.freeze({
    ...makeProposal({ operation, sourceDocument: source, document: candidate, generatorVersion: COACH_VERSION, changes, reason }),
    requiresConsent,
    consentReason: requiresConsent ? (descriptors.find(descriptor => descriptor.consentReason)?.consentReason || 'This proposal changes authored intent.') : '',
    affectedShots: Object.freeze([...new Set(changes.map(change => {
      const match = /^shots\[(\d+)\]/.exec(change.path || '');
      return match ? Number(match[1]) + 1 : null;
    }).filter(Boolean))]),
    evaluation: Object.freeze({ validShotCount: evaluation.validShotCount, findingCount: evaluation.findings?.length || 0 }),
    score
  });
}

function uniquePush(target, identities, proposal) {
  if (!proposal?.ok || !proposal.document || identities.has(proposal.candidateIdentity)) return;
  identities.add(proposal.candidateIdentity);
  target.push(proposal);
}

async function search(source, descriptors, { signal, limit, operation, focus, protectedOnly = false } = {}) {
  const proposals = [], identities = new Set(), seen = new Set();
  let evaluations = 0;
  const maxEvaluations = protectedOnly ? COACH_LIMITS.maxOptionCandidates : COACH_LIMITS.maxAutomaticCandidates;
  const tryCandidate = async (selected) => {
    if (evaluations >= maxEvaluations) return;
    await yieldIfNeeded(evaluations++, signal);
    const key = selected.map(item => item.path + ':' + item.label).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const candidate = clone(source);
    for (const descriptor of selected) descriptor.apply(candidate);
    const changes = changesFor(source, candidate);
    if (!changes.length) return;
    if (!protectedOnly && selected.every(item => item.protected)) return;
    const evaluation = sourceEvaluation(candidate);
    if (!evaluation.ok || evaluation.validShotCount !== candidate.shots.length) return;
    const proposal = concreteProposal(source, candidate, selected, evaluation, { operation, focus });
    // Fix for me is strictly automatic. Keep this guard beside candidate
    // acceptance so a future descriptor cannot smuggle consent into the API.
    if (!protectedOnly && proposal.requiresConsent) return;
    uniquePush(proposals, identities, proposal);
  };
  for (const descriptor of descriptors) {
    if (proposals.length >= limit || evaluations >= maxEvaluations) break;
    await tryCandidate([descriptor]);
  }
  if (proposals.length < limit && COACH_LIMITS.maxChangeDepth > 1) {
    // Two small changes are enough to resolve dependent movement/timing issues
    // while keeping the search finite and inspectable.
    outer: for (let first = 0; first < descriptors.length; first += 1) {
      for (let second = first + 1; second < descriptors.length; second += 1) {
        if (proposals.length >= limit || evaluations >= maxEvaluations) break outer;
        const left = descriptors[first], right = descriptors[second];
        if (left.path === right.path || (left.index === right.index && left.field === right.field)) continue;
        await tryCandidate([left, right]);
      }
    }
  }
  return proposals;
}

function attachListMetadata(list, source, reason = '', cancelled = false) {
  Object.defineProperties(list, {
    sourceIdentity: { value: sourceIdentityOf(source), enumerable: false },
    reason: { value: reason, enumerable: false },
    cancelled: { value: cancelled, enumerable: false }
  });
  return Object.freeze(list);
}

/**
 * Find and evaluate an automatic-only repair. The returned proposal is safe
 * to inspect but must pass the builder's current source-identity guard before
 * application.
 */
export async function proposeCoachFix(sourceDocument, { signal } = {}) {
  const source = clone(sourceDocument);
  try {
    checkCancelled(signal);
    validateDocument(source);
    const evaluation = sourceEvaluation(source);
    if (evaluation.ok && evaluation.validShotCount === source.shots.length) {
      return failure(source, 'Coach found no hard rule or model issue to repair; tactical choices stay authored.');
    }
    const focus = focusIndex(source, evaluation);
    const descriptors = automaticDescriptors(source, focus).map(descriptor => ({ ...descriptor, focus }));
    const proposals = await search(source, descriptors, {
      signal, limit: COACH_LIMITS.maxAutomaticCandidates, operation: 'coach-fix', focus
    });
    if (!proposals.length) {
      return failure(source, `Coach could not find an automatic repair for Shot ${Math.min(source.shots.length, focus + 1)}: ${issueReason(evaluation)} Protected targets, pins, hitters, receivers, flight, family, and initial positions were left unchanged.`);
    }
    proposals.sort((left, right) => left.score.changedFields - right.score.changedFields || left.score.localImpact - right.score.localImpact || left.score.delta - right.score.delta || left.candidateIdentity.localeCompare(right.candidateIdentity));
    return proposals[0];
  } catch (error) {
    if (error.name === 'AbortError') return failure(source, error.message);
    return failure(source, error.message);
  }
}

/**
 * Evaluate concrete alternatives, including protected changes that require
 * explicit user consent. Every returned candidate passed the complete
 * downstream compiler/rule evaluation; unevaluated guesses are omitted.
 */
export async function proposeCoachOptions(sourceDocument, { signal } = {}) {
  let source;
  try { source = clone(sourceDocument); } catch { return attachListMetadata([], sourceDocument, 'Coach requires a document.', false); }
  try {
    checkCancelled(signal);
    validateDocument(source);
    const evaluation = sourceEvaluation(source);
    if (evaluation.ok && evaluation.validShotCount === source.shots.length) return attachListMetadata([], source, 'Coach found no hard issue requiring options.');
    const focus = focusIndex(source, evaluation);
    const descriptors = [...automaticDescriptors(source, focus), ...protectedDescriptors(source, focus)].map(descriptor => ({ ...descriptor, focus }));
    const proposals = await search(source, descriptors, {
      signal, limit: COACH_LIMITS.maxOptionCandidates, operation: 'coach-option', focus, protectedOnly: true
    });
    proposals.sort((left, right) => Number(left.requiresConsent) - Number(right.requiresConsent) || left.score.changedFields - right.score.changedFields || left.score.localImpact - right.score.localImpact || left.score.delta - right.score.delta || left.candidateIdentity.localeCompare(right.candidateIdentity));
    return attachListMetadata(proposals, source, proposals.length ? '' : `No evaluated Coach option resolves the issue: ${issueReason(evaluation)}`);
  } catch (error) {
    if (error.name === 'AbortError') return attachListMetadata([], source, error.message, true);
    return attachListMetadata([], source, error.message, false);
  }
}

export const coachFix = proposeCoachFix;
export const coachOptions = proposeCoachOptions;
