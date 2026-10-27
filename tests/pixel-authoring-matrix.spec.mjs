import {expect,test} from '@playwright/test';
import {pixelAuthoringCases,pixelTacticalBoundaryCases} from './fixtures/pixel-authoring-cases.mjs';

test('80 authoring combinations and 18 tactical boundaries compile into explicit anchored pixel strokes',async({page})=>{
 await page.goto('/?pixel-authoring-matrix=1');
 await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&pickleboard.pixelRenderer);
 const combinations=pixelAuthoringCases(),boundaries=pixelTacticalBoundaryCases();expect(combinations).toHaveLength(80);expect(boundaries).toHaveLength(18);
 const cases=[...combinations,...boundaries];
 const result=await page.evaluate(cases=>{
  const failures=[];let contacts=0;
  for(const item of cases){
   playBuilder.loadDocument(item.document,{persist:false});
   const compiled=playBuilder.compiled,segment=compiled.timeline.segments.find(s=>s.trajectory);
   if(compiled.validShotCount!==1||compiled.findings.some(f=>f.severity==='error')||!segment){failures.push({id:item.id,reason:'compiler rejected schema-valid case',findings:compiled.findings});continue;}
   playBuilder.seek(segment.startTime+segment.contactTime);pickleboard.pixelRenderer.render(1000);
   const d=pickleboard.pixelRenderer.getDiagnostics(),a=d.actors.player1;contacts++;
   const ballError=Math.hypot(a.paddle.x-d.ball.display.x,a.paddle.y-d.ball.display.y),rootError=Math.hypot(a.sole.x-a.ground.x,a.sole.y-a.ground.y);
   const bone=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y);
   const rasterError=Math.hypot(a.rasterPaddle.x-d.ball.rasterCenter.x,a.rasterPaddle.y-d.ball.rasterCenter.y);
   if(rasterError>0||a.phase!=='contact'||a.pixelStroke!==item.family||a.renderedFamily!==item.family||a.strokeSide!==segment.shotSemantics.strokeSide||ballError>1e-6||rootError>1e-8||a.contactBounded||Math.abs(bone(a.shoulder,a.elbow)-4.5)>1e-8||Math.abs(bone(a.elbow,a.wrist)-4.5)>1e-8)failures.push({id:item.id,reason:'rendered stroke/contact/root/arm mismatch',ballError,rootError,actor:a});
  }
  return {contacts,failures};
 },cases);
 expect(result.contacts).toBe(98);expect(result.failures).toEqual([]);
});
