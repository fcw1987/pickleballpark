import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { compilePlayTimeline } from '../three-d-core.js';
import { sampleActorPresentation } from '../three-d-presentation.js';
import { AthleteResources, createAthlete, updateAthlete } from '../three-d-athletes.js';
import { PICKLEBOARD_PLAYS as plays } from '../play-catalog.js';

const camera={x:9,y:6,z:4};
const point=(actor,name)=>actor.getObjectByName(name).getWorldPosition(new THREE.Vector3());
const sample=(segment,hand,time)=>sampleActorPresentation({instructionalMovement:true,segment,playerId:segment.shotSemantics.playerId,localTime:time,handedness:hand,cameraPosition:camera});
const draw=(actor,segment,hand,time)=>{const q=sample(segment,hand,time);updateAthlete(actor,q,camera);return q;};

test('a support shoe remains world-fixed while approach steps continue during stroke preparation',()=>{
  const r=new AthleteResources(),actor=createAthlete(r,'team1','right');
  const timeline=compilePlayTimeline(plays.find(p=>p.id==='third-shot-drive'));
  const segment=timeline.segments[1],id=segment.nextShotSemantics.playerId;
  let supportingIntervals=0,preparingSteps=0,previous=null;
  for(let t=.03;t<segment.duration-.15;t+=1/240){
    const q=sampleActorPresentation({instructionalMovement:true,segment,playerId:id,localTime:t,handedness:'right',cameraPosition:camera});
    updateAthlete(actor,q,camera);
    const now=Object.fromEntries(['Left','Right'].map(side=>[side,point(actor,`${side}Foot`)]));
    if(previous)for(const side of ['Left','Right'])if(now[side].y<1e-9&&previous[side].y<1e-9){
      assert.ok(now[side].distanceTo(previous[side])<1e-8,`${side} planted support drifted`);supportingIntervals++;
    }
    if(q.strokePose&&q.travelSpeed>.1&&Object.values(now).some(p=>p.y>.005))preparingSteps++;
    previous=now;
  }
  assert.ok(supportingIntervals>20);assert.ok(preparingSteps>0,'preparation must not freeze translating ankles');r.dispose();
});

test('both soles remain grounded and fixed throughout the planted contact window for either hand',()=>{
  const r=new AthleteResources();
  for(const hand of ['right','left']){
    const actor=createAthlete(r,'team1',hand);
    for(const play of plays)for(const segment of compilePlayTimeline(play).segments.filter(s=>s.trajectory)){
      draw(actor,segment,hand,segment.contactTime);
      const feet=['Left','Right'].map(side=>point(actor,`${side}Foot`));
      for(const delta of [-.06,-.03,.03,.06]){
        if(segment.contactTime+delta<0)continue;
        draw(actor,segment,hand,segment.contactTime+delta);
        for(const [i,side] of ['Left','Right'].entries())assert.ok(point(actor,`${side}Foot`).distanceTo(feet[i])<1e-8,`${play.id}/${side}/${hand} contact support`);
      }
    }
  }
  r.dispose();
});

test('forehand and backhand contact occupy opposite lateral sides and mirror with physical handedness',()=>{
  const original=plays.find(p=>p.id==='third-shot-drive');
  const r=new AthleteResources();
  for(const hand of ['right','left'])for(const back of [false,true]){
    const play=structuredClone(original),shot=play.steps.find(s=>s.shot?.type==='drive').shot;
    if(back)shot.contact.strokeSide='backhand';
    const segment=compilePlayTimeline(play).segments.find(s=>s.shotSemantics?.shotType==='drive');
    const actor=createAthlete(r,'team1',hand),q=draw(actor,segment,hand,segment.contactTime);
    const face=actor.userData.visual.worldToLocal(point(actor,'PaddleFace'));
    const sign=hand==='right'?-1:1;
    assert.ok(face.x*sign*(back?-1:1)>.08);
    assert.ok(point(actor,'PaddleFace').distanceTo(new THREE.Vector3(segment.trajectory.start.x,segment.trajectory.start.y,segment.trajectory.start.z))<1e-8);
    assert.equal(actor.userData.animation.strokeFamily,'drive');assert.equal(q.strokeSide,back?'backhand':'forehand');
  }
  r.dispose();
});

