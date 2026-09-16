import {test,expect} from '@playwright/test';

test('park artwork faces each camera without moving its grounded anchor or allocating resources',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&playBuilder.board.threeD?.parkObject);
 const evidence=await page.evaluate(()=>{
  const viewer=playBuilder.board.threeD,group=viewer.parkObject,results=[];
  for(const camera of ['overhead','sideline','behind-green','behind-orange']){
   viewer.setCamera(camera);group.updateMatrixWorld(true);
   for(const [id,mesh]of group.userData.landmarks){
    const foot=mesh.userData.offset.clone().set(0,-mesh.userData.anchorOffset,0).applyMatrix4(mesh.matrixWorld);
    results.push({camera,id,anchorError:foot.distanceTo(mesh.userData.foot),facingError:1-Math.abs(mesh.quaternion.dot(viewer.camera.quaternion)),magFilter:mesh.material.map.magFilter,wrap:mesh.material.map.wrapS});
   }
  }
  return {results,count:group.userData.landmarks.size};
 });
 expect(evidence.count).toBe(6);expect(evidence.results).toHaveLength(24);
 for(const sample of evidence.results){expect(sample.anchorError,`${sample.camera}/${sample.id}`).toBeLessThan(1e-8);expect(sample.facingError).toBeLessThan(1e-8);expect(sample.magFilter).toBe(1003);expect(sample.wrap).toBe(1001);}
});
