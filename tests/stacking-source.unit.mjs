import test from 'node:test';
import assert from 'node:assert/strict';
import { STACKING_VERSION, validateStackingV1, normalizeStackingV1, stackingTeamPlanV1, createDefaultStackingLayoutV1 } from '../rally-stacking.js';
import { normalizeRallyInputV1 } from '../rally-recipe.js';

const players = normalizeRallyInputV1({ seed: 1 }).players;
const config = (green = 'full', orange = 'full') => ({ version: STACKING_VERSION, teams: {
  ...(green ? { green: { mode: green, leftPlayer: 'player1' } } : {}),
  ...(orange ? { orange: { mode: orange, leftPlayer: 'player3' } } : {})
} });
const copy = value => structuredClone(value);
const service = { server: 'player1', receiver: 'player3', court: 'right', courtConvention: 'server-perspective-v1' };

test('stacking is strict, optional and never mutates or inserts settings in saved source', () => {
  assert.equal(validateStackingV1(undefined, players), undefined);
  assert.equal(normalizeStackingV1(undefined, players), undefined);
  const source = config(), before = JSON.stringify(source);
  assert.equal(validateStackingV1(source, players), source);
  const normalized = normalizeStackingV1(source, players);
  assert.deepEqual(normalized, source); assert.notEqual(normalized, source);
  assert.ok(Object.isFrozen(normalized.teams.green));
  assert.equal(JSON.stringify(source), before);
  const reversed = { teams: { orange: { leftPlayer: 'player3', mode: 'full' }, green: { leftPlayer: 'player1', mode: 'full' } }, version: STACKING_VERSION };
  assert.equal(JSON.stringify(normalizeStackingV1(reversed, players)), JSON.stringify(normalized));
  for (const mutation of [
    value => { value.version = 'stacking-v2'; }, value => { value.teams.green.mode = 'off'; },
    value => { value.teams.green.leftPlayer = 'player3'; }, value => { value.score = 3; },
    value => { value.teams.green.rightPlayer = 'player2'; }, value => { value.teams.blue = {}; },
    value => { value.teams = {}; }, value => { value.teams.green = null; },
    value => { delete value.teams.green.leftPlayer; },
  ]) { const bad = copy(source); mutation(bad); assert.throws(() => validateStackingV1(bad, players), TypeError); }
  const accessor = config();
  Object.defineProperty(accessor.teams.green, 'mode', { enumerable: true, get() { throw Error('must not evaluate'); } });
  assert.throws(() => validateStackingV1(accessor, players), /accessor/);
  assert.throws(() => validateStackingV1(Object.assign(Object.create({ inherited: true }), source), players), /plain object/);
});

test('side preferences mirror by team, not screen orientation, current position or handedness', () => {
  for (const team of ['green', 'orange']) for (const leftPlayer of Object.keys(players).filter(id => players[id].team === team)) {
    for (const hand of ['right', 'left']) {
      const roster = copy(players); for (const actor of Object.values(roster)) actor.handedness = hand;
      const stacking = { version: STACKING_VERSION, teams: { [team]: { mode: 'full', leftPlayer } } };
      const value = stackingTeamPlanV1({ stacking, players: roster, team, service, index: 5 });
      assert.equal(value.leftPlayer, leftPlayer);
      assert.equal(value.lanes[team === 'green' ? 1 : 0], leftPlayer);
      assert.notEqual(value.leftPlayer, value.rightPlayer);
      assert.equal(value.phase, 'preferred-sides'); assert.equal(value.usePreferredLanes, true);
      assert.ok(Object.isFrozen(value.lanes));
    }
  }
});

test('half stacks apply only to the declared serving team and never invent a midrally role', () => {
  for (const servingTeam of ['green', 'orange']) {
    const actualService = servingTeam === 'green' ? service : { ...service, server: 'player4', receiver: 'player2' };
    for (const team of ['green', 'orange']) for (const index of [0, 1, 2, 8]) {
      const result = stackingTeamPlanV1({ stacking: config('serve-only', 'serve-only'), players, team, service: actualService, index });
      assert.equal(result !== null, team === servingTeam);
      if (result) assert.equal(result.protectOpeningDepth, index < 2);
    }
  }
  assert.equal(stackingTeamPlanV1({ stacking: config('serve-only', null), players, team: 'green', service: {}, index: 0 }), null);
  assert.equal(stackingTeamPlanV1({ stacking: config('serve-only', null), players, team: 'green', service, opening: 'midrally' }), null);
  const full = stackingTeamPlanV1({ stacking: config(), players, team: 'green', service, opening: 'midrally' });
  assert.equal(full.usePreferredLanes, true); assert.equal(full.protectOpeningDepth, false);
  const unknown = stackingTeamPlanV1({ stacking: config(), players, team: 'green', service: {} });
  assert.equal(unknown.phase, 'unknown-service'); assert.equal(unknown.usePreferredLanes, false);
  for (const unknownService of [{ server: 'player1' }, { receiver: 'player3' }, { server: 'player1', receiver: 'player2' }]) {
    const unknown = stackingTeamPlanV1({ stacking: config(), players, team: 'green', service: unknownService });
    assert.equal(unknown.phase, 'unknown-service'); assert.equal(unknown.usePreferredLanes, false);
    assert.equal(stackingTeamPlanV1({ stacking: config('serve-only', null), players, team: 'green', service: unknownService }), null);
  }
});

