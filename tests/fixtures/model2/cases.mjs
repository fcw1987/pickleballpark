import { readFileSync } from 'node:fs';

export const MODEL2_CASES = Object.freeze([
  ['net', 'net'], ['long', 'long'], ['wide', 'wide'], ['second-bounce', 'second-bounce'],
  ['body', 'body'], ['nvz-foot', 'nvz-foot'], ['nvz-momentum-after-dead', 'nvz-momentum'],
  ['earlier-momentum-overrides-later-fault', 'nvz-momentum'],
  ['opening-return-volley', 'two-bounce'], ['opening-third-volley', 'two-bounce'],
  ['serve-hits-server-partner', 'body'], ['serve-hits-receiver-partner', 'body'],
  ['transition-volley', null], ['variable-bounced-contact', null], ['erne', null],
  ['around-the-post', null], ['unreachable', 'unreachable']
].map(([id, reason]) => Object.freeze({ id, reason })));

export function readModel2Fixture(id = 'net') {
  if (!MODEL2_CASES.some(item => item.id === id)) throw new RangeError(`Unknown model2 fixture: ${id}`);
  return JSON.parse(readFileSync(new URL(`./${id}.json`, import.meta.url), 'utf8'));
}
