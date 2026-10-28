import { drawPixelEnvironment } from './pixel-environment.js';
import { drawPlayerCoverage } from './player-coverage-canvas.js';
import { drawPixelAthlete } from './pixel-athletes.js';
import { COURT_LINES } from './court-geometry.js';
import { worldToBoard, FEET_TO_METERS } from './three-d-core.js';

// One logical pixel is a quarter foot. The SVG remains the accessible,
// canonical-coordinate input surface; its screen CTM also fits this canvas.
export class PixelCourtRenderer {
    constructor(board) {
        this.board = board;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'pixel-court-canvas';
        this.canvas.setAttribute('aria-hidden', 'true');
        this.canvas.dataset.renderer = 'canvas2d';
        board.court.before(this.canvas);
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.previous = new Map();
        this.frame = 0;
        board.court.closest('.park-stage').classList.add('pixel-park-stage');
        const style = document.createElement('style');
        style.textContent = `.pixel-court-canvas{position:absolute;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges;z-index:0}.pixel-park-stage #court{position:relative;z-index:1;background:transparent!important}.pixel-park-stage [data-park-ground],.pixel-park-stage [data-park-scene],.pixel-park-stage #parkEnvironment,.pixel-park-stage .park-environment,.pixel-park-stage #courtCastShadow,.pixel-park-stage #courtSlabEdge,.pixel-park-stage .outside-area,.pixel-park-stage .court-surface,.pixel-park-stage .kitchen,.pixel-park-stage #courtMarkings,.pixel-park-stage #netActor,.pixel-park-stage .actor-shadow,.pixel-park-stage .ball-shadow,.pixel-park-stage .player-artwork,.pixel-park-stage .guided-pixel-actor,.pixel-park-stage .ball-token{opacity:0!important}`;
        document.head.append(style);
        this.style = style;
        this.tick = time => { this.render(time); this.frame = requestAnimationFrame(this.tick); };
        this.frame = requestAnimationFrame(this.tick);
    }
    render(time = 0) {
        if(document.body.classList.contains('three-d-active'))return;
        const { board, canvas, ctx } = this;
        const svg = board.court;
        const sourceBox = svg.viewBox.baseVal;
        const matrix = svg.getScreenCTM();
        if (!sourceBox.width || !sourceBox.height || !matrix) return;
        const stageRect = canvas.parentElement.getBoundingClientRect();
        // Expand the logical world into letterboxed stage space, preserving the
        // SVG's uniform screen scale and every canonical pointer coordinate.
        const left = Math.floor(((stageRect.left-matrix.e)/matrix.a)*4)/4;
        const top = Math.floor(((stageRect.top-matrix.f)/matrix.d)*4)/4;
        const box = {x:left,y:top,width:Math.ceil(stageRect.width/matrix.a*4)/4,height:Math.ceil(stageRect.height/matrix.d*4)/4};
        const width = Math.max(1, Math.round(box.width * 4));
        const height = Math.max(1, Math.round(box.height * 4));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const origin = new DOMPoint(box.x, box.y).matrixTransform(matrix);
        Object.assign(canvas.style, { left: `${origin.x-stageRect.left}px`, top: `${origin.y-stageRect.top}px`, width: `${box.width*matrix.a}px`, height: `${box.height*matrix.d}px` });
        ctx.imageSmoothingEnabled = false;
        const point = (x,y) => ({x:(x-box.x)*4,y:(y-box.y)*4});
        const court = {...point(0,0),width:80,height:176};
        drawPixelEnvironment(ctx, {width,height,court,theme:document.documentElement.dataset.theme,time});
        ctx.fillStyle='#4a9b69'; ctx.fillRect(court.x-8,court.y-8,96,192);
        ctx.fillStyle='#347fa4'; ctx.fillRect(court.x,court.y,80,176);
        ctx.fillStyle='#438eae'; ctx.fillRect(court.x,court.y+60,80,56);
        drawPlayerCoverage(ctx, board, point);
        ctx.fillStyle='#f6f2d7';
        for (const line of COURT_LINES) {
            const a=point(line.from.x,line.from.y),b=point(line.to.x,line.to.y);
            ctx.fillRect(Math.round(Math.min(a.x,b.x)),Math.round(Math.min(a.y,b.y)),Math.max(1,Math.round(Math.abs(b.x-a.x))),Math.max(1,Math.round(Math.abs(b.y-a.y))));
        }
        const actors=[];
        this.diagnostics = { renderer: 'Canvas2D', density: 4, court: {...court}, viewBox: {x:box.x,y:box.y,width:box.width,height:box.height}, actors: {} };
        for(const token of Object.values(board.tokens)) {
            if(token.type!=='player'||token.element.style.display==='none'||token.element.classList.contains('hidden')||token.element.getAttribute('display')==='none')continue;
            const group=document.getElementById(`${token.id}-actor`);
            if(group?.style.display==='none')continue;
            actors.push({depth:token.y,draw:()=>{
                const p=point(token.x,token.y),sample=board.pixelSamples?.[token.id]||{};
                const old=this.previous.get(token.id),changed=old?Math.hypot(token.x-old.x,token.y-old.y)>.005:false;
                const movedAt=changed?time:old?.movedAt||0;
                const guidedSample=Object.hasOwn(board.pixelSamples||{},token.id);
                const move=guidedSample?sample.travelSpeed>.02||sample.action==='shuffle'||sample.phase==='locomotion':time-movedAt<100;
                const animationTime=guidedSample?(sample.timeSeconds??board.plays?.session?.clock.elapsed??0):time/1000;
                this.previous.set(token.id,{x:token.x,y:token.y,movedAt});
                let contact;
                const target=sample.paddle?.worldContactTarget;
                if(target&&sample.contactWeight>0){const ground=worldToBoard(target);contact=point(ground.x,ground.y-board.projection.projectHeight(target.y/FEET_TO_METERS));}
                const supportBoard=sample.pixelSupportPosition?worldToBoard(sample.pixelSupportPosition):null;
                const support=supportBoard?point(supportBoard.x,supportBoard.y):null;
                let phase=3;
                if(sample.profile&&sample.strokeTime!=null){
                    const {duration,contactRatio,recoverRatio}=sample.profile;
                    const u=Math.max(0,Math.min(1,sample.strokeTime/duration));
                    phase=u<=contactRatio?u/contactRatio:u<=recoverRatio?1+(u-contactRatio)/(recoverRatio-contactRatio):2+(u-recoverRatio)/(1-recoverRatio);
                }
                const result=drawPixelAthlete(ctx,{x:p.x,y:p.y,scale:1,playerId:token.id,kit:board.getPlayerTeamColor(token),facing:sample.viewDirection||(token.y<22?'front':'back'),handedness:token.handedness,shot:{type:['ready','shuffle'].includes(sample.action)||!sample.action?'ready':sample.instructionalFamily||sample.pixelStroke||sample.shotType||sample.action,contact:{strokeSide:sample.strokeSide,kind:sample.pixelContactKind}},phase,contact,contactWeight:sample.contactWeight||0,support,supportWeight:sample.contactWeight||0,move,time:animationTime});
                this.diagnostics.actors[token.id] = {ground:p,target:contact,contactWeight:sample.contactWeight||0,paddle:result.contact,rasterPaddle:result.rasterContact||{x:Math.round(result.sole.x)+Math.round(result.paddle.x),y:Math.round(result.sole.y)+Math.round(result.paddle.y)},renderedFamily:result.family,sole:result.sole,canonicalSole:result.canonicalSole,phase:sample.phase,action:sample.action,contactBounded:result.contactBounded,contactCorrection:result.contactCorrection,torsoOffset:result.torsoOffset,reach:result.reach,shoulder:result.shoulder,wrist:result.wrist,elbow:result.elbow,feet:result.feet,facing:sample.viewDirection,strokeSide:sample.strokeSide,shotType:sample.shotType,pixelStroke:sample.pixelStroke};
            }});
        }
        actors.push({depth:22,draw:()=>this.drawNet(ctx,court)});
        actors.sort((a,b)=>a.depth-b.depth).forEach(actor=>actor.draw());
        const ball=board.tokens.ball,p=point(ball.x,ball.y),lift=board.projection.projectHeight(board.playBallHeight||0)*4;
        ctx.fillStyle='#275d5b';ctx.fillRect(Math.round(p.x)-2,Math.round(p.y),5,2);
        ctx.fillStyle='#ac8c27';ctx.fillRect(Math.round(p.x)-2,Math.round(p.y-lift)-2,5,5);
        ctx.fillStyle='#ffe65c';ctx.fillRect(Math.round(p.x)-2,Math.round(p.y-lift)-2,4,4);
        ctx.fillStyle='#fff7b0';ctx.fillRect(Math.round(p.x)-1,Math.round(p.y-lift)-2,2,1);
        this.diagnostics.ball = {ground:p,display:{x:p.x,y:p.y-lift},rasterCenter:{x:Math.round(p.x),y:Math.round(p.y-lift)},height:board.playBallHeight||0};
        canvas.dataset.court = `${court.x},${court.y},80,176`;
    }
    drawNet(ctx,court) {
        const x=Math.round(court.x)-3,y=Math.round(court.y)+88;
        ctx.fillStyle='#244454';ctx.fillRect(x,y-7,86,8);
        ctx.fillStyle='#72a5b7';for(let i=2;i<84;i+=3)for(let j=1;j<7;j+=3)ctx.fillRect(x+i,y-7+j,1,1);
        ctx.fillStyle='#f9efd5';ctx.fillRect(x,y-8,86,2);
        ctx.fillStyle='#243e48';ctx.fillRect(x-1,y-10,3,12);ctx.fillRect(x+84,y-10,3,12);
        ctx.fillStyle='#cdded7';ctx.fillRect(x-1,y-10,2,10);ctx.fillRect(x+84,y-10,2,10);
    }
    getDiagnostics(){return this.diagnostics;}
    dispose(){cancelAnimationFrame(this.frame);this.canvas.remove();this.style.remove();}
}
