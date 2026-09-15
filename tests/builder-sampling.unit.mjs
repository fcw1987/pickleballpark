import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { compileDocument } from '../play-compiler.js';
import { MAX_SHOTS, createStarterDocument, documentFromTemplate, validateDocument } from '../play-document.js';
import { samplePlayBall, samplePlayState } from '../three-d-core.js';
import { sampleActorPresentation } from '../three-d-presentation.js';

const clone = value => structuredClone(value);
const example = name => JSON.parse(readFileSync(new URL(`../docs/builder/examples/${name}.json`, import.meta.url)));
const cameras = [{ x: 5.5, y: 12, z: 9.5 }, { x: 11, y: 7, z: 0 }, { x: 0, y: 1.95, z: -10.2 }];

function random(seed) {
  let state = seed >>> 0;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 0x100000000);
}

test('exported eight-shot example is a genuine valid custom timeline', () => {
  const document = example('eight-shot-drive-drop');
  validateDocument(document);
  const result = compileDocument(document);
  assert.equal(result.validShotCount, 8);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.play.steps.slice(1).map(step => step.shot.authoring.recipeId), document.shots.map(shot => shot.id));
  assert.deepEqual(result.play.steps.slice(1).map(step => step.shot.authoring.family), document.shots.map(shot => shot.family));
  assert.equal(result.timeline.events.filter(event => event.type === 'contact').length, 8);
  assert.equal(result.timeline.events.filter(event => event.type === 'bounce').length, 8);
});

test('shading example preserves a manual pin without making it a contact dependency', () => {
  const document = example('lateral-shading-manual-pin');
  validateDocument(document);
  const result = compileDocument(document);
  assert.equal(result.validShotCount, 4);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.play.assistance, { autoShading: true, showGuides: true, team: 'both' });
  for (const step of result.play.steps.slice(1)) assert.deepEqual(step.positions.player2, { x: 4, y: 14 });
  assert.equal(result.play.steps[1].shot.authoring.movement.pinned, true);
});

test('seeded feasible serve, return, and third-shot parameters compile deterministically', () => {
  for (const seed of [1, 7, 19, 101, 2026]) {
    const next = random(seed);
    for (let iteration = 0; iteration < 8; iteration++) {
      const document = createStarterDocument();
      document.id = `seed-${seed}-${iteration}`;
      document.shots[0].target = { x: 1 + next() * 8, y: 33 + next() * 8 };
      document.shots[0].arc = ['medium', 'high'][Math.floor(next() * 2)];
      document.shots[0].pace = ['soft', 'medium', 'firm'][Math.floor(next() * 3)];
      document.shots[1].target = { x: 12 + next() * 5, y: 4 + next() * 7 };
      document.shots[1].contactStyle = next() < .5 ? 'forehand' : 'backhand';
      document.shots[2].family = next() < .5 ? 'drop' : 'drive';
      document.shots[2].target = { x: 2 + next() * 16, y: document.shots[2].family === 'drive' ? 30 + next() * 5 : 27 + next() * 2 };
      document.shots[2].arc = document.shots[2].family === 'drive' ? 'low' : 'high';
      document.shots[2].pace = document.shots[2].family === 'drive' ? 'firm' : 'soft';
      const first = compileDocument(document), second = compileDocument(clone(document));
      assert.equal(first.validShotCount, 3, `${document.id}: ${first.findings.map(item => item.message).join('; ')}`);
      assert.deepEqual(first.play, second.play);
      assert.deepEqual(first.timeline.events, second.timeline.events);
      for (const fraction of [0, .13, .5, .91, 1]) {
        const a = samplePlayState(first.timeline, first.timeline.duration * fraction);
        const b = samplePlayState(second.timeline, second.timeline.duration * fraction);
        assert.deepEqual({ time: a.time, stepIndex: a.stepIndex, ball: a.ball, positions: a.positions },
          { time: b.time, stepIndex: b.stepIndex, ball: b.ball, positions: b.positions });
      }
    }
  }
});

