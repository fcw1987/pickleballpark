import { test, expect } from '@playwright/test';
import { installDimensionalAudit } from './helpers/dimensional-audit.mjs';
import { readFileSync } from 'node:fs';
import { reviewDocument } from '../tools/emerald-review/examples.mjs';

test.use({ serviceWorkers: 'block' });

const ready = page => page.waitForFunction(() =>
  window.playBuilder?.view === '3d' && pickleboard.threeD.active && pickleboard.threeD.renderer.info.render.calls > 0);

test('a fresh court shows both serving partners following the bounced third shot', async ({page}) => {
  await page.goto('/');
  await ready(page);
  const [start,end] = await page.evaluate(async () => {
    const {worldToBoard} = await import('./three-d-core.js');
    const viewer = pickleboard.threeD, drop = viewer.timeline.segments.find(s => s.step.id === 'drop-3');
    return [drop.startTime + drop.contactTime, drop.endTime].map(t => {
      playBuilder.seek(t);
      return [...viewer.playerObjects.values()].map(actor => worldToBoard(actor.position));
    });
  });
  for (const i of [0,1]) {
    expect(end[i].y - start[i].y).toBeGreaterThan(3);
    expect(start[i].x - end[i].x).toBeGreaterThan(.5);
  }
  expect(Math.abs(end[0].y - end[1].y)).toBeLessThan(3);
  expect(end[3].x - end[2].x).toBeGreaterThan(8);
});

test('normal court draws the approved skin throughout an orbit and releases its GPU resources on exit', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await installDimensionalAudit(page);
  const result = await page.evaluate(() => {
    const viewer = pickleboard.threeD, actor = viewer.playerObjects.get('player1');
    const resources = new Set(), disposed = new Map();
    actor.traverse(node => {
      if (node.isSkinnedMesh) for (const part of [node.material, node.geometry, node.skeleton]) resources.add(part);
    });
    for (const resource of resources) {
      const dispose = resource.dispose.bind(resource);
      resource.dispose = () => { disposed.set(resource, (disposed.get(resource) || 0) + 1); dispose(); };
    }
    const source = JSON.stringify(playBuilder.document);
    const roster = [...viewer.playerObjects.values()].map(player => player.userData.animation.source);
    const shot = viewer.timeline.segments.find(s => s.shotSemantics?.playerId === 'player1');
    playBuilder.seek(shot.startTime + shot.contactTime);
    const initial = [actor.position, viewer.ballObject.position, actor.userData.paddleFaceWorld].map(p => p.clone());
    const gl = viewer.renderer.getContext(), pixels = new Uint8Array(4 * 128 * 128);
    const original = new Uint8Array(pixels.length);
    let minChanged = Infinity, maxDrift = 0, maxContact = 0;
    for (let i = 0; i <= 16; i++) {
      viewer.cameraControls.setState({ azimuth: i * Math.PI / 8, elevation: 34 });
      viewer.applyAtTime(viewer.clock.elapsed);
      const center = actor.position.clone(); center.y += .85; center.project(viewer.camera);
      const rect = [Math.max(0, Math.min(gl.drawingBufferWidth - 128, Math.round((center.x + 1) * gl.drawingBufferWidth / 2) - 64)),
        Math.max(0, Math.min(gl.drawingBufferHeight - 128, Math.round((center.y + 1) * gl.drawingBufferHeight / 2) - 64))];
      const read = target => { viewer.renderer.render(viewer.scene, viewer.camera); gl.readPixels(...rect, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, target); };
      actor.visible = false; read(original); actor.visible = true; read(pixels);
      let changed = 0;
      for (let j = 0; j < pixels.length; j += 4) {
        if ([0,1,2].some(channel => Math.abs(original[j+channel] - pixels[j+channel]) > 12)) changed++;
      }
      minChanged = Math.min(minChanged, changed);
      maxDrift = Math.max(maxDrift, ...[actor.position, viewer.ballObject.position, actor.userData.paddleFaceWorld].map((p,k) => p.distanceTo(initial[k])));
      maxContact = Math.max(maxContact, window.__athleteAudit(actor).paddleDistance(viewer.ballObject.position));
    }
    viewer.exit();
    return { roster, minChanged, maxContact, maxDrift, count: resources.size,
      disposed: [...resources].every(part => disposed.get(part) === 1), sourcePreserved: source === JSON.stringify(playBuilder.document) };
  });
  expect(result.roster).toEqual(['approved-emerald-cap-glb', 'cream-visor-glb','coral-ponytail-glb','navy-cap-glb']);
  expect(result.minChanged).toBeGreaterThan(40);
  expect(result.maxDrift).toBeLessThan(1e-6);
  expect(result.maxContact).toBeLessThan(0.037);
  expect(result.count).toBeGreaterThan(12);
  expect(result.disposed && result.sourcePreserved).toBe(true);
});

