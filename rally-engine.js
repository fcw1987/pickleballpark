// Headless versioned policy. Planning uses the same contact, actor and flight
// construction as compilation; the driver independently validates final source.
import { createEngineDriverV1 } from './rally-engine-driver.js';
import { createGenerationRecipeV1, RALLY_ENGINE_VERSION, RALLY_PLAYER_IDS } from './rally-recipe.js';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2, inspectPendingLegV2, finishPlanningV2, replacePendingMovementV2 } from './play-planning-v2.js';
import { solveFlightV2, interceptFlightV2, localNetHeightFeet, sampleFlightVelocityV2, flightReachCriticalTimesV2, PHYSICS_V2 } from './play-physics-v2.js';
import { sampleActorBoardPositionV2 } from './play-actors-v2.js';
import { eligibleHitters, contactRequiresBounce, resolveServiceContext, teamForPlayer } from './rally-state.js';
import { REACH_MODEL } from './rally-tactics.js';
import { createSituationV1, rankContactPairsV1, rankContactCandidatesV2, listIntentCandidatesV1, chooseIntentV1 } from './rally-policy.js';
import { resolveStyle } from './rally-styles.js';
import { rankContactOpportunitiesV1, contactOpportunityPreferenceV1, compareContactOpportunityPreferencesV1 } from './rally-contact-selection.js';
import { resolveTargetV1, resolveFlightParametersV1 } from './rally-targets.js';
import { assessPressureV1, sampleExecutionV1, applyExecutionV1, classifyOutcomeV1 } from './rally-quality.js';
import { contactFeetV1, planMovementV1, replanMovementV1, sampleFeetStateV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1, GROUNDED_CONTACT_HEIGHT_FEET } from './rally-movement.js';
import { narrateShotV1, summarizePointV1, excitementScoreV1 } from './rally-narration.js';
import { probeSignatureCandidatesV1 } from './rally-signatures.js';
import { automaticOwnership } from './rally-proposals.js';
import { isInNonVolleyZone } from './court-geometry.js';
import { STROKE_PROFILES } from './three-d-core.js';

export { RALLY_ENGINE_VERSION } from './rally-recipe.js';
export const RALLY_ENGINE_LIMITS = Object.freeze({ maxShots: 99, targetsPerIntent: 8, maxContactPairs: 4, groundedContactHeightFeet: GROUNDED_CONTACT_HEIGHT_FEET });
const IDS = RALLY_PLAYER_IDS;
const clone = value => structuredClone(value);
const xy = value => ({ x: value.x, y: value.y });
const hold = () => ({ intent: 'hold', pinned: false });
const manual = target => ({ intent: 'manual', target: xy(target), pinned: false });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// One request-local tail, never SavedDocument fields or finalized-prefix goals.
const pendingMovementPlans = new WeakMap();
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const identity = value => { let n = 2166136261; for (const char of canonical(value)) n = Math.imul(n ^ char.charCodeAt(0), 16777619); return (n >>> 0).toString(16); };
const owned = ['family', 'hitter', 'receiver', 'contactStyle', 'target', 'arc', 'pace', 'movement', 'playerMovement', 'serveMethod', 'intent', 'quality', 'narration', 'contactMode', 'contactTiming', 'physics', 'contactEvidence'];
// Generated source/physical evidence has versioned nanofeet/seconds precision;
// solver samples retain full precision. Integer seeds and exact unit RNG draws
// are not rounded. This removes engine-specific libm tail bits from recipes.
const numberV1 = value => Number.isInteger(value) ? value : Math.round(value * 1e9) / 1e9;
const generatedV1 = value => typeof value === 'number' ? numberV1(value) : Array.isArray(value) ? value.map(generatedV1)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, generatedV1(item)])) : value;

function headerFor(input, attemptIndex, attemptSeed) {
    return { schemaVersion: 1, modelVersion: 2, physicsVersion: 'play-physics-v2',
        id: `rally-engine-${identity(input)}-${attemptSeed}`, title: `Generated rally · seed ${input.seed}`,
        players: Object.fromEntries(IDS.map(id => [id, { team: input.players[id].team, handedness: input.players[id].handedness }])),
        initialLayout: clone(input.layout), service: clone(input.service), shots: [], annotations: [],
        assistance: { autoShading: false, showGuides: false, team: 'green' }, opening: 'serve', ending: 'winner', intentionalFault: false,
        generation: createGenerationRecipeV1(input, { attempts: attemptIndex + 1, selectedAttempt: attemptIndex, selectedSeed: attemptSeed }) };
}

function fixedFeet(input, id, contact, kind, position, contactStyle = 'forehand') {
    const team = input.players[id].team;
    return contactFeetV1({ contact, target: { x: 10, y: team === 'green' ? 36 : 8 }, team,
        handedness: input.players[id].handedness, contactStyle, kind, position });
}

