// Versioned, request-local random streams. Scheduling and presentation never
// consume policy/execution draws, and no wall-clock value enters a recipe.
export const RALLY_RANDOM_VERSION = 'rally-random-v1';
export const RALLY_STREAMS = Object.freeze(['intent', 'target', 'execution', 'narration']);

function uint32(value, name) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new TypeError(`${name} must be a uint32.`);
    return value;
}

function mix(value) {
    value = Math.imul(value ^ value >>> 16, 0x7feb352d);
    value = Math.imul(value ^ value >>> 15, 0x846ca68b);
    return (value ^ value >>> 16) >>> 0;
}

const salts = Object.freeze({ intent: 0x243f6a88, target: 0x85a308d3, execution: 0x13198a2e, narration: 0x03707344 });

/** A bijective uint32 stride gives 64 distinct, versioned selection attempts. */
export function deriveRallySeedV1(seed, attempt) {
    uint32(seed, 'seed');
    if (!Number.isInteger(attempt) || attempt < 0 || attempt > 63) throw new RangeError('attempt must be between 0 and 63.');
    return (seed + Math.imul(attempt, 0x9e3779b9)) >>> 0;
}

export function createRallyRandomV1(seed) {
    uint32(seed, 'seed');
    const counts = Object.fromEntries(RALLY_STREAMS.map(name => [name, 0]));
    const streams = Object.fromEntries(RALLY_STREAMS.map(name => {
        let state = mix(seed ^ salts[name]);
        return [name, () => {
            counts[name]++;
            state = (state + 0x6d2b79f5) >>> 0;
            let value = Math.imul(state ^ state >>> 15, 1 | state);
            value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
            return ((value ^ value >>> 14) >>> 0) / 0x100000000;
        }];
    }));
    return Object.freeze({ ...streams, snapshot: () => Object.freeze({ version: RALLY_RANDOM_VERSION, seed, draws: Object.freeze({ ...counts }) }) });
}
