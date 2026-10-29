// Geometry/evidence checks for opt-in model 2. Labels never establish a fault.
import { isInNonVolleyZone, isInServiceBox } from './court-geometry.js';
import { receivingServiceBox, resolveServiceContext, serviceIdentityIssues, teamForPlayer, oppositeTeam } from './rally-state.js';
import { REACH_MODEL } from './rally-tactics.js';
import { PHYSICS_VERSION, PHYSICS_V2, solveFlightV2 } from './play-physics-v2.js';
import { sampleActorBoardPositionV2, sampleActorFeetV2 } from './play-actors-v2.js';

const EPS = 1e-7, EVIDENCE_EPS = 1e-6, PLAYERS = ['player1', 'player2', 'player3', 'player4'];
const R = PHYSICS_V2.ballRadiusFeet;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const boardPoint = p => ({ x: p.x, y: p.y, heightFeet: p.heightFeet ?? 0 });
const finitePoint = p => Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.heightFeet));
const contactTime = s => s.startTime + s.contactTime;
const recipeOf = s => s.step.shot.authoring || {};
const footCenter = feet => ({ x: (feet[0].x + feet[1].x) / 2, y: (feet[0].y + feet[1].y) / 2 });
const onCourt = p => p.x >= -EPS && p.x <= 20 + EPS && p.y >= -EPS && p.y <= 44 + EPS;
const inApron = p => p.x >= -8 - EPS && p.x <= 28 + EPS && p.y >= -8 - EPS && p.y <= 52 + EPS;
const inOwnEnd = (p, team) => team === 'green' ? p.y < 22 - EPS : p.y > 22 + EPS;
const ballEntirelyInOwnEnd = (p, team) => team === 'green' ? p.y + R <= 22 + EPS : p.y - R >= 22 - EPS;
function violation(play, code, message, segment = null, actor = null, category = 'rule') {
  return Object.freeze({ code, classification: 'UNEXPECTED', expected: false, message,
    stepId: segment?.step.id ?? null, playId: play?.id ?? null, ...(actor ? { actor } : {}), category });
}
function actorAt(segment, actor, elapsed) {
  return sampleActorBoardPositionV2(segment, actor, segment.contactTime + elapsed);
}
function makeCandidate(play, segment, reason, timeAfterContact, position, faultingActor, ruleRef, details = {}) {
  const absoluteTime = contactTime(segment) + timeAfterContact;
  const hitterTeam = teamForPlayer(segment.shotSemantics.playerId, play.players);
  return { reason, shotId: segment.step.id, actor: faultingActor, faultingActor,
    winner: faultingActor ? oppositeTeam(teamForPlayer(faultingActor, play.players)) : hitterTeam,
    ruleRef, position: boardPoint(position), evidencePosition: boardPoint(position),
    time: absoluteTime, absoluteTime, violationOccurrenceTime: absoluteTime,
    evidenceObservedTime: absoluteTime, afterContactSeconds: timeAfterContact,
    segmentIndex: segment.index, ...details };
}

// Conservative broad phase only. Actor motion is a convex blend of these
// anchors, and every physical stage is linear in board x/y. Separated envelopes
// cannot touch the torso proxy; all possible intersections retain the original
// dense sweep and bisection below, including near-grazing contacts.
export function bodyContactEnvelopeMayIntersectV2(segment,solved,endTime,actor) {
  if(!Number.isFinite(endTime)||endTime<0)return true;
  const ballPoints=[];
  for(const stage of solved.stages){
    const start=Math.max(0,stage.startTime),end=Math.min(endTime,stage.endTime);
    if(end<start)continue;
    for(const time of [start,end]){const local=time-stage.startTime;ballPoints.push({x:stage.from.x+stage.vx*local,y:stage.from.y+stage.vz*local});}
  }
  const actorPoints=[segment.previous.positions[actor],segment.step.positions[actor]];
  const contact=segment.shotSemantics?.contact;
  if(segment.shotSemantics?.playerId===actor&&contact?.feet?.length===2)actorPoints.push(footCenter(contact.feet));
  for(const item of segment.model2Momentum||[])if(item.actor===actor)actorPoints.push(item.from,item.to);
  if(!ballPoints.length||[...ballPoints,...actorPoints].some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return true;
  const bounds=points=>({minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))});
  const ball=bounds(ballPoints),body=bounds(actorPoints),radius=.6+R+EPS;
  return !(ball.maxX<body.minX-radius||ball.minX>body.maxX+radius||ball.maxY<body.minY-radius||ball.minY>body.maxY+radius);
}

