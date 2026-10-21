import test from 'node:test';
import assert from 'node:assert/strict';
import {createStarterDocument} from '../play-document.js';
import {proposeRandomRally,proposeSmartAdd} from '../smart-rally-generator.js';
import {compileEffectiveCandidate} from '../rally-proposals.js';
import {samplePlayBall,samplePlayState} from '../three-d-core.js';
import {sampleActorPresentation} from '../three-d-presentation.js';

test('new serves use the nearby athlete and the diagonal box without rewriting a starting layout',async()=>{
  for(const x of [5,16.2]){
    const source=createStarterDocument();source.shots=[];source.initialLayout.ball.x=x;
    const before=structuredClone(source.initialLayout);
    const result=await proposeSmartAdd(source,{seed:123});
    assert.ok(result.ok,result.reason);
    const shot=result.document.shots[0];
    assert.equal(shot.hitter,x<10?'player2':'player1');
    assert.ok(x<10?shot.target.x>10:shot.target.x<10);
    assert.deepEqual(result.document.initialLayout,before);
  }
});

test('generated contacts, bounces, targets and camera-independent actors agree across a bounded corpus',async()=>{
  for(const [length,seed] of [[1,123],[7,0],[7,5],[20,2026],[99,1],[99,12648430]]){
    const generated=await proposeRandomRally({length,seed});assert.ok(generated.ok,generated.reason);
    const doc=generated.document,{timeline,validShotCount,play}=compileEffectiveCandidate(doc);
    assert.equal(validShotCount,length);
    const contacts=timeline.events.filter(event=>event.type==='contact');
    assert.equal(contacts.length,length);
    assert.deepEqual(contacts.map(event=>event.actor),doc.shots.map(shot=>shot.hitter));
    assert.deepEqual(play.steps.slice(1).map(step=>step.shot.intendedTarget),doc.shots.map(shot=>shot.target));
    for(let index=0;index<length;index++){
      const contact=contacts[index],next=contacts[index+1];
      const bounces=timeline.events.filter(event=>event.type==='bounce'&&event.rallyLeg===index+1);
      assert.ok(bounces.length<=1,`seed ${seed} leg ${index+1}: unintended second bounce`);
      if(index<2)assert.equal(bounces.length,1,'opening serve and return must bounce');
      if(next)for(const bounce of bounces)assert.ok(bounce.time>contact.time&&bounce.time<next.time);
      const segment=timeline.segments.find(item=>item.step.id===doc.shots[index].id);
      const args={segment,playerId:contact.actor,localTime:segment.contactTime,handedness:doc.players[contact.actor].handedness,artFamily:doc.players[contact.actor].team,timeline};
      const a=sampleActorPresentation({...args,cameraPosition:{x:5,y:12,z:9}}),b=sampleActorPresentation({...args,cameraPosition:{x:-11,y:7,z:0}});
      assert.deepEqual(a.worldPosition,b.worldPosition);assert.deepEqual(a.paddle.worldContactTarget,b.paddle.worldContactTarget);
      const ball=samplePlayBall(timeline,contact.time),paddle=a.paddle.worldContactTarget;
      assert.ok(Math.hypot(ball.x-paddle.x,ball.y-paddle.y,ball.z-paddle.z)<1e-6);
    }
    for(const event of timeline.events){
      const at=samplePlayBall(timeline,event.time);
      assert.deepEqual(samplePlayState(timeline,event.time).ball,at);
      for(const delta of[-1e-7,1e-7]){const other=samplePlayBall(timeline,Math.max(0,Math.min(timeline.duration,event.time+delta)));assert.ok(Math.hypot(at.x-other.x,at.y-other.y,at.z-other.z)<2e-5,`${seed}/${event.id}: discontinuity`);}
    }
  }
});
