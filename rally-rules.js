// Scoped rule checks for facts represented by a Play. Strategy is never treated as a rule.
import { compilePlayTimeline } from './three-d-core.js';
import { COURT_DIMENSIONS, isInNonVolleyZone, isInServiceBox, serviceBoxForServer } from './court-geometry.js';
import { resolveServiceContext, serviceIdentityIssues, receivingServiceBox, teamForPlayer } from './rally-state.js';

const violation=(play,code,message,stepId=null,actor=null)=>Object.freeze({
    code,
    message,
    stepId,
    playId:play?.id??null,
    ...(actor?{actor}:{})
});

export function validateRallyRules(play,timeline=null){
    const violations=[];
    const warnings=[];
    let compiled=timeline;
    try{compiled=compiled||compilePlayTimeline(play);}catch(error){
        return Object.freeze({valid:false,violations:Object.freeze([violation(play,'invalid-play',error.message)])});
    }
    const shotSegments=compiled.segments.filter(segment=>segment.shotSemantics);
    const bounceCounts=new Map();
    for(const event of compiled.events)if(event.type==='bounce')bounceCounts.set(event.rallyLeg,(bounceCounts.get(event.rallyLeg)||0)+1);
    const bounceCount=segment=>segment?bounceCounts.get(segment.rallyLeg)||0:0;
    const service=resolveServiceContext(play);
    for(const issue of serviceIdentityIssues(play))violations.push(violation(play,issue.code,issue.message,issue.shotId,issue.actor));
    if(!play.rally?.openingBouncesSatisfied&&!service.known)warnings.push(violation(play,'service-context-unknown','Serve receiver identity is not declared; positions cannot establish service order.',shotSegments[0]?.step.id));
    for(const [shotIndex,segment] of shotSegments.entries()){
        const {step,shotSemantics,trajectory}=segment,shot=step.shot;
        const actor=shotSemantics.playerId,compiledBounces=bounceCount(segment);
        if(shot.flight?.bounces===undefined)violations.push(violation(play,'bounce-contract','Each shot must explicitly declare whether it bounces.',step.id,actor));
        else if(compiledBounces!==shot.flight.bounces||compiledBounces!==trajectory.bounces)violations.push(violation(play,'bounce-event-mismatch','Compiled bounce events must exactly match the rally leg bounce contract.',step.id,actor));
        const point=shotSemantics.contact.point;
        if(Math.hypot(point.x-shot.from.x,point.y-shot.from.y)>1e-9)violations.push(violation(play,'contact-origin-mismatch','Shot from and contact point must describe the same contact.',step.id,actor));
        const incoming=shotSegments[shotIndex-1];
        if(incoming){
            if(teamForPlayer(actor,play.players)===teamForPlayer(incoming.shotSemantics.playerId,play.players))violations.push(violation(play,'team-alternation','Successive rally contacts must alternate between teams.',step.id,actor));
            const incomingBounces=bounceCount(incoming),kind=shotSemantics.contact.kind;
            if(kind==='volley'&&incomingBounces!==0){
                violations.push(violation(play,'incoming-bounce-contact-kind','A volley contact must arrive without a ground bounce in the preceding rally leg.',step.id,actor));
            }else if(['groundstroke','short-hop'].includes(kind)&&incomingBounces!==1){
                violations.push(violation(play,'incoming-bounce-contact-kind','A groundstroke or short-hop contact must follow exactly one ground bounce in the preceding rally leg.',step.id,actor));
            }
        }
        if(shotIndex>0&&shotSemantics.contact.kind==='serve')violations.push(violation(play,'late-serve','A serve may only begin the rally.',step.id,actor));
        if(compiledBounces>1)violations.push(violation(play,'multiple-bounces','The ordinary standing game requires contact before a second bounce.',step.id,actor));
        if(shotSemantics.contact.kind==='volley'){
            if(shotSemantics.contact.feet.length!==2||shotSemantics.contact.momentumEntersNonVolleyZone===null){
                violations.push(violation(play,'volley-contact-metadata','A volley must declare both foot positions and momentum.',step.id,actor));
            }else{
                if(shotSemantics.contact.feet.some(isInNonVolleyZone))violations.push(violation(play,'non-volley-zone-foot','A player may not volley while a foot touches the non-volley zone or its line.',step.id,actor));
                if(shotSemantics.contact.momentumEntersNonVolleyZone)violations.push(violation(play,'non-volley-zone-momentum','Volley momentum may not carry the player into the non-volley zone.',step.id,actor));
                if(shot.contact?.feetEstablishedOutsideNVZ===false)violations.push(violation(play,'non-volley-zone-reset','After entering the non-volley zone, both feet must contact the playing surface entirely outside it before a volley.',step.id,actor));
            }
        }
        if(shotSemantics.contact.kind==='short-hop'){
            const contact=compiled.events.find(event=>event.type==='contact'&&event.rallyLeg===segment.rallyLeg);
            const priorBounce=[...compiled.events].reverse().find(event=>event.type==='bounce'&&event.rallyLeg===segment.rallyLeg-1);
            const delay=contact&&priorBounce?contact.time-priorBounce.time:Infinity;
            const unrepresentedIncoming=shotIndex===0&&play.rally?.openingBouncesSatisfied;
            if((!unrepresentedIncoming&&(!priorBounce||delay<0||delay>.35))||point.heightFeet>1.5)violations.push(Object.freeze({...violation(play,'short-hop-contact','The illustrative short-hop model requires a short-hop contact within 0.35 seconds of one bounce at a low contact height (no more than 1.5 feet).',step.id,actor),category:'model'}));
        }
    }
    if(!play.rally?.openingBouncesSatisfied){
        const serve=shotSegments[0],returned=shotSegments[1];
        if(!serve||serve.shotSemantics.contact.kind!=='serve')violations.push(violation(play,'opening-serve','A full-rally example must begin with a serve.',serve?.step.id,serve?.shotSemantics.playerId));
        else{
            const box=receivingServiceBox(service,serve.shotSemantics.contact.point),landing=serve.step.shot.to;
            const beyondKitchen=serve.shotSemantics.contact.point.y<COURT_DIMENSIONS.netY?
                landing.y>COURT_DIMENSIONS.farKitchenLineY:landing.y<COURT_DIMENSIONS.nearKitchenLineY;
            if(!isInServiceBox(landing,box)||!beyondKitchen)violations.push(violation(play,'serve-target','The serve must land diagonally in the service court beyond the non-volley-zone line.',serve.step.id,serve.shotSemantics.playerId));
            const feet=serve.shotSemantics.contact.feet;
            if(feet.length){
                const near=serve.shotSemantics.contact.point.y<COURT_DIMENSIONS.netY;
                const minX=box.minX===0?10:0,maxX=box.minX===0?20:10;
                if(feet.some(foot=>(near?foot.y>=0:foot.y<=44)||foot.x<minX||foot.x>maxX))violations.push(violation(play,'serve-foot-position','The server must keep grounded feet behind the baseline and within the correct serving-area extensions.',serve.step.id,serve.shotSemantics.playerId));
            }
        }
        if(bounceCount(serve)!==1)violations.push(violation(play,'serve-bounce','The served ball must bounce exactly once before the return.',serve?.step.id,serve?.shotSemantics.playerId));
        if(bounceCount(returned)!==1)violations.push(violation(play,'return-bounce','The returned ball must bounce exactly once before the serving team strikes it.',returned?.step.id,returned?.shotSemantics.playerId));
    }
    return Object.freeze({valid:violations.length===0,violations:Object.freeze(violations),warnings:Object.freeze(warnings)});
}

export const validatePlayRules=validateRallyRules;
