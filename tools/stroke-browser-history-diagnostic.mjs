// Actual browser module diagnostic for a suspected first-sample history failure.
import{chromium,webkit}from'@playwright/test';
import{readFileSync}from'node:fs';import{writeFile,mkdir}from'node:fs/promises';import{createHash}from'node:crypto';
import{runtimeFileset}from'./stamp-build.mjs';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4177/index.html',out=process.env.DIAGNOSTIC_OUTPUT||'docs/stroke-instruction/verification/browser-history-diagnostic.json';
const source=JSON.parse(readFileSync('tests/fixtures/overhead-short-hop-document.json','utf8')),before=runtimeFileset();
for(const f of before.files){const r=await fetch(new URL(f.path,base));if(!r.ok||createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex')!==f.sha256)throw new Error(`Served byte mismatch ${f.path}`);}
const results=[];
for(const[name,engine]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch(),context=await browser.newContext({viewport:{width:900,height:700},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{await page.goto(base+'?stroke-history-diagnostic=1');
 const measured=await page.evaluate(async source=>{
  const THREE=await import('./vendor/three.module.min.js');
  const{compileEffectiveCandidate}=await import('./rally-proposals.js');
  const{AthleteResources,createAthlete,updateAthlete}=await import('./three-d-athletes.js');
  const{sampleActorPresentation}=await import('./three-d-presentation.js');
  const runs=[];
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  const snapshot=actor=>{actor.updateMatrixWorld(true);const d=actor.userData;return{vertices:Array.from(d.bodyBatch.batch.geometry.attributes.position.array),paddle:d.paddleFaceWorld.toArray(),root:actor.position.toArray(),legs:Object.fromEntries(Object.entries(d.legs).map(([side,leg])=>{const end=(o,y)=>new THREE.Vector3(0,y,0).applyMatrix4(o.matrixWorld).toArray();return[side,{hip:end(leg.thigh,-.39/2),knee:end(leg.thigh,.39/2),shinTop:end(leg.shin,-.34/2),ankle:end(leg.shin,.34/2),sole:leg.foot.getWorldPosition(new THREE.Vector3()).toArray()}];}))};};
  for(let repetition=0;repetition<3;repetition++){
   const resources=new AthleteResources(),actors={left:createAthlete(resources,'team1','left'),right:createAthlete(resources,'team1','right')};
   let samples=0,maxThighError=0,maxShinError=0,maxKneeGap=0,maxAnkleGap=0,maxFreshVertexError=0,maxFreshEndpointError=0,maxRepeatedSamplerError=0;const failures=[],checks=[];
   try{for(const style of['auto','forehand','backhand']){
    const document=structuredClone(source);document.shots.find(s=>s.family==='overhead').contactStyle=style;
    const{timeline}=compileEffectiveCandidate(document),segment=timeline.segments.find(s=>s.step.shot?.authoring?.family==='overhead');
    for(const hand of['left','right']){
     const actor=actors[hand],dense=Array.from({length:Math.ceil(segment.duration*120)+1},(_,i)=>Math.min(segment.duration,i/120));
     const sequence=[...dense,segment.contactTime,...dense.slice().reverse()];
     for(let index=0;index<sequence.length;index++){
      const localTime=sequence[index],args={instructionalMovement:true,segment,timeline,playerId:segment.shotSemantics.playerId,localTime,handedness:hand};
      const sample=sampleActorPresentation(args),sampleRecord=JSON.parse(JSON.stringify({worldPosition:sample.worldPosition,footTargets:sample.footTargets}));
      updateAthlete(actor,sample); // Exactly one update; no repeated settling call or render.
      const s=snapshot(actor);samples++;
      for(const[side,l]of Object.entries(s.legs)){
       const thighError=Math.abs(distance(l.hip,l.knee)-.445),shinError=Math.abs(distance(l.shinTop,l.ankle)-.425),kneeGap=distance(l.knee,l.shinTop),ankleGap=distance(l.ankle,l.sole.map((v,i)=>v+(i===1?.095:0)));
       maxThighError=Math.max(maxThighError,thighError);maxShinError=Math.max(maxShinError,shinError);maxKneeGap=Math.max(maxKneeGap,kneeGap);maxAnkleGap=Math.max(maxAnkleGap,ankleGap);
       if(Math.max(thighError,shinError,kneeGap,ankleGap)>1e-7&&failures.length<12)failures.push({style,hand,index,localTime,side,thighError,shinError,kneeGap,ankleGap,sample:sampleRecord,leg:l});
      }
      if(repetition>0&&(index===0||index===dense.length||index===sequence.length-1)){
       const repeated=sampleActorPresentation(args),repeatRecord=JSON.parse(JSON.stringify({worldPosition:repeated.worldPosition,footTargets:repeated.footTargets}));
       const values=o=>Object.values(o).flatMap(v=>v&&typeof v==='object'?values(v):typeof v==='number'?[v]:[]);
       const a=values(sampleRecord),b=values(repeatRecord),samplerError=Math.max(0,...a.map((v,i)=>Math.abs(v-b[i])));maxRepeatedSamplerError=Math.max(maxRepeatedSamplerError,samplerError);
       const fresh=createAthlete(resources,'team1',hand);updateAthlete(fresh,sample);const f=snapshot(fresh);
       const vertexError=Math.max(0,...s.vertices.map((v,i)=>Math.abs(v-f.vertices[i])));let endpointError=0;
       for(const side of['left','right'])for(const part of['hip','knee','shinTop','ankle','sole'])endpointError=Math.max(endpointError,distance(s.legs[side][part],f.legs[side][part]));
       maxFreshVertexError=Math.max(maxFreshVertexError,vertexError);maxFreshEndpointError=Math.max(maxFreshEndpointError,endpointError);
       checks.push({style,hand,index,localTime,sample:sampleRecord,repeatedSample:repeatRecord,samplerError,freshVertexError:vertexError,freshEndpointError:endpointError,legs:s.legs});
      }
     }
    }
   }}finally{resources.dispose();}
   runs.push({repetition,mode:repetition===0?'strict-original-sampler-call-order':'instrumented-fresh-and-repeat-comparison',samples,maxThighError,maxShinError,maxKneeGap,maxAnkleGap,maxFreshVertexError,maxFreshEndpointError,maxRepeatedSamplerError,failures,checks});
  }
  return{userAgent:navigator.userAgent,runs};
 },source);
 results.push({engine:name,version:browser.version(),...measured,errors});
 }finally{await context.close();await browser.close();}
}
const after=runtimeFileset(),report={base,runtimeDigest:before.digest,runtimeDigestAfter:after.digest,runtimeUnchanged:before.digest===after.digest,servedFilesVerified:before.files.length,sourceFixture:'tests/fixtures/overhead-short-hop-document.json',protocol:'One strict repetition of original sampler/update call order, followed by two instrumented repetitions of actual test2 style/hand/dense120Hz/contact/reverse order; reused actors across styles. One updateAthlete call per sample. Selected samples compare to fresh rig and repeat pure sampler only after first geometry measured. No second settling update/render.',results};
await mkdir(out.slice(0,out.lastIndexOf('/')),{recursive:true});await writeFile(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({out,runtimeUnchanged:report.runtimeUnchanged,results:results.map(r=>({engine:r.engine,version:r.version,errors:r.errors,runs:r.runs.map(({checks,...x})=>x)}))}));
if(!report.runtimeUnchanged||results.some(r=>r.errors.length||r.runs.some(x=>x.failures.length||Math.max(x.maxFreshVertexError,x.maxFreshEndpointError,x.maxRepeatedSamplerError)>1e-7)))process.exitCode=1;
