import { createStarterDocument } from '../../../play-document.js';

export const clone = value => structuredClone(value);

export function model2Shot(overrides = {}) {
  return {
    id: 'model2-hit', family: 'dink', intent: 'cross-court-dink', quality: 'neutral',
    hitter: 'player1', receiver: 'auto', contactStyle: 'forehand',
    target: { x: 7, y: 30 }, arc: 'medium', pace: 'soft',
    movement: { intent: 'hold', pinned: false },
    narration: { label: 'Cross-court dink', why: 'Send a soft ball over the net.' },
    ...overrides
  };
}

export function model2Document(overrides = {}) {
  const base = createStarterDocument();
  return {
    ...base, id: 'model2-fixture', title: 'Model 2 fixture',
    modelVersion: 2, physicsVersion: 'play-physics-v2', opening: 'midrally',
    initialLayout: {
      player1: { x: 7, y: 14 }, player2: { x: 15, y: 14 },
      player3: { x: 7, y: 30 }, player4: { x: 15, y: 30 }, ball: { x: 7, y: 14 }
    }, shots: [model2Shot()], ...overrides
  };
}

export function declaredOutcome(overrides = {}) {
  return {
    winner: 'green', type: 'fault', reason: 'body', shotId: 'model2-hit', ruleRef: '10.C.3',
    faultingActor: 'player3', struckActor: 'player3',
    evidence: { position: { x: 7, y: 30, heightFeet: 2 }, afterContactSeconds: .6 },
    ...overrides
  };
}
