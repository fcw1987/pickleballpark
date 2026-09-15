// Shared proposal, identity, ownership, and candidate-evaluation primitives.
// Generation deliberately stays separate from applying a proposal to a live
// builder. The builder owns revision checks, history, and the single Undo step.
import { compileDocument, recompileAssistedDocument } from './play-compiler.js';
import { validateDocument } from './play-document.js';
import { validateRallyRules } from './rally-rules.js';
import { applyCoverageAssistance } from './coverage-assistance.js';

export const PROPOSAL_VERSION = 1;
export const SMART_GENERATOR_VERSION = 'smart-rally-v1';

const clone = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));

// JSON.stringify preserves insertion order, which makes an identity depend on
// how a document was assembled. Canonicalize keys first so the same source
// content has one identity after import/export or a clone.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  // FNV-1a 64 is small, deterministic, and available in browser and Node
  // runtimes without a crypto service or asynchronous dependency.
  let result = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    result ^= BigInt(value.charCodeAt(index));
    result = BigInt.asUintN(64, result * 0x100000001b3n);
  }
  return result.toString(16).padStart(16, '0');
}

/** Return a content identity for the source document, excluding no fields. */
export function documentSourceIdentity(document) {
  if (!document || typeof document !== 'object') throw new TypeError('A source document is required.');
  return `document-v${PROPOSAL_VERSION}:${hash(canonical(document))}`;
}

export const sourceIdentity = documentSourceIdentity;

/**
 * Legacy documents have no ownership field. They are conservatively authored;
 * equality with a preset/default never grants a generator permission to edit.
 */
export function fieldOwnership(document, path) {
  const shotMatch = /^shots\[(\d+)\]\.(.+)$/.exec(path || '');
  const shot = shotMatch && document?.shots?.[Number(shotMatch[1])];
  const metadata = shot?.authoring;
  if (metadata?.ownership === 'automatic' && Array.isArray(metadata.fields) && metadata.fields.includes(shotMatch[2])) return 'automatic';
  return 'authored';
}

export function automaticOwnership(fields = []) {
  return Object.freeze({ ownership: 'automatic', fields: Object.freeze([...new Set(fields)]) });
}

export function proposalChanges(before, after) {
  const changes = [];
  if (!before || !after) return changes;
  const beforeShots = before.shots || [], afterShots = after.shots || [];
  const common = Math.min(beforeShots.length, afterShots.length);
  for (let index = 0; index < common; index += 1) {
    const left = beforeShots[index], right = afterShots[index];
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) {
        changes.push({ path: `shots[${index}].${key}`, before: clone(left[key]), after: clone(right[key]), ownership: fieldOwnership(before, `shots[${index}].${key}`) });
      }
    }
  }
  if (afterShots.length > beforeShots.length) {
    for (let index = beforeShots.length; index < afterShots.length; index += 1) {
      changes.push({ path: `shots[${index}]`, before: undefined, after: clone(afterShots[index]), ownership: 'automatic' });
    }
  }
  return changes;
}

export function makeProposal({ operation, sourceDocument, document = null, seed = null, generatorVersion = SMART_GENERATOR_VERSION, changes = null, reason = '' }) {
  if (typeof operation !== 'string' || !operation) throw new TypeError('A proposal operation is required.');
  const source = sourceDocument ? clone(sourceDocument) : null;
  const candidate = document ? clone(document) : null;
  return Object.freeze({
    ok: Boolean(candidate), document: candidate, sourceIdentity: source ? documentSourceIdentity(source) : null,
    candidateIdentity: candidate ? documentSourceIdentity(candidate) : null,
    seed, generatorVersion, changes: Object.freeze(changes ? clone(changes) : proposalChanges(source, candidate)),
    reason: String(reason || ''), operation, proposalVersion: PROPOSAL_VERSION
  });
}

/** Compile the same effective Play used by the builder, including coverage. */
export function compileEffectiveCandidate(document) {
  validateDocument(document);
  const baseCompiled = compileDocument(document);
  const assisted = baseCompiled.play
    ? applyCoverageAssistance(baseCompiled.play, document, baseCompiled.timeline)
    : { play: null, coverage: [] };
  return baseCompiled.play && document.assistance?.autoShading
    ? recompileAssistedDocument(document, baseCompiled, assisted.play, assisted.coverage)
    : baseCompiled.play ? { ...baseCompiled, coverage: assisted.coverage } : baseCompiled;
}

