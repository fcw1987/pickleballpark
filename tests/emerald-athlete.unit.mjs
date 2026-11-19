import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from '../vendor/three-addons/loaders/GLTFLoader.js';
import { Vector3 } from '../vendor/three.module.min.js';
import { createCourtAthlete } from '../emerald-athlete.js';
import { compileEffectiveCandidate } from '../rally-proposals.js';
import { sampleActorPresentation } from '../three-d-presentation.js';
import { pixelAuthoringCases, pixelTacticalBoundaryCases } from './fixtures/pixel-authoring-cases.mjs';

const roster=['emerald-cap','cream-visor','coral-ponytail','navy-cap'];
for (const [index,key] of roster.entries()) test(key+' meets every authored contact family and both hands with its physical grip intact', async () => {
  const bytes = readFileSync(new URL('../assets/athletes/'+key+'.glb', import.meta.url));
  const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const actor = createCourtAthlete(model,index);
  const joint = name => actor.getObjectByName(name).getWorldPosition(new Vector3());
  const armLength = () => joint('UpperArmR').distanceTo(joint('ForearmR')) + joint('ForearmR').distanceTo(joint('HandR'));
  const neutralArm = armLength(), gripOffset = joint('HandR').distanceTo(joint('GripCenter'));
  try {
    for (const item of [...pixelAuthoringCases(), ...pixelTacticalBoundaryCases()]) {
      const { timeline } = compileEffectiveCandidate(item.document);
      const segment = timeline.segments.find(segment => segment.shotSemantics);
      const sample = sampleActorPresentation({ instructionalMovement: true, segment, timeline,
        seconds: segment.startTime + segment.contactTime, localTime: segment.contactTime, playerId: 'player1',
        handedness: item.handedness, cameraPosition: { x: 3, y: 10, z: 11 }, cameraTarget: { x: 0, y: .4, z: 0 } });
      actor.userData.handedness = item.handedness;
      actor.userData.applyPose(sample, 1);
      assert.ok(actor.position.distanceTo(sample.worldPosition) < 1e-7, item.id);
      assert.ok(actor.userData.paddleFaceWorld.distanceTo(sample.paddle.worldContactTarget) < 1e-6, item.id);
      assert.ok(Math.abs(joint('HandR').distanceTo(joint('GripCenter')) - gripOffset) < 1e-6, item.id);
      // Even the seven-foot overhead uses the original arm length.
      assert.ok(Math.abs(armLength() / neutralArm - 1) < .001, item.id);
    }
  } finally { actor.userData.dispose(); }
});
