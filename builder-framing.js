import { worldToBoard, FEET_TO_METERS } from './three-d-core.js';

// Presentation-only bounds. Include the whole painted court, useful runoff,
// every authored player position, upright artwork and the complete ball flight.
// Park decorations deliberately do not set the scale of the editing surface.
export function builderViewBox(play, timeline, projection) {
    const points=[];
    const ground=(x,y)=>projection.courtToView({x,y});
    for(const x of [-2,22])for(const y of [-4,48])points.push(ground(x,y));
    for(const step of play.steps)for(const[id,p]of Object.entries(step.positions)) {
        if(id==='ball')continue;
        const anchor=ground(p.x,p.y);
        for(const dx of [-3.5,3.5])for(const dy of [-5.3,1])points.push({x:anchor.x+dx,y:anchor.y+dy});
    }
    for(const segment of timeline.segments) {
        for(const flight of [segment.servePreparation,segment.trajectory].filter(Boolean)) {
            for(let i=0;i<=48;i++) {
                const point=flight.sample(flight.totalDuration*i/48),board=worldToBoard(point),p=ground(board.x,board.y);
                points.push({x:p.x-.6,y:p.y-projection.projectHeight(point.y/FEET_TO_METERS)-.6},{x:p.x+.6,y:p.y+.6});
            }
        }
    }
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
    const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    return Object.freeze({x:minX-1,y:minY-1,width:maxX-minX+2,height:maxY-minY+2});
}
