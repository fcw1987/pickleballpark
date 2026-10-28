// A structural hash alone omits trajectory.sample/servePreparation.sample.
// Capture their observable values as well as both compiled player samplers.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { documentFromTemplate, validateDocument } from '../play-document.js';
import { compileEffectiveCandidate } from '../rally-proposals.js';
import { samplePlayState } from '../three-d-core.js';
import { sampleActorWorldPosition } from '../three-d-presentation.js';

export const COMPATIBILITY_VERSION = 'game-mode-compat-v1';
export const SAMPLE_EPSILON_SECONDS = 1e-6;
export const hashJSON = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function timesAround(anchors, duration) {
  const values = new Set([0, duration]);
  for (const anchor of anchors.filter(Number.isFinite)) for (const offset of [-SAMPLE_EPSILON_SECONDS, 0, SAMPLE_EPSILON_SECONDS]) {
    values.add(Math.max(0, Math.min(duration, anchor + offset)));
  }
  return [...values].sort((a, b) => a - b);
}

export function captureCompiledSignature(document, compiled = compileEffectiveCandidate(document)) {
  const { timeline } = compiled;
  const anchors = timeline.events.map(e => e.time);
  for (const segment of timeline.segments) {
    anchors.push(segment.startTime, segment.endTime);
    for (const fraction of [.25, .5, .75]) anchors.push(segment.startTime + segment.duration * fraction);
  }
  const times = timesAround(anchors, timeline.duration);
  const samples = times.map(time => {
    const state = samplePlayState(timeline, time);
    return { time, stepIndex: state.stepIndex, ball: state.ball, logicalPositions: state.positions,
      actorWorldPositions: Object.fromEntries(Object.entries(document.players).map(([id, player]) => [id,
        state.segment ? sampleActorWorldPosition(state.segment, id, time - state.segment.startTime, player.handedness) : null])) };
  });
  const functionSamples = timeline.segments.map(segment => ({ index: segment.index,
    trajectory: segment.trajectory ? timesAround([segment.trajectory.flightDuration,
      ...[.25, .5, .75].map(p => segment.trajectory.totalDuration * p)], segment.trajectory.totalDuration)
      .map(time => ({ time, value: segment.trajectory.sample(time) })) : null,
    servePreparation: segment.servePreparation ? timesAround([segment.servePreparation.bounceTime,
      segment.servePreparation.totalDuration * .5], segment.servePreparation.totalDuration)
      .map(time => ({ time, value: segment.servePreparation.sample(time) })) : null }));
  return { documentSha256: hashJSON(document), compiledPlaySha256: hashJSON(compiled.play),
    timelineStructureSha256: hashJSON(timeline), sampledTimelineSha256: hashJSON({ samples, functionSamples }),
    findingsSha256: hashJSON(compiled.findings), coverageSha256: hashJSON(compiled.coverage),
    validShotCount: compiled.validShotCount, events: timeline.events.length,
    segments: timeline.segments.length, sampleTimes: times.length };
}

export function compatibilityDocuments() {
  const lessonCases = PICKLEBOARD_PLAYS.map(play => ({ id: `lesson:${play.id}`, origin: 'unchanged lesson catalog', document: documentFromTemplate(play) }));
  const directory = new URL('../tests/fixtures/game-mode/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('documents.json', directory), 'utf8'));
  return [...lessonCases, ...manifest.map(item => ({ id: item.id, origin: item.origin,
    document: JSON.parse(readFileSync(new URL(item.file, directory), 'utf8')) }))];
}

export function captureCompatibility() {
  return { version: COMPATIBILITY_VERSION, epsilonSeconds: SAMPLE_EPSILON_SECONDS,
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    method: 'Full JSON structural hashes plus deterministic logical/actor/ball and function samples at and on both sides of contacts, bounces and segment boundaries; no rounding.',
    cases: compatibilityDocuments().map(item => {
      validateDocument(item.document);
      const before = JSON.stringify(item.document), signature = captureCompiledSignature(item.document);
      if (JSON.stringify(item.document) !== before) throw Error(`Compilation mutated ${item.id}`);
      return { id: item.id, origin: item.origin, modelVersion: item.document.modelVersion, ...signature };
    }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [flag, output, ...extra] = process.argv.slice(2);
  if (flag !== '--capture' || !output || extra.length) throw Error('Usage: node tools/game-mode-compatibility.mjs --capture tests/fixtures/game-mode/compatibility.json');
  // Capture is deliberate and refuses to overwrite an approved baseline.
  const report = captureCompatibility();
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output, sourceRevision: report.sourceRevision, cases: report.cases.length }));
}
