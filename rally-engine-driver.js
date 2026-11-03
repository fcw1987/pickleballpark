// Request orchestration only. Physical planning and policy stay in the attempt
// producer; every returned document still crosses the public validation path.
import { normalizeRallyInputV1, createGenerationRecipeV1, createRallyRequestRecipeV1 } from './rally-recipe.js';
import { createRallyRandomV1, deriveRallySeedV1 } from './rally-random.js';
import { validateDocument } from './play-document.js';
import { compileDocument } from './play-compiler.js';
import { validateRallyRules } from './rally-rules.js';
import { assessGeneratedFlightFeasibilityV1 } from './rally-flight-audit.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1, GROUNDED_CONTACT_HEIGHT_FEET } from './rally-movement.js';

export const ENGINE_DRIVER_VERSION = 'rally-engine-driver-v1';
export const ENGINE_DRIVER_LIMITS = Object.freeze({ maxAttempts: 64, maxWorkPerAttempt: 65536, maxWork: 64 * 65536 });
const PHASES = Object.freeze(['attempt', 'retry', 'search', 'validating']);
const PROVISIONAL_STATUSES = Object.freeze(['complete', 'censored', 'failed']);
const CAUSATION_KINDS = Object.freeze(['winner', 'forced-error', 'unforced-error', 'rule-fault', 'unknown']);
const clone = value => structuredClone(value);
const diagnosticClone = value => { try { return clone(value); } catch { return { unserializableProducerDiagnostic: true }; } };
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const integer = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);

function traceProperty(value, key) {
    if (!value || typeof value !== 'object') return { present: false };
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    // An accessor is not producer evidence and must not execute while handling
    // another failure or cancellation.
    return descriptor && Object.hasOwn(descriptor, 'value') ? { present: true, value: descriptor.value } : { present: false };
}

function partialTrace(value, source) {
    const unavailable = reason => ({ decisions: [], diagnostic: { status: 'unavailable', source, count: 0, reason } });
    if (value === undefined) return unavailable('not-provided');
    if (!Array.isArray(value) || value.length > 99) return unavailable('invalid-bound');
    let nodes = 0;
    const seen = new Set();
    const inspect = (item, depth = 0) => {
        if (++nodes > 500000 || depth > 24) throw new TypeError('Partial trace exceeds its analysis bound.');
        if (item === null || item === undefined || typeof item === 'boolean') return;
        if (typeof item === 'string' && item.length <= 32768 || typeof item === 'number' && Number.isFinite(item)) return;
        if (!item || typeof item !== 'object' || (!Array.isArray(item) && !plain(item)) || seen.has(item)) throw new TypeError('Partial trace must be inert data.');
        seen.add(item);
        for (const key of Reflect.ownKeys(item)) {
            if (Array.isArray(item) && key === 'length') continue;
            if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new TypeError('Partial trace contains unsupported keys.');
            const descriptor = Object.getOwnPropertyDescriptor(item, key);
            if (!Object.hasOwn(descriptor, 'value')) throw new TypeError('Partial trace cannot run accessors.');
            inspect(descriptor.value, depth + 1);
        }
        seen.delete(item);
    };
    try {
        for (let index = 0; index < value.length; index++) {
            const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
            if (!descriptor || !Object.hasOwn(descriptor, 'value') || !plain(descriptor.value)) return unavailable('unsupported-data');
        }
        inspect(value);
        return { decisions: clone(value), diagnostic: { status: value.length ? 'retained' : 'empty', source, count: value.length } };
    } catch { return unavailable('unsupported-data'); }
}

class DriverFailure extends Error {
    constructor(code, message, details = null) { super(message); this.code = code; this.details = details; }
}

/** A real macroturn, with request-local ports and no clock-derived decisions. */
export function yieldRallyTurnV1() {
    return new Promise(resolve => {
        if (typeof globalThis.MessageChannel === 'function') {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
            channel.port2.postMessage(0);
        } else setTimeout(resolve, 0);
    });
}

function validateControls(input) {
    if (input.onProgress !== undefined && typeof input.onProgress !== 'function') throw new TypeError('onProgress must be a function.');
    const signal = input.signal;
    // Match the worker-client boundary and permit genuine cross-realm signals.
    if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean'
        || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) throw new TypeError('signal must be an AbortSignal.');
}

function lengthMatches(feel, shots) {
    return feel === 'natural' || feel === 'short' && shots >= 3 && shots <= 6
        || feel === 'long' && shots >= 12 && shots <= 20 || feel === 'epic' && shots >= 25;
}

