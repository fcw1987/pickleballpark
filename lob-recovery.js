import { isInNonVolleyZone, isOnCourt } from './court-geometry.js';
import { resolveFlightParametersV1 } from './rally-targets.js';
import { model2ContactStance } from './play-planning-v2.js';
import { defaultFeetAtV1 } from './generated-foot-state.js';
import { eligibleHitters, contactRequiresBounce, resolveServiceContext } from './rally-state.js';
import { solveFlightV2, PHYSICS_V2 } from './play-physics-v2.js';
import { previewDocumentV2, compileDocumentV2 } from './play-compiler-v2.js';

import { PLANTED_OVERHEAD_FEET, lobVolleyInFront } from './play-actors-v2.js';

const runningPeak = 16, readTime = .16, settleTime = .12;
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const forward = team => team === 'green' ? 1 : -1;

function protectedEnd(source, segment, id) {
    // A previous pin remains in force until the actor receives a new command.
    let pinned=false;
    for (const shot of source.shots) {
        const cmd=shot.hitter===id ? shot.movement : shot.playerMovement?.[id];
        if (cmd) pinned=cmd.pinned;
    }
    const last=source.shots.at(-1).playerMovement?.[id];
    return pinned || last ? segment.step.positions[id] : null;
}

function contactWindows(flight, volleyAllowed) {
    const windows=[], {firstLandingTime:land,secondBounceTime:dead}=flight;
    // Intersect the descending branch at actual playable heights. Using
    // the physical parabola keeps flight, bounce and subsequent shot joined.
    if (volleyAllowed) {
        const s=flight.stages[0],g=PHYSICS_V2.gravityFeetPerSecond2;
        for (const height of [PLANTED_OVERHEAD_FEET,4.4,4.15]) {
            const discriminant=s.vy*s.vy+2*g*(flight.from.heightFeet-height);
            if (discriminant<=0) continue;
            const t=(s.vy+Math.sqrt(discriminant))/g;
            if(t>0 && t<land-.001) windows.push({volley:true,t,contact:flight.sampleBoard(t)});
        }
    }
    // Both sides of the rebound are live. A deep bounce may travel behind
    // the baseline. Its second bounce, not a boundary line, ends the return.
    for(let delay=.06;delay<Math.min(1.5,dead-land)-.01;delay+=.04) {
        const t=land+delay,contact=flight.sampleBoard(t);
        if(contact.heightFeet>=.9 && contact.heightFeet<=2.9) windows.push({volley:false,t,contact});
    }
    return windows;
}

function receiverOptions(source,segment,flight,ids,returnLane) {
    const options=[],lob=source.shots.at(-1);
    const volleyAllowed=!contactRequiresBounce(source.shots.length,source.opening);
    for(const {volley,t,contact} of contactWindows(flight,volleyAllowed)) for(const id of ids){
        const player=source.players[id],team=player.team,f=forward(team),origin=segment.previous.positions[id];
        if ((22-contact.y)*f<=0 || volley && !lobVolleyInFront({id,team,origin,contact})) continue;
        const hand=player.handedness==='right'?1:-1;
        const family=volley?'overhead':returnLane==='deep'?'drive':'drop';
        const x=returnLane==='line'?contact.x:20-contact.x;
        const depth=family==='drop'?28:37;
        const target={x:Math.max(4,Math.min(16,x)),y:team==='green'?depth:44-depth};
        const fixed=protectedEnd(source,segment,id);
        // A runner can set either side of a rebound. Running around a
        // reachable backhand can cost the remaining time before bounce two.
        const styles = fixed ? [(fixed.x-contact.x)*f*hand >= 0 ? 'forehand' : 'backhand']
            : volley ? ['forehand'] : ['forehand', 'backhand'];
        for (const style of styles) {
            const stance=fixed || model2ContactStance(contact,target,style,player.handedness);
            const front=(contact.y-stance.y)*f,side=(stance.x-contact.x)*f*hand;
            if(front<.14 || front>1.35 || Math.abs(side)>1.35 || volley && side<.15) continue;
            const feet=defaultFeetAtV1(stance,source.defaultFootState);
            if(volley && feet.some(isInNonVolleyZone)) continue;
            const travel=distance(origin,stance),turn=(stance.y-origin.y)*f<-2 ? .18 : 0;
            // The eased route peaks at twice its average speed. Budget for the
            // initial read, drop step when retreating and a balanced final plant.
            const budget=Math.max(0,t-readTime-turn-settleTime)*runningPeak/2;
            if(travel>budget+.01) continue;
            const timing=volley?{beforeBounceSeconds:flight.firstLandingTime-t}:{afterBounceSeconds:t-flight.firstLandingTime};
            const heightCost=volley?.55*Math.abs(contact.heightFeet-PLANTED_OVERHEAD_FEET):1.65*Math.abs(contact.heightFeet-2.25);
            // Prefer the familiar forehand on effectively equal routes. An
            // extra step around the ball readily outweighs this small margin.
            const score=travel+heightCost+(style==='backhand'?.15:0)+(lob.receiver!=='auto' && lob.receiver!==id?1.25:0);
            options.push({id,family,volley,timing,contact,feet:fixed?feet:null,target,style,score});
        }
    }
    return options.sort((a,b)=>Number(b.volley)-Number(a.volley)||a.score-b.score);
}

