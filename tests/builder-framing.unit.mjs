import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { builderViewBox } from '../builder-framing.js';
import { compileDocument } from '../play-compiler.js';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { compilePlayTimeline, samplePlayBall, samplePlayState, worldToBoard, FEET_TO_METERS } from '../three-d-core.js';

function projectionFor(width, height) {
  const context = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(new URL('../board-projection.js', import.meta.url), 'utf8'), context);
  context.window.PickleboardProjection.configureViewport(width, height);
  return context.window.PickleboardProjection;
}

function contains(box, point, message) {
  const epsilon = 1e-9;
  assert.ok(point.x >= box.x - epsilon, `${message}: x ${point.x} is left of ${box.x}`);
  assert.ok(point.x <= box.x + box.width + epsilon, `${message}: x ${point.x} is right of ${box.x + box.width}`);
  assert.ok(point.y >= box.y - epsilon, `${message}: y ${point.y} is above ${box.y}`);
  assert.ok(point.y <= box.y + box.height + epsilon, `${message}: y ${point.y} is below ${box.y + box.height}`);
}

function assertFramingContainsPlay(play, timeline, projection, label) {
  const box = builderViewBox(play, timeline, projection);

  // Regulation court plus two feet of useful runoff on every side. These are
  // court dimensions, deliberately independent of builderViewBox's constants.
  for (const x of [-2, 22]) for (const y of [-2, 46]) {
    contains(box, projection.courtToView({ x, y }), `${label} court runoff (${x}, ${y})`);
  }

  // Sample the production state rather than only authored endpoints. A 3.25ft
  // half-width and 5ft head height conservatively represent the upright actor.
  for (let index = 0; index <= 800; index++) {
    const time = timeline.duration * index / 800;
    const state = samplePlayState(timeline, time);
    for (const [id, position] of Object.entries(state.positions)) {
      if (id === 'ball') continue;
      const anchor = projection.courtToView(position);
      for (const dx of [-3.25, 3.25]) for (const dy of [-5, .75]) {
        contains(box, { x: anchor.x + dx, y: anchor.y + dy }, `${label} ${id} at ${time}`);
      }
    }

    const ball = samplePlayBall(timeline, time);
    const ground = projection.courtToView(worldToBoard(ball));
    const elevated = { x: ground.x, y: ground.y - projection.projectHeight(ball.y / FEET_TO_METERS) };
    for (const dx of [-.5, .5]) for (const dy of [-.5, .5]) {
      contains(box, { x: elevated.x + dx, y: elevated.y + dy }, `${label} ball at ${time}`);
    }
  }
}

test('responsive builder framing contains the regulation court, players, and complete lesson flight', () => {
  const play = PICKLEBOARD_PLAYS.find(item => item.id === 'lob-overhead');
  const timeline = compilePlayTimeline(play);
  for (const [width, height] of [[390, 720], [1280, 640]]) {
    const projection = projectionFor(width, height);
    assertFramingContainsPlay(play, timeline, projection, `lob-overhead/${projection.name}`);
  }
});

test('responsive builder framing contains a compiled custom rally without changing its timeline data', () => {
  const document = JSON.parse(readFileSync(new URL('../docs/builder/examples/eight-shot-drive-drop.json', import.meta.url)));
  const compiled = compileDocument(document);
  const before = {
    duration: compiled.timeline.duration,
    events: structuredClone(compiled.timeline.events),
    samples: [0, .2, .5, .8, 1].map(fraction => samplePlayState(compiled.timeline, compiled.timeline.duration * fraction))
  };

  for (const [width, height] of [[430, 900], [1440, 700]]) {
    const projection = projectionFor(width, height);
    assertFramingContainsPlay(compiled.play, compiled.timeline, projection, `custom/${projection.name}`);
  }

  assert.equal(compiled.timeline.duration, before.duration);
  assert.deepEqual(compiled.timeline.events, before.events);
  assert.deepEqual(
    [0, .2, .5, .8, 1].map(fraction => samplePlayState(compiled.timeline, compiled.timeline.duration * fraction)),
    before.samples
  );
});