// This is a torso-only collision proxy: shoes, paddle and paddle-holding hand
// cannot accidentally be certified as body faults. Sweep and bisection are
// deterministic. A returned ball is checked up to its actual paddle interception.
function bodyContact(segment, solved, endTime, actor, ignoreInitialContact = false) {
  if(!bodyContactEnvelopeMayIntersectV2(segment,solved,endTime,actor))return null;
  const radius = .6 + R;
  const inside = t => {
    const ball = solved.sampleBoard(t), body = actorAt(segment, actor, t);
    return ball.heightFeet + R >= .7 && ball.heightFeet - R <= 5.5 && distance(ball, body) <= radius;
  };
  const maximumHorizontalSpeed = Math.max(...solved.stages.map(s => Math.hypot(s.vx, s.vz)));
  const routeSpeed = 2 * distance(segment.previous.positions[actor], segment.step.positions[actor]) / Math.max(.001, segment.originalDuration ?? segment.duration);
  const momentumSpeeds = (segment.model2Momentum || []).filter(entry => entry.actor === actor).map(entry => distance(entry.from, entry.to) / Math.max(.001, entry.time - entry.contactTime));
  const actorSpeedBound = Math.max(routeSpeed, ...momentumSpeeds, 18);
  const count = Math.max(256, Math.min(4096, Math.ceil(endTime * (maximumHorizontalSpeed + actorSpeedBound) / (radius / 4))));
  let previous = 0, clearedContact = !ignoreInitialContact || !inside(0);
  if (inside(0) && clearedContact) return 0;
  for (let i = 1; i <= count; i++) {
    const time = endTime * i / count;
    const touching = inside(time);
    if (!clearedContact) { if (!touching) clearedContact = true; previous = time; continue; }
    if (touching) {
      let low = previous, high = time;
      for (let j = 0; j < 40; j++) { const mid = (low + high) / 2; if (inside(mid)) high = mid; else low = mid; }
      return high;
    }
    previous = time;
  }
  return null;
}

// A conservative continuous bound, rather than claiming impossibility from a
// few snapshots. Horizontal reach is deliberately generous at every height. The
// Lipschitz margin covers motion between samples; an ambiguous case is not an ace.
function assessTerminalReach(play, segment, solved) {
  const end = solved.secondBounceTime ?? solved.totalDuration;
  const count = 256, step = end / count;
  const speed = Math.max(...solved.stages.map(s => Math.hypot(s.vx, s.vz)));
  const safety = (speed + REACH_MODEL.speedFeetPerSecond) * step / 2;
  const hitterTeam = teamForPlayer(segment.shotSemantics.playerId, play.players);
  const players = PLAYERS.filter(id => teamForPlayer(id, play.players) !== hitterTeam).map(actor => {
    const from = actorAt(segment, actor, 0); let minimum = Infinity, atTime = 0;
    for (let i = 0; i <= count; i++) {
      const time = end * i / count, ball = solved.sampleBoard(time);
      const radius = REACH_MODEL.paddleReachFeet + Math.max(0, time - REACH_MODEL.reactionSeconds) * REACH_MODEL.speedFeetPerSecond;
      const clearance = distance(from, ball) - radius;
      if (clearance < minimum) { minimum = clearance; atTime = time; }
    }
    const lowerBound = minimum - safety;
    return Object.freeze({ actor, positionAtLaunch: from, availableSeconds: end,
      minSampledClearanceFeet: minimum, continuousLowerBoundFeet: lowerBound,
      closestSampleSeconds: atTime, reachable: lowerBound <= EPS });
  });
  return Object.freeze({ model: 'illustrative-reach-v1', speedFeetPerSecond: REACH_MODEL.speedFeetPerSecond,
    reactionSeconds: REACH_MODEL.reactionSeconds, paddleReachFeet: REACH_MODEL.paddleReachFeet,
    method: 'horizontal-reach-with-continuous-Lipschitz-bound', samples: count + 1,
    players: Object.freeze(players), unreachable: players.length > 0 && players.every(p => !p.reachable) });
}

