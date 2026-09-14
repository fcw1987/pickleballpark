// Compile authored intent into the existing production Play and event timeline.
import { compilePlayTimeline } from './three-d-core.js';
import { isInServiceBox, serviceBoxForServer, isInNonVolleyZone } from './court-geometry.js';
import { validateRallyRules } from './rally-rules.js';
import { documentCompatibilitySignature, validateDocument, movementProtection } from './play-document.js';

const copy = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const PLAYER_IDS = ['player1', 'player2', 'player3', 'player4'];
const TEAMMATE = { player1: 'player2', player2: 'player1', player3: 'player4', player4: 'player3' };
const FAMILY_LABEL = { serve: 'Serve', return: 'Return', drive: 'Drive', drop: 'Drop', dink: 'Dink', volley: 'Volley', reset: 'Reset', lob: 'Lob', overhead: 'Overhead' };
const FLIGHT = {
  serve: { soft: 22, medium: 28, firm: 34, low: 6.5, mediumArc: 8, high: 11 },
  return: { soft: 22, medium: 30, firm: 36, low: 5.8, mediumArc: 7.5, high: 10 },
  drive: { soft: 27, medium: 34, firm: 40, low: 5.5, mediumArc: 6.5, high: 8 },
  drop: { soft: 16, medium: 20, firm: 25, low: 5.5, mediumArc: 6.5, high: 7.8 },
  dink: { soft: 10, medium: 13, firm: 17, low: 4.5, mediumArc: 5.1, high: 6 },
  volley: { soft: 15, medium: 22, firm: 29, low: 4.4, mediumArc: 5.2, high: 6.5 },
  reset: { soft: 11, medium: 15, firm: 20, low: 4.6, mediumArc: 5.6, high: 6.8 },
  lob: { soft: 16, medium: 20, firm: 25, low: 9, mediumArc: 11, high: 14 },
  overhead: { soft: 26, medium: 34, firm: 40, low: 6.5, mediumArc: 8.5, high: 11 }
};
const NET_CLEARANCE = { low: 8, medium: 16, high: 24 };
const BOUNCE_HEIGHT = { drive: 1.05, drop: 1.2, dink: .9, reset: 1, lob: 1.4, overhead: 1.15 };

const finding = (kind, severity, shotId, message) => Object.freeze({ kind, severity, shotId, message });
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const sameRecipe = (shot, signature) => JSON.stringify(shot) === signature;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const oppositeTeam = team => team === 'green' ? 'orange' : 'green';
const isVolley = shot => shot.family === 'volley' || shot.family === 'overhead' || (shot.family === 'reset' && shot.contactStyle !== 'short-hop');
const contactKind = shot => shot.family === 'serve' ? 'serve' : shot.contactStyle === 'short-hop' ? 'short-hop' : isVolley(shot) ? 'volley' : 'groundstroke';

function exactTemplate(document) {
  const source = document.templateSource;
  return source && source.recipeSignatures.length === document.shots.length &&
    document.shots.every((shot, index) => sameRecipe(shot, source.recipeSignatures[index])) &&
    documentCompatibilitySignature(document) === source.documentSignature;
}

function templateResult(document) {
  const play = { ...copy(document.templateSource.play), id: document.id, name: document.title };
  const base = compilePlayTimeline(play);
  const shotIds = play.steps.filter(step => step.shot).map((step, index) => document.shots[index]?.id || step.id);
  const timeline = relabelTimeline(base, shotIds);
  const rules = validateRallyRules(play, base);
  return Object.freeze({
    play: Object.freeze(play), timeline,
    findings: Object.freeze(rules.violations.map(item => finding('rule', 'error', item.stepId, item.message))),
    validShotCount: document.shots.length, coverage: Object.freeze([])
  });
}

function relabelTimeline(timeline, shotIds) {
  const events = timeline.events.map(event => Object.freeze({ ...event, id: `${timeline.play.id}:${shotIds[event.rallyLeg - 1]}:${event.type}` }));
  return Object.freeze({ ...timeline, events: Object.freeze(events) });
}

function strokeFor(shot) {
  if (shot.contactStyle === 'short-hop') return 'short-hop';
  if (shot.family === 'return') return shot.contactStyle === 'backhand' ? 'backhand' : 'forehand';
  return shot.family;
}

