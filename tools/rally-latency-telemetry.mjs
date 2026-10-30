import { createHook } from 'node:async_hooks';
import { PerformanceObserver, performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { cpus, availableParallelism, loadavg } from 'node:os';

const safeRead = path => { try { return readFileSync(path, 'utf8'); } catch (error) { return { unavailable: error.code }; } };
export function hostSnapshotV1() {
  const whitelist = ['CI', 'GITHUB_ACTIONS', 'RUNNER_OS', 'RUNNER_ARCH', 'RUNNER_NAME', 'RUNNER_ENVIRONMENT', 'ImageOS', 'ImageVersion', 'NODE_OPTIONS'];
  return { at: performance.now(), date: new Date().toISOString(), node: process.version, versions: process.versions,
    platform: process.platform, arch: process.arch, cpus: cpus(), availableParallelism: availableParallelism(), loadavg: loadavg(),
    proc: Object.fromEntries(['/proc/cpuinfo', '/proc/loadavg', '/proc/self/status', '/proc/self/cgroup', '/proc/pressure/cpu', '/proc/pressure/memory', '/sys/fs/cgroup/cpu.stat', '/sys/fs/cgroup/cpu.max', '/sys/fs/cgroup/cpu.pressure', '/sys/fs/cgroup/memory.current'].map(p => [p, safeRead(p)])),
    environment: Object.fromEntries(whitelist.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]])) };
}
export function createLatencyTelemetryV1() {
  const gc = [], ports = [], phases = [], spans = [], pairs = new Map(), activeBefore = new Map();
  let pending = null, currentSpan = null;
  const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) gc.push({ startTime: entry.startTime, duration: entry.duration, entryType: entry.entryType, detail: entry.detail }); });
  observer.observe({ entryTypes: ['gc'] });
  const hook = createHook({
    init(id, type, trigger) {
      if (type !== 'MESSAGEPORT') return;
      const item = { id, trigger, initializedAt: performance.now(), spanId: currentSpan?.id ?? null };
      ports.push(item);
      if (pending && pending.trigger === trigger && pending.spanId === item.spanId) {
        const pair = { first: pending, second: item, observedFirstBeforeAt: null };
        pairs.set(pending.id, pair); pending = null;
      } else pending = item;
    },
    before(id) { const pair = pairs.get(id); if (pair && pair.observedFirstBeforeAt === null) { pair.observedFirstBeforeAt = performance.now(); pair.initToFirstBeforeMs = pair.observedFirstBeforeAt - pair.first.initializedAt; activeBefore.set(id, pair.observedFirstBeforeAt); } },
    after(id) { if (activeBefore.has(id)) { const pair = pairs.get(id); pair.firstCallbackMs = performance.now() - activeBefore.get(id); activeBefore.delete(id); } },
  });
  hook.enable();
  const snapshot = () => ({ at: performance.now(), cpu: process.cpuUsage(), memory: process.memoryUsage(), resourceUsage: process.resourceUsage() });
  return {
    phases, spans, gc, ports,
    event(phase, additional = {}) { const entry = { phase, at: performance.now(), ...additional }; phases.push(entry); return entry; },
    clock(jobId, boundary) { const at = performance.now(); const state = snapshot(); phases.push({ phase: 'collector-clock', jobId, boundary, at, snapshot: state }); if (boundary === 0) { currentSpan = { id: jobId, kind: 'collector-generation', before: state, exactStart: at }; spans.push(currentSpan); } else if (boundary === 1 && currentSpan) { currentSpan.after = state; currentSpan.exactEnd = at; currentSpan.wallMs = at - currentSpan.exactStart; currentSpan.cpuDelta = { user: state.cpu.user - currentSpan.before.cpu.user, system: state.cpu.system - currentSpan.before.cpu.system }; currentSpan = null; } return at; },
    begin(id, kind) { const span = { id, kind, before: snapshot() }; spans.push(span); currentSpan = span; return span; },
    end(span) { span.after = snapshot(); span.wallMs = span.after.at - span.before.at; span.cpuDelta = { user: span.after.cpu.user - span.before.cpu.user, system: span.after.cpu.system - span.before.cpu.system }; if (currentSpan === span) currentSpan = null; },
    finish() { hook.disable(); for (const entry of observer.takeRecords()) gc.push({ startTime: entry.startTime, duration: entry.duration, entryType: entry.entryType, detail: entry.detail }); observer.disconnect(); for (const span of spans) { const related = [...pairs.values()].filter(pair => pair.first.spanId === span.id && pair.first.initializedAt >= (span.exactStart ?? span.before.at) && pair.first.initializedAt <= (span.exactEnd ?? span.after?.at ?? Infinity)); span.observedYieldCount = related.filter(pair => pair.observedFirstBeforeAt !== null).length; span.observedYieldInitToBeforeMs = related.reduce((sum, pair) => sum + (pair.initToFirstBeforeMs ?? 0), 0); span.overlappingGC = gc.filter(entry => entry.startTime < (span.exactEnd ?? span.after?.at ?? Infinity) && entry.startTime + entry.duration > (span.exactStart ?? span.before.at)); } return { instrumentation: 'async_hooks MESSAGEPORT init/before/after and PerformanceObserver GC enabled throughout collection. Instrumentation overhead included, not subtracted. Port pair init-to-first-before is scheduling interval, not CPU cost or exact await duration; validated against toy channels.', phases, spans, gc, ports, yieldPairs: [...pairs.values()] }; },
  };
}
