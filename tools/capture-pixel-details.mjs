// Final responsive/camera details from the integrated application, isolated storage.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.argv[2],url=process.argv[3]||'http://127.0.0.1:4173/';
if(!out)throw Error('Provide output directory');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),evidence=[];
for(const [width,height,dpr] of [[402,874,3],[1440,900,1],[844,390,2]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,serviceWorkers:'block'}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&playBuilder.board.threeD?.parkObject);
 const capture=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:`${out}/${width}-${name}.png`});evidence.push({viewport:[width,height],dpr,name,errors:[...errors]});};
 if(width!==844){for(const camera of ['overhead','sideline','behind-green','behind-orange']){await page.evaluate(camera=>playBuilder.action('camera',camera),camera);await capture(camera);}}
 if(width!==1440){
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';playBuilder.render();playBuilder.viewportChanged();});
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.body.dataset.theme=theme,theme);
   await page.locator('.builder-context-menu > summary').click();await capture(`text200-${theme}-options`);await page.locator('.builder-context-menu > summary').click();
   await page.getByRole('button',{name:'Edit shot',exact:true}).click();await capture(`text200-${theme}-editor`);
   await page.locator('.builder-inspector [data-action="collapse-inspector"]').click();
  }
 }
 await context.close();
}
await browser.close();await writeFile(`${out}/details.json`,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({captures:evidence.length,errors:evidence.flatMap(e=>e.errors)}));
