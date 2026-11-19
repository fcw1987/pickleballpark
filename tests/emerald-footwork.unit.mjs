import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.min.js';
import {GLTFLoader} from '../vendor/three-addons/loaders/GLTFLoader.js';
import {COURT_ATHLETES} from '../court-athlete-roster.js';
import {createCourtAthlete} from '../emerald-athlete.js';
import {createStarterDocument} from '../play-document.js';
import {simulateRally} from '../rally-engine.js';
import {compileEffectiveCandidate} from '../rally-proposals.js';
import {sampleActorPresentation} from '../three-d-presentation.js';
import {samplePlayBall} from '../three-d-core.js';
import {reviewDocument} from '../tools/emerald-review/examples.mjs';
import {emeraldGeometryKernel} from './helpers/emerald-geometry.mjs';

const source=JSON.parse(readFileSync(new URL('../docs/builder/examples/eight-shot-drive-drop.json',import.meta.url)));
const audit=emeraldGeometryKernel(THREE);
const roster=await Promise.all(COURT_ATHLETES.map(async ({key},seat)=>{
    const bytes=readFileSync(new URL('../assets/athletes/'+key+'.glb',import.meta.url));
    const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    return createCourtAthlete(model,seat);
}));
after(()=>roster.forEach(actor=>actor.userData.dispose()));

function replay(doc,seat) {
    const {timeline,validShotCount}=compileEffectiveCandidate(doc);
    assert.equal(validShotCount,doc.shots.length);
    const id='player'+(seat+1),actor=roster[seat],hand=doc.players[id].handedness;
    actor.userData.handedness=hand;
    function at(segment,localTime) {
        const t=segment.startTime+localTime;
        const sample=sampleActorPresentation({timeline,segment,localTime,playerId:id,handedness:hand,
            instructionalMovement:true,articulatedMotion:true});
        const offset=segment.shotSemantics.playerId===id?Math.abs(localTime-segment.contactTime):
            segment.nextShotSemantics?.playerId===id?segment.duration-localTime:Infinity;
        const w=Math.max(0,1-offset/(localTime<segment.contactTime?.18:.22));
        const trail=[0,.07,.16].map(delay=>samplePlayBall(timeline,Math.max(0,t-delay)));
        actor.userData.applyPose(sample,w*w*(3-2*w),trail);
        return audit(actor);
    }
    return {timeline,at};
}

const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const center=ring=>ring.reduce((sum,p)=>sum.map((x,i)=>x+p[i]/ring.length),[0,0,0]);
const soleDrift=(a,b)=>Math.max(...a.map((p,i)=>horizontal(p,b[i])));

// Follow painted rubber vertices. A common split hop doesn't count as a travel step.
function strides(scene,leg) {
    const s=scene.timeline.segments[leg],steps=[],start=scene.at(s,0).paintedSoles.map(center);
    let previous,minGap=Infinity,slide=0,crossed=false,lastLanding=0;
    const n=Math.ceil(s.duration*120);
    for(let i=0;i<=n;i++) {
        const t=s.duration*i/n,{paintedSoles,shoeBottoms}=scene.at(s,t);
        const centers=paintedSoles.map(center),low=Math.min(...shoeBottoms);
        const air=shoeBottoms.map(y=>y-low>.007);
        minGap=Math.min(minGap,horizontal(...centers));
        crossed ||= (centers[0][0]-centers[1][0]) * Math.sign(start[0][0]-start[1][0]) < -.02;
        if(previous)for(const foot of [0,1]) {
            if(air[foot]&&!previous.air[foot])steps.push(foot);
            if(!air[foot]&&previous.air[foot])lastLanding=t;
            if(Math.abs(shoeBottoms[foot])<1e-6 && Math.abs(previous.shoeBottoms[foot])<1e-6)
                slide=Math.max(slide,soleDrift(paintedSoles[foot],previous.paintedSoles[foot]));
        }
        previous={air,paintedSoles,shoeBottoms};
    }
    assert.ok(slide<1e-5,'a planted toe or heel moved '+slide+' m');
    assert.ok(steps.every((foot,i)=>!i || foot!==steps[i-1]),'alternating supports');
    return {start,steps,minGap,crossed,settled:s.duration-lastLanding};
}

test('a one-foot lateral shade leads with the outside shoe and gathers in both directions',()=>{
    for(const [seat] of roster.entries())for(const hand of ['right','left'])for(const direction of [-1,1]) {
        const doc=reviewDocument('tracking',hand,source,seat),id='player'+(seat+1);
        const p=doc.initialLayout[id];
        doc.shots[0].playerMovement={[id]:{intent:'manual',pinned:false,target:{x:p.x+direction,y:p.y}}};
        const scene=replay(doc,seat),s=scene.timeline.segments[0];
        const {start,steps,minGap,crossed}=strides(scene,0);
        const end=scene.at(s,s.duration).paintedSoles.map(center);
        const dx=end[0][0]-start[0][0],outside=(start[0][0]-start[1][0])*dx>0?0:1;
        assert.ok(Math.abs(Math.abs(dx)-.3048)<.001,'one court foot');
        assert.deepEqual(steps,[outside,1-outside],id+' '+hand+' shade '+direction);
        assert.ok(minGap>.38 && !crossed,'balanced square shuffle');
    }
});

test('a wide seeded cover crosses over and a third-shot approach shortens into a plant',async()=>{
    const seed=await simulateRally({seed:13,options:{lobRecovery:'planted-v2',pairPositioning:'ball-side-v1'}});
    const wide=strides(replay(seed.document,3),6);
    assert.ok(wide.crossed && wide.minGap>.18,'clear crossover on a five-foot cover');
    assert.ok(wide.steps.length>=4 && wide.steps.length<=6 && wide.settled>.07,'wide cover cadence and brake');
    const approach=strides(replay(createStarterDocument({demonstrateTeamMovement:true}),1),2);
    assert.ok(approach.steps.length>=4 && approach.steps.length<=6 && approach.settled>.07,'six-foot approach and brake');
    assert.ok(approach.minGap>.25 && !approach.crossed);
});

test('a deep lob turns into a run and settles both soles through the bounced return',()=>{
    for(const [seat] of roster.entries())for(const hand of ['right','left']) {
        const scene=replay(reviewDocument('lob-chase',hand,source,seat),seat);
        const [lob,reply]=scene.timeline.segments,feet=strides(scene,0);
        assert.equal(reply.shotSemantics.contact.kind,'groundstroke');
        const bounce=scene.timeline.events.find(e=>e.type==='bounce');
        const impact=reply.startTime+reply.contactTime;
        assert.ok(bounce && bounce.time<impact);
        assert.ok(feet.crossed && feet.minGap>.17,'shoes clear one another on the turn');
        assert.ok(feet.steps.length>=6 && feet.steps.length<=8 && feet.settled>.075,'nine-foot retreat and plant');
        const plant=scene.at(lob,lob.duration-.06).paintedSoles;
        for(const [s,t] of [[lob,lob.duration],[reply,reply.contactTime],[reply,reply.contactTime+.06]]) {
            const geometry=scene.at(s,t);
            assert.ok(geometry.shoeBottoms.every(y=>Math.abs(y)<1e-6));
            assert.ok(geometry.paintedSoles.every((ring,i)=>soleDrift(ring,plant[i])<1e-5),'both shoes stay through contact');
            if(s===reply && t===reply.contactTime)
                assert.ok(geometry.paddleDistance(new THREE.Vector3().copy(samplePlayBall(scene.timeline,impact)))<.037);
        }
    }
});
