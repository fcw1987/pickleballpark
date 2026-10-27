import {chromium} from '@playwright/test';import {mkdir,writeFile} from 'node:fs/promises';import {pixelAuthoringCases,pixelTacticalBoundaryCases} from '../tests/fixtures/pixel-authoring-cases.mjs';
const out=process.env.CAMERA_BOUNDARY_OUT||'release-results/reference-camera-boundaries';await mkdir(out,{recursive:true});
const catalog=[...pixelAuthoringCases(),...pixelTacticalBoundaryCases()],scenarios=[
 ['high-short-hop','pixel-return-short-hop-right-rally',7,75,55],
 ['close-serve','pixel-serve-forehand-right-volley-tactical-0',4,75,7],
 ['low-close-overhead','pixel-overhead-forehand-right-rally-tactical-0',0,20,7],
 ['previous-short-hop','pixel-return-short-hop-right-rally',6,60,17],
 ['high-short-hop-detail','pixel-return-short-hop-right-rally',7,75,7],
 ['close-serve-detail','pixel-serve-forehand-right-volley-tactical-0',4,75,7]
],browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'}),evidence=[];
try{await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4241');await page.waitForFunction(()=>window.playBuilder?.view==='3d'&&pickleboard.threeD?.worldAssetsReady);
for(const[name,id,sector,elevation,distance]of scenarios){const item=catalog.find(c=>c.id===id);if(!item)throw Error(id);const record=await page.evaluate(({item,sector,elevation,distance,center})=>{playBuilder.pause();playBuilder.loadDocument(item.document,{persist:false});const s=playBuilder.compiled.timeline.segments.find(s=>s.shotSemantics),v=pickleboard.threeD;playBuilder.seek(s.startTime+s.contactTime);const root=v.playerObjects.get(s.shotSemantics.playerId);v.cameraControls.setState({azimuth:sector*Math.PI/4,elevation,distance,target:center?{x:root.position.x,y:.8,z:root.position.z}:{x:0,y:.6,z:0}});playBuilder.seek(s.startTime+s.contactTime);const a=v.playerObjects.get(s.shotSemantics.playerId),d=a.userData;return {id:item.id,camera:v.cameraControls.getState(),contactError:d.paddleFaceWorld.distanceTo(v.ballObject.position),reach:d.rigPose.wristReach,sleeveHeight:d.rigPose.sleeveHeight,boneLengths:d.arms[0].parts.map(p=>p.outer.scale.y)};},{item,sector,elevation,distance,center:name.endsWith('-detail')});await page.screenshot({path:`${out}/${name}.png`});evidence.push({name,...record});}
}finally{await browser.close();await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2));}
