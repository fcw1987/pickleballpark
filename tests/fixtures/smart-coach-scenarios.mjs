import { createStarterDocument } from '../../play-document.js';

const clone = value => structuredClone(value);

function midrally(id) {
  const document = createStarterDocument();
  document.id = id;
  document.title = `Coach fixture ${id}`;
  document.opening = 'midrally';
  document.initialLayout = {
    player1: { x: 10, y: 14 }, player2: { x: 5, y: 14 },
    player3: { x: 10, y: 30 }, player4: { x: 15, y: 30 },
    ball: { x: 10, y: 14 }
  };
  document.shots = [];
  return document;
}

function shot(id, family, hitter, target, options = {}) {
  return {
    id, family, hitter, receiver: options.receiver ?? 'auto',
    contactStyle: options.contactStyle ?? 'forehand', target,
    arc: options.arc ?? 'medium', pace: options.pace ?? 'soft',
    movement: options.movement ?? { intent: 'hold', pinned: false },
    ...(options.playerMovement ? { playerMovement: options.playerMovement } : {}),
    ...(options.authoring ? { authoring: options.authoring } : {})
  };
}

function threeShot(document, third = {}) {
  document.shots = [
    shot('coach-1', 'dink', 'player1', { x: 10, y: 30 }, { receiver: 'player3', ...third.first }),
    shot('coach-2', 'dink', 'player3', { x: 10, y: 14 }, { receiver: 'player1', ...third.second }),
    shot('coach-3', 'dink', 'player1', { x: 10, y: 30 }, { ...third.third })
  ];
  return document;
}

// Start with a real generated rally, then make the kind of direct target edit
// a normal authoring session permits. Coach must preserve that explicit target
// and repair only a derived recovery movement downstream.
export async function automaticRepairScenario() {
  // Stable fixture captured from smart-rally-v1 seed 0. Keep this explicit so
  // future generator improvements cannot silently change the Coach regression
  // into a valid tactical draft (the prior generated seed-1 fixture did that).
  return clone({
    schemaVersion: 1,
    modelVersion: 1,
    id: 'coach-generated-target-edit',
    title: 'Coach generated target edit',
    initialLayout: {
      player1: { x: 15, y: -1 }, player2: { x: 5, y: -1 },
      player3: { x: 5, y: 42 }, player4: { x: 15, y: 30 }, ball: { x: 16.2, y: 0 }
    },
    players: {
      player1: { team: 'green', handedness: 'right' }, player2: { team: 'green', handedness: 'right' },
      player3: { team: 'orange', handedness: 'right' }, player4: { team: 'orange', handedness: 'left' }
    },
    shots: [
      { id: 'smart-shot-1', family: 'serve', hitter: 'player2', receiver: 'auto', contactStyle: 'auto', target: { x: 8, y: 39 }, arc: 'medium', pace: 'medium', movement: { intent: 'hold', pinned: false }, authoring: { ownership: 'automatic', fields: ['family', 'hitter', 'receiver', 'contactStyle', 'target', 'arc', 'pace', 'movement', 'serveMethod'] }, serveMethod: 'volley' },
      { id: 'smart-shot-2', family: 'return', hitter: 'player3', receiver: 'auto', contactStyle: 'auto', target: { x: 10, y: 8 }, arc: 'high', pace: 'firm', movement: { intent: 'hold', pinned: false }, authoring: { ownership: 'automatic', fields: ['family', 'hitter', 'receiver', 'contactStyle', 'target', 'arc', 'pace', 'movement', 'serveMethod'] } },
      { id: 'smart-shot-3', family: 'dink', hitter: 'player1', receiver: 'auto', contactStyle: 'auto', target: { x: 0, y: 44 }, arc: 'low', pace: 'soft', movement: { intent: 'hold', pinned: false }, authoring: { ownership: 'automatic', fields: ['family', 'hitter', 'receiver', 'contactStyle', 'target', 'arc', 'pace', 'movement', 'serveMethod'] } },
      { id: 'smart-shot-4', family: 'drive', hitter: 'player4', receiver: 'auto', contactStyle: 'auto', target: { x: 15.5, y: 10 }, arc: 'low', pace: 'soft', movement: { intent: 'hold', pinned: false }, authoring: { ownership: 'automatic', fields: ['family', 'hitter', 'receiver', 'contactStyle', 'target', 'arc', 'pace', 'movement', 'serveMethod'] } },
      { id: 'smart-shot-5', family: 'volley', hitter: 'player1', receiver: 'auto', contactStyle: 'auto', target: { x: 4.5, y: 31 }, arc: 'medium', pace: 'soft', movement: { intent: 'hold', pinned: false }, authoring: { ownership: 'automatic', fields: ['family', 'hitter', 'receiver', 'contactStyle', 'target', 'arc', 'pace', 'movement', 'serveMethod'] } },
      { id: 'smart-shot-6', family: 'reset', hitter: 'player4', receiver: 'auto', contactStyle: 'auto', target: { x: 10, y: 13 }, arc: 'high', pace: 'soft', movement: { intent: 'hold', pinned: false }, authoring: { ownership: 'automatic', fields: ['family', 'hitter', 'receiver', 'contactStyle', 'target', 'arc', 'pace', 'movement', 'serveMethod'] } }
    ],
    annotations: [],
    assistance: { autoShading: false, showGuides: false, team: 'both' },
    opening: 'serve', ending: 'stop', intentionalFault: false,
    generation: { mode: 'random', generatorVersion: 'smart-rally-v1', seed: 0, requestedHits: 6 }
  });
}

// The pin is authored. Releasing or moving it can be shown only as a consented
// option; Coach Fix for me must leave it in place and decline automatic repair.
export function protectedPinScenario() {
  return threeShot(midrally('coach-protected-pin'), {
    first: {
      movement: { intent: 'manual', pinned: true, target: { x: 0, y: 0 } }
    }
  });
}

// The first error is automatically repairable in isolation, but a later
// authored pin still blocks the complete candidate. This prevents Coach from
// accepting a valid prefix while claiming the rally is repaired.
export function laterBreakScenario() {
  return threeShot(midrally('coach-later-break'), {
    first: {
      movement: { intent: 'manual', pinned: true, target: { x: 0, y: 0 } },
      playerMovement: { player2: { intent: 'manual', pinned: false, target: { x: 0, y: 44 } } },
      authoring: { ownership: 'automatic', fields: ['playerMovement'] }
    },
    third: {
      movement: { intent: 'manual', pinned: true, target: { x: 0, y: 0 } }
    }
  });
}

export function noFeasibleScenario() {
  const document = threeShot(midrally('coach-no-feasible'), {
    first: {
      movement: { intent: 'manual', pinned: true, target: { x: 0, y: 0 } },
      playerMovement: { player2: { intent: 'manual', pinned: true, target: { x: 0, y: 44 } } },
      authoring: { ownership: 'automatic', fields: ['playerMovement'] }
    },
    second: { movement: { intent: 'manual', pinned: true, target: { x: 20, y: 44 } } },
    third: { movement: { intent: 'manual', pinned: true, target: { x: 0, y: 0 } } }
  });
  // Every feasible alternative would require releasing several authored
  // locks; the bounded one/two-change option search must report no solution.
  return document;
}

export function validScenario() {
  return threeShot(midrally('coach-valid')); 
}

export function copyScenario(factory) {
  return clone(factory());
}