test('the paddle passes contact with a coherent nonzero tangent and lob has a controlled upward face',()=>{
  const r=new AthleteResources(),actor=createAthlete(r,'team1','right');
  for(const type of ['drive','lob']){
    const play=plays.find(p=>p.steps.some(s=>s.shot?.type===type));
    const segment=compilePlayTimeline(play).segments.find(s=>s.shotSemantics?.shotType===type);
    const dt=1/1000;
    // Contact at t=0 is supplied by the preceding segment. The same strokeTime
    // curve can be sampled directly on either side without changing ball timing.
    const q=sample(segment,'right',segment.contactTime);
    const curve=offset=>{updateAthlete(actor,{...q,strokeTime:q.strokeTime+offset},camera);return point(actor,'PaddleFace');};
    const contact=curve(0),before=curve(-dt),after=curve(dt);
    const incoming=contact.clone().sub(before).multiplyScalar(1/dt),outgoing=after.clone().sub(contact).multiplyScalar(1/dt);
    assert.ok(incoming.length()>.3&&outgoing.length()>.3,`${type} must not stop at contact`);
    assert.ok(incoming.clone().normalize().dot(outgoing.clone().normalize())>.99,`${type} contact tangent must agree`);
    if(type==='lob'){
      assert.ok(outgoing.y>.5,'lob lifts through contact');
      const normal=new THREE.Vector3(0,0,1).applyQuaternion(actor.userData.paddle.quaternion);
      assert.ok(normal.y>.3,'lob face opens upward');
      const finish=curve(segment.shotSemantics.profile.duration*(segment.shotSemantics.profile.recoverRatio-segment.shotSemantics.profile.contactRatio));
      assert.ok(finish.y-contact.y>.6,'lob finish is head high');
    }
  }
  r.dispose();
});

test('fixed-length arm IK stays within reach through low balls, lobs, overheads and recovery',()=>{
  const r=new AthleteResources();
  for(const hand of ['right','left']){
    const actor=createAthlete(r,'team1',hand);
    for(const play of plays)for(const segment of compilePlayTimeline(play).segments.filter(s=>s.trajectory)){
      for(let t=0;t<=segment.duration;t+=1/120){
        draw(actor,segment,hand,t);
        assert.ok(actor.userData.animation.wristReach<=.573001,`${play.id}/${segment.step.id}/${hand}/${t}: stretched arm`);
        const upper=actor.userData.arms[hand].upper,forearm=actor.userData.arms[hand].forearm;
        // Actual rendered segment scale, not a diagnostic that could disagree
        // with the visible articulated source or its dynamic GPU batch.
        assert.ok(Math.abs(upper.scale.y*.29-.29)<.00001,`${play.id} upper arm length`);
        assert.ok(Math.abs(forearm.scale.y*.27-.285)<.00001,`${play.id} forearm length`);
      }
    }
  }
  r.dispose();
});

test('all rendered actors remain continuous across adjacent rally segments, including off hands and readiness',()=>{
  const r=new AthleteResources(),names=['PaddleFace','Head','LeftFoot','RightFoot','LeftHand','RightHand','LeftKnee','RightKnee'];
  for(const hand of ['right','left']){
    const actor=createAthlete(r,'team1',hand);
    for(const play of plays){
      const timeline=compilePlayTimeline(play);
      for(let i=1;i<timeline.segments.length;i++)for(const playerId of ['player1','player2','player3','player4']){
        const before=timeline.segments[i-1],after=timeline.segments[i];
        const render=(segment,time)=>{updateAthlete(actor,sampleActorPresentation({instructionalMovement:true,segment,playerId,localTime:time,handedness:hand,timeline,cameraPosition:camera}));return names.map(name=>point(actor,name));};
        const a=render(before,before.duration-1e-7),b=render(after,1e-7);
        names.forEach((name,j)=>assert.ok(a[j].distanceTo(b[j])<.00001,`${play.id}/${playerId}/${name}/${hand}: segment snap`));
      }
    }
  }
  r.dispose();
});

