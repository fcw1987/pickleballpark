import test from 'node:test';
import assert from 'node:assert/strict';

import { applyCoverageAssistance } from '../coverage-assistance.js';
import { compileDocument, recompileAssistedDocument } from '../play-compiler.js';
import { validateDocument } from '../play-document.js';
import { validateRallyRules } from '../rally-rules.js';
import { FEET_TO_METERS, samplePlayBall, samplePlayState } from '../three-d-core.js';
import { QA_FUTURE_GAPS, QA_SCENARIOS, copyScenarioDocument } from './fixtures/qa-scenarios.mjs';
import {
  QA_LENGTHS, QA_SEEDS, generatedRally, invalidGeneratedCases,
  pairwiseAuthoringCases, runGeneratedCorpus, shrinkFailingSequence
} from '../tools/qa-generated.mjs';

const clone = value => structuredClone(value);
const shotSegments = result => result.timeline.segments.filter(segment => segment.shotSemantics);
const freezeDeep = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
};

test('catalog fixtures carry complete intent, contact, bounce, responsibility, terminal, and visual expectations', () => {
  assert.ok(QA_SCENARIOS.length >= 24);
  assert.equal(new Set(QA_SCENARIOS.map(item => item.id)).size, QA_SCENARIOS.length);
  for (const { id, document, expected } of QA_SCENARIOS) {
    assert.ok(expected.intents?.length, `${id}: authored intent`);
    assert.equal(expected.contacts?.length, expected.validShotCount ?? document.shots.length, `${id}: contacts`);
    assert.equal(expected.bounces?.length, expected.validShotCount ?? document.shots.length, `${id}: bounces`);
    assert.equal(expected.responsibility?.length, expected.validShotCount ?? document.shots.length, `${id}: responsibility`);
    assert.ok(['stop', 'winner', 'fault'].includes(expected.terminal), `${id}: terminal`);
    assert.ok(expected.visual?.length, `${id}: visual checks`);
  }
  assert.ok(QA_FUTURE_GAPS.some(item => /block family/.test(item)));
  assert.ok(QA_FUTURE_GAPS.some(item => /speedup family/.test(item)));
});

test('catalog scenarios compile deterministically without mutating targets, pins, or handedness', () => {
  for (const source of QA_SCENARIOS) {
    const document = copyScenarioDocument(source.id);
    const before = clone(document);
    validateDocument(document);
    freezeDeep(document);
    const first = compileDocument(document);
    const second = compileDocument(clone(before));
    const expectedCount = source.expected.validShotCount ?? before.shots.length;
    assert.equal(first.validShotCount, expectedCount, source.id);
    assert.deepEqual(first.play, second.play, source.id);
    assert.deepEqual(first.timeline.events, second.timeline.events, source.id);
    assert.deepEqual(document, before, `${source.id}: source mutated`);
    assert.deepEqual(document.shots.map(shot => shot.target), before.shots.map(shot => shot.target), `${source.id}: target mutated`);
    assert.deepEqual(document.players, before.players, `${source.id}: handedness mutated`);

    const segments = shotSegments(first);
    assert.deepEqual(segments.map(item => item.shotSemantics.contact.kind), source.expected.contacts, `${source.id}: contact kind`);
    assert.deepEqual(segments.map(item => item.trajectory.bounces), source.expected.bounces, `${source.id}: bounce contract`);
    assert.deepEqual(segments.map(item => item.shotSemantics.playerId), source.expected.responsibility, `${source.id}: hitter responsibility`);
    assert.equal(first.play.outcome.intent, source.expected.terminal, `${source.id}: terminal outcome`);
    assert.equal(first.play.outcome.afterShotId, before.shots[expectedCount - 1]?.id ?? null, `${source.id}: terminal shot`);
    assert.equal(new Set(first.timeline.events.map(event => event.id)).size, first.timeline.events.length, `${source.id}: event ids`);
    assert.deepEqual(
      first.play.steps.filter(step => step.shot).map(step => step.shot.intendedTarget),
      before.shots.slice(0, expectedCount).map(shot => shot.target),
      `${source.id}: intended target markers`
    );

    if (source.expected.finding) {
      assert.ok(first.findings.some(item => item.kind === source.expected.finding.kind &&
        (!source.expected.finding.shotId || item.shotId === source.expected.finding.shotId) &&
        (!source.expected.finding.severity || item.severity === source.expected.finding.severity)), `${source.id}: expected finding`);
    } else {
      assert.deepEqual(first.findings, [], `${source.id}: unexpected findings`);
      assert.equal(validateRallyRules(first.play, first.timeline).valid, true, `${source.id}: rally rules`);
    }
  }
});