function autoStrokeSide(shot, contact, players, actorPosition) {
  if (shot.contactStyle !== 'auto') return shot.contactStyle === 'short-hop' ? 'forehand' : shot.contactStyle;
  const handedness = players[shot.hitter].handedness;
  const green = players[shot.hitter].team === 'green';
  const lateral = contact.x - actorPosition.x;
  const paddleSide = (green ? 1 : -1) * (handedness === 'right' ? 1 : -1);
  const forehandSide = Math.abs(lateral) < .15 || lateral * paddleSide >= 0;
  return forehandSide ? 'forehand' : 'backhand';
}

function groundedContact(target, hitterTeam, shortHop = false) {
  const offset = shortHop ? .3 : .75;
  return { x: target.x, y: clamp(target.y + (hitterTeam === 'orange' ? offset : -offset), 0, 44) };
}

function volleyContact(origin, intended, hitterTeam) {
  // Intercept before the intended bounce and outside the hitter's NVZ.
  const legalY = hitterTeam === 'orange' ? 29.6 : 14.4;
  const denominator = intended.y - origin.y;
  const progress = Math.abs(denominator) < 1e-9 ? .8 : clamp((legalY - origin.y) / denominator, .15, .95);
  return { x: clamp(origin.x + (intended.x - origin.x) * progress, .25, 19.75), y: legalY };
}

function movementTarget(recipe, atContact) {
  if (recipe.movement.intent === 'manual') return copy(recipe.movement.target);
  if (recipe.movement.intent === 'hold') return copy(atContact);
  const green = atContact.y < 22;
  if (recipe.movement.intent === 'advance') return { x: atContact.x, y: green ? Math.min(14, atContact.y + 4) : Math.max(30, atContact.y - 4) };
  return { x: clamp(atContact.x + (10 - atContact.x) * .25, .5, 19.5), y: green ? Math.max(3, atContact.y - 3) : Math.min(41, atContact.y + 3) };
}

function shotContact(recipe, previousRecipe, previousOrigin, previousTarget, layout, players) {
  if (!previousRecipe) return copy(layout.ball);
  const team = players[recipe.hitter].team;
  return isVolley(recipe) ? volleyContact(previousOrigin, previousTarget, team) : groundedContact(previousTarget, team, recipe.contactStyle === 'short-hop');
}

function trajectoryMetadata(recipe) {
  const profile = FLIGHT[recipe.family];
  const arcKey = recipe.arc === 'medium' ? 'mediumArc' : recipe.arc;
  return {
    speedMph: profile[recipe.pace], apexFeet: profile[arcKey], netClearanceInches: NET_CLEARANCE[recipe.arc],
    bounceHeightFeet: BOUNCE_HEIGHT[recipe.family] ?? 1.1,
    spin: { type: ['drop', 'dink', 'reset'].includes(recipe.family) ? 'backspin' : 'topspin', rpm: recipe.pace === 'firm' ? 850 : recipe.pace === 'soft' ? 300 : 600 }
  };
}

function feetAt(point) {
  return [{ x: clamp(point.x - .42, 0, 20), y: point.y }, { x: clamp(point.x + .42, 0, 20), y: point.y }];
}
function serveFeetAt(point) {
  const y = point.y < 22 ? -.65 : 44.65;
  return [{ x: clamp(point.x - .42, 0, 20), y }, { x: clamp(point.x + .42, 0, 20), y }];
}

function finalizeLastAcceptedStep(steps, accepted) {
  const recipe = accepted.at(-1), step = steps.at(-1);
  if (!recipe || !step?.shot) return;
  step.shot.to = copy(recipe.target);
  step.shot.flight.bounces = 1;
  step.positions.ball = copy(recipe.target);
}
function labelOutcome(play) {
  if (play.steps.length < 2 || play.ending === 'stop') return;
  const last = play.steps.at(-1), noun = play.ending === 'winner' ? 'winner' : 'fault';
  if (!last.label.endsWith(`· ${noun === 'winner' ? 'Winner' : 'Fault'}`)) last.label = `${last.label} · ${noun === 'winner' ? 'Winner' : 'Fault'}`;
  if (!last.description.includes(`Declared ${noun};`)) last.description = `${last.description} Declared ${noun}; the demonstration ends here.`;
}

