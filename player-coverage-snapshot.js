import { worldToBoard, FEET_TO_METERS } from './three-d-core.js';
import { isCoverageSnapshot } from './player-coverage.js';

/** Initial adapter for the existing presentation state. No positions, authored
 * pins, timelines, or rule decisions are changed. Provider errors hide coverage
 * for this sample; they must never interrupt authoring or replay.
 *
 * Optional board.coverageSnapshotProvider(context) -> snapshot v1. Context uses
 * deterministic seconds, current presentation samples, ball, and segment.
 */
export function readCoverageSnapshot({ board, timeSeconds = 0, ball, samples = {}, segment = null }) {
  if (typeof board.coverageSnapshotProvider === 'function') {
    try {
      const snapshot = board.coverageSnapshotProvider({ timeSeconds, ball, samples, segment });
      return isCoverageSnapshot(snapshot) ? snapshot : null;
    } catch { return null; }
  }
  const players = Object.values(board.tokens).filter(token => token.type === 'player'
    && token.element.style.display !== 'none' && !token.element.classList.contains('hidden')
    && token.element.getAttribute('display') !== 'none').map(token => {
    const sample = samples[token.id], position = sample?.worldPosition ? worldToBoard(sample.worldPosition) : { x: token.x, y: token.y };
    const facing = sample?.bodyFacing;
    return { id: token.id, team: board.getPlayerTeamColor(token), position,
      facing: facing ? { x: facing.x, y: facing.z } : { x: 0, y: position.y < 22 ? 1 : -1 },
      handedness: token.handedness, legalReceiver: null, coveragePriority: null };
  });
  const ground = ball && Number.isFinite(ball.z) ? worldToBoard(ball) : { x: board.tokens.ball.x, y: board.tokens.ball.y };
  return { version: 1, timeSeconds, phase: ball?.phase || 'ready',
    ball: { ...ground, heightFeet: Number.isFinite(ball?.z) ? ball.y / FEET_TO_METERS : board.playBallHeight || 0 },
    players, source: 'presentation-adapter', legalReceiverId: null, coveragePriorities: [] };
}
