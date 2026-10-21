import test from 'node:test';
import assert from 'node:assert/strict';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { compilePlayTimeline, samplePlayBall } from '../three-d-core.js';
import { validateRallyRules } from '../rally-rules.js';
import { MAX_SHOTS, SCHEMA_VERSION, createStarterDocument, documentFromTemplate, validateDocument } from '../play-document.js';
import { compileDocument, recompileAssistedDocument } from '../play-compiler.js';

const clone = value => structuredClone(value);

test('starter is a valid versioned three-shot source document', () => {
  const document = createStarterDocument();
  assert.equal(document.schemaVersion, SCHEMA_VERSION);
  assert.equal(document.shots.length, 3);
  assert.equal(validateDocument(document), document);
  assert.deepEqual(document.shots.map(shot => shot.family), ['serve', 'return', 'drop']);
});

test('validation rejects malformed, unbounded, duplicate, and non-finite authoring input', () => {
  const base = createStarterDocument();
  assert.throws(() => validateDocument({ ...base, schemaVersion: 99 }), /schemaVersion must be 1/);
  assert.throws(() => validateDocument({ ...base, title: '<b>'.repeat(100) }), /at most 120/);
  assert.throws(() => validateDocument({ ...base, shots: Array.from({ length: MAX_SHOTS + 1 }, () => base.shots[0]) }), new RegExp(`at most ${MAX_SHOTS}`));
  const duplicate = clone(base); duplicate.shots[1].id = duplicate.shots[0].id;
  assert.throws(() => validateDocument(duplicate), /must be unique/);
  const nan = clone(base); nan.shots[1].target.x = NaN;
  assert.throws(() => validateDocument(nan), /non-finite|finite x and y/);
  const manual = clone(base); manual.shots[1].movement = { intent: 'manual', pinned: true };
  assert.throws(() => validateDocument(manual), /target is required/);
  const reassigned = clone(base); reassigned.players.player1.team = 'orange';
  assert.throws(() => validateDocument(reassigned), /must remain green/);
  const metadata = clone(base);
  metadata.shots[0].authoring = { ownership: 'automatic', fields: ['shots[0].target'] };
  assert.throws(() => validateDocument(metadata), /supported shot fields/);
  metadata.shots[0].authoring = { ownership: 'automatic', fields: ['target'], extra: true };
  assert.throws(() => validateDocument(metadata), /not a supported authoring metadata/);
  metadata.shots[0].authoring = { ownership: 'automatic', fields: ['target', 'target'] };
  assert.throws(() => validateDocument(metadata), /duplicate field names/);
});

test('custom recipes compile through production steps and timeline with stable recipe event ids', () => {
  const document = createStarterDocument();
  const result = compileDocument(document);
  assert.equal(result.validShotCount, 3);
  assert.deepEqual(result.findings, []);
  assert.equal(result.play.steps.length, 4);
  assert.deepEqual(result.play.steps[0].positions, document.initialLayout);
  assert.equal(result.play.steps[1].shot.authoring.recipeId, 'serve-1');
  assert.deepEqual(result.play.steps[1].shot.intendedTarget, document.shots[0].target);
  assert.ok(result.timeline.events.every(event => event.id.includes(document.shots[event.rallyLeg - 1].id)));
  assert.deepEqual(result.timeline.segments.filter(segment => segment.trajectory).map(segment => segment.trajectory.bounces), [1, 1, 1]);
  assert.deepEqual(validateRallyRules(result.play, result.timeline).violations, []);
});

