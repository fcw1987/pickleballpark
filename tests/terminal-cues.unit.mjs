import test from 'node:test';
import assert from 'node:assert/strict';
import { terminalCueAtTime, terminalCueLabel, terminalVisualsAtTime } from '../terminal-cues.js';
import { buildShotChapters } from '../shot-chapters.js';
import { updateCoachingUI } from '../coaching-ui.js';

const event = (type, time, extra = {}) => ({ id: `point:${type}:${time}`, type, time, actor: null, position: { x: 1, y: .2, z: 3 }, rallyLeg: 1, ...extra });
const timeline = events => ({ play: { modelVersion: 2 }, duration: 4, events });

test('terminal annotations sample the playhead deterministically across forward and backward scrubs', () => {
    const data = timeline([event('net-touch', 1), event('out', 2, { reason: 'wide' }), event('fault', 2, { reason: 'wide', actor: 'player1' }), event('dead', 2)]);
    const source = JSON.stringify(data);
    assert.deepEqual(terminalVisualsAtTime(data, .99), []);
    const sampled = terminalVisualsAtTime(data, 2.3);
    assert.deepEqual(sampled.map(item => item.type), ['out', 'fault']);
    assert.equal(sampled[0].label, 'Ball wide');
    assert.deepEqual(terminalVisualsAtTime(data, 1.2).map(item => item.type), ['net-touch']);
    assert.deepEqual(terminalVisualsAtTime(data, 2.3), sampled);
    assert.equal(JSON.stringify(data), source);
    assert.equal(terminalCueAtTime(data, 2).type, 'fault');
});

test('a legal net touch expires as a cue when a later player contacts the live ball', () => {
    const data = timeline([event('net-touch', 1), event('contact', 1.4)]);
    assert.equal(terminalCueAtTime(data, 1.2).type, 'net-touch');
    assert.equal(terminalCueAtTime(data, 1.4), null);
    assert.equal(terminalCueAtTime(data, 3), null);
});

test('momentum marker waits for observed foot evidence and retains earlier volley occurrence', () => {
    const data = timeline([event('dead', 1.5), event('fault', 2.2, { reason: 'nvz-momentum', violationOccurrenceTime: .5, evidenceObservedTime: 2.2 })]);
    assert.equal(terminalVisualsAtTime(data, 2).length, 0);
    const marker = terminalVisualsAtTime(data, 2.2)[0];
    assert.equal(marker.violationOccurrenceTime, .5);
    assert.equal(marker.evidenceObservedTime, 2.2);
    assert.equal(marker.label, 'Fault · Non-volley-zone momentum fault');
    assert.equal(terminalCueAtTime(data, 2.2).type, 'fault');
});

test('model1 receives no model2 markers or chapter fields', () => {
    const legacy = { ...timeline([event('out', 1)]), play: { modelVersion: 1 }, segments: [{ shotSemantics: {}, startTime: 0, contactTime: .4, rallyLeg: 1, step: { id: 'drive', label: '1. Drive', description: 'Legacy', shot: { type: 'drive' } } }] };
    assert.equal(terminalCueAtTime(legacy, 2), null);
    assert.deepEqual(terminalVisualsAtTime(legacy, 2), []);
    assert.deepEqual(Object.keys(buildShotChapters(legacy)[0]), ['shotId', 'number', 'label', 'anchor', 'contactTime', 'startTime', 'endTime']);
    const modern = { ...legacy, play: { modelVersion: 2 } };
    const chapter = buildShotChapters(modern)[0];
    assert.equal(chapter.label, 'Drive');
    assert.equal(chapter.description, 'Legacy');
    assert.equal(chapter.terminalEvents[0].type, 'out');
    assert.equal(chapter.terminalLabel, 'Out');
});

test('coaching cues name terminal evidence and clear the terminal state when seeking before it', () => {
    const attributes = new Map(), styles = new Map();
    const cue = { textContent: '', hidden: true, dataset: {}, style: { getPropertyValue: key => styles.get(key), setProperty: (key, value) => styles.set(key, value) }, setAttribute: (key, value) => attributes.set(key, value) };
    const sample = { playId: 'point', shotType: 'drive', phase: 'dead', elapsed: 2, eventTime: 2, reducedMotion: true, terminalEvent: event('fault', 2, { reason: 'body' }) };
    assert.equal(updateCoachingUI({ shotCue: cue }, sample).cue, 'Fault · Body contact');
    assert.equal(cue.dataset.terminalEvent, 'fault');
    assert.equal(cue.dataset.phase, 'fault');
    assert.equal(cue.hidden, false);
    assert.equal(terminalCueLabel(event('dead', 2, { reason: 'unreachable' })), 'Point over · Beyond modeled reach');
    updateCoachingUI({ shotCue: cue }, { ...sample, terminalEvent: null, phase: 'ready' });
    assert.equal(cue.dataset.terminalEvent, undefined);
    assert.equal(cue.hidden, true);
});
