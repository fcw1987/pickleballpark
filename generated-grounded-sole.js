// Selected generation geometry for a planted sole, centered at the represented
// bottom-sole point. The court-facing yaw is 0 near / PI far, with zero pitch;
// both orientations have this same ground-contact enclosure. This is not a
// moving-shoe, airborne, balance or volley-momentum officiating model.
export const GENERATED_GROUNDED_SOLE_V1 = Object.freeze({
  version: 'generated-grounded-sole-v1',
  scope: 'planted-contact-only',
  halfWidthMetres: .0525,
  halfDepthMetres: .135,
  halfWidthFeet: .0525 / .3048,
  halfDepthFeet: .135 / .3048,
  // Proposal inset only. Actual contact checks below use the rule boundaries,
  // without treating this inset as extra space or a rule tolerance.
  plannerInsetFeet: 1e-5,
});

const point = foot => {
  if (!foot || !Number.isFinite(foot.x) || !Number.isFinite(foot.y)) throw new TypeError('A planted sole requires finite board coordinates.');
  return foot;
};

export function groundedSoleBoundsV1(foot) {
  point(foot);
  const { halfWidthFeet: halfX, halfDepthFeet: halfY } = GENERATED_GROUNDED_SOLE_V1;
  return Object.freeze({ minX: foot.x - halfX, maxX: foot.x + halfX, minY: foot.y - halfY, maxY: foot.y + halfY });
}

export function groundedSoleClearsNVZV1(foot) {
  point(foot);
  const { halfWidthFeet: halfX, halfDepthFeet: halfY } = GENERATED_GROUNDED_SOLE_V1;
  // Compare centers against the expanded closed zone. Equality is contact
  // with its boundary, not clearance; no root/foot coordinates are adjusted.
  return foot.x < -halfX || foot.x > 20 + halfX || foot.y < 15 - halfY || foot.y > 29 + halfY;
}

export function groundedSoleClearsServeV1(foot, { team, court } = {}) {
  point(foot);
  if (!['green', 'orange'].includes(team) || !['right', 'left'].includes(court)) throw new TypeError('Planted serve soles require a team and declared server-facing court.');
  const { halfWidthFeet: halfX, halfDepthFeet: halfY } = GENERATED_GROUNDED_SOLE_V1;
  const near = team === 'green', minX = near === (court === 'right') ? 0 : 10, maxX = minX + 10;
  // A sole may touch an imaginary lateral extension but may not pass outside
  // it. The physical baseline is different: touching it is not clearance.
  return foot.x >= minX + halfX && foot.x <= maxX - halfX
    && (near ? foot.y < -halfY : foot.y > 44 + halfY);
}