function validateRecipeIntent(document, recipe, index, priorRecipe, contact) {
  const findings = [];
  const team = document.players[recipe.hitter].team;
  if (index === 0 && document.opening === 'serve' && recipe.family !== 'serve') findings.push(finding('rule', 'error', recipe.id, 'A standard full-rally draft must begin with a serve.'));
  if (recipe.family === 'serve' && (index > 0 || document.opening === 'midrally')) findings.push(finding('rule', 'error', recipe.id, 'A serve can only begin a standard full-rally draft.'));
  if (priorRecipe && document.players[priorRecipe.hitter].team === team) findings.push(finding('rule', 'error', recipe.id, 'Consecutive contacts must alternate between teams.'));
  if (priorRecipe && priorRecipe.receiver !== 'auto' && priorRecipe.receiver !== recipe.hitter) findings.push(finding('rule', 'error', recipe.id, `The preceding shot names ${priorRecipe.receiver} as receiver, but ${recipe.hitter} is authored to strike.`));
  if (recipe.receiver !== 'auto' && document.players[recipe.receiver].team !== oppositeTeam(team)) findings.push(finding('rule', 'error', recipe.id, 'The intended receiver must be on the opposing team.'));
  if (recipe.family === 'serve') {
    const box = serviceBoxForServer(contact);
    const beyondKitchen = contact.y < 22 ? recipe.target.y > 29 : recipe.target.y < 15;
    if (!isInServiceBox(recipe.target, box) || !beyondKitchen) findings.push(finding('rule', 'error', recipe.id, 'The serve target must be in the diagonal receiving service court beyond the non-volley-zone line.'));
  } else if ((contact.y < 22) === (recipe.target.y < 22)) findings.push(finding('rule', 'error', recipe.id, 'The target must cross the net to the opposing side.'));
  if (document.opening === 'serve' && (index === 1 || index === 2) && contactKind(recipe) === 'volley') findings.push(finding('rule', 'error', recipe.id, index === 1 ? 'The receiving team must let the serve bounce before returning it.' : 'The serving team must let the return bounce before striking the third shot.'));
  if (contactKind(recipe) === 'volley' && feetAt(contact).some(isInNonVolleyZone)) findings.push(finding('rule', 'error', recipe.id, 'A volley contact cannot be generated with a foot in the non-volley zone or on its line.'));
  return findings;
}

