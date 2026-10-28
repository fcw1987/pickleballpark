import {chooseShotFamily} from './helpers/builder-navigation.mjs';
import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {expectBuilderAddComplete,openCoachTools,openIntentTab,openPlayFileMenu,switchCourtView} from './helpers/builder-navigation.mjs';
test.use({launchOptions:process.env.IPHONE_RECORD?{slowMo:120}:{}});
const open=async page=>{await page.goto('/');await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&playBuilder.view==='3d');};
const edit=async page=>{const inspector=page.locator('.builder-inspector:not(.builder-inspector-collapsed)');if(!await inspector.isVisible())await page.getByRole('button',{name:'Edit shot',exact:true}).click();};
const details=async(page,group='Precision')=>{await edit(page);return openIntentTab(page,group);};
const finish=async page=>{await page.locator('.builder-inspector [data-action=collapse-inspector]').click();};
const field=async(page,name,value)=>{const control=page.getByLabel(name,{exact:true});if(name==='Play title'&&!await control.isVisible())await openPlayFileMenu(page);await control.fill(String(value));await control.press('Enter');if(name==='Play title')await page.locator('.builder-main-menu').evaluate(node=>{node.open=false;});};
const menu=async page=>page.locator('.builder-main-menu > summary').click();
const chapter=async(page,number,label)=>{const picker=page.locator('.builder-chapter-menu');if(!await picker.locator('.builder-chapter-list').isVisible())await picker.locator(':scope > summary').click();await picker.getByRole('button',{name:new RegExp(`Shot ${number} · ${label}`)}).click();};

