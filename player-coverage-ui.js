import { getCoveragePreference } from './player-coverage.js';

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
  legend.textContent = 'Shared area · call the ball';
  const help = document.createElement('details'); help.className = 'player-coverage-help';
  const summary = document.createElement('summary'); summary.textContent = 'Guide'; summary.setAttribute('aria-label', 'About player coverage');
  const panel = document.createElement('div'); panel.className = 'player-coverage-explanation';
  const title = document.createElement('strong'); title.textContent = 'Room to respond';
  const description = document.createElement('p'); description.id = 'playerCoverageDescription';
  description.textContent = 'The sectors follow each player’s position, facing and the ball. They suggest space to cover, not a guaranteed reach or a legal shot.';
  const key = document.createElement('div'); key.className = 'player-coverage-key';
  for (const [team, text] of [['green', 'Green · solid edge'], ['orange', 'Orange · broken edge'], ['shared', 'Shared · call it']]) {
    const item = document.createElement('span'); item.className = `player-coverage-key-${team}`; item.textContent = text; key.append(item);
  }
  const note = document.createElement('p'); note.textContent = 'The faded edge needs more movement and time. The small inner mark shows the paddle-hand side; backhands remain available. In shared space, one player takes the ball while the partner covers.';
  const scope = document.createElement('small'); scope.textContent = 'Illustrative 116° / 9 ft guide. Ball height, pace, balance and bounce / kitchen rules still matter.';
  panel.append(title, description, key, note, scope); help.append(summary, panel); root.append(button, legend, help);
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
