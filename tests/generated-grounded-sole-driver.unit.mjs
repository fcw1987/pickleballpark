import test from 'node:test';
import assert from 'node:assert/strict';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';
import { GENERATED_DEFAULT_FOOT_STATE_V1 as marker, defaultFeetAtV1 } from '../generated-foot-state.js';
import { GENERATED_GROUNDED_SOLE_V1 as sole, groundedSoleClearsNVZV1 } from '../generated-grounded-sole.js';
import { createEngineDriverV1 } from '../rally-engine-driver.js';
import { simulateRally } from '../rally-engine.js';
import { normalizeRallyInputV1 } from '../rally-recipe.js';
import { MODEL2_AUTHORING_FIELDS, validateDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';

const ids = ['player1', 'player2', 'player3', 'player4'];
function provisional(document) {
  const shot = document.shots[0];
  shot.generation = { seed: 7, generatorVersion: 'rally-engine-v1' };
  shot.authoring = { ownership: 'automatic', fields: MODEL2_AUTHORING_FIELDS.filter(key => Object.hasOwn(shot, key)) };
  return { status: 'censored', document, outcome: null, outcomeClassification: null, decisions: [{ shotId: shot.id }], stats: { shots: 1 },
    diagnostics: { groundedSoles: { valid: true, checkedContacts: 1 } } };
}
function assertPointValid(document) {
  validateDocument(document);
  const compiled = compileDocument(document);
  assert.equal(compiled.validShotCount, 1, JSON.stringify(compiled.findings));
  assert.equal(validateRallyRules(compiled.play, compiled.timeline).valid, true);
  assert.equal(inspectGeneratedMovementV1(compiled.timeline, { maxAccelerationFeetPerSecondSquared: 30 }).valid, true);
  assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
  return compiled;
}

for (const far of [false, true]) for (const handedness of ['left', 'right']) for (const edge of ['front', 'side']) {
  test(`serialized contact audit rejects point-valid ${edge} NVZ sole overlap (${far ? 'far' : 'near'}/${handedness})`, async () => {
    const map = p => far ? { x: 20 - p.x, y: 44 - p.y } : p;
    const remap = id => far ? ({ player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' })[id] : id;
    const actor = remap('player1'), root = edge === 'front' ? { x: 8, y: 14.8 } : { x: -.72001, y: 16.5 };
    const ball = edge === 'front' ? { x: 7, y: 14.8 } : { x: -1.5, y: 17 };
    const layout = { player1: root, player2: { x: 17, y: 5 }, player3: { x: 16, y: 35 }, player4: { x: 19, y: 40 } };
    const initialLayout = Object.fromEntries(Object.entries(layout).map(([id, p]) => [remap(id), map(p)])); initialLayout.ball = map(ball);
    const shot = model2Shot({ hitter: actor, family: 'volley', intent: edge === 'side' ? 'erne' : 'volley', contactMode: 'volley',
      target: map(edge === 'front' ? { x: 7, y: 30 } : { x: 5, y: 29 }), physics: { apexFeet: edge === 'side' ? 5 : 4.5 },
      contactEvidence: { feet: defaultFeetAtV1(map(root), marker), feetEstablishedOutsideNVZ: true },
      ...(edge === 'side' ? { contactOverride: map(ball) } : {}) });
    const document = model2Document({ defaultFootState: marker, initialLayout, ending: 'stop', shots: [shot] });
    document.players[actor].handedness = handedness;
    const source = provisional(document), before = JSON.stringify(source); assertPointValid(document);
    assert.ok(shot.contactEvidence.feet.some(foot => !groundedSoleClearsNVZV1(foot)));
    const result = await createEngineDriverV1(async () => source, { yieldControl: async () => {} })({ seed: 7, options: { maxShots: 1 } });
    assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.code, 'generated-grounded-sole', JSON.stringify(result.diagnostics));
    assert.equal(result.diagnostics.validation.groundedSoles.reason, 'volley-sole-nvz');
    assert.equal(result.diagnostics.validation.groundedSoles.actor, actor);
    assert.equal(result.diagnostics.validation.groundedSoles.version, sole.version);
    assert.equal(result.document, null); assert.equal(JSON.stringify(source), before);
    const historical = structuredClone(document); delete historical.defaultFootState;
    const unmarked = compileDocument(historical);
    assert.equal(unmarked.validShotCount, 1); assert.deepEqual(unmarked.play.steps, compileDocument(document).play.steps,
      'public authored compilation preserves the explicit source feet, including an old point-only contact');
  });
}

for (const team of ['green', 'orange']) for (const court of ['right', 'left']) for (const hand of ['left', 'right']) {
  test(`serialized serve audit rejects actual baseline sole overlap without moving the declared layout (${team}/${court}/${hand})`, async () => {
    const near = team === 'green', server = near ? 'player1' : 'player3', receiver = near ? 'player3' : 'player1';
    const players = Object.fromEntries(ids.map((id, index) => [id, { team: index < 2 ? 'green' : 'orange', handedness: hand, style: 'advanced', flavour: 'balanced' }]));
    const input = structuredClone(normalizeRallyInputV1({ seed: 7, players, service: { server, receiver, court }, options: { maxShots: 1 } }));
    const baseline = await simulateRally(input); assert.equal(baseline.status, 'censored', JSON.stringify(baseline.diagnostics));
    const source = structuredClone(baseline), document = source.document, shot = document.shots[0], y = near ? -.1 : 44.1;
    document.initialLayout[server].y = y; shot.contactEvidence.feet.forEach(foot => { foot.y = y; }); shot.movement.target.y = y;
    source.diagnostics = { groundedSoles: { valid: true, checkedContacts: 1 } };
    const before = JSON.stringify(source); assertPointValid(document);
    const result = await createEngineDriverV1(async () => source, { yieldControl: async () => {} })(input);
    assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.code, 'generated-grounded-sole', JSON.stringify(result.diagnostics));
    const audit = result.diagnostics.validation.groundedSoles;
    assert.equal(audit.reason, 'serve-sole-boundary'); assert.equal(audit.actor, server); assert.equal(audit.team, team); assert.equal(audit.court, court);
    assert.equal(result.document, null); assert.equal(JSON.stringify(source), before);
  });
}

for (const team of ['green', 'orange']) for (const court of ['right', 'left']) for (const hand of ['left', 'right']) for (const edge of ['min', 'max']) {
  test(`serialized serve audit allows exact lateral extension equality, rejecting just outside (${team}/${court}/${hand}/${edge})`, async () => {
    const near = team === 'green', server = near ? 'player1' : 'player3', receiver = near ? 'player3' : 'player1';
    const players = Object.fromEntries(ids.map((id, index) => [id, { team: index < 2 ? 'green' : 'orange', handedness: hand, style: 'advanced', flavour: 'balanced' }]));
    const input = structuredClone(normalizeRallyInputV1({ seed: 7, players, service: { server, receiver, court }, options: { maxShots: 1 } }));
    const baseline = await simulateRally(input); assert.equal(baseline.status, 'censored', JSON.stringify(baseline.diagnostics));
    for (const outside of [false, true]) {
      const source = structuredClone(baseline), document = source.document, shot = document.shots[0];
      const minX = near === (court === 'right') ? 0 : 10, delta = outside ? 1e-8 : 0;
      const boundary = edge === 'min' ? minX + sole.halfWidthFeet - delta : minX + 10 - sole.halfWidthFeet + delta;
      const left = edge === 'min' ? boundary : boundary - 1.44, right = edge === 'min' ? boundary + 1.44 : boundary;
      const rootX = (left + right) / 2, shift = rootX - document.initialLayout[server].x;
      document.initialLayout[server].x = rootX; document.initialLayout.ball.x += shift; shot.movement.target.x = rootX;
      shot.contactEvidence.feet.forEach((foot, index) => { foot.x = (near ? index === 0 : index === 1) ? right : left; });
      // Deliberately contradict the true result: the final driver recomputes
      // the declared source rather than trusting the attempt's diagnostic.
      source.diagnostics = { groundedSoles: { valid: outside, checkedContacts: 1 } };
      const before = JSON.stringify(source); assertPointValid(document);
      const result = await createEngineDriverV1(async () => source, { yieldControl: async () => {} })(input);
      assert.equal(result.status, outside ? 'failed' : 'censored', JSON.stringify(result.diagnostics));
      const audit = result.diagnostics.validation.groundedSoles;
      assert.equal(audit.valid, !outside); assert.equal(audit.checkedContacts, 1);
      if (outside) {
        assert.equal(result.diagnostics.code, 'generated-grounded-sole'); assert.equal(audit.reason, 'serve-sole-boundary');
        assert.equal(audit.actor, server); assert.equal(audit.team, team); assert.equal(audit.court, court); assert.equal(result.document, null);
      } else assert.deepEqual(result.document.initialLayout, document.initialLayout);
      assert.equal(JSON.stringify(source), before);
    }
  });
}
