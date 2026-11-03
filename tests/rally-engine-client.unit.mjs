import test from 'node:test';
import assert from 'node:assert/strict';
import { createRallyWorkerClientV1 } from '../rally-engine-client.js';

class OwnedWorker {
    listeners = new Map();
    starts = [];
    terminated = 0;
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
    terminate() { this.terminated++; }
    postMessage(message) { this.starts.push(message); }
    dispatch(type, data) { this.listeners.get(type)?.({ data, message: data?.message, preventDefault() {} }); }
}

function harness() {
    const workers = [];
    return { workers, run: createRallyWorkerClientV1({ createWorker: () => { const worker = new OwnedWorker(); workers.push(worker); return worker; } }) };
}
const progressAt = (phase, attempt = 1) => ({ phase, attempt, attemptIndex: attempt - 1, attemptSeed: attempt === 1 ? 7 : 9, shots: 0, work: 1 });

test('malformed and already-aborted inputs allocate no worker', async () => {
    const { run, workers } = harness(), controller = new AbortController();
    controller.abort();
    const result = await run({ seed: 7, signal: controller.signal, onProgress: () => assert.fail('cancelled progress') });
    assert.equal(result.status, 'cancelled');
    assert.equal(result.document, null);
    assert.equal(result.diagnostics.phase, 'before-start');
    assert.equal(result.diagnostics.attempts, 0);
    assert.deepEqual(result.diagnostics.attemptedSeeds, []);
    assert.equal(result.recipe.seed, 7);
    assert.equal(result.recipe.selection, null);
    assert.equal(workers.length, 0);
    for (const input of [{ seed: -1, signal: controller.signal }, { seed: 7, extra: true }, { seed: 7, onProgress: 1 }, { seed: 7, signal: {} }]) {
        await assert.rejects(run(input), TypeError);
    }
    let read = false;
    const accessor = { seed: 7, get onProgress() { read = true; return () => {}; } };
    await assert.rejects(run(accessor), /accessor/);
    assert.equal(read, false);
    assert.equal(workers.length, 0);
});

test('each concurrent request owns its wire input, progress and worker lifetime', async () => {
    const { run, workers } = harness(), aProgress = [], bProgress = [];
    const a = run({ seed: 7, onProgress: p => aProgress.push(p) });
    const b = run({ seed: 9, onProgress: p => bProgress.push(p) });
    assert.equal(workers.length, 2);
    assert.equal(workers[0].starts[0].input.seed, 7);
    assert.equal(workers[1].starts[0].input.seed, 9);
    assert.deepEqual(Object.keys(workers[0].starts[0].input), ['players', 'layout', 'service', 'seed', 'options']);
    const progress = progressAt('search');
    workers[1].dispatch('message', { type: 'progress', progress });
    progress.attempt = 2;
    assert.deepEqual(aProgress, []);
    assert.deepEqual(bProgress, [progressAt('search')]);
    workers[1].dispatch('message', { type: 'result', result: { status: 'censored', document: { id: 'b' } } });
    workers[0].dispatch('message', { type: 'result', result: { status: 'complete', document: { id: 'a' } } });
    assert.equal((await a).document.id, 'a');
    assert.equal((await b).document.id, 'b');
    assert.deepEqual(workers.map(w => w.terminated), [1, 1]);
    assert.deepEqual(workers.map(w => w.listeners.size), [0, 0]);
});

test('abort during final validation terminates the owned worker and suppresses late progress/results', async () => {
    const { run, workers } = harness(), controller = new AbortController(), seen = [];
    const pending = run({ seed: 7, signal: controller.signal, onProgress: progress => { seen.push(progress); if (progress.phase === 'validating') controller.abort(); } });
    const worker = workers[0], lateMessage = worker.listeners.get('message');
    worker.dispatch('message', { type: 'progress', progress: progressAt('validating') });
    const result = await pending;
    assert.equal(result.status, 'cancelled');
    assert.equal(result.document, null);
    assert.equal(result.outcome, null);
    assert.equal(result.diagnostics.phase, 'validating');
    assert.equal(result.diagnostics.attempts, 1);
    assert.deepEqual(result.diagnostics.attemptedSeeds, [7]);
    assert.equal(worker.terminated, 1);
    assert.equal(worker.listeners.size, 0);
    lateMessage({ data: { type: 'progress', progress: { phase: 'finished' } } });
    lateMessage({ data: { type: 'result', result: { status: 'complete', document: { id: 'must-not-install' } } } });
    assert.deepEqual(seen, [progressAt('validating')]);
});

test('worker errors reject and dispose the owned worker', async () => {
    for (const type of ['error', 'messageerror', 'invalid-result', 'invalid-progress']) {
        const { run, workers } = harness();
        const pending = run({ seed: 7 });
        const rejected = assert.rejects(pending, /worker|unsupported|unreadable/);
        if (type === 'invalid-result') workers[0].dispatch('message', { type: 'result', result: { status: 'invented' } });
        else if (type === 'invalid-progress') workers[0].dispatch('message', { type: 'progress', progress: { phase: 'search' } });
        else workers[0].dispatch(type, { message: 'worker failed' });
        await rejected;
        assert.equal(workers[0].terminated, 1);
        assert.equal(workers[0].listeners.size, 0);
    }
});

test('a throwing progress observer cannot change the result or stop another request', async () => {
    const { run, workers } = harness();
    let notified = 0;
    const pending = run({ seed: 7, onProgress: () => {
        notified++;
        if (notified === 1) throw Error('consumer failed');
        return Promise.reject(Error('async consumer failed'));
    } });
    workers[0].dispatch('message', { type: 'progress', progress: progressAt('search') });
    workers[0].dispatch('message', { type: 'progress', progress: progressAt('validating') });
    const result = { status: 'complete', document: { id: 'unchanged' } };
    workers[0].dispatch('message', { type: 'result', result });
    assert.deepEqual(await pending, result);
    assert.equal(notified, 2);
    assert.equal(workers[0].terminated, 1);
});
