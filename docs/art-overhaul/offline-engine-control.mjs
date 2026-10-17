import { createServer } from 'node:http';
import { chromium, webkit } from 'playwright';
import { writeFileSync } from 'node:fs';
const html = '<!doctype html><title>Independent offline fixture</title><p>Cached control</p><script>navigator.serviceWorker.register("/sw.js")</script>';
const sw = 'self.addEventListener("install",e=>e.waitUntil(caches.open("control-v1").then(c=>c.add("/"))));self.addEventListener("activate",e=>e.waitUntil(clients.claim()));self.addEventListener("fetch",e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));';
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/sw.js'?'text/javascript':'text/html');res.end(req.url==='/sw.js'?sw:html);});
await new Promise(resolve=>server.listen(4219,'127.0.0.1',resolve));
const results=[];
try {
 for (const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await type.launch({headless:true});
  try {
   const context=await browser.newContext({serviceWorkers:'allow'}),page=await context.newPage();page.setDefaultTimeout(15000);
   await page.goto('http://127.0.0.1:4219/');await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
   const cached=await page.evaluate(async()=>Boolean(await caches.match('/')));
   await context.setOffline(true);
   let error=null;try{await page.reload();}catch(e){error=e.message.split('\n')[0];}
   results.push({engine,cached,offlineReload:error?'failed':'passed',error,title:await page.title()});
  } finally { await browser.close(); }
 }
} finally { await new Promise(resolve=>server.close(resolve)); }
writeFileSync('/tmp/pickleboard-offline-control.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