function validateAttemptDocument(provisional, normalized, recipe) {
    if (!plain(provisional) || !PROVISIONAL_STATUSES.includes(provisional.status)) throw new DriverFailure('attempt-status', 'Attempt returned an unsupported result status.');
    if (!provisional.document) throw new DriverFailure('attempt-document', 'A completed or censored attempt must supply its source document.');
    const document = clone(provisional.document);
    document.generation = recipe;
    validateDocument(document);
    if (document.modelVersion !== 2 || document.physicsVersion !== 'play-physics-v2') throw new DriverFailure('attempt-version', 'An engine attempt requires the explicit model2 physics version.');
    for (const shot of document.shots) {
        if (!shot.contactEvidence || shot.contactEvidence.feet?.length !== 2 || typeof shot.contactEvidence.feetEstablishedOutsideNVZ !== 'boolean') throw new DriverFailure('engine-feet', 'Fresh engine contacts require explicit grounded foot evidence.');
        if (!shot.generation || Object.keys(shot.generation).sort().join(',') !== 'generatorVersion,seed'
            || shot.generation.generatorVersion !== 'rally-engine-v1' || shot.generation.seed !== recipe.selection.selectedSeed) throw new DriverFailure('engine-shot-provenance', 'Each generated contact must identify its selected engine attempt.');
        if (shot.authoring?.ownership !== 'automatic' || !Array.isArray(shot.authoring.fields)
            || shot.authoring.fields.some(field => !Object.hasOwn(shot, field))) throw new DriverFailure('engine-shot-ownership', 'Fresh engine ownership may name only fields actually present on that contact.');
    }
    if (!Array.isArray(provisional.decisions) || provisional.decisions.length !== document.shots.length) throw new DriverFailure('attempt-decisions', 'Every represented contact requires one decision record.');
    if (document.shots.length > normalized.options.maxShots) throw new DriverFailure('shot-limit', 'An attempt exceeded the requested shot limit.');
    if (provisional.status === 'censored') {
        if (document.shots.length !== normalized.options.maxShots || document.ending !== 'stop' || document.outcome !== undefined || provisional.outcome != null || provisional.outcomeClassification != null) {
            throw new DriverFailure('censored-outcome', 'A censored result must reach the shot limit with a stop prefix and no claimed outcome.');
        }
    } else if (document.ending === 'stop' || !document.outcome || canonical(provisional.outcome) !== canonical(document.outcome)) {
        throw new DriverFailure('complete-outcome', 'A complete result must match its source physical outcome.');
    }
    const compiled = compileDocument(document);
    const rules = validateRallyRules(compiled.play, compiled.timeline);
    const errors = compiled.findings.filter(item => item.severity === 'error');
    if (compiled.validShotCount !== document.shots.length || errors.length || !rules.valid || rules.violations.length) {
        throw new DriverFailure('final-validation', 'The generated source did not pass full independent validation.', {
            sourceShots: document.shots.length, acceptedShots: compiled.validShotCount, compilerErrors: clone(errors), ruleViolations: clone(rules.violations)
        });
    }
    const unsupportedContact = compiled.timeline.segments.find(segment => segment.shotSemantics?.contact.point.heightFeet > GROUNDED_CONTACT_HEIGHT_FEET + 1e-7);
    if (unsupportedContact) throw new DriverFailure('engine-contact-height', 'The generated grounded contact exceeds the supported paddle height.', {
        shotId: unsupportedContact.step.id, heightFeet: unsupportedContact.shotSemantics.contact.point.heightFeet,
        maximumHeightFeet: GROUNDED_CONTACT_HEIGHT_FEET
    });
    const movement = inspectGeneratedMovementV1(compiled.timeline), spacing = inspectGeneratedSpacingV1(compiled.timeline);
    if (!movement.valid || !spacing.valid) throw new DriverFailure('generated-movement', 'The final sampled paths exceed generated movement or spacing bounds.', { movement, spacing });
    const generatedFlightFeasibility = assessGeneratedFlightFeasibilityV1({ document, compiled });
    if (['rally-policy-v2', 'rally-policy-v3'].includes(recipe.policyVersion) && generatedFlightFeasibility.status !== 'PASS') {
        throw new DriverFailure('generated-flight-feasibility', 'The serialized generated flights exceed the supported generation envelope.', { generatedFlightFeasibility });
    }
    if (provisional.status === 'complete') {
        const outcome = document.outcome;
        const match = rules.expectedOutcomes?.find(item => item.shotId === outcome.shotId && item.reason === outcome.reason
            && item.winner === outcome.winner && item.ruleRef === outcome.ruleRef && item.faultingActor === outcome.faultingActor
            && item.struckActor === outcome.struckActor);
        if (!match) throw new DriverFailure('outcome-evidence', 'A complete result requires matching independently validated terminal evidence.');
        const classification = provisional.outcomeClassification;
        if (classification != null && (!plain(classification) || classification.version !== 'rally-causation-v1'
            || !CAUSATION_KINDS.includes(classification.kind) || classification.shotId !== outcome.shotId)) {
            throw new DriverFailure('causation-version', 'Tactical causation must use the supported separate version and physical shot identity.');
        }
    } else if (rules.expectedOutcomes?.length || compiled.timeline.outcome) throw new DriverFailure('censored-evidence', 'A censored prefix cannot conceal a decisive physical ending.');
    return { document, outcome: provisional.status === 'complete' ? clone(document.outcome) : null,
        validation: { sourceShots: document.shots.length, acceptedShots: compiled.validShotCount,
            compilerErrors: 0, unexpectedViolations: 0, expectedOutcomes: rules.expectedOutcomes?.length ?? 0, movement, spacing, generatedFlightFeasibility } };
}

