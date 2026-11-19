import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulateRally} from '../rally-engine.js';
import {proposeSmartAdd} from '../smart-rally-generator.js';
import {compileEffectiveCandidate} from '../rally-proposals.js';
import {sampleActorPresentation,emeraldTeaching,emeraldReachFindings} from '../three-d-presentation.js';
import {validateDocument} from '../play-document.js';
import {reviewDocument} from '../tools/emerald-review/examples.mjs';
import {isInNonVolleyZone} from '../court-geometry.js';

const source=JSON.parse(readFileSync(new URL('../docs/builder/examples/eight-shot-drive-drop.json',import.meta.url)));
function feed(key,hand) {
    const doc=reviewDocument(key,hand,source);
    doc.shots=doc.shots.slice(0,1);
    delete doc.shots[0].playerMovement;
    doc.ending='stop';delete doc.outcome;
    return doc;
}
const actor=(timeline,segment,t,hand)=>sampleActorPresentation({timeline,segment,localTime:t,playerId:'player1',
    handedness:hand,instructionalMovement:true,articulatedMotion:true});

test('Smart Add plays the physical lob with the available partner, legal feet and actual bounce order',async()=>{
    for(const hand of ['right','left'])for(const key of ['overhead','lob-chase','lob-miss','lob-out','partner']){
        const doc=feed(key==='partner'?'lob-chase':key,hand),before=structuredClone(doc);
        if(key==='partner'){doc.initialLayout.player2={x:13,y:5};doc.initialLayout.player1={x:3,y:14};}
        const input=structuredClone(doc);
        const proposal=await proposeSmartAdd(doc,{seed:7});
        assert.ok(proposal.ok,proposal.reason);assert.deepEqual(doc,input);validateDocument(proposal.document);
        const compiled=compileEffectiveCandidate(proposal.document),tl=compiled.timeline;
        assert.equal(compiled.validShotCount,proposal.document.shots.length,key);
        const contacts=tl.events.filter(e=>e.type==='contact'),bounces=tl.events.filter(e=>e.type==='bounce');
        if(key==='lob-miss'||key==='lob-out'){
            assert.equal(contacts.length,1);assert.equal(tl.outcome.reason,key==='lob-miss'?'second-bounce':'long');
            assert.ok(tl.events.find(e=>e.type==='dead'));
            if(key==='lob-miss')assert.ok(tl.events.find(e=>e.type==='second-bounce').time>bounces[0].time);
        }else{
            assert.deepEqual(proposal.document.shots[0],before.shots[0]);assert.equal(contacts.length,2);
            assert.equal(contacts[1].actor,key==='partner'?'player2':'player1');
            for(const axis of ['x','y','z'])assert.ok(Math.abs(contacts[1].position[axis]-tl.segments[0].trajectory.end[axis])<1e-8);
            if(key==='lob-chase'){
                assert.ok(bounces[0].time<contacts[1].time);
                assert.equal(tl.segments[1].shotSemantics.contact.kind,'groundstroke');
                assert.equal(proposal.document.shots.at(-1).family,'drop');
                const s=tl.segments[0],run=actor(tl,s,s.duration*.53,hand),plant=actor(tl,s,s.duration,hand);
                assert.ok(run.chasingLob && run.pickupFacing.z<-.7,'turned to run');assert.ok(plant.pickupFacing.z>.9,'set for the return');
            }else if(key==='overhead'){
                const shot=tl.segments[1].shotSemantics;
                assert.ok(!bounces.some(b=>b.time<contacts[1].time));assert.equal(shot.shotType,'overhead');
                assert.ok(shot.contact.feet.every(p=>!isInNonVolleyZone(p)));assert.ok(shot.contact.point.heightFeet<4.66);
            }
        }
    }
});

test('a protected retreat and the saved high overhead retain their geometry',async()=>{
    const doc=feed('lob-chase','right'),movement={intent:'manual',pinned:true,target:{...doc.initialLayout.player1}};
    doc.shots[0].playerMovement={player1:movement,player2:{intent:'hold',pinned:true}};
    const reply=await proposeSmartAdd(doc,{seed:5});
    assert.ok(reply.ok,reply.reason);assert.deepEqual(reply.document.shots,doc.shots);assert.equal(reply.document.shots.length,1);
    const locked=reviewDocument('grounded','right',source);locked.shots[0].contactEvidence={
        feet:[{x:9.5,y:14},{x:10.5,y:14}],feetEstablishedOutsideNVZ:true};
    const saved=JSON.stringify(locked),{timeline}=compileEffectiveCandidate(locked);
    const s=timeline.segments[0],a=actor(timeline,s,s.contactTime,'right');
    assert.equal(JSON.stringify(locked),saved);assert.deepEqual(s.shotSemantics.contact.feet,locked.shots[0].contactEvidence.feet);
    assert.equal(s.shotSemantics.contact.point.heightFeet,7.5);assert.equal(emeraldReachFindings(timeline)[0].severity,'warning');
    assert.match(emeraldTeaching(timeline,a).title,/out of reach/);
});


test('new natural points retain the planted lob policy in the replay recipe',async()=>{
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/model2/generated-timed-stance-9060-v1.json',import.meta.url)));
    const input=structuredClone(fixture.input);
    input.options={...input.options,lobRecovery:'planted-v1'};
    const result=await simulateRally(input);
    assert.equal(result.status,'complete');
    assert.equal(result.document.generation.input.options.lobRecovery,'planted-v1');
    const compiled=compileEffectiveCandidate(result.document),legs=compiled.timeline.segments;
    const replies=legs.filter((s,i)=>i>0 && legs[i-1].shotSemantics.shotType==='lob' && s.shotSemantics.playerId==='player1');
    assert.ok(replies.length>0);
    for(const s of replies){
        const prior=legs[s.rallyLeg-2];
        assert.ok(s.shotSemantics.contact.point.heightFeet<=4.651);
        if(s.shotSemantics.contact.kind==='volley'){
            const forward=result.document.players.player1.team==='green'?1:-1;
            assert.ok((s.shotSemantics.contact.point.y-prior.previous.positions.player1.y)*forward>=-.301);
        }else assert.ok(compiled.timeline.events.some(e=>e.rallyLeg===prior.rallyLeg && e.type==='bounce'));
    }
});
