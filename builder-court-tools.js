import { boardToWorld, worldToBoard } from './three-d-core.js';
const NS='http://www.w3.org/2000/svg';
const element=(tag,attrs={})=>{const node=document.createElementNS(NS,tag);for(const[key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
export class BuilderCourtTools {
    constructor(builder){
        this.builder=builder;this.placing=false;this.placement=null;this.drag=null;this.THREE=null;this.surface=null;
        this.layer=element('svg',{'aria-hidden':'true',class:'builder-court-tools'});
        this.layer.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:4500';
        document.body.append(this.layer);
        this.handlers={pointerdown:e=>this.down(e),pointermove:e=>this.move(e),pointerup:e=>this.up(e),pointercancel:e=>this.cancel(e),lostpointercapture:e=>this.lostCapture(e)};
        this.secondPointer=event=>{
            const differentDragPointer=this.drag&&event.pointerId!==this.drag.pointer;
            const nonPrimaryContact=(this.drag||this.placing)&&['touch','pen'].includes(event.pointerType)&&event.isPrimary===false;
            if(!differentDragPointer&&!nonPrimaryContact)return;
            this.abort('Target placement cancelled because another touch was detected.');
            event.stopPropagation();
        };
        document.addEventListener('pointerdown',this.secondPointer,true);
        this.resize=()=>{if(this.drag||this.placing)this.abort('Target placement cancelled after the court resized.');else this.render();};window.addEventListener('resize',this.resize);
    }
    async bind(){
        const view=this.builder.board.threeD,surface=this.builder.view==='3d'?view.renderer?.domElement:this.builder.board.court;
        if(surface!==this.surface){if(this.surface){if(this.drag||this.placing)this.abort('Target placement cancelled when the court view changed.',false);for(const[type,handler]of Object.entries(this.handlers))this.surface.removeEventListener(type,handler);}this.surface=surface;if(surface)for(const[type,handler]of Object.entries(this.handlers))surface.addEventListener(type,handler);}
        if(this.builder.view==='3d'&&!this.THREE){this.THREE=await import('./vendor/three.module.min.js');this.render();}
    }
    beginPlacement({field='target',player=null}={}){
        const shot=this.builder.selectedShot;if(!shot)return false;
        const playerField=/^playerMovement\.(player[1-4])\.target$/.exec(field);
        if(!['target','movement.target'].includes(field)&&!playerField)throw new TypeError('Unsupported court placement field.');
        if(playerField)player=playerField[1];
        if(player!==null&&!/^player[1-4]$/.test(player))throw new TypeError('Unknown movement player.');
        let start=field==='target'?shot.target:field==='movement.target'?shot.movement?.target:shot.playerMovement?.[player]?.target;
        if(!start&&player)start=this.builder.document.initialLayout?.[player];
        if(!start||!Number.isFinite(start.x)||!Number.isFinite(start.y))throw new TypeError('Court placement requires a finite starting position.');
        this.builder.pause();this.clear();this.placement={field,player,shotId:shot.id,start:{x:start.x,y:start.y}};this.placing=true;this.render();return true;
    }
    project(position,height=0){
        const viewer=this.builder.board.threeD;
        if(this.builder.view==='3d'){
            if(!this.THREE||!viewer.camera||!viewer.renderer)return null;
            const point=boardToWorld(position,height),v=new this.THREE.Vector3(point.x,point.y,point.z).project(viewer.camera),box=viewer.renderer.domElement.getBoundingClientRect();
            if(v.z>1)return null;return{x:box.left+(v.x+1)*box.width/2,y:box.top+(1-v.y)*box.height/2};
        }
        const p=this.builder.board.projection.courtToView(position),m=this.builder.board.court.getScreenCTM();if(!m)return null;
        const q=new DOMPoint(p.x,p.y-this.builder.board.projection.projectHeight(height)).matrixTransform(m);return{x:q.x,y:q.y};
    }
    unproject(event){
        if(this.builder.view==='3d'){
            const viewer=this.builder.board.threeD;if(!this.THREE||!viewer.camera)return null;
            const box=this.surface.getBoundingClientRect(),ray=new this.THREE.Raycaster();ray.setFromCamera(new this.THREE.Vector2((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2),viewer.camera);
            const hit=ray.ray.intersectPlane(new this.THREE.Plane(new this.THREE.Vector3(0,1,0),0),new this.THREE.Vector3());return hit?worldToBoard(hit):null;
        }
        const m=this.builder.board.court.getScreenCTM();if(!m)return null;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(m.inverse());return this.builder.board.projection.viewToCourt(p);
    }
    down(event){
        if(this.builder.workspace!=='builder'||event.button>0||this.builder.busy)return;
        if((this.drag&&event.pointerId!==this.drag.pointer)||((this.drag||this.placing)&&['touch','pen'].includes(event.pointerType)&&event.isPrimary===false)){this.abort('Target placement cancelled because another touch was detected.');return;}
        // Hidden targets must never capture an ordinary playback gesture.
        if(this.builder.session.playing&&!this.placing)return;
        const shot=this.builder.selectedShot;if(!shot)return;const source=this.placement?.start||shot.target,target=this.project(source);
        const near=target&&Math.hypot(event.clientX-target.x,event.clientY-target.y)<25;
        if(!this.placing&&!near)return;
        const point=this.unproject(event);if(!point)return;
        this.builder.pause();event.preventDefault();event.stopPropagation();this.surface.setPointerCapture(event.pointerId);
        this.drag={shotId:this.placement?.shotId || shot.id,pointer:event.pointerId,pointerType:event.pointerType,field:this.placement?.field||'target',player:this.placement?.player||null,offset:near&&!this.placing?{x:point.x-source.x,y:point.y-source.y}:{x:0,y:0},target:{...source}};
        this.move(event);
    }
    move(event){if(!this.drag||event.pointerId!==this.drag.pointer)return;const p=this.unproject(event);if(!p)return;const margin=this.drag.player?8:0;this.drag.target={x:Math.max(-margin,Math.min(20+margin,p.x-this.drag.offset.x)),y:Math.max(-margin,Math.min(44+margin,p.y-this.drag.offset.y))};this.render();}
    up(event){if(!this.drag||event.pointerId!==this.drag.pointer)return;this.move(event);const {target,field,player,shotId}=this.drag;this.drag=null;this.placing=false;this.placement=null;if(this.surface.hasPointerCapture(event.pointerId))this.surface.releasePointerCapture(event.pointerId);if(player)this.builder.action('editMovement',{player,field:'target',value:target,shotId});else this.builder.action('editShot',{field,value:target,shotId});}
    cancel(event){if(this.drag&&event.pointerId===this.drag.pointer)this.abort('Target placement cancelled.');}
    lostCapture(event){if(this.drag&&event.pointerId===this.drag.pointer)this.abort('Target placement cancelled because pointer contact was lost.');}
    abort(message,rerender=true){this.clear();this.builder.message=message;if(rerender)this.builder.render();}
    clear(){const drag=this.drag;this.drag=null;this.placing=false;this.placement=null;if(drag&&this.surface?.hasPointerCapture(drag.pointer))this.surface.releasePointerCapture(drag.pointer);this.layer.replaceChildren();}
    render(){
        const b=this.builder;if(b.workspace!=='builder'){this.clear();return;}this.bind();
                this.layer.replaceChildren();const shot=b.selectedShot;if(!shot)return;
        const point=this.project(this.drag?.target || this.placement?.start || shot.target);
        if(point&&!b.session.playing){const group=element('g');group.append(element('circle',{cx:point.x,cy:point.y,r:13,fill:'none',stroke:'#fff6db','stroke-width':5}),element('circle',{cx:point.x,cy:point.y,r:13,fill:'none',stroke:'#6f365f','stroke-width':3}),element('path',{d:`M${point.x-20} ${point.y}h40 M${point.x} ${point.y-20}v40`,stroke:'#6f365f','stroke-width':2}));const label=element('text',{x:point.x+17,y:point.y-17,fill:'#203449',stroke:'#fff6db','stroke-width':3,'paint-order':'stroke','font-size':13,'font-family':'system-ui','font-weight':700});label.textContent=this.placement?.player?`${Number(this.placement.player.at(-1))<=2?'Green':'Orange'} ${['player1','player3'].includes(this.placement.player)?1:2} pin`:'Target';group.append(label);this.layer.append(group);}
        for(const annotation of b.document.annotations){
            if(annotation.type!=='path'||typeof annotation.d!=='string')continue;
            const pairs=[...annotation.d.matchAll(/[ML]\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi)].slice(0,2000);
            const points=pairs.map(match=>this.project({x:Number(match[1]),y:Number(match[2])})).filter(Boolean);
            if(points.length)this.layer.append(element('path',{d:points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '),fill:'none',stroke:'#bf6843','stroke-width':3,opacity:.8}));
        }
        if(!b.document.assistance.showGuides)return;
        const segment=b.compiled.timeline.segments.find(s=>b.session.clock.elapsed<=s.endTime);
        const activeId=b.session.playing?segment?.step.id:shot.id;
        const coverage=b.compiled.coverage?.find(c=>c.shotId===activeId);if(!coverage)return;
        const origin=this.project(coverage.threat);if(!origin)return;
        const positions=Object.values(coverage.positions || {});for(const position of positions){const p=this.project(position);if(!p)continue;this.layer.append(element('path',{d:`M${origin.x} ${origin.y}L${p.x} ${p.y}`,stroke:'#526d86','stroke-width':2,'stroke-dasharray':'5 5',opacity:.65}),element('circle',{cx:p.x,cy:p.y,r:17,fill:'none',stroke:'#526d86','stroke-width':2,'stroke-dasharray':'3 3'}));}
        const label=element('text',{x:Math.max(16,b.ui.element.querySelector('.builder-court-region').getBoundingClientRect().x+16),y:b.ui.element.querySelector('.builder-court-region').getBoundingClientRect().y+25,fill:'#203449',stroke:'#fff6db','stroke-width':3,'paint-order':'stroke','font-size':13,'font-family':'system-ui'});label.textContent='Suggested Coverage · instructional approximation';this.layer.append(label);
    }
    destroy(){this.clear();if(this.surface)for(const[type,handler]of Object.entries(this.handlers))this.surface.removeEventListener(type,handler);document.removeEventListener('pointerdown',this.secondPointer,true);window.removeEventListener('resize',this.resize);this.layer.remove();}
}
