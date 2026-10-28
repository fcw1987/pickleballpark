import * as THREE from './vendor/three.module.min.js';
import {boardToWorld} from './three-d-core.js';
import {sampleActorWorldPosition} from './three-d-presentation.js';
const radians=degrees=>degrees*Math.PI/180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/** A camera gesture never consumes a target or athlete gesture. Camera state is
 * independent of the play clock; orbiting does not seek or rewrite authored data. */
export class DepthCameraControls{
 constructor(viewer){
  this.viewer=viewer;this.surface=viewer.renderer.domElement;this.pointers=new Map();this.mode='orbit';this.autoFit=true;
  this.state={azimuth:0,elevation:50,distance:this.defaultDistance(),target:{x:0,y:.3,z:0}};
  this.handlers={pointerdown:e=>this.down(e),pointermove:e=>this.move(e),pointerup:e=>this.up(e),pointercancel:()=>this.cancel(),lostpointercapture:e=>{if(this.pointers.has(e.pointerId))this.cancel();},wheel:e=>{e.preventDefault();this.zoomBy(Math.exp(e.deltaY*.001));},contextmenu:e=>e.preventDefault()};
  this.surface.style.touchAction='none';for(const[type,handler]of Object.entries(this.handlers))this.surface.addEventListener(type,handler,{passive:false});
  this.apply();window.dispatchEvent(new CustomEvent('pickleboard:camera-ready',{detail:this}));
 }
 getState(){return{...this.state,target:{...this.state.target},mode:this.mode,pointerCount:this.pointers.size,autoFit:this.autoFit};}
 // Preserve a necessary narrow-screen preset fit; manual zoom-out cannot enlarge it.
 setState(next={}){const distanceLimit=Math.max(40,this.state.distance);this.autoFit=false;this.state={...this.state,...next,target:{...this.state.target,...next.target}};this.state.elevation=clamp(this.state.elevation,20,75);this.state.distance=clamp(this.state.distance,7,distanceLimit);this.apply();return this.getState();}
 setMode(mode){if(!['orbit','pan'].includes(mode))throw new TypeError('Camera mode must be orbit or pan');this.mode=mode;return this.getState();}
 defaultDistance(){return this.surface.clientWidth<600?27:29;}
 reset(preset='overhead'){const azimuth=preset==='sideline'?Math.PI/2:preset==='behind-green'?Math.PI:0;this.autoFit=true;this.state={azimuth,elevation:preset==='overhead'?50:38,distance:this.defaultDistance(),target:{x:0,y:.3,z:0}};this.apply();return this.getState();}
 zoomBy(factor){return this.setState({distance:this.state.distance*factor});}
 envelope(){
  const v=this.viewer;if(this.envelopePlay===v.currentPlay&&this.envelopeTimeline===v.timeline)return this.envelopePoints;
  const points=[],expand=p=>{for(const x of[-.7,.7])for(const y of[0,2])for(const z of[-.7,.7])points.push(new THREE.Vector3(p.x+x,y,p.z+z));};
  for(const x of[-3.048,3.048])for(const z of[-6.7056,6.7056])points.push(new THREE.Vector3(x,0,z));
  for(const step of v.currentPlay?.steps||[])for(const[id,p]of Object.entries(step.positions))if(id!=='ball')expand(boardToWorld(p));
  for(const segment of v.timeline?.segments||[]){
   if(segment.trajectory)for(let i=0;i<=24;i++){const p=segment.trajectory.sample(segment.trajectory.totalDuration*i/24);points.push(new THREE.Vector3(p.x,p.y+.05,p.z));}
   for(const[id,actor]of v.playerObjects)for(const time of[0,segment.contactTime||0,segment.duration])expand(sampleActorWorldPosition(segment,id,time,actor.userData.handedness,true));
  }
  this.envelopePlay=v.currentPlay;this.envelopeTimeline=v.timeline;return this.envelopePoints=points;
 }
 apply(){const v=this.viewer,c=v.camera,s=this.state,e=radians(s.elevation),width=Math.max(1,this.surface.clientWidth),height=Math.max(1,this.surface.clientHeight),surfaceRect=this.surface.getBoundingClientRect();
  let reserved=0;
  for(const element of [v.elements.root.querySelector('.three-d-hud'),document.querySelector('.builder-reference-dock')])if(element&&element.getClientRects().length){const r=element.getBoundingClientRect();if(r.bottom>surfaceRect.top&&r.top<surfaceRect.bottom&&r.right>surfaceRect.left&&r.left<surfaceRect.right)reserved=Math.max(reserved,surfaceRect.bottom-r.top+16);}
  reserved=clamp(reserved,0,height*.8);
  c.clearViewOffset();c.aspect=width/height;c.fov=38;
  if(this.autoFit){
   const outward=new THREE.Vector3(Math.sin(s.azimuth)*Math.cos(e),Math.sin(e),Math.cos(s.azimuth)*Math.cos(e)),right=new THREE.Vector3(Math.cos(s.azimuth),0,-Math.sin(s.azimuth)),up=new THREE.Vector3(-Math.sin(s.azimuth)*Math.sin(e),Math.cos(e),-Math.cos(s.azimuth)*Math.sin(e)),target=new THREE.Vector3(s.target.x,s.target.y,s.target.z),tanY=Math.tan(radians(c.fov)/2),tanX=tanY*c.aspect;
   let distance=this.defaultDistance();
   for(const point of this.envelope()){const delta=point.clone().sub(target),depth=delta.dot(outward);distance=Math.max(distance,depth+Math.abs(delta.dot(right))/(tanX*.94),depth+Math.abs(delta.dot(up))/(tanY*(1-reserved/height)*.94));}
   s.distance=clamp(distance,7,55);
  }
  const horizontal=Math.cos(e)*s.distance;
  c.position.set(s.target.x+Math.sin(s.azimuth)*horizontal,s.target.y+Math.sin(e)*s.distance,s.target.z+Math.cos(s.azimuth)*horizontal);c.lookAt(s.target.x,s.target.y,s.target.z);
  if(reserved)c.setViewOffset(width,height,0,reserved/2,width,height);
  c.updateProjectionMatrix();c.updateMatrixWorld(true);v.cameraTarget={...s.target};
  v.cameraFraming={aspect:c.aspect,usableAspect:width/Math.max(1,height-reserved),reservedPixels:reserved,distanceScale:s.distance/this.defaultDistance(),position:c.position.toArray(),target:[s.target.x,s.target.y,s.target.z],fov:c.fov,autoFit:this.autoFit};
  v.world?.updateCamera?.(c);if(v.currentPlay&&v.ballObject)v.applyAtTime(v.clock.elapsed);if(v.active)v.startRenderLoop();window.playBuilder?.courtTools?.render();
 }