function terminalLob(source,segment,flight,ids) {
    const doc=structuredClone(source),lob=doc.shots.at(-1);
    const inPlay=isOnCourt(flight.landing)&&!flight.obstruction;
    if(inPlay){
        const id=ids.filter(id=>!protectedEnd(source,segment,id)).sort((a,b)=>
            distance(segment.previous.positions[a],flight.landing)-distance(segment.previous.positions[b],flight.landing))[0];
        if(id){
            const from=segment.previous.positions[id],span=distance(from,flight.landing);
            const travel=Math.max(0,flight.secondBounceTime-readTime-.18-settleTime)*runningPeak/2;
            const portion=span>0?Math.min(1,travel/span):0;
            const target={x:from.x+(flight.landing.x-from.x)*portion,y:from.y+(flight.landing.y-from.y)*portion};
            lob.playerMovement={...lob.playerMovement,[id]:{intent:'manual',pinned:false,target}};
        }
    }
    doc.ending='winner';
    const outcome=previewDocumentV2(doc).derivedOutcome;
    if(!outcome || outcome.shotId!==lob.id) return null;
    doc.outcome=outcome;
    doc.ending=outcome.winner===doc.players[lob.hitter].team?'winner':'fault';
    return compileDocumentV2(doc).validShotCount===doc.shots.length?doc:null;
}

// Normal Smart Add uses this for a physical lob at the end of an open rally.
// Only proposed documents change. Loading or sampling a saved play never
// invokes a tactical decision. Every proposal must pass full rule compilation.
export function resolveLobContinuation(source, nextId) {
    if(source.modelVersion!==2 || source.ending!=='stop' || source.shots.at(-1)?.family!=='lob') return null;
    const preview=previewDocumentV2(source),segment=preview.timeline.segments.at(-1);
    if (!segment || preview.validShotCount!==source.shots.length) return null;
    const lob=source.shots.at(-1),flight=solveFlightV2(segment.step.shot.physicsV2);
    const ids=eligibleHitters({players:source.players,service:resolveServiceContext(source),opening:source.opening,
        contactIndex:source.shots.length,previousHitter:lob.hitter});
    if(isOnCourt(flight.landing) && !flight.obstruction) {
        // Try the simple straight return first. A partner or the net can close
        // that lane while leaving a crosscourt drop or deeper drive available.
        for(const lane of ['line','crosscourt','deep']) for(const option of receiverOptions(source,segment,flight,ids,lane)){
            const {id,family,volley,timing,feet,target,style}=option;
            const reply={id:nextId,family,hitter:id,receiver:'auto',contactStyle:style,target,
                arc:family==='drop'?'high':'medium',pace:family==='drop'?'soft':'firm',movement:{intent:'hold',pinned:false},
                quality:'neutral',contactMode:volley?'volley':'bounced',contactTiming:timing,
                ...(feet?{contactEvidence:{feet,feetEstablishedOutsideNVZ:feet.every(p=>!isInNonVolleyZone(p))}}:{})};
            try {
                reply.physics=resolveFlightParametersV1({candidate:{...reply,intent:reply.family},contact:option.contact,target,
                    team:source.players[id].team,materialization:'first'}).physics;
            } catch(error) {
                if(error instanceof RangeError)continue;
                throw error;
            }
            reply.authoring={ownership:'automatic',fields:Object.keys(reply).filter(key=>key!=='id')};
            const candidate={...source,shots:[...source.shots,reply]};
            if(compileDocumentV2(candidate).validShotCount===candidate.shots.length) return candidate;
        }
    }
    return terminalLob(source,segment,flight,ids);
}