export function evaluateCandidate(document, { allowOpeningPrefix = false } = {}) {
  try {
    const compiled = compileEffectiveCandidate(document);
    const rules = compiled.play ? validateRallyRules(compiled.play, compiled.timeline) : { valid: false, violations: [] };
    const errors = compiled.findings.filter(item => item.severity === 'error');
    const shortOpening = allowOpeningPrefix && document.opening === 'serve' && document.shots.length <= 1 &&
      rules.violations.every(item => ['return-bounce', 'serve-bounce', 'opening-serve'].includes(item.code));
    return Object.freeze({
      ok: compiled.validShotCount === document.shots.length && errors.length === 0 && (rules.valid || shortOpening),
      validShotCount: compiled.validShotCount, findings: compiled.findings,
      rules, compiled, reason: errors[0]?.message || rules.violations[0]?.message || ''
    });
  } catch (error) {
    return Object.freeze({ ok: false, validShotCount: 0, findings: [], rules: { valid: false, violations: [] }, compiled: null, reason: error.message });
  }
}

// Named alias used by Coach and future authoring surfaces to make the
// whole-rally requirement explicit at call sites.
export const evaluateFullCandidate = evaluateCandidate;

/** Root-owned application guard. It never mutates either argument. */
export function authorizeProposal(proposal, currentDocument, { operation } = {}) {
  if (!proposal?.ok || !proposal.document) return { ok: false, reason: proposal?.reason || 'The proposal is not valid.' };
  if (operation && proposal.operation !== operation) return { ok: false, reason: 'The proposal operation is not permitted here.' };
  if (documentSourceIdentity(currentDocument) !== proposal.sourceIdentity) return { ok: false, reason: 'The document changed while this proposal was being evaluated.' };
  return { ok: true, document: clone(proposal.document), sourceIdentity: proposal.sourceIdentity };
}

export function isProposalForSource(proposal, document) {
  return Boolean(proposal?.sourceIdentity && documentSourceIdentity(document) === proposal.sourceIdentity);
}

const FAMILY_DEFAULTS = Object.freeze({
  serve: { arc: 'high', pace: 'medium', contactStyle: 'auto' },
  return: { arc: 'high', pace: 'medium', contactStyle: 'auto' },
  drive: { arc: 'low', pace: 'firm', contactStyle: 'auto' },
  drop: { arc: 'high', pace: 'soft', contactStyle: 'auto' },
  dink: { arc: 'high', pace: 'soft', contactStyle: 'auto' },
  volley: { arc: 'medium', pace: 'medium', contactStyle: 'auto' },
  reset: { arc: 'high', pace: 'soft', contactStyle: 'auto' },
  lob: { arc: 'high', pace: 'medium', contactStyle: 'auto' },
  overhead: { arc: 'medium', pace: 'firm', contactStyle: 'auto' }
});

/**
 * Propose a family change using only fields explicitly marked automatic. A
 * legacy or authored field is protected even when it currently equals a
 * family default. The requested family remains on the candidate so the UI can
 * explain a protected conflict instead of silently reverting the selection.
 */
export async function proposeFamilyChange(sourceDocument, { shotId, index, family } = {}) {
  const source = clone(sourceDocument);
  try {
    validateDocument(source);
    const shotIndex = Number.isInteger(index) ? index : source.shots.findIndex(item => item.id === shotId);
    const shot = source.shots[shotIndex];
    if (!shot) return makeProposal({ operation: 'family-change', sourceDocument: source, reason: 'Choose an authored shot before changing its family.' });
    if (!Object.prototype.hasOwnProperty.call(FAMILY_DEFAULTS, family)) return makeProposal({ operation: 'family-change', sourceDocument: source, reason: 'Choose a supported shot family.' });
    const candidate = clone(source), changed = candidate.shots[shotIndex];
    changed.family = family;
    const owned = field => fieldOwnership(source, `shots[${shotIndex}].${field}`) === 'automatic';
    for (const field of ['arc', 'pace', 'contactStyle']) if (owned(field)) changed[field] = FAMILY_DEFAULTS[family][field];
    // serveMethod is schema-conditional rather than a user-facing protected
    // flight choice: every Serve gets a valid default and every other family
    // removes the stale field, including legacy authored shots.
    if (family === 'serve') {
      if (shot.family !== 'serve') changed.serveMethod = 'volley';
    } else delete changed.serveMethod;
    const evaluated = evaluateCandidate(candidate);
    const changes = proposalChanges(source, candidate);
    if (!evaluated.ok) {
      const protectedChanges = changes.filter(change => change.path !== `shots[${shotIndex}].family` && !change.path.endsWith('.serveMethod') && change.ownership !== 'automatic');
      const reason = protectedChanges.length ? `The requested ${family} remains selected, but protected ${protectedChanges.map(change => change.path.split('.').at(-1)).join(', ')} prevent a validated continuation.` : evaluated.reason;
      return Object.freeze({ ...makeProposal({ operation: 'family-change', sourceDocument: source, document: candidate, seed: null, changes, reason }), ok: false });
    }
    return makeProposal({ operation: 'family-change', sourceDocument: source, document: candidate, changes, reason: `Changed Shot ${shotIndex + 1} to ${family}; authored fields remain protected.` });
  } catch (error) {
    return makeProposal({ operation: 'family-change', sourceDocument: source, reason: error.message });
  }
}