test('serve placement and a drive/drop choice produce genuinely different deterministic timelines', () => {
  const base = createStarterDocument();
  const shifted = clone(base);
  shifted.shots[0].target = { x: 7.25, y: 35.5 };
  shifted.shots[2] = { ...shifted.shots[2], family: 'drive', id: 'drive-3', arc: 'low', pace: 'firm', target: { x: 14.5, y: 32 } };
  const first = compileDocument(shifted), second = compileDocument(clone(shifted));
  assert.equal(first.validShotCount, 3);
  assert.deepEqual(first.play, second.play);
  assert.deepEqual(first.timeline.events, second.timeline.events);
  assert.deepEqual(first.play.steps[1].shot.to, { x: 7.25, y: 35.5 });
  assert.equal(first.play.steps[3].shot.type, 'drive');
  assert.equal(first.play.steps[3].shot.flight.speedMph, 40);
  assert.notEqual(first.timeline.duration, compileDocument(base).timeline.duration);
});

test('all supported shot families compile as intent rather than a lesson selector', () => {
  const families = ['serve', 'return', 'drive', 'drop', 'dink', 'volley', 'reset', 'lob', 'overhead'];
  for (const family of families) {
    const document = createStarterDocument();
    document.id = `custom-${family}`;
    document.opening = family === 'serve' ? 'serve' : 'midrally';
    document.initialLayout.ball = family === 'serve' ? { x: 16.2, y: 0 } : { x: 7, y: 14 };
    document.initialLayout.player1 = family === 'serve' ? { x: 15, y: -1 } : { x: 7, y: 14 };
    document.shots = [{
      id: `${family}-recipe`, family, hitter: 'player1', receiver: 'auto',
      contactStyle: family === 'reset' ? 'short-hop' : 'forehand', target: { x: 7, y: family === 'serve' ? 38 : 32 },
      arc: family === 'drive' ? 'low' : family === 'lob' ? 'high' : 'medium', pace: family === 'drop' ? 'soft' : 'medium',
      movement: { intent: 'hold', pinned: false }, ...(family === 'serve' ? { serveMethod: 'drop' } : {})
    }];
    const result = compileDocument(document);
    assert.equal(result.validShotCount, 1, `${family}: ${result.findings.map(item => item.message).join('; ')}`);
    assert.equal(result.play.steps[1].shot.authoring.family, family);
  }
});

test('rule violations and feasibility failures are distinct and preserve a playable prefix', () => {
  const wrongTeam = createStarterDocument();
  wrongTeam.shots[1].hitter = 'player2';
  const rule = compileDocument(wrongTeam);
  assert.equal(rule.validShotCount, 1);
  assert.equal(rule.findings[0].kind, 'rule');
  assert.equal(rule.findings[0].shotId, 'return-2');
  assert.ok(rule.timeline.duration > 0);

  const unreachable = createStarterDocument();
  unreachable.opening = 'midrally';
  unreachable.initialLayout.ball = { x: 1, y: 14 };
  unreachable.initialLayout.player1 = { x: 19, y: 40 };
  unreachable.shots = [{ ...unreachable.shots[2], id: 'unreachable', hitter: 'player1', target: { x: 2, y: 32 } }];
  const feasible = compileDocument(unreachable);
  assert.equal(feasible.validShotCount, 0);
  assert.equal(feasible.findings[0].kind, 'feasibility');
  assert.equal(feasible.timeline.duration, 0);
});

test('intentional fault remains visible and terminates without an invented continuation', () => {
  const document = createStarterDocument();
  document.intentionalFault = true;
  document.ending = 'fault';
  document.shots[0].target = { x: 15, y: 38 };
  const result = compileDocument(document);
  assert.equal(result.validShotCount, 1);
  assert.equal(result.findings[0].kind, 'rule');
  assert.equal(result.findings[0].severity, 'warning');
  assert.equal(result.play.steps.length, 2);
});

