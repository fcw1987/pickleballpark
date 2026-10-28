// Read-only cross-check against the actual coverage consumer, including a
// sibling isolated checkout before the two branches are integrated.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createStarterDocument, documentFromTemplate } from '../play-document.js';
import { compileEffectiveCandidate } from '../rally-proposals.js';
import { proposeRandomRally } from '../smart-rally-generator.js';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { createRallyCoverageProvider } from '../rally-coverage-provider.js';
import { createTacticalSnapshot } from '../rally-tactics.js';
import { samplePlayState, worldToBoard } from '../three-d-core.js';
import { sampleActorPresentation } from '../three-d-presentation.js';

const consumerRoot = resolve(process.argv[2] || '.');
const { readCoverageSnapshot } = await import(pathToFileURL(resolve(consumerRoot, 'player-coverage-snapshot.js')));
const { isCoverageSnapshot, coverageSectors } = await import(pathToFileURL(resolve(consumerRoot, 'player-coverage.js')));
const random = await proposeRandomRally({ length: 7, seed: 2 });
assert.ok(random.ok, random.reason);
const documents = [createStarterDocument(), random.document,
  documentFromTemplate(PICKLEBOARD_PLAYS.find(play => play.id === 'third-shot-drop')),
  documentFromTemplate(PICKLEBOARD_PLAYS.find(play => play.id === 'dink-exchange'))];
const cameras = [{ x: 5.5, y: 12, z: 9.5 }, { x: 11, y: 7, z: 0 }, { x: 0, y: 1.95, z: -10.2 }];
let cases = 0;
for (const document of documents) {
  const state = { document, ...compileEffectiveCandidate(document) };
  const provider = createRallyCoverageProvider(() => state), board = { coverageSnapshotProvider: provider };
  const times = [...new Set([0, state.timeline.duration, ...state.timeline.segments.map(segment => segment.startTime + segment.duration / 2),
    ...state.timeline.events.filter(event => event.type === 'bounce').flatMap(event => [Math.max(0, event.time - .001), Math.min(state.timeline.duration, event.time + .001)])])];
  const before = JSON.stringify(document), firstCamera = new Map();
  for (const cameraPosition of cameras) for (const timeSeconds of times) {
    const sample = samplePlayState(state.timeline, timeSeconds), segment = sample.segment;
    const samples = Object.fromEntries(Object.entries(document.players).map(([playerId, player]) => [playerId,
      sampleActorPresentation({ segment, playerId, localTime: sample.time - segment.startTime,
        cameraPosition, handedness: player.handedness, timeline: state.timeline,
        seconds: sample.time, instructionalMovement: true })]));
    const positions = Object.fromEntries(Object.entries(samples).map(([id, actor]) => [id, worldToBoard(actor.worldPosition)]));
    const expected = createTacticalSnapshot({ ...state, elapsed: timeSeconds, positions });
    const result = readCoverageSnapshot({ board, timeSeconds, ball: sample.ball, samples, segment });
    assert.ok(isCoverageSnapshot(result), `${document.id}/${timeSeconds}: real consumer accepts provider v1`);
    assert.equal(result.phase, expected.phase);
    assert.equal(result.legalReceiverId, expected.legalReceiver);
    assert.deepEqual(result.ball, expected.ball);
    assert.deepEqual(result.eligibleHitters, expected.eligibleHitters);
    const sectors = coverageSectors(result);
    assert.equal(sectors.length, 4);
    for (const sector of sectors) {
      assert.deepEqual(sector.position, expected.players[sector.id].position);
      assert.ok(Math.hypot(sector.direction.x - expected.players[sector.id].facing.x, sector.direction.y - expected.players[sector.id].facing.y) < 1e-12,
        'the real consumer must use engine facing without its fallback visual turn');
      assert.equal(sector.radius, 9, 'the visual radius remains a pedagogical design parameter');
    }
    if (!firstCamera.has(timeSeconds)) firstCamera.set(timeSeconds, result);
    else assert.deepEqual(result, firstCamera.get(timeSeconds), 'orbit cannot change rules, roles, positions or coverage facing');
    cases++;
  }
  assert.equal(JSON.stringify(document), before);
}
const revision = root => execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceState = root => execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).trim() ? 'dirty' : 'clean';
console.log(JSON.stringify({ passed: true, cases, documents: documents.length, cameras: cameras.length,
  engineRevision: revision('.'), consumerRevision: revision(consumerRoot),
  engineSourceState: sourceState('.'), consumerSourceState: sourceState(consumerRoot),
  checks: ['actual consumer v1 validation', 'metres-to-court-feet', 'actual actor samples', 'shared phase/ball/bounces',
    'designated receiver', 'camera-independent facing', 'visual blend bypass', 'immutable authored documents'] }, null, 2));