function geometricCandidates(play, segment, solved, isLast) {
  const results = [], shot = segment.step.shot, actor = segment.shotSemantics.playerId;
  const end = shot.physicsV2.endTimeSeconds ?? solved.firstLandingTime;
  const add = (reason, t, at, faultingActor, ruleRef, details) => {
    if (t <= end + EPS) results.push(makeCandidate(play, segment, reason, t, at, faultingActor, ruleRef, details));
  };
  const obstruction = solved.obstruction;
  if (obstruction && obstruction.kind !== 'net') add(obstruction.kind, obstruction.time, obstruction.position, actor,
    obstruction.kind === 'post' ? '13.B.1' : obstruction.kind === 'net-gap' ? '13.D.1' : '13.E.1', { unsupportedReason: true });
  if (solved.terminal?.reason === 'net') add('net', solved.terminal.time, solved.terminal.position, actor, '10.C.2');
  else if (solved.firstLandingTime <= end + EPS) {
    const landing = solved.landing;
    if (landing.y < -EPS || landing.y > 44 + EPS) add('long', solved.firstLandingTime, landing, actor, '10.C.1');
    else if (landing.x < -EPS || landing.x > 20 + EPS) add('wide', solved.firstLandingTime, landing, actor, '10.C.1');
    else if (inOwnEnd(landing, teamForPlayer(actor, play.players))) add('own-side-landing', solved.firstLandingTime, landing, actor, '10.C.2', { unsupportedReason: true });
    else if (segment.shotSemantics.contact.kind === 'serve') {
      const box = receivingServiceBox(resolveServiceContext(play), segment.shotSemantics.contact.point);
      const beyond = teamForPlayer(actor, play.players) === 'green' ? landing.y > 29 + EPS : landing.y < 15 - EPS;
      if (!isInServiceBox(landing, box) || !beyond) add('serve-target', solved.firstLandingTime, landing, actor, '7.E.1', { unsupportedReason: true });
    }
  }
  // The hitter has just used a paddle. Other actors' torso collision precedes
  // a later out/second bounce when it actually happens first.
  for (const struckActor of PLAYERS) {
    const time = bodyContact(segment, solved, end, struckActor, struckActor === actor);
    if (time === null) continue;
    const serve = segment.shotSemantics.contact.kind === 'serve';
    const sameTeam = teamForPlayer(struckActor, play.players) === teamForPlayer(actor, play.players);
    const serveHitsReceiverBeforeLanding = serve && !sameTeam && time < solved.firstLandingTime - EPS;
    const receiver = serveHitsReceiverBeforeLanding ? resolveServiceContext(play).receiver : null;
    const receiverKnown = PLAYERS.includes(receiver) && teamForPlayer(receiver, play.players) !== teamForPlayer(actor, play.players);
    const faultingActor = serve && sameTeam ? actor : serveHitsReceiverBeforeLanding ? receiver : struckActor;
    add('body', time, solved.sampleBoard(time), faultingActor,
      serve && sameTeam ? '7.E.4' : serveHitsReceiverBeforeLanding ? '7.E.5' : '10.C.3',
      { struckActor, ...(serveHitsReceiverBeforeLanding && !receiverKnown ? { unsupportedReason: true } : {}) });
  }
  if (isLast && play.ending !== 'stop' && solved.secondBounceTime !== null && solved.secondBounceTime <= end + EPS) {
    const reach = assessTerminalReach(play, segment, solved);
    const defender = [...reach.players].sort((a, b) => a.minSampledClearanceFeet - b.minSampledClearanceFeet || a.actor.localeCompare(b.actor))[0]?.actor;
    add(reach.unreachable ? 'unreachable' : 'second-bounce', solved.secondBounceTime, solved.sampleBoard(solved.secondBounceTime),
      reach.unreachable ? null : defender, '10.B.1', { reach });
  }
  return results;
}

