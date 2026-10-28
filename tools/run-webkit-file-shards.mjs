// Local full-gate plan. Default only discovers/plans; --run executes every file.
// It does not change repository CI, timeouts, retry policy or test expectations.
import { mkdirSync, writeFileSync, copyFileSync, existsSync, openSync, closeSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { enforceWebKitPolicy, webkitSpecs, specKey } from './webkit-policy.mjs';

const execute = process.argv.includes('--run');
const root = process.cwd(), revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
if (execute && execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()) throw Error('Commit the complete source before a full run.');
const runRoot = resolve('release-results/all-features', `${execute ? 'full' : 'plan'}-webkit-${revision.slice(0,8)}-${Date.now()}`);
mkdirSync(runRoot,{recursive:true});
const cli = resolve('node_modules/@playwright/test/cli.js');
const config = resolve('tools/playwright.file-shards.config.mjs');
const command = [cli,'test',`--config=${config}`,'--workers=1','--retries=0','--forbid-only'];
const environment = {...process.env,PORT:process.env.PORT || '4231'};
const discovered = spawnSync(process.execPath,[...command,'--list','--reporter=json'],{cwd:root,env:environment,encoding:'utf8',maxBuffer:16*1024*1024});
if(discovered.error || discovered.status !== 0) throw Error(`Discovery failed: ${discovered.error || discovered.stderr}`);
const catalog = JSON.parse(discovered.stdout), catalogPath=join(runRoot,'catalog.json');
writeFileSync(catalogPath,discovered.stdout);
const specs = webkitSpecs(catalog), ids=specs.map(specKey);
if(!ids.length || new Set(ids).size !== ids.length) throw Error('Empty or duplicate full catalog.');
const files=[...new Set(specs.map(spec=>spec.file))].sort();
const shards=files.map((file,index)=>({index:index+1,file,ids:specs.filter(spec=>spec.file===file).map(specKey)}));
if(shards.some(shard=>shard.ids.length>32)) throw Error('A file exceeds the planned 32-case process bound; revise the plan without dropping cases.');
writeFileSync(join(runRoot,'plan.json'),JSON.stringify({revision,execute,tests:ids.length,processes:shards.length,maxCasesPerProcess:Math.max(...shards.map(s=>s.ids.length)),shards},null,2));
console.log(JSON.stringify({runRoot,revision,execute,tests:ids.length,processes:shards.length,maxCasesPerProcess:Math.max(...shards.map(s=>s.ids.length))}));
if(!execute) process.exit(0);

const blobs=join(runRoot,'merge-input');mkdirSync(blobs);
const outcomes=[];
for(const shard of shards){
  const directory=join(runRoot,String(shard.index).padStart(3,'0'));mkdirSync(directory);
  const escaped=shard.file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const log=openSync(join(directory,'run.log'),'w');
  console.log(`Running ${shard.index}/${shards.length}: ${shard.file} (${shard.ids.length} tests)`);
  const result=spawnSync(process.execPath,[...command,`(^|/)${escaped}$`],{cwd:root,env:{...environment,WEBKIT_SHARD_REPORT_DIR:directory},stdio:['ignore',log,log]});
  closeSync(log);
  const blob=join(directory,'blob','report.zip'), present=existsSync(blob);
  if(present)copyFileSync(blob,join(blobs,`${String(shard.index).padStart(3,'0')}.zip`));
  outcomes.push({...shard,exitCode:result.status,signal:result.signal,error:result.error?.message||null,blob:present});
  writeFileSync(join(runRoot,'process-results.json'),JSON.stringify(outcomes,null,2));
  console.log(`Completed ${shard.file}: exit=${result.status}, blob=${present}`);
}
const reportPath=join(runRoot,'merged.json'),mergeConfig=join(runRoot,'merge.config.mjs');
writeFileSync(mergeConfig,`export default ${JSON.stringify({reporter:[['json',{outputFile:reportPath}],['html',{outputFolder:join(runRoot,'html'),open:'never'}]]})};\n`);
const merged=spawnSync(process.execPath,[cli,'merge-reports',`--config=${mergeConfig}`,blobs],{cwd:root,env:environment,encoding:'utf8',maxBuffer:16*1024*1024});
writeFileSync(join(runRoot,'merge.log'),`${merged.stdout||''}\n${merged.stderr||''}`);
if(merged.error || merged.status !== 0)throw Error('Official report merge failed; preserve every raw shard.');
const summary=enforceWebKitPolicy(reportPath,catalogPath,join(runRoot,'strict-summary.json'));
if(outcomes.some(o=>o.exitCode!==0||o.error||!o.blob))throw Error('At least one process failed despite aggregate results.');
if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==revision || execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Source changed during the full run.');
console.log(JSON.stringify({runRoot,revision,...summary}));
