import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.min.js';
import {GLTFLoader} from '../vendor/three-addons/loaders/GLTFLoader.js';
import {createEmeraldAthlete} from '../emerald-athlete.js';
import {readyAim} from '../emerald-motion.js';
import {sampleActorPresentation} from '../three-d-presentation.js';
import {samplePlayBall} from '../three-d-core.js';
import {compileEffectiveCandidate} from '../rally-proposals.js';
import {emeraldGeometryKernel} from './helpers/emerald-geometry.mjs';
import {reviewDocument} from '../tools/emerald-review/examples.mjs';
import {readModel2Fixture} from './fixtures/model2/cases.mjs';

const source=JSON.parse(readFileSync(new URL('../docs/builder/examples/eight-shot-drive-drop.json',import.meta.url)));
const bytes=readFileSync(new URL('../assets/athletes/emerald-cap.glb',import.meta.url));
const audit=emeraldGeometryKernel(THREE);
const load=async()=>createEmeraldAthlete(await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''));

test('the head leads a reversal while the ready grip shades within the front of the stance',()=>{
    for(const hand of [-1,1]) for(const half of [-1,1]) {
        const root={x:0,y:0,z:-3*half}, az=half===1?0:Math.PI;
        const ball=x=>({x:x*half,y:1,z:3*half});
        const aim=xs=>readyAim(xs.map(ball),root,az,hand,half);
        const left=aim([-4,-4,-4]),middle=aim([0,0,0]),right=aim([4,4,4]);
        assert.ok(left.head*hand<-.4 && right.head*hand>.4 && Math.abs(middle.head)<1e-8);
        assert.ok(left.paddle*hand<-.19 && right.paddle*hand>.19);
        const reverse=aim([4,-4,-4]);
        assert.ok(reverse.head*hand>0 && reverse.paddle*hand<0);
        const far=aim([500,500,500]);
        assert.ok(Math.abs(far.head)<=.72 && Math.abs(far.paddle)<=.4);
        const behind=readyAim(Array(3).fill({...ball(4),z:root.z-half}),root,az,hand,half);
        assert.equal(behind.paddle,0);
        assert.ok(Math.abs(behind.head)<1e-8);
    }
});

test('stance shoes anchor between model-2 footprints and remain exact on recorded contact and momentum',()=>{
    const timeline=compileEffectiveCandidate(readModel2Fixture('earlier-momentum-overrides-later-fault')).timeline;
    let swingSamples=0,groundedChecks=0;
    for(const s of timeline.segments) for(const id of ['player1','player2','player3','player4']) {
        const sample=(t,move)=>sampleActorPresentation({segment:s,timeline,localTime:t,playerId:id,
            handedness:'right',instructionalMovement:true,articulatedMotion:move});
        let prev=null;
        for(const t of Array.from({length:121},(_,i)=>s.duration*i/120).concat(s.contactTime)) {
            const a=sample(t,false),b=sample(t,true);
            assert.deepEqual(a.worldPosition,b.worldPosition);assert.deepEqual(a.bodyFacing,b.bodyFacing);
            const recorded=s.model2Momentum.some(m=>m.actor===id&&m.contactTime<=s.startTime+t+1e-9);
            if(recorded || (s.shotSemantics.playerId===id&&Math.abs(t-s.contactTime)<1e-9)){
                assert.deepEqual(b.footTargets,a.footTargets);groundedChecks++;
            }
            const feet=Object.values(b.footTargets);
            if(!recorded&&prev&&feet.some(f=>f.y>.005)) {
                const grounded=feet.findIndex(f=>f.y<1e-8);
                assert.notEqual(grounded,-1);
                if(prev[grounded].y<1e-8 && t!==s.contactTime){
                    assert.ok(Math.hypot(feet[grounded].x-prev[grounded].x,feet[grounded].z-prev[grounded].z)<1e-6);
                    swingSamples++;
                }
            }
            prev=feet;
        }
    }
    assert.ok(groundedChecks>10 && swingSamples>10);
});

test('real rally sweeps keep the skin and paddle rigid through contact, recovery and the high overhead',async()=>{
    const actor=await load(),pos=n=>actor.getObjectByName(n).getWorldPosition(new THREE.Vector3());
    const arm=()=>pos('UpperArmR').distanceTo(pos('ForearmR'))+pos('ForearmR').distanceTo(pos('HandR'));
    const armLength=arm();
    try {
        for(const hand of ['right','left']) for(const key of ['dink','drive','backhand','lob','overhead','approach','grounded','lob-chase','backhand-dink']){
            const doc=reviewDocument(key,hand,source),{timeline,validShotCount}=compileEffectiveCandidate(doc);
            assert.equal(validShotCount,doc.shots.length);
            actor.userData.handedness=hand;
            const strike=timeline.segments.find(s=>s.shotSemantics.playerId==='player1'),impact=strike.startTime+strike.contactTime;
            const at=t=>{
                const s=timeline.segments.find(s=>s.endTime>t+1e-9)||timeline.segments.at(-1),local=t-s.startTime;
                const state=sampleActorPresentation({timeline,segment:s,localTime:local,playerId:'player1',handedness:hand,
                    instructionalMovement:true,articulatedMotion:true});
                const distance=s.shotSemantics.playerId==='player1'?Math.abs(local-s.contactTime):
                    s.nextShotSemantics?.playerId==='player1'?s.duration-local:Infinity;
                const w=Math.max(0,1-distance/(local<s.contactTime?.18:.22));
                actor.userData.applyPose(state,w*w*(3-2*w),[t,t-.07,t-.16].map(t=>samplePlayBall(timeline,Math.max(0,t))));
                assert.ok(Math.abs(arm()/armLength-1)<.001,key+' arm');
                const skin=audit(actor);
                assert.ok(skin.shoeBottoms.every(y=>y>=-.00001),key+' floor');
                if(key==='approach' && !state.splitLift) {
                    const sides=hand==='right'?['left','right']:['right','left'];
                    skin.paintedSoles.forEach((ring,i)=>{
                        const foot=state.footTargets[sides[i]];
                        if(foot.y>1e-6)return;
                        const axis=k=>ring.reduce((sum,p)=>sum+p[k],0)/ring.length;
                        assert.ok(Math.hypot(axis(0)-foot.x,axis(1)-foot.y,axis(2)-foot.z)<1e-6,'planted rubber sole');
                    });
                }
                return pos('PaddleFace');
            };
            for(let t=0;t<timeline.duration;t+=1/45)at(t);
            const face=at(impact),geometry=audit(actor),ball=new THREE.Vector3().copy(samplePlayBall(timeline,impact));
            assert.ok(geometry.rigidPaddleError()<1e-6);
            if(key==='grounded'){
                assert.ok(geometry.shoeBottoms.every(y=>Math.abs(y)<1e-6));
                assert.ok(geometry.paddleDistance(ball)>.2);
            }else{
                assert.ok(geometry.paddleDistance(ball)<.037);
                if(key==='overhead')assert.ok(geometry.shoeBottoms.every(y=>Math.abs(y)<1e-6),'reachable planted overhead');
            }
            at(timeline.duration);assert.ok(at(impact).distanceTo(face)<1e-7);
        }
    } finally{actor.userData.dispose();}
});
