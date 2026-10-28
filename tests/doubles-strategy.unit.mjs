import test from 'node:test';
import assert from 'node:assert/strict';
import { doublesRecovery, compileDocument, automaticActorPeakSpeed } from '../play-compiler.js';
import { sampleActorPresentation } from '../three-d-presentation.js';
import { FEET_TO_METERS } from '../three-d-core.js';
import { createStarterDocument } from '../play-document.js';
import { proposeRandomRally } from '../smart-rally-generator.js';
import { compileEffectiveCandidate, evaluateCandidate } from '../rally-proposals.js';

const ids = ['player1', 'player2', 'player3', 'player4'];
test('automatic doubles recovery shades both pairs, approaches behind soft shots, and bounds every move', () => {
  const document = createStarterDocument();
  const positions = { player1: {x:5,y:5}, player2:{x:15,y:5}, player3:{x:5,y:30},player4:{x:15,y:30} };
  const result = doublesRecovery(positions, {players:document.players,hitter:'player1',family:'drop',target:{x:17,y:26},seconds:.5,index:2});
  for (const id of ids) {
    assert.ok(result[id].x > positions[id].x, `${id} shades right`);
    assert.ok(Math.hypot(result[id].x-positions[id].x,result[id].y-positions[id].y) <= 4.5+1e-9);
  }
  assert.ok(result.player2.y > positions.player2.y, 'off-ball partner approaches behind the drop');
  const pinned = doublesRecovery(positions, {players:document.players,hitter:'player1',family:'drop',target:{x:17,y:26},seconds:1,index:2,protectedIds:new Set(['player2'])});
  assert.deepEqual(pinned.player2, positions.player2);
  assert.deepEqual(positions.player1,{x:5,y:5});
  const left=doublesRecovery(positions,{players:document.players,hitter:'player1',family:'drop',target:{x:3,y:26},seconds:.5,index:2});
  for(const id of ids) assert.ok(left[id].x < positions[id].x,'off-ball shading follows the changed ball lane');
});

test('serve recovery keeps the serving pair back for the mandatory return bounce', () => {
  const document=createStarterDocument();
  const result=doublesRecovery(document.initialLayout,{players:document.players,hitter:'player3',family:'return',target:{x:5,y:5},seconds:1,index:1});
  assert.equal(result.player1.y,document.initialLayout.player1.y);
  assert.equal(result.player2.y,document.initialLayout.player2.y);
  assert.ok(result.player3.y < document.initialLayout.player3.y);
});

test('long seeded doubles rallies naturally use all four players and move off-ball partners', async () => {
  for (const seed of [1,2,17,42,1234]) {
    const proposal=await proposeRandomRally({length:60,seed});
    assert.equal(proposal.ok,true,`${seed}: ${proposal.reason}`);
    const document=proposal.document, before=structuredClone(document);
    const compiled=compileDocument(document);
    assert.equal(compiled.validShotCount,60);
    assert.equal(document.initialLayout.player4.y,30,'receiving partner starts at the kitchen line');
    for (const id of ['player1','player2']) {
      assert.ok(compiled.play.steps[1].positions[id].y < 3,'serving pair remains back through serve');
      assert.ok(compiled.play.steps[2].positions[id].y < 10,'servers wait for the deep return bounce rather than rushing the kitchen');
    }
    for (const segment of compiled.timeline.segments) {
      for (const id of ids) {
        const from=segment.previous.positions[id],to=segment.step.positions[id];
        assert.ok(2*Math.hypot(to.x-from.x,to.y-from.y)<=segment.duration*18+1e-8,`${seed}/${segment.step.id}/${id}: bounded peak speed during eased playback`);
        assert.ok(automaticActorPeakSpeed(segment,id,document.players[id].handedness)<=18+1e-8,`${seed}/${segment.step.id}/${id}: bounded production actor route`);
      }
      for (const pair of [['player1','player2'],['player3','player4']]) {
        const [a,b]=pair.map(id=>segment.step.positions[id]);
        assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=2.5,`${seed}/${segment.step.id}: teammates retain playing space`);
      }
    }
    for(const pair of [['player1','player2'],['player3','player4']]) assert.ok(compiled.play.steps.slice(5).some(step=>pair.every(id=>Math.abs(step.positions[id].y-22)<10)),'each pair establishes net position later in rally');
    assert.deepEqual(document,before,'compilation never rewrites saved intent');
    for(const id of ids) {
      assert.ok(document.shots.filter(shot=>shot.hitter===id).length>=4,`${seed}: ${id} participates`);
      const offball=compiled.play.steps.slice(1).filter((step,index)=>step.shot.playerId!==id && compiled.play.steps[index+2]?.shot?.playerId!==id && Math.hypot(step.positions[id].x-compiled.play.steps[index].positions[id].x,step.positions[id].y-compiled.play.steps[index].positions[id].y)>.05);
      assert.ok(offball.length>=3,`${seed}: ${id} recovers away from contact`);
    }
    for (const shot of document.shots.filter(shot=>['dink','drop','reset'].includes(shot.family))) assert.ok(Math.min(shot.target.y,44-shot.target.y)>=16,'soft ball lands in kitchen');
  }
});

