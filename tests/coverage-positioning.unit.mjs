import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCoverageAssistance} from '../coverage-assistance.js';
import {createStarterDocument} from '../play-document.js';
import {compileDocument, recompileAssistedDocument, automaticActorPeakSpeed} from '../play-compiler.js';
import {evaluateCandidate} from '../rally-proposals.js';

function fixture() {
  const document = createStarterDocument();
  document.opening = 'midrally'; delete document.service;
  document.initialLayout = {player1:{x:10,y:5},player2:{x:5,y:5},player3:{x:8,y:30},player4:{x:12,y:30},ball:{x:10,y:5}};
  document.shots = [
    {id:'a',family:'drive',hitter:'player1',receiver:'player4',contactStyle:'forehand',target:{x:12,y:29.25},arc:'high',pace:'soft',movement:{intent:'hold',pinned:false}},
    {id:'b',family:'drive',hitter:'player4',receiver:'auto',contactStyle:'forehand',target:{x:5,y:8},arc:'high',pace:'soft',movement:{intent:'hold',pinned:false}}
  ];
  document.assistance = {autoShading:true,showGuides:true,team:'orange'};
  return document;
}
function guide(origin, {mirror = false, green = false, left = 5, right = 15, rightY = 30, receiver = false} = {}) {
  const document = fixture();
  const positions = structuredClone(document.initialLayout);
  positions.player3 = {x:left,y:30}; positions.player4 = {x:right,y:rightY};
  if (mirror) for (const position of Object.values(positions)) position.x = 20-position.x;
  if (green) {
    for (const position of Object.values(positions)) position.y = 44-position.y;
    for (const player of Object.values(document.players)) player.team = player.team === 'green' ? 'orange' : 'green';
    document.assistance.team = 'green';
  }
  const play = {steps:[{id:'a',positions,shot:{playerId:'player1',from:{x:mirror?20-origin:origin,y:green?39:5}}}]};
  if(receiver) play.steps.push({id:'b',positions:structuredClone(positions),shot:{playerId:'player4',from:{x:positions.player4.x,y:positions.player4.y}}});
  return applyCoverageAssistance(play, document, {segments:[{index:0,duration:1}]}).coverage[0].positions;
}

test('center-origin coverage is neutral, continuous, and mirror symmetric on both halves', () => {
  for (const green of [false,true]) {
    const center = guide(10,{green});
    assert.equal(center.player3.x,5); assert.equal(center.player4.x,15);
    for (const x of [0,2,9.999,10,10.001,18,20]) {
      const a=guide(x,{green}), b=guide(x,{green,mirror:true});
      for(const id of ['player3','player4']) assert.ok(Math.abs(a[id].x+b[id].x-20)<1e-9);
    }
    for (const x of [9.999,10.001]) for(const id of ['player3','player4']) assert.ok(Math.abs(guide(x,{green})[id].x-center[id].x)<.001);
  }
});

test('wide-origin pair protects line and closes middle without using the outgoing cross-court target', () => {
  const left=guide(0), right=guide(20);
  assert.ok(left.player3.x<5 && left.player4.x<15);
  assert.ok(right.player3.x>5 && right.player4.x>15);
  const d=fixture(), p=compileDocument(d).play, before=structuredClone(p);
  const a=applyCoverageAssistance(p,d,compileDocument(d).timeline);
  p.steps[1].shot.to.x=1;
  const b=applyCoverageAssistance(p,d,compileDocument(d).timeline);
  assert.deepEqual(a.coverage,b.coverage);
  assert.deepEqual(a.play.steps[1].shot,before.steps[1].shot);
});

test('reserved receiver, coincident lanes, and already-close authored pair are not crowded', () => {
  for(const mirror of [false,true]) {
    const result=guide(0,{left:8,right:10,receiver:true,mirror});
    assert.equal(result.player4.x,mirror?10:10);
    assert.ok(Math.abs(result.player3.x-result.player4.x)>=2-1e-9);
  }
  const tied=guide(0,{left:10,right:10});
  assert.equal(tied.player3.x,10); assert.equal(tied.player4.x,10);
});

test('authored end-to-end coverage does not collapse four-foot partner spacing', () => {
  const document=fixture(), before=structuredClone(document), evaluation=evaluateCandidate(document);
  assert.equal(evaluation.ok,true,evaluation.reason);
  const positions=evaluation.compiled.play.steps[1].positions;
  assert.ok(Math.hypot(positions.player3.x-positions.player4.x,positions.player3.y-positions.player4.y)>=2.5-1e-9);
  assert.deepEqual(document,before);
});

test('compiler refuses unsafe added spacing on authored routes, preserving their original geometry', () => {
  const document=fixture(), base=compileDocument(document), unsafe=structuredClone(base.play);
  unsafe.steps[1].positions.player3.x=10.42;
  const result=recompileAssistedDocument(document,base,unsafe,[]);
  assert.deepEqual(result.play,base.play);
  assert.ok(result.findings.some(item=>item.message.includes('partner spacing')));
});


test('lateral clearance limits the whole adjustment and respects depth-separated partners', () => {
  for (const mirror of [false,true]) for (const left of [6.5,7.1]) {
    const result=guide(20,{left,right:9.5,receiver:true,mirror});
    const start=mirror?20-left:left, other=mirror?10.5:9.5;
    for(let i=0;i<=100;i++) {
      const x=start+(result.player3.x-start)*i/100;
      assert.ok(Math.abs(x-other)>=Math.min(2.5,9.5-left)-1e-9);
    }
  }
  const sameDepth=guide(20,{left:6.5,right:9.5,receiver:true});
  const separateDepth=guide(20,{left:6.5,right:9.5,rightY:33,receiver:true});
  assert.equal(sameDepth.player3.x,7);
  assert.ok(separateDepth.player3.x>sameDepth.player3.x);
  assert.equal(separateDepth.player4.y,33);
});


