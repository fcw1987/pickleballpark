// Selected policy for NEW generated routes, not a universal human maximum.
// Public authored motion and historical speed-only inspection remain separate.
export const GENERATION_MOTION_V1 = Object.freeze({
  version: 'generation-motion-v1',
  peakFeetPerSecond: 18,
  accelerationFeetPerSecondSquared: 30,
  scope: 'selected-generation-policy',
});

/** A rest-to-rest quadratic ease travels D in T with peak speed 2D/T and
 * acceleration magnitude 4D/T^2. Both selected bounds must hold. */
export function generationDistanceBudgetV1(seconds, peakFeetPerSecond = GENERATION_MOTION_V1.peakFeetPerSecond) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError('Generated movement duration must be finite and nonnegative.');
  if (!Number.isFinite(peakFeetPerSecond) || peakFeetPerSecond < 0 || peakFeetPerSecond > GENERATION_MOTION_V1.peakFeetPerSecond) {
    throw new TypeError('Generated peak speed must be in [0,18] ft/s.');
  }
  return Math.min(peakFeetPerSecond * seconds / 2, GENERATION_MOTION_V1.accelerationFeetPerSecondSquared * seconds * seconds / 4);
}