test('opening sequence protects the two-bounce rule and treats the kitchen line as a serve fault', () => {
  const kitchenLine = createStarterDocument();
  kitchenLine.shots[0].target = { x: 5, y: 29 };
  const serveFault = compileDocument(kitchenLine);
  assert.equal(serveFault.validShotCount, 0);
  assert.match(serveFault.findings[0].message, /beyond the non-volley-zone line/);

  const volleyReturn = createStarterDocument();
  volleyReturn.shots[1] = { ...volleyReturn.shots[1], family: 'volley', contactStyle: 'forehand' };
  const returnFault = compileDocument(volleyReturn);
  assert.equal(returnFault.validShotCount, 1);
  assert.match(returnFault.findings.find(item => /receiving team/.test(item.message)).message, /let the serve bounce/);
  assert.deepEqual(returnFault.play.steps[1].shot.to, volleyReturn.shots[0].target,
    'the playable prefix must not retain an interception derived from the rejected recipe');
  assert.equal(returnFault.play.steps[1].shot.flight.bounces, 1);
});

test('serve intent is accepted only as the first shot of a full-rally opening', () => {
  const fullRally = createStarterDocument();
  assert.equal(compileDocument(fullRally).validShotCount, 3);

  const midrally = createStarterDocument();
  midrally.opening = 'midrally';
  midrally.shots = [midrally.shots[0]];
  const firstServe = compileDocument(midrally);
  assert.equal(firstServe.validShotCount, 0);
  assert.match(firstServe.findings[0].message, /only begin a standard full-rally draft/);

  for (const opening of ['serve', 'midrally']) {
    const late = createStarterDocument();
    late.opening = opening;
    if (opening === 'midrally') {
      late.shots.shift();
      late.initialLayout.ball = { x: 5, y: 42 };
    }
    late.shots[1] = { ...late.shots[1], family: 'serve', serveMethod: 'volley' };
    const result = compileDocument(late);
    assert.equal(result.validShotCount, 1, opening);
    assert.match(result.findings.find(item => item.shotId === late.shots[1].id).message, /only begin a standard full-rally draft/);
  }
});

test('drop serves include a distinct preparatory bounce before contact and the legal rally bounce', () => {
  const document = createStarterDocument();
  document.shots[0].serveMethod = 'drop';
  const result = compileDocument(document);
  assert.equal(result.validShotCount, 3);
  assert.equal(result.play.steps[1].shot.authoring.serveMethod, 'drop');
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.play.steps[1].shot.servePreparation, { method: 'drop', releaseHeightFeet: 3.5, reboundDuration: .34 });
  const first = result.timeline.segments.find(segment => segment.rallyLeg === 1);
  assert.equal(first.servePreparation.method, 'drop');
  assert.ok(first.contactTime > .7);
  const preparation = result.timeline.events.filter(event => event.type === 'preparation-bounce');
  const rallyBounces = result.timeline.events.filter(event => event.type === 'bounce' && event.rallyLeg === 1);
  assert.equal(preparation.length, 1);
  assert.equal(rallyBounces.length, 1);
  assert.ok(preparation[0].time < result.timeline.events.find(event => event.type === 'contact').time);
  assert.ok(rallyBounces[0].time > result.timeline.events.find(event => event.type === 'contact').time);
  assert.match(preparation[0].id, /serve-1:preparation-bounce$/);

  const atRelease = samplePlayBall(result.timeline, 0);
  const falling = samplePlayBall(result.timeline, preparation[0].time - .05);
  const atBounce = samplePlayBall(result.timeline, preparation[0].time);
  const rising = samplePlayBall(result.timeline, preparation[0].time + .05);
  const atContact = samplePlayBall(result.timeline, first.startTime + first.contactTime);
  assert.ok(atRelease.y > atContact.y && atContact.y > atBounce.y);
  assert.ok(falling.y > atBounce.y && rising.y > atBounce.y);
  assert.equal(atBounce.phase, 'preparation-bounce');
  assert.ok(atBounce.y >= 0);
  assert.deepEqual(atRelease.board, atBounce.board, '2D projection remains at the authored release/contact location');
  assert.ok(Math.hypot(atContact.x - first.trajectory.start.x, atContact.y - first.trajectory.start.y, atContact.z - first.trajectory.start.z) < 1e-9);
  assert.deepEqual(samplePlayBall(result.timeline, preparation[0].time), atBounce);
  assert.deepEqual(validateRallyRules(result.play, result.timeline).violations, []);

  const invalidPlay = clone(result.play);
  invalidPlay.steps[1].shot.servePreparation.releaseHeightFeet = 4;
  assert.throws(() => compilePlayTimeline(invalidPlay), /fixed 3\.5ft release height/);
});

