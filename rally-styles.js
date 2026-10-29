// Versioned policy priors. These are instructional parameters, not measured
// player ratings or a claim that a generated cohort meets calibration bands.
export const STYLE_VERSION = 'rally-profiles-v1';
export const STYLE_IDS = Object.freeze(['pro', 'advanced', 'intermediate', 'beginner']);
export const FLAVOUR_IDS = Object.freeze(['balanced', 'bangers', 'kitchen-masters', 'lobbers']);
export const EXECUTION_PHASES = Object.freeze(['serve', 'return', 'third', 'transition', 'kitchen', 'hands', 'scramble']);

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const BASE_WEIGHTS = {
  serve: { 'serve-deep-middle': 55, 'serve-backhand': 35, 'serve-short-angle': 8 },
  return: { 'return-deep-middle': 50, 'return-backhand': 40, 'return-short': 10 },
  third: { 'third-shot-drop': 60, 'third-shot-drive': 38, lob: 2 },
  fourthDrop: { 'cross-court-dink': 65, reset: 20, 'speed-up': 15 },
  fourthDrive: { block: 40, reset: 20, counter: 35, 'let-go': 5 },
  // The PPA fifth-shot cohort follows third-shot drives, regardless of whether
  // the fourth contact was specifically a block. Metrics retain both cohorts.
  fifthDrive: { drop: 66, 'firm-volley': 31, drive: 2, lob: 1 },
  transitionLow: { reset: 80, drive: 15, lob: 5 },
  transitionHigh: { drive: 70, reset: 30 },
  kitchen: { 'cross-court-dink': 40, 'middle-dink': 30, 'straight-dink': 15, 'backhand-dink': 10, lob: 3, 'speed-up': 2 },
  hands: { counter: 45, block: 20, reset: 15, 'put-away': 20 },
  lobDefence: { overhead: 70, drop: 20, lob: 10 }
};
const execution = rows => Object.fromEntries(EXECUTION_PHASES.map((phase, index) => {
  const [error, attackable, excellent, low] = rows[index];
  return [phase, { error, attackable, excellent, low }];
}));
const profile = (id, label, skill, overrides, rows, pressureErrorScale, signature) => ({
  id, label, version: STYLE_VERSION, skill,
  weights: { ...BASE_WEIGHTS, ...overrides }, execution: execution(rows),
  pressureErrorScale, errorWeights: { net: .45, long: .35, wide: .2 }, signature
});

export const STYLE_PROFILES = freeze({
  pro: profile('pro', 'Pro', .95, {}, [
    [.006, .01, .12, .07], [.018, .02, .10, .08], [.045, .08, .13, .15],
    [.10, .12, .10, .20], [.14, .11, .12, .18], [.18, .15, .13, .05], [.12, .17, .07, .12]
  ], .15, { erneWeight: 4, aroundPostWeight: 1 }),
  advanced: profile('advanced', 'Advanced 4.0', .8, {
    third: { 'third-shot-drop': 50, 'third-shot-drive': 48, lob: 2 },
    kitchen: { 'cross-court-dink': 40, 'middle-dink': 28, 'straight-dink': 14, 'backhand-dink': 9, lob: 5, 'speed-up': 4 }
  }, [
    [.012, .03, .08, .08], [.03, .06, .08, .10], [.09, .13, .09, .15],
    [.16, .16, .08, .18], [.22, .15, .08, .16], [.24, .18, .10, .05], [.18, .20, .05, .10]
  ], .17, { erneWeight: 3, aroundPostWeight: .7 }),
  intermediate: profile('intermediate', 'Intermediate 3.0', .63, {
    third: { 'third-shot-drop': 48, 'third-shot-drive': 49, lob: 3 },
    kitchen: { 'cross-court-dink': 37, 'middle-dink': 27, 'straight-dink': 15, 'backhand-dink': 9, lob: 8, 'speed-up': 4 }
  }, [
    [.025, .04, .05, .08], [.05, .08, .05, .09], [.14, .17, .06, .13],
    [.20, .19, .05, .15], [.28, .20, .05, .14], [.29, .20, .07, .04], [.22, .24, .03, .08]
  ], .19, { erneWeight: 1, aroundPostWeight: .25 }),
  beginner: profile('beginner', 'Beginner', .35, {
    third: { 'third-shot-drop': 35, 'third-shot-drive': 60, lob: 5 },
    kitchen: { 'cross-court-dink': 30, 'middle-dink': 23, 'straight-dink': 16, 'backhand-dink': 9, lob: 14, 'speed-up': 8 }
  }, [
    [.065, .06, .025, .08], [.09, .11, .025, .08], [.22, .21, .03, .10],
    [.23, .23, .025, .11], [.20, .25, .025, .11], [.32, .23, .04, .03], [.30, .28, .02, .07]
  ], .22, { erneWeight: .5, aroundPostWeight: .1 })
});

