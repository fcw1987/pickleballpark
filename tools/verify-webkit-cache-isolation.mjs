// Isolated WebKit diagnostic: no Pickleboard code or cache deletion is served.
import {createServer} from 'node:http';
import {writeFileSync} from 'node:fs';
import {webkit} from '@playwright/test';
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/empty-sw.js'?'text/javascript':'text/html');res.end(req.url==='/empty-sw.js'?"self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));":'<!doctype html><title>Isolated cache diagnostic</title>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await webkit.launch(),context=await browser.newContext(),page=await context.newPage();
const read=()=>page.evaluate(async()=>{const c=await caches.open('unrelated-application-cache'),r=await c.match('/saved');return{keys:(await c.keys()).map(r=>r.url),body:r?await r.text():null};});
try{
 await page.goto(origin+'/seed');await page.evaluate(async()=>{const c=await caches.open('unrelated-application-cache');await c.put('/saved',new Response('keep me'));});
 const seeded=await read();await page.goto(origin+'/target');const afterPlainNavigation=await read();
 await page.evaluate(async()=>{await navigator.serviceWorker.register('/empty-sw.js');await navigator.serviceWorker.ready;});await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 const afterEmptyWorker=await read(),evidence={browser:'Playwright WebKit',origin,appCodeServed:false,cacheDeletionCodeServed:false,seeded,afterPlainNavigation,afterEmptyWorker};
 writeFileSync('docs/park-coaching/webkit-minimal-cache.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
 if(afterEmptyWorker.body!=='keep me')process.exitCode=1;
}finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
