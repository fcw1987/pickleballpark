import {test,expect} from '@playwright/test';
import {pixelAuthoringCases,pixelTacticalBoundaryCases} from './fixtures/pixel-authoring-cases.mjs';

test('default depth app renders every supported authoring combination and tactical boundary at exact visible contacts across full orbit',async({page})=>{
 test.setTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.waitForFunction(()=>window.playBuilder?.view==='3d'&&pickleboard.threeD?.worldAssetsReady);
 const result=await page.evaluate(cases=>{
  const failures=[];let contacts=0,poses=0;
  for(const item of cases){
   playBuilder.pause();playBuilder.loadDocument(item.document,{persist:false});
   const timeline=playBuilder.compiled.timeline,segment=timeline.segments.find(s=>s.shotSemantics),view=pickleboard.threeD;
   if(!segment){failures.push({id:item.id,reason:'missing compiled segment'});continue;}
   for(let orientation=0;orientation<8;orientation++){
    view.cameraControls.setState({azimuth:orientation*Math.PI/4,elevation:30+orientation*5,distance:17,target:{x:0,y:.6,z:0}});
    playBuilder.seek(segment.startTime+segment.contactTime);
    const actor=view.playerObjects.get(segment.shotSemantics.playerId),d=actor.userData;
    const error=d.paddleFaceWorld.distanceTo(view.ballObject.position),family=item.contactStyle==='short-hop'&&!['serve','overhead'].includes(item.family)?'short-hop':item.family;
    if(!d.referenceAthlete||!actor.visible||!view.renderer.domElement.isConnected||view.renderer.domElement.width<1||error>1e-7||d.animation.family!==family||d.animation.backhand!==(segment.shotSemantics.strokeSide==='backhand'))failures.push({id:item.id,orientation,error,animation:d.animation,reason:'actual depth renderer mismatch'});
    contacts++;
    for(const offset of [-.03,.03,.12,.25]){
     playBuilder.seek(segment.startTime+Math.max(0,Math.min(segment.duration,segment.contactTime+offset)));poses++;
     if(!d.body.geometry.attributes.position.array.every(Number.isFinite)||d.arms.some(a=>a.parts.some(p=>!Number.isFinite(p.outer.scale.y))))failures.push({id:item.id,orientation,offset,reason:'invalid rendered geometry'});
    }
   }
  }
  return {contacts,poses,failures};
 },[...pixelAuthoringCases(),...pixelTacticalBoundaryCases()]);
 expect(result.contacts).toBe(784);expect(result.poses).toBe(3136);expect(result.failures).toEqual([]);expect(errors).toEqual([]);
});