function baseRecipe(id, index, pair, target, family = index === 0 ? 'serve' : index === 1 ? 'return' : 'dink') {
    return { id, family, hitter: pair.id, receiver: 'auto', contactStyle: pair.contactStyle ?? 'forehand', target: xy(target), arc: 'medium', pace: 'soft',
        movement: hold(), quality: 'neutral',
        ...(index === 0 ? { serveMethod: 'volley' } : { contactMode: pair.kind === 'volley' ? 'volley' : 'bounced',
            contactTiming: pair.kind === 'volley' ? { beforeBounceSeconds: pair.beforeBounceSeconds } : { afterBounceSeconds: pair.delay } }),
        contactEvidence: { feet: clone(pair.feet.feet), feetEstablishedOutsideNVZ: pair.feet.feetEstablishedOutsideNVZ } };
}

// The previous leg is the only mutable tail. Its new hitter ends at explicit
// contact feet; all four destinations use the original tactical goals.
function repairPendingMovement(input, state, pair, durationSeconds = state.pendingSegment?.contactTime + pair?.time) {
    if (!state.pendingRecipe) return undefined;
    const recipe = clone(state.pendingRecipe);
    const movement = replanMovementV1({ plan: pendingMovementPlans.get(state), segment: state.pendingSegment,
        players: input.players, durationSeconds, ...(pair ? { arrival: { id: pair.id, stance: pair.feet.stance } } : {}), peakFeetPerSecond: 17.95 });
    if (!movement.ok) return null;
    recipe.movement = generatedV1(movement.movement);
    recipe.playerMovement = generatedV1(movement.playerMovement);
    // Explicit incoming timing chooses the ball contact. Movement retains the
    // selected grounded stance, independently of the ball over the NVZ.
    if (pair) recipe.playerMovement[pair.id] = manual(pair.feet.stance);
    return recipe;
}

function routeValid(segment) {
    return !segment || inspectGeneratedMovementV1(segment).valid && inspectGeneratedSpacingV1(segment).valid;
}

// Small shared-solver reply probes establish opportunity support before an
// outgoing policy choice. These are physical possibilities, not future intent,
// execution quality, movement destinations or outcome evidence.
function contactReplySupportV1(input, pair) {
    const team = input.players[pair.id].team, ids = [], probes = [
        { id: 'drive', family: 'drive', pace: 'firm', target: { x: 10, y: team === 'green' ? 41 : 3 } },
        { id: 'reset', family: 'reset', pace: 'soft', target: { x: 10, y: team === 'green' ? 27 : 17 } }
    ];
    if (pair.contact.heightFeet >= 7) probes.push({ id: 'overhead', family: 'overhead', pace: 'firm', target: { x: 10, y: team === 'green' ? 31 : 13 } });
    let drive = false, attacking = false;
    for (const probe of probes) try {
        const result = resolveFlightParametersV1({ candidate: { family: probe.family, pace: probe.pace, arc: 'medium', intent: probe.id },
            contact: pair.contact, target: probe.target, team });
        ids.push(probe.id);
        if (probe.id === 'drive') drive = result.attacking;
        if (result.attacking || probe.id === 'overhead' && result.flight.launchSpeedMph >= 22) attacking = true;
    } catch (error) { if (!(error instanceof TypeError || error instanceof RangeError)) throw error; }
    if (!ids.length) try {
        resolveFlightParametersV1({ candidate: { family: 'lob', pace: 'medium', arc: 'high', intent: 'lob' },
            contact: pair.contact, target: { x: 10, y: team === 'green' ? 40 : 4 }, team }); ids.push('lob');
    } catch (error) { if (!(error instanceof TypeError || error instanceof RangeError)) throw error; }
    if (pair.signature) ids.push(pair.signature.intent);
    return { ids: [...new Set(ids)], drive,
        attacking: attacking && pair.contact.heightFeet - PHYSICS_V2.ballRadiusFeet > localNetHeightFeet(pair.contact.x) };
}

