import { getCoveragePreference } from './player-coverage.js';

/** Factual hand/position context only. This never selects a middle-ball owner. */
export function coverageMiddleDescription(sectors) {
  const descriptions = [];
  for (const team of ['green', 'orange']) {
    const pair = sectors.filter(sector => sector.team === team);
    if (pair.length !== 2 || (pair[0].position.y < 22) !== (pair[1].position.y < 22)) continue;
    const name = team === 'green' ? 'Green' : 'Orange';
    if (Math.abs(pair[0].position.x - pair[1].position.x) < .5) {
      descriptions.push(`${name}: partners are aligned; call the middle.`); continue;
    }
    const forward = pair[0].position.y < 22 ? 1 : -1;
    // Facing +y, a player's own right is -x. Reverse that on the far half.
    pair.sort((a, b) => forward * (b.position.x - a.position.x));
    const side = player => player.handedness === 'right' ? 'forehand' : 'backhand';
    descriptions.push(`${name} middle: left player's ${side(pair[0])} side, right player's ${pair[1].handedness === 'left' ? 'forehand' : 'backhand'} side.`);
  }
  return descriptions.join(' ') || 'Pair positions are unavailable; watch the ball and communicate through the middle.';
}

let currentContext = coverageMiddleDescription([]);
// Builder controls can be remounted. Update mounted text, without retaining DOM
// nodes/listeners or creating another clock. Geometry remains a pure sample.
export function updatePlayerCoverageContext(sectors) {
  const text = coverageMiddleDescription(sectors);
  if (text === currentContext) return;
  currentContext = text;
  for (const node of globalThis.document?.querySelectorAll('.player-coverage-context') || []) node.textContent = text;
}

/** A view preference, kept outside the authored document and undo history. */
export function createPlayerCoverageControl() {
  const preference = getCoveragePreference();
  const root = document.createElement('div'); root.className = 'player-coverage-control';
  const button = document.createElement('button'); button.type = 'button';
  button.className = 'player-coverage-toggle'; button.dataset.coverageToggle = '';
  button.setAttribute('aria-label', 'Player coverage'); button.setAttribute('aria-describedby', 'playerCoverageDescription');
  const icon = document.createElement('span'); icon.className = 'player-coverage-icon'; icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.textContent = 'Coverage';
  const state = document.createElement('span'); state.className = 'player-coverage-state';
  button.append(icon, label, state);
  const legend = document.createElement('span'); legend.className = 'player-coverage-legend';
  const legendFull = document.createElement('span'); legendFull.className = 'player-coverage-legend-full'; legendFull.textContent = 'Shared area · call the ball';
  const legendCompact = document.createElement('span'); legendCompact.className = 'player-coverage-legend-compact'; legendCompact.textContent = 'Call the ball';
  legend.append(legendFull, legendCompact);
  const help = document.createElement('details'); help.className = 'player-coverage-help';
  const summary = document.createElement('summary'); summary.textContent = 'Guide'; summary.setAttribute('aria-label', 'About player coverage');
  const panel = document.createElement('div'); panel.className = 'player-coverage-explanation';
  const title = document.createElement('strong'); title.textContent = 'Cover the incoming ball';
  const description = document.createElement('p'); description.id = 'playerCoverageDescription';
  description.textContent = "These cones show incoming defensive coverage, not where to aim your next shot. They track the ball and gently shift together toward an opponent's ball.";
  const key = document.createElement('div'); key.className = 'player-coverage-key';
  for (const [team, text] of [['rose', 'Teammate 1 · rose'], ['blue', 'Teammate 2 · blue'], ['shared', 'Violet · shared area']]) {
    const item = document.createElement('span'); item.className = `player-coverage-key-${team}`; item.textContent = text; key.append(item);
  }
  const note = document.createElement('p'); note.textContent = 'Rose and blue blend to violet. Hatching means shared space. Green jerseys: solid edges. Orange jerseys: broken edges. The bright inner mark shows the paddle-hand side; backhands remain available.';
  const context = document.createElement('p'); context.className = 'player-coverage-context'; context.textContent = currentContext;
  const tactics = document.createElement('p'); tactics.textContent = 'Left/right mean facing the net. Shift together, protect line and middle, and call shared balls. Forehand does not always take the middle.';
  const scope = document.createElement('small'); scope.textContent = 'Illustrative 116° / 9 ft cones, at most 28° from net-facing. Not measured reach or shot legality. Height, pace, balance and bounce / kitchen rules still matter.';
  const content = document.createElement('div'); content.className = 'player-coverage-explanation-content'; content.tabIndex = 0;
  content.setAttribute('role', 'region'); content.setAttribute('aria-label', 'Coverage guide details');
  content.append(title, description, key, note, context, tactics, scope); panel.append(content);
  help.append(summary, panel); root.append(button, legend, help);
  const sync = () => { button.setAttribute('aria-pressed', String(preference.enabled)); state.textContent = preference.enabled ? 'On' : 'Off'; legend.hidden = !preference.enabled; root.dataset.enabled = String(preference.enabled); };
  button.addEventListener('click', event => {
    event.stopPropagation(); const result = preference.set(!preference.enabled); sync();
    button.title = result.persisted ? 'Player coverage preference saved' : 'Player coverage is available for this session';
  });
  // These view-only controls must not select a shot, start playback, or edit a play.
  help.addEventListener('click', event => event.stopPropagation());
  help.addEventListener('keydown', event => { if (event.key === 'Escape') { help.open = false; summary.focus(); event.stopPropagation(); } });
  sync(); return root;
}
