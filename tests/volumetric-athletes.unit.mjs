import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { AthleteResources, createAthlete, updateAthlete } from '../three-d-athletes.js';
import { sampleActorPresentation } from '../three-d-presentation.js';
import { compilePlayTimeline } from '../three-d-core.js';
import { PICKLEBOARD_PLAYS as plays } from '../play-catalog.js';

const camera={x:9,y:6,z:4};
const sample=(segment,handedness,time)=>sampleActorPresentation({instructionalMovement:true,segment,playerId:segment.shotSemantics.playerId,localTime:time,cameraPosition:camera,handedness});
const sampleReady={worldPosition:{x:1.1,z:-2.7},bodyFacing:{x:0,z:1},action:'ready',phase:'ready',timeSeconds:0};

test('original athletes have court-scale shaped depth, clothing, exposed legs and individuality',()=>{
    const resources=new AthleteResources();
    const cap=createAthlete(resources,'team1','right',0),band=createAthlete(resources,'team2','left',1);
    updateAthlete(cap,sampleReady,camera);updateAthlete(band,sampleReady,camera);
    const bounds=new THREE.Box3().setFromObject(cap.getObjectByName('AthleteTorso'));
    assert.ok(bounds.max.y>1.70&&bounds.max.y<1.85);
    assert.ok(cap.getObjectByName('ClubCap'));assert.ok(band.getObjectByName('Headband'));
    for(const name of ['TaperedJersey','LeftShorts','LeftThigh','LeftShin','LeftSneaker','PaddleFace']) {
        const object=cap.getObjectByName(name);assert.ok(object,`missing ${name}`);
        object.geometry.computeBoundingBox();const size=object.geometry.boundingBox.getSize(new THREE.Vector3());
        assert.ok(size.x>0&&size.y>0&&size.z>0,`${name} needs actual volume`);
    }
    const green=cap.getObjectByName('TaperedJersey').geometry.attributes.color,orange=band.getObjectByName('TaperedJersey').geometry.attributes.color;
    assert.ok(green.getY(0)>green.getX(0));assert.ok(orange.getX(0)>orange.getY(0));
    resources.dispose();
});

test('every built-in shot meets its authoritative contact with either physical hand and grounded feet',()=>{
    const resources=new AthleteResources();
    for(const hand of ['left','right']) {
        const actor=createAthlete(resources,'team1',hand);
        for(const play of plays)for(const segment of compilePlayTimeline(play).segments.filter(s=>s.trajectory)) {
            const pose=sample(segment,hand,segment.contactTime);updateAthlete(actor,pose,camera,1);
            const target=new THREE.Vector3(segment.trajectory.start.x,segment.trajectory.start.y,segment.trajectory.start.z);
            const actual=actor.getObjectByName('PaddleFace').getWorldPosition(new THREE.Vector3());
            assert.ok(actual.distanceTo(target)<1e-7,`${play.id}/${segment.index}/${hand}: actual paddle head must meet ball`);
            assert.equal(actor.position.x,pose.worldPosition.x);assert.equal(actor.position.y,0);assert.equal(actor.position.z,pose.worldPosition.z);
            for(const side of ['left','right'])assert.equal(actor.userData.legs[side].foot.position.y,0);
            assert.ok(Math.abs(actor.userData.arms[hand].hand.position.distanceTo(actor.userData.paddle.position)-.235)<1e-7);
            assert.equal(actor.scale.x,1);assert.equal(actor.userData.visual.scale.x,1);
        }
    }
    resources.dispose();
});

test('authored poses sample continuously and deterministically through contact and recovery',()=>{
    const resources=new AthleteResources(),actor=createAthlete(resources,'team1','right');
    const timeline=compilePlayTimeline(plays.find(p=>p.id==='third-shot-drop'));
    for(const segment of timeline.segments.filter(s=>s.trajectory)) {
        let previous=null;
        for(let time=0;time<=Math.min(segment.duration,.99);time+=1/240) {
            const pose=sample(segment,'right',time),distance=Math.abs(time-segment.contactTime),window=time<segment.contactTime?.18:.22;
            const weight=smooth(Math.max(0,1-distance/window));updateAthlete(actor,pose,camera,weight);
            const point=actor.userData.paddleFaceWorld.clone();
            if(previous)assert.ok(previous.distanceTo(point)<.12,`${segment.index} discontinuity at ${time}`);
            previous=point;const before=actor.userData.paddle.quaternion.clone();updateAthlete(actor,pose,camera,weight);
            assert.ok(point.distanceTo(actor.userData.paddleFaceWorld)<1e-10);assert.ok(before.angleTo(actor.userData.paddle.quaternion)<1e-6);
        }
    }
    resources.dispose();
});
const smooth=t=>t*t*(3-2*t);

test('travel gait lifts the swinging shoe while preserving a planted shoe and authored player root',()=>{
    const resources=new AthleteResources(),actor=createAthlete(resources,'team1','right');
    for(let phase=0;phase<Math.PI*2;phase+=.1) {
        updateAthlete(actor,{...sampleReady,action:'shuffle',phase:'locomotion',travelPhase:phase,travelSpeed:1.9},camera);
        assert.equal(Math.min(actor.userData.legs.left.foot.position.y,actor.userData.legs.right.foot.position.y),0);
        assert.deepEqual(actor.position.toArray(),[1.1,0,-2.7]);
    }
    resources.dispose();
});

test('resources release every owned geometry and material once, including the contact shadow',()=>{
    const resources=new AthleteResources(),actor=createAthlete(resources,'team1','right');
    const owned=new Set();actor.traverse(o=>{if(o.geometry)owned.add(o.geometry);if(o.material)owned.add(o.material);});
    let releases=0;for(const object of owned)object.addEventListener('dispose',()=>releases++);
    resources.dispose();assert.equal(releases,owned.size);resources.dispose();assert.equal(releases,owned.size);
});

test('visible dynamic body triangles match the articulated sources without allocating GPU resources each frame',()=>{
    const resources=new AthleteResources(),actor=createAthlete(resources,'team2','left');
    const geometries=resources.geometries.size,materials=resources.materials.size+resources.extraMaterials.size;
    const segment=compilePlayTimeline(plays.find(p=>p.id==='third-shot-drive')).segments.find(s=>s.shotSemantics?.stroke==='drive');
    for(const time of [Math.max(0,segment.contactTime-.17),segment.contactTime,segment.contactTime+.17]) {
        updateAthlete(actor,sample(segment,'left',time),camera,time===segment.contactTime?1:0);
        const {batch,parts}=actor.userData.bodyBatch,attribute=batch.geometry.attributes.position;
        assert.equal(batch.visible,true);assert.equal(batch.material.vertexColors,true);
        for(const part of parts) {
            assert.equal(part.source.visible,false);
            for(const i of [0,Math.floor(part.count/2),part.count-1]) {
                const expected=new THREE.Vector3().fromArray(part.positions,i*3).applyMatrix4(part.source.matrixWorld);
                const actual=new THREE.Vector3().fromBufferAttribute(attribute,part.start+i).applyMatrix4(batch.matrixWorld);
                assert.ok(actual.distanceTo(expected)<1e-6,`${part.source.name} visible triangles must follow the actual articulated pose`);
            }
        }
        assert.equal(resources.geometries.size,geometries);assert.equal(resources.materials.size+resources.extraMaterials.size,materials);
    }
    resources.dispose();
});
