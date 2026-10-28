// Bridge the rules/tactics snapshot to the separately owned coverage renderer.
// Coverage radius and angle remain pedagogical drawing choices, not legal reach.
import { createTacticalSnapshot } from './rally-tactics.js';
import { samplePlayState, worldToBoard, FEET_TO_METERS } from './three-d-core.js';

const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};

/** getState is a live read-only closure returning {play,timeline,document?,players?,positions?}.
 * The returned synchronous function matches board.coverageSnapshotProvider(context).
 * positions are optional court feet; context samples/ball are rendered world metres.
 * Missing/stale/invalid state hides this sample. No clock, camera or rules are invented.
 */
export function createRallyCoverageProvider(getState) {
  if (typeof getState !== 'function') throw new TypeError('A live rally-state getter is required.');
  return function coverageSnapshotProvider({ timeSeconds, samples = {}, ball } = {}) {
    try {
      const state = getState();
      if (!state?.play || !state.timeline || !Number.isFinite(timeSeconds)) return null;
      if (state.timeline.play !== state.play || (state.document && state.document.id !== state.play.id)) return null;
      const canonical = samplePlayState(state.timeline, timeSeconds);
      const positions = { ...canonical.positions, ...state.positions };
      for (const [id, sample] of Object.entries(samples)) {
        if (!positions[id] || !sample?.worldPosition) continue;
        positions[id] = worldToBoard(sample.worldPosition);
      }
      if (Object.values(positions).some(point => !finitePoint(point))) return null;
      const tactical = createTacticalSnapshot({ ...state, elapsed: timeSeconds, positions });
      // The overlay must consume the same ball sample/clock. Reject a stale
      // presentation rather than turn a correct rule snapshot toward old pixels.
      if (ball) {
        if (!Number.isFinite(ball.y)) return null;
        const point = worldToBoard(ball), heightFeet = ball.y / FEET_TO_METERS;
        if (Math.hypot(point.x - tactical.ball.x, point.y - tactical.ball.y, heightFeet - tactical.ball.heightFeet) > 1e-6) return null;
      }
      const players = Object.values(tactical.players).map(player => ({
        id: player.id, team: player.team, position: { ...player.position },
        facing: { ...player.facing }, coverageFacing: { ...player.facing },
        handedness: player.handedness,
        legalReceiver: tactical.legalReceiver ? player.id === tactical.legalReceiver : null,
        coveragePriority: player.coveragePriority, responsibility: player.responsibility
      }));
      if (players.length > 4) return null;
      return freeze({ version: 1, source: 'rally-intelligence', timeSeconds: tactical.time,
        phase: tactical.phase, ball: { ...tactical.ball }, players,
        legalReceiverId: tactical.legalReceiver,
        designatedReceiverId: tactical.designatedReceiver,
        authoredReceiverId: tactical.authoredReceiver,
        eligibleHitters: [...tactical.eligibleHitters],
        mustBounceBeforeContact: tactical.mustBounceBeforeContact,
        coveragePriorities: players.filter(player => player.coveragePriority !== null)
          .map(player => ({ id: player.id, priority: player.coveragePriority }))
          .sort((a, b) => a.priority - b.priority),
        explanation: 'Illustrative floor sectors use shared rally roles and ball tracking; sector membership is neither legality nor measured physical reach.'
      });
    } catch { return null; }
  };
}