async function* contactPairs(input, state, index, checkpoint, diagnostics) {
    if (index === 0) {
        const id = input.service.server, contact = { ...input.layout.ball, heightFeet: 2.2 };
        const feet = fixedFeet(input, id, contact, 'serve', input.layout[id]);
        yield { id, kind: 'serve', contact, time: 0, feet, positions: input.layout,
            footState: Object.fromEntries(IDS.map(actor => [actor, { feet: [{ x: input.layout[actor].x - .42, y: input.layout[actor].y }, { x: input.layout[actor].x + .42, y: input.layout[actor].y }], grounded: true, feetEstablishedOutsideNVZ: !isInNonVolleyZone(input.layout[actor]) }])), availableSeconds: STROKE_PROFILES.serve.duration * STROKE_PROFILES.serve.contactRatio,
            sampleTimeSeconds: 0, contactTimeSeconds: STROKE_PROFILES.serve.duration * STROKE_PROFILES.serve.contactRatio };
        return;
    }
    const incoming = state.solved.at(-1), previous = state.pendingRecipe;
    if (incoming.obstruction) return;
    const service = resolveServiceContext(state.play), eligible = eligibleHitters({ players: input.players, service, contactIndex: index, previousHitter: previous.hitter });
    const origins = state.pendingSegment.previous.positions, endpoints = state.steps.at(-1).positions, pairs = [];
    for (const id of eligible) {
        const team = input.players[id].team;
        const post = incoming.stages.find(stage => stage.phase === 'post-bounce');
        const desired = team === 'green' ? 15.1 : 28.9;
        const lineDelay = post && Math.abs(post.vz) > 1e-8 ? (desired - incoming.landing.y) / post.vz : NaN;
        const delays = [...new Set([lineDelay, .08, .16, .28, .42, .6].filter(t => t >= .025 && t <= .75).map(t => Math.round(t * 1e6) / 1e6))];
        const options = delays.map(delay => ({ kind: 'groundstroke', delay }));
        const forward = team === 'green' ? 1 : -1;
        if (!contactRequiresBounce(index)) for (const depth of [...new Set([endpoints[id].y, origins[id].y,
            endpoints[id].y + forward * 2.5, origins[id].y + forward * 2.5,
            team === 'green' ? 14.25 : 29.75, team === 'green' ? 16.75 : 27.25,
            team === 'green' ? 17.2 : 26.8])]) options.push({ kind: 'volley', depth });
        if (!contactRequiresBounce(index)) for (const fraction of [.7, .85, .97, .99, .996]) {
            options.push({ kind: 'volley', depth: incoming.sampleBoard(incoming.firstLandingTime * fraction).y });
        }
        // Closed-form reach minima and interval interiors catch narrow windows
        // that a fixed plane/fraction grid can miss. These are proposals only;
        // the ordinary interceptor, feet and actual-route checks still apply.
        for (const time of flightReachCriticalTimesV2(incoming, origins[id], REACH_MODEL)) {
            if (time > incoming.firstLandingTime + .001 && time < incoming.secondBounceTime - 1e-8) {
                const delay = numberV1(time - incoming.firstLandingTime);
                if (delay <= 1.5) options.push({ kind: 'groundstroke', delay });
            } else if (!contactRequiresBounce(index) && time > 1e-8 && time < incoming.firstLandingTime - .001) {
                options.push({ kind: 'volley', depth: incoming.sampleBoard(time).y });
            }
        }
        // A grounded paddle cannot intercept a lob at its 18-foot apex. Search
        // the actual incoming solution's descending branch for the supported
        // overhead ceiling, then let the same interceptor and route audit
        // decide whether that contact is available to this player.
        if (!contactRequiresBounce(index) && incoming.metadata.apexFeet > RALLY_ENGINE_LIMITS.groundedContactHeightFeet) {
            let low = Math.max(0, incoming.stages[0].vy / PHYSICS_V2.gravityFeetPerSecond2), high = incoming.firstLandingTime;
            for (let step = 0; step < 32; step++) {
                const middle = (low + high) / 2;
                if (incoming.sampleBoard(middle).heightFeet > RALLY_ENGINE_LIMITS.groundedContactHeightFeet - 1e-6) low = middle; else high = middle;
            }
            options.push({ kind: 'volley', depth: incoming.sampleBoard(high).y });
        }
        for (const option of options) {
            await checkpoint({ shots: index, workDelta: 1 });
            try {
                const beforeBounceSeconds = option.kind === 'volley' ? numberV1(incoming.firstLandingTime - (option.depth - incoming.from.y) / incoming.stages[0].vz) : undefined;
                const incomingContact = interceptFlightV2(incoming, { kind: option.kind, stance: { ...endpoints[id], y: option.depth ?? endpoints[id].y }, afterBounceSeconds: option.delay, beforeBounceSeconds });
                const contact = generatedV1(incomingContact.point);
                if (contact.heightFeet > RALLY_ENGINE_LIMITS.groundedContactHeightFeet) continue;
                const forehandDirection = (team === 'green' ? -1 : 1) * (input.players[id].handedness === 'left' ? -1 : 1);
                const contactStyle = (contact.x - origins[id].x) * forehandDirection >= 0 ? 'forehand' : 'backhand';
                const feet = generatedV1(fixedFeet(input, id, contact, option.kind, origins[id], contactStyle));
                if (!feet.reachable || !feet.legalVolleyFeet) continue;
                const pair = { id, kind: option.kind, contactStyle, delay: option.delay, beforeBounceSeconds, contact, time: incomingContact.time, feet, availableSeconds: incomingContact.time };
                pairs.push(pair);
            } catch (error) {
                diagnostics.excludedContacts++;
                diagnostics.contactExclusions.push({ actor: id, kind: option.kind, delay: option.delay ?? null, depth: option.depth ?? null, reason: error.message });
                if (diagnostics.contactExclusions.length > 8) diagnostics.contactExclusions.shift();
            }
        }
    }
    // A point/time is one opportunity for the whole eligible team, even when
    // one actor's reach minimum or current depth proposed it first.
    const opportunities = new Map(pairs.map(pair => [[pair.kind, numberV1(pair.time), pair.contact.x, pair.contact.y, pair.contact.heightFeet].join(':'), pair]));
    const represented = new Set(pairs.map(pair => [pair.id, pair.kind, numberV1(pair.time), pair.contact.x, pair.contact.y, pair.contact.heightFeet].join(':')));
    for (const pair of opportunities.values()) for (const id of eligible) {
        const key = [id, pair.kind, numberV1(pair.time), pair.contact.x, pair.contact.y, pair.contact.heightFeet].join(':');
        if (represented.has(key)) continue;
        const team = input.players[id].team;
        const direction = (team === 'green' ? -1 : 1) * (input.players[id].handedness === 'left' ? -1 : 1);
        const contactStyle = (pair.contact.x - origins[id].x) * direction >= 0 ? 'forehand' : 'backhand';
        const feet = generatedV1(fixedFeet(input, id, pair.contact, pair.kind, origins[id], contactStyle));
        if (!feet.reachable || !feet.legalVolleyFeet) continue;
        represented.add(key);
        pairs.push({ id, kind: pair.kind, contactStyle, delay: pair.delay, beforeBounceSeconds: pair.beforeBounceSeconds,
            contact: pair.contact, time: pair.time, feet, availableSeconds: pair.availableSeconds });
    }
    if (input.options.signatureShots) {
        await checkpoint({ shots: index, workDelta: 1 });
        const signatures = probeSignatureCandidatesV1({ incomingFlight: incoming, pendingSegment: state.pendingSegment,
            pendingRecipe: previous, players: input.players, positions: origins,
            footState: sampleFeetStateV1(state.pendingSegment, 0), service, contactIndex: index, eligibleIds: eligible });
        await checkpoint({ shots: index, workDelta: signatures.work.contactTrials + signatures.work.launchTrials + signatures.work.routeTrials });
        for (const candidate of signatures.candidates) pairs.push({ id: candidate.playerId, kind: candidate.kind,
            contactStyle: candidate.contactStyle, delay: candidate.recipe.contactTiming?.afterBounceSeconds,
            beforeBounceSeconds: candidate.kind === 'volley' ? numberV1(incoming.firstLandingTime - candidate.time) : undefined,
            contact: generatedV1(candidate.contact), time: candidate.time, feet: generatedV1(candidate.feet),
            availableSeconds: candidate.time, signature: candidate });
    }
    // Proposal order is an optimistic search bound, never a physical audit.
    // At a fixed incoming point/time actors are tried in reach/lane/hand order.
    // Only audited opportunities can be returned.
    const cheap = rankContactPairsV1({ pairs, eligible, positions: origins, players: input.players });
    const reachable = new Set(cheap.filter(row => row.reach.reachable).map(row => row.pairIndex));
    const groups = new Map(), replyCache = new Map();
    for (const [sourceIndex, pair] of pairs.entries()) {
        if (!reachable.has(sourceIndex)) continue;
        const key = [pair.kind, numberV1(pair.time), pair.contact.x, pair.contact.y, pair.contact.heightFeet].join(':');
        const supportKey = [pair.contact.x, pair.contact.y, pair.contact.heightFeet].join(':');
        if (!replyCache.has(supportKey)) replyCache.set(supportKey, contactReplySupportV1(input, pair));
        pair.replySupport = replyCache.get(supportKey);
        if (!pair.replySupport.ids.length) continue;
        const preference = contactOpportunityPreferenceV1({ contact: pair.contact, stance: pair.feet.stance,
            origin: origins[pair.id], team: input.players[pair.id].team, feasibleReplyIds: pair.replySupport.ids,
            attackingReplyAvailable: pair.replySupport.attacking, availableSeconds: numberV1(pair.time) });
        const proposal = { opportunityId: key, preference, sourceIndex };
        const group = groups.get(key) ?? { opportunityId: key, proposals: [] };
        if (!group.proposals.some(item => pairs[item.sourceIndex].id === pair.id)) group.proposals.push(proposal);
        groups.set(key, group);
    }
    const proposals = [...groups.values()].map(group => ({ ...group,
        preference: [...group.proposals].sort(compareContactOpportunityPreferencesV1)[0].preference
    })).sort(compareContactOpportunityPreferencesV1);
    let cursor = 0, emitted = 0, facts = [];
    while (cursor < proposals.length || facts.length) {
        const accepted = rankContactOpportunitiesV1({ players: input.players, positions: origins, eligible, candidates: facts });
        const next = proposals[cursor];
        // A group's best proposal is an upper bound: route rejection can only
        // remove actors, not improve this bound. Stop when no remaining group
        // can beat the best physically accepted opportunity.
        if (accepted.chosen && (!next || compareContactOpportunityPreferencesV1(accepted.chosen, next) <= 0)) {
            const selected = accepted.chosen, pair = pairs[selected.sourceIndex];
            const evidence = { version: accepted.version, strategy: accepted.strategy, chosen: selected,
                alternatives: accepted.ranked.slice(1, 5), comparisons: accepted.comparisons.slice(0, 8),
                excluded: accepted.excluded.slice(0, 8), totalOpportunities: proposals.length,
                remainingProposals: proposals.slice(cursor, cursor + 4).map(group => ({ opportunityId: group.opportunityId,
                    preference: group.preference, auditStatus: 'not-inspected',
                    reason: 'The selected feasible preference meets or exceeds this optimistic proposal bound.' })) };
            yield { ...pair, selectionStrategy: accepted.strategy, selectionEvidence: evidence };
            emitted++;
            if (emitted >= RALLY_ENGINE_LIMITS.maxContactPairs) return;
            facts = facts.filter(row => row.opportunityId !== selected.opportunityId);
            continue;
        }
        if (!next) return;
        cursor++;
        const opportunity = pairs[next.proposals[0].sourceIndex];
        const actorOrder = rankContactCandidatesV2({ players: input.players, positions: origins,
            eligible: next.proposals.map(item => pairs[item.sourceIndex].id), contact: opportunity.contact,
            availableSeconds: numberV1(opportunity.time) });
        for (const actor of actorOrder) {
            const proposal = next.proposals.find(item => pairs[item.sourceIndex].id === actor.id);
            await checkpoint({ shots: index, workDelta: 1 });
            const pair = pairs[proposal.sourceIndex], team = input.players[pair.id].team;
            const pendingRecipe = repairPendingMovement(input, state, pair);
            if (!pendingRecipe) { diagnostics.excludedContacts++; continue; }
            const probe = baseRecipe('shot-' + (index + 1), index, pair, { x: 10, y: team === 'green' ? 30 : 14 });
            const trial = trialRecipeV2(state, probe, { pendingRecipe, capturePreviousInspection: true });
            const movement = trial.resolvedPrevious ? inspectGeneratedMovementV1(trial.resolvedPrevious) : null;
            const spacing = trial.resolvedPrevious ? inspectGeneratedSpacingV1(trial.resolvedPrevious) : null;
            const valid = trial.ok && movement?.valid && spacing?.valid;
            facts.push({ opportunityId: next.opportunityId, actorId: pair.id, sourceIndex: proposal.sourceIndex,
                kind: pair.kind, contact: pair.contact, availableSeconds: numberV1(pair.time),
                stance: pair.feet.stance, recoveryPosition: pair.feet.stance,
                feasibleReplyIds: pair.replySupport.ids, attackingReplyAvailable: pair.replySupport.attacking,
                audit: { legal: trial.ok, routeValid: !!valid, feetValid: pair.feet.reachable && pair.feet.legalVolleyFeet,
                    peakFeetPerSecond: movement?.maxPeakFeetPerSecond ?? null, minimumSpacingFeet: spacing?.minimumSeparationFeet ?? null } });
            if (!valid) {
                diagnostics.excludedContacts++;
                diagnostics.contactExclusions.push({ actor: pair.id, kind: pair.kind, delay: pair.delay ?? null,
                    reason: trial.reason || 'actual-route-bound', contact: pair.contact, stance: pair.feet.stance, movement });
                if (diagnostics.contactExclusions.length > 8) diagnostics.contactExclusions.shift();
                continue;
            }
            pair.pendingRecipe = pendingRecipe;
            pair.probeTrial = trial;
            pair.positions = generatedV1(Object.fromEntries(IDS.map(actor => [actor, sampleActorBoardPositionV2(trial.resolvedPrevious, actor, trial.resolvedPrevious.duration)])));
            pair.footState = generatedV1(sampleFeetStateV1(trial.resolvedPrevious, trial.resolvedPrevious.duration));
            pair.sampleTimeSeconds = numberV1(trial.resolvedPrevious.endTime);
            pair.contactTimeSeconds = pair.sampleTimeSeconds;
            // The best-ranked actor passed every physical check at this fixed
            // opportunity. A lower-ranked actor cannot replace that choice;
            // its unused route needs no speculative collision sweep.
            break;
        }
    }
}

