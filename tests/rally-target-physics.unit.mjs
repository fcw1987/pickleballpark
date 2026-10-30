import test from 'node:test';
import assert from 'node:assert/strict';
import { solveFlightForClearanceV2, solveFlightV2, localNetHeightFeet, PHYSICS_V2 } from '../play-physics-v2.js';

test('clearance planning is the exact inverse of the shared solver on both ends', () => {
    for (const mirror of [false, true]) for (const clearance of [.2, .6, 1.5]) {
        const input = { from: { x: 6, y: mirror ? 44 : 0, heightFeet: 2.2 }, target: { x: 13, y: mirror ? 5 : 39 }, family: 'drive' };
        const flight = solveFlightForClearanceV2(input, clearance), point = flight.sampleBoard(flight.netTime);
        assert.ok(Math.abs(point.heightFeet - PHYSICS_V2.ballRadiusFeet - localNetHeightFeet(point.x) - clearance) < 1e-10);
        const replay = solveFlightV2({ ...input, physics: { launchVerticalFeetPerSecond: flight.metadata.launchVerticalFeetPerSecond } });
        assert.deepEqual(replay.stages, flight.stages);
        assert.deepEqual(replay.events, flight.events);
    }
});

test('clearance planning rejects incompatible launch inputs and impossible geometry', () => {
    const input = { from: { x: 6, y: 14, heightFeet: 7.5 }, target: { x: 13, y: 40 }, family: 'overhead' };
    assert.throws(() => solveFlightForClearanceV2(input, .1), /below/);
    assert.throws(() => solveFlightForClearanceV2({ ...input, physics: { apexFeet: 9 } }, 1), /not both/);
    assert.throws(() => solveFlightForClearanceV2({ ...input, target: { x: 4, y: 5 } }, 1), /cross/);
});

test('a below-tape clearance can represent a real mesh failure from a low contact', () => {
    const flight = solveFlightForClearanceV2({ from: { x: 7, y: 5, heightFeet: .13 }, target: { x: 10, y: 22.6 }, family: 'drive' }, -1.5);
    assert.equal(flight.obstruction.kind, 'net');
    assert.equal(flight.terminal.reason, 'net');
    assert.ok(flight.launchSpeedMph < 50, 'a low contact is lofted coherently rather than teleported across court');
});
