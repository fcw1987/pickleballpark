import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDocument} from '../play-compiler.js';
import {validateDocument} from '../play-document.js';
import {pixelAuthoringCases,pixelTacticalBoundaryCases} from './fixtures/pixel-authoring-cases.mjs';

test('actual schema permits exactly 80 distinct family/style/hand/serve-method combinations',()=>{
 const cases=pixelAuthoringCases();assert.equal(cases.length,80);assert.equal(new Set(cases.map(c=>c.id)).size,80);
 for(const item of cases){
  assert.equal(validateDocument(item.document),item.document);
  const result=compileDocument(item.document);assert.equal(result.validShotCount,1,item.id);
  assert.deepEqual(result.findings.filter(f=>f.severity==='error'),[],item.id);
  const shot=result.play.steps.find(s=>s.shot).shot;
  assert.equal(shot.authoring.family,item.family);
  assert.equal(shot.servePreparation?.method,item.serveMethod==='drop'?'drop':undefined);
  if(item.contactStyle==='backhand')assert.equal(shot.contact.strokeSide,'backhand');
  if(item.family==='overhead'&&item.contactStyle==='short-hop'){assert.equal(shot.type,'short-hop');assert.equal(shot.contact.heightFeet,7);}
 }
});

test('18 tactical boundary cases preserve family and derive explicit speed/arc/spin metadata',()=>{
 const cases=pixelTacticalBoundaryCases();assert.equal(cases.length,18);
 for(const item of cases){
  const result=compileDocument(item.document);assert.equal(result.validShotCount,1,item.id);assert.deepEqual(result.findings.filter(f=>f.severity==='error'),[],item.id);
  const shot=result.play.steps.find(s=>s.shot).shot;
  assert.deepEqual(shot.intendedTarget,item.document.shots[0].target);
  assert.equal(shot.flight.spin.type,['drop','dink','reset'].includes(item.family)?'backspin':'topspin');
  assert.equal(shot.flight.spin.rpm,item.document.shots[0].pace==='firm'?850:300);
  assert.ok(shot.flight.speedMph>0&&shot.flight.apexFeet>0);
 }
});

test('invalid serve methods and misplaced serve intent remain rejected',()=>{
 const source=structuredClone(pixelAuthoringCases()[0].document);
 source.shots[0].serveMethod='overhead';assert.throws(()=>validateDocument(source),/serveMethod/);
 source.shots[0].serveMethod='volley';source.opening='midrally';
 const result=compileDocument(source);assert.equal(result.validShotCount,0);assert.ok(result.findings.some(f=>f.severity==='error'&&/serve can only begin/.test(f.message)));
 const nonserve=structuredClone(pixelAuthoringCases().find(c=>c.family==='drive').document);nonserve.shots[0].serveMethod='drop';assert.throws(()=>validateDocument(nonserve),/only valid for a serve/);
});

test('schema-valid shallow low-arc tactics remain classified infeasible instead of rendering an invented shot',()=>{
 const source=structuredClone(pixelAuthoringCases().find(c=>c.family==='drive'&&c.contactStyle==='forehand').document);
 Object.assign(source.shots[0],{target:{x:.25,y:22.5},arc:'low',pace:'soft'});
 validateDocument(source);const result=compileDocument(source);
 assert.equal(result.validShotCount,0);assert.ok(result.findings.some(f=>f.kind==='feasibility'&&/clear the net/.test(f.message)));
});