function contactCandidates(play, segment, shotIndex, violations) {
  const candidates = [], momentumCandidates = [], shot = segment.step.shot;
  const contact = segment.shotSemantics.contact, actor = segment.shotSemantics.playerId;
  if (contact.kind === 'volley') {
    const feet = contact.feet;
    if (!Array.isArray(feet) || feet.length !== 2) violations.push(violation(play, 'volley-feet', 'A model 2 volley requires two represented foot positions.', segment, actor));
    else {
      const bad = feet.find(isInNonVolleyZone);
      if (bad) candidates.push(makeCandidate(play, segment, 'nvz-foot', 0, { ...bad, heightFeet: 0 }, actor, '11.A.1'));
      else if (shot.contact.feetEstablishedOutsideNVZ === false) violations.push(violation(play, 'unsupported-reset-history', 'The reset flag alone cannot establish a fault when both represented feet are grounded outside the NVZ; model 2 does not represent the grounded/airborne history needed to prove Rule 11.A.3.', segment, actor));
    }
    if (!play.rally?.openingBouncesSatisfied && (shotIndex === 1 || shotIndex === 2)) candidates.push(makeCandidate(play, segment, 'two-bounce', 0, contact.point, actor, shotIndex === 1 ? '10.A.1' : '10.A.2'));
    const momentum = shot.contactEvidence?.momentum ?? recipeOf(segment).contactEvidence?.momentum;
    if (momentum) {
      const bad = momentum.feet?.find(isInNonVolleyZone);
      if (momentum.balanced !== false || !Number.isFinite(momentum.afterContactSeconds) || momentum.afterContactSeconds <= 0 || momentum.afterContactSeconds > 5 || momentum.feet?.length !== 2) {
        violations.push(violation(play, 'momentum-evidence', 'Continuing volley momentum requires bounded observed feet and time.', segment, actor));
      } else if (feet?.length === 2 && momentum.feet.some((foot, i) => distance(foot, feet[i]) > 18 * momentum.afterContactSeconds + EPS)) {
        violations.push(violation(play, 'momentum-reach', 'Observed momentum feet exceed the represented movement speed bound.', segment, actor, 'model'));
      } else if (bad) {
        const candidate = makeCandidate(play, segment, 'nvz-momentum', momentum.afterContactSeconds, { ...bad, heightFeet: 0 }, actor, '11.A.2');
        candidate.time = candidate.absoluteTime = candidate.violationOccurrenceTime = contactTime(segment);
        momentumCandidates.push(candidate);
      }
    }
  } else if (shot.contactEvidence?.momentum || recipeOf(segment).contactEvidence?.momentum) violations.push(violation(play, 'momentum-contact-kind', 'Volley momentum evidence is only valid for a volley.', segment, actor));
  return { candidates, momentumCandidates };
}

