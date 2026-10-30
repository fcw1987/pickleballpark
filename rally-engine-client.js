// Browser boundary only. Every request owns one worker; no generated result is
// installed in a builder or playback session here.
import { normalizeRallyInputV1, createRallyRequestRecipeV1 } from './rally-recipe.js';

const RESULT_STATUSES = new Set(['complete', 'censored', 'unsatisfied', 'cancelled', 'failed']);
const PROGRESS_PHASES = new Set(['attempt', 'retry', 'search', 'validating']);
const copy = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));

function progressRecord(value) {
    const allowed = ['phase', 'attempt', 'attemptIndex', 'attemptSeed', 'shots', 'work'];
    const integer = (number, low, high) => Number.isInteger(number) && number >= low && number <= high;
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some(key => !allowed.includes(key)) || !PROGRESS_PHASES.has(value.phase)
        || !integer(value.attempt, 1, 64) || value.attemptIndex !== value.attempt - 1
        || !integer(value.attemptSeed, 0, 0xffffffff) || !integer(value.shots, 0, 99)
        || !integer(value.work, 0, 1000000000)) throw new TypeError('The rally worker returned unsupported progress.');
    return copy(value);
}

function validateControls(input) {
    if (input?.onProgress !== undefined && typeof input.onProgress !== 'function') throw new TypeError('onProgress must be a function.');
    const signal = input?.signal;
    if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean'
        || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
        throw new TypeError('signal must be an AbortSignal.');
    }
}

function cancelled(normalized, phase, lastProgress, observedAttempts = new Map()) {
    return {
        status: 'cancelled', document: null, outcome: null, decisions: [], stats: null,
        recipe: createRallyRequestRecipeV1(normalized),
        diagnostics: { code: 'cancelled', attempts: observedAttempts.size,
            attemptedSeeds: [...observedAttempts].sort((a, b) => a[0] - b[0]).map(([, seed]) => seed), phase, lastProgress }, outcomeClassification: null
    };
}

/** Dependency injection is confined to the adapter, never the saved recipe. */
export function createRallyWorkerClientV1({ createWorker = () => new Worker(new URL('./rally-engine-worker.js', import.meta.url), { type: 'module' }) } = {}) {
    if (typeof createWorker !== 'function') throw new TypeError('createWorker must be a function.');
    return async function simulateRallyInWorker(input) {
        // Validate before allocating a worker or letting an already-aborted
        // request conceal a bad recipe. The strict normalizer rejects accessors
        // before the driver reads callbacks and cancellation controls.
        const normalized = normalizeRallyInputV1(input);
        validateControls(input);
        const { signal, onProgress } = input || {};
        if (signal?.aborted) return Promise.resolve(cancelled(normalized, 'before-start', null));

        return new Promise((resolve, reject) => {
            let worker = null, settled = false, lastProgress = null;
            const observedAttempts = new Map();
            const cleanup = () => {
                signal?.removeEventListener('abort', abort);
                if (worker) {
                    worker.removeEventListener('message', message);
                    worker.removeEventListener('error', error);
                    worker.removeEventListener('messageerror', messageError);
                    worker.terminate();
                }
            };
            const finish = (result, failure = null) => {
                if (settled) return;
                settled = true;
                cleanup();
                if (failure) reject(failure); else resolve(result);
            };
            const abort = () => finish(cancelled(normalized, lastProgress?.phase || 'worker', lastProgress, observedAttempts));
            const error = event => {
                event.preventDefault?.();
                finish(null, new Error(event.message || 'The rally worker could not run.'));
            };
            const messageError = () => finish(null, new TypeError('The rally worker returned an unreadable message.'));
            const message = event => {
                if (settled || signal?.aborted) return;
                const data = event.data;
                if (data?.type === 'progress') {
                    try {
                        lastProgress = progressRecord(data.progress);
                        if (observedAttempts.has(lastProgress.attemptIndex) && observedAttempts.get(lastProgress.attemptIndex) !== lastProgress.attemptSeed) {
                            throw new TypeError('The rally worker changed an attempt seed.');
                        }
                        observedAttempts.set(lastProgress.attemptIndex, lastProgress.attemptSeed);
                    } catch (failure) { finish(null, failure); }
                    // Progress is observational. A consumer exception must not
                    // change seeded decisions or turn a valid point into a failure.
                    if (!settled) {
                        try {
                            const observed = onProgress?.(copy(lastProgress));
                            if (observed && typeof observed.then === 'function') Promise.resolve(observed).catch(() => {});
                        } catch {}
                    }
                } else if (data?.type === 'result') {
                    if (!data.result || !RESULT_STATUSES.has(data.result.status)) {
                        finish(null, new TypeError('The rally worker returned an unsupported result.'));
                    } else finish(data.result);
                } else if (data?.type === 'error') {
                    const failure = new Error(data.error?.message || 'Rally generation failed in the worker.');
                    failure.name = data.error?.name || 'Error';
                    finish(null, failure);
                } else finish(null, new TypeError('The rally worker returned an unsupported message.'));
            };
            try {
                worker = createWorker();
                worker.addEventListener('message', message);
                worker.addEventListener('error', error);
                worker.addEventListener('messageerror', messageError);
                signal?.addEventListener('abort', abort, { once: true });
                if (signal?.aborted) { abort(); return; }
                worker.postMessage({ type: 'start', input: copy(normalized) });
            } catch (failure) { finish(null, failure); }
        });
    };
}

export const simulateRallyInWorker = createRallyWorkerClientV1();
