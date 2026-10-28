import test from 'node:test';
import assert from 'node:assert/strict';

// The module's public browser registration is inert here. Exercise the real
// install guards without constructing a DOM, renderer or animation clock.
const previousWindow = globalThis.window;
globalThis.window = {};
const { GuidedPlayEngine } = await import('../guided-plays.js');
const { ThreeDPlaybackViewer } = await import('../three-d-playback.js');
if (previousWindow === undefined) delete globalThis.window;
else globalThis.window = previousWindow;

const point = () => ({
    id: 'point-one', name: 'One point', mode: 'doubles', modelVersion: 2, physicsVersion: 'play-physics-v2',
    steps: [{ id: 'setup', positions: {} }, { id: 'drive', positions: {}, shot: { from: { x: 5, y: 10 }, to: { x: 15, y: 40 } } }],
    outcome: { reason: 'long', shotId: 'drive', winner: 'orange' }
});
const compiled = play => ({ modelVersion: 2, physicsVersion: 'play-physics-v2', play, segments: [], events: [], duration: 2 });

test('model2 accepts its exact play or exact JSON-preserved source, including versioned root metadata', () => {
    const play = point(), validate = GuidedPlayEngine.prototype.validateTimelineModel;
    assert.doesNotThrow(() => validate(play, compiled(play)));
    assert.doesNotThrow(() => validate(play, compiled(structuredClone(play))));
    const old = { id: 'legacy' };
    assert.doesNotThrow(() => validate(old, null), 'legacy loading path remains unchanged');
});

test('model2 rejects a different same-version point, changed steps/outcome, and mismatched root metadata', () => {
    const play = point(), mismatches = [];
    for (const change of [source => { source.id = 'point-two'; }, source => { source.steps[1].shot.to.x = 4; }, source => { source.outcome.winner = 'green'; }]) {
        const source = structuredClone(play); change(source); mismatches.push(compiled(source));
    }
    mismatches.push({ ...compiled(play), modelVersion: 1 }, { ...compiled(play), physicsVersion: 'other-version' });
    for (const timeline of mismatches) {
        assert.throws(() => GuidedPlayEngine.prototype.validateTimelineModel(play, timeline), /Model 2.*exact play/);
        const oldPlay = point(), oldTimeline = compiled(oldPlay);
        const replay = { currentPlay: oldPlay, timeline: oldTimeline, sceneEnvelope: 'preserved', playerObjects: new Map() };
        assert.throws(() => ThreeDPlaybackViewer.prototype.replaceDefinition.call(replay, play, timeline), /Model 2.*exact play/);
        assert.equal(replay.currentPlay, oldPlay);
        assert.equal(replay.timeline, oldTimeline);
        assert.equal(replay.sceneEnvelope, 'preserved');
    }
});

test('a rejected same-version replacement preserves playback intent and playhead before pause or exit', () => {
    const play = point(), other = point(); other.id = 'another-point';
    const timeline = compiled(other), engine = Object.create(GuidedPlayEngine.prototype);
    engine.board = { tokens: {}, threeD: { active: true } };
    engine.activePlay = point(); engine.timeline = compiled(engine.activePlay);
    engine.session = { playing: true }; engine.clock = { elapsed: .75 }; engine.status = 'playing';
    let pauseCalls = 0, exitCalls = 0;
    engine.pause = () => { pauseCalls++; engine.session.playing = false; engine.clock.elapsed = 0; };
    engine.exit = () => { exitCalls++; engine.activePlay = null; };
    const originalPlay = engine.activePlay, originalTimeline = engine.timeline;
    assert.throws(() => engine.replaceDefinition(play, 0, timeline), /Model 2.*exact play/);
    assert.throws(() => engine.loadDefinition(play, timeline), /Model 2.*exact play/);
    // A fresh model2 definition can also fail while compiling its own timeline.
    // It must be preflighted before exiting the current point.
    const uncompilable = point(); uncompilable.steps[1].shot.playerId = 'missing-player';
    assert.throws(() => engine.loadDefinition(uncompilable));
    assert.equal(pauseCalls, 0); assert.equal(exitCalls, 0);
    assert.equal(engine.session.playing, true); assert.equal(engine.clock.elapsed, .75);
    assert.equal(engine.activePlay, originalPlay); assert.equal(engine.timeline, originalTimeline);
    assert.equal(engine.board.threeD.active, true); assert.equal(engine.status, 'playing');
});
