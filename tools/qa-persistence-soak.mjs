import assert from 'node:assert/strict';
import { DraftStore, EditHistory, MAX_JSON_BYTES, STORAGE_KEY } from '../builder-storage.js';
import { createStarterDocument, validateDocument, MAX_SHOTS } from '../play-document.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const copy = value => structuredClone(value);
const encoded = value => JSON.stringify(value);
const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
};
const seedCount = argument('--seeds', 32);
const stepCount = argument('--steps', 500);
assert(Number.isInteger(seedCount) && seedCount > 0, '--seeds must be a positive integer');
assert(Number.isInteger(stepCount) && stepCount > 0, '--steps must be a positive integer');

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function mutate(document, random, step) {
  const next = copy(document);
  const pick = values => values[Math.floor(random() * values.length)];
  const shot = pick(next.shots);
  switch (Math.floor(random() * 14)) {
    case 0: next.title = `Soak ${step}-${Math.floor(random() * 1e6)}`; break;
    case 1: shot.target.x = Math.round(random() * 2000) / 100; break;
    case 2: shot.target.y = Math.round(random() * 4400) / 100; break;
    case 3: shot.arc = pick(['low', 'medium', 'high']); break;
    case 4: shot.pace = pick(['soft', 'medium', 'firm']); break;
    case 5: shot.contactStyle = pick(['auto', 'forehand', 'backhand', 'short-hop']); break;
    case 6: {
      const player = pick(['player1', 'player2', 'player3', 'player4']);
      next.players[player].handedness = next.players[player].handedness === 'left' ? 'right' : 'left';
      break;
    }
    case 7: next.assistance.showGuides = !next.assistance.showGuides; break;
    case 8: next.assistance.autoShading = !next.assistance.autoShading; break;
    case 9: {
      shot.movement = {
        intent: 'manual', pinned: random() > 0.5,
        target: { x: Math.round(random() * 2800) / 100 - 4, y: Math.round(random() * 5200) / 100 - 4 },
        waypoints: [{ x: 1 + random() * 18, y: 1 + random() * 42 }]
      };
      break;
    }
    case 10:
      if (next.shots.length < MAX_SHOTS) {
        const added = copy(next.shots.at(-1));
        added.id = `soak-${step}-${Math.floor(random() * 1e9)}`;
        next.shots.push(added);
      }
      break;
    case 11: if (next.shots.length > 1) next.shots.splice(Math.floor(random() * next.shots.length), 1); break;
    case 12: {
      if (next.shots.length > 1) {
        const from = Math.floor(random() * next.shots.length);
        const to = Math.floor(random() * next.shots.length);
        next.shots.splice(to, 0, next.shots.splice(from, 1)[0]);
      }
      break;
    }
    case 13:
      next.intentionalFault = !next.intentionalFault;
      next.ending = pick(['stop', 'winner', 'fault']);
      break;
  }
  validateDocument(next);
  return next;
}

let totalMutations = 0;
let totalUndos = 0;
let totalRedos = 0;
let persistenceChecks = 0;

for (let seed = 1; seed <= seedCount; seed += 1) {
  const random = generator(seed * 0x9e3779b1);
  const storage = new MemoryStorage();
  const store = new DraftStore({ storage, validate: validateDocument });
  const history = new EditHistory(createStarterDocument(), { limit: 40 });
  const model = [encoded(history.current)];
  let index = 0;

  for (let step = 0; step < stepCount; step += 1) {
    const roll = random();
    if (roll < 0.2 && index > 0) {
      history.undo();
      index -= 1;
      totalUndos += 1;
    } else if (roll < 0.32 && index < model.length - 1) {
      history.redo();
      index += 1;
      totalRedos += 1;
    } else {
      const next = mutate(history.current, random, step);
      history.commit(next);
      model.splice(index + 1);
      model.push(encoded(next));
      if (model.length > 41) model.shift();
      index = model.length - 1;
      totalMutations += 1;
    }
    assert.equal(encoded(history.current), model[index], `history mismatch at seed ${seed}, step ${step}`);
    if (step % 13 === 0) {
      const current = history.current;
      store.save(current);
      assert.equal(encoded(store.open(current.id)), encoded(current));
      assert.equal(encoded(store.importJSON(store.exportJSON(current))), encoded(current));
      persistenceChecks += 1;
    }
  }
}

const nearLimit = createStarterDocument();
while (nearLimit.shots.length < 64) {
  const shot = copy(nearLimit.shots.at(-1));
  shot.id = `limit-${nearLimit.shots.length + 1}`;
  nearLimit.shots.push(shot);
}
nearLimit.shots[63].movement = {
  intent: 'manual', pinned: true, target: { x: 8.25, y: 12.75 },
  waypoints: [{ x: 15.5, y: 5.25 }, { x: 11.125, y: 9.875 }]
};
const limitStorage = new MemoryStorage();
const limitStore = new DraftStore({ storage: limitStorage, validate: validateDocument });
limitStore.save(nearLimit);
assert.deepEqual(limitStore.importJSON(limitStore.exportJSON(nearLimit)), nearLimit);
assert.deepEqual(limitStore.loadLast(), nearLimit);

const atomicStorage = new MemoryStorage();
const atomicStore = new DraftStore({ storage: atomicStorage, validate: validateDocument });
atomicStore.save(createStarterDocument());
const committedBytes = atomicStorage.getItem(STORAGE_KEY);
atomicStorage.setItem = () => { throw new Error('QuotaExceededError'); };
assert.throws(() => atomicStore.save({ ...createStarterDocument(), title: 'Must remain in memory only' }), /previous saved library was kept/);
assert.equal(atomicStorage.getItem(STORAGE_KEY), committedBytes);

const sharedStorage = new MemoryStorage();
const firstTab = new DraftStore({ storage: sharedStorage, validate: validateDocument });
const secondTab = new DraftStore({ storage: sharedStorage, validate: validateDocument });
firstTab.save(createStarterDocument());
const firstVersion = firstTab.loadLast();
const secondVersion = secondTab.loadLast();
secondVersion.title = 'Second tab revision';
secondTab.save(secondVersion);
firstVersion.title = 'Stale first tab revision';
assert.throws(() => firstTab.save(firstVersion), error => error.code === 'DRAFT_CONFLICT');
const copyVersion = { ...firstVersion, id: 'conflict-recovery-copy' };
firstTab.save(copyVersion);
assert.equal(firstTab.open(copyVersion.id).title, 'Stale first tab revision');
assert.equal(secondTab.open(secondVersion.id).title, 'Second tab revision');

assert.throws(() => limitStore.importJSON('{malformed'), /malformed/);
assert.throws(() => limitStore.importJSON(`{"payload":"${'x'.repeat(MAX_JSON_BYTES)}"}`), /512 KiB/);
const future = copy(nearLimit);
future.schemaVersion = 2;
assert.throws(() => limitStore.importJSON(encoded(future)), /schemaVersion must be 1/);

process.stdout.write(`${JSON.stringify({
  seeds: seedCount,
  stepsPerSeed: stepCount,
  totalMutations,
  totalUndos,
  totalRedos,
  persistenceChecks,
  nearLimitShots: nearLimit.shots.length,
  retainedWaypointCount: nearLimit.shots[63].movement.waypoints.length,
  quotaAtomic: true,
  staleRevisionConflict: true
}, null, 2)}\n`);
