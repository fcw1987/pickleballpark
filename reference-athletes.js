import * as THREE from './vendor/three.module.min.js';
import {computePixelStroke} from './pixel-strokes.js';
const SOURCE=new URL('./assets/reference-athletes/athletes-armless-v2.png',import.meta.url).href;
export async function loadReferenceAthleteAssets({signal}={}){
 const image=new Image();image.src=SOURCE;await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Unable to load reference athlete artwork'));if(image.complete&&image.naturalWidth)resolve();signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
 const response=await fetch(new URL('./assets/reference-athletes/metadata-v2.json',import.meta.url),{signal});if(!response.ok)throw new Error('Missing athlete atlas metadata');return {image,source:SOURCE,metadata:await response.json()};
}
export class ReferenceAthleteResources{
 constructor(assets){this.assets=assets;this.textures=new Map();this.materials=new Set();this.geometries=new Set();}
 texture(player,direction){const key=`${player}/${direction}`;if(!this.textures.has(key)){const image=this.assets.image,texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;const [x,y,w,h]=this.assets.metadata.frames[player][direction].rect;texture.repeat.set(w/image.width,h/image.height);texture.offset.set(x/image.width,1-(y+h)/image.height);texture.needsUpdate=true;this.textures.set(key,texture);}return this.textures.get(key);}
 dispose(){for(const t of this.textures.values())t.dispose();for(const m of this.materials)m.dispose();for(const g of this.geometries)g.dispose();}
}
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function material(r,color){const m=new THREE.MeshBasicMaterial({color,toneMapped:false});r.materials.add(m);return m;}
function mesh(r,g,m){r.geometries.add(g);return new THREE.Mesh(g,m);}
function arm(r,skin){const group=new THREE.Group(),parts=[];for(let i=0;i<2;i++){const outer=mesh(r,new THREE.CylinderGeometry(.058,.054,1,10),material(r,'#2b2631')),inner=mesh(r,new THREE.CylinderGeometry(.044,.041,1,10),material(r,skin));group.add(outer,inner);parts.push({outer,inner});}const hand=mesh(r,new THREE.SphereGeometry(.065,12,8),material(r,skin));group.add(hand);return {group,parts,hand};}
function segment(part,a,b){const delta=b.clone().sub(a),length=delta.length(),direction=delta.clone().normalize();for(const [key,z] of [['outer',0],['inner',.035]]){const m=part[key];m.position.copy(a).add(b).multiplyScalar(.5);m.position.z+=z;m.scale.y=length;m.quaternion.setFromUnitVectors(v(0,1),direction);}}
export function createReferenceAthlete(resources,team,handedness,index=0){
 const root=new THREE.Group(),visual=new THREE.Group(),geometry=new THREE.PlaneGeometry(1,1,12,28),mat=new THREE.MeshBasicMaterial({transparent:true,alphaTest:.08,depthWrite:true,side:THREE.DoubleSide,toneMapped:false});resources.materials.add(mat);resources.geometries.add(geometry);
 const body=new THREE.Mesh(geometry,mat);body.name='OriginalDetailedAthlete';visual.add(body);root.add(visual);
 const player=(team==='team1'||team==='green'?0:2)+(index%2),skin=['#efae70','#b96c35','#efa16a','#a9653c'][player],arms=[arm(resources,skin),arm(resources,skin)];for(const a of arms)visual.add(a.group);
 const paddle=new THREE.Group(),rim=mesh(resources,new THREE.CylinderGeometry(.19,.19,.046,24),material(resources,'#192d39')),face=mesh(resources,new THREE.CylinderGeometry(.167,.167,.05,24),material(resources,team==='team1'?'#3f8994':'#e7ad67'));rim.rotation.x=face.rotation.x=Math.PI/2;rim.scale.y=face.scale.y=1.2;paddle.add(rim,face);
 const grip=mesh(resources,new THREE.CylinderGeometry(.032,.028,.24,10),material(resources,'#cfa572'));grip.position.y=-.24;paddle.add(grip);visual.add(paddle);
 root.userData={team,handedness,player,resources,visual,body,arms,paddle,baseVertices:Float32Array.from(geometry.attributes.position.array),paddleFaceWorld:v(),referenceAthlete:true};return root;
}
const directionFrame=direction=>({front:[0,1],'front-right':[1,1],right:[2,1],'back-right':[3,1],back:[3,1],'back-left':[3,-1],left:[2,-1],'front-left':[1,-1]})[direction]||[0,1];
function strokePhase(s){if(!s.profile)return 3;const t=s.strokeTime/s.profile.duration,c=s.profile.contactRatio,f=s.profile.recoverRatio||.8;return t<=c?t/c:t<=f?1+(t-c)/(f-c):2+(t-f)/(1-f);}
export function updateReferenceAthlete(root,sample,camera,contactWeight=0){
 const d=root.userData;root.position.set(sample.worldPosition.x,sample.worldPosition.y||0,sample.worldPosition.z);d.visual.quaternion.copy(camera.quaternion);
 const [frame,mirror]=directionFrame(sample.viewDirection),meta=d.resources.assets.metadata.frames[d.player][frame],h=meta.heightMeters,w=h*meta.rect[2]/meta.rect[3];d.body.material.map=d.resources.texture(d.player,frame);d.body.scale.set(w*mirror,h,1);
 const moving=(sample.travelSpeed||0)>.05,phase=strokePhase(sample),family=['ready','shuffle'].includes(sample.action)?'ready':((sample.action==='short-hop'||sample.shotType==='short-hop')&&!['serve','overhead'].includes(sample.instructionalFamily)?'short-hop':sample.instructionalFamily||sample.shotType)||sample.action||'ready',pose=computePixelStroke({type:family,strokeSide:sample.strokeSide,handedness:d.handedness,phase,facing:sample.viewDirection,moving,time:sample.timeSeconds||0,planted:sample.planted});
 const gait=moving&&!sample.planted?Math.sin(sample.travelPhase??(sample.timeSeconds||0)*12):0,load=['dink','reset','short-hop'].includes(family)?.07:0;
 d.body.position.set(pose.torsoOffset.x*.018,h/2-load+Math.abs(gait)*.018,0);d.body.rotation.z=(pose.torsoOffset.x*.006);
 // Deform the existing richly drawn legs around their hips; shoes keep their artwork.
 const pos=d.body.geometry.attributes.position,base=d.baseVertices;for(let i=0;i<pos.count;i++){const x=base[i*3],y=base[i*3+1],leg=Math.max(0,Math.min(1,(-y-.19)/.31)),side=x<0?-1:1;pos.setXYZ(i,x+leg*gait*.025*side,y+leg*Math.max(0,gait*side)*.045,base[i*3+2]);}pos.needsUpdate=true;
 root.updateMatrixWorld(true);
 if(family==='short-hop'&&phase>1&&phase<3)pose.paddle.y-=Math.sin((phase-1)*Math.PI/2);
 const scale=.063,fromPose=p=>v(p.x*scale,-p.y*scale-load,.09),paddle=fromPose(pose.paddle),target=sample.paddle?.worldContactTarget;
 // Contact target is the authored ball location; preserve the swing arc around it.
 if(target&&contactWeight>0){const local=d.visual.worldToLocal(v(target.x,target.y,target.z)),contact=computePixelStroke({type:family,strokeSide:sample.strokeSide,handedness:d.handedness,phase:1,facing:sample.viewDirection});local.add(paddle.clone().sub(fromPose(contact.paddle)));paddle.lerp(local,Math.min(1,contactWeight));}
 // The artwork is a camera-facing card. Put the articulated shoulders at
 // the nearest point along the exact camera-to-sleeve rays: this keeps
 // their visible attachments on the drawn sleeves without stretching the shirt
 // when a high contact is far in front of that card at an elevated camera angle.
 const handSide=(d.handedness==='left'?-1:1)*(frame===3?1:-1)*mirror;
 const cameraLocal=d.visual.worldToLocal(camera.getWorldPosition(v()));
 const sleeve=(side,height=1.05)=>{
  const anchor=v(side*.26/(w*mirror),(height-load-d.body.position.y)/h,0);
  d.body.localToWorld(anchor);return d.visual.worldToLocal(anchor);
 };
 // The rounded sleeve cuff spans a small, fixed part of the original art.
 // Roll the working attachment along that cuff for low/high strokes, never
 // move or deform the artwork itself. Both interpolation and depth are smooth.
 let cuff=Math.max(0,Math.min(1,(paddle.y-.5)/.8));cuff=cuff*cuff*(3-2*cuff);
 const sleeveHeight=.90+.15*cuff,sleeveAnchor=sleeve(handSide,sleeveHeight),offSleeveAnchor=sleeve(-handSide);
 const ray=sleeveAnchor.clone().sub(cameraLocal),shoulder=cameraLocal.clone().addScaledVector(ray,paddle.clone().sub(cameraLocal).dot(ray)/Math.max(1e-9,ray.lengthSq()));
 const radial=paddle.clone().sub(shoulder).normalize(),wrist=paddle.clone().addScaledVector(radial,-.235);
 const delta=wrist.clone().sub(shoulder),len=delta.length(),mid=shoulder.clone().add(wrist).multiplyScalar(.5),bone=.49,bend=Math.sqrt(Math.max(0,bone*bone-Math.min(len,2*bone)**2/4)),elbowDirection=v(handSide*.25,-.35,.9).addScaledVector(delta,-v(handSide*.25,-.35,.9).dot(delta)/Math.max(1e-18,len*len)).normalize(),elbow=mid.add(elbowDirection.multiplyScalar(bend));
 segment(d.arms[0].parts[0],shoulder,elbow);segment(d.arms[0].parts[1],elbow,wrist);d.arms[0].hand.position.copy(wrist);
 const off=offSleeveAnchor,offElbow=off.clone().add(v(-handSide*.09,-.20,0)),offHand=off.clone().add(v(handSide*.02,-.27,.07));segment(d.arms[1].parts[0],off,offElbow);segment(d.arms[1].parts[1],offElbow,offHand);d.arms[1].hand.position.copy(offHand);
 d.rigPose={sleeveAnchor:sleeveAnchor.clone(),shoulder:shoulder.clone(),offSleeveAnchor:offSleeveAnchor.clone(),upperArmLength:bone,forearmLength:bone,wristReach:len,sleeveHeight};
 d.paddle.position.copy(paddle);d.paddle.rotation.z=Math.atan2(-radial.x,radial.y);d.paddle.rotation.y=sample.strokeSide==='backhand'?-.22:.22;root.updateMatrixWorld(true);d.paddle.getWorldPosition(d.paddleFaceWorld);d.animation={phase:sample.phase,action:sample.action,source:'original-imagegen-articulated-v2',frame,mirror,contactWeight,backhand:pose.backhand,planted:pose.planted,family:pose.family};
}
export const loadDetailedAthleteAssets=loadReferenceAthleteAssets;
export const DetailedAthleteResources=ReferenceAthleteResources;
export const createDetailedAthlete=createReferenceAthlete;
export const updateDetailedAthlete=updateReferenceAthlete;