function situationFor(input, state, index, pair, decisions) {
    const previous = state.pendingRecipe;
    const support = pair.replySupport ?? contactReplySupportV1(input, pair);
    const attacking = support.drive;
    const incoming = previous ? { family: previous.family, intent: previous.intent, pace: previous.pace, hitter: previous.hitter, contactKind: pair.kind } : {};
    const feet = Object.fromEntries(IDS.map(id => [id, pair.footState[id]?.feet ?? []]));
    feet[pair.id] = pair.feet.feet;
    const snapshot = createSituationV1({ players: input.players, positions: pair.positions, feet, footState: pair.footState,
        hitter: pair.id, contact: { ...pair.contact, kind: pair.kind }, contactIndex: index, service: input.service, incoming,
        priorDecisions: decisions, affordances: { drive: attacking,
            attack: support.attacking,
            overhead: support.ids.includes('overhead'), volley: pair.kind === 'volley', bounced: pair.kind !== 'volley', lob: true,
            erne: pair.signature?.intent === 'erne', aroundPost: pair.signature?.intent === 'around-the-post', letGo: false } });
    const origin = state.pendingSegment?.previous.positions[pair.id] ?? input.layout[pair.id];
    return { ...snapshot, sampleTimeSeconds: pair.sampleTimeSeconds, contactTimeSeconds: pair.contactTimeSeconds,
        contactSelection: { version: 'rally-contact-selection-v1', strategy: pair.selectionStrategy ?? 'initial-serve',
            evidence: pair.selectionEvidence ? generatedV1(pair.selectionEvidence) : null },
        service: clone(input.service), pressure: generatedV1(assessPressureV1({ contact: pair.contact, position: origin,
        availableSeconds: pair.availableSeconds, incomingFlight: state.solved.at(-1),
        incomingContactVelocity: index > 0 ? sampleFlightVelocityV2(state.solved.at(-1), pair.time) : undefined, incomingIntent: previous?.intent, selfPaced: index === 0,
        ownFormation: snapshot.ownFormation, opponentFormation: snapshot.opponentFormation,
        movementSpeedFeetPerSecond: pair.time > 0 ? distance(origin, pair.feet.stance) / pair.time : 0 })) };
}

