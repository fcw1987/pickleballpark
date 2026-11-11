import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {contactFeetCandidatesV1} from '../rally-movement.js';
import {GENERATED_DEFAULT_FOOT_STATE_V1} from '../generated-foot-state.js';
import {groundedSoleClearsNVZV1} from '../generated-grounded-sole.js';
import {assessGeneratedTrainerSupportV1} from '../generated-trainer-support.js';
import {evaluateTrainerContactSupport} from '../trainer-contact-support.js';
import {solveFlightV2} from '../play-physics-v2.js';
import {planRallyFlightV1} from '../rally-flight-planner.js';
import {assessGeneratedFlightFeasibilityV1} from '../rally-flight-audit.js';
import {simulateRally,runNaturalAttemptV1} from '../rally-engine.js';
import {createEngineDriverV1} from '../rally-engine-driver.js';
import {createRallyRandomV1} from '../rally-random.js';
import {assertFreshPhysicalResult} from './helpers/rally-procedural-proof.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/model2/generated-above-head-stance-v1.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const near=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
function inward(input,radius=.6){
  const out=structuredClone(input),dx=out.root.x-out.contact.x,dz=out.root.z-out.contact.z;
  const scale=radius*.3048/Math.hypot(dx,dz),x=out.contact.x+dx*scale,z=out.contact.z+dz*scale;
  for(const side of ['left','right']){out.feet[side].x+=x-out.root.x;out.feet[side].z+=z-out.root.z;}
  out.root.x=x;out.root.z=z;out.coachingFootwork.feet=structuredClone(out.feet);return out;
}
function mirrored(input,rotation,lateral){
  const out=structuredClone(input),sx=(rotation?-1:1)*(lateral?-1:1),sz=rotation?-1:1;
  const point=p=>p&&({...p,x:p.x*sx,z:p.z*sz});
  for(const key of ['root','contact','bodyFacing','incomingVelocity','outgoingVelocity'])out[key]=point(out[key]);
  out.feet={left:point(input.feet[lateral?'right':'left']),right:point(input.feet[lateral?'left':'right'])};
  out.coachingFootwork.feet=structuredClone(out.feet);
  for(const side of ['left','right']){
    const old=input.coachingFootwork.footYaw[lateral?(side==='left'?'right':'left'):side];
    out.coachingFootwork.footYaw[side]=Math.atan2(Math.sin(old)*sx,Math.cos(old)*sz);
  }
  if(lateral)out.handedness=out.handedness==='right'?'left':'right';return out;
}

for(const team of ['green','orange'])for(const handedness of ['left','right'])for(const contactStyle of ['forehand','backhand']){
  test(`above-head proposals preserve lower, legacy, serve and nearest plants (${team}/${handedness}/${contactStyle})`,()=>{
    const sign=team==='green'?1:-1,hand=(handedness==='right'?1:-1)*(contactStyle==='backhand'?-1:1);
    for(const heightFeet of [.8,2.2,5.5,6.9,6.999999,7,7.5]){
      const contact={x:10,y:team==='green'?10:34,heightFeet};
      const args={contact,target:{x:team==='green'?18:2,y:team==='green'?34:10},team,handedness,contactStyle,kind:'volley',
        position:{x:10+sign*hand*.8,y:contact.y-sign*.8},availableSeconds:1,defaultFootState:GENERATED_DEFAULT_FOOT_STATE_V1};
      const before=JSON.stringify(args),key=[team,handedness,contactStyle,heightFeet].join('/'),rows=contactFeetCandidatesV1(args);
      assert.equal(JSON.stringify(args),before);assert.ok(rows.length<=8);
      assert.equal(hash(rows[0]),fixture.preserved[`${key}/nearest`]);
      if(heightFeet<7)assert.equal(hash(rows),fixture.preserved[`${key}/generated`]);
      else assert.ok(rows.some(r=>r.routeReachable&&Math.abs(r.bodyClearanceFeet-.6)<1e-7));
      for(const r of rows.filter(r=>r.reachable&&r.legalVolleyFeet)){
        assert.ok(r.feet.every(groundedSoleClearsNVZV1));
        assert.ok(sign*hand*(r.stance.x-contact.x)>=.15-1e-7);
        near(Math.abs(r.feet[0].x-r.feet[1].x),1.44,1e-8);
      }
      const legacy={...args};delete legacy.defaultFootState;
      assert.equal(hash(contactFeetCandidatesV1(legacy)),fixture.preserved[`${key}/legacy`]);
      assert.equal(hash(contactFeetCandidatesV1({...args,kind:'serve'})),fixture.preserved[`${key}/serve`]);
    }
  });
}

