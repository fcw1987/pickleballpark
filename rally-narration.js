// Deterministic instructional copy. The caller owns a separate narration RNG;
// these functions never draw randomness or influence physical decisions.
export const NARRATION_VERSION = 'rally-narration-v1';
export const EXCITEMENT_VERSION = 'rally-excitement-v1';
const TEAMS = Object.freeze({ green: 'Green', orange: 'Orange' });
const COPY = Object.freeze({
  serve: ['Serve', ['Place the serve and prepare for the return.', 'Start the point with room to recover.', 'Use the serve to set up the next ball.']],
  'deep-return': ['Deep return', ['Send the return deep to buy time to approach.', 'Keep the servers back while the returning pair advances.', 'Use depth to make the third shot more demanding.']],
  'third-shot-drop': ['Third-shot drop', ['Soften the third shot to create time to advance.', 'Bring the ball down softly rather than forcing an attack.', 'Use a soft third to approach behind the ball.']],
  'third-shot-drive': ['Third-shot drive', ['Drive through an available lane and prepare for the reply.', 'Use pace to pressure the returning pair.', 'Make the opponents handle a firm third shot.']],
  block: ['Block', ['Take pace off the incoming attack.', 'Use a compact reply to soften the exchange.', 'Absorb the pace and bring the point back under control.']],
  reset: ['Reset', ['Soften the ball to recover position.', 'Use a controlled reply to regain time.', 'Reset the exchange before looking for an attack.']],
  'cross-court-dink': ['Cross-court dink', ['Use the longer diagonal to keep the soft exchange going.', 'Move the soft exchange across the court.', 'Dink cross-court and stay ready for the next ball.']],
  'middle-dink': ['Middle dink', ['Dink toward the middle to limit the reply angles.', 'Ask the pair to share responsibility for the middle.', 'Keep the soft ball central and stay balanced.']],
  'straight-dink': ['Straight dink', ['Change the soft exchange down the line.', 'Use the straight lane without forcing extra pace.', 'Keep the next dink in the same-side lane.']],
  'backhand-dink': ['Backhand dink', ['Work the backhand lane with a controlled soft ball.', 'Keep the dink away from the comfortable forehand lane.', 'Use a soft backhand-side target to test the reply.']],
  'speed-up': ['Speed-up', ['Change pace through an available attacking lane.', 'Use the contact opportunity to start a faster exchange.', 'Ask the defenders to react to a quicker ball.']],
  counter: ['Counter', ['Reply firmly to the incoming pace.', 'Use a compact counter and recover for the next exchange.', 'Turn the incoming attack back toward an available lane.']],
  'put-away': ['Put-away', ['Attack the available space before the defenders recover.', 'Use the attacking opportunity with a firm finish.', 'Look for the open court from this attacking contact.']],
  lob: ['Lob', ['Lift the ball over the front line to create space.', 'Change the depth of the exchange with a high ball.', 'Use height to move the defenders away from the line.']],
  overhead: ['Overhead', ['Use the high contact to attack into the court.', 'Meet the high ball before it drops and recover afterward.', 'Take the overhead opportunity with a controlled downward attack.']],
  erne: ['Erne', ['Meet the wide ball from outside the sideline.', 'Use the supported outside lane while keeping the feet clear.', 'Take the wide volley without entering the kitchen.']],
  'around-the-post': ['Around the post', ['Return the reachable wide ball around the outside of the post.', 'Use the outside-post lane rather than the net opening.', 'Send the wide retrieval around the post and back into court.']],
  return: ['Return', ['Place the return and recover for the next shot.', 'Give the returning pair time to organize.', 'Use a controlled return to begin the rally.']],
  drive: ['Drive', ['Use a firm ball through an available lane.', 'Add pace while staying ready for the reply.', 'Pressure the next contact with a controlled drive.']],
  drop: ['Drop', ['Use a soft landing to create time to advance.', 'Take pace off the exchange and approach when time allows.', 'Bring the ball down softly in front of the defenders.']],
  dink: ['Dink', ['Keep the soft exchange controlled.', 'Use a low-pressure ball while waiting for an opportunity.', 'Place the dink and stay ready for the reply.']],
  volley: ['Volley', ['Meet the ball before it bounces and recover.', 'Use the available volley contact to control the reply.', 'Keep the volley compact and stay balanced.']]
});
export const NARRATED_INTENTS = Object.freeze(Object.keys(COPY));
const REASONS = Object.freeze({
  net: 'the ball did not clear the net', long: 'the ball landed long', wide: 'the ball landed wide',
  unreachable: 'the return was out of reach', 'second-bounce': 'the ball bounced twice',
  body: 'the ball struck a player', 'nvz-foot': 'a volleying foot touched the kitchen',
  'nvz-momentum': 'volley momentum reached the kitchen', 'two-bounce': 'the opening bounce rule was broken'
});
const fail = text => { throw new TypeError(text); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function drawIndex(draw, count) {
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) fail('Narration draw must be finite in [0, 1).');
  return Math.floor(draw * count);
}
function text(value, maximum, name) {
  if (typeof value !== 'string' || !value.length || value.length > maximum || /[<>\u0000-\u001f\u007f]|(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b(?:mailto|data|javascript):|\b[a-z0-9-]+\.(?:com|org|net|io)\b)/i.test(value)) fail(`${name} must be bounded inert plain text.`);
  return value;
}

