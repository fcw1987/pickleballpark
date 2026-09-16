// Stable presentation names for immutable player ids.
// Left and right are defined from each team's starting end of the court. The
// fallback is id ordered so stacked or centerline layouts never rename an
// athlete when the camera or rally changes.

const PLAYER_IDS = Object.freeze(['player1', 'player2', 'player3', 'player4']);
const TEAM_IDS = Object.freeze({ green: ['player1', 'player2'], orange: ['player3', 'player4'] });

function startingPoint(document, id) {
  const value = document?.initialLayout?.[id];
  const point = value?.target || value;
  return point && Number.isFinite(Number(point.x)) ? { x: Number(point.x), y: Number(point.y) } : null;
}

function title(value) { return value.charAt(0).toUpperCase() + value.slice(1); }

function teamLabels(document, team) {
  const ids = TEAM_IDS[team];
  const points = ids.map(id => ({ id, point: startingPoint(document, id) }));
  const distinctSides = points.every(item => item.point && Math.abs(item.point.x - 10) > 0.001)
    && Math.sign(points[0].point.x - 10) !== Math.sign(points[1].point.x - 10);
  const leftIsLowX = team === 'green';
  const ordered = distinctSides
    ? [...points].sort((a, b) => (leftIsLowX ? a.point.x - b.point.x : b.point.x - a.point.x) || a.id.localeCompare(b.id))
    : [...points].sort((a, b) => a.id.localeCompare(b.id));
  return { [ordered[0].id]: `${title(team)} Left`, [ordered[1].id]: `${title(team)} Right` };
}

export function getPlayerLabels(document) {
  return { ...teamLabels(document, 'green'), ...teamLabels(document, 'orange') };
}

export function playerLabel(id, document) {
  return getPlayerLabels(document)[id] || id || 'Automatic';
}

export function playerChoices(document) {
  const labels = getPlayerLabels(document);
  return PLAYER_IDS.map(id => [id, labels[id]]);
}

export { PLAYER_IDS };
