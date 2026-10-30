import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGenerationPlanningSessionV2, commitGenerationRecipeV2, observeGenerationPlanningSessionV2, probeGenerationIncomingV2 } from '../play-planning-v2.js';
import { model2Document, model2Shot } from './fixtures/model2/factories.mjs';
import { listIntentCandidatesV1, chooseIntentV1 } from '../rally-policy.js';
import { probeSignatureCandidatesV1 } from '../rally-signatures.js';
import { contactOpportunityPreferenceV1, rankContactOpportunitiesV1 } from '../rally-contact-selection.js';
import { compileDocument } from '../play-compiler.js';
import { validateDocument } from '../play-document.js';
import { validateRallyRules } from '../rally-rules.js';
import { resolveStyle } from '../rally-styles.js';

// Exercise private production contact discovery and auditing without exposing
// mutable planning sessions or a fixture-only entry point in the public API.
const engineURL = new URL('../rally-engine.js', import.meta.url);
const source = (await readFile(engineURL, 'utf8')).replace(/from '(\.\/[^']+)'/g,
  (_, path) => `from '${new URL(path, engineURL).href}'`);
const { contactReplySupportV1, checkNominalReply, situationFor } = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport { contactReplySupportV1, checkNominalReply, situationFor };').toString('base64')}`);

function feed(intent, far, right) {
  const mirror = p => ({ x: right ? 20 - p.x : p.x, y: far ? 44 - p.y : p.y });
  const map = id => far ? ({ player1: 'player3', player2: 'player4', player3: 'player1', player4: 'player2' })[id] : id;
  const hitter = map('player3');
  const initialLayout = Object.fromEntries(Object.entries({
    player1: { x: .5, y: 14.25 }, player2: { x: 15, y: 14.25 },
    player3: intent === 'erne' ? { x: 2, y: 32 } : { x: 7, y: 30 }, player4: { x: 15, y: 29.75 }
  }).map(([id, p]) => [map(id), mirror(p)]));
  initialLayout.ball = { ...initialLayout[hitter] };
  const first = model2Shot({ id: 'wide-feed', hitter, family: 'dink', intent: 'cross-court-dink',
    target: mirror(intent === 'erne' ? { x: -1.5, y: 17 } : { x: .1, y: 20 }), physics: { apexFeet: 6 },
    contactEvidence: { feet: [{ x: initialLayout[hitter].x - .42, y: initialLayout[hitter].y },
      { x: initialLayout[hitter].x + .42, y: initialLayout[hitter].y }], feetEstablishedOutsideNVZ: true } });
  const document = model2Document({ initialLayout, shots: [first], ending: 'winner' });
  const state = createGenerationPlanningSessionV2(document);
  const trial = commitGenerationRecipeV2(state, first);
  assert.equal(trial.ok, true, trial.reason);

  return { state, document, input: { players: Object.fromEntries(Object.entries(document.players).map(([id, p]) => [id, { ...p, style: 'pro' }])),
    layout: initialLayout, service: { ...document.service, opening: 'midrally' }, options: { signatureShots: true } } };
}

