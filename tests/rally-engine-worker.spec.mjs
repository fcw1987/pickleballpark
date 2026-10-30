import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compileDocument } from '../play-compiler.js';
import { validateDocument } from '../play-document.js';
import { validateRallyRules } from '../rally-rules.js';
import { samplePlayBall } from '../three-d-core.js';

test.use({ serviceWorkers: 'block' });

const project = result => Object.fromEntries(['status', 'document', 'outcome', 'decisions', 'stats', 'recipe', 'outcomeClassification'].map(key => [key, result[key]]));
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
async function nodeResult(input) {
    const { simulateRally } = await import('../rally-engine.js');
    const source = JSON.stringify(input), result = await simulateRally(input);
    expect(JSON.stringify(input)).toBe(source);
    expect(['complete', 'censored']).toContain(result.status);
    validateDocument(result.document);
    const compiled = compileDocument(result.document), rules = validateRallyRules(compiled.play, compiled.timeline);
    expect(compiled.validShotCount).toBe(result.document.shots.length);
    expect(compiled.findings.filter(f => f.severity === 'error')).toEqual([]);
    expect(rules.violations).toEqual([]);
    return { result, compiled };
}

async function openHost(page) {
    await page.goto('/tests/fixtures/rally-worker-host.html');
    await page.evaluate(async () => {
        window.rallyWorkerClient = await import('/rally-engine-client.js');
        localStorage.setItem('rally-worker-sentinel', 'preserve unrelated data');
    });
}

test('module-worker points match Node and repeat independently of progress observers', async ({ page }, testInfo) => {
    const players = (style, mixedHands) => Object.fromEntries(['player1', 'player2', 'player3', 'player4'].map((id, index) =>
        [id, { team: index < 2 ? 'green' : 'orange', handedness: mixedHands && index % 2 ? 'right' : 'left', style, flavour: 'balanced' }]));
    const rightPlayers = style => Object.fromEntries(['player1', 'player2', 'player3', 'player4'].map((id, index) =>
        [id, { team: index < 2 ? 'green' : 'orange', handedness: 'right', style, flavour: 'balanced' }]));
    const inputs = [
        ['advanced', { seed: 7 }],
        ['pro-orange-left', { seed: 19, players: players('pro', true), service: { server: 'player3', receiver: 'player1', court: 'left' } }],
        ['intermediate-green-left', { seed: 31, players: players('intermediate', false), service: { server: 'player1', receiver: 'player3', court: 'left' } }],
        ['dink-popup-volley', { seed: 1074, players: rightPlayers('advanced'), service: { server: 'player3', receiver: 'player1', court: 'right' }, options: { maxShots: 6 } }],
        ['dink-popup-groundstroke', { seed: 1002, players: rightPlayers('pro'), service: { server: 'player3', receiver: 'player1', court: 'right' }, options: { maxShots: 15 } }]
    ];
    for (const [label, input] of inputs) {
        const expected = await nodeResult(input);
        if (label.startsWith('dink-popup-')) {
            const contact = expected.result.decisions.at(-1).situation;
            expect(contact.attackable).toBe(true);
            expect(contact.contactKind).toBe(label === 'dink-popup-volley' ? 'volley' : 'groundstroke');
            expect(expected.result.document.generation.policyVersion).toBe('rally-policy-v3');
        }
        const { createRallySimulator } = await import('../rally-engine.js');
        let denseYields = 0, sparseYields = 0;
        const dense = await createRallySimulator({ workChunk: 1, yieldControl: async () => { denseYields++; } })(input);
        const sparse = await createRallySimulator({ workChunk: 65536, yieldControl: async () => { sparseYields++; } })(input);
        expect(project(dense)).toEqual(project(expected.result));
        expect(project(sparse)).toEqual(project(expected.result));
        expect(denseYields).toBeGreaterThan(sparseYields);
        expect(sparseYields).toBeGreaterThanOrEqual(2);
        const times = [0, expected.compiled.timeline.duration / 4, expected.compiled.timeline.duration / 2, expected.compiled.timeline.duration];
        const positions = times.map(time => samplePlayBall(expected.compiled.timeline, time));
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await openHost(page);
        const actual = await page.evaluate(async ({ input, times }) => {
            const before = JSON.stringify(input), phases = [];
            const { simulateRallyInWorker } = window.rallyWorkerClient;
            const first = await simulateRallyInWorker({ ...input, onProgress: p => {
                phases.push(p.phase);
                if (phases.length % 2) throw Error('An observer cannot alter the point.');
                return Promise.reject(Error('Neither can an asynchronous observer.'));
            } });
            const second = await simulateRallyInWorker(input);
            const { compileDocument } = await import('/play-compiler.js');
            const { validateRallyRules } = await import('/rally-rules.js');
            const { samplePlayBall } = await import('/three-d-core.js');
            const compiled = compileDocument(first.document), rules = validateRallyRules(compiled.play, compiled.timeline);
            const projection = result => Object.fromEntries(['status', 'document', 'outcome', 'decisions', 'stats', 'recipe', 'outcomeClassification'].map(key => [key, result[key]]));
            return { first: projection(first), second: projection(second), phases,
                samples: times.map(time => samplePlayBall(compiled.timeline, time)),
                errors: compiled.findings.filter(f => f.severity === 'error'), violations: rules.violations,
                unchanged: JSON.stringify(input) === before,
                sentinel: localStorage.getItem('rally-worker-sentinel'), builderInstalled: window.playBuilder !== undefined };
        }, { input, times });
        const physicalErrorMeters = Math.max(...positions.flatMap((position, index) => ['x', 'y', 'z'].map(axis => Math.abs(actual.samples[index][axis] - position[axis]))));
        const parityPath = testInfo.outputPath(`worker-parity-${label}.json`);
        await writeFile(parityPath, JSON.stringify({ seed: input.seed, recipe: expected.result.recipe,
            node: digest(project(expected.result)), denseSchedule: digest(project(dense)), sparseSchedule: digest(project(sparse)),
            browserFirst: digest(actual.first), browserRepeated: digest(actual.second), denseYields, sparseYields, physicalErrorMeters }, null, 2));
        await testInfo.attach(`worker-parity-${label}`, { path: parityPath, contentType: 'application/json' });
        expect(actual.first).toEqual(project(expected.result));
        expect(actual.second).toEqual(project(expected.result));
        expect(actual.phases).toContain('validating');
        expect(actual.errors).toEqual([]);
        expect(actual.violations).toEqual([]);
        expect(actual.unchanged).toBe(true);
        expect(actual.sentinel).toBe('preserve unrelated data');
        expect(actual.builderInstalled).toBe(false);
        expect(errors).toEqual([]);
        for (let index = 0; index < positions.length; index++) for (const axis of ['x', 'y', 'z']) {
            expect(Math.abs(actual.samples[index][axis] - positions[index][axis])).toBeLessThan(1e-6);
        }
    }
});

