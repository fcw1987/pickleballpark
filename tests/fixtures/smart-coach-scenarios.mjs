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

// A deliberately unreachable partner movement is automatically owned and
// unpinned. Holding that partner at the existing production position fixes the
// whole document without touching ball intent or any authored identity.
export function automaticRepairScenario() {
  return threeShot(midrally('coach-automatic-repair'), {
    first: {
      playerMovement: { player2: { intent: 'manual', pinned: false, target: { x: 0, y: 44 } } },
      authoring: { ownership: 'automatic', fields: ['playerMovement'] }
    }
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
  return protectedPinScenario();
}

export function validScenario() {
  return threeShot(midrally('coach-valid')); 
}

export function copyScenario(factory) {
  return clone(factory());
}
