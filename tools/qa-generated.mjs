#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { compileDocument } from '../play-compiler.js';
import { createStarterDocument, validateDocument, MAX_SHOTS } from '../play-document.js';
import { validateRallyRules } from '../rally-rules.js';
import { FEET_TO_METERS, samplePlayBall, samplePlayState } from '../three-d-core.js';

export const QA_SEEDS = Object.freeze([0x00c0ffee, 0x01352531, 0x5eed2026]);
export const QA_LENGTHS = Object.freeze([1, 3, 8, 30, 64, 65, 98, MAX_SHOTS]);

const clone = value => structuredClone(value);
const FAMILIES = Object.freeze(['return', 'drive', 'drop', 'dink', 'volley', 'reset', 'lob', 'overhead']);
const ARCS = Object.freeze(['low', 'medium', 'high']);
const PACES = Object.freeze(['soft', 'medium', 'firm']);

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 0x100000000);
}

const choose = (items, next) => items[Math.floor(next() * items.length)];

export function generatedRally({ seed, length }) {
  if (!Number.isInteger(length) || length < 1 || length > MAX_SHOTS) throw new RangeError(`Generated rally length must be 1–${MAX_SHOTS}.`);
  const next = seededRandom(seed);
  const x = choose([4, 7, 10, 13, 16], next);
  const document = createStarterDocument();
  document.id = `qa-valid-${seed >>> 0}-${length}`;
  document.title = `QA generated ${length}-shot rally, seed ${seed >>> 0}`;
  document.opening = 'midrally';
  document.initialLayout = {
    player1: { x, y: 14 }, player2: { x: x < 10 ? 15 : 5, y: 14 },
    player3: { x, y: 30 }, player4: { x: x < 10 ? 15 : 5, y: 30 },
    ball: { x, y: 14 }
  };
  document.shots = Array.from({ length }, (_, index) => {
    const green = index % 2 === 0;
    const family = choose(FAMILIES, next);
    const contactStyle = index > 0 && family === 'reset' && next() < .34
      ? 'short-hop'
      : choose(['auto', 'forehand', 'backhand'], next);
    return {
      id: `generated-${index + 1}`,
      family,
      hitter: green ? 'player1' : 'player3',
      receiver: index === length - 1 ? 'auto' : green ? 'player3' : 'player1',
      contactStyle,
      target: { x, y: green ? choose([30, 32, 35], next) : choose([9, 12, 14], next) },
      arc: choose(ARCS, next),
      pace: choose(PACES, next),
      movement: { intent: 'hold', pinned: false }
    };
  });
  validateDocument(document);
  return document;
}

// This bounded Cartesian schedule is stronger than pairwise for the three
// authoring dimensions it covers. Contact style rotates deterministically.
export function pairwiseAuthoringCases(seed = QA_SEEDS[0]) {
  const next = seededRandom(seed);
  const cases = [];
  for (const family of FAMILIES) {
    for (const arc of ARCS) {
      for (const pace of PACES) {
        const document = generatedRally({ seed: Math.floor(next() * 0xffffffff), length: 1 });
        const shot = document.shots[0];
        Object.assign(shot, {
          id: `${family}-${arc}-${pace}`,
          family, arc, pace,
          contactStyle: ['auto', 'forehand', 'backhand'][cases.length % 3]
        });
        document.id = `qa-pair-${shot.id}`;
        cases.push(document);
      }
    }
  }
  return cases;
}

export function invalidGeneratedCases(seed = QA_SEEDS[1]) {
  const source = generatedRally({ seed, length: 8 });
  const mutate = (id, expected, change) => {
    const document = clone(source);
    document.id = `qa-invalid-${id}`;
    change(document);
    return { id, expected, document };
  };
  return [
    mutate('same-team', 'rule', document => { document.shots[1].hitter = 'player2'; }),
    mutate('receiver-mismatch', 'rule', document => { document.shots[0].receiver = 'player4'; }),
    mutate('same-side-target', 'rule', document => { document.shots[1].target.y = 35; }),
    mutate('late-serve', 'rule', document => {
      document.shots[2].family = 'serve';
      document.shots[2].serveMethod = 'volley';
    }),
    mutate('full-rally-without-serve', 'rule', document => { document.opening = 'serve'; }),
    mutate('opening-volley-return', 'rule', document => {
      const starter = createStarterDocument();
      document.opening = 'serve';
      document.initialLayout = clone(starter.initialLayout);
      document.shots = clone(starter.shots);
      document.shots[1].family = 'volley';
    }),
    mutate('pinned-contact-unreachable', 'feasibility', document => {
      document.shots[0].movement = { intent: 'manual', pinned: true, target: { x: 0, y: 0 } };
      document.shots[2].hitter = 'player1';
    }),
    mutate('duplicate-id', 'validation', document => { document.shots[1].id = document.shots[0].id; }),
    mutate('off-court-target', 'validation', document => { document.shots[0].target.x = 21; })
  ];
}