export function narrateShotV1({ intent, situation = {}, draw = 0 } = {}) {
  const copy = typeof intent === 'string' && own(COPY, intent) ? COPY[intent] : null;
  if (!copy) fail('A supported source intent is required for narration.');
  if (!situation || typeof situation !== 'object' || Array.isArray(situation)) fail('Narration situation must be an object.');
  const selected = copy[1][drawIndex(draw, copy[1].length)];
  // Only finite team identifiers enter copy; names or untrusted source labels
  // cannot introduce markup or turn a decision record into HTML.
  const prefix = typeof situation.hittingTeam === 'string' && own(TEAMS, situation.hittingTeam) ? TEAMS[situation.hittingTeam] : null;
  const why = prefix ? `${prefix}: ${selected[0].toLowerCase()}${selected.slice(1)}` : selected;
  return Object.freeze({ label: text(copy[0], 40, 'label'), why: text(why, 160, 'why') });
}

export function summarizePointV1({ outcome, classification = null, decisions = [], draw = 0 } = {}) {
  if (!outcome || typeof outcome.winner !== 'string' || typeof outcome.reason !== 'string' || !own(TEAMS, outcome.winner) || !own(REASONS, outcome.reason)) fail('A supported physical outcome is required for the point summary.');
  if (!Array.isArray(decisions) || decisions.length > 99) fail('Point decisions must be an array of at most 99 contacts.');
  const introductions = [`Point ${TEAMS[outcome.winner]}:`, `${TEAMS[outcome.winner]} wins the point:`];
  const intro = introductions[drawIndex(draw, introductions.length)];
  let summary = `${intro} ${REASONS[outcome.reason]}.`;
  const marked = decisions.map((decision, index) => ({ decision, index })).filter(({ decision }) => decision?.situation?.attackable === true);
  const key = marked.at(-1);
  if (key) {
    const intent = key.decision.intent ?? key.decision.chosenIntent ?? key.decision.chosen?.intent;
    const label = typeof intent === 'string' && own(COPY, intent) ? COPY[intent][0] : null;
    if (label) summary += ` Key moment: shot ${key.index + 1}, ${label.toLowerCase()}.`;
  }
  // Causation stays explicitly heuristic and never replaces the physical
  // reason. Unknown or absent classifications do not invent a causal claim.
  if (classification && !['winner', 'forced-error', 'unforced-error', 'rule-fault', 'unknown'].includes(classification.kind)) fail('Unsupported tactical classification.');
  return text(summary, 240, 'point summary');
}

/** A heuristic for later replay ordering, not a measured quality of play. */
export function excitementScoreV1({ shots = 0, handsExchanges = 0, paceChanges = 0, signatureShots = 0, retrievals = 0, pressureSwings = 0 } = {}) {
  for (const [key, value] of Object.entries({ shots, handsExchanges, paceChanges, signatureShots, retrievals, pressureSwings })) if (!Number.isInteger(value) || value < 0 || value > 99) fail(`${key} must be an integer from 0 to 99.`);
  // Three decimal places are the versioned presentation precision; this score
  // never feeds a tactical weight or determines the point outcome.
  const components = Object.freeze({ length: Math.round(Math.sqrt(shots) * 4000) / 1000, hands: Math.min(24, handsExchanges * 4),
    pace: Math.min(12, paceChanges * 2), signatures: Math.min(24, signatureShots * 12),
    retrievals: Math.min(12, retrievals * 3), pressure: Math.min(12, pressureSwings * 3) });
  const score = Math.round(Math.min(100, Object.values(components).reduce((sum, value) => sum + value, 0)) * 1000) / 1000;
  return Object.freeze({ version: EXCITEMENT_VERSION, heuristic: true, score, components });
}