test('historical automatic advances and authored movement retain their existing compiled positions', () => {
  const document=createStarterDocument();
  const baseline=compileDocument(document);
  for(const shot of document.shots) shot.authoring={ownership:'automatic',fields:['movement']};
  document.generation={mode:'random',generatorVersion:'smart-rally-v1',seed:0,requestedHits:3};
  assert.deepEqual(compileDocument(document).play.steps,baseline.play.steps);
  document.shots[1].generation={seed:0,generatorVersion:'smart-rally-v2'};
  document.shots[1].movement={intent:'manual',pinned:true,target:{x:5,y:36}};
  const source=structuredClone(document);
  const compiled=compileDocument(document);
  assert.deepEqual(compiled.play.steps[2].positions.player3,{x:5,y:36});
  assert.deepEqual(document,source);
});

test('Auto Shading preserves generated doubles spacing and repeats from the base plan without compounding', async () => {
  let safeShadingApplied = false, fallbackUsed = false;
  for (const length of [7, 60, 99]) for (const seed of [0, 42, 1234]) {
    const proposal = await proposeRandomRally({length, seed});
    assert.equal(proposal.ok, true, proposal.reason);
    const document = proposal.document, source = structuredClone(document);
    const base = compileEffectiveCandidate(document);
    document.assistance = {autoShading:true,showGuides:true,team:'both'};
    const assistedSource = structuredClone(document);
    const evaluated = evaluateCandidate(document), assisted = evaluated.compiled;
    assert.equal(evaluated.ok, true, `${length}/${seed}: ${evaluated.reason}`);
    assert.equal(JSON.stringify(compileEffectiveCandidate(document)), JSON.stringify(assisted), 'recompilation starts from the same base');
    assert.deepEqual(document, assistedSource, 'assistance leaves source intent unchanged');
    assert.deepEqual(document.shots, source.shots);
    for (const compiled of [base, assisted]) for (const segment of compiled.timeline.segments) {
      for (const id of ids) {
        const from=segment.previous.positions[id],to=segment.step.positions[id];
        assert.ok(2*Math.hypot(to.x-from.x,to.y-from.y)<=segment.duration*18+1e-8,`${length}/${seed}/${segment.step.id}/${id}: bounded peak footwork speed`);
        const routePeak=automaticActorPeakSpeed(segment,id,document.players[id].handedness);
        assert.ok(routePeak<=18+1e-8,`${length}/${seed}/${segment.step.id}/${id}: preparation and contact holds preserve bounded footwork`);
        for (const fraction of [.25,.5,.75]) {
          const sample=sampleActorPresentation({instructionalMovement:true,segment,playerId:id,localTime:segment.duration*fraction,handedness:document.players[id].handedness,cameraPosition:{x:0,y:10,z:10}});
          assert.ok(sample.travelSpeed/FEET_TO_METERS<=routePeak+1e-7,'independent production travel-speed samples fit the exact route bound');
        }
      }
      for (const pair of [['player1','player2'],['player3','player4']]) {
        const [a,b] = pair.map(id=>segment.previous.positions[id]);
        const [c,d] = pair.map(id=>segment.step.positions[id]);
        const x=a.x-b.x,y=a.y-b.y,dx=c.x-d.x-x,dy=c.y-d.y-y;
        const progress=Math.max(0,Math.min(1,-(x*dx+y*dy)/(dx*dx+dy*dy||1)));
        assert.ok(Math.hypot(x+dx*progress,y+dy*progress)>=2.5-1e-9, `${length}/${seed}/${segment.step.id}: spacing through the entire movement path`);
        for (const fraction of [.125,.375,.625,.875,1]) {
          const [a,b]=pair.map(id=>sampleActorPresentation({instructionalMovement:true,segment,playerId:id,localTime:segment.duration*fraction,handedness:document.players[id].handedness,cameraPosition:{x:0,y:10,z:10}}).worldPosition);
          assert.ok(Math.hypot(a.x-b.x,a.z-b.z)/FEET_TO_METERS>=2.5-1e-9, `${length}/${seed}/${segment.step.id}: sampled production actor separation`);
        }
      }
    }
    if (assisted.findings.some(item=>item.message.startsWith('Suggested coverage was not applied'))) {
      fallbackUsed = true;
      assert.deepEqual(assisted.play.steps, base.play.steps, 'unsafe extra shading keeps the original recovery');
      assert.ok(assisted.coverage.every(item=>item.explanation.includes('Suggested coverage only') && !item.explanation.includes('Applied to')));
    } else if (JSON.stringify(assisted.play.steps)!==JSON.stringify(base.play.steps)) safeShadingApplied = true;
    for (let index=0;index<base.play.steps.length;index++) {
      assert.deepEqual(assisted.play.steps[index].shot, base.play.steps[index].shot);
      for (const id of ids) assert.equal(assisted.play.steps[index].positions[id].y,base.play.steps[index].positions[id].y);
    }
  }
  assert.equal(fallbackUsed,true,'unsafe extra coverage falls back to guides');
  assert.equal(safeShadingApplied,true,'safe lateral shading remains available');
});