test('complete portrait custom rally and detailed movement survive retained view APIs, reload, lessons and planner',async({browser})=>{
 const record=process.env.IPHONE_RECORD; if(record)await mkdir(record,{recursive:true});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:2,...(record?{recordVideo:{dir:record,size:{width:390,height:844}}}:{})});
 const page=await context.newPage();await open(page);await field(page,'Play title','Phone custom rally');
 await edit(page);await page.getByRole('button',{name:'Place target on court',exact:true}).click();
 const target=await page.evaluate(()=>playBuilder.courtTools.project({x:6,y:37}));await page.touchscreen.tap(target.x,target.y);const exactTarget=await page.evaluate(()=>structuredClone(playBuilder.selectedShot.target));
 await chapter(page,2,'Return');const flight=await details(page,'Flight');await flight.getByLabel('Flight',{exact:true}).selectOption('high/soft');
 await chapter(page,3,'Drop');await edit(page);await chooseShotFamily(page,'Drive');
 await page.getByRole('button',{name:'Add shot',exact:true}).click();await expectBuilderAddComplete(page,4);await edit(page);await chooseShotFamily(page,'Drop');
 expect(await page.evaluate(()=>playBuilder.compiled.validShotCount)).toBe(4);
 await finish(page);await page.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>page.evaluate(()=>playBuilder.session.clock.elapsed)).toBeGreaterThan(.7);await page.getByRole('button',{name:'Pause',exact:true}).click();
 expect(await page.evaluate(()=>playBuilder.session.clock.playing)).toBe(false);
 const paused=await page.evaluate(()=>playBuilder.session.clock.elapsed);await switchCourtView(page,'2d');expect(await page.evaluate(()=>playBuilder.session.clock.elapsed)).toBe(paused);
 await switchCourtView(page,'3d');
 await chapter(page,1,'Serve');await details(page,'Movement');
 await page.getByLabel('Moving player',{exact:true}).selectOption('player2');await field(page,'Manual X',7.25);await field(page,'Manual Y',4);
 expect(await page.evaluate(()=>playBuilder.selectedShot.playerMovement.player2.target)).toEqual({x:7.25,y:4});
 await page.getByRole('button',{name:'Place movement on court',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel movement',exact:true})).toBeVisible();
 const pin=await page.evaluate(()=>playBuilder.courtTools.project({x:7,y:4}));await page.touchscreen.tap(pin.x,pin.y);
 const exactPin=await page.evaluate(()=>structuredClone(playBuilder.selectedShot.playerMovement.player2));
 await edit(page);await openCoachTools(page);await page.getByRole('checkbox',{name:'Auto Shading',exact:true}).check();await page.getByRole('checkbox',{name:'Coverage Guides',exact:true}).check();
 await page.getByRole('button',{name:'Undo authored edit',exact:true}).click();await page.getByRole('button',{name:'Redo authored edit',exact:true}).click();
 const saved=await page.evaluate(()=>structuredClone(playBuilder.document));expect(saved.shots[0].target).toEqual(exactTarget);expect(saved.shots[0].playerMovement.player2).toEqual(exactPin);expect(saved.shots.length).toBe(4);
 if(record){await page.screenshot({path:`${record}/custom-phone.png`});await import('node:fs/promises').then(fs=>fs.writeFile(`${record}/custom-play.json`,JSON.stringify(saved,null,2)+'\n'));}
 await page.reload();await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy);expect(await page.evaluate(()=>playBuilder.document)).toEqual(saved);
 await menu(page);await page.getByRole('button',{name:'Learn',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Serve & Return',exact:true}).click();
 await openPlayFileMenu(page);await page.getByRole('button',{name:'My Plays',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Phone custom rally',exact:true}).click();expect(await page.evaluate(()=>playBuilder.document)).toEqual(saved);
 await menu(page);await page.getByRole('button',{name:'Court Planner',exact:true}).click();await page.getByRole('button',{name:'Return to builder',exact:true}).click();await page.waitForFunction(()=>!playBuilder.busy);expect(await page.evaluate(()=>playBuilder.document)).toEqual(saved);
 const video=page.video();await context.close();if(record)await video.saveAs(`${record}/phone-authoring.webm`);
});

test('invalid numeric edits and import remain recoverable inside the phone controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);await details(page);const target=await page.evaluate(()=>structuredClone(playBuilder.selectedShot.target));
 await field(page,'Target width','');expect(await page.evaluate(()=>playBuilder.selectedShot.target)).toEqual(target);await expect(page.getByLabel('Target width',{exact:true})).toHaveAttribute('aria-invalid','true');await page.getByLabel('Target width',{exact:true}).press('Escape');await expect(page.getByLabel('Target width',{exact:true})).toHaveValue(String(target.x));
 await field(page,'Target width',6.125);expect(await page.evaluate(()=>playBuilder.selectedShot.target.x)).toBe(6.125);
 await page.evaluate(()=>playBuilder.action('editShot',{field:'target.x',value:5.999999791}));await details(page);await expect(page.getByLabel('Target width',{exact:true})).toHaveValue('6');await finish(page);expect(await page.evaluate(()=>playBuilder.selectedShot.target.x)).toBe(5.999999791);await openPlayFileMenu(page);await page.getByRole('button',{name:'Import / Export',exact:true}).click();await page.getByLabel('JSON backup').fill('{broken');await page.getByRole('button',{name:'Import JSON',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('JSON backup')).toHaveValue('{broken');await expect(page.locator('.builder-import-status')).toContainText('malformed');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export current play',exact:true}).click();await download;await expect(page.getByLabel('JSON backup')).toHaveValue(/schemaVersion/);await page.getByRole('button',{name:'Close',exact:true}).click();
});

test('resizing, themes and keyboard-height simulation preserve detailed authored values',async({page})=>{
 await open(page);await page.evaluate(()=>playBuilder.action('editMovement',{player:'player2',field:'target',value:{x:7.25,y:4}}));const before=await page.evaluate(()=>JSON.stringify(playBuilder.document));
 for(const [width,height]of [[390,844],[390,470],[844,390],[768,1024],[1024,768],[680,900],[1440,900]]){await page.setViewportSize({width,height});await page.evaluate(()=>{document.body.dataset.theme='dark';});await details(page);await field(page,'Target width',5);await finish(page);await switchCourtView(page,'2d');await switchCourtView(page,'3d');expect(await page.evaluate(()=>JSON.stringify(playBuilder.document))).toBe(before);}
});

test('a displayed Pause cannot restart a rally that completed before click dispatch',async({page})=>{
 await open(page);
 const result=await page.evaluate(()=>{
  const b=playBuilder;b.play();b.render();const button=document.querySelector('.builder-ui [data-action="play-pause"]');
  const shown=button.getAttribute('aria-label');b.session.clock.elapsed=b.session.duration;b.session.complete=true;b.session.clock.pause();
  button.click();return{shown,playing:b.session.clock.playing,time:b.session.clock.elapsed,end:b.session.duration};
 });
 expect(result.shown).toBe('Pause');expect(result.playing).toBe(false);expect(result.time).toBe(result.end);
});
