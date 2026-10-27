import {test,expect} from '@playwright/test';

test('legacy 3D compatibility: modeled garden remains fixed when cameras switch, reuses resources, and disposes every owned asset',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy);
 await page.evaluate(()=>playBuilder.switchView('3d'));await page.waitForFunction(()=>playBuilder.board.threeD?.worldAssetsReady);
 const evidence=await page.evaluate(()=>{
  const viewer=playBuilder.board.threeD,world=viewer.world,group=world.group;
  const snapshot=()=>{
   group.updateMatrixWorld(true);const parts=[];
   group.traverse(mesh=>{if(mesh.geometry)parts.push({name:mesh.name,matrix:mesh.matrixWorld.toArray(),geometry:mesh.geometry.uuid,material:mesh.material.uuid});});
   return parts;
  };
  const before=snapshot(),results=[];
  // Sprite geometry is shared by Three.js; scene materials and their maps are owned.
  const ownedGraph=()=>{const values=new Set();group.traverse(node=>{if(node.geometry&&!node.isSprite)values.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material){values.add(material);for(const value of Object.values(material))if(value?.isTexture)values.add(value);}});return [...values];};
  const counts=()=>({...Object.fromEntries(Object.entries(world.resources).map(([key,values])=>[key,values.size])),allOwned:ownedGraph().length,paintedTextures:ownedGraph().filter(value=>value.isTexture).length});
  const initialCounts=counts();
  for(const camera of ['overhead','sideline','behind-green','behind-orange']){
   viewer.setCamera(camera);results.push({camera,parts:snapshot(),resources:counts()});
  }
  const owned=ownedGraph(),disposed=owned.map(()=>0);
  owned.forEach((resource,index)=>resource.addEventListener('dispose',()=>disposed[index]++));
  viewer.exit();world.dispose();
  return {before,results,initialCounts,disposed,remaining:group.children.length};
 });
 expect(evidence.before.length).toBeGreaterThan(20);
 expect(evidence.initialCounts.geometries).toBeLessThan(40);
 expect(evidence.initialCounts.paintedTextures).toBeGreaterThan(0);
 for(const sample of evidence.results){expect(sample.parts,sample.camera).toEqual(evidence.before);expect(sample.resources,sample.camera).toEqual(evidence.initialCounts);}
 expect(evidence.disposed.every(count=>count===1)).toBe(true);expect(evidence.remaining).toBe(0);
});