function makePlay(document) {
  const positions = copy(document.initialLayout);
  const steps = [{ id: 'setup', label: 'Starting Positions', description: document.opening === 'serve' ? 'Ready to begin the authored serve.' : 'Serve and return have already bounced. Ready at the declared mid-rally state.', durationMs: 0, positions: copy(positions) }];
  const findings = [];
  const accepted = [];
  const contacts = [];
  const locks = new Map();
  let terminalFault = false;

  for (let index = 0; index < document.shots.length; index++) {
    const recipe = document.shots[index];
    if (recipe.movement.waypoints?.length) findings.push(finding('unsupported', 'warning', recipe.id, 'Movement waypoints are preserved, but trajectory model version 1 uses the final movement target only.'));
    const prior = accepted[index - 1];
    const priorOrigin = contacts[index - 1];
    const contact = shotContact(recipe, prior, priorOrigin, prior?.target, document.initialLayout, document.players);
    const intentFindings = validateRecipeIntent(document, recipe, index, prior, contact);
    if (intentFindings.length) {
      findings.push(...intentFindings.map(item => document.intentionalFault ? finding(item.kind, 'warning', item.shotId, item.message) : item));
      if (!document.intentionalFault) { finalizeLastAcceptedStep(steps, accepted); break; }
      terminalFault = true;
    }
    const previousPositions = steps.at(-1).positions;
    const actorStance = copy(previousPositions[recipe.hitter]);
    const locked = locks.get(recipe.hitter);
    if (locked && distance(locked, contact) > .75) {
      findings.push(finding('feasibility', 'error', recipe.id, `${recipe.hitter} is pinned at (${locked.x.toFixed(1)}, ${locked.y.toFixed(1)}) and cannot reach this contact without relaxing that authored lock.`));
      finalizeLastAcceptedStep(steps, accepted);
      break;
    }
    const distanceToContact = distance(previousPositions[recipe.hitter], contact);
    const availableSeconds = index ? Math.max(.35, distance(priorOrigin, prior.target) / ((FLIGHT[prior.family][prior.pace] || 20) * 1.4667)) : .6;
    if (distanceToContact > availableSeconds * 14 + 3) {
      findings.push(finding('feasibility', 'error', recipe.id, `${recipe.hitter} cannot reach the requested contact in the available illustrative flight time.`));
      finalizeLastAcceptedStep(steps, accepted);
      break;
    }
    // The receiver reaches contact during the incoming leg, preserving continuous positions.
    if (index > 0 && !locked) previousPositions[recipe.hitter] = copy(contact);
    const endPositions = copy(previousPositions);
    endPositions[recipe.hitter] = movementTarget(recipe, contact);
    let movementImpossible = false;
    for (const [player, movement] of Object.entries(recipe.playerMovement || {})) {
      const target = movementTarget({movement}, previousPositions[player]);
      const movementSeconds = Math.max(.35, distance(contact, recipe.target) / ((FLIGHT[recipe.family][recipe.pace] || 20) * 1.4667));
      if (distance(previousPositions[player], target) > movementSeconds * 14 + 3) {
        findings.push(finding('feasibility', 'error', recipe.id, `${player} cannot reach the manual destination during this flight. Move the destination closer; the authored pin has been kept.`));
        movementImpossible = true; break;
      }
      endPositions[player] = target;
    }
    if (movementImpossible) { finalizeLastAcceptedStep(steps, accepted); break; }
    const nextRecipe = document.shots[index + 1];
    const nextKind = nextRecipe ? contactKind(nextRecipe) : null;
    const bounces = document.opening === 'serve' && index < 2 ? 1 : nextKind === 'volley' ? 0 : 1;
    const actualTarget = nextKind === 'volley' ? volleyContact(contact, recipe.target, document.players[nextRecipe.hitter].team) : copy(recipe.target);
    const metadata = trajectoryMetadata(recipe);
    const kind = contactKind(recipe);
    const strokeSide = autoStrokeSide(recipe, contact, document.players, actorStance);
    const shot = {
      from: copy(contact), to: actualTarget, intendedTarget: copy(recipe.target), type: strokeFor(recipe), stroke: strokeFor(recipe), playerId: recipe.hitter,
      contact: { kind, heightFeet: recipe.family === 'overhead' ? 7 : kind === 'short-hop' ? .8 : kind === 'volley' ? 3 : recipe.family === 'serve' ? 2.8 : 2.2, strokeSide, feet: kind === 'serve' ? serveFeetAt(contact) : feetAt(contact), momentumEntersNonVolleyZone: false },
      flight: { bounces, ...metadata }, authoring: { recipeId: recipe.id, family: recipe.family, receiver: recipe.receiver, movement: copy(recipe.movement), serveMethod: recipe.serveMethod }
    };
    if (recipe.family === 'serve' && recipe.serveMethod === 'drop') shot.servePreparation = { method: 'drop', releaseHeightFeet: 3.5, reboundDuration: .34 };
    endPositions.ball = copy(actualTarget);
    steps.push({ id: recipe.id, label: `${index + 1}. ${FAMILY_LABEL[recipe.family]}`, description: `Authored ${recipe.family} to (${recipe.target.x.toFixed(1)}, ${recipe.target.y.toFixed(1)}).`, durationMs: 850, positions: endPositions, shot });
    accepted.push(recipe);
    contacts.push(contact);
    if (recipe.movement.pinned) locks.set(recipe.hitter, copy(endPositions[recipe.hitter]));
    else locks.delete(recipe.hitter);
    for (const [player, movement] of Object.entries(recipe.playerMovement || {})) {
      if (movement.pinned) locks.set(player, copy(endPositions[player]));
      else locks.delete(player);
    }
    Object.assign(positions, endPositions);
    if (terminalFault) break;
  }
  return { play: { id: document.id, name: document.title, description: 'Custom visual play', mode: 'doubles', rally: { openingBouncesSatisfied: document.opening === 'midrally' }, steps, ending: document.ending, outcome: { intent: document.ending, afterShotId: accepted.at(-1)?.id ?? null, intentionalFault: document.intentionalFault }, assistance: copy(document.assistance) }, findings, accepted };
}

