import {chromium,expect} from '@playwright/test';
import {mkdir,rename,writeFile} from 'node:fs/promises';
const out='docs/builder-usability';await mkdir(out,{recursive:true});
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:'/tmp/park-authoring-video',size:{width:1280,height:800}}});const page=await context.newPage();
await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&playBuilder.courtTools.THREE);
// Deliberate viewing holds in this evidence capture; tests use state assertions.
const hold=()=>page.waitForTimeout(650);
await hold();const point=await page.evaluate(()=>playBuilder.courtTools.project(playBuilder.selectedShot.target));await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+35,point.y+8,{steps:20});await page.mouse.up();await hold();
await page.getByRole('button',{name:'2. Return',exact:true}).click();await page.getByLabel('Pace',{exact:true}).selectOption('soft');await hold();
await page.getByRole('button',{name:'3. Drop',exact:true}).click();await page.getByLabel('Shot family',{exact:true}).selectOption('drive');await page.screenshot({path:`${out}/inspector-desktop.png`});await hold();
await page.getByRole('button',{name:'+ Add shot',exact:true}).click();await page.getByLabel('Shot family',{exact:true}).selectOption('drop');await page.getByRole('checkbox',{name:'Coverage Guides',exact:true}).check();await hold();
await page.getByRole('button',{name:'Collapse',exact:true}).click();await page.getByRole('button',{name:'Restart',exact:true}).click();await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>playBuilder.session.clock.elapsed>1.2);await page.getByRole('button',{name:'Pause',exact:true}).click();
const before=await page.evaluate(()=>({source:JSON.stringify(playBuilder.document),time:playBuilder.session.clock.elapsed}));await page.getByRole('button',{name:'2D',exact:true}).click();await page.waitForFunction(()=>playBuilder.view==='2d'&&!playBuilder.busy);expect(await page.evaluate(()=>({source:JSON.stringify(playBuilder.document),time:playBuilder.session.clock.elapsed}))).toEqual(before);await hold();await page.screenshot({path:`${out}/authoring-2d.png`});await page.waitForTimeout(2000);
await page.getByRole('button',{name:'3D',exact:true}).click();await page.waitForFunction(()=>playBuilder.view==='3d'&&!playBuilder.busy);await hold();await page.screenshot({path:`${out}/authoring-return.png`});await hold();
await writeFile(`${out}/authoring-example.json`,await page.evaluate(()=>playBuilder.store.exportJSON(playBuilder.document)));
const video=page.video();await context.close();await rename(await video.path(),`${out}/authoring.webm`);
for(const[width,height]of[[390,844],[844,390],[768,1024]]){const c=await browser.newContext({viewport:{width,height}});const p=await c.newPage();await p.goto('http://127.0.0.1:4173/');await p.waitForFunction(()=>window.playBuilder&&!playBuilder.busy);await p.getByRole('button',{name:'Edit shot',exact:true}).click();await p.screenshot({path:`${out}/inspector-${width}.png`});await p.getByRole('button',{name:'Collapse',exact:true}).click();await p.screenshot({path:`${out}/collapsed-${width}.png`});await c.close();}
await browser.close();