test('serve depth boundaries remain legal while the kitchen line and midrally serve remain errors', () => {
  for (const id of ['deep-serve-return', 'short-serve-return']) {
    const result = compileDocument(copyScenarioDocument(id));
    assert.equal(result.validShotCount, 2, id);
    assert.equal(validateRallyRules(result.play, result.timeline).valid, true, id);
  }
  const kitchenLine = copyScenarioDocument('short-serve-return');
  kitchenLine.shots[0].target.y = 29;
  assert.match(compileDocument(kitchenLine).findings[0].message, /beyond the non-volley-zone line/);

  const midrallyServe = copyScenarioDocument('short-serve-return');
  midrallyServe.opening = 'midrally';
  midrallyServe.shots = midrallyServe.shots.slice(0, 1);
  const result = compileDocument(midrallyServe);
  assert.equal(result.validShotCount, 0);
  assert.match(result.findings[0].message, /only begin a standard full-rally draft/);
});

test('interception and bounced-response fixtures preserve authored landing intent and canonical contact behavior', () => {
  const intercepted = compileDocument(copyScenarioDocument('lob-overhead'));
  const [lob] = shotSegments(intercepted);
  assert.equal(lob.trajectory.bounces, 0);
  assert.deepEqual(lob.step.shot.intendedTarget, { x: 10, y: 40 });
  assert.notDeepEqual(lob.step.shot.to, lob.step.shot.intendedTarget);
  assert.equal(lob.step.shot.to.y, 29.6);

  const bounced = compileDocument(copyScenarioDocument('bounced-response'));
  const [incoming, response] = shotSegments(bounced);
  assert.equal(incoming.trajectory.bounces, 1);
  assert.deepEqual(incoming.step.shot.to, incoming.step.shot.intendedTarget);
  assert.equal(response.shotSemantics.contact.point.y, incoming.step.shot.to.y + .75);
  assert.ok(bounced.timeline.events.some(event => event.type === 'bounce' && event.rallyLeg === 1));
});

test('block/reset, speedup, handedness, and formation mappings stay honest to model version 1', () => {
  const block = compileDocument(copyScenarioDocument('drive-block-reset'));
  assert.deepEqual(shotSegments(block).map(item => item.shotSemantics.artAction), ['drive', 'block', 'drop', 'backhand']);
  assert.equal(shotSegments(block)[2].shotSemantics.contact.point.heightFeet, .8);
  const speedup = compileDocument(copyScenarioDocument('dink-speedup'));
  assert.equal(shotSegments(speedup)[1].step.shot.authoring.family, 'drive');
  assert.equal(shotSegments(speedup)[1].trajectory.metadata.speedMph, 40);

  const right = compileDocument(copyScenarioDocument('right-handed-auto-contact'));
  const left = compileDocument(copyScenarioDocument('left-handed-auto-contact'));
  assert.equal(shotSegments(right)[0].shotSemantics.strokeSide, 'forehand');
  assert.equal(shotSegments(left)[0].shotSemantics.strokeSide, 'backhand');

  const formation = compileDocument(copyScenarioDocument('transition-one-up-one-back'));
  assert.equal(formation.play.steps[0].positions.player1.y, 8);
  assert.equal(formation.play.steps[0].positions.player2.y, 14);
  assert.equal(formation.play.steps[1].positions.player1.y, 12);
  assert.equal(formation.play.steps[1].positions.player2.y, 14);
});

test('shading and guides toggle independently and manual pins survive assisted recompilation', () => {
  const modes = [
    ['shading-off-guides-off', false, false],
    ['shading-off-guides-on', false, true],
    ['shading-on-guides-off', true, false],
    ['shading-on-guides-on', true, true]
  ];
  for (const [id, auto, guides] of modes) {
    const document = copyScenarioDocument(id);
    const compiled = compileDocument(document);
    const assisted = applyCoverageAssistance(compiled.play, document, compiled.timeline);
    assert.equal(document.assistance.autoShading, auto, id);
    assert.equal(document.assistance.showGuides, guides, id);
    assert.equal(assisted.coverage.length > 0, auto || guides, id);
    if (!auto) assert.deepEqual(assisted.play, compiled.play, id);
    const final = auto ? recompileAssistedDocument(document, compiled, assisted.play, assisted.coverage) : compiled;
    assert.deepEqual(
      final.play.steps.filter(step => step.shot).map(step => step.shot.intendedTarget),
      document.shots.map(shot => shot.target), id
    );
  }

  const pinnedDocument = copyScenarioDocument('manual-pin-shading');
  const compiled = compileDocument(pinnedDocument);
  const authored = clone(pinnedDocument);
  const assisted = applyCoverageAssistance(compiled.play, pinnedDocument, compiled.timeline);
  const final = recompileAssistedDocument(pinnedDocument, compiled, assisted.play, assisted.coverage);
  assert.deepEqual(pinnedDocument, authored);
  assert.deepEqual(pinnedDocument.shots[0].movement.target, { x: 4, y: 14 });
  for (const step of final.play.steps.slice(1)) assert.deepEqual(step.positions.player1, { x: 4, y: 14 });
});