test('a pinned prior movement stops a dependent contact instead of being overwritten', () => {
  const document = createStarterDocument();
  document.shots[2].receiver = 'player3';
  document.shots[2].movement = { intent: 'manual', pinned: true, target: { x: 12, y: 12 } };
  document.shots.push(
    { id: 'drive-4', family: 'drive', hitter: 'player3', receiver: 'player1', contactStyle: 'forehand', target: { x: 3, y: 3 }, arc: 'low', pace: 'firm', movement: { intent: 'hold', pinned: false } },
    { id: 'drop-5', family: 'drop', hitter: 'player1', receiver: 'auto', contactStyle: 'forehand', target: { x: 4, y: 28 }, arc: 'high', pace: 'soft', movement: { intent: 'advance', pinned: false } }
  );
  const result = compileDocument(document);
  assert.equal(result.validShotCount, 4);
  assert.match(result.findings.find(item => item.shotId === 'drop-5').message, /pinned at \(12\.0, 12\.0\)/);
  assert.deepEqual(result.play.steps[3].positions.player1, { x: 12, y: 12 });
  assert.deepEqual(document.shots[2].movement.target, { x: 12, y: 12 });
});

test('automatic stroke side uses handedness and the actor stance', () => {
  const right = createStarterDocument();
  right.opening = 'midrally';
  right.initialLayout.ball = { x: 12, y: 14 };
  right.initialLayout.player1 = { x: 10, y: 14 };
  right.shots = [{ ...right.shots[2], id: 'auto-side', contactStyle: 'auto', target: { x: 12, y: 32 } }];
  const left = clone(right);
  left.players.player1.handedness = 'left';
  assert.equal(compileDocument(right).play.steps[1].shot.contact.strokeSide, 'forehand');
  assert.equal(compileDocument(left).play.steps[1].shot.contact.strokeSide, 'backhand');
});

test('winner and fault endings are visible terminal semantics', () => {
  for (const ending of ['winner', 'fault']) {
    const document = createStarterDocument();
    document.ending = ending;
    const result = compileDocument(document);
    const last = result.play.steps.at(-1);
    assert.match(last.label, ending === 'winner' ? /Winner/ : /Fault/);
    assert.match(last.description, new RegExp(`Declared ${ending}`));
    assert.deepEqual(result.play.outcome, { intent: ending, afterShotId: 'drop-3', intentionalFault: false });
    assert.equal(result.validShotCount, 3);
  }
});

test('compiler does not mutate source targets, manual movement, or pins', () => {
  const document = createStarterDocument();
  document.shots[2].movement = { intent: 'manual', pinned: true, target: { x: 12, y: 12 }, waypoints: [{ x: 13, y: 8 }] };
  const before = clone(document);
  Object.freeze(document.shots[2].movement);
  Object.freeze(document.shots[2]);
  const result = compileDocument(document);
  assert.deepEqual(document, before);
  assert.deepEqual(document.shots[2].movement, before.shots[2].movement);
  assert.deepEqual(result.play.steps[3].shot.authoring.movement, before.shots[2].movement);
  assert.deepEqual(result.findings.find(item => item.kind === 'unsupported'), {
    kind: 'unsupported', severity: 'warning', shotId: 'drop-3',
    message: 'Movement waypoints are preserved, but trajectory model version 1 uses the final movement target only.'
  });
});