function verifySegment(play, segment, solved, prior, index, violations) {
  const shot = segment.step.shot, actor = segment.shotSemantics.playerId, contact = segment.shotSemantics.contact;
  const recipe = recipeOf(segment), from = shot.physicsV2.from, target = shot.physicsV2.target;
  const add = (code, message, category = 'rule') => violations.push(violation(play, code, message, segment, actor, category));
  if (!Number.isFinite(shot.physicsV2.endTimeSeconds) || shot.physicsV2.endTimeSeconds < 0 || shot.physicsV2.endTimeSeconds > solved.totalDuration + EPS) add('leg-end-time', 'The leg endpoint must lie inside its solved physical stages.', 'model');
  if (distance(contact.point, shot.from) > EPS || distance(contact.point, from) > EPS || Math.abs(contact.point.heightFeet - from.heightFeet) > EPS) add('contact-origin-mismatch', 'The shared solver, paddle contact and shot origin must coincide.');
  if (recipe.target && distance(target, recipe.target) > EPS) add('target-source-mismatch', 'Physics landing must preserve the authored target.');
  if (recipe.family && recipe.family !== shot.physicsV2.family) add('family-source-mismatch', 'Physics must preserve the authored shot family.');
  if (recipe.quality !== shot.physicsV2.quality || recipe.arc !== shot.physicsV2.arc || recipe.pace !== shot.physicsV2.pace) add('profile-source-mismatch', 'Physics profile must preserve source arc, pace and quality.');
  if (JSON.stringify(recipe.physics || {}) !== JSON.stringify(shot.physicsV2.physics || {})) add('physics-source-mismatch', 'Compiled physics must retain the authored apex input.');
  if (!inApron(contact.point)) add('contact-apron', 'The represented contact is outside the supported apron.');
  if (!ballEntirelyInOwnEnd(contact.point, teamForPlayer(actor, play.players))) add('opponent-court-contact', 'The entire ball, including its radius, must cross the net plane to the hitter’s end before contact (13.F.1).');
  if (index === 0 && !play.rally?.openingBouncesSatisfied && contact.kind !== 'serve') add('opening-serve', 'A full rally begins with a serve.');
  if (index > 0 && contact.kind === 'serve') add('late-serve', 'A serve may only begin a rally.');
  if (prior) {
    if (teamForPlayer(actor, play.players) === teamForPlayer(prior.segment.shotSemantics.playerId, play.players)) add('team-alternation', 'Successive rally contacts must alternate between teams.');
    const incomingEnd = prior.segment.step.shot.physicsV2.endTimeSeconds;
    const point = prior.solved.sampleBoard(incomingEnd);
    if (distance(point, contact.point) > EVIDENCE_EPS || Math.abs(point.heightFeet - contact.point.heightFeet) > EVIDENCE_EPS) add('contact-discontinuity', 'The next contact must equal the incoming trajectory sample.');
    const bounces = incomingEnd >= prior.solved.firstLandingTime - EPS ? 1 : 0;
    if ((contact.kind === 'volley' && bounces !== 0) || (['groundstroke', 'short-hop'].includes(contact.kind) && bounces !== 1)) add('incoming-bounce-contact-kind', 'Contact kind must match the incoming first-bounce history.');
    if (prior.solved.secondBounceTime !== null && incomingEnd >= prior.solved.secondBounceTime - EPS) add('late-contact', 'Contact must occur before the second bounce.');
    if (contact.kind === 'short-hop' && (incomingEnd - prior.solved.firstLandingTime > .35 + EPS || contact.point.heightFeet > 1.5 + EPS)) add('short-hop-contact', 'A short hop must occur within 0.35 s of its bounce and below 1.5 ft.', 'model');
    const receiver = recipeOf(prior.segment).receiver;
    if (receiver && receiver !== 'auto' && receiver !== actor) add('receiver-continuity', 'The actual next hitter must agree with the preceding declared receiver.');
  } else if (!onCourt(contact.point) && contact.kind !== 'serve' && !['erne', 'around-the-post'].includes(recipe.intent)) add('initial-apron-contact', 'An unrepresented initial apron contact requires applicable signature-shot geometry.');
  if (contact.feet?.length === 2) {
    if (contact.feet.some(p => !inApron(p))) add('foot-apron', 'Foot evidence must remain inside the supported apron.');
    if (distance(footCenter(contact.feet), contact.point) > 3 + EPS) add('contact-feet-reach', 'Foot evidence must support the paddle contact within the 3 ft reach model.', 'model');
    if (distance(footCenter(contact.feet), actorAt(segment, actor, 0)) > EVIDENCE_EPS) add('contact-actor-mismatch', 'Observed feet and the visible actor must agree at paddle contact.', 'model');
    if (recipe.contactEvidence && JSON.stringify(recipe.contactEvidence.feet) !== JSON.stringify(contact.feet)) add('foot-source-mismatch', 'Compiled feet must preserve source foot evidence.');
    if (recipe.contactEvidence && recipe.contactEvidence.feetEstablishedOutsideNVZ !== shot.contact.feetEstablishedOutsideNVZ) add('foot-reset-source-mismatch', 'Compiled feet-reset evidence must preserve its source.');
  }
  if (JSON.stringify(recipe.contactEvidence || {}) !== JSON.stringify(shot.contactEvidence || {})) add('contact-evidence-source-mismatch', 'Compiled contact evidence must preserve its source.');
  if (recipe.contactOverride && distance(recipe.contactOverride, contact.point) > .025) add('contact-override-mismatch', 'The signature contact override must lie on the actual incoming flight.');
  if (recipe.intent === 'erne') {
    const band = teamForPlayer(actor, play.players) === 'green' ? contact.point.y >= 15 && contact.point.y < 22 : contact.point.y > 22 && contact.point.y <= 29;
    if (contact.kind !== 'volley' || !(contact.point.x < 0 || contact.point.x > 20) || !band) add('erne-geometry', 'An Erne is a volley beside the NVZ on the hitter’s own side, entirely outside the sideline.');
    // The act of volleying starts at paddle contact. A prior grounded visit
    // to the kitchen is legal after both feet reset outside (11.A.3). Actual
    // contact feet establish 11.A.1; explicit later momentum is checked above.
    // Airborne/reset history beyond this grounded model remains unsupported.
    const groundedFeet = sampleActorFeetV2(segment, actor, segment.contactTime);
    if (contact.feet?.length !== 2 || groundedFeet.length !== 2 || groundedFeet.some((foot, i) => distance(foot, contact.feet[i]) > EVIDENCE_EPS)) add('erne-foot-evidence', 'The model cannot establish Erne legality when represented contact feet disagree with the shared grounded foot samples.', 'model');
  }
  if (recipe.intent === 'around-the-post') {
    const crossing = solved.events.find(e => e.type === 'net-crossing');
    if (!crossing?.aroundPost || !onCourt(target) || inOwnEnd(target, teamForPlayer(actor, play.players))) add('atp-geometry', 'An ATP must pass wholly outside a net post and land in the opposing court.');
  }
  if (contact.kind === 'serve' && contact.feet?.length === 2) {
    const service = resolveServiceContext(play), box = receivingServiceBox(service, contact.point);
    const near = teamForPlayer(actor, play.players) === 'green';
    const lo = box.minX === 0 ? 10 : 0, hi = box.minX === 0 ? 20 : 10;
    if (contact.feet.some(foot => (near ? foot.y >= 0 : foot.y <= 44) || foot.x < lo || foot.x > hi)) add('serve-foot-position', 'Grounded serve feet must be behind the baseline and inside the serving-area extensions.');
  }
}

