import test from 'node:test';
import assert from 'node:assert/strict';
import { contactFeetV1, contactFeetCandidatesV1 } from '../rally-movement.js';
import { solveFlightV2, PHYSICS_V2 } from '../play-physics-v2.js';
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const mirror = p => ({x:20-p.x,y:44-p.y});

test('bounded outgoing stances preserve the first pose, hands, feet, real origin metadata and determinism', () => {
  for (const team of ['green','orange']) for (const handedness of ['left','right']) for (const contactStyle of ['forehand','backhand']) for (const kind of ['groundstroke','volley']) {
    const transform = team === 'green' ? p=>p : mirror;
    const args = { contact:transform({x:10,y:13}), target:transform({x:12,y:37}), position:transform({x:8,y:7}),team,handedness,contactStyle,kind,availableSeconds:2 };
    const result = contactFeetCandidatesV1(args);
    assert.deepEqual(result[0],contactFeetV1(args));
    assert.deepEqual(result,contactFeetCandidatesV1(args));
    assert.ok(Object.isFrozen(result)); assert.ok(result.length>1 && result.length<=8);
    assert.equal(new Set(result.map(p=>JSON.stringify(p.stance))).size,result.length);
    const side = (team==='green'?1:-1)*(handedness==='right'?1:-1)*(contactStyle==='backhand'?-1:1);
    for (const pose of result) {
      assert.ok(Object.isFrozen(pose.feet[0])); assert.equal(pose.grounded,true); assert.equal(pose.reachable,true);
      assert.ok(side*(pose.stance.x-args.contact.x)>=.15-1e-7);
      assert.ok(distance(pose.stance,args.contact)>=.9-1e-7 && distance(pose.stance,args.contact)<=3);
      assert.ok(pose.stance.x>=-7.5 && pose.stance.x<=27.5);
      assert.ok(team==='green'?pose.stance.y<=21.99:pose.stance.y>=22.01);
      assert.equal(pose.travelFeet,distance(args.position,pose.stance));
      assert.equal(pose.arrivalPeakFeetPerSecond,pose.travelFeet);
      assert.equal(pose.routeReachable,pose.travelFeet<=18+1e-7);
      assert.equal(pose.feet.length,2);
      assert.ok(Math.abs(distance(pose.feet[0],pose.feet[1])-.84)<1e-7);
      if(kind==='volley') { assert.equal(pose.legalVolleyFeet,true); assert.ok(pose.feet.every(p=>p.x<0||p.x>20||p.y<15||p.y>29)); }
    }
  }
});

test('invalid coordinates and time fail, zero time reports actual travel and serves retain layout',()=>{
  const args={contact:{x:10,y:5},target:{x:10,y:35},team:'green',position:{x:12,y:8}};
  for(const key of ['contact','target','position']) assert.throws(()=>contactFeetCandidatesV1({...args,[key]:{x:NaN,y:0}}),TypeError);
  for(const availableSeconds of [-1,Infinity,NaN]) assert.throws(()=>contactFeetCandidatesV1({...args,availableSeconds}),TypeError);
  for(const pose of contactFeetCandidatesV1({...args,availableSeconds:0})) { assert.equal(pose.routeReachable,false); assert.equal(pose.arrivalPeakFeetPerSecond,null); }
  assert.deepEqual(contactFeetCandidatesV1({...args,kind:'serve'}),[contactFeetV1({...args,kind:'serve'})]);
});

test('mirrored controlled nominal outgoing flights clear an alternative with the unchanged torso radius',()=>{
  for(const team of ['green','orange']) {
    const transform=team==='green'?p=>p:mirror;
    const contact=transform({x:14.699,y:-1.268}),target=transform({x:14.699,y:38});
    const args={contact,target,position:transform({x:14.974,y:1.720}),team};
    const poses=contactFeetCandidatesV1(args);
    const flight=solveFlightV2({from:{...contact,heightFeet:3},target,family:'return'});
    const minimum=pose=>{
      // Each solver stage is linear in x/y: project onto its exact segment.
      let min=Infinity;
      for(const stage of flight.stages) {
        const start=flight.sampleBoard(stage.startTime),end=flight.sampleBoard(stage.endTime);
        const dx=end.x-start.x,dy=end.y-start.y;
        const fraction=Math.max(0,Math.min(1,((pose.stance.x-start.x)*dx+(pose.stance.y-start.y)*dy)/(dx*dx+dy*dy)));
        min=Math.min(min,distance(pose.stance,{x:start.x+fraction*dx,y:start.y+fraction*dy}));
      }
      return min;
    };
    assert.ok(minimum(poses[0])<.6+PHYSICS_V2.ballRadiusFeet,'nearest stance retains the controlled self-hit path');
    assert.ok(poses.slice(1).some(p=>minimum(p)>.6+PHYSICS_V2.ballRadiusFeet),'a bounded alternative clears the entire outgoing path');
  }
});