for (const intent of ['erne', 'around-the-post']) for (const far of [false, true]) for (const right of [false, true]) {
  test(`${intent} ${far ? 'far' : 'near'} ${right ? 'right' : 'left'} survives discovery, nominal safety, opportunity and policy selection`, async () => {
    const { input, state, document } = feed(intent, far, right);
    const view = observeGenerationPlanningSessionV2(state);
    const receiver = far ? 'player3' : 'player1';
    const footState = Object.fromEntries(Object.entries(input.players).map(([id]) => [id, {
      feet: [{ x: input.layout[id].x - .42, y: input.layout[id].y }, { x: input.layout[id].x + .42, y: input.layout[id].y }],
      grounded: true, feetEstablishedOutsideNVZ: true
    }]));
    const discovery = probeSignatureCandidatesV1({ incomingFlight: view.solved[0], pendingSegment: view.pendingSegment,
      pendingRecipe: view.pendingRecipe, players: input.players, positions: view.pendingSegment.previous.positions,
      footState, opening: 'midrally', contactIndex: 1, eligibleIds: [receiver] });
    const signature = discovery.candidates.find(candidate => candidate.intent === intent);
    assert.ok(signature, JSON.stringify(discovery));
    const pair = { id: signature.playerId, kind: signature.kind, contactStyle: signature.contactStyle,
      contact: signature.contact, time: signature.time, feet: signature.feet, availableSeconds: signature.time,
      signature, pendingRecipe: signature.pendingRecipe };
    const incoming = probeGenerationIncomingV2(state, signature.recipe, { pendingRecipe: signature.pendingRecipe });
    assert.equal(incoming.ok, true, incoming.reason);
    assert.equal(incoming.movement.valid, true);
    assert.equal(incoming.spacing.valid, true);
    Object.assign(pair, { incomingProbe: incoming.handle, positions: incoming.positions, footState: incoming.footState,
      sampleTimeSeconds: incoming.sampleTimeSeconds, contactTimeSeconds: incoming.sampleTimeSeconds });
    const support = contactReplySupportV1(input, pair);
    assert.match(signature.recipe.id, /^signature-/);
    const reply = support.probes.find(reply => reply.id === intent);
    assert.ok(reply, JSON.stringify(support.ids));
    const safety = checkNominalReply(input, state, 1, pair, reply, { record: true });
    assert.equal(safety.clear, true);
    assert.ok(support.ids.every(id => !id.startsWith('signature-')));
    const supported = support.probes.filter(probe => {
      try { return checkNominalReply(input, state, 1, pair, probe).clear; }
      catch (error) { if (!(error instanceof TypeError || error instanceof RangeError)) throw error; return false; }
    });
    const supportedIds = supported.map(probe => probe.id);
    pair.replySupport = { ...support, ids: supportedIds, probes: supported };
    pair.outgoingSafety = { supportedReplyIds: supportedIds, checkedActors: safety.checkedActors };
    const opportunity = { opportunityId: 'controlled-signature', actorId: pair.id, sourceIndex: 0,
      kind: pair.kind, contact: pair.contact, availableSeconds: pair.time, stance: pair.feet.stance,
      recoveryPosition: pair.feet.stance, contactFeet: pair.feet.feet, feasibleReplyIds: supportedIds, attackingReplyAvailable: false,
      audit: { legal: true, routeValid: true, feetValid: pair.feet.reachable && pair.feet.legalVolleyFeet,
        peakFeetPerSecond: incoming.movement.maxPeakFeetPerSecond, minimumSpacingFeet: incoming.spacing.minimumSeparationFeet } };
    const preferenceInput = { ...opportunity, origin: input.layout[pair.id], team: input.players[pair.id].team };
    contactOpportunityPreferenceV1(preferenceInput);
    assert.throws(() => contactOpportunityPreferenceV1({ ...preferenceInput, feasibleReplyIds: [signature.recipe.id] }),
      /bounded known paddle-contact candidate IDs/, 'saved shot identity remains invalid reply support');
    const selection = rankContactOpportunitiesV1({ players: input.players, positions: input.layout, eligible: [receiver], candidates: [opportunity] });
    assert.equal(selection.chosen.actorId, pair.id);
    pair.selectionEvidence = selection;
    // The controlled feed starts midrally. Use the engine's post-opening
    // policy index so designated serve-return identity cannot mask the feed.
    const situation = situationFor(input, state, 3, pair, []);
    const policy = listIntentCandidatesV1(situation, { profile: resolveStyle('pro'), availableCandidateIds: pair.replySupport.ids });
    const selectedIndex = policy.candidates.findIndex(candidate => candidate.id === intent);
    assert.ok(selectedIndex >= 0, JSON.stringify(policy));
    const draw = policy.candidates.slice(0, selectedIndex).reduce((sum, candidate) => sum + candidate.probability, 0)
      + policy.candidates[selectedIndex].probability / 2;
    const chosen = chooseIntentV1(policy.candidates, draw);
    assert.equal(chosen.intent, intent);
    const selectedRecipe = { ...structuredClone(signature.recipe), id: 'selected-signature', intent: chosen.intent };
    const committed = commitGenerationRecipeV2(state, selectedRecipe, { pendingRecipe: signature.pendingRecipe, incoming: pair.incomingProbe });
    assert.equal(committed.committed, true, JSON.stringify(committed));
    const completed = { ...document, ending: 'stop', shots: [signature.pendingRecipe, selectedRecipe] };
    validateDocument(completed);
    const compiled = compileDocument(completed);
    assert.equal(compiled.validShotCount, 2, JSON.stringify(compiled.findings));
    assert.deepEqual(compiled.findings.filter(finding => finding.severity === 'error'), []);
    assert.deepEqual(validateRallyRules(compiled.play, compiled.timeline).violations, []);
  });
}