test('all eight templates preserve approved timing, positions, contacts, and bounce semantics exactly', () => {
  assert.equal(PICKLEBOARD_PLAYS.length, 8);
  for (const source of PICKLEBOARD_PLAYS) {
    const document = documentFromTemplate(source);
    const result = compileDocument(document);
    assert.equal(result.validShotCount, source.steps.filter(step => step.shot).length, source.id);
    assert.deepEqual(result.play.steps, source.steps, source.id);
    const sourceResult = compileDocument(documentFromTemplate(source));
    assert.equal(result.timeline.duration, sourceResult.timeline.duration, source.id);
    assert.deepEqual(result.timeline.segments.map(segment => segment.step.positions), sourceResult.timeline.segments.map(segment => segment.step.positions), source.id);
  }
});

test('editing a template recipe leaves the exact-source path and recompiles authored intent', () => {
  const source = PICKLEBOARD_PLAYS.find(play => play.id === 'third-shot-drop');
  const document = documentFromTemplate(source);
  document.shots[2].target = { x: 11.25, y: 28.5 };
  document.shots[2].family = 'drive';
  document.shots[2].arc = 'low';
  document.shots[2].pace = 'firm';
  const result = compileDocument(document);
  assert.equal(result.validShotCount, 3);
  assert.deepEqual(result.play.steps[3].shot.intendedTarget, { x: 11.25, y: 28.5 });
  assert.equal(result.play.steps[3].shot.type, 'drive');
  assert.notDeepEqual(result.play.steps, source.steps);
});

test('changes to non-shot template source fields cannot use stale approved steps', () => {
  const source = PICKLEBOARD_PLAYS.find(play => play.id === 'third-shot-drop');
  const mutations = [
    document => { document.initialLayout.player2.x = 6; },
    document => { document.players.player1.handedness = 'left'; },
    document => { document.opening = 'midrally'; },
    document => { document.ending = 'winner'; }
  ];
  for (const mutate of mutations) {
    const document = documentFromTemplate(source);
    mutate(document);
    const result = compileDocument(document);
    assert.notDeepEqual(result.play.steps, source.steps);
    assert.deepEqual(result.play.assistance, document.assistance);
    assert.equal(result.play.ending, document.ending);
    assert.equal(result.play.rally.openingBouncesSatisfied, document.opening === 'midrally');
  }
});

test('guide-only assistance and annotations preserve every approved template timeline', () => {
  for (const source of PICKLEBOARD_PLAYS) {
    const baselineDocument = documentFromTemplate(source);
    const baseline = compileDocument(baselineDocument);
    const guidedDocument = documentFromTemplate(source);
    guidedDocument.assistance.showGuides = true;
    guidedDocument.annotations.push({ type: 'label', text: 'Guide-only note' });
    const guided = compileDocument(guidedDocument);
    assert.deepEqual(guided.play.steps, baseline.play.steps, source.id);
    assert.equal(guided.timeline.duration, baseline.timeline.duration, source.id);
    assert.deepEqual(guided.timeline.events, baseline.timeline.events, source.id);
  }
});

test('template source cannot smuggle modified runtime steps or forged compatibility signatures', () => {
  const source = PICKLEBOARD_PLAYS.find(play => play.id === 'dink-exchange');
  const changedStep = documentFromTemplate(source);
  changedStep.templateSource.play.steps[0].label = '<img src=x onerror=alert(1)>';
  assert.throws(() => validateDocument(changedStep), /plain text|trusted built-in lesson snapshot/);

  const forgedRecipes = documentFromTemplate(source);
  forgedRecipes.templateSource.recipeSignatures[0] = JSON.stringify({ ...forgedRecipes.shots[0], target: { x: 19, y: 43 } });
  assert.throws(() => validateDocument(forgedRecipes), /trusted lesson recipes/);

  const forgedDocument = documentFromTemplate(source);
  forgedDocument.templateSource.documentSignature = JSON.stringify({});
  assert.throws(() => validateDocument(forgedDocument), /trusted lesson document fields/);

  assert.throws(() => documentFromTemplate({ ...source, id: 'untrusted-copy' }), /trusted built-in lessons/);
});