test('full stacking waits for the designated return before unwinding the receiving pair', () => {
  const initial = stackingTeamPlanV1({ stacking: config(), players, team: 'orange', service, index: 0 });
  assert.equal(initial.phase, 'waiting-for-return'); assert.equal(initial.usePreferredLanes, false); assert.equal(initial.holdOpeningFormation, true);
  const after = stackingTeamPlanV1({ stacking: config(), players, team: 'orange', service, index: 1 });
  assert.equal(after.phase, 'return-unwind'); assert.equal(after.usePreferredLanes, true); assert.equal(after.protectOpeningDepth, false);
  assert.equal(stackingTeamPlanV1({ stacking: undefined, players, team: 'orange', service }), null);
  for (const index of [-1, .5, 99, NaN]) assert.throws(() => stackingTeamPlanV1({ stacking: config(), players, team: 'green', service, index }), /index/);
});

test('traditional default setups cover both ends/courts, every role identity, both hands and preferred sides', () => {
  for (const server of Object.keys(players)) for (const receiver of Object.keys(players).filter(id => players[id].team !== players[server].team)) {
    for (const court of ['right', 'left']) for (const hand of ['right', 'left']) for (const swap of [false, true]) {
      const roster = copy(players); for (const actor of Object.values(roster)) actor.handedness = hand;
      const normalized = normalizeRallyInputV1({ seed: 1, players: roster, service: { server, receiver, court } });
      const servingTeam = roster[server].team, receivingTeam = roster[receiver].team;
      const serverPartner = Object.keys(roster).find(id => id !== server && roster[id].team === servingTeam);
      const receiverPartner = Object.keys(roster).find(id => id !== receiver && roster[id].team === receivingTeam);
      const preferredCourt = swap ? (court === 'left' ? 'right' : 'left') : court;
      const stacking = { version: STACKING_VERSION, teams: {
        [servingTeam]: { mode: 'full', leftPlayer: preferredCourt === 'left' ? server : serverPartner },
        [receivingTeam]: { mode: 'full', leftPlayer: preferredCourt === 'left' ? receiver : receiverPartner },
      } };
      const input = { layout: normalized.layout, players: roster, service: normalized.service, stacking }, before = JSON.stringify(input);
      const output = createDefaultStackingLayoutV1(input);
      assert.deepEqual(output[server], normalized.layout[server]); assert.deepEqual(output[receiver], normalized.layout[receiver]);
      assert.deepEqual(output.ball, normalized.layout.ball); assert.equal(JSON.stringify(input), before);
      if (!swap) assert.deepEqual(output, normalized.layout);
      else {
        const a = output[server], b = output[serverPartner];
        assert.equal(a.y, b.y); assert.equal(Math.abs(a.x - b.x), 4);
        assert.ok(a.x < 10 ? b.x < a.x : b.x > a.x);
        const partner = output[receiverPartner];
        assert.ok(partner.x < 0 || partner.x > 20);
        assert.equal(partner.y, receivingTeam === 'green' ? 14.25 : 29.75);
        for (const value of Object.values(output)) assert.ok(value.x >= -8 && value.x <= 28 && value.y >= -8 && value.y <= 52);
      }
    }
  }
});

test('half-stack defaults leave the receiving team untouched and invalid source geometry is not silently clipped', () => {
  const normalized = normalizeRallyInputV1({ seed: 1 });
  const output = createDefaultStackingLayoutV1({ ...normalized, layout: normalized.layout, stacking: config('serve-only', 'serve-only') });
  assert.deepEqual(output.player3, normalized.layout.player3); assert.deepEqual(output.player4, normalized.layout.player4);
  const bad = copy(normalized); bad.layout.player1.x = -9;
  assert.throws(() => createDefaultStackingLayoutV1({ ...bad, stacking: config() }), /apron/);
  assert.throws(() => createDefaultStackingLayoutV1({ ...normalized, service: {}, stacking: config() }), /declared/);
});