for(const row of fixture.cases){
  test(`historical fixed delivery gains support from an inward plant, not wider anatomy (${row.id})`,()=>{
    const before=JSON.stringify(row.original),nominal=evaluateTrainerContactSupport(row.original.nominalInput);
    const original=evaluateTrainerContactSupport(row.original.bestDeliveredInput);
    assert.equal(nominal.feasible,true);assert.equal(original.feasible,false);
    near(original.reachError,row.original.bestDeliveredReachError,1e-12);
    for(const input of [row.original.nominalInput,row.original.bestDeliveredInput])for(const rotation of [false,true])for(const lateral of [false,true]){
      const closer=mirrored(inward(input),rotation,lateral),result=evaluateTrainerContactSupport(closer);
      assert.equal(result.feasible,true);near(result.reachError,0,1e-12);assert.ok(result.legError<1e-7);
      assert.deepEqual(closer.contact,mirrored(input,rotation,lateral).contact,'the contact itself does not move');
    }
    assert.equal(JSON.stringify(row.original),before);
  });

  test(`ordinary nominal directions retain support in hand and court mirrors (${row.id})`,()=>{
    const old=row.original,incoming=solveFlightV2(old.incoming),root=inward(old.nominalInput).root;
    const stance={x:root.x/.3048+10,y:root.z/.3048+22};
    const dx=stance.x-old.stance.x,dy=stance.y-old.stance.y,feet=old.feet.map(p=>({x:p.x+dx,y:p.y+dy}));
    for(const target of [old.nominalTarget,...[3,10,17].map(x=>({x,y:old.contact.y<22?27:17}))]){
      const planner=planRallyFlightV1({from:old.contact,target,family:'drop',intent:'drop',quality:'neutral',
        pace:'soft',arc:'high',preferred:old.nominalPhysics,style:row.input.players.player1.style});
      assert.equal(planner.status,'solved');assert.ok(planner.diagnostics.solverCalls<=6);
      for(const rotation of [false,true])for(const lateral of [false,true]){
        let supported=0;
        for(const solution of planner.solutions){
          const pose=assessGeneratedTrainerSupportV1({contact:old.contact,stance,feet,handedness:old.handedness,strokeSide:old.strokeSide,
            family:'drop',kind:old.kind,outgoingFlight:solution.flight,incomingFlight:incoming,incomingTimeSeconds:old.incomingTimeSeconds,nearCourt:old.contact.y<22});
          assert.equal(pose.supported,true);
          const mirror=evaluateTrainerContactSupport(mirrored(pose.input,rotation,lateral));
          assert.equal(mirror.feasible,pose.feasible);near(mirror.reachError,pose.reachError,1e-12);
          if(mirror.feasible)supported++;
        }
        assert.ok(supported>0,'an ordinary nominal direction has supported bounded timing');
      }
    }
  });

  test(`high-only generation completes with fixed execution draws and fresh physical gates (${row.id})`,async()=>{
    const boundaries=[];
    const simulate=createEngineDriverV1((normalized,context)=>runNaturalAttemptV1(normalized,{...context,random:{...context.random,
      execution:()=>{boundaries.push(context.random.snapshot().draws);return context.random.execution();}}}),{yieldControl:async()=>{}});
    const input=structuredClone(row.input),before=JSON.stringify(input),result=await simulate(input);
    assert.equal(result.status,'complete',result.diagnostics.code);assert.equal(result.diagnostics.attempts,1);
    assert.equal(result.decisions.length,row.expected.shots);assert.equal(result.outcome.reason,row.expected.reason);
    assert.equal(boundaries.length,2*result.decisions.length,'exactly one quality/error pair per actual contact');
    assert.equal(hash(result.decisions.slice(0,row.priorContacts)),row.priorDecisionsSha256,'all prior decisions and draws are unchanged');
    const random=createRallyRandomV1(input.seed);
    for(const d of result.decisions){
      assert.deepEqual(d.draws.execution,{quality:random.execution(),error:random.execution()});
      const executed=d.resolution.choiceAttempts.filter(a=>a.executionDraws);
      assert.equal(executed.length,1);assert.deepEqual(executed[0].executionDraws,d.draws.execution);
    }
    const d=result.decisions[row.priorContacts];
    assert.deepEqual(d.draws.execution,row.oldFailure.executionDraws);
    assert.equal(d.execution.quality,row.oldFailure.quality);assert.equal(d.execution.errorReason,row.oldFailure.error);
    // A better nominal plant can finish the existing bounded target search
    // sooner. Its later perturbation pair therefore need not be the old pair.
    for(const boundary of boundaries.slice(row.priorContacts*2,row.priorContacts*2+2))assert.equal(boundary.target,row.expected.targetDrawIndex);
    assert.ok(row.expected.targetDrawIndex<row.oldFailure.targetDrawIndex);
    assert.deepEqual(d.draws.perturbation,row.expected.perturbation);
    assert.notDeepEqual(d.draws.perturbation,row.oldFailure.perturbation);
    assert.deepEqual(d.resolution.target,row.expected.target);assert.notDeepEqual(d.resolution.target,row.oldFailure.target);
    assert.deepEqual(d.resolution.nominalSafety.nominal.target,row.expected.nominal);
    assert.deepEqual(d.resolution.nominalSafety.nominal.physics,row.expected.nominalPhysics);
    assert.deepEqual(d.resolution.actualFeet,row.expected.feet);
    near(Math.hypot(d.situation.contact.x-row.expected.stance.x,d.situation.contact.y-row.expected.stance.y),.6,1e-8);
    const {compiled}=assertFreshPhysicalResult(result);
    assert.equal(assessGeneratedFlightFeasibilityV1({document:result.document,compiled}).status,'PASS');
    assert.equal(result.diagnostics.validation.groundedSoles.valid,true);assert.equal(result.diagnostics.validation.footApron.valid,true);
    assert.equal(JSON.stringify(input),before);
    const repeat=await simulateRally(input);
    for(const key of ['status','document','outcome','decisions'])assert.deepEqual(repeat[key],result[key]);
  });
}
