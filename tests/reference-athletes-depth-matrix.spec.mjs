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
    const pos=d.body.geometry.attributes.position,base=d.baseVertices;
    const stretched=Array.from({length:pos.count},(_,n)=>n).some(n=>base[n*3+1]>-.19&&[0,1,2].some(k=>pos.array[n*3+k]!==base[n*3+k]));
    const project=point=>d.visual.localToWorld(point.clone()).project(view.camera),sleeve=project(d.rigPose.sleeveAnchor),shoulder=project(d.rigPose.shoulder);
    if(stretched||d.rigPose.wristReach>.980001||Math.hypot(sleeve.x-shoulder.x,sleeve.y-shoulder.y)>1e-8)failures.push({id:item.id,orientation,reason:'shirt stretch or detached visible shoulder',stretched,reach:d.rigPose.wristReach});
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

test('visible default depth court geometry measures 20 by 44 feet with seven-foot kitchens on both sides of the net',async({page})=>{
 await page.goto('/');
 await page.waitForFunction(()=>window.playBuilder?.view==='3d'&&pickleboard.threeD?.worldAssetsReady);
 const geometry=await page.evaluate(()=>{
  const world=pickleboard.threeD.world;
  const bounds=name=>{const mesh=world.group.getObjectByName(name);mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;return{min:{x:b.min.x,y:b.min.y,z:b.min.z},max:{x:b.max.x,y:b.max.y,z:b.max.z},position:{x:mesh.position.x,y:mesh.position.y,z:mesh.position.z},visible:mesh.visible};};
  return{slab:bounds('CourtSlab'),surface:bounds('AcrylicSurface'),kitchen:bounds('KitchenSurface'),net:bounds('NetMesh')};
 });
 const feet=.3048;
 for(const name of ['slab','surface','kitchen','net'])expect(geometry[name].visible).toBe(true);
 expect((geometry.slab.max.x-geometry.slab.min.x)/feet).toBeCloseTo(20,5);
 expect((geometry.slab.max.z-geometry.slab.min.z)/feet).toBeCloseTo(44,5);
 expect((geometry.surface.max.x-geometry.surface.min.x)/feet).toBeCloseTo(20,5);
 expect((geometry.surface.max.y-geometry.surface.min.y)/feet).toBeCloseTo(44,5);
 expect((geometry.kitchen.max.x-geometry.kitchen.min.x)/feet).toBeCloseTo(20,5);
 expect(geometry.kitchen.min.y/feet).toBeCloseTo(-7,5);
 expect(geometry.kitchen.max.y/feet).toBeCloseTo(7,5);
 expect(geometry.kitchen.position.z).toBeCloseTo(0,8);
 expect(geometry.net.min.z+geometry.net.position.z).toBeCloseTo(0,8);
 expect(geometry.net.max.z+geometry.net.position.z).toBeCloseTo(0,8);
});
