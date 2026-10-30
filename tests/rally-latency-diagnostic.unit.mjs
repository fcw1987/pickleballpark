import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRepeatV1, decodeRepeatV1, deterministicProjectionV1 } from '../tools/rally-latency-diagnostic-cell.mjs';
import { createLatencyTelemetryV1 } from '../tools/rally-latency-telemetry.mjs';

test('matching repeat aliases deterministic projection and retains distinct diagnostics losslessly', () => {
  const first = { status: 'complete', document: { shots: [{ id: 'a' }] }, outcome: null, decisions: [], stats: {}, recipe: {}, diagnostics: { work: 1 } };
  const second = structuredClone(first); second.diagnostics.work = 2;
  const encoded = encodeRepeatV1(first, second);
  assert.equal(encoded.encoding, 'first-projection-alias-v1');
  assert.equal(encoded.firstSha256, encoded.secondSha256);
  assert.deepEqual(decodeRepeatV1(first, encoded), second);
  assert.ok(!Object.hasOwn(encoded, 'repeatedResult'));
  assert.equal(deterministicProjectionV1(first).outcomeClassification, null);
});
test('mismatch retains complete repeated result', () => {
  const first = { status: 'failed' }, second = { status: 'complete', diagnostics: { extra: [1] } };
  const encoded = encodeRepeatV1(first, second);
  assert.notEqual(encoded.firstSha256, encoded.secondSha256);
  assert.deepEqual(decodeRepeatV1(first, encoded), second);
});
test('matching aliases retain explicit null and undefined projection presence', () => {
  const first = { status: 'failed', outcome: null };
  const repeated = { status: 'failed', outcome: undefined, recipe: null };
  assert.deepEqual(decodeRepeatV1(first, encodeRepeatV1(first, repeated)), repeated);
});
test('telemetry observes twenty real MessageChannel macroturns without scheduler replacement', async () => {
  const telemetry = createLatencyTelemetryV1();
  telemetry.clock('toy', 0);
  for (let i = 0; i < 20; i++) await new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(0);
  });
  telemetry.clock('toy', 1);
  const result = telemetry.finish();
  assert.equal(result.ports.length, 40);
  assert.equal(result.yieldPairs.length, 20);
  assert.equal(result.yieldPairs.filter(p => p.observedFirstBeforeAt !== null).length, 20);
  assert.ok(result.yieldPairs.every(p => p.initToFirstBeforeMs >= 0 && p.first.spanId === 'toy'));
  assert.equal(result.phases[1].at - result.phases[0].at, result.spans[0].wallMs);
});
