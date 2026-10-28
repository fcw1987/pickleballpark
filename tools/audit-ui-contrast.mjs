import { chromium, webkit } from '@playwright/test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import { resolve } from 'node:path';
import { openBuilderMainMenu, openPlayFileMenu, openCoachTools } from '../tests/helpers/builder-navigation.mjs';

// Audit live, resolved colors rather than comparing palette constants. Alpha and
// element opacity are composited recursively over each actual ancestor backdrop.
export function auditVisibleText() {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = canvas.height = 1;
  const rgba = value => { ctx.clearRect(0,0,1,1); ctx.fillStyle = value; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v); };
  const over = (fg,bg) => { const a=fg[3]+bg[3]*(1-fg[3]); return [0,1,2].map(i=>a?(fg[i]*fg[3]+bg[i]*bg[3]*(1-fg[3]))/a:0).concat(a); };
  const luminance = c => c.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
  const ratio = (a,b) => { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
  const rows=[];
  const elements=[...document.querySelectorAll('.builder-ui *, #infoModal *')];
  for (const el of elements) {
    if (!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) continue;
    if (el.closest('details:not([open])') && !el.closest('details:not([open]) > summary')) continue;
    const text=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).filter(Boolean).join(' ') || (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)?(el.value||el.placeholder):'');
    if (!text || el.closest('svg,canvas,script,style')) continue;
    const rect=el.getBoundingClientRect();
    if (rect.width<1||rect.height<1||rect.bottom<=0||rect.top>=innerHeight||rect.right<=0||rect.left>=innerWidth) continue;
    const x=Math.min(innerWidth-1,Math.max(0,rect.x+rect.width/2)),y=Math.min(innerHeight-1,Math.max(0,rect.y+rect.height/2));
    const hit=document.elementFromPoint(x,y);
    if (hit && !el.contains(hit) && !hit.contains(el)) continue;
    const chain=[];for(let p=el;p;p=p.parentElement)chain.push(p);
    const style=getComputedStyle(el);let fg=rgba(style.color),bg=[0,0,0,0],unsupported=[];
    for(const node of chain){const s=getComputedStyle(node),back=rgba(s.backgroundColor);fg=over(fg,back);bg=over(bg,back);const opacity=Number(s.opacity);fg[3]*=opacity;bg[3]*=opacity;
      // Reference border images fill the same ivory as background-color.
      if(s.backgroundImage!=='none')unsupported.push(s.backgroundImage);
    }
    fg=over(fg,[255,255,255,1]);bg=over(bg,[255,255,255,1]);
    const large=Number.parseFloat(style.fontSize)>=24||(Number.parseFloat(style.fontSize)>=18.66&&Number.parseInt(style.fontWeight)>=700);
    const disabled=el.matches(':disabled')||Boolean(el.closest('[aria-disabled="true"]'));
    const threshold=disabled?3:large?3:4.5;
    rows.push({kind:'text',text:text.slice(0,160),tag:el.tagName,cls:el.className,action:el.dataset.action,foreground:fg,backdrop:bg,ratio:ratio(fg,bg),threshold,disabled,unsupported});
    if(el.matches('button,select,input:not([type=range]),textarea,[role=tab],summary')){
      let surrounding=[0,0,0,0];
      for(const node of chain.slice(1)){const s=getComputedStyle(node);surrounding=over(surrounding,rgba(s.backgroundColor));surrounding[3]*=Number(s.opacity);}
      surrounding=over(surrounding,[255,255,255,1]);
      for(const [kind,color,width,borderStyle] of [['control-border',style.borderTopColor,style.borderTopWidth,style.borderTopStyle],['focus-outline',style.outlineColor,style.outlineWidth,style.outlineStyle]]){
        const edge=rgba(color);
        if(Number.parseFloat(width)>0&&borderStyle!=='none'&&edge[3]>.1){
          const resolved=over(edge,surrounding);
          rows.push({kind,text:text.slice(0,160),cls:el.className,foreground:resolved,backdrop:surrounding,ratio:ratio(resolved,surrounding),threshold:3,disabled});
        }
      }
    }

  }
  return rows;
}

