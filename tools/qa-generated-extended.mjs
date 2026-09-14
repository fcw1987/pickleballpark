#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { applyCoverageAssistance } from '../coverage-assistance.js';
import { compileDocument, recompileAssistedDocument } from '../play-compiler.js';
import { validateDocument } from '../play-document.js';
import { validateRallyRules } from '../rally-rules.js';
import { FEET_TO_METERS, samplePlayBall, samplePlayState } from '../three-d-core.js';
import {
  generatedRally,
  invalidGeneratedCases,
  seededRandom
} from './qa-generated.mjs';

const clone = value => structuredClone(value);
const stable = value => JSON.stringify(value);

export const EXTENDED_DOCUMENT_COUNT = 446;
export const EXTENDED_SEEDS = Object.freeze([
  0x00000001, 0x00000002, 0x00000003, 0x00000005,
  0x00000008, 0x0000000d, 0x13579bdf, 0x2468ace0,
  0x31415926, 0x9e3779b9, 0xdeadbeef, 0xffffffff
]);
export const EXTENDED_LENGTHS = Object.freeze([1, 2, 8, 31, 64]);

const DIMENSIONS = Object.freeze({
  length: EXTENDED_LENGTHS,
  hitterPair: Object.freeze([
    ['player1', 'player3'], ['player1', 'player4'],
    ['player2', 'player3'], ['player2', 'player4']
  ]),
  region: Object.freeze([1, 5, 10, 15, 19]),
  contactStyle: Object.freeze(['auto', 'forehand', 'backhand']),
  assistance: Object.freeze([
    [false, false], [false, true], [true, false], [true, true]
  ]),
  shadeTeam: Object.freeze(['both', 'green', 'orange']),
  movement: Object.freeze(['hold', 'advance', 'recover', 'manual']),
  hands: Object.freeze(['RRRR', 'LRRL', 'RLLR', 'LLLL'])
});

const dimensionEntries = Object.entries(DIMENSIONS);

function pairKey(leftName, leftValue, rightName, rightValue) {
  return `${leftName}:${stable(leftValue)}|${rightName}:${stable(rightValue)}`;
}

function tuplePairKeys(tuple) {
  const keys = [];
  for (let left = 0; left < dimensionEntries.length; left += 1) {
    for (let right = left + 1; right < dimensionEntries.length; right += 1) {
      const [leftName] = dimensionEntries[left];
      const [rightName] = dimensionEntries[right];
      keys.push(pairKey(leftName, tuple[leftName], rightName, tuple[rightName]));
    }
  }
  return keys;
}

/**
 * One deterministic row for every possible pair. The unrelated dimensions
 * rotate so the schedule also varies higher-order combinations without an
 * unbounded Cartesian product.
 */
export function pairwiseDimensionCases() {
  const selected = [];
  let ordinal = 0;
  for (let left = 0; left < dimensionEntries.length; left += 1) {
    for (let right = left + 1; right < dimensionEntries.length; right += 1) {
      const [leftName, leftValues] = dimensionEntries[left];
      const [rightName, rightValues] = dimensionEntries[right];
      for (const leftValue of leftValues) {
        for (const rightValue of rightValues) {
          const tuple = Object.fromEntries(dimensionEntries.map(([name, values], index) => [
            name, values[(ordinal * (index * 2 + 1) + index) % values.length]
          ]));
          tuple[leftName] = leftValue;
          tuple[rightName] = rightValue;
          selected.push(tuple);
          ordinal += 1;
        }
      }
    }
  }
  return Object.freeze(selected.map(item => Object.freeze(item)));
}

function safeFamily(family) {
  return family === 'serve' ? 'drive' : family;
}