function declarationMatches(play, decision, violations) {
  const declared = play.outcome;
  const segment = decision ? { step: { id: decision.shotId } } : null;
  const add = (code, message) => violations.push(violation(play, code, message, segment, decision?.faultingActor));
  if (play.ending === 'stop') {
    if (declared) add('stop-outcome', 'An incomplete stop may not claim an outcome.');
    if (decision) add('undeclared-terminal', 'A physically completed point must declare its terminal outcome.');
    return false;
  }
  if (!decision) { add('missing-terminal-evidence', 'The declared point has no decisive geometric event.'); return false; }
  if (decision.unsupportedReason) { add(decision.reason, 'The decisive geometry is an unsupported or illegal return, not the declared supported outcome.'); return false; }
  if (!declared) { add('missing-outcome', 'A completed point requires a declared outcome matching its physical evidence.'); return false; }
  for (const key of ['reason', 'shotId', 'winner', 'faultingActor', 'ruleRef']) if (declared[key] !== decision[key]) add(`outcome-${key}`, `Declared outcome ${key} does not match the independently computed terminal event.`);
  if ((declared.struckActor ?? null) !== (decision.struckActor ?? null)) add('outcome-struckActor', 'The declared struck actor does not match the torso collision.');
  const evidence = declared.evidence;
  if (!finitePoint(evidence?.position) || distance(evidence.position, decision.position) > EVIDENCE_EPS || Math.abs(evidence.position.heightFeet - decision.position.heightFeet) > EVIDENCE_EPS || !Number.isFinite(evidence.afterContactSeconds) || Math.abs(evidence.afterContactSeconds - decision.afterContactSeconds) > EVIDENCE_EPS) add('outcome-evidence', 'Declared terminal geometry and contact-relative timing must match the solved event.');
  const finalHitter = play.steps.filter(s => s.shot).at(-1)?.shot.playerId;
  const finalWinner = teamForPlayer(finalHitter, play.players) === decision.winner;
  if (play.ending !== (finalWinner ? 'winner' : 'fault')) add('outcome-ending', 'Ending must reflect whether the final hitter’s team wins the completed point.');
  const physicalType = decision.reason === 'unreachable' ? 'winner' : 'fault';
  if (declared.type !== physicalType) add('outcome-type', 'Model 2 physics establishes a winner only for proven unreachable balls; represented rule endings are faults. Tactical forced/unforced causation requires a later policy model.');
  if (!['winner', 'fault', 'unforced-error', 'forced-error'].includes(declared.type)) add('outcome-type', 'Outcome type must use a supported category.');
  return !violations.some(v => v.code.startsWith('outcome-') || ['missing-outcome', 'missing-terminal-evidence'].includes(v.code));
}