function addMovement(input, state, index, pair, recipe, flight) {
    if (index === 0) return { recipe: { ...recipe, movement: hold(), playerMovement: Object.fromEntries(IDS.filter(id => id !== recipe.hitter).map(id => [id, hold()])) },
        plan: { diagnostics: { goals: Object.fromEntries(IDS.map(id => [id, xy(input.layout[id])])) } } };
    const movement = planMovementV1({ positions: pair.positions, players: input.players, hitter: pair.id, contact: pair.contact, target: recipe.target,
        durationSeconds: flight.firstLandingTime, contactTime: 0, index, service: input.service, intent: recipe.intent, family: recipe.family,
        incomingFamily: state.pendingRecipe?.family, kind: pair.kind, feetState: pair.footState, contactFeet: pair.feet,
        quality: recipe.quality, pace: recipe.pace, peakFeetPerSecond: 17.95 });
    if (!movement.ok) throw new RangeError(movement.reason);
    return { recipe: { ...recipe, movement: generatedV1(movement.movement), playerMovement: generatedV1(movement.playerMovement) }, plan: movement };
}

function candidateFlight(input, pair, candidate, situation, draws) {
    if (pair.signature?.intent === candidate.intent) {
        const target = clone(pair.signature.target), physics = clone(pair.signature.physics);
        return { target, parameters: { physics, flight: solveFlightV2({ from: pair.contact, target,
            family: candidate.family, pace: candidate.pace, arc: candidate.arc, quality: 'neutral', physics }) } };
    }
    const target = resolveTargetV1({ candidate, situation, players: input.players, draws });
    return { target, parameters: resolveFlightParametersV1({ candidate, contact: pair.contact, target,
        team: input.players[pair.id].team }) };
}