function applyDimensions(document, tuple, ordinal) {
  const [greenHitter, orangeHitter] = tuple.hitterPair;
  const x = tuple.region;
  document.id = `qa-extended-${ordinal + 1}`;
  document.title = `Extended QA ${ordinal + 1} · ${tuple.length} shots`;
  document.initialLayout = {
    player1: { x: greenHitter === 'player1' ? x : 20 - x, y: 14 },
    player2: { x: greenHitter === 'player2' ? x : 20 - x, y: 14 },
    player3: { x: orangeHitter === 'player3' ? x : 20 - x, y: 30 },
    player4: { x: orangeHitter === 'player4' ? x : 20 - x, y: 30 },
    ball: { x, y: 14 }
  };
  for (const [index, id] of ['player1', 'player2', 'player3', 'player4'].entries()) {
    document.players[id].handedness = tuple.hands[index] === 'L' ? 'left' : 'right';
  }
  document.assistance = {
    autoShading: tuple.assistance[0],
    showGuides: tuple.assistance[1],
    team: tuple.shadeTeam
  };
  document.shots.forEach((shot, index) => {
    const green = index % 2 === 0;
    const hitter = green ? greenHitter : orangeHitter;
    const nextHitter = green ? orangeHitter : greenHitter;
    shot.id = `extended-${ordinal + 1}-shot-${index + 1}`;
    shot.hitter = hitter;
    shot.receiver = index === document.shots.length - 1 ? 'auto' : nextHitter;
    shot.family = tuple.movement === 'manual' ? 'drive' : safeFamily(shot.family);
    shot.contactStyle = tuple.contactStyle;
    shot.target = { x, y: green ? [30, 32, 35][index % 3] : [9, 12, 14][index % 3] };
    delete shot.serveMethod;
    shot.movement = { intent: index === document.shots.length - 1 ? tuple.movement : 'hold', pinned: false };
    if (tuple.movement === 'manual') {
      // The next opposing shot lands at this hitter's next contact. Pinning to
      // that point covers manual movement while keeping the later contact
      // physically reachable; the final shot simply holds its current contact.
      const nextContact = document.shots[index + 1]
        ? { x, y: green ? [9, 12, 14][(index + 1) % 3] : [30, 32, 35][(index + 1) % 3] }
        : (index === 0 ? document.initialLayout[hitter] : document.shots[index - 1].target);
      shot.movement = { intent: 'manual', pinned: true, target: clone(nextContact) };
      const partner = green
        ? (greenHitter === 'player1' ? 'player2' : 'player1')
        : (orangeHitter === 'player3' ? 'player4' : 'player3');
      shot.playerMovement = {
        [partner]: { intent: 'manual', pinned: true, target: clone(document.initialLayout[partner]) }
      };
    } else if (index % 7 === 3) {
      const partner = green
        ? (greenHitter === 'player1' ? 'player2' : 'player1')
        : (orangeHitter === 'player3' ? 'player4' : 'player3');
      shot.playerMovement = { [partner]: { intent: 'hold', pinned: false } };
    } else {
      delete shot.playerMovement;
    }
  });
  // A short-hop requires an incoming bounce, so it is deliberately inserted
  // only after a preceding rally leg rather than claimed as a valid one-shot
  // combination.
  if (document.shots.length > 1 && ordinal % 7 === 0) {
    document.shots[1].family = 'reset';
    document.shots[1].contactStyle = 'short-hop';
  }
  validateDocument(document);
  return document;
}

export function extendedValidDocuments() {
  const pairwise = pairwiseDimensionCases();
  if (pairwise.length !== EXTENDED_DOCUMENT_COUNT) throw new Error(`Expected ${EXTENDED_DOCUMENT_COUNT} pairwise rows, received ${pairwise.length}.`);
  return Object.freeze(pairwise.map((tuple, ordinal) => {
    const seed = EXTENDED_SEEDS[ordinal % EXTENDED_SEEDS.length] ^ Math.imul(ordinal + 1, 0x45d9f3b);
    const document = generatedRally({ seed, length: tuple.length });
    return Object.freeze(applyDimensions(document, tuple, ordinal));
  }));
}

function validationMutation(id, change) {
  const document = clone(generatedRally({ seed: 0x51a7e, length: 8 }));
  document.id = `qa-extended-invalid-${id}`;
  change(document);
  return Object.freeze({ id, expected: 'validation', document });
}