export function createEngineDriverV1(runAttempt, config = {}) {
    if (!plain(config) || Object.keys(config).some(key => !['yieldControl', 'workChunk'].includes(key))) throw new TypeError('Driver configuration contains unsupported fields.');
    const { yieldControl = yieldRallyTurnV1, workChunk = 8 } = config;
    if (typeof runAttempt !== 'function' || typeof yieldControl !== 'function' || !integer(workChunk, 1, 65536)) throw new TypeError('A producer, yield function and bounded positive integer workChunk are required.');
    return async function simulate(input) {
        // Normalize before reading controls: accessors and unknown settings must
        // reject even when a cancellation signal is already set.
        const normalized = normalizeRallyInputV1(input);
        validateControls(input);
        const { signal, onProgress } = input;
        const requestRecipe = createRallyRequestRecipeV1(normalized);
        const conditioned = normalized.options.lengthFeel !== 'natural' || normalized.options.winner !== 'either';
        const maxAttempts = conditioned ? ENGINE_DRIVER_LIMITS.maxAttempts : 1;
        const attemptedSeeds = [], summaries = [];
        let work = 0, rejections = 0, lastProgress = null, activeAttempt = null, settled = false;

        const check = () => {
            if (signal?.aborted) throw new DriverFailure('cancelled', 'Rally generation was cancelled.');
            if (settled) throw new DriverFailure('inactive-checkpoint', 'A settled request cannot continue generation.');
        };
        const emit = (phase, attemptIndex, attemptSeed, shots) => {
            check();
            const record = Object.freeze({ phase, attempt: attemptIndex + 1, attemptIndex, attemptSeed, shots, work });
            lastProgress = record;
            if (onProgress) {
                try {
                    const observed = onProgress(record);
                    if (observed && typeof observed.then === 'function') Promise.resolve(observed).catch(() => {});
                } catch { /* Observation cannot alter the seeded computation. */ }
            }
            check();
        };
        const diagnostics = (code, additional = {}) => ({ version: ENGINE_DRIVER_VERSION, code,
            attempts: attemptedSeeds.length, attemptedSeeds: [...attemptedSeeds], attemptSummaries: clone(summaries),
            work, rejections, phase: lastProgress?.phase ?? 'before-start', ...additional });
        const noDocument = (status, code, additional = {}, suppliedTrace = undefined, traceSource = 'none') => {
            const trace = partialTrace(suppliedTrace, traceSource);
            return { status, document: null, outcome: null, decisions: trace.decisions,
                stats: null, recipe: requestRecipe,
                diagnostics: diagnostics(code, { ...additional, partialTrace: trace.diagnostic }), outcomeClassification: null };
        };
        let provisional = null;
        try {
            check();
            for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex++) {
                check();
                const attemptSeed = deriveRallySeedV1(normalized.seed, attemptIndex), random = createRallyRandomV1(attemptSeed);
                attemptedSeeds.push(attemptSeed); activeAttempt = attemptIndex;
                let attemptWork = 0, workAtYield = 0, shots = 0;
                emit(attemptIndex ? 'retry' : 'attempt', attemptIndex, attemptSeed, 0);
                const checkpoint = async ({ shots: nextShots = shots, workDelta = 1, phase = 'search', forceYield = false } = {}) => {
                    check();
                    if (activeAttempt !== attemptIndex) throw new DriverFailure('inactive-checkpoint', 'An old attempt cannot emit progress.');
                    if (!integer(nextShots, 0, normalized.options.maxShots) || !integer(workDelta, 0, ENGINE_DRIVER_LIMITS.maxWorkPerAttempt)
                        || !PHASES.includes(phase) || typeof forceYield !== 'boolean') throw new DriverFailure('checkpoint-input', 'A checkpoint requires bounded work, shots and a supported phase.');
                    if (attemptWork + workDelta > ENGINE_DRIVER_LIMITS.maxWorkPerAttempt || work + workDelta > ENGINE_DRIVER_LIMITS.maxWork) throw new DriverFailure('work-budget-exhausted', 'Generation exhausted its explicit bounded work budget.');
                    attemptWork += workDelta; work += workDelta; shots = nextShots;
                    emit(phase, attemptIndex, attemptSeed, shots);
                    if (forceYield || attemptWork - workAtYield >= workChunk) {
                        await yieldControl(); workAtYield = attemptWork; check();
                        if (activeAttempt !== attemptIndex) throw new DriverFailure('inactive-checkpoint', 'An old attempt cannot resume generation.');
                    }
                };
                provisional = await runAttempt(normalized, { attemptIndex, attemptSeed, random, checkpoint });
                check();
                if (!plain(provisional) || !PROVISIONAL_STATUSES.includes(provisional.status)) throw new DriverFailure('attempt-status', 'Attempt returned an unsupported result status.');
                const rejected = provisional.diagnostics?.rejections;
                if (rejected !== undefined && (!integer(rejected, 0, ENGINE_DRIVER_LIMITS.maxWorkPerAttempt))) throw new DriverFailure('attempt-rejections', 'Attempt rejection counts must be bounded nonnegative integers.');
                rejections += rejected ?? 0;
                if (provisional.status === 'failed') {
                    summaries.push({ attemptIndex, attemptSeed, status: 'failed', shots, work: attemptWork, rejections: rejected ?? 0 });
                    const code = provisional.diagnostics?.code;
                    if (code !== undefined && (typeof code !== 'string' || !code.length || code.length > 128)) throw new DriverFailure('attempt-diagnostic', 'Attempt diagnostic codes must be bounded strings.');
                    return noDocument('failed', code || 'search-failed', { producer: clone(provisional.diagnostics ?? {}) },
                        traceProperty(provisional, 'decisions').value, 'producer');
                }
                const recipe = createGenerationRecipeV1(normalized, { attempts: attemptIndex + 1, selectedAttempt: attemptIndex, selectedSeed: attemptSeed });
                shots = provisional.document?.shots?.length ?? shots;
                await checkpoint({ shots, workDelta: 0, phase: 'validating', forceYield: true });
                const validated = validateAttemptDocument(provisional, normalized, recipe);
                check();
                // Pending cancellation gets a macroturn before the selected
                // result can leave the driver; workers remain terminable too.
                await checkpoint({ shots, workDelta: 0, phase: 'validating', forceYield: true });
                const accepted = !conditioned || provisional.status === 'complete'
                    && lengthMatches(normalized.options.lengthFeel, shots)
                    && (normalized.options.winner === 'either' || validated.outcome.winner === normalized.options.winner);
                summaries.push({ attemptIndex, attemptSeed, status: provisional.status, shots, work: attemptWork,
                    rejections: rejected ?? 0, selected: accepted });
                activeAttempt = null;
                if (accepted) {
                    check();
                    return { status: provisional.status, document: validated.document, outcome: validated.outcome,
                        decisions: clone(provisional.decisions), stats: { ...clone(provisional.stats ?? {}),
                            generatedFlightFeasibility: { version: validated.validation.generatedFlightFeasibility.version,
                                status: validated.validation.generatedFlightFeasibility.status,
                                checkedFlights: validated.validation.generatedFlightFeasibility.checkedFlights } }, recipe,
                        diagnostics: diagnostics('selected', { validation: validated.validation, producer: clone(provisional.diagnostics ?? {}) }),
                        outcomeClassification: clone(provisional.outcomeClassification ?? null) };
                }
                provisional = null;
            }
            return noDocument('unsatisfied', 'selection-unsatisfied');
        } catch (failure) {
            const attached = traceProperty(failure, 'partialDecisions');
            const trace = attached.present ? attached.value : traceProperty(provisional, 'decisions').value;
            const traceSource = attached.present ? 'error' : provisional ? 'producer' : 'none';
            if (signal?.aborted || failure?.code === 'cancelled') return noDocument('cancelled', 'cancelled', {}, trace, traceSource);
            return noDocument('failed', typeof failure?.code === 'string' ? failure.code : 'attempt-exception', {
                message: typeof failure?.message === 'string' ? failure.message.slice(0, 1000) : 'Generation failed.',
                ...(failure?.details ? { validation: diagnosticClone(failure.details) } : {}),
                ...(provisional?.diagnostics ? { producer: diagnosticClone(provisional.diagnostics) } : {})
            }, trace, traceSource);
        } finally { settled = true; activeAttempt = null; }
    };
}