function finishAttempt(input, state, document, decisions, diagnostics, censored) {
    const ending = censored ? 'stop' : 'winner';
    let finished = finishPlanningV2(state, { ending });
    // The final tail has no next contact. Bound its source commands by the
    // actual dead event (or stop bounce), retaining shared terminal sampling.
    for (let repair = 0; state.pendingRecipe && repair < 8; repair++) {
        const segment = finished.rawSegments.at(-1), decision = finished.decision;
        const duration = censored ? segment.duration : Math.max(segment.contactTime,
            (decision?.physicalDeadTime ?? decision?.evidenceObservedTime ?? decision?.time ?? segment.endTime) - segment.startTime);
        const recipe = repairPendingMovement(input, state, null, duration);
        if (!recipe) throw new RangeError('The actual terminal movement is infeasible.');
        replacePendingMovementV2(state, recipe);
        const next = finishPlanningV2(state, { ending });
        const nextDecision = next.decision;
        const nextDead = nextDecision?.physicalDeadTime ?? nextDecision?.evidenceObservedTime ?? nextDecision?.time;
        const priorDead = decision?.physicalDeadTime ?? decision?.evidenceObservedTime ?? decision?.time;
        finished = next;
        if (censored || nextDead === priorDead) break;
        if (repair === 7) throw new RangeError('Terminal movement did not settle on a physical dead time.');
    }
    if (!routeValid(finished.rawSegments.at(-1))) throw new RangeError('The final sampled movement or spacing is infeasible.');
    const outcome = censored ? null : generatedV1(finished.derivedOutcome);
    if (!censored && !outcome) return { status: 'failed', document: null, outcome: null, decisions, stats: null,
        diagnostics: { ...diagnostics, code: 'no-physical-outcome' }, outcomeClassification: null };
    document.shots = clone(state.recipes);
    document.ending = censored ? 'stop' : finished.play.ending;
    if (outcome) document.outcome = clone(outcome); else delete document.outcome;
    const last = decisions.find(decision => decision.shotId === outcome?.shotId) ?? decisions.at(-1);
    if (last && ['long', 'wide'].includes(outcome?.reason)) {
        const shotIndex = decisions.indexOf(last), flight = state.solved[shotIndex];
        // Leaving a forecast out ball is a defensive decision on this incoming
        // solution. It adds no paddle event or synthetic opponent contact.
        last.resolution.defensiveDecision = { version: 'rally-defence-v1', action: 'let-go', addsContact: false,
            incomingShotId: last.shotId,
            eligibleActors: eligibleHitters({ players: input.players, service: input.service,
                contactIndex: shotIndex + 1, previousHitter: document.shots[shotIndex].hitter }),
            information: { availableAtSeconds: last.situation.contactTimeSeconds,
                predictedLanding: generatedV1(flight.landing), firstLandingAfterContactSeconds: numberV1(flight.firstLandingTime) },
            reason: 'The shared incoming solution lands outside the opponent court without an earlier decisive collision.' };
    }
    const classification = outcome ? classifyOutcomeV1({ outcome, pressure: last?.situation.pressure,
        pressureDecisionId: decisions[Math.max(0, decisions.indexOf(last) - 1)]?.id ?? null, execution: last?.execution,
        previousIntent: last?.situation.incomingIntent }) : null;
    let run = 0, longestDinkRun = 0;
    for (const decision of decisions) { run = decision.chosen.family === 'dink' ? run + 1 : 0; longestDinkRun = Math.max(longestDinkRun, run); }
    const stats = { shots: decisions.length, firstAllFourUpShot: decisions.find(d => d.situation.allFourUp)?.situation.contactIndex + 1 || null,
        longestDinkRun, handsExchanges: decisions.filter(d => d.situation.phase === 'hands').length,
        summary: outcome ? summarizePointV1({ outcome, classification, decisions, draw: decisions.at(-1)?.draws.narration ?? 0 }) : 'Stopped at the shot limit; no point winner is claimed.' };
    stats.excitement = excitementScoreV1({ shots: stats.shots, handsExchanges: stats.handsExchanges, paceChanges: decisions.filter((d, i) => i && d.resolution.pace !== decisions[i - 1].resolution.pace).length,
        signatureShots: decisions.filter(d => ['erne', 'around-the-post'].includes(d.chosen.intent)).length,
        retrievals: decisions.filter(d => d.situation.phase === 'scramble').length, pressureSwings: 0 });
    return { status: censored ? 'censored' : 'complete', document, outcome: outcome && clone(outcome), decisions, stats, diagnostics,
        outcomeClassification: classification };
}