for (const [index,key] of ['emerald-cap','cream-visor','coral-ponytail','navy-cap'].entries()) {
  for (const fault of ['missing', 'corrupt']) test(key+' falls back independently and retries after a '+fault+' model',async({page})=>{
    const url='**/assets/athletes/'+key+'.glb',id='player'+(index+1);
    await page.route(url,route=>route.fulfill({status:fault==='missing'?404:200,body:'invalid model'}));
    await page.goto('/');await ready(page);
    const source=JSON.parse(readFileSync(new URL('../docs/builder/examples/eight-shot-drive-drop.json',import.meta.url)));
    const doc=reviewDocument('backhand-dink','left',source,index);
    const fallback=await page.evaluate(({id,doc})=>{
      const v=pickleboard.threeD,b=playBuilder;
      b.loadDocument(doc,{persist:false});b.action('coachingPlayer',id);b.action('emeraldCoaching',true);
      const a=v.playerObjects.get(id),s=v.timeline.segments.find(s=>s.step.id==='kitchen');
      b.seek(s.startTime+s.contactTime);
      return {art:a.userData.body.material.map.image.width>0,source:a.userData.animation.source,cue:b.emeraldCue.title,
        contact:a.userData.paddleFaceWorld.distanceTo(v.ballObject.position),
        skins:[...v.playerObjects.values()].filter(p=>p.userData.courtAthlete).length};
    },{id,doc});
    expect(fallback).toMatchObject({art:true,source:'original-imagegen-articulated-v2',skins:3,cue:'Backhand dink · contact'});
    expect(fallback.contact).toBeLessThan(.01);
    await page.unroute(url);
    await page.evaluate(async()=>{const v=pickleboard.threeD;v.exit();await v.enter();});
    expect(await page.evaluate(id=>pickleboard.threeD.playerObjects.get(id).userData.courtAthlete,id)).toBe(key);
  });
}

test('far-court feeds turn the cap and shade the physical blade in both hands across a reversal and a backhand',async({page})=>{
  const base=JSON.parse(readFileSync(new URL('../docs/builder/examples/eight-shot-drive-drop.json',import.meta.url)));
  await page.goto('/');await ready(page);
  await installDimensionalAudit(page);
  for(const hand of ['left','right']){
    const doc=reviewDocument('tracking',hand,base);
    const data=await page.evaluate(async doc=>{
      const THREE=await import('./vendor/three.module.min.js'),b=playBuilder,v=pickleboard.threeD;
      b.loadDocument(doc,{persist:false});
      const initial=JSON.stringify(b.document),saved=JSON.stringify(localStorage),actor=v.playerObjects.get('player1');
      const point=n=>actor.getObjectByName(n).getWorldPosition(new THREE.Vector3());
      const read=()=>{
        const forward=new THREE.Vector3(0,0,1).transformDirection(actor.getObjectByName('Head').matrixWorld);
        const tip=point('PaddleFace').sub(point('GripCenter')),grip=point('GripCenter').sub(actor.position);
        const normal=point('PaddleFace').sub(point('PaddleBack'));
        return [Math.atan2(forward.x,forward.z),Math.atan2(tip.x,tip.y),grip.x,grip.z,Math.atan2(normal.x,normal.z)];
      };
      const sample=i=>{b.seek(v.timeline.segments[i].endTime-.04);return read();};
      const left=sample(0),center=sample(4),right=sample(2);
      const states=[2,1,0,4,2].map(sample);
      for(let i=0;i<=24;i++)v.cameraControls.setState({azimuth:Math.PI*i/12,elevation:34});
      const afterOrbit=read();
      const incoming=v.timeline.segments[1],opponentHit=incoming.startTime+incoming.contactTime;
      b.seek(opponentHit-.04);const split=window.__athleteAudit(actor).shoeBottoms;
      b.seek(opponentHit);const atHit=window.__athleteAudit(actor).shoeBottoms;
      b.seek(opponentHit+.065);const landed=window.__athleteAudit(actor).shoeBottoms;
      const strike=v.timeline.segments.at(-1);b.seek(strike.startTime+strike.contactTime);
      const gap=window.__athleteAudit(actor).paddleDistance(v.ballObject.position),backhand=actor.userData.animation.backhand;
      b.seek(v.timeline.duration);
      return {left,center,right,states,afterOrbit,split,atHit,landed,hand:actor.userData.handedness,
        gap,backhand,recovered:read(),action:actor.userData.animation.action,source:initial===JSON.stringify(b.document),
        stored:saved===JSON.stringify(localStorage)};
    },doc);
    expect(data.hand).toBe(hand);expect(data.source&&data.stored&&data.backhand).toBe(true);
    for(const index of [0,1,2]){
      expect(data.left[index]).toBeLessThan(data.center[index]-.045);
      expect(data.right[index]).toBeGreaterThan(data.center[index]+.045);
    }
    expect(data.left[0]).toBeLessThan(-.35);expect(data.right[0]).toBeGreaterThan(.35);
    // Both the shaft and the physical face must cross neutral on wide feeds.
    // A blade that leans less far to the wrong side also passes a delta test.
    for(const i of [1,4]){
      expect(data.left[i]).toBeLessThan(-.12);expect(data.right[i]).toBeGreaterThan(.12);
      expect(data.recovered[i]).toBeGreaterThan(.05);
    }
    expect(data.action).toBe('ready');
    for(const sample of [data.left,data.center,data.right])expect(sample[3]).toBeGreaterThan(.20);
    expect(data.states[2]).toEqual(data.left);expect(data.afterOrbit).toEqual(data.right);
    expect(Math.min(...data.split)).toBeGreaterThan(.025);
    expect(Math.min(...data.atHit)).toBeGreaterThan(.012);
    expect(Math.max(...data.atHit)).toBeLessThan(Math.min(...data.split));
    expect(Math.max(...data.landed.map(Math.abs))).toBeLessThan(1e-6);
    expect(data.gap).toBeLessThan(.037);
  }
});

