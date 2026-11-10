import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDocument } from '../play-document.js';
import { compileDocument } from '../play-compiler.js';
import { validateRallyRules } from '../rally-rules.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { isInNonVolleyZone } from '../court-geometry.js';
import { PHYSICS_V2, localNetHeightFeet } from '../play-physics-v2.js';
import { applyExecutionV1, resolveDeliveredFlightV1, DINK_POPUP_VERSION } from '../rally-quality.js';
import { simulateRally } from '../rally-engine.js';
import { eligibleHitters } from '../rally-state.js';

const controls = JSON.parse(readFileSync(new URL('./fixtures/model2/dink-popup-attack-controls.json', import.meta.url), 'utf8'));
const archived = JSON.parse(readFileSync(new URL('./fixtures/model2/dink-popup-archived.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const round = value => Math.round(value * 1e9) / 1e9;
const surfaceClearance = point => point.heightFeet - PHYSICS_V2.ballRadiusFeet - localNetHeightFeet(point.x);
const exchangeIds = { player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' };

// Rotation preserves anatomical handedness; lateral reflection swaps it and
// the explicit server-perspective court. No player is moved independently.
function reflect(value, rotate = false, lateral = false) {
  if (Array.isArray(value)) return value.map(item => reflect(item, rotate, lateral));
  if (value && typeof value === 'object') {
    const out = Object.fromEntries(Object.entries(value).map(([key, item]) => [rotate ? exchangeIds[key] ?? key : key, reflect(item, rotate, lateral)]));
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
      out.x = rotate !== lateral ? 20 - value.x : value.x;
      out.y = rotate ? 44 - value.y : value.y;
    }
    return out;
  }
  if (typeof value !== 'string') return value;
  if (rotate) value = exchangeIds[value] ?? (value === 'green' ? 'orange' : value === 'orange' ? 'green' : value);
  return lateral ? value === 'right' ? 'left' : value === 'left' ? 'right' : value : value;
}

function independentlyValid(document) {
  const before = JSON.stringify(document);
  validateDocument(document);
  const compiled = compileDocument(document), rules = validateRallyRules(compiled.play, compiled.timeline);
  assert.equal(compiled.validShotCount, document.shots.length, JSON.stringify(compiled.findings));
  assert.deepEqual(compiled.findings.filter(item => item.severity === 'error'), []);
  assert.deepEqual(rules.violations, []);
  assert.equal(rules.valid, true);
  assert.equal(inspectGeneratedMovementV1(compiled.timeline).valid, true);
  assert.equal(inspectGeneratedSpacingV1(compiled.timeline).valid, true);
  assert.equal(JSON.stringify(document), before);
  return compiled;
}

for (const row of controls.cases) test(`preserved ${row.name} fast attack has an actual legal reply without changing old source`, () => {
  assert.equal(row.document.generation.policyVersion, 'rally-policy-v2');
  const compiled = independentlyValid(row.document);
  const attack = compiled.timeline.segments[row.attackIndex], reply = compiled.timeline.segments[row.attackIndex + 1];
  const contact = reply.shotSemantics.contact;
  assert.equal(reply.shotSemantics.playerId, row.expected.replyHitter);
  assert.equal(contact.kind, row.expected.replyContactKind);
  assert.equal(row.document.shots[row.attackIndex].quality, row.expected.quality);
  assert.ok(Math.abs(attack.trajectory.solved.launchSpeedMph - row.expected.launchSpeedMph) < 1e-8);
  assert.ok(Math.abs(attack.step.shot.physicsV2.endTimeSeconds - row.expected.replyAfterContactSeconds) < 1e-8);
  if (contact.kind === 'volley') assert.ok(contact.feet.every(foot => !isInNonVolleyZone(foot)));
  assert.equal(row.document.intentionalFault, false);
});

for (const row of archived.rows) for (const [rotation, lateral] of [[false, false], [true, false], [false, true], [true, true]]) {
  const name = `${row.name}/${rotation ? 'opposite-end' : 'original-end'}/${lateral ? 'left-hand' : 'right-hand'}`;
  test(`${name}: ordinary line-to-line positive clears the local tape with actual arrival and attacking reply`, () => {
    const low = reflect(row.original, rotation, lateral), positive = reflect(row.explicitPositive.document, rotation, lateral);
    assert.deepEqual(positive.initialLayout, low.initialLayout);
    assert.deepEqual(positive.shots.slice(0, row.shotNumber - 1), low.shots.slice(0, row.shotNumber - 1));
    const lowCompiled = independentlyValid(low), compiled = independentlyValid(positive);
    const lowContact = lowCompiled.timeline.segments.at(-1).shotSemantics.contact.point;
    assert.ok(surfaceClearance(lowContact) < 0, 'original low reply is below tape height');
    const reply = compiled.timeline.segments.at(-1), dink = compiled.timeline.segments.at(-2);
    const contact = reply.shotSemantics.contact, hitter = reply.shotSemantics.playerId;
    assert.equal(contact.kind, 'volley');
    assert.ok(surfaceClearance(contact.point) > .15, `${surfaceClearance(contact.point)}ft local clearance`);
    assert.ok(contact.feet.every(foot => !isInNonVolleyZone(foot)));
    const center = { x: (contact.feet[0].x + contact.feet[1].x) / 2, y: (contact.feet[0].y + contact.feet[1].y) / 2 };
    assert.ok(Math.hypot(contact.point.x - center.x, contact.point.y - center.y) <= 3 + 1e-7);
    assert.ok(eligibleHitters({ players: positive.players, service: positive.service,
      contactIndex: row.shotNumber, previousHitter: positive.shots[row.shotNumber - 1].hitter }).includes(hitter));
    assert.ok(positive.players[hitter].team === 'green'
      ? contact.point.y + PHYSICS_V2.ballRadiusFeet < 22 : contact.point.y - PHYSICS_V2.ballRadiusFeet > 22);
    assert.ok(dink.trajectory.solved.launchSpeedMph <= 20);
    assert.ok(dink.trajectory.solved.metadata.apexFeet <= 6.5);
    assert.ok(isInNonVolleyZone(dink.trajectory.solved.landing));
    assert.equal(dink.trajectory.solved.obstruction, null);
    const flight = reply.trajectory.solved;
    assert.equal(flight.obstruction, null);
    assert.ok(flight.launchSpeedMph >= 22 && flight.launchSpeedMph <= 45);
    assert.ok(flight.metadata.netClearanceInches >= 0 && flight.metadata.netClearanceInches <= 16);
  });
  test(`${name}: an early opponent-side/arrival impossibility cannot be certified as an attack`, () => {
    const invalid = reflect(row.negative.document, rotation, lateral), before = JSON.stringify(invalid);
    const positive = reflect(row.explicitPositive.document, rotation, lateral);
    const withoutTiming = document => document.shots.map(({ contactTiming, ...shot }) => shot);
    assert.deepEqual(withoutTiming(invalid), withoutTiming(positive), 'the negative changes no geometry except its incoming contact time');
    validateDocument(invalid);
    const compiled = compileDocument(invalid), rules = validateRallyRules(compiled.play, compiled.timeline);
    assert.ok(compiled.validShotCount < invalid.shots.length);
    assert.ok(compiled.findings.some(finding => finding.severity === 'error'));
    assert.equal(rules.valid, false);
    for (const code of ['opponent-court-contact', 'contact-feet-reach']) assert.ok(rules.violations.some(violation =>
      violation.code === code && violation.stepId === invalid.shots.at(-1).id && violation.actor === invalid.shots.at(-1).hitter));
    assert.equal(JSON.stringify(invalid), before);
  });
}

for (const row of archived.rows) test(`${row.name}: normal contact search discovers actual opportunity using the same fixed execution draws`, async () => {
  const index = row.shotNumber - 1;
  const request = { ...clone(row.input), seed: row.seed };
  request.options.maxShots = row.shotNumber + 1;
  const result = await simulateRally(request);
  assert.ok(['complete', 'censored'].includes(result.status), JSON.stringify(result.diagnostics));
  assert.equal(result.document.shots.length, row.shotNumber + 1);
  independentlyValid(result.document);
  const decision = result.decisions[index], next = result.decisions[index + 1];
  assert.deepEqual(decision.draws, row.draws, 'the original quality and perturbation draws are not redrawn');
  assert.deepEqual(decision.resolution.target, {
    x: round(row.fixedMapping.target.x), y: round(row.fixedMapping.target.y)
  });
  assert.equal(decision.execution.quality, 'attackable');
  const fact = decision.resolution.physicalTransformation.dinkPopup;
  assert.equal(fact.version, DINK_POPUP_VERSION);
  assert.equal(fact.receiverOpportunity.status, 'unestablished', 'the delivery alone makes no future contact claim');
  assert.equal(fact.receiverOpportunity.scope, 'at-delivery');
  assert.equal(next.situation.attackable, true);
  assert.equal(next.situation.affordances.attack, true);
  assert.ok(surfaceClearance(next.situation.contact) > .05);
  assert.equal(next.situation.contactSelection.evidence.chosen.audit.legal, true);
  assert.equal(next.situation.contactSelection.evidence.chosen.audit.routeValid, true);
  assert.equal(next.situation.contactSelection.evidence.chosen.audit.feetValid, true);
  assert.ok(next.situation.contactSelection.outgoingSafety.supportedReplyIds.includes('drive'));
  assert.equal(decision.resolution.choiceAttempts.filter(attempt => attempt.executionDraws).length, 1);
  assert.equal(result.document.generation.policyVersion, 'rally-policy-v3');
  // Having a supported attack does not require choosing one or winning.
  if (row.name === 'pro-1002-14') assert.equal(next.situation.contactKind, 'groundstroke');
});

test('dink-only mapping leaves other quality inputs and drop/reset perturbations independent of future opportunities', () => {
  for (const family of ['dink', 'drop', 'reset']) for (const quality of ['neutral', 'low', 'excellent', 'attackable', 'error']) {
    const source = { contact: { x: 7, y: 14.25, heightFeet: 1.8 }, target: { x: 11, y: 27 }, family,
      team: 'green', pace: 'soft', physics: { launchVerticalFeetPerSecond: 12 },
      execution: { quality, errorReason: quality === 'error' ? 'wide' : null }, draws: { lateral: .25, depth: .75 } };
    const before = JSON.stringify(source), applied = applyExecutionV1(source);
    assert.equal(JSON.stringify(source), before);
    assert.equal(applied.quality, quality);
    if (family === 'dink' && quality === 'attackable') {
      assert.equal(applied.physicalTransformation.dinkPopup.receiverOpportunity.status, 'unestablished');
      assert.equal(applied.preferredFlight.apexFeet, 6.4);
    } else assert.equal(applied.physicalTransformation.dinkPopup, undefined);
    if (family !== 'dink' && quality === 'attackable') {
      assert.equal(applied.target.y, 44 - (15.2 + 1.2 * .75));
      assert.deepEqual(applied.preferredFlight, { clearanceFeet: family === 'drop' ? 1.6 : 1.2 });
    }
    const delivered = resolveDeliveredFlightV1({ candidate: { family, intent: family },
      contact: source.contact, team: source.team, execution: source.execution, applied });
    assert.ok(delivered.guidance.plannerDiagnostics.solverCalls <= 6);
    assert.equal(delivered.applied.quality, quality);
  }
});