test('the documented maximum of 99 stable recipes compiles without a fixed-slot path', () => {
  const document = createStarterDocument();
  document.id = 'maximum-supported-rally';
  document.opening = 'midrally';
  document.initialLayout.ball = { x: 7, y: 14 };
  document.initialLayout.player1 = { x: 7, y: 14 };
  document.initialLayout.player3 = { x: 7, y: 30 };
  document.shots = Array.from({ length: MAX_SHOTS }, (_, index) => ({
    id: `dink-${index + 1}`, family: 'dink', hitter: index % 2 ? 'player3' : 'player1',
    receiver: index === MAX_SHOTS - 1 ? 'auto' : index % 2 ? 'player1' : 'player3',
    contactStyle: index % 3 ? 'forehand' : 'backhand', target: index % 2 ? { x: 7, y: 14 } : { x: 7, y: 30 },
    arc: 'medium', pace: 'soft', movement: { intent: 'hold', pinned: false }
  }));
  const result = compileDocument(document);
  assert.equal(result.validShotCount, MAX_SHOTS);
  assert.equal(new Set(result.timeline.events.map(event => event.id)).size, result.timeline.events.length);
  assert.equal(result.timeline.events.filter(event => event.type === 'contact').length, MAX_SHOTS);
});

test('event boundaries are continuous and drop preparation never becomes an incoming bounce', () => {
  const document = example('eight-shot-drive-drop');
  document.shots[0].serveMethod = 'drop';
  const { timeline } = compileDocument(document);
  assert.equal(timeline.events.filter(event => event.type === 'preparation-bounce').length, 1);
  assert.equal(timeline.events.filter(event => event.type === 'bounce' && event.rallyLeg === 1).length, 1);
  for (const event of timeline.events) {
    const before = samplePlayBall(timeline, Math.max(0, event.time - 1e-7));
    const at = samplePlayBall(timeline, event.time);
    const after = samplePlayBall(timeline, Math.min(timeline.duration, event.time + 1e-7));
    assert.ok(Math.hypot(before.x - at.x, before.y - at.y, before.z - at.z) < 2e-5, `before ${event.id}`);
    assert.ok(Math.hypot(after.x - at.x, after.y - at.y, after.z - at.z) < 2e-5, `after ${event.id}`);
    assert.ok(at.y >= 0, event.id);
  }
});

test('world position and contact target are camera-independent and visibly reachable', () => {
  const { timeline } = compileDocument(example('eight-shot-drive-drop'));
  for (const segment of timeline.segments.filter(item => item.shotSemantics)) {
    const playerId = segment.shotSemantics.playerId;
    const handedness = ['player4'].includes(playerId) ? 'left' : 'right';
    const samples = cameras.map(cameraPosition => sampleActorPresentation({
      segment, playerId, localTime: segment.contactTime, cameraPosition, handedness,
      artFamily: playerId === 'player1' || playerId === 'player2' ? 'green' : 'orange', timeline
    }));
    assert.deepEqual(samples[0].worldPosition, samples[1].worldPosition);
    assert.deepEqual(samples[0].worldPosition, samples[2].worldPosition);
    assert.deepEqual(samples[0].paddle.worldContactTarget, samples[1].paddle.worldContactTarget);
    assert.equal(samples[0].planted, true);
    const target = samples[0].paddle.worldContactTarget, actor = samples[0].worldPosition;
    assert.ok(Math.hypot(target.x - actor.x, target.y - actor.y, target.z - actor.z) < 1.25,
      `${segment.step.id} visible actor must remain within paddle-scale reach of contact`);
  }
});

test('edited templates exercise short-hop, volley, lob, and overhead through genuine compilation', () => {
  const cases = [
    ['short-hop-reset', ['short-hop', 'reset']],
    ['volley-block', ['volley']],
    ['lob-overhead', ['lob', 'overhead']]
  ];
  for (const [id, expected] of cases) {
    const source = PICKLEBOARD_PLAYS.find(play => play.id === id);
    const document = documentFromTemplate(source);
    document.shots[0].target.x += .1;
    const result = compileDocument(document);
    assert.equal(result.validShotCount, document.shots.length, `${id}: ${result.findings.map(item => item.message).join('; ')}`);
    assert.deepEqual(result.findings, []);
    assert.notDeepEqual(result.play.steps, source.steps, `${id} must leave exact-template compatibility`);
    const semantics = result.timeline.segments.filter(segment => segment.shotSemantics);
    for (const family of expected) {
      if (family === 'short-hop') assert.ok(semantics.some(segment => segment.shotSemantics.contact.kind === 'short-hop'));
      else assert.ok(semantics.some(segment => segment.step.shot.authoring.family === family), `${id}/${family}`);
    }
  }
});
