// Exclusion theorem for generated interception routes ending at paddle contact.
// A full quadratic ease-in/out route has peak speed 2*distance/duration.
// Peak <=18 therefore permits endpoint travel <=9*duration. This is NOT a
// bound for intermediate samples of a route ending later, nor model 1 reach.
import { teamForPlayer } from './rally-state.js';
export const GENERATED_ROUTE_CERTIFICATE_VERSION = 'generated-contact-endpoint-route-v1';
const IDS=['player1','player2','player3','player4'];
const PARAMETERS=Object.freeze({peakFeetPerSecond:18,endpointFeetPerSecond:9,paddleReachFeet:3,reactionSeconds:0,samplesPerStage:512});
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const keys=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(k=>Object.hasOwn(value,k));
export function validGeneratedRouteCertificateShapeV1(c) {
  return keys(c,['version','applicability','parameters','leadInSeconds','throughSeconds','actors'])
    && c.version===GENERATED_ROUTE_CERTIFICATE_VERSION
    && c.applicability==='full-eased-route-ending-at-interception'
    && keys(c.parameters,Object.keys(PARAMETERS))&&Object.keys(PARAMETERS).every(k=>c.parameters[k]===PARAMETERS[k])
    && Number.isFinite(c.leadInSeconds)&&c.leadInSeconds>=0&&Number.isFinite(c.throughSeconds)&&c.throughSeconds>0
    && Array.isArray(c.actors)&&c.actors.length===2&&new Set(c.actors.map(a=>a.actor)).size===2
    && c.actors.every(a=>keys(a,['actor','origin','continuousLowerBoundFeet'])&&IDS.includes(a.actor)
      &&keys(a.origin,['x','y'])&&point(a.origin)&&Number.isFinite(a.continuousLowerBoundFeet)&&a.continuousLowerBoundFeet>1e-7);
}
export function certifyGeneratedRouteExclusionV1(play,segment,solved) {
  const end=solved?.secondBounceTime,lead=segment?.contactTime;
  if(play?.modelVersion!==2||segment?.modelVersion!==2||!Number.isFinite(end)||end<=0||!Number.isFinite(lead)||lead<0
    ||!Array.isArray(solved.stages)||!solved.stages.length||(segment.model2Momentum||[]).length)return null;
  const team=teamForPlayer(segment.shotSemantics?.playerId,play.players);
  const defenders=IDS.filter(id=>teamForPlayer(id,play.players)!==team);
  if(defenders.length!==2)return null;
  const actors=[];
  for(const actor of defenders){
    const origin=segment.previous?.positions?.[actor];
    if(!point(origin))return null;
    let lower=Infinity,covered=0;
    for(const stage of solved.stages){
      const start=Math.max(0,stage.startTime),stop=Math.min(end,stage.endTime);
      if(stop<=start)continue;
      if(start>covered+1e-7||![stage.vx,stage.vz].every(Number.isFinite))return null;
      const count=PARAMETERS.samplesPerStage,dt=(stop-start)/count;
      let minimum=Infinity;
      for(let i=0;i<=count;i++){
        const t=start+dt*i,ball=solved.sampleBoard(t);
        if(!point(ball))return null;
        minimum=Math.min(minimum,Math.hypot(ball.x-origin.x,ball.y-origin.y)-3-9*(lead+t));
      }
      // Distance to a fixed origin is |v|-Lipschitz; expanding endpoint
      // allowance is 9-Lipschitz. Nearest grid sample is <=dt/2 away.
      lower=Math.min(lower,minimum-(Math.hypot(stage.vx,stage.vz)+9)*dt/2);
      covered=stop;
    }
    if(covered<end-1e-7||!Number.isFinite(lower)||lower<=1e-7)return null;
    actors.push({actor,origin:{x:origin.x,y:origin.y},continuousLowerBoundFeet:lower});
  }
  return {version:GENERATED_ROUTE_CERTIFICATE_VERSION,applicability:'full-eased-route-ending-at-interception',parameters:{...PARAMETERS},leadInSeconds:lead,throughSeconds:end,actors};
}
export function matchesGeneratedRouteCertificateV1(declared,current) {
  if(!validGeneratedRouteCertificateShapeV1(declared)||!current)return false;
  const near=(a,b)=>Math.abs(a-b)<=1e-8;
  return near(declared.leadInSeconds,current.leadInSeconds)&&near(declared.throughSeconds,current.throughSeconds)
    &&declared.actors.every((a,i)=>a.actor===current.actors[i].actor&&near(a.origin.x,current.actors[i].origin.x)&&near(a.origin.y,current.actors[i].origin.y)&&near(a.continuousLowerBoundFeet,current.actors[i].continuousLowerBoundFeet));
}
