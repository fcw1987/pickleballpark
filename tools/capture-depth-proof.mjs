// Record the actual app, native canvas resolution and real pointer gestures.
import { chromium } from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.PROOF_OUT||'release-results/depth-proof';
await mkdir(out,{recursive:true});
const browser=await chromium.launch();const evidence=[];
try {for(const [name,viewport] of [['desktop',{width:1440,height:900}],['phone',{width:390,height:844}]]){
 const context=await browser.newContext({viewport,serviceWorkers:'block',recordVideo:{dir:out,size:viewport}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4182');
 await page.waitForFunction(()=>window.playBuilder?.view==='3d'&&pickleboard.threeD?.cameraControls);
 await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>pickleboard.threeD.worldAssetsReady===true);
 await page.evaluate(async()=>{await playBuilder.action('template','dink-exchange');const segment=playBuilder.compiled.timeline.segments.find(s=>s.shotSemantics);playBuilder.seek(segment.startTime+segment.contactTime);playBuilder.play();});
 await page.waitForTimeout(150);
 const before=await page.evaluate(()=>({camera:pickleboard.threeD.cameraControls.getState(),document:JSON.stringify(playBuilder.document),canvas:{width:pickleboard.threeD.renderer.domElement.width,cssWidth:pickleboard.threeD.renderer.domElement.clientWidth}}));
 await page.screenshot({path:`${out}/${name}-start.png`});
 const canvas=page.locator('#threeDCanvas canvas');const box=await canvas.boundingBox();if(!box)throw Error('Missing real 3D canvas');
 const start={x:box.x+box.width*.08,y:box.y+box.height*.55};
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+180,start.y+75,{steps:24});await page.mouse.up();
 for(let turn=0;turn<4;turn++){await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+180,start.y,{steps:16});await page.mouse.up();}
 const orbit=await page.evaluate(()=>pickleboard.threeD.cameraControls.getState());
 if(Math.abs(orbit.azimuth-before.camera.azimuth)<Math.PI*2)throw Error('Empty-surface orbit did not move');
 await page.screenshot({path:`${out}/${name}-orbit.png`});
 await page.keyboard.down('Shift');await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+45,start.y-30,{steps:12});await page.mouse.up();await page.keyboard.up('Shift');
 const pan=await page.evaluate(()=>pickleboard.threeD.cameraControls.getState());
 await page.mouse.wheel(0,180);await page.waitForTimeout(200);
 await page.getByRole('button',{name:'Reset view',exact:true}).click();
 const reset=await page.evaluate(()=>pickleboard.threeD.cameraControls.getState());
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:`${out}/${name}-detail.png`});await page.getByRole('button',{name:'Reset view',exact:true}).click();
 const menu=page.locator('.builder-main-menu > summary');if(await menu.count()){await menu.click();await page.waitForTimeout(300);await page.screenshot({path:`${out}/${name}-menu.png`});await menu.click();}
 await page.waitForTimeout(2400);
 await page.screenshot({path:`${out}/${name}-motion.png`});
 await page.getByRole('button',{name:'Edit shot',exact:true}).click();await page.waitForTimeout(150);
 await page.screenshot({path:`${out}/${name}-editor.png`});
 const after=await page.evaluate(()=>({unchanged:JSON.stringify(playBuilder.document),state:pickleboard.threeD.getState(),overflow:document.documentElement.scrollWidth>innerWidth}));
 const video=page.video();await context.close();await video.saveAs(`${out}/${name}-camera-menu-motion.webm`);
 evidence.push({name,viewport,before:{...before,document:undefined},orbit,pan,reset,authoredDocumentUnchanged:before.document===after.unchanged,state:after.state,overflow:after.overflow,errors});
}}
finally{await browser.close();await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2)+'\n');}
console.log(JSON.stringify(evidence,null,2));