export function shrinkFailingSequence(document, predicate) {
  if (typeof predicate !== 'function') throw new TypeError('A failure predicate is required.');
  const originalLength = document.shots.length;
  let shrunk = clone(document);
  for (let length = 1; length <= originalLength; length += 1) {
    const candidate = clone(document);
    candidate.shots = candidate.shots.slice(0, length);
    if (predicate(candidate)) { shrunk = candidate; break; }
  }
  return Object.freeze({
    document: shrunk,
    metadata: Object.freeze({
      strategy: 'shortest-failing-prefix',
      originalLength,
      shrunkLength: shrunk.shots.length,
      removedShotIds: document.shots.slice(shrunk.shots.length).map(shot => shot.id)
    })
  });
}

export function runGeneratedCorpus() {
  const generated = QA_SEEDS.flatMap(seed => QA_LENGTHS.map(length => generatedRally({ seed, length })));
  const pairwise = pairwiseAuthoringCases();
  const invalid = invalidGeneratedCases();
  let totalShots = 0;
  let boundarySamples = 0;
  for (const document of [...generated, ...pairwise]) {
    const result = compileDocument(document);
    if (result.validShotCount !== document.shots.length || result.findings.some(item => item.severity === 'error')) {
      throw new Error(`${document.id} failed: ${result.findings.map(item => item.message).join('; ')}`);
    }
    const repeated = compileDocument(clone(document));
    if (JSON.stringify(result.play) !== JSON.stringify(repeated.play) ||
        JSON.stringify(result.timeline.events) !== JSON.stringify(repeated.timeline.events)) {
      throw new Error(`${document.id} was not deterministic`);
    }
    const rules = validateRallyRules(result.play, result.timeline);
    if (!rules.valid) throw new Error(`${document.id} violated ${rules.violations.map(item => item.code).join(', ')}`);
    const eventTimes = result.timeline.events.flatMap(event => [event.time - 1e-7, event.time, event.time + 1e-7]);
    for (const rawTime of eventTimes) {
      const time = Math.max(0, Math.min(result.timeline.duration, rawTime));
      const first = samplePlayBall(result.timeline, time);
      const second = samplePlayBall(result.timeline, time);
      const state = samplePlayState(result.timeline, time);
      if (JSON.stringify(first) !== JSON.stringify(second) || JSON.stringify(first) !== JSON.stringify(state.ball)) {
        throw new Error(`${document.id} drifted at ${time}`);
      }
      if (![first.x, first.y, first.z, first.board.x, first.board.y].every(Number.isFinite) || first.y < 0) {
        throw new Error(`${document.id} produced an invalid sample at ${time}`);
      }
      const boardError = Math.hypot(first.x - (first.board.x - 10) * FEET_TO_METERS,
        first.z - (first.board.y - 22) * FEET_TO_METERS);
      if (boardError > 1e-9) throw new Error(`${document.id} 2D/3D sample mismatch at ${time}`);
      boundarySamples += 1;
    }
    totalShots += document.shots.length;
  }
  for (const item of invalid) {
    if (item.expected === 'validation') {
      try { validateDocument(item.document); throw new Error(`${item.id} unexpectedly validated`); }
      catch (error) { if (/unexpectedly validated/.test(error.message)) throw error; }
    } else {
      const result = compileDocument(item.document);
      if (!result.findings.some(finding => finding.kind === item.expected && finding.severity === 'error')) {
        throw new Error(`${item.id} did not produce ${item.expected}`);
      }
    }
  }
  const sameTeam = invalid.find(item => item.id === 'same-team').document;
  const shrunk = shrinkFailingSequence(sameTeam, candidate => {
    try { return compileDocument(candidate).findings.some(item => item.kind === 'rule'); }
    catch { return false; }
  });
  return Object.freeze({
    seeds: QA_SEEDS,
    lengths: QA_LENGTHS,
    validDocuments: generated.length + pairwise.length,
    generatedDocuments: generated.length,
    pairwiseDocuments: pairwise.length,
    validShots: totalShots,
    invalidDocuments: invalid.length,
    sampledBoundaryPoints: boundarySamples,
    shrink: shrunk.metadata
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.stdout.write(`${JSON.stringify(runGeneratedCorpus(), null, 2)}\n`);
}
