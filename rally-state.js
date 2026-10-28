// Rally facts, independent of camera, coaching, movement and the compiler.
// This is a per-rally model, not a match scoring/officiating engine.
import { serviceBoxForServer } from './court-geometry.js';
export const RALLY_PLAYER_IDS = Object.freeze(['player1', 'player2', 'player3', 'player4']);
export const RALLY_INTELLIGENCE_VERSION = 'rally-intelligence-v1';

export function teamForPlayer(id, players) {
  return players?.[id]?.team ?? (['player1', 'player2'].includes(id) ? 'green' : ['player3', 'player4'].includes(id) ? 'orange' : null);
}

export function oppositeTeam(team) {
  return team === 'green' ? 'orange' : team === 'orange' ? 'green' : null;
}

/** Resolve identity only from declared roles, never nearest position/ball target. */
export function resolveServiceContext(source) {
  const opening = source?.opening ?? (source?.rally?.openingBouncesSatisfied ? 'midrally' : 'serve');
  if (opening === 'midrally') return Object.freeze({ known: false, source: 'midrally', server: null, receiver: null, servingTeam: null, court: null, correctPositionsAtScoreCall: null });
  const declared = source?.service ?? source?.rally?.service;
  const first = source?.shots?.[0] ?? source?.steps?.find(step => step.shot)?.shot;
  const serve = first && (first.family === 'serve' || first.type === 'serve' || first.contact?.kind === 'serve') ? first : null;
  const templateShots = source?.templateSource?.play?.steps?.filter(step => step.shot).map(step => step.shot);
  const templateServe = templateShots?.[0]?.contact?.kind === 'serve' ? templateShots : null;
  const server = declared?.server ?? serve?.hitter ?? serve?.playerId ?? templateServe?.[0]?.playerId ?? null;
  const authoredReceiver = serve?.receiver ?? serve?.authoring?.receiver;
  const receiver = declared?.receiver ?? (authoredReceiver && authoredReceiver !== 'auto' ? authoredReceiver : null) ?? templateServe?.[1]?.playerId ?? null;
  return Object.freeze({
    known: Boolean(server && receiver), server, receiver,
    servingTeam: teamForPlayer(server, source?.players),
    source: declared ? 'declared' : receiver ? templateServe && !serve ? 'lesson' : 'serve-recipe' : 'unknown',
    court: declared?.court ?? null,
    correctPositionsAtScoreCall: declared?.correctPositionsAtScoreCall ?? null
  });
}

export function receivingServiceBox(service, serverPoint) {
  if (!service?.court) return serviceBoxForServer(serverPoint);
  const near = service.servingTeam === 'green';
  const right = service.court === 'right';
  return serviceBoxForServer({ x: near === right ? 15 : 5, y: near ? 0 : 44 });
}

/** Contact index is zero based: serve, return, third, then open rally. */
export function rallyPhase(contactIndex, opening = 'serve') {
  if (opening === 'midrally') return 'open-rally';
  return contactIndex <= 0 ? 'serve' : contactIndex === 1 ? 'return' : contactIndex === 2 ? 'third-shot' : 'open-rally';
}

export function contactRequiresBounce(contactIndex, opening = 'serve') {
  return opening === 'serve' && (contactIndex === 1 || contactIndex === 2);
}

/** All legal role candidates; tactical ranking is a separate operation. */
export function eligibleHitters({ players, service, contactIndex, opening = 'serve', previousHitter = null }) {
  const ids = Object.keys(players || {}).filter(id => teamForPlayer(id, players));
  let eligible;
  if (opening === 'serve' && contactIndex === 0) eligible = service?.server ? [service.server] : [];
  else if (opening === 'serve' && contactIndex === 1) eligible = service?.receiver ? [service.receiver] : [];
  else eligible = ids.filter(id => !previousHitter || teamForPlayer(id, players) === oppositeTeam(teamForPlayer(previousHitter, players)));
  return Object.freeze(eligible.filter(id => ids.includes(id)));
}

export function serviceIdentityIssues(source) {
  const service = resolveServiceContext(source);
  if (service.source === 'midrally') return [];
  const shots = source?.shots ?? source?.steps?.filter(step => step.shot).map(step => ({ ...step.shot, id: step.id })) ?? [];
  const first = shots[0], returned = shots[1];
  const hitter = shot => shot?.hitter ?? shot?.playerId;
  const issues = [];
  if (service.server && first && hitter(first) !== service.server) issues.push({ code: 'incorrect-server', shotId: first.id, actor: hitter(first), message: `This rally designates ${service.server} to serve. Keep that identity or explicitly change the service setup.` });
  if (service.receiver && returned && hitter(returned) !== service.receiver) issues.push({ code: 'incorrect-receiver', shotId: returned.id, actor: hitter(returned), message: `The designated receiver is ${service.receiver}; ${hitter(returned)} cannot take the serve return. Change the return hitter or explicitly correct the service setup. USA Pickleball 5.C determines fault/replay from the score-call context.` });
  const receiver = first?.receiver ?? first?.authoring?.receiver;
  if (service.receiver && receiver && receiver !== 'auto' && receiver !== service.receiver) issues.push({ code: 'serve-receiver-conflict', shotId: first.id, actor: hitter(first), message: `The serve names ${receiver}, but the service setup designates ${service.receiver}. Correct the conflicting receiver fields.` });
  return issues;
}

/** Called only for an explicit user edit, inside the builder's Undo transaction. */
export function updateServiceFromShotEdit(document, shot, field) {
  if (document.opening !== 'serve' || document.shots[0] !== shot || shot.family !== 'serve') return;
  const context = resolveServiceContext(document);
  if (field === 'receiver' && shot.receiver !== 'auto') document.service = {
    ...(document.service || {}), server: context.server ?? shot.hitter, receiver: shot.receiver
  };
  if (field === 'hitter' && document.service) document.service.server = shot.hitter;
}
