/** Local macOS WEBM → PNG frames → native H.264/MP4; no downloads or packages. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const source=path.resolve(process.argv[2]||'release-results/pixel-motion/actual-app-strokes.webm');
const output=path.resolve(process.argv[3]||source.replace(/\.webm$/i,'.mp4'));
if(source===output)throw Error('Input and output must differ');
const ffmpeg=process.env.PIXEL_REVIEW_FFMPEG||path.join(homedir(),'Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac');
if(!existsSync(ffmpeg))throw Error('Set PIXEL_REVIEW_FFMPEG to the installed Playwright ffmpeg binary');
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0)throw Error(`${cmd}: ${r.error||r.stderr||r.stdout}`);return r;};
const sourceBytes=await readFile(source);
const temporary=await mkdtemp(path.join(tmpdir(),'pixel-review-mp4-'));
const snapshot=path.join(temporary,'source.webm');await writeFile(snapshot,sourceBytes);
const probe=spawnSync(ffmpeg,['-i',snapshot],{encoding:'utf8'}).stderr;
const match=probe.match(/Video:[^\n]*? (\d+(?:\.\d+)?) fps/);
if(!match||!Number.isInteger(Number(match[1])))throw Error('Expected an integral native source cadence; refusing implicit cadence conversion');
const fps=Number(match[1]);
try{
 const frames=path.join(temporary,'frames');await mkdir(frames);await mkdir(path.dirname(output),{recursive:true});
 run(ffmpeg,['-y','-i',snapshot,'-vsync','0',path.join(frames,'frame-%06d.png')]);
 const executable=path.join(temporary,'encode');
 run('/usr/bin/swiftc',['-module-cache-path',path.join(temporary,'swift-cache'),path.join(path.dirname(fileURLToPath(import.meta.url)),'encode-pixel-review.swift'),'-o',executable]);
 const metadata=output.replace(/\.mp4$/i,'.metadata.json');
 const result=run(executable,[frames,String(fps),output,metadata]);
 const info=JSON.parse(await readFile(metadata,'utf8'));info.source=path.basename(source);info.sourceSha256=createHash('sha256').update(sourceBytes).digest('hex');info.sourceFps=fps;info.sourceProbe=probe.split('\n').filter(line=>/Duration:|Video:/.test(line));
 await writeFile(metadata,JSON.stringify(info,null,2)+'\n');process.stdout.write(result.stdout);
}finally{await rm(temporary,{recursive:true,force:true});}
