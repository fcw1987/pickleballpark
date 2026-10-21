// Decode with Playwright's already-installed FFmpeg. No tool installation.
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdtemp,readdir} from 'node:fs/promises';
import {join} from 'node:path';import {homedir,tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
const cache=process.platform==='darwin'?join(homedir(),'Library/Caches/ms-playwright'):join(homedir(),'.cache/ms-playwright');
const installed=(await readdir(cache)).find(n=>n.startsWith('ffmpeg-'));
const ffmpeg=process.env.PLAYWRIGHT_FFMPEG || join(cache,installed,process.platform==='darwin'?'ffmpeg-mac':'ffmpeg-linux');
const file='docs/builder-usability/authoring.webm';const metadata=spawnSync(ffmpeg,['-i',file],{encoding:'utf8'}).stderr;
const parts=metadata.match(/Duration: (\d+):(\d+):([\d.]+)/);if(!parts)throw Error('Recording duration unavailable');const duration=Number(parts[1])*3600+Number(parts[2])*60+Number(parts[3]);
const temp=await mkdtemp(join(tmpdir(),'park-clip-frames-'));const frames=[];
for(let t=0;t<duration-.05;t+=.5){const path=join(temp,`${frames.length}.png`);const run=spawnSync(ffmpeg,['-v','error','-ss',String(t),'-i',file,'-vf','scale=640:400','-frames:v','1',path,'-y']);if(run.status)throw Error('Frame extraction failed');frames.push({time:t,image:'data:image/png;base64,'+(await readFile(path)).toString('base64')});}
const browser=await chromium.launch();const page=await browser.newPage();
for(let i=0;i<frames.length;i+=6){const data=await page.evaluate(async frames=>{const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=1260;const c=canvas.getContext('2d');c.fillStyle='#fffbea';c.fillRect(0,0,1280,1260);for(const[n,frame]of frames.entries()){const image=new Image();image.src=frame.image;await image.decode();const x=(n%2)*640,y=Math.floor(n/2)*420;c.drawImage(image,x,y+20);c.fillStyle='#182b3a';c.font='14px sans-serif';c.fillText(`${frame.time.toFixed(1)} s`,x+8,y+15);}return canvas.toDataURL('image/png').split(',')[1];},frames.slice(i,i+6));await writeFile(`docs/builder-usability/motion-review-${i/6+1}.png`,Buffer.from(data,'base64'));}
await browser.close();await writeFile('docs/builder-usability/recording-review.json',JSON.stringify({durationSeconds:duration,captureFramesPerSecond:25,sampledEverySeconds:.5,frames:frames.length,sheets:Math.ceil(frames.length/6),method:'Installed Playwright FFmpeg decoding; capture rate is not runtime FPS.'},null,2)+'\n');