test('one sampled ball remains continuous at every generated event boundary', () => {
  const timeline = compileDocument(createStarterDocument()).timeline;
  for (const event of timeline.events) {
    const before = samplePlayBall(timeline, Math.max(0, event.time - 1e-7));
    const at = samplePlayBall(timeline, event.time);
    const after = samplePlayBall(timeline, Math.min(timeline.duration, event.time + 1e-7));
    assert.ok(Math.hypot(before.x - at.x, before.y - at.y, before.z - at.z) < 2e-5, event.id);
    assert.ok(Math.hypot(after.x - at.x, after.y - at.y, after.z - at.z) < 2e-5, event.id);
  }
  assert.equal(new Set(timeline.events.map(event => event.id)).size, timeline.events.length);
});

test('coverage recompilation preserves semantics, pins, targets, and stable event ids', () => {
  const document = createStarterDocument();
  document.assistance.autoShading = true;
  const compiled = compileDocument(document);
  const assisted = clone(compiled.play);
  assisted.steps[1].positions.player2.x += .35;
  const coverage = [{ shotId: 'serve-1', explanation: 'Suggested Coverage' }];
  const result = recompileAssistedDocument(document, compiled, assisted, coverage);
  assert.equal(result.play.steps[1].positions.player2.x, compiled.play.steps[1].positions.player2.x + .35);
  assert.deepEqual(result.play.steps.map(step => step.shot?.intendedTarget), compiled.play.steps.map(step => step.shot?.intendedTarget));
  assert.deepEqual(result.timeline.events.map(event => event.id), compiled.timeline.events.map(event => event.id));
  for (const time of compiled.timeline.events.map(event => event.time)) {
    assert.deepEqual(samplePlayBall(result.timeline, time), samplePlayBall(compiled.timeline, time), `ball flight at ${time}`);
  }
  assert.deepEqual(result.coverage, coverage);

  const guideDocument = createStarterDocument();
  guideDocument.assistance.showGuides = true;
  const guideCompiled = compileDocument(guideDocument);
  const guide = recompileAssistedDocument(guideDocument, guideCompiled, clone(guideCompiled.play), coverage);
  assert.deepEqual(guide.play.steps, guideCompiled.play.steps);
  assert.deepEqual(guide.coverage, coverage);
});

test('coverage boundary rejects authored changes and declines unreachable suggestions', () => {
  const document = createStarterDocument();
  const compiled = compileDocument(document);
  const changedBall = clone(compiled.play);
  changedBall.steps[1].positions.ball.x += 1;
  assert.throws(() => recompileAssistedDocument(document, compiled, changedBall, []), /may not change ball/);

  const changedTarget = clone(compiled.play);
  changedTarget.steps[1].shot.intendedTarget.x += 1;
  assert.throws(() => recompileAssistedDocument(document, compiled, changedTarget, []), /player positions only/);

  const pinnedDocument = createStarterDocument();
  pinnedDocument.shots[0].movement.pinned = true;
  const pinnedCompiled = compileDocument(pinnedDocument);
  const changedPin = clone(pinnedCompiled.play);
  changedPin.steps[1].positions.player1.x += .1;
  assert.throws(() => recompileAssistedDocument(pinnedDocument, pinnedCompiled, changedPin, []), /may not change player1/);

  const unreachable = clone(compiled.play);
  unreachable.steps[1].positions.player2.x = 100;
  const declined = recompileAssistedDocument(document, compiled, unreachable, coverageFixture());
  assert.equal(declined.play, compiled.play);
  assert.match(declined.findings.at(-1).message, /could not reach/);
});

function coverageFixture() {
  return [{ shotId: 'serve-1', explanation: 'Suggested Coverage test fixture' }];
}