// Bounded planner inspection uses exactly the production per-segment checks.
// Public full validation still solves and checks every source leg independently.
export function inspectModel2SegmentV2(play, segment, {index=segment.rallyLeg-1,prior=null,terminal=false,solved=null}={}) {
  const violations=[];
  try {
    solved=solved||solveFlightV2(segment.step.shot.physicsV2);
    verifySegment(play,segment,solved,prior,index,violations);
    const physicalCandidates=geometricCandidates(play,segment,solved,terminal);
    const contact=contactCandidates(play,segment,index,violations);
    physicalCandidates.push(...contact.candidates);
    return {solved,violations,physicalCandidates,momentumCandidates:contact.momentumCandidates};
  } catch(error) {
    violations.push(violation(play,'invalid-physics',error.message,segment,segment.shotSemantics?.playerId,'model'));
    return {solved,violations,physicalCandidates:[],momentumCandidates:[]};
  }
}

const candidateOrder=(a,b)=>a.time-b.time||a.evidenceObservedTime-b.evidenceObservedTime||a.shotId.localeCompare(b.shotId)||a.reason.localeCompare(b.reason);
export function resolveModel2OutcomeCandidates(physicalCandidates=[],momentumCandidates=[]) {
  const physical=[...physicalCandidates].sort(candidateOrder)[0]||null;
  const ordered=[...physicalCandidates,...momentumCandidates].sort(candidateOrder);
  const first=ordered[0]||null;
  const decision=first?{...first,physicalDeadTime:Math.min(first.evidenceObservedTime,physical?.time??Infinity)}:null;
  return {decision,ordered,physical};
}

export function derivedOutcomeForDecisionV2(decision) {
  return decision&&!decision.unsupportedReason?{
    winner:decision.winner,type:decision.reason==='unreachable'?'winner':'fault',
    reason:decision.reason,shotId:decision.shotId,ruleRef:decision.ruleRef,
    faultingActor:decision.faultingActor,...(decision.struckActor?{struckActor:decision.struckActor}:{}),
    evidence:{position:boardPoint(decision.position),afterContactSeconds:decision.afterContactSeconds}
  }:null;
}