export function compileDocument(document) {
  validateDocument(document);
  if (exactTemplate(document)) return templateResult(document);
  const { play, findings, accepted } = makePlay(document);
  let timeline;
  while (!timeline) {
    try { timeline = compilePlayTimeline(play); }
    catch (error) {
      const shotId = accepted.at(-1)?.id ?? document.shots[0]?.id ?? null;
      findings.push(finding('feasibility', 'error', shotId, error.message));
      if (play.steps.length === 1) throw new TypeError(`The valid play prefix cannot compile: ${error.message}`);
      play.steps.pop();
      accepted.pop();
      finalizeLastAcceptedStep(play.steps, accepted);
      play.outcome.afterShotId = accepted.at(-1)?.id ?? null;
    }
  }
  labelOutcome(play);
  timeline = relabelTimeline(timeline, accepted.map(shot => shot.id));
  return Object.freeze({
    play: Object.freeze(play), timeline, findings: Object.freeze(findings),
    validShotCount: accepted.length, coverage: Object.freeze([])
  });
}

function semanticsWithoutPositions(play) {
  return play.steps.map(step => ({ ...step, positions: undefined }));
}

// Compiler boundary for the separately derived coverage heuristic. It prevents
// assistance from changing ball intent, contacts, pins, or stable event ids.
export function recompileAssistedDocument(document, compiled, assistedPlay, coverage = []) {
  validateDocument(document);
  if (!compiled?.play?.steps || !compiled?.timeline || !assistedPlay?.steps) throw new TypeError('Compiled and assisted Play values are required.');
  if (!Array.isArray(coverage)) throw new TypeError('Coverage must be an array.');
  if (JSON.stringify(semanticsWithoutPositions(assistedPlay)) !== JSON.stringify(semanticsWithoutPositions(compiled.play))) {
    throw new TypeError('Coverage assistance may change derived player positions only.');
  }
  const findings = [...compiled.findings];
  const protection = movementProtection(document);
  for (let index = 0; index < assistedPlay.steps.length; index++) {
    const sourceStep = compiled.play.steps[index], assistedStep = assistedPlay.steps[index];
    if (!sourceStep || !assistedStep?.positions) throw new TypeError('Coverage assistance must preserve the compiled step structure.');
    for (const id of [...PLAYER_IDS, 'ball']) {
      const source = sourceStep.positions[id], assisted = assistedStep.positions[id];
      if (!source || !assisted || !Number.isFinite(assisted.x) || !Number.isFinite(assisted.y)) throw new TypeError(`Coverage assistance produced invalid ${id} coordinates at step ${index}.`);
      if ((id === 'ball' || protection.get(sourceStep.id)?.has(id)) && distance(source, assisted) > 1e-9) throw new TypeError(`Coverage assistance may not change ${id} at step ${index}.`);
    }
  }
  let assistedTimeline;
  try { assistedTimeline = compilePlayTimeline(assistedPlay); }
  catch (error) {
    findings.push(finding('feasibility', 'warning', null, `Suggested coverage was not applied because the assisted plan could not compile: ${error.message}`));
    return Object.freeze({ ...compiled, findings: Object.freeze(findings), coverage: Object.freeze(copy(coverage).map(guide => ({...guide, explanation:'Suggested coverage only — movement was not applied because the assisted plan is infeasible.'}))) });
  }
  for (const segment of assistedTimeline.segments) {
    for (const id of PLAYER_IDS) {
      const from = segment.previous.positions[id], to = segment.step.positions[id];
      if (distance(from, to) > segment.duration * 14 + 3) {
        const shotId = segment.step.shot?.authoring?.recipeId ?? null;
        findings.push(finding('feasibility', 'warning', shotId, `Suggested coverage was not applied because ${id} could not reach the derived position in the available time.`));
        return Object.freeze({ ...compiled, findings: Object.freeze(findings), coverage: Object.freeze(copy(coverage).map(guide => ({...guide, explanation:'Suggested coverage only — movement was not applied because the assisted plan is infeasible.'}))) });
      }
    }
  }
  const ids = compiled.play.steps.filter(step => step.shot).map(step => step.shot.authoring?.recipeId ?? step.id);
  assistedTimeline = relabelTimeline(assistedTimeline, ids);
  return Object.freeze({ ...compiled, play: Object.freeze(assistedPlay), timeline: assistedTimeline, findings: Object.freeze(findings), coverage: Object.freeze(copy(coverage)) });
}