 actorHit(event){const v=this.viewer,r=this.surface.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2),v.camera);
  const hits=ray.intersectObjects([...v.playerObjects.values()],true);return hits.find(hit=>hit.object.visible&&hit.object.material?.visible!==false)?.object||null;
 }
 shouldYield(event){const b=window.playBuilder,t=b?.courtTools;if(t?.placing||t?.drag)return true;
  if(b?.view==='3d'&&!b.session.playing&&b.selectedShot){const p=t?.project(b.selectedShot.target);if(p&&Math.hypot(event.clientX-p.x,event.clientY-p.y)<28)return true;}
  return Boolean(b?.workspace==='builder'&&b?.view==='3d'&&!b.session.playing&&b.selectedShot&&this.actorHit(event));
 }
 down(event){if(event.button>2||(!this.pointers.size&&this.shouldYield(event)))return;
  if(event.pointerType!=='touch'&&this.pointers.size)return;
  event.preventDefault();this.surface.setPointerCapture(event.pointerId);this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,pan:this.mode==='pan'||event.shiftKey||event.button===2});
  this.previousGesture=this.gesture();
 }
 gesture(){const a=[...this.pointers.values()];return a.length>1?{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),pan:true}:{...a[0],distance:0};}
 move(event){const p=this.pointers.get(event.pointerId);if(!p)return;event.preventDefault();p.x=event.clientX;p.y=event.clientY;const g=this.gesture(),old=this.previousGesture,dx=g.x-old.x,dy=g.y-old.y;
  if(g.pan){const s=this.state,k=s.distance*.0014,a=s.azimuth;this.setState({target:{x:s.target.x-dx*k*Math.cos(a)-dy*k*Math.sin(a),z:s.target.z+dx*k*Math.sin(a)-dy*k*Math.cos(a)}});if(old.distance&&g.distance)this.zoomBy(old.distance/g.distance);}
  else this.setState({azimuth:this.state.azimuth-dx*.008,elevation:this.state.elevation+dy*.13});this.previousGesture=g;
 }
 up(event){if(!this.pointers.has(event.pointerId))return;this.pointers.delete(event.pointerId);if(this.surface.hasPointerCapture(event.pointerId))this.surface.releasePointerCapture(event.pointerId);this.previousGesture=this.pointers.size?this.gesture():null;}
 cancel(){const ids=[...this.pointers.keys()];this.pointers.clear();for(const id of ids)if(this.surface.hasPointerCapture(id))this.surface.releasePointerCapture(id);this.previousGesture=null;}
 dispose(){this.cancel();for(const[type,handler]of Object.entries(this.handlers))this.surface.removeEventListener(type,handler);}
}