for(const [index,key] of ['cream-visor','coral-ponytail','navy-cap'].entries()){
  test(key+' follows its compiled contacts, opponent and rebound in both hands',async({page})=>{
    const seat=index+1,id='player'+(seat+1);
    const source=JSON.parse(readFileSync(new URL('../docs/builder/examples/eight-shot-drive-drop.json',import.meta.url)));
    await page.goto('/');await ready(page);await installDimensionalAudit(page);
    for(const hand of ['left','right']){
      for(const drill of ['backhand-dink','overhead','lob-chase','lob-miss','tracking']){
        const doc=reviewDocument(drill,hand,source,seat);
        const result=await page.evaluate(({doc,id,drill})=>{
          const b=playBuilder,v=pickleboard.threeD;
          b.loadDocument(doc,{persist:false});b.action('coachingPlayer',id);b.action('emeraldCoaching',true);
          const a=v.playerObjects.get(id),events=v.timeline.events,stored=JSON.stringify(localStorage);
          if(drill==='lob-miss'){
            b.seek(v.timeline.duration);return {ending:b.emeraldCue.title,contacts:events.filter(e=>e.type==='contact').length};
          }
          if(drill==='tracking'){
            const angles=[0,4,2,4,0].map(i=>{
              b.seek(v.timeline.segments[i].endTime-.04);
              const m=a.getObjectByName('Head').matrixWorld.elements;
              const point=n=>a.getObjectByName(n).getWorldPosition(a.position.clone());
              const blade=point('PaddleFace').sub(point('GripCenter'));
              const face=point('PaddleFace').sub(point('PaddleBack'));
              const forward=a.position.z<0?1:-1;
              return [Math.atan2(m[8],m[10]),Math.atan2(blade.x,blade.y)*forward,Math.atan2(face.x*forward,face.z*forward)];
            });
            return {angles};
          }
          const e=events.find(e=>e.type==='contact' && e.actor===id &&
            (drill!=='backhand-dink'||v.timeline.segments[e.rallyLeg-1].step.id==='kitchen'));
          b.seek(e.time);
          const start=a.position.clone(),face=a.userData.paddleFaceWorld.clone(),shots=[];
          for(let i=0;i<=12;i++){
            v.cameraControls.setState({azimuth:i*Math.PI/6,elevation:27});
            v.applyAtTime(e.time);
            const audit=window.__athleteAudit(a);
            shots.push(Math.max(audit.paddleDistance(v.ballObject.position),a.position.distanceTo(start),face.distanceTo(a.userData.paddleFaceWorld)));
          }
          const result={hand:a.userData.handedness,model:a.userData.courtAthlete,
            cue:b.emeraldCue.title,worst:Math.max(...shots),plant:window.__athleteAudit(a).shoeBottoms,
            bounce:events.some(x=>x.type==='bounce'&&x.time<e.time),source:JSON.stringify(doc)===JSON.stringify(b.document)};
          b.seek(Math.min(e.time+.68,v.timeline.duration));result.ready=b.emeraldCue.title;
          result.storage=stored===JSON.stringify(localStorage);
          return result;
        },{doc,id,drill});
        if(drill==='lob-miss'){expect(result).toEqual({ending:'Second bounce',contacts:1});continue;}
        if(drill==='tracking'){
          for(const component of [0,1]){
            const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
            const [left,center,right,centerAgain,leftAgain]=result.angles.map(row=>row[component]);
            expect(Math.abs(delta(right,left))).toBeGreaterThan(.22);
            expect(delta(center,left)*delta(right,center)).toBeGreaterThan(0);
            expect(centerAgain).toBe(center);expect(leftAgain).toBe(left);
          }
          for(const component of [1,2]){
            expect(result.angles[0][component]).toBeLessThan(-.12);
            expect(result.angles[2][component]).toBeGreaterThan(.12);
          }
          continue;
        }
        expect(result).toMatchObject({hand,model:key,ready:'Ready',source:true,storage:true});
        expect(result.worst).toBeLessThan(.037);
        expect(Math.max(...result.plant.map(Math.abs))).toBeLessThan(.002);
        if(drill==='backhand-dink')expect(result.cue).toBe('Backhand dink · contact');
        else{
          expect(result.cue).toMatch(drill==='overhead'?/^Overhead · contact$/:/drop · contact$/i);
          expect(result.bounce).toBe(drill==='lob-chase');
        }
      }
    }
  });
}
