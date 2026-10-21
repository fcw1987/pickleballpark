import {readFileSync} from 'node:fs';
const root='/Users/fdub/Documents/Codex/2026-10-17/task-5/pickleboard-strokes/';
const THREE=await import(root+'vendor/three.module.min.js');
const {evaluateCandidate,compileEffectiveCandidate}=await import(root+'rally-proposals.js');
const {AthleteResources,createAthlete,updateAthlete}=await import(root+'three-d-athletes.js');
const {sampleActorPresentation,sampleActorWorldPosition}=await import(root+'three-d-presentation.js');
const source=JSON.parse(readFileSync(root+'tests/fixtures/overhead-short-hop-document.json','utf8'));
const resources=new AthleteResources(),actors={left:createAthlete(resources,'team1','left'),right:createAthlete(resources,'team1','right')};
let calls=0,failed=0;
for(const style of ['auto','forehand','backhand']){
 const doc=structuredClone(source);doc.shots.find(s=>s.family==='overhead').contactStyle=style;evaluateCandidate(doc);
 const {timeline}=compileEffectiveCandidate(doc),segment=timeline.segments.find(s=>s.step.shot?.authoring?.family==='overhead');
 for(const hand of ['left','right']){
  const actor=actors[hand],dense=Array.from({length:Math.ceil(segment.duration*120)+1},(_,i)=>Math.min(segment.duration,i/120));
  for(const localTime of [...dense,segment.contactTime,...dense.slice().reverse()]){
   const q=sampleActorPresentation({instructionalMovement:true,segment,timeline,playerId:segment.shotSemantics.playerId,localTime,handedness:hand});
   updateAthlete(actor,q);actor.updateMatrixWorld(true);calls++;
   for(const [side,leg] of Object.entries(actor.userData.legs)){
    const end=(object,y)=>new THREE.Vector3(0,y,0).applyMatrix4(object.matrixWorld);
    const hip=end(leg.thigh,-.39/2),knee=end(leg.thigh,.39/2),shinTop=end(leg.shin,-.34/2),ankle=end(leg.shin,.34/2);
    const shin=shinTop.distanceTo(ankle);
    if(Math.abs(shin-.425)>1e-7){
      console.log(JSON.stringify({calls,style,hand,localTime,side,shin,root:actor.position,world:q.worldPosition,feet:q.footTargets,travel:q.travelDistance,dir:q.travelDirection,contactTime:segment.contactTime,from:segment.previous.positions[segment.shotSemantics.playerId],to:segment.step.positions[segment.shotSemantics.playerId],secondPosition:sampleActorWorldPosition(segment,segment.shotSemantics.playerId,localTime,hand,true)},null,2));failed++;
      if(failed>=2)process.exit(1);
    }
   }
  }
 }
}
resources.dispose();console.log({calls,failed});
