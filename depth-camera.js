import * as THREE from './vendor/three.module.min.js';
const radians=degrees=>degrees*Math.PI/180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/** A camera gesture never consumes a target or athlete gesture. Camera state is
 * independent of the play clock; orbiting does not seek or rewrite authored data. */
export class DepthCameraControls{
 constructor(viewer){
  this.viewer=viewer;this.surface=viewer.renderer.domElement;this.pointers=new Map();this.mode='orbit';
  this.state={azimuth:0,elevation:50,distance:this.defaultDistance(),target:{x:0,y:.3,z:0}};
  this.handlers={pointerdown:e=>this.down(e),pointermove:e=>this.move(e),pointerup:e=>this.up(e),pointercancel:()=>this.cancel(),lostpointercapture:e=>{if(this.pointers.has(e.pointerId))this.cancel();},wheel:e=>{e.preventDefault();this.zoomBy(Math.exp(e.deltaY*.001));},contextmenu:e=>e.preventDefault()};
  this.surface.style.touchAction='none';for(const[type,handler]of Object.entries(this.handlers))this.surface.addEventListener(type,handler,{passive:false});
  this.apply();window.dispatchEvent(new CustomEvent('pickleboard:camera-ready',{detail:this}));
 }
 getState(){return{...this.state,target:{...this.state.target},mode:this.mode,pointerCount:this.pointers.size};}
 setState(next={}){this.state={...this.state,...next,target:{...this.state.target,...next.target}};this.state.elevation=clamp(this.state.elevation,20,75);this.state.distance=clamp(this.state.distance,7,55);this.apply();return this.getState();}
 setMode(mode){if(!['orbit','pan'].includes(mode))throw new TypeError('Camera mode must be orbit or pan');this.mode=mode;return this.getState();}
 defaultDistance(){return this.surface.clientWidth<600?27:29;}
 reset(preset='overhead'){const azimuth=preset==='sideline'?Math.PI/2:preset==='behind-orange'?Math.PI:0;return this.setState({azimuth,elevation:preset==='overhead'?50:38,distance:this.defaultDistance(),target:{x:0,y:.3,z:0}});}
 zoomBy(factor){return this.setState({distance:this.state.distance*factor});}
 apply(){const v=this.viewer,c=v.camera,s=this.state,e=radians(s.elevation),horizontal=Math.cos(e)*s.distance;
  c.clearViewOffset();c.aspect=Math.max(1,this.surface.clientWidth)/Math.max(1,this.surface.clientHeight);c.fov=38;
  c.position.set(s.target.x+Math.sin(s.azimuth)*horizontal,s.target.y+Math.sin(e)*s.distance,s.target.z+Math.cos(s.azimuth)*horizontal);c.lookAt(s.target.x,s.target.y,s.target.z);c.updateProjectionMatrix();c.updateMatrixWorld(true);v.cameraTarget={...s.target};
  v.world?.updateCamera?.(c);if(v.currentPlay&&v.ballObject)v.applyAtTime(v.clock.elapsed);v.renderer.render(v.scene,c);window.playBuilder?.courtTools?.render();
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
