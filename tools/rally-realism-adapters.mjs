import { proposeRandomRally, GENERATOR_LIMITS } from '../smart-rally-generator.js';
import { SMART_GENERATOR_VERSION, compileEffectiveCandidate } from '../rally-proposals.js';
import { validateDocument } from '../play-document.js';
import { validateRallyRules } from '../rally-rules.js';

export const legacyAdapter = Object.freeze({
  name: 'legacy-exact-hits', version: SMART_GENERATOR_VERSION,
  limits: GENERATOR_LIMITS,
  validate: validateDocument, compile: compileEffectiveCandidate, rules: validateRallyRules,
  async generate({ seed, settings, signal }) {
    const result = await proposeRandomRally({ length: settings.length, seed, signal });
    if (!result.ok || !result.document) throw Error(result.reason ?? 'Legacy generator returned no document');
    return { document: result.document, censored: true, outcome: null };
  },
});