export const FLAVOUR_PROFILES = freeze({
  balanced: { id: 'balanced', multipliers: {} },
  bangers: { id: 'bangers', multipliers: { 'third-shot-drive': 1.6, drive: 1.6, counter: 1.25, 'speed-up': 1.6, 'third-shot-drop': .75, drop: .75, 'cross-court-dink': .7, 'middle-dink': .7, lob: .7 } },
  'kitchen-masters': { id: 'kitchen-masters', multipliers: { 'third-shot-drop': 1.35, drop: 1.35, reset: 1.3, 'cross-court-dink': 1.5, 'middle-dink': 1.5, 'straight-dink': 1.5, 'backhand-dink': 1.5, 'third-shot-drive': .7, drive: .7, 'speed-up': .7, lob: .7 } },
  lobbers: { id: 'lobbers', multipliers: { lob: 3, overhead: 1.1, 'third-shot-drive': .8, drive: .8 } }
});

const assertNumber = (number, min, max, name) => {
  if (!Number.isFinite(number) || number < min || number > max) throw new TypeError(`${name} must be finite between ${min} and ${max}.`);
};
export function validateStyleProfile(value) {
  if (!value || typeof value !== 'object' || !STYLE_IDS.includes(value.id) || value.version !== STYLE_VERSION) throw new TypeError('A supported versioned style profile is required.');
  if (Object.keys(value).some(key => !['id', 'label', 'version', 'skill', 'flavour', 'weights', 'execution', 'pressureErrorScale', 'errorWeights', 'signature'].includes(key))) throw new TypeError('Unsupported style profile field.');
  if (typeof value.label !== 'string' || !value.label.length || value.label.length > 40 || /[<>\u0000-\u001f\u007f]/.test(value.label)) throw new TypeError('A bounded plain style label is required.');
  if (value.flavour !== undefined && !FLAVOUR_IDS.includes(value.flavour)) throw new TypeError('Unsupported style flavour.');
  assertNumber(value.skill, 0, 1, 'skill');
  assertNumber(value.pressureErrorScale, 0, 1, 'pressureErrorScale');
  for (const [row, expected] of Object.entries(BASE_WEIGHTS)) {
    const weights = value.weights?.[row];
    if (!weights || Object.keys(weights).some(key => !(key in expected)) || Object.keys(expected).some(key => !(key in weights))) throw new TypeError(`weights.${row} must retain the policy's supported candidate identities.`);
    for (const [id, weight] of Object.entries(weights)) assertNumber(weight, 0, 1000, `weights.${row}.${id}`);
    if (Object.values(weights).every(weight => weight === 0)) throw new TypeError(`weights.${row} must contain a positive candidate.`);
  }
  if (Object.keys(value.weights || {}).some(row => !(row in BASE_WEIGHTS))) throw new TypeError('Unsupported policy weight context.');
  for (const phase of EXECUTION_PHASES) {
    const probabilities = value.execution?.[phase];
    if (!probabilities || Object.keys(probabilities).some(key => !['error', 'attackable', 'excellent', 'low'].includes(key))) throw new TypeError(`execution.${phase} must contain supported quality probabilities.`);
    for (const key of ['error', 'attackable', 'excellent', 'low']) assertNumber(probabilities[key], 0, 1, `execution.${phase}.${key}`);
    if (Object.values(probabilities).reduce((a, b) => a + b, 0) > 1 + 1e-12) throw new TypeError(`execution.${phase} probabilities must not exceed one.`);
  }
  if (Object.keys(value.execution || {}).some(phase => !EXECUTION_PHASES.includes(phase))) throw new TypeError('Unsupported execution phase.');
  const errorWeights = value.errorWeights;
  if (!errorWeights || Object.keys(errorWeights).sort().join(',') !== 'long,net,wide') throw new TypeError('Error weights must name net, long and wide.');
  for (const [reason, probability] of Object.entries(errorWeights)) assertNumber(probability, 0, 1, `errorWeights.${reason}`);
  if (Math.abs(Object.values(errorWeights).reduce((a, b) => a + b, 0) - 1) > 1e-12) throw new TypeError('Error weights must sum to one.');
  if (!value.signature || Object.keys(value.signature).sort().join(',') !== 'aroundPostWeight,erneWeight') throw new TypeError('Unsupported signature weight field.');
  for (const name of ['erneWeight', 'aroundPostWeight']) assertNumber(value.signature[name], 0, 100, `signature.${name}`);
  return value;
}

const resolved = new Map();
for (const style of STYLE_IDS) for (const flavour of FLAVOUR_IDS) {
  const base = STYLE_PROFILES[style], multipliers = FLAVOUR_PROFILES[flavour].multipliers;
  const weights = Object.fromEntries(Object.entries(base.weights).map(([row, values]) => [row,
    Object.fromEntries(Object.entries(values).map(([id, weight]) => [id, weight * (multipliers[id] ?? 1)]))]));
  const value = freeze({ ...base, flavour, weights });
  validateStyleProfile(value); resolved.set(`${style}/${flavour}`, value);
}

/** Skill and flavour are independent inputs; an alias never silently changes a recipe. */
export function resolveStyle(style = 'advanced', flavour = 'balanced') {
  if (!STYLE_IDS.includes(style)) throw new TypeError(`Unsupported rally style: ${String(style)}.`);
  if (!FLAVOUR_IDS.includes(flavour)) throw new TypeError(`Unsupported rally flavour: ${String(flavour)}.`);
  return resolved.get(`${style}/${flavour}`);
}
