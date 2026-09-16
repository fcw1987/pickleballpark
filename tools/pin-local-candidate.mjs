// Reproducibly pin an explicitly selected local runtime revision for review.
// This does not approve publication, commit, push, or deploy anything.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const source=process.argv[2];if(!/^[a-f0-9]{40}$/.test(source||''))throw Error('Provide the full committed runtime revision to pin');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
if(git('rev-parse',source)!==source)throw Error('Unknown source revision');
const walk=(dir)=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):`${dir}/${e.name}`);
const paths=[...readdirSync('.').filter(p=>/\.(?:js|css|html)$/.test(p)||['manifest.json','version.json'].includes(p)),...walk('icons'),...walk('vendor'),...walk('assets').filter(p=>!p.startsWith('assets/source/'))].sort();
for(const required of ['version.json','build-identity.js','build-metadata.js'])if(!paths.includes(required))throw Error(`Runtime metadata is missing from package path set: ${required}`);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=paths.map(path=>{const bytes=readFileSync(path),committed=execFileSync('git',['show',`${source}:${path}`],{maxBuffer:20*1024*1024});if(!bytes.equals(committed))throw Error(`Uncommitted or different runtime: ${path}`);return {path,bytes:bytes.length,sha256:sha(bytes)};});
const old=JSON.parse(readFileSync('tests/fixtures/approved-runtime.json'));
const previousDigest=sha(JSON.stringify({approvedSource:old.source,files:old.files},null,2)+'\n');
const digest=sha(JSON.stringify({approvedSource:source,files},null,2)+'\n');
const size=files.reduce((n,f)=>n+f.bytes,0),oldSize=old.files.reduce((n,f)=>n+f.bytes,0);
const updates=[];
for(const file of ['tools/build-site.mjs','tools/verify-deployment-artifact.mjs','tests/deployment-artifact.unit.mjs']){
 const original=readFileSync(file,'utf8');
 if(!original.includes(previousDigest))throw Error(`Previous manifest pin is absent from ${file}; inspect its contract before updating`);
 let text=original.replaceAll(previousDigest,digest);
 if(file.endsWith('verify-deployment-artifact.mjs')){
  for(const expected of [old.source,`manifest.files.length !== ${old.files.length}`,`exactly ${old.files.length} files`])if(!text.includes(expected))throw Error(`Previous artifact contract is absent from ${file}: ${expected}`);
  text=text.replaceAll(old.source,source).replace(`manifest.files.length !== ${old.files.length}`,`manifest.files.length !== ${files.length}`).replace(`exactly ${old.files.length} files`,`exactly ${files.length} files`);
 }
 if(file.endsWith('deployment-artifact.unit.mjs')){
  const expected=`runtimeFiles: ${old.files.length}, runtimeBytes: ${oldSize}`;
  if(!text.includes(expected))throw Error(`Previous byte/count assertion is absent from ${file}`);
  text=text.replace(expected,`runtimeFiles: ${files.length}, runtimeBytes: ${size}`);
 }
 updates.push([file,text]);
}
// Validate every old pin before modifying any of the contract files.
for(const [file,text] of updates)writeFileSync(file,text);
writeFileSync('tests/fixtures/approved-runtime.json',JSON.stringify({source,files},null,2)+'\n');
console.log(JSON.stringify({source,manifestSha256:digest,runtimeFiles:files.length,runtimeBytes:size,deltaBytes:size-oldSize,added:files.filter(f=>!old.files.some(o=>o.path===f.path)).map(f=>f.path),removed:old.files.filter(f=>!files.some(o=>o.path===f.path)).map(f=>f.path),note:'Local review package only; owner acceptance and publication are separate.'},null,2));
