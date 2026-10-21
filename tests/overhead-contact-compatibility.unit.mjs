import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three.module.min.js';
import { validateDocument } from '../play-document.js';
import { DraftStore } from '../builder-storage.js';
import { compileEffectiveCandidate, evaluateCandidate } from '../rally-proposals.js';
import { AthleteResources, createAthlete, updateAthlete } from '../three-d-athletes.js';
import { sampleActorPresentation } from '../three-d-presentation.js';

const source=JSON.parse(readFileSync(new URL('./fixtures/overhead-short-hop-document.json',import.meta.url),'utf8'));
const memory={getItem:()=>null,setItem:()=>{}};

function assertWorldLegs(actor,label){
  actor.updateMatrixWorld(true);
  for(const [side,leg] of Object.entries(actor.userData.legs)){
    // Transform the actual segment endpoints after the full parent chain is
    // current; this catches overextension even if diagnostic scale is wrong.
    const end=(object,y)=>new THREE.Vector3(0,y,0).applyMatrix4(object.matrixWorld);
    const hip=end(leg.thigh,-.39/2),knee=end(leg.thigh,.39/2);
    const shinTop=end(leg.shin,-.34/2),ankle=end(leg.shin,.34/2);
    assert.ok(Math.abs(hip.distanceTo(knee)-.445)<1e-7,`${label}/${side}: world thigh length`);
    assert.ok(Math.abs(shinTop.distanceTo(ankle)-.425)<1e-7,`${label}/${side}: world shin length`);
    assert.ok(knee.distanceTo(shinTop)<1e-8,`${label}/${side}: disconnected knee`);
    const sole=leg.foot.getWorldPosition(new THREE.Vector3());
    assert.ok(ankle.distanceTo(sole.add(new THREE.Vector3(0,.095,0)))<1e-8,`${label}/${side}: ankle/sole connection`);
  }
}


// This is a supported source-data boundary, not an assertion that seven feet is
// a physically meaningful short hop. Existing imports and editor selections
// preserve the combination; the separate rule evaluator explains the conflict.
test('existing overhead/short-hop source imports losslessly and its semantic conflict is reported by rule evaluation',()=>{
  assert.doesNotThrow(()=>validateDocument(source));
  const imported=new DraftStore({storage:memory,validate:validateDocument}).importJSON(JSON.stringify(source));
  assert.deepEqual(imported,source);
  const before=JSON.stringify(imported),result=evaluateCandidate(imported);
  assert.equal(result.ok,false);
  assert.ok(result.rules.violations.some(v=>v.code==='short-hop-contact'));
  assert.equal(JSON.stringify(imported),before);
});

test('ordinary automatic, forehand and backhand overheads retain exact contacts and bounded rendered limbs for both hands',()=>{
  const resources=new AthleteResources();
  try{
    const actors={left:createAthlete(resources,'team1','left'),right:createAthlete(resources,'team1','right')};
    for(const style of ['auto','forehand','backhand']){
      const document=structuredClone(source);
      document.shots.find(s=>s.family==='overhead').contactStyle=style;
      const evaluated=evaluateCandidate(document);
      assert.ok(evaluated.ok,evaluated.reason);
      const {timeline}=compileEffectiveCandidate(document),segment=timeline.segments.find(s=>s.step.shot?.authoring?.family==='overhead');
      for(const hand of ['left','right']){
        const actor=actors[hand];
        const dense=Array.from({length:Math.ceil(segment.duration*120)+1},(_,i)=>Math.min(segment.duration,i/120));
        for(const localTime of [...dense,segment.contactTime,...dense.slice().reverse()]){
          updateAthlete(actor,sampleActorPresentation({instructionalMovement:true,segment,timeline,playerId:segment.shotSemantics.playerId,localTime,handedness:hand}));
          assertWorldLegs(actor,`${style}/${hand}/${localTime}`);
          assert.ok(actor.userData.animation.wristReach<=.573001);
          assert.ok(actor.userData.bodyBatch.batch.geometry.attributes.position.array.every(Number.isFinite));
          if(localTime===segment.contactTime){
            const p=segment.trajectory.start,target=new THREE.Vector3(p.x,p.y,p.z);
            assert.ok(actor.userData.paddleFaceWorld.distanceTo(target)<1e-7,`${style}/${hand}: overhead contact`);
          }
        }
      }
    }
  }finally{resources.dispose();}
});

function placedDocument(hand,mirrored){
  const doc=structuredClone(source);
  for(const player of Object.values(doc.players))player.handedness=hand;
  if(mirrored){
    for(const point of Object.values(doc.initialLayout))point.x=20-point.x;
    for(const shot of doc.shots)shot.target.x=20-shot.target.x;
  }
  return doc;
}

