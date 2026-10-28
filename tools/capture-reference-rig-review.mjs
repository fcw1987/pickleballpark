import {chromium} from '@playwright/test';import {mkdir,writeFile} from 'node:fs/promises';import {pixelAuthoringCases} from '../tests/fixtures/pixel-authoring-cases.mjs';
const out=process.env.RIG_REVIEW_OUT||'release-results/reference-rig-repair';await mkdir(out,{recursive:true});const browser=await chromium.launch(),evidence=[];
try{for(const [viewportName,viewport]of[['detail',{width:1440,height:900}],['phone',{width:390,height:844}]]){
 const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4241');await page.waitForFunction(()=>window.playBuilder?.view==='3d'&&pickleboard.threeD?.worldAssetsReady);
 const cases=pixelAuthoringCases().filter(c=>['overhead','lob'].includes(c.family)&&['forehand','backhand'].includes(c.contactStyle));
 for(const item of cases)for(const [phase,offset]of[['prepare',-.15],['contact',0],['follow',.15]]){
  const record=await page.evaluate(({item,offset,phone})=>{playBuilder.pause();playBuilder.loadDocument(item.document,{persist:false});const s=playBuilder.compiled.timeline.segments.find(s=>s.shotSemantics),v=pickleboard.threeD,a=v.playerObjects.get(s.shotSemantics.playerId);playBuilder.seek(s.startTime+s.contactTime);v.cameraControls.setState({azimuth:Math.PI*.15,elevation:36,distance:phone?8:6.5,target:{x:a.position.x,y:.9,z:a.position.z}});playBuilder.seek(s.startTime+Math.max(0,s.contactTime+offset));const d=a.userData;return{caseId:item.id,offset,contactError:d.paddleFaceWorld.distanceTo(v.ballObject.position),rig:{wristReach:d.rigPose.wristReach,shoulder:d.rigPose.shoulder.toArray(),sleeve:d.rigPose.sleeveAnchor.toArray()}};},{item,offset,phone:viewport.width<500});
  await page.screenshot({path:`${out}/${viewportName}-${item.id}-${phase}.png`});evidence.push({viewport:viewportName,phase,...record});
 }
 await context.close();
}}finally{await browser.close();await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2));}