export function extendedInvalidDocuments() {
  const inherited = invalidGeneratedCases().map(item => Object.freeze({
    id: `inherited-${item.id}`, expected: item.expected, document: clone(item.document)
  }));
  const validation = [
    validationMutation('schema-version', document => { document.schemaVersion = 2; }),
    validationMutation('model-version', document => { document.modelVersion = 2; }),
    validationMutation('unknown-family', document => { document.shots[0].family = 'spin'; }),
    validationMutation('unknown-hitter', document => { document.shots[0].hitter = 'player5'; }),
    validationMutation('unknown-receiver', document => { document.shots[0].receiver = 'player5'; }),
    validationMutation('unknown-contact', document => { document.shots[0].contactStyle = 'two-handed'; }),
    validationMutation('unknown-arc', document => { document.shots[0].arc = 'flat'; }),
    validationMutation('unknown-pace', document => { document.shots[0].pace = 'maximum'; }),
    validationMutation('manual-without-target', document => { document.shots[0].movement = { intent: 'manual', pinned: true }; }),
    validationMutation('duplicate-hitter-command', document => {
      document.shots[0].playerMovement = { [document.shots[0].hitter]: { intent: 'hold', pinned: false } };
    }),
    validationMutation('wrong-team', document => { document.players.player1.team = 'orange'; }),
    validationMutation('bad-assistance-team', document => { document.assistance.team = 'spectators'; }),
    validationMutation('too-many-annotations', document => { document.annotations = Array.from({ length: 65 }, () => ({})); }),
    validationMutation('serve-method-on-drive', document => { document.shots[0].serveMethod = 'volley'; }),
    validationMutation('too-many-shots', document => {
      document.shots = Array.from({ length: 65 }, (_, index) => ({
        ...clone(document.shots[index % document.shots.length]), id: `too-many-${index}`
      }));
    })
  ];
  return Object.freeze([...inherited, ...validation]);
}

function compareBoundarySample(documentId, timeline, rawTime) {
  const time = Math.max(0, Math.min(timeline.duration, rawTime));
  const ball = samplePlayBall(timeline, time);
  const repeated = samplePlayBall(timeline, time);
  const state = samplePlayState(timeline, time);
  if (stable(ball) !== stable(repeated) || stable(ball) !== stable(state.ball)) {
    throw new Error(`${documentId} disagreed between canonical 2D/3D samples at ${time}.`);
  }
  if (![ball.x, ball.y, ball.z, ball.board.x, ball.board.y].every(Number.isFinite) || ball.y < 0) {
    throw new Error(`${documentId} produced a non-finite boundary sample at ${time}.`);
  }
  const projectionError = Math.hypot(
    ball.x - (ball.board.x - 10) * FEET_TO_METERS,
    ball.z - (ball.board.y - 22) * FEET_TO_METERS
  );
  if (projectionError > 1e-9) throw new Error(`${documentId} projection drifted at ${time}.`);
}

