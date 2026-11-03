import test from 'node:test';
import assert from 'node:assert/strict';
import { createRallyRandomV1, deriveRallySeedV1, RALLY_STREAMS } from '../rally-random.js';

test('request-local streams repeat and narration cannot perturb policy or execution', () => {
    const a = createRallyRandomV1(7), b = createRallyRandomV1(7), c = createRallyRandomV1(7);
    for (let i = 0; i < 100; i++) {
        for (let j = 0; j <= i % 5; j++) b.narration();
        assert.equal(a.intent(), b.intent());
        assert.equal(a.execution(), b.execution());
        assert.equal(a.target(), b.target());
    }
    assert.equal(c.snapshot().draws.intent, 0, 'another request owns an independent cursor');
    assert.deepEqual(a.snapshot().draws, { intent: 100, target: 100, execution: 100, narration: 0 });
    assert.ok(b.snapshot().draws.narration > 100);
});

test('selection sub-seeds are distinct, bounded and wrap deterministically', () => {
    for (const seed of [0, 7, 0xffffffff]) {
        const values = Array.from({ length: 64 }, (_, i) => deriveRallySeedV1(seed, i));
        assert.equal(values[0], seed);
        assert.equal(new Set(values).size, 64);
        assert.ok(values.every(value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff));
        assert.deepEqual(values, Array.from({ length: 64 }, (_, i) => deriveRallySeedV1(seed, i)));
    }
    for (const seed of [-1, 0x100000000, .5, NaN, '7']) assert.throws(() => createRallyRandomV1(seed), /uint32/);
    for (const attempt of [-1, 64, .5, NaN]) assert.throws(() => deriveRallySeedV1(7, attempt), /attempt/);
});

test('each named stream supplies finite unit draws and a distinct sequence', () => {
    const random = createRallyRandomV1(0), signatures = [];
    for (const name of RALLY_STREAMS) {
        const values = Array.from({ length: 100 }, () => random[name]());
        assert.ok(values.every(value => Number.isFinite(value) && value >= 0 && value < 1));
        signatures.push(JSON.stringify(values));
    }
    assert.equal(new Set(signatures).size, RALLY_STREAMS.length);
});