test('invalid and pre-cancelled requests start no browser worker and claim no selected origin', async ({ page }) => {
    await openHost(page);
    const result = await page.evaluate(async () => {
        let created = 0;
        const run = window.rallyWorkerClient.createRallyWorkerClientV1({ createWorker: () => { created++; throw Error('No worker should start.'); } });
        const controller = new AbortController(); controller.abort();
        const cancelled = await run({ seed: 7, signal: controller.signal });
        const errors = [];
        for (const input of [{ seed: -1, signal: controller.signal }, { seed: 7, options: { maxShots: 100 } }, { seed: 7, onProgress: true }]) {
            try { await run(input); errors.push('accepted'); } catch (error) { errors.push(error.name); }
        }
        return { created, cancelled, errors };
    });
    expect(result.created).toBe(0);
    expect(result.cancelled).toMatchObject({ status: 'cancelled', document: null, outcome: null,
        recipe: { selection: null }, diagnostics: { attempts: 0, attemptedSeeds: [], phase: 'before-start' } });
    expect(result.errors).toEqual(['TypeError', 'TypeError', 'TypeError']);
});

test('cancellation during retries and validation terminates only its owned worker', async ({ page }) => {
    const natural = await nodeResult({ seed: 7 });
    expect(natural.result.status).toBe('complete');
    const unwantedWinner = natural.result.outcome.winner === 'green' ? 'orange' : 'green';
    const healthy = await nodeResult({ seed: 11 });
    await openHost(page);
    const result = await page.evaluate(async winner => {
        let created = 0, terminated = 0;
        const run = window.rallyWorkerClient.createRallyWorkerClientV1({ createWorker: () => {
            created++;
            const worker = new Worker('/rally-engine-worker.js', { type: 'module' });
            const stop = worker.terminate.bind(worker);
            worker.terminate = () => { terminated++; stop(); };
            return worker;
        } });
        const retry = new AbortController(), retryProgress = [];
        const retryResult = await run({ seed: 7, options: { winner }, signal: retry.signal,
            onProgress: progress => { retryProgress.push(progress); if (progress.phase === 'retry') retry.abort(); } });
        const validation = new AbortController(), validationProgress = [];
        const cancelled = run({ seed: 7, signal: validation.signal,
            onProgress: progress => { validationProgress.push(progress); if (progress.phase === 'validating') validation.abort(); } });
        const healthy = run({ seed: 11 });
        const [validationResult, healthyResult] = await Promise.all([cancelled, healthy]);
        const retryCount = retryProgress.length, validationCount = validationProgress.length;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const projection = result => Object.fromEntries(['status', 'document', 'outcome', 'decisions', 'stats', 'recipe', 'outcomeClassification'].map(key => [key, result[key]]));
        return { retryResult, validationResult, healthy: projection(healthyResult), created, terminated,
            retryProgress, validationProgress, lateProgress: retryProgress.length !== retryCount || validationProgress.length !== validationCount };
    }, unwantedWinner);
    expect(result.retryResult).toMatchObject({ status: 'cancelled', document: null, outcome: null,
        recipe: { selection: null }, diagnostics: { phase: 'retry', attempts: 2 } });
    expect(result.retryResult.diagnostics.attemptedSeeds).toHaveLength(2);
    expect(result.validationResult).toMatchObject({ status: 'cancelled', document: null, outcome: null,
        recipe: { selection: null }, diagnostics: { phase: 'validating' } });
    expect(result.validationProgress.at(-1).phase).toBe('validating');
    expect(result.healthy).toEqual(project(healthy.result));
    expect(result.created).toBe(3);
    expect(result.terminated).toBe(3);
    expect(result.lateProgress).toBe(false);
});

