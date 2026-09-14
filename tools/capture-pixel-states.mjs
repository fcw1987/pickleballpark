// Actual integrated interface states, with synthetic inputs and isolated storage.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.argv[2],url=process.argv[3]||'http://127.0.0.1:4173/';
if(!out)throw Error('Provide state capture directory');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),evidence=[];
for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width:402,height:874},deviceScaleFactor:3,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await page.goto(url);await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&playBuilder.courtTools.THREE);await page.evaluate(theme=>document.body.dataset.theme=theme,theme);};
 const capture=async state=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:`${out}/402x874-${theme}-${state}.png`});evidence.push({theme,state,...await page.evaluate(()=>({playing:playBuilder.session.playing,time:playBuilder.session.clock.elapsed,shots:playBuilder.document.shots.length,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,focused:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.trim().slice(0,60)}))});};
 await ready();await page.locator('.builder-main-menu > summary').click();await capture('menu');
 await page.getByRole('button',{name:'My Plays',exact:true}).click();await capture('my-plays');
 await ready();await page.locator('.builder-main-menu > summary').click();await page.getByRole('button',{name:'Learn',exact:true}).click();await capture('learn');
 await ready();await page.locator('.builder-context-menu > summary').click();await capture('playback-options');
 await ready();await page.locator('.builder-main-menu > summary').click();await page.getByRole('button',{name:'Help',exact:true}).click();await capture('help');
 await ready();await page.locator('.builder-main-menu > summary').click();await page.getByRole('button',{name:'Court Planner',exact:true}).click();await page.getByRole('button',{name:'Use as starting layout',exact:true}).click();await capture('planner-confirmation');
 await ready();await page.locator('.builder-main-menu > summary').click();
 await page.locator('.builder-main-menu > summary').click();await page.getByLabel('Choose shot chapter',{exact:true}).click();await capture('chapters');
 await page.getByRole('button',{name:'Edit Shot 2',exact:true}).click();await capture('editing');
 await page.getByText('Details · coordinates, contact, movement',{exact:true}).click();await capture('details');
 await page.getByRole('button',{name:'Place target on court',exact:true}).click();await capture('placement');
 await ready();await page.locator('.builder-main-menu > summary').click();await page.getByRole('button',{name:'Import / Export',exact:true}).click();
 await page.getByLabel('JSON backup').fill('{broken');await page.getByRole('button',{name:'Import JSON',exact:true}).click();await capture('import-error');
 await ready();await page.evaluate(async()=>{const storage=playBuilder.store.storage;playBuilder.store.storage={getItem:storage.getItem.bind(storage),removeItem:storage.removeItem.bind(storage),setItem(){throw new DOMException('Storage quota reached','QuotaExceededError');}};await playBuilder.action('title','Synthetic unsaved rally');});await capture('save-failure');
 // New isolated state; reload restores only this context's synthetic documents.
 await ready();await page.evaluate(async()=>{const doc=structuredClone(playBuilder.document);doc.shots[1].hitter=doc.shots[0].hitter;await playBuilder.action('import',JSON.stringify(doc));await playBuilder.action('playPause');});await capture('invalid-sequence');
 await ready();await page.evaluate(async()=>{const doc=structuredClone(playBuilder.document);doc.shots=[];await playBuilder.action('import',JSON.stringify(doc));});await capture('empty');
 await ready();await page.evaluate(async()=>{await playBuilder.action('new');await playBuilder.switchView('2d');const viewer=playBuilder.board.threeD;viewer.enter=()=>new Promise(()=>{});void playBuilder.switchView('3d');});await capture('loading');
 evidence.push({theme,errors});await context.close();
}
await browser.close();await writeFile(`${out}/states.json`,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({captures:evidence.filter(e=>e.state).length,errors:evidence.flatMap(e=>e.errors||[])}));
