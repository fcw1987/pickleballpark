// Headless versioned policy. Planning uses the same contact, actor and flight
// construction as compilation; the driver independently validates final source.
import { createEngineDriverV1 } from './rally-engine-driver.js';
import { createGenerationRecipeV1, RALLY_ENGINE_VERSION, RALLY_PLAYER_IDS } from './rally-recipe.js';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2, inspectPendingLegV2, finishPlanningV2 } from './play-planning-v2.js';
import { solveFlightV2, interceptFlightV2, localNetHeightFeet, PHYSICS_V2 } from './play-physics-v2.js';
import { sampleActorBoardPositionV2 } from './play-actors-v2.js';
import { eligibleHitters, contactRequiresBounce, resolveServiceContext, teamForPlayer } from './rally-state.js';
import { createSituationV1, rankContactPairsV1, listIntentCandidatesV1, chooseIntentV1 } from './rally-policy.js';
import { resolveStyle } from './rally-styles.js';
import { resolveTargetV1, resolveFlightParametersV1 } from './rally-targets.js';
import { assessPressureV1, sampleExecutionV1, applyExecutionV1, classifyOutcomeV1 } from './rally-quality.js';
import { contactFeetV1, planMovementV1, boundMovementV1, sampleFeetStateV1, inspectGeneratedMovementV1, inspectGeneratedSpacingV1, GROUNDED_CONTACT_HEIGHT_FEET } from './rally-movement.js';
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
// contact feet; other planned destinations shrink against the actual duration.
function repairPendingMovement(state, pair) {
    if (!state.pendingRecipe) return undefined;
    const recipe = clone(state.pendingRecipe), segment = state.pendingSegment;
    const duration = segment.contactTime + pair.time;
    const commandFor = actor => {
        const origin = actor === recipe.hitter ? {
            x: (recipe.contactEvidence.feet[0].x + recipe.contactEvidence.feet[1].x) / 2,
            y: (recipe.contactEvidence.feet[0].y + recipe.contactEvidence.feet[1].y) / 2
        } : segment.previous.positions[actor];
        const desired = actor === pair.id ? pair.feet.stance : segment.step.positions[actor];
        const seconds = actor === recipe.hitter ? Math.max(0, duration - segment.contactTime - .12) : duration;
        return manual(generatedV1(boundMovementV1(origin, desired, seconds, 17.95)));
    };
    recipe.movement = commandFor(recipe.hitter);
    recipe.playerMovement = Object.fromEntries(IDS.filter(id => id !== recipe.hitter).map(id => [id, commandFor(id)]));
    // This destination chooses the incoming volley depth. The shared builder
    // resolves it to the represented contact feet before sampling the route.
    recipe.playerMovement[pair.id] = manual({ x: pair.feet.stance.x, y: pair.kind === 'volley' ? pair.contact.y : pair.feet.stance.y });
    return recipe;
}