test('conditioned worker generation leaves the host responsive without installing UI or a clock', async ({ page }, testInfo) => {
    await openHost(page);
    const result = await page.evaluate(async () => {
        const longTasks = [], beats = [];
        const longTaskSupported = PerformanceObserver.supportedEntryTypes?.includes('longtask') === true;
        const observer = longTaskSupported ? new PerformanceObserver(list => {
            for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }) : null;
        observer?.observe({ type: 'longtask' });
        const interval = setInterval(() => beats.push(performance.now()), 4);
        const started = performance.now(), statuses = [], requests = [];
        try {
            for (const [seed, lengthFeel] of [[22, 'epic'], [23, 'long']]) {
                const result = await window.rallyWorkerClient.simulateRallyInWorker({ seed, options: { lengthFeel } });
                statuses.push(result.status);
                requests.push({ seed, lengthFeel, status: result.status, code: result.diagnostics?.code, attempts: result.diagnostics?.attempts,
                    failure: result.diagnostics?.producer?.executionFailure?.reason ?? null });
            }
            await new Promise(resolve => requestAnimationFrame(resolve));
            for (const entry of observer?.takeRecords() || []) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        } finally { clearInterval(interval); observer?.disconnect(); }
        return { statuses, requests, longTaskSupported, longTasks, beats: beats.length,
            maxHeartbeatGapMs: beats.reduce((max, time, i) => i ? Math.max(max, time - beats[i - 1]) : max, 0),
            durationMs: performance.now() - started, builderInstalled: window.playBuilder !== undefined,
            sentinel: localStorage.getItem('rally-worker-sentinel') };
    });
    const path = testInfo.outputPath('worker-responsiveness.json');
    await writeFile(path, JSON.stringify({ ...result, note: result.longTaskSupported
        ? 'Long Task API measured the blank main-thread host during real worker generation.'
        : 'Long Task API unavailable in this engine; heartbeat is observed scheduling evidence, not proof of a 50 ms task bound.' }, null, 2));
    await testInfo.attach('worker-responsiveness', { path, contentType: 'application/json' });
    expect(result.statuses.every(status => ['complete', 'unsatisfied'].includes(status))).toBe(true);
    expect(result.beats).toBeGreaterThan(0);
    expect(result.longTasks.filter(task => task.duration > 50)).toEqual([]);
    if (testInfo.project.name === 'chromium') expect(result.longTaskSupported).toBe(true);
    expect(result.builderInstalled).toBe(false);
    expect(result.sentinel).toBe('preserve unrelated data');
});