export function runExtendedCorpus() {
  const pairwise = pairwiseDimensionCases();
  const valid = extendedValidDocuments();
  const invalid = extendedInvalidDocuments();
  const coveredPairs = new Set(pairwise.flatMap(tuplePairKeys));
  const expectedPairs = new Set();
  for (let left = 0; left < dimensionEntries.length; left += 1) {
    for (let right = left + 1; right < dimensionEntries.length; right += 1) {
      const [leftName, leftValues] = dimensionEntries[left];
      const [rightName, rightValues] = dimensionEntries[right];
      for (const leftValue of leftValues) for (const rightValue of rightValues) {
        expectedPairs.add(pairKey(leftName, leftValue, rightName, rightValue));
      }
    }
  }
  if (stable([...coveredPairs].sort()) !== stable([...expectedPairs].sort())) {
    throw new Error('The pairwise schedule does not cover every authoring-dimension pair.');
  }

  let shots = 0;
  let boundarySamples = 0;
  let guidedCoverageRecords = 0;
  const observed = {
    lengths: new Set(), hitterPairs: new Set(), regions: new Set(), families: new Set(), contactStyles: new Set(),
    movementIntents: new Set(), assistanceModes: new Set(), shadeTeams: new Set(), handPatterns: new Set()
  };
  for (const document of valid) {
    const source = stable(document);
    const compiled = compileDocument(document);
    const repeated = compileDocument(clone(document));
    if (compiled.validShotCount !== document.shots.length || compiled.findings.some(item => item.severity === 'error')) {
      throw new Error(`${document.id} failed: ${compiled.findings.map(item => item.message).join('; ')}`);
    }
    if (stable(compiled.play) !== stable(repeated.play) || stable(compiled.timeline.events) !== stable(repeated.timeline.events)) {
      throw new Error(`${document.id} did not compile deterministically.`);
    }
    const rules = validateRallyRules(compiled.play, compiled.timeline);
    if (!rules.valid) throw new Error(`${document.id} violated ${rules.violations.map(item => item.code).join(', ')}.`);
    observed.lengths.add(document.shots.length);
    observed.hitterPairs.add(`${document.shots[0]?.hitter}/${document.shots[1]?.hitter || 'single'}`);
    observed.regions.add(document.initialLayout[document.shots[0].hitter].x);
    document.shots.forEach(shot => observed.families.add(shot.family));
    document.shots.forEach(shot => observed.contactStyles.add(shot.contactStyle));
    document.shots.forEach(shot => observed.movementIntents.add(shot.movement.intent));
    observed.assistanceModes.add(`${document.assistance.autoShading}/${document.assistance.showGuides}`);
    observed.shadeTeams.add(document.assistance.team);
    observed.handPatterns.add(['player1', 'player2', 'player3', 'player4']
      .map(id => document.players[id].handedness[0].toUpperCase()).join(''));

    const assisted = applyCoverageAssistance(compiled.play, document, compiled.timeline);
    guidedCoverageRecords += assisted.coverage.length;
    if (document.assistance.autoShading) {
      const assistedCompilation = recompileAssistedDocument(document, compiled, assisted.play, assisted.coverage);
      if (assistedCompilation.validShotCount !== document.shots.length || assistedCompilation.findings.some(item => item.severity === 'error')) {
        throw new Error(`${document.id} failed assisted recompilation.`);
      }
    }
    if (source !== stable(document)) throw new Error(`${document.id} mutated authored source during compilation.`);

    const times = new Set([0, compiled.timeline.duration]);
    for (const event of compiled.timeline.events) {
      times.add(event.time - 1e-7); times.add(event.time); times.add(event.time + 1e-7);
    }
    for (const segment of compiled.timeline.segments) {
      times.add(segment.startTime); times.add(segment.endTime);
    }
    for (const time of times) compareBoundarySample(document.id, compiled.timeline, time);
    boundarySamples += times.size;
    shots += document.shots.length;
  }

  const invalidByExpected = { validation: 0, rule: 0, feasibility: 0 };
  for (const item of invalid) {
    if (item.expected === 'validation') {
      let rejected = false;
      try { validateDocument(item.document); } catch { rejected = true; }
      if (!rejected) throw new Error(`${item.id} unexpectedly passed document validation.`);
    } else {
      validateDocument(item.document);
      const compiled = compileDocument(item.document);
      if (!compiled.findings.some(finding => finding.kind === item.expected && finding.severity === 'error')) {
        throw new Error(`${item.id} did not produce its declared ${item.expected} error.`);
      }
    }
    invalidByExpected[item.expected] += 1;
  }

  return Object.freeze({
    seeds: EXTENDED_SEEDS,
    lengths: EXTENDED_LENGTHS,
    validDocuments: valid.length,
    validShots: shots,
    pairwiseRows: pairwise.length,
    pairwiseDimensionPairs: coveredPairs.size,
    invalidDocuments: invalid.length,
    invalidByExpected,
    sampledBoundaryPoints: boundarySamples,
    guidedCoverageRecords,
    observed: Object.fromEntries(Object.entries(observed).map(([name, values]) => [name, [...values].sort()]))
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.stdout.write(`${JSON.stringify(runExtendedCorpus(), null, 2)}\n`);
}