function routeValid(segment) {
    return !segment || inspectGeneratedMovementV1(segment).valid && inspectGeneratedSpacingV1(segment).valid;
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
        if (!contactRequiresBounce(index)) for (const fraction of [.7, .85, .97]) {
            options.push({ kind: 'volley', depth: incoming.sampleBoard(incoming.firstLandingTime * fraction).y });
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
    const ranked = rankContactPairsV1({ pairs, eligible, positions: origins, players: input.players });
    // After a third drive, a feasible fifth-shot air contact supports either a
    // soft volley drop or a firm volley. Taking it early is a tactical goal;
    // eligibility, real routes and reach still decide whether it is possible.
    // Within each contact kind the ordinary actor/reach ranking is retained.
    const takeFifthInAir = index === 4 && state.recipes[2]?.family === 'drive';
    const ordered = takeFifthInAir ? [...ranked.filter(row => row.kind === 'volley'), ...ranked.filter(row => row.kind !== 'volley')] : ranked;
    let feasible = 0;
    // Rank cheap exact interceptions first, then inspect real routes in that
    // order. No better feasible reach is skipped in favour of a forehand, and
    // the bounded alternative list avoids re-auditing every dominated pair.
    for (const row of ordered.filter(candidate => candidate.reach.reachable)) {
        await checkpoint({ shots: index, workDelta: 1 });
        const pair = pairs[row.pairIndex], team = input.players[pair.id].team;
        const pendingRecipe = pair.signature ? generatedV1(pair.signature.pendingRecipe) : repairPendingMovement(state, pair);
        const probe = baseRecipe(`shot-${index + 1}`, index, pair, { x: 10, y: team === 'green' ? 30 : 14 });
        const trial = trialRecipeV2(state, probe, { pendingRecipe });
        if (!trial.ok || !routeValid(trial.resolvedPrevious)) {
            diagnostics.excludedContacts++;
            diagnostics.contactExclusions.push({ actor: pair.id, kind: pair.kind, delay: pair.delay ?? null,
                reason: trial.reason || 'actual-route-bound', contact: pair.contact, stance: pair.feet.stance,
                movement: trial.resolvedPrevious ? inspectGeneratedMovementV1(trial.resolvedPrevious) : null });
            if (diagnostics.contactExclusions.length > 8) diagnostics.contactExclusions.shift();
            continue;
        }
        pair.pendingRecipe = pendingRecipe;
        pair.positions = generatedV1(Object.fromEntries(IDS.map(actor => [actor, sampleActorBoardPositionV2(trial.resolvedPrevious, actor, trial.resolvedPrevious.duration)])));
        pair.footState = generatedV1(sampleFeetStateV1(trial.resolvedPrevious, trial.resolvedPrevious.duration));
        pair.sampleTimeSeconds = numberV1(trial.resolvedPrevious.endTime);
        pair.contactTimeSeconds = pair.sampleTimeSeconds;
        yield { ...pair, ranking: row, selectionStrategy: takeFifthInAir ? 'fifth-air-contact-when-feasible' : 'least-required-travel' };
        feasible++;
        if (feasible >= RALLY_ENGINE_LIMITS.maxContactPairs) break;
    }
}

function situationFor(input, state, index, pair, decisions) {
    const previous = state.pendingRecipe;
    let attacking = false;
    try {
        attacking = resolveFlightParametersV1({ candidate: { family: 'drive', pace: 'firm', arc: 'low', intent: 'drive' }, contact: pair.contact,
            target: { x: 10, y: input.players[pair.id].team === 'green' ? 41 : 3 }, team: input.players[pair.id].team }).attacking;
    } catch { /* No physically achievable attack is an ordinary affordance. */ }
    const incoming = previous ? { family: previous.family, intent: previous.intent, pace: previous.pace, hitter: previous.hitter, contactKind: pair.kind } : {};
    const feet = Object.fromEntries(IDS.map(id => [id, pair.footState[id]?.feet ?? []]));
    feet[pair.id] = pair.feet.feet;
    const snapshot = createSituationV1({ players: input.players, positions: pair.positions, feet, footState: pair.footState,
        hitter: pair.id, contact: { ...pair.contact, kind: pair.kind }, contactIndex: index, service: input.service, incoming,
        priorDecisions: decisions, affordances: { drive: attacking,
            attack: attacking && pair.contact.heightFeet - PHYSICS_V2.ballRadiusFeet > localNetHeightFeet(pair.contact.x),
            overhead: pair.contact.heightFeet >= 7, volley: pair.kind === 'volley', bounced: pair.kind !== 'volley', lob: true,
            erne: pair.signature?.intent === 'erne', aroundPost: pair.signature?.intent === 'around-the-post', letGo: false } });
    const origin = state.pendingSegment?.previous.positions[pair.id] ?? input.layout[pair.id];
    return { ...snapshot, sampleTimeSeconds: pair.sampleTimeSeconds, contactTimeSeconds: pair.contactTimeSeconds,
        contactSelection: { version: 'rally-contact-selection-v1', strategy: pair.selectionStrategy ?? 'initial-serve',
            ranking: pair.ranking ? generatedV1(pair.ranking) : null },
        service: clone(input.service), pressure: generatedV1(assessPressureV1({ contact: pair.contact, position: origin,
        availableSeconds: pair.availableSeconds, incomingFlight: state.solved.at(-1), incomingIntent: previous?.intent, selfPaced: index === 0,
        movementSpeedFeetPerSecond: pair.time > 0 ? distance(origin, pair.feet.stance) / pair.time : 0 })) };
}

function addMovement(input, state, index, pair, recipe, flight) {
    if (index === 0) return { ...recipe, movement: hold(), playerMovement: Object.fromEntries(IDS.filter(id => id !== recipe.hitter).map(id => [id, hold()])) };
    const movement = planMovementV1({ positions: pair.positions, players: input.players, hitter: pair.id, contact: pair.contact, target: recipe.target,
        durationSeconds: flight.firstLandingTime, contactTime: 0, index, service: input.service, intent: recipe.intent, family: recipe.family,
        incomingFamily: state.pendingRecipe?.family, kind: pair.kind, feetState: pair.footState, contactFeet: pair.feet,
        quality: recipe.quality, pace: recipe.pace, peakFeetPerSecond: 17.95 });
    if (!movement.ok) throw new RangeError(movement.reason);
    return { ...recipe, movement: generatedV1(movement.movement), playerMovement: generatedV1(movement.playerMovement) };
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
    const finished = finishPlanningV2(state, { ending: censored ? 'stop' : 'winner' });
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
                const execution = sampleExecutionV1({ profile, situation, draws: executionDraws });
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
                        recipe = addMovement(input, state, index, pair, recipe, flight);
                        if (pair.signature?.intent === chosen.intent) {
                            recipe.contactOverride = xy(pair.contact);
                            if (pair.kind === 'volley') delete recipe.contactTiming;
                        }
                        recipe = generatedV1(recipe);
                        recipe.authoring = automaticOwnership([...owned, 'contactOverride'].filter(field => Object.hasOwn(recipe, field)));
                        const trial = trialRecipeV2(state, recipe, { pendingRecipe: pair.pendingRecipe });
                        if (!trial.ok || !routeValid(trial.resolvedPrevious)) throw new RangeError(trial.reason || 'The actual resolved movement or spacing is infeasible.');
                        commitPlanningTrialV2(state, trial);
                        committed = true;
                        decisions.push({ id: `decision-${index + 1}`, shotId: recipe.id, situation, candidates: preCandidates, excluded: preExcluded,
                            chosen: { id: chosen.id, intent: chosen.intent, family: chosen.family }, draws: { intent: intentDraw, execution: executionDraws, target: targetDraws, perturbation: perturbationDraws, narration: narrationDraw }, execution,
                            resolution: { target: xy(recipe.target), physics: clone(recipe.physics), pace: recipe.pace, repairs: repair,
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
