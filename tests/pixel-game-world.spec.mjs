import {test,expect} from '@playwright/test';

test('legacy 3D compatibility: modeled garden remains fixed when cameras switch, reuses resources, and disposes every owned asset',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy);
 await page.evaluate(()=>playBuilder.switchView('3d'));await page.waitForFunction(()=>playBuilder.board.threeD?.world);
 const evidence=await page.evaluate(()=>{
  const viewer=playBuilder.board.threeD,world=viewer.world,group=world.group;
  const snapshot=()=>{
   group.updateMatrixWorld(true);const parts=[];
   group.traverse(mesh=>{if(mesh.geometry)parts.push({name:mesh.name,matrix:mesh.matrixWorld.toArray(),geometry:mesh.geometry.uuid,material:mesh.material.uuid});});
   return parts;
  };
  const before=snapshot(),results=[];
  const counts=()=>Object.fromEntries(Object.entries(world.resources).map(([key,values])=>[key,values.size]));
  const initialCounts=counts();
  for(const camera of ['overhead','sideline','behind-green','behind-orange']){
   viewer.setCamera(camera);results.push({camera,parts:snapshot(),resources:counts()});
  }
  const owned=[...world.resources.geometries,...world.resources.materials,...world.resources.textures],disposed=owned.map(()=>0);
  owned.forEach((resource,index)=>resource.addEventListener('dispose',()=>disposed[index]++));
  viewer.exit();world.dispose();
  return {before,results,initialCounts,disposed,remaining:group.children.length};
 });
 expect(evidence.before.length).toBeGreaterThan(20);
 expect(evidence.initialCounts.geometries).toBeLessThan(40);
 expect(evidence.initialCounts.textures).toBe(3);
 for(const sample of evidence.results){expect(sample.parts,sample.camera).toEqual(evidence.before);expect(sample.resources,sample.camera).toEqual(evidence.initialCounts);}
 expect(evidence.disposed.every(count=>count===1)).toBe(true);expect(evidence.remaining).toBe(0);
});