test('seeded and Cartesian-pairwise valid generation covers all bounded lengths and authoring choices', () => {
  const documents = QA_SEEDS.flatMap(seed => QA_LENGTHS.map(length => generatedRally({ seed, length })));
  assert.deepEqual([...new Set(documents.map(document => document.shots.length))], QA_LENGTHS);
  for (const document of documents) {
    const result = compileDocument(document);
    assert.equal(result.validShotCount, document.shots.length, document.id);
    assert.deepEqual(result.findings, [], document.id);
    assert.equal(validateRallyRules(result.play, result.timeline).valid, true, document.id);
  }

  const pairwise = pairwiseAuthoringCases();
  assert.equal(pairwise.length, 8 * 3 * 3);
  assert.equal(new Set(pairwise.map(document => `${document.shots[0].family}/${document.shots[0].arc}`)).size, 8 * 3);
  assert.equal(new Set(pairwise.map(document => `${document.shots[0].family}/${document.shots[0].pace}`)).size, 8 * 3);
  assert.equal(new Set(pairwise.map(document => `${document.shots[0].arc}/${document.shots[0].pace}`)).size, 3 * 3);
  assert.deepEqual(pairwiseAuthoringCases(), pairwise, 'pairwise schedule must be reproducible');
});

test('invalid generated cases separate validation, rule, and physical feasibility failures and shrink reproducibly', () => {
  const cases = invalidGeneratedCases();
  assert.equal(cases.length, 9);
  for (const item of cases) {
    if (item.expected === 'validation') assert.throws(() => validateDocument(item.document), TypeError, item.id);
    else assert.ok(compileDocument(item.document).findings.some(finding => finding.kind === item.expected && finding.severity === 'error'), item.id);
  }
  const source = cases.find(item => item.id === 'same-team').document;
  const predicate = document => compileDocument(document).findings.some(finding => finding.kind === 'rule');
  const first = shrinkFailingSequence(source, predicate);
  const second = shrinkFailingSequence(source, predicate);
  assert.deepEqual(first.metadata, second.metadata);
  assert.equal(first.metadata.strategy, 'shortest-failing-prefix');
  assert.equal(first.metadata.originalLength, 8);
  assert.equal(first.metadata.shrunkLength, 2);
  assert.equal(predicate(first.document), true);
  assert.equal(predicate({ ...clone(first.document), shots: first.document.shots.slice(0, 1) }), false);
});

test('thousands of boundary seeks stay continuous, repeatable, finite, and canonically shared by 2D and 3D', () => {
  let samples = 0;
  for (const seed of QA_SEEDS) {
    for (const length of QA_LENGTHS) {
      const { timeline } = compileDocument(generatedRally({ seed, length }));
      for (const event of timeline.events) {
        const at = samplePlayBall(timeline, event.time);
        for (const time of [event.time - 1e-7, event.time, event.time + 1e-7]) {
          const bounded = Math.max(0, Math.min(timeline.duration, time));
          const first = samplePlayBall(timeline, bounded);
          const repeated = samplePlayBall(timeline, bounded);
          const state = samplePlayState(timeline, bounded);
          assert.deepEqual(repeated, first);
          assert.deepEqual(state.ball, first);
          assert.ok([first.x, first.y, first.z, first.board.x, first.board.y].every(Number.isFinite));
          assert.ok(first.y >= 0);
          assert.ok(Math.hypot(first.x - (first.board.x - 10) * FEET_TO_METERS,
            first.z - (first.board.y - 22) * FEET_TO_METERS) < 1e-9);
          assert.ok(Math.hypot(first.x - at.x, first.y - at.y, first.z - at.z) < 2e-5);
          samples += 1;
        }
      }
    }
  }
  assert.ok(samples > 3000, `sampled ${samples}`);
});

test('generated movement remains inside the compiler reach envelope without drift', () => {
  for (const seed of QA_SEEDS) {
    const document = generatedRally({ seed, length: 64 });
    const first = compileDocument(document);
    const second = compileDocument(clone(document));
    for (const [index, segment] of first.timeline.segments.entries()) {
      for (const player of ['player1', 'player2', 'player3', 'player4']) {
        const from = segment.previous.positions[player];
        const to = segment.step.positions[player];
        assert.ok(Math.hypot(to.x - from.x, to.y - from.y) <= segment.duration * 14 + 3 + 1e-9,
          `${document.id}/${index}/${player}`);
      }
    }
    assert.deepEqual(first.play.steps, second.play.steps);
    assert.deepEqual(first.timeline.events, second.timeline.events);
  }
});

test('standalone corpus runner reports fixed seeds, counts, boundary samples, and shrink metadata', () => {
  const report = runGeneratedCorpus();
  assert.deepEqual(report.seeds, QA_SEEDS);
  assert.deepEqual(report.lengths, QA_LENGTHS);
  assert.deepEqual(report, {
    seeds: QA_SEEDS,
    lengths: QA_LENGTHS,
    validDocuments: 96,
    generatedDocuments: 24,
    pairwiseDocuments: 72,
    validShots: 1176,
    invalidDocuments: 9,
    sampledBoundaryPoints: 13032,
    shrink: {
      strategy: 'shortest-failing-prefix', originalLength: 8, shrunkLength: 2,
      removedShotIds: ['generated-3', 'generated-4', 'generated-5', 'generated-6', 'generated-7', 'generated-8']
    }
  });
});
