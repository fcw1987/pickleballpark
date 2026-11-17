import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulateRally, runNaturalAttemptV1 } from '../rally-engine.js';
import { createEngineDriverV1 } from '../rally-engine-driver.js';
import { rankContactOpportunitiesV1 } from '../rally-contact-selection.js';
import { assertFreshPhysicalResult, assertFixedExecutionPairs } from './helpers/rally-procedural-proof.mjs';

// Inspect the production-private allocator without adding a runtime test API.
const engineURL = new URL('../rally-engine.js', import.meta.url);
const source = readFileSync(engineURL, 'utf8').replace(
  /from (['"])(\.\/[^'"]+)\1/g,
  (_all, _quote, path) => 'from ' + JSON.stringify(new URL(path, engineURL).href));
const { contactOpportunityIdV1 } = await import('data:text/javascript;base64,'
  + Buffer.from(source + '\nexport { contactOpportunityIdV1 };').toString('base64'));
const fixture = JSON.parse(readFileSync(new URL(
  './fixtures/model2/generated-time-refinement-witnesses-v1.json', import.meta.url), 'utf8'));
const key = 'groundstroke:1.293695624:12.979938630125005:13.303461974949473:1.4622471383079927';

test('oversized exact keys get stable local identifiers without changing ordinary identifiers', () => {
  const aliases = new Map(), boundary = key.slice(0, 80);
  assert.equal(key.length, 81);
  assert.equal(contactOpportunityIdV1(boundary, aliases), boundary);
  const ordinary = 'volley:0.125:10:14:3';
  assert.equal(contactOpportunityIdV1(ordinary, aliases), ordinary);
  assert.equal(aliases.size, 0);
  const first = contactOpportunityIdV1(key, aliases);
  assert.match(first, /^refined-opportunity:\d+$/);
  assert(first.length <= 80);
  assert.equal(contactOpportunityIdV1(key, aliases), first);
  assert.deepEqual([...aliases.keys()], [key], 'The full coordinate key remains the grouping identity.');
  const other = key.replace('1.4622471383079927', '1.4622471383079929');
  assert.notEqual(contactOpportunityIdV1(other, aliases), first);
  assert.deepEqual([...aliases.keys()], [key, other]);
  const repeated = new Map();
  assert.deepEqual([key, other, key].map(value => contactOpportunityIdV1(value, repeated)),
    [key, other, key].map(value => contactOpportunityIdV1(value, aliases)));
});

test('distinct sub-nanofeet contacts remain distinct opportunities and the 80-character validator stays strict', () => {
  const aliases = new Map(), time = 1.293695624;
  const contacts = [
    { x: 12.979938630125005, y: 13.303461974949473, heightFeet: 1.4622471383079927 },
    { x: 12.979938630125005, y: 13.303461974949473, heightFeet: 1.4622471383079929 },
  ];
  assert.notEqual(contacts[0].heightFeet, contacts[1].heightFeet);
  assert.equal(Math.round(contacts[0].heightFeet * 1e9), Math.round(contacts[1].heightFeet * 1e9));
  const players = { player1: { team: 'green', handedness: 'right' } };
  const positions = { player1: { x: 13, y: 14 } }, stance = { x: 13, y: 14 };
  const candidates = contacts.map((contact, sourceIndex) => ({
    opportunityId: contactOpportunityIdV1(['groundstroke', time, contact.x, contact.y, contact.heightFeet].join(':'), aliases),
    actorId: 'player1', sourceIndex, kind: 'groundstroke', contact, availableSeconds: time,
    stance, recoveryPosition: stance, contactFeet: [{ x: 12.28, y: 14 }, { x: 13.72, y: 14 }],
    feasibleReplyIds: ['reset'], attackingReplyAvailable: false,
    audit: { legal: true, routeValid: true, feetValid: true, peakFeetPerSecond: 10, minimumSpacingFeet: 5 },
  }));
  const before = JSON.stringify(candidates);
  const result = rankContactOpportunitiesV1({ players, positions, eligible: ['player1'], candidates });
  assert.equal(result.ranked.length, 2);
  assert.equal(new Set(result.ranked.map(row => row.opportunityId)).size, 2);
  assert.deepEqual(result.ranked.map(row => row.contact.heightFeet).sort(),
    contacts.map(contact => contact.heightFeet).sort());
  assert.equal(JSON.stringify(candidates), before);
  assert.throws(() => rankContactOpportunitiesV1({
    players, positions, eligible: ['player1'], candidates: [{ ...candidates[0], opportunityId: key }],
  }), /opportunityId must be a bounded identifier/);
});

function collectIds(value, ids = []) {
  if (!value || typeof value !== 'object') return ids;
  for (const [name, item] of Object.entries(value)) {
    if (name === 'opportunityId' || name.endsWith('OpportunityId')) ids.push(item);
    else collectIds(item, ids);
  }
  return ids;
}

for (const row of fixture.cases.filter(item => item.input.seed === 50293)) {
  test(row.id + ' accepts full-precision refinement with bounded IDs and no extra execution draws', async () => {
    let executionCalls = 0;
    const simulate = createEngineDriverV1((input, controls) => runNaturalAttemptV1(input, {
      ...controls, random: { ...controls.random, execution: () => {
        executionCalls++;
        return controls.random.execution();
      } },
    }), { yieldControl: async () => {} });
    const result = await simulate(row.input);
    assert.equal(result.status, 'complete', result.diagnostics.message ?? result.diagnostics.code);
    assertFreshPhysicalResult(result);
    assertFixedExecutionPairs(result);
    assert.deepEqual(result.decisions.slice(0, row.prefixDraws.length).map(decision => decision.draws), row.prefixDraws);
    assert.equal(executionCalls, result.decisions.length * 2);
    const ids = result.decisions.flatMap(decision => collectIds(decision.situation.contactSelection));
    assert(ids.some(id => id.startsWith('refined-opportunity:')), 'The actual oversized-key branch is exercised.');
    assert(ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 80
      && !/[<>\u0000-\u001f\u007f]/.test(id)));
    for (const decision of result.decisions) {
      const evidence = decision.situation.contactSelection.evidence;
      if (!evidence) continue;
      const rankedIds = [evidence.chosen, ...evidence.alternatives].map(candidate => candidate.opportunityId);
      assert.equal(new Set(rankedIds).size, rankedIds.length, 'Different ranked opportunities must not share an ID.');
    }
    const repeated = await simulateRally(row.input);
    assert.equal(repeated.status, 'complete');
    assert.deepEqual(repeated.document, result.document);
    assert.deepEqual(repeated.decisions, result.decisions);
  });
}

test('ordinary contact IDs retain their exact existing point/time spelling', async () => {
  const result = await simulateRally({ seed: 50000, options: { maxShots: 3 } });
  assert.equal(result.status, 'censored');
  for (const decision of result.decisions.slice(1)) {
    const chosen = decision.situation.contactSelection.evidence.chosen;
    assert.equal(chosen.opportunityId, [chosen.kind, chosen.availableSeconds,
      chosen.contact.x, chosen.contact.y, chosen.contact.heightFeet].join(':'));
  }
});