test('builder-created and imported overhead/short-hop combinations meet their unchanged high contact with either hand and lateral placement',()=>{
  const resources=new AthleteResources(),store=new DraftStore({storage:memory,validate:validateDocument});
  try{
    const actors={left:createAthlete(resources,'team1','left'),right:createAthlete(resources,'team1','right')};
    for(const hand of ['left','right'])for(const mirrored of [false,true])for(const path of ['builder','import']){
      const authored=placedDocument(hand,mirrored),doc=path==='import'?store.importJSON(JSON.stringify(authored)):authored;
      const {timeline}=compileEffectiveCandidate(doc),segment=timeline.segments.find(s=>s.step.shot?.authoring?.family==='overhead');
      assert.equal(segment.step.shot.type,'short-hop');assert.equal(segment.shotSemantics.stroke,'short-hop');
      assert.equal(segment.shotSemantics.contact.kind,'short-hop');assert.equal(segment.shotSemantics.contact.point.heightFeet,7);
      const actor=actors[hand],playerId=segment.shotSemantics.playerId;
      const draw=offset=>{
        const active=offset<0?timeline.segments[timeline.segments.indexOf(segment)-1]:segment;
        const localTime=offset<0?active.duration+offset:segment.contactTime+offset;
        const sample=sampleActorPresentation({instructionalMovement:true,segment:active,timeline,playerId,localTime,handedness:hand});
        updateAthlete(actor,sample);
        assertWorldLegs(actor,`${path}/${hand}/${mirrored}/${offset}`);
        assert.equal(sample.instructionalFamily,'overhead');
        assert.equal(sample.profile.duration,segment.shotSemantics.profile.duration);
        assert.equal(sample.profile.contactRatio,segment.shotSemantics.profile.contactRatio);
        assert.equal(actor.userData.animation.strokeFamily,'overhead');
        assert.ok(actor.userData.animation.wristReach<=.573001);
        assert.ok(actor.userData.bodyBatch.batch.geometry.attributes.position.array.every(Number.isFinite));
        for(const leg of Object.values(actor.userData.legs)){
          assert.ok(Math.abs(leg.thigh.scale.y*.39-.445)<1e-7);
          assert.ok(Math.abs(leg.shin.scale.y*.34-.425)<1e-7);
        }
        return Object.values(actor.userData.legs).map(l=>l.foot.getWorldPosition(new THREE.Vector3()));
      };
      const feet=draw(0);
      const first=Array.from(actor.userData.bodyBatch.batch.geometry.attributes.position.array);
      draw(0);
      assert.deepEqual(Array.from(actor.userData.bodyBatch.batch.geometry.attributes.position.array),first,'repeated seek must reproduce rendered joints/vertices exactly');
      const p=segment.trajectory.start,target=new THREE.Vector3(p.x,p.y,p.z);
      assert.ok(actor.userData.paddleFaceWorld.distanceTo(target)<1e-7,`${path}/${hand}/${mirrored}: legacy high contact missed`);
      for(const offset of [-.06,-.03,.03,.06]){
        const near=draw(offset);
        near.forEach((p,i)=>{assert.ok(p.distanceTo(feet[i])<1e-8);assert.ok(Math.abs(p.y)<1e-9);});
      }
      for(const offset of [.12,segment.duration*.5,segment.duration*.8])draw(offset);
      assert.deepEqual(doc,authored);
    }
  }finally{resources.dispose();}
});

test('legacy combination keeps compiled Play, event arrays, sampled ball trajectory and default 2D presentation byte-for-byte unchanged',async()=>{
  const {createHash}=await import('node:crypto'),{samplePlayBall}=await import('../three-d-core.js');
  const baseline=JSON.parse(readFileSync(new URL('./fixtures/overhead-short-hop-compatibility-baseline.json',import.meta.url),'utf8'));
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for(const expected of baseline.signatures){
    const {timeline,play}=compileEffectiveCandidate(placedDocument(expected.hand,expected.mirrored));
    assert.equal(hash(play),expected.compiledPlaySha256);
    assert.equal(hash(timeline.events),expected.eventsSha256);
    assert.equal(hash(expected.ballTimes.map(t=>samplePlayBall(timeline,t))),expected.ballSamplesSha256);
    const actors=[];
    for(const segment of timeline.segments)for(const fraction of [0,.1,.25,.5,.75,.9,1])for(const playerId of ['player1','player2','player3','player4']){
      const sample=sampleActorPresentation({segment,timeline,playerId,localTime:segment.duration*fraction,handedness:expected.hand,cameraPosition:{x:9,y:6,z:4}});
      assert.equal('instructionalFamily' in sample,false,'default shared sampler must not opt into compatibility override');
      actors.push(sample);
    }
    assert.equal(hash(actors),expected.defaultPresentationSha256);
  }
});