test('deep lob defense retreats the supporting partner and middle threats narrow coverage lanes', () => {
  const document=createStarterDocument();
  const positions={player1:{x:5,y:14},player2:{x:15,y:14},player3:{x:5,y:30},player4:{x:15,y:30}};
  const deep=doublesRecovery(positions,{players:document.players,hitter:'player1',family:'lob',target:{x:5,y:41},seconds:1,index:5});
  assert.ok(deep.player3.y>35 && deep.player4.y>35,'both defenders recover depth behind the lob');
  assert.ok(deep.player3.x<positions.player3.x && deep.player4.x<positions.player4.x,'support follows the lob lane');
  const middle=doublesRecovery(positions,{players:document.players,hitter:'player1',family:'dink',target:{x:10,y:26},seconds:1,index:5});
  assert.equal(middle.player3.x,6);
  assert.equal(middle.player4.x,14);
  assert.ok(middle.player4.x-middle.player3.x>=8,'middle coverage retains separate lanes');
});

test('new automatic deep-lob overheads meet the ball in back court while bounced replies and historical contacts stay distinct', () => {
  const document=createStarterDocument();
  document.opening='midrally';
  document.initialLayout={player1:{x:5,y:14},player2:{x:15,y:14},player3:{x:5,y:38},player4:{x:15,y:30},ball:{x:5,y:14}};
  const automatic={ownership:'automatic',fields:['movement','family']};
  document.shots=[
    {id:'lob',family:'lob',hitter:'player1',receiver:'auto',contactStyle:'auto',target:{x:5,y:41},arc:'high',pace:'soft',movement:{intent:'advance',pinned:false},authoring:automatic,generation:{seed:1,generatorVersion:'smart-rally-v2'}},
    {id:'reply',family:'overhead',hitter:'player3',receiver:'auto',contactStyle:'auto',target:{x:15,y:5},arc:'low',pace:'soft',movement:{intent:'advance',pinned:false},authoring:automatic,generation:{seed:1,generatorVersion:'smart-rally-v2'}}
  ];
  const overhead=compileDocument(document);
  assert.equal(overhead.validShotCount,2);
  assert.equal(overhead.play.steps[2].shot.from.y,38);
  assert.deepEqual(overhead.play.steps[1].shot.to,overhead.play.steps[2].shot.from,'outgoing flight ends at the same interception');
  assert.equal(overhead.play.steps[1].shot.flight.bounces,0);
  assert.ok(overhead.play.steps[2].shot.from.y<document.shots[0].target.y,'descending interception precedes the declared landing');
  assert.equal(overhead.play.steps[2].shot.contact.heightFeet,7);
  const unreachable=structuredClone(document);
  unreachable.initialLayout.player3={x:1,y:30};
  unreachable.shots[0].target={x:17,y:41};
  unreachable.shots[0].pace='firm';
  assert.equal(compileDocument(unreachable).validShotCount,1,'a distant player cannot teleport to the backcourt overhead');
  unreachable.shots[1].hitter='player4';
  assert.equal(compileDocument(unreachable).validShotCount,2,'the reachable lane defender can take the overhead');
  document.shots[1].family='drive';
  const bounced=compileDocument(document);
  assert.equal(bounced.validShotCount,2);
  assert.equal(bounced.play.steps[1].shot.flight.bounces,1);
  assert.equal(bounced.play.steps[2].shot.from.y,41.75);
  document.shots[1].family='overhead';
  document.shots[1].generation.generatorVersion='smart-rally-v1';
  assert.equal(compileDocument(document).play.steps[2].shot.from.y,29.6,'historical overhead inference preserved');
  document.shots[1].generation.generatorVersion='smart-rally-v2';
  document.shots[1].movement={intent:'hold',pinned:false};
  assert.equal(compileDocument(document).play.steps[2].shot.from.y,29.6,'explicit hold retains historical inference');
});
