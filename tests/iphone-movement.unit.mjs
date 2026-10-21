import test from 'node:test';
import assert from 'node:assert/strict';
import {createStarterDocument,validateDocument} from '../play-document.js';
import {compileDocument,recompileAssistedDocument} from '../play-compiler.js';
import {applyCoverageAssistance} from '../coverage-assistance.js';
import {getWaypointPolicy} from '../builder-waypoint-policy.js';

test('partner destination is compiled once and shading preserves it without changing targets',()=>{
 const doc=createStarterDocument();doc.shots[0].playerMovement={player2:{intent:'manual',pinned:true,target:{x:7,y:4}}};
 const original=JSON.stringify(doc),base=compileDocument(doc);
 assert.equal(base.validShotCount,3);assert.deepEqual(base.play.steps[1].positions.player2,{x:7,y:4});
 doc.assistance.autoShading=true;const assisted=applyCoverageAssistance(base.play,doc,base.timeline);const result=recompileAssistedDocument(doc,base,assisted.play,assisted.coverage);
 assert.deepEqual(result.play.steps[1].positions.player2,{x:7,y:4});doc.assistance.autoShading=false;assert.equal(JSON.stringify(doc),original);
});
test('an unreachable partner pin stops valid preview and keeps authored intent',()=>{
 const doc=createStarterDocument();doc.shots[0].playerMovement={player2:{intent:'manual',pinned:true,target:{x:28,y:52}}};const original=JSON.stringify(doc);
 const result=compileDocument(doc);assert.equal(result.validShotCount,0);assert.ok(result.findings.some(f=>f.kind==='feasibility'&&f.message.includes('manual destination')));assert.equal(JSON.stringify(doc),original);
});
test('partner waypoint acknowledgement follows changes and retains all intermediate data',()=>{
 const doc=createStarterDocument();doc.shots[0].playerMovement={player2:{intent:'manual',pinned:true,target:{x:7,y:4},waypoints:[{x:8,y:3}]}};
 const original=JSON.stringify(doc),policy=getWaypointPolicy(doc);assert.equal(policy.requiresConfirmation,true);assert.equal(policy.affected[0].player,'player2');assert.equal(getWaypointPolicy(doc,policy.key).requiresConfirmation,false);assert.equal(JSON.stringify(doc),original);
 doc.shots[0].playerMovement.player2.waypoints[0].x=9;assert.equal(getWaypointPolicy(doc,policy.key).requiresConfirmation,true);
});
test('old documents stay valid; duplicate hitter commands and malformed partner movement are rejected',()=>{
 const doc=createStarterDocument();validateDocument(doc);doc.shots[0].playerMovement={player1:{intent:'hold',pinned:false}};assert.throws(()=>validateDocument(doc),/two competing/);
 doc.shots[0].playerMovement={player2:{intent:'manual',pinned:true,target:{x:Infinity,y:4}}};assert.throws(()=>validateDocument(doc),/finite/);
 doc.shots[0].playerMovement={player5:{intent:'hold',pinned:false}};assert.throws(()=>validateDocument(doc),/one of/);
});

test('future pins do not suppress earlier coverage and persist only after their event',()=>{
 const doc=createStarterDocument();doc.assistance.autoShading=true;
 const base=compileDocument(doc),a=applyCoverageAssistance(base.play,doc,base.timeline);
 doc.shots[2].playerMovement={player2:{intent:'manual',pinned:true,target:{x:6,y:8}}};
 const changed=compileDocument(doc),b=applyCoverageAssistance(changed.play,doc,changed.timeline);
 assert.deepEqual(b.play.steps[2].positions.player2,a.play.steps[2].positions.player2);
 assert.deepEqual(b.play.steps[3].positions.player2,{x:6,y:8});
});