test('rendered thigh and shin lengths remain fixed while stepping and deeply loading low shots',()=>{
  const r=new AthleteResources(),actor=createAthlete(r,'team1','right');
  for(const play of plays){
    const timeline=compilePlayTimeline(play);
    for(const segment of timeline.segments)for(let t=0;t<=segment.duration;t+=1/60)for(const playerId of ['player1','player2','player3','player4']){
      updateAthlete(actor,sampleActorPresentation({instructionalMovement:true,segment,playerId,localTime:t,handedness:'right',timeline,cameraPosition:camera}));
      for(const leg of Object.values(actor.userData.legs)){
        assert.ok(Math.abs(leg.thigh.scale.y*.39-.445)<1e-7,`${play.id}/${playerId}: thigh stretched`);
        assert.ok(Math.abs(leg.shin.scale.y*.34-.425)<1e-7,`${play.id}/${playerId}: shin stretched`);
      }
    }
  }
  r.dispose();
});

test('default shared presentation retains frozen 2D positions, facing, action, planting and timing',async()=>{
  const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
  const fixture=JSON.parse(await readFile(new URL('./fixtures/stroke-legacy-presentation.json',import.meta.url),'utf8'));
  const round=(key,value)=>typeof value==='number'?Math.round(value*1e11)/1e11:value;
  for(const expected of fixture.signatures){
    const play=plays.find(p=>p.id===expected.playId),timeline=compilePlayTimeline(play),samples=[];
    for(const segment of timeline.segments)for(const fraction of fixture.fractions)for(const playerId of ['player1','player2','player3','player4']){
      const q=sampleActorPresentation({segment,timeline,playerId,localTime:segment.duration*fraction,cameraPosition:fixture.cameraPosition,handedness:expected.handedness});
      samples.push(Object.fromEntries(fixture.keys.map(key=>[key,q[key]])));
    }
    assert.equal(samples.length,expected.count);
    assert.equal(createHash('sha256').update(JSON.stringify(samples,round)).digest('hex'),expected.sha256,`${expected.playId}/${expected.handedness}: default 2D presentation changed`);
  }
});

test('a complete generated 99-hit rally keeps both handed rigs finite, in reach and exactly on every contact',async()=>{
  const {proposeRandomRally}=await import('../smart-rally-generator.js');
  const {compileEffectiveCandidate}=await import('../rally-proposals.js');
  const generated=await proposeRandomRally({length:99,seed:12648430});
  assert.ok(generated.ok,generated.reason);
  const compiled=compileEffectiveCandidate(generated.document);
  assert.equal(compiled.validShotCount,99);
  const r=new AthleteResources();
  try{
    for(const hand of ['left','right']){
      const actor=createAthlete(r,'team1',hand);
      for(const segment of compiled.timeline.segments){
        for(const time of new Set([segment.contactTime,Math.min(segment.duration,segment.contactTime+.1),segment.duration*.5,segment.duration])){
          draw(actor,segment,hand,time);
          assert.ok(actor.userData.animation.wristReach<=.573001,`${segment.step.id}/${hand}: arm reach`);
          for(const leg of Object.values(actor.userData.legs)){
            assert.ok(Math.abs(leg.thigh.scale.y*.39-.445)<1e-7,`${segment.step.id}: thigh length`);
            assert.ok(Math.abs(leg.shin.scale.y*.34-.425)<1e-7,`${segment.step.id}: shin length`);
          }
          assert.ok(actor.userData.bodyBatch.batch.geometry.attributes.position.array.every(Number.isFinite),`${segment.step.id}: nonfinite rendered vertices`);
          if(time===segment.contactTime){
            const target=new THREE.Vector3(segment.trajectory.start.x,segment.trajectory.start.y,segment.trajectory.start.z);
            assert.ok(actor.userData.paddleFaceWorld.distanceTo(target)<1e-7,`${segment.step.id}/${hand}/${segment.shotSemantics.stroke}/${segment.shotSemantics.strokeSide}: visible contact missed`);
          }
        }
      }
    }
  }finally{r.dispose();}
});