export async function runNaturalAttemptV1(input, { attemptIndex, attemptSeed, random, checkpoint }) {
    const document = headerFor(input, attemptIndex, attemptSeed), state = createPlanningStateV2(document), decisions = [];
    const diagnostics = { code: 'planning', rejections: 0, targetRepairs: 0, excludedContacts: 0, contactExclusions: [], failures: [] };
    try {
    for (let index = 0; index < input.options.maxShots; index++) {
        let accepted = false, foundPair = false;
        for await (const pair of contactPairs(input, state, index, checkpoint, diagnostics)) {
            foundPair = true;
            const situation = situationFor(input, state, index, pair, decisions), player = input.players[pair.id], profile = resolveStyle(player.style, player.flavour);
            const sourceCandidates = listIntentCandidatesV1(situation, { profile, signatureShots: input.options.signatureShots });
            const feasible = [], excluded = [...sourceCandidates.excluded];
            for (const candidate of sourceCandidates.candidates) {
                if (!candidate.addsContact) continue;
                await checkpoint({ shots: index, workDelta: 1 });
                try {
                    const { parameters } = candidateFlight(input, pair, candidate, situation, { lateral: .5, depth: .5 });
                    if (parameters.flight.obstruction) throw new RangeError('No clear nominal flight.');
                    feasible.push(candidate);
                } catch (error) { excluded.push({ id: candidate.id, intent: candidate.intent, weight: candidate.weight, reason: error.message }); }
            }
            const total = feasible.reduce((sum, candidate) => sum + candidate.weight, 0);
            let remaining = feasible.map(candidate => ({ ...candidate, probability: candidate.weight / total }));
            const preCandidates = clone(remaining), preExcluded = clone(excluded), choiceAttempts = [];
            while (remaining.length) {
                const intentDraw = random.intent(), chosen = chooseIntentV1(remaining, intentDraw);
                const executionDraws = { quality: random.execution(), error: random.execution() };
                const execution = sampleExecutionV1({ profile, situation, choice: chosen, draws: executionDraws });
                const choiceAttempt = { candidateId: chosen.id, candidates: remaining.map(candidate => ({ id: candidate.id, probability: candidate.probability })), intentDraw, executionDraws, repairs: [] };
                choiceAttempts.push(choiceAttempt);
                for (let repair = 0; repair < RALLY_ENGINE_LIMITS.targetsPerIntent; repair++) {
                    let committed = false;
                    await checkpoint({ shots: index, workDelta: 1 });
                    const targetDraws = { lateral: random.target(), depth: random.target() };
                    const perturbationDraws = { lateral: random.target(), depth: random.target() };
                    const narrationDraw = random.narration();
                    try {
                        const { target, parameters } = candidateFlight(input, pair, chosen, situation, targetDraws);
                        const applied = applyExecutionV1({ execution, target, contact: pair.contact, team: player.team, physics: parameters.physics, family: chosen.family,
                            pace: chosen.pace, arc: chosen.arc, draws: perturbationDraws });
                        const flight = solveFlightV2({ from: pair.contact, target: applied.target, family: chosen.family, quality: execution.quality,
                            pace: applied.pace, arc: applied.arc, physics: applied.physics });
                        if (execution.quality !== 'error' && flight.obstruction) throw new RangeError('A non-error execution must cross a playable lane.');
                        let recipe = { ...baseRecipe(`shot-${index + 1}`, index, pair, applied.target, chosen.family), intent: chosen.intent,
                            quality: execution.quality, pace: applied.pace, arc: applied.arc, physics: applied.physics,
                            ...(index === 0 ? { receiver: input.service.receiver } : {}),
                            narration: narrateShotV1({ intent: chosen.intent, situation, draw: narrationDraw }),
                            generation: { seed: attemptSeed, generatorVersion: RALLY_ENGINE_VERSION }, authoring: automaticOwnership(owned) };
                        const movement = addMovement(input, state, index, pair, recipe, flight);
                        recipe = movement.recipe;
                        if (pair.signature?.intent === chosen.intent) {
                            recipe.contactOverride = xy(pair.contact);
                            if (pair.kind === 'volley') delete recipe.contactTiming;
                        }
                        recipe = generatedV1(recipe);
                        recipe.authoring = automaticOwnership([...owned, 'contactOverride'].filter(field => Object.hasOwn(recipe, field)));
                        const trial = trialRecipeV2(state, recipe, { pendingRecipe: pair.pendingRecipe, reusePreviousTrial: pair.probeTrial });
                        // Verified reuse proves the previous leg has exactly the
                        // geometry already audited for this opportunity. An
                        // altered tail still receives the full route checks.
                        if (!trial.ok || !trial.previousInspectionReused && !routeValid(trial.resolvedPrevious)) throw new RangeError(trial.reason || 'The actual resolved movement or spacing is infeasible.');
                        commitPlanningTrialV2(state, trial);
                        pendingMovementPlans.set(state, movement.plan);
                        committed = true;
                        decisions.push({ id: `decision-${index + 1}`, shotId: recipe.id, situation, candidates: preCandidates, excluded: preExcluded,
                            policyContext: { context: sourceCandidates.context, ...(sourceCandidates.conditioning ? { conditioning: clone(sourceCandidates.conditioning) } : {}) },
                            chosen: { id: chosen.id, intent: chosen.intent, family: chosen.family }, draws: { intent: intentDraw, execution: executionDraws, target: targetDraws, perturbation: perturbationDraws, narration: narrationDraw }, execution,
                            resolution: { target: xy(recipe.target), physics: clone(recipe.physics), pace: recipe.pace, repairs: repair,
                                ...(applied.physicalTransformation ? { physicalTransformation: generatedV1(applied.physicalTransformation) } : {}),
                                ...(parameters.guidance ? { flightGuidance: generatedV1(parameters.guidance) } : {}),
                                ...(parameters.limitation ? { flightLimitation: parameters.limitation } : {}),
                                actualContact: generatedV1(trial.contact), actualFeet: generatedV1(trial.feet), intendedError: execution.errorReason, choiceAttempts } });
                        const inspection = inspectPendingLegV2(state, { terminal: true });
                        if (execution.quality === 'error' && inspection.derivedOutcome) return finishAttempt(input, state, document, decisions, diagnostics, false);
                        if (inspection.derivedOutcome && ['net', 'long', 'wide', 'nvz-foot', 'nvz-momentum', 'two-bounce'].includes(inspection.derivedOutcome.reason)) return finishAttempt(input, state, document, decisions, diagnostics, false);
                        accepted = true;
                        break;
                    } catch (error) {
                        if (committed) throw error;
                        diagnostics.rejections++; diagnostics.targetRepairs++;
                        choiceAttempt.repairs.push({ repair, targetDraws, perturbationDraws, reason: error.message });
                        diagnostics.failures.push({ shot: index + 1, intent: chosen.id, repair, reason: error.message });
                        if (diagnostics.failures.length > 8) diagnostics.failures.shift();
                    }
                }
                if (accepted) break;
                excluded.push({ id: chosen.id, intent: chosen.intent, weight: chosen.weight, reason: 'bounded-target-repairs-exhausted' });
                remaining = remaining.filter(candidate => candidate.id !== chosen.id);
                const weight = remaining.reduce((sum, candidate) => sum + candidate.weight, 0);
                remaining = remaining.map(candidate => ({ ...candidate, probability: candidate.weight / weight }));
            }
            if (accepted) break;
        }
        if (!foundPair) {
            const inspection = inspectPendingLegV2(state, { terminal: true });
            if (inspection.derivedOutcome && inspection.derivedOutcome.reason !== 'second-bounce') return finishAttempt(input, state, document, decisions, diagnostics, false);
            return { status: 'failed', document: null, outcome: null, decisions, stats: null,
                diagnostics: { ...diagnostics, code: 'no-feasible-contact', contactIndex: index,
                    pending: { recipe: clone(state.pendingRecipe), origins: clone(state.pendingSegment?.previous.positions), endpoints: clone(state.pendingSegment?.step.positions), physical: inspection.derivedOutcome } }, outcomeClassification: null };
        }
        if (!accepted) return { status: 'failed', document: null, outcome: null, decisions, stats: null,
            diagnostics: { ...diagnostics, code: 'bounded-feasible-intents-exhausted', contactIndex: index }, outcomeClassification: null };
    }
    return finishAttempt(input, state, document, decisions, diagnostics, true);
    } catch (error) {
        if (error && typeof error === 'object' && Object.isExtensible(error)) error.partialDecisions = clone(decisions);
        throw error;
    }
}

export const createRallySimulator = options => createEngineDriverV1(runNaturalAttemptV1, options);
export const simulateRally = createRallySimulator();