export function analyzeModel2Outcome(play, timeline) {
  const violations = [], warnings = [], physicalCandidates = [], momentumCandidates = [];
  const segments = (timeline.rawSegments || timeline.segments || []).filter(s => s.shotSemantics);
  if (play.modelVersion !== 2 || play.physicsVersion !== PHYSICS_VERSION) violations.push(violation(play, 'model-version', 'Explicit model 2 and its supported physics version are required.'));
  if (play.intentionalFault) violations.push(violation(play, 'intentional-fault', 'Expected model 2 outcomes must not use the intentionalFault authoring bypass.'));
  for (const issue of serviceIdentityIssues(play)) violations.push(violation(play, issue.code, issue.message, { step: { id: issue.shotId } }, issue.actor));
  let prior = null;
  for (const [index, segment] of segments.entries()) {
    try {
      const shot = segment.step.shot;
      if (shot.physicsV2?.physicsVersion !== PHYSICS_VERSION) throw new TypeError('Each model 2 shot requires explicit shared-solver version metadata.');
      const solved = solveFlightV2(shot.physicsV2);
      verifySegment(play, segment, solved, prior, index, violations);
      physicalCandidates.push(...geometricCandidates(play, segment, solved, index === segments.length - 1));
      const contact = contactCandidates(play, segment, index, violations);
      physicalCandidates.push(...contact.candidates); momentumCandidates.push(...contact.momentumCandidates);
      prior = { segment, solved };
    } catch (error) { violations.push(violation(play, 'invalid-physics', error.message, segment, segment.shotSemantics?.playerId, 'model')); }
  }
  physicalCandidates.sort(candidateOrder); momentumCandidates.sort(candidateOrder);
  const physical = physicalCandidates[0] || null;
  // Momentum is attributed to the original faulty volley even when observed
  // after a later otherwise-decisive fault/dead ball (2026 Casebook14-23).
  const resolution=resolveModel2OutcomeCandidates(physicalCandidates,momentumCandidates),decisions=resolution.ordered;
  let decision=resolution.decision;
  if (decision) {
    for (const candidate of physicalCandidates) {
      if (candidate.unsupportedReason && candidate.time <= decision.time + EPS && candidate !== decisions[0]) {
        violations.push(violation(play, candidate.reason, 'Unsupported decisive geometry cannot be hidden by a simultaneous declared fault.', { step: { id: candidate.shotId } }, candidate.faultingActor));
      }
    }
    for (const segment of segments) {
      const at = contactTime(segment);
      // A retroactive momentum fault permits contacts provisionally played
      // before it was observed, but never resurrects a separate ball already
      // dead from an intervening out/body/second-bounce event.
      const cutoff = decision.reason === 'nvz-momentum' ? decision.physicalDeadTime : decision.time;
      if (at > cutoff + EPS) violations.push(violation(play, 'continuation-after-dead', 'A normal dead ball cannot be followed by another authored rally contact.', segment, segment.shotSemantics.playerId));
    }
  }
  const matched = declarationMatches(play, decision, violations);
  const derivedOutcome=derivedOutcomeForDecisionV2(decision);
  return Object.freeze({ decision: decision && Object.freeze(decision), physicalCandidates: Object.freeze(physicalCandidates), momentumCandidates: Object.freeze(momentumCandidates),
    violations: Object.freeze(violations), warnings: Object.freeze(warnings), derivedOutcome: derivedOutcome && Object.freeze(derivedOutcome), matched });
}

export function validateModel2Rules(play, timeline) {
  const analysis = analyzeModel2Outcome(play, timeline);
  return Object.freeze({ valid: analysis.violations.length === 0, violations: analysis.violations, warnings: analysis.warnings,
    expectedFaults: Object.freeze(analysis.matched && analysis.decision && analysis.decision.reason !== 'unreachable' ? [analysis.decision] : []),
    expectedOutcomes: Object.freeze(analysis.matched && analysis.decision ? [analysis.decision] : []), outcome: analysis.decision });
}