test('guide-only coordinates preserve both reserved contact and current-leg partner pin', () => {
  const document=fixture();
  document.assistance.autoShading=false;
  document.shots[0].playerMovement={player3:{intent:'manual',pinned:true,target:{x:8,y:30}}};
  const base=compileDocument(document), before=structuredClone(base.play);
  const result=applyCoverageAssistance(base.play,document,base.timeline);
  const guide=result.coverage.find(item=>item.shotId==='a');
  for(const id of ['player3','player4']) assert.deepEqual(guide.positions[id],base.play.steps[1].positions[id]);
  assert.deepEqual(result.play,before);
  assert.match(guide.explanation,/Guide only/);
});

test('compiler rejects authored assisted eased peak speed even when average reach is allowed', () => {
  const document=fixture();
  document.initialLayout.player1.y=14; document.initialLayout.ball.y=14;
  for(const shot of document.shots){shot.arc='low';shot.pace='firm';}
  const base=compileDocument(document), unsafe=structuredClone(base.play);
  unsafe.steps[1].positions.player3.x=1;
  // The current-leg move is modest; returning to the untouched next-leg
  // position in 0.55 seconds needs 25.45 ft/s eased peak, not 12.73 average.
  assert.equal(automaticActorPeakSpeed(base.timeline.segments[1],'player3'),0);
  const result=recompileAssistedDocument(document,base,unsafe,[]);
  assert.deepEqual(result.play,base.play);
  assert.ok(result.findings.some(item=>item.message.includes('assisted footwork limit')));
  // Comparing against baseline must never reject unchanged authored routes.
  const unchanged=recompileAssistedDocument(document,base,structuredClone(base.play),[]);
  assert.deepEqual(unchanged.findings,base.findings);
  assert.deepEqual(unchanged.play,base.play);
});

test('an already-fast authored base remains untouched by the assistance speed guard', () => {
  const document=createStarterDocument();
  document.shots=document.shots.slice(0,2);
  document.shots[0].movement={intent:'manual',pinned:false,target:{x:1,y:2}};
  const base=compileDocument(document);
  assert.ok(automaticActorPeakSpeed(base.timeline.segments[0],'player1')>18);
  const result=recompileAssistedDocument(document,base,structuredClone(base.play),[]);
  assert.deepEqual(result.play,base.play);
  assert.deepEqual(result.findings,base.findings);
});

test('off-court coverage recovery respects elapsed time instead of snapping to the court inset', () => {
  for (const x of [-5, 0, 20, 25]) for (const seconds of [0, .001, .02, .1]) {
    const document = fixture();
    const positions = structuredClone(document.initialLayout);
    positions.player3 = { x, y: 30 }; positions.player4 = { x: 10, y: 34 };
    const play = { steps: [{ id: 'a', positions, shot: { playerId: 'player1', from: { x: 10, y: 5 } } }] };
    const result = applyCoverageAssistance(play, document, { segments: [{ index: 0, duration: seconds }] });
    const actual = result.play.steps[0].positions.player3;
    assert.ok(Math.abs(actual.x - x) <= 13 * seconds + 1e-9, `x=${x}, t=${seconds}: ${actual.x}`);
    assert.equal(actual.y, 30);
    if (seconds === 0) assert.deepEqual(actual, positions.player3);
  }
});

test('seeded apron coverage preserves paired clearance, reflection, speed and source ownership', () => {
  let seed = 0x5ad1;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let sample = 0; sample < 300; sample++) {
    const document = fixture(), positions = structuredClone(document.initialLayout);
    positions.player3 = { x: -7 + 34 * random(), y: 29.5 + 7 * random() };
    positions.player4 = { x: -7 + 34 * random(), y: 29.5 + 7 * random() };
    const origin = { x: -7 + 34 * random(), y: 5 }, seconds = sample % 11 === 0 ? 0 : random();
    const play = { steps: [{ id: 'a', positions, shot: { playerId: 'player1', from: origin } }] };
    const before = structuredClone(play), source = structuredClone(document);
    const timeline = { segments: [{ index: 0, duration: seconds }] };
    const result = applyCoverageAssistance(play, document, timeline);
    const reflectedPlay = structuredClone(play);
    for (const point of Object.values(reflectedPlay.steps[0].positions)) point.x = 20 - point.x;
    reflectedPlay.steps[0].shot.from.x = 20 - origin.x;
    const reflected = applyCoverageAssistance(reflectedPlay, document, timeline);
    const at = result.play.steps[0].positions;
    for (const id of ['player3', 'player4']) {
      assert.ok(Math.abs(at[id].x - positions[id].x) <= 13 * seconds + 1e-8, `${sample}/${id}: speed`);
      assert.equal(at[id].y, positions[id].y);
      assert.ok(Math.abs(at[id].x + reflected.play.steps[0].positions[id].x - 20) < 1e-8, `${sample}/${id}: reflection`);
    }
    const minimum = Math.min(2.5, Math.hypot(positions.player3.x - positions.player4.x, positions.player3.y - positions.player4.y));
    for (let k = 0; k <= 20; k++) {
      const t = k / 20;
      const dx = positions.player3.x - positions.player4.x + t * (at.player3.x - positions.player3.x - at.player4.x + positions.player4.x);
      assert.ok(Math.hypot(dx, positions.player3.y - positions.player4.y) >= minimum - 1e-8, `${sample}: clearance`);
    }
    assert.deepEqual(play, before); assert.deepEqual(document, source);
  }
});
