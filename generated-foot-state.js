// Explicit opt-in for newly generated stationary grounded ready stances.
// Absence retains the historical model-2 fallback. Contact and momentum feet
// remain source evidence, never a cue to infer or repair this contract.
export const GENERATED_DEFAULT_FOOT_STATE_V1 = Object.freeze({ version: 'generated-ready-stance-v1' });

export function validateDefaultFootStateV1(value) {
  if (value === undefined) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError('defaultFootState must be an inert versioned object.');
  }
  const keys = Reflect.ownKeys(value), descriptor = Object.getOwnPropertyDescriptor(value, 'version');
  if (keys.length !== 1 || keys[0] !== 'version' || !descriptor?.enumerable
    || !Object.hasOwn(descriptor, 'value') || descriptor.value !== GENERATED_DEFAULT_FOOT_STATE_V1.version) {
    throw new TypeError('defaultFootState requires only version: generated-ready-stance-v1.');
  }
  return value;
}

export function defaultFootHalfWidthFeetV1(value) {
  validateDefaultFootStateV1(value);
  return value === undefined ? .42 : .72;
}

export function defaultFeetAtV1(position, value) {
  const half = defaultFootHalfWidthFeetV1(value);
  return [{ x: position.x - half, y: position.y }, { x: position.x + half, y: position.y }];
}