const out=resolve(process.env.CONTRAST_OUT||'release-results/ui-contrast-20261027-v2');fs.mkdirSync(out,{recursive:true});
const cssHash=()=>createHash('sha256').update(fs.readFileSync(new URL('../builder-ui.css',import.meta.url))).digest('hex');
const sourceBefore=cssHash();
const engine=process.env.CONTRAST_BROWSER||'chromium';
if(!['chromium','webkit'].includes(engine))throw new Error(`Unsupported contrast browser: ${engine}`);
const browser=await ({chromium,webkit})[engine].launch({headless:true});const results=[],errors=[];
try {
for(const viewport of [{width:1440,height:900},{width:390,height:844}])for(const theme of ['light','dark'])for(const scale of [1,2]){
 const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();await page.emulateMedia({reducedMotion:'reduce'});
 for(const surface of ['rest','manage','rename','library','saved-library','import-error','inspector','coaching','help','diagnostics','camera-help']){
  const key=`${viewport.width}-${theme}-${scale}x-${surface}`;
  try {
   await page.goto(process.env.CONTRAST_URL||'http://127.0.0.1:4186/');await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy&&pickleboard.threeD?.worldAssetsReady);
   if(await page.evaluate(()=>document.body.dataset.theme)!==theme){await openBuilderMainMenu(page);await page.getByLabel(`Switch to ${theme} appearance`,{exact:true}).click();}
   if(scale===2) await page.evaluate(()=>{document.documentElement.style.fontSize='200%';document.body.classList.add('builder-large-text');});
   const closeMenu=async()=>{if(await page.locator('.builder-main-menu').evaluate(n=>n.open))await page.getByLabel('Menu',{exact:true}).click();};
   if(['manage','rename','library','saved-library','import-error','diagnostics'].includes(surface)){
    await openPlayFileMenu(page);
    if(surface==='rename')await page.getByRole('button',{name:'Rename play',exact:true}).click();
    if(surface==='saved-library'){await page.getByRole('button',{name:'Save As',exact:true}).click();await openPlayFileMenu(page);}
    if(['library','saved-library'].includes(surface))await page.getByRole('button',{name:'My Plays',exact:true}).click();
    if(surface==='import-error'){await page.getByRole('button',{name:'Import / Export',exact:true}).click();await page.getByLabel('JSON backup',{exact:true}).fill('invalid json');await page.getByRole('button',{name:'Import JSON',exact:true}).click();}
    if(surface==='diagnostics'){await page.getByRole('button',{name:'Build diagnostics',exact:true}).click();await page.locator('#buildDiagnostics details > summary').click();}
   }else if(['inspector','coaching'].includes(surface)){await closeMenu();await page.getByRole('button',{name:'Edit shot',exact:true}).click();if(surface==='coaching')await openCoachTools(page);}
   else if(surface==='help'){await openBuilderMainMenu(page);await page.getByRole('button',{name:'Help',exact:true}).click();}
   else {await closeMenu();if(surface==='camera-help')await page.locator('.builder-camera-help > summary').click();}
   if(['help','diagnostics'].includes(surface))await page.locator('#infoModal.active').waitFor({state:'visible'});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:resolve(out,`${key}.png`)});
   const scans=[];
   for(const fraction of [0,.5,1]){
    await page.evaluate(fraction=>{for(const n of document.querySelectorAll('.builder-ui,.builder-menu-panel,.builder-inspector,.modal-body,dialog[open]'))if(n.scrollHeight>n.clientHeight)n.scrollTop=(n.scrollHeight-n.clientHeight)*fraction;},fraction);
    scans.push(...await page.evaluate(auditVisibleText));
   }
   await page.keyboard.press('Tab');scans.push(...await page.evaluate(auditVisibleText));
   if(scale===2)await page.screenshot({path:resolve(out,`${key}-scrolled.png`)});
   const rows=[...new Map(scans.map(r=>[JSON.stringify([r.kind,r.text,r.cls,r.ratio]),r])).values()];
   const failures=rows.filter(r=>r.ratio<r.threshold);
   results.push({key,rows,failures});fs.writeFileSync(resolve(out,'report.json'),JSON.stringify({engine,sourceBefore,sourceAfter:cssHash(),results,errors},null,2));console.log(key,rows.length,'text pairs;',failures.length,'failures',JSON.stringify(failures.map(({text,ratio})=>({text,ratio}))));
  }catch(error){errors.push({key,error:error.message});console.log('ERROR',key,error.message);}
 }
 await context.close();
}
} finally {await browser.close();}
fs.writeFileSync(resolve(out,'report.json'),JSON.stringify({engine,sourceBefore,sourceAfter:cssHash(),results,errors},null,2));
const unresolved=results.flatMap(r=>r.rows.filter(row=>row.unsupported?.length).map(row=>({key:r.key,...row})));
const failures=results.flatMap(r=>r.failures.map(f=>({key:r.key,...f})));
console.log(JSON.stringify({states:results.length,textPairs:results.reduce((s,r)=>s+r.rows.length,0),failures,unresolved,errors},null,2));
if(failures.length||unresolved.length||errors.length||sourceBefore!==cssHash())process.exitCode=1;
