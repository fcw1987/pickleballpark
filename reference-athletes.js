import * as THREE from './vendor/three.module.min.js';
import {computePixelStroke} from './pixel-strokes.js';
const SOURCE=new URL('./assets/reference-athletes/athletes-armless-v2.webp',import.meta.url).href;
// Original atlas sleeve wedges and hems, measured per player/frame. Coordinates
// are pixels within each metadata rectangle. The source PNG stays unchanged.
export const REFERENCE_SLEEVE_REGIONS=[[[{"pivotUV":[0.30661646046261437,0.5129750574335412],"visible":true,"bodyCut":[0,135,47,41],"patch":[0,134,55,42]},{"pivotUV":[0.6893644816721739,0.5140205823057808],"visible":true,"bodyCut":[122,135,47,40],"patch":[114,134,55,41]}],[{"pivotUV":[0.3144808743169399,0.5356800978222895],"visible":true,"bodyCut":[0,129,53,45],"patch":[0,128,61,46]},{"pivotUV":[0.5453341740226986,0.5241891141349626],"visible":true,"bodyCut":[105,132,78,41],"patch":[97,131,86,42]}],[{"pivotUV":[0.3803953206938282,0.5326280468162783],"visible":true,"bodyCut":[0,130,65,45],"patch":[0,129,73,46]},{"pivotUV":[0.4540540540540541,0.5326280468162783],"visible":false,"bodyCut":null,"patch":null}],[{"pivotUV":[0.3172373705347707,0.5216508328583191],"visible":true,"bodyCut":[0,133,48,41],"patch":[0,132,56,42]},{"pivotUV":[0.7034108264042084,0.5247894950933034],"visible":true,"bodyCut":[122,132,44,40],"patch":[114,131,52,41]}]],[[{"pivotUV":[0.32558691308691307,0.5256718548355559],"visible":true,"bodyCut":[0,133,52,42],"patch":[0,132,60,43]},{"pivotUV":[0.6743093358737071,0.524193641187376],"visible":true,"bodyCut":[124,134,52,41],"patch":[116,133,60,42]}],[{"pivotUV":[0.3340716019417476,0.5476943468980238],"visible":true,"bodyCut":[0,128,59,44],"patch":[0,127,67,45]},{"pivotUV":[0.5503396739130434,0.5335383903792784],"visible":true,"bodyCut":[111,132,81,42],"patch":[103,131,89,43]}],[{"pivotUV":[0.38316036570298984,0.5474383178503646],"visible":true,"bodyCut":[0,128,68,44],"patch":[0,127,76,45]},{"pivotUV":[0.44473684210526315,0.5474383178503646],"visible":false,"bodyCut":null,"patch":null}],[{"pivotUV":[0.3346709470304976,0.5218183256844438],"visible":true,"bodyCut":[0,136,54,42],"patch":[0,135,62,43]},{"pivotUV":[0.6809294320137693,0.5202596300695741],"visible":true,"bodyCut":[124,136,51,42],"patch":[116,135,59,43]}]],[[{"pivotUV":[0.4273038842345773,0.5340905582711603],"visible":true,"bodyCut":[0,129,81,41],"patch":[0,128,89,42],"preserveRects":[[26,128,11,1]]},{"pivotUV":[0.7046063752716735,0.5351873453517143],"visible":true,"bodyCut":[147,128,55,42],"patch":[139,127,63,43]}],[{"pivotUV":[0.4395464829288359,0.5530256703727927],"visible":true,"bodyCut":[0,124,92,44],"patch":[0,123,100,45],"preserveRects":[[20,123,14,2],[44,123,14,2]]},{"pivotUV":[0.593923723335488,0.5434106160449792],"visible":true,"bodyCut":[136,127,85,41],"patch":[128,126,93,42]}],[{"pivotUV":[0.5032446241425784,0.5517828974678289],"visible":true,"bodyCut":[0,123,109,44],"patch":[0,122,117,45],"preserveRects":[[4,122,58,22]]},{"pivotUV":[0.53215859030837,0.5517828974678289],"visible":false,"bodyCut":null,"patch":null}],[{"pivotUV":[0.2695970695970696,0.5324349626429021],"visible":true,"bodyCut":[0,129,48,41],"patch":[0,128,56,42]},{"pivotUV":[0.5600798403193613,0.5332630391391131],"visible":true,"bodyCut":[114,129,81,41],"patch":[106,128,89,42]}]],[[{"pivotUV":[0.319822350440328,0.5406804172593647],"visible":true,"bodyCut":[0,131,52,42],"patch":[0,130,60,43]},{"pivotUV":[0.6818608588579345,0.5405443403028118],"visible":true,"bodyCut":[126,131,52,42],"patch":[118,130,60,43]}],[{"pivotUV":[0.32695206028539364,0.5467072826163735],"visible":true,"bodyCut":[0,130,57,45],"patch":[0,129,65,46]},{"pivotUV":[0.5522314239705544,0.5375782912739434],"visible":true,"bodyCut":[109,132,80,41],"patch":[101,131,88,42]}],[{"pivotUV":[0.3557283359914939,0.5474591307814992],"visible":true,"bodyCut":[0,130,59,46],"patch":[0,129,67,47]},{"pivotUV":[0.4583333333333333,0.5474591307814992],"visible":false,"bodyCut":null,"patch":null}],[{"pivotUV":[0.33158240568954855,0.5351769658912515],"visible":true,"bodyCut":[0,133,53,42],"patch":[0,132,61,43]},{"pivotUV":[0.6830209563164108,0.5349337026609753],"visible":true,"bodyCut":[125,133,51,42],"patch":[117,132,59,43]}]]];
const SLEEVE_META=REFERENCE_SLEEVE_REGIONS;
export function partitionReferenceAtlas(image,metadata,createCanvas=()=>document.createElement('canvas')){
 const make=()=>{const canvas=createCanvas();canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;return canvas;},body=make(),sleeves=[make(),make()],context=body.getContext('2d');context.drawImage(image,0,0);
 for(let player=0;player<4;player++)for(let frame=0;frame<4;frame++)for(let side=0;side<2;side++){
  const region=SLEEVE_META[player][frame][side];if(!region.visible)continue;const [ox,oy]=metadata.frames[player][frame].rect,[x,y,w,h]=region.bodyCut,[px,py,pw,ph]=region.patch;
  context.clearRect(ox+x,oy+y,w,h);const sleeveContext=sleeves[side].getContext('2d');sleeveContext.drawImage(image,ox+px,oy+py,pw,ph,ox+px,oy+py,pw,ph);
  // Calibrated detached ponytail fragments stay on the original body. Restore
  // only the cleared intersection, avoiding alpha-overpainting the overlap row.
  for(const [hx,hy,hw,hh]of region.preserveRects||[]){const left=Math.max(x,hx),top=Math.max(y,hy),right=Math.min(x+w,hx+hw),bottom=Math.min(y+h,hy+hh);if(right>left&&bottom>top)context.drawImage(image,ox+left,oy+top,right-left,bottom-top,ox+left,oy+top,right-left,bottom-top);sleeveContext.clearRect(ox+hx,oy+hy,hw,hh);}
 }
 return {image:body,sleeves};
}
let sharedAssetLoad=null;
function sharedReferenceAthleteAssets(){
 if(sharedAssetLoad)return sharedAssetLoad;
 const imageReady=new Promise((resolve,reject)=>{
  const image=new Image(),finish=error=>{image.onload=null;image.onerror=null;error?reject(error):resolve(image);};
  image.onload=()=>finish();image.onerror=()=>finish(new Error('Unable to load reference athlete artwork'));image.src=SOURCE;
  if(image.complete&&image.naturalWidth)finish();
 });
 // The immutable CPU artwork belongs to the module; GPU textures/materials
 // remain owned by each renderer and are recreated/disposed on every entry.
 const pending=Promise.all([imageReady,fetch(new URL('./assets/reference-athletes/metadata-v2.json',import.meta.url)).then(async response=>{if(!response.ok)throw new Error('Missing athlete atlas metadata');return response.json();})]).then(([sourceImage,metadata])=>{
  const partition=partitionReferenceAtlas(sourceImage,metadata);return Object.freeze({...partition,sleeves:Object.freeze(partition.sleeves),sourceImage,source:SOURCE,metadata});
 });
 sharedAssetLoad=pending;
 pending.catch(()=>{if(sharedAssetLoad===pending)sharedAssetLoad=null;});
 return pending;
}
export function loadReferenceAthleteAssets({signal}={}){
 if(signal?.aborted)return Promise.reject(signal.reason??new DOMException('Aborted','AbortError'));
 const pending=sharedReferenceAthleteAssets();if(!signal)return pending;
 // Cancellation belongs to this consumer. Aborting an obsolete 3D entry must
 // not cancel another entry or poison the shared image/partition cache.
 return new Promise((resolve,reject)=>{
  let listening=true;const cleanup=()=>{if(listening){listening=false;signal.removeEventListener('abort',abort);}},abort=()=>{cleanup();reject(signal.reason??new DOMException('Aborted','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
  pending.then(assets=>{cleanup();resolve(assets);},error=>{cleanup();reject(error);});
  if(signal.aborted)abort();
 });
}
export class ReferenceAthleteResources{
 constructor(assets){this.assets=assets;this.source=new THREE.Source(assets.image);this.sleeveSources=(assets.sleeves||[assets.image,assets.image]).map(im=>new THREE.Source(im));this.disposed=false;this.textures=new Map();this.materials=new Set();this.geometries=new Set();}
 texture(player,direction,part=-1){if(this.disposed)throw new Error('Reference athlete resources are disposed');const key=`${player}/${direction}/${part}`;if(!this.textures.has(key)){const image=this.assets.image,texture=new THREE.Texture();texture.source=part<0?this.source:this.sleeveSources[part];texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;const [x,y,w,h]=this.assets.metadata.frames[player][direction].rect;texture.repeat.set(w/image.width,h/image.height);texture.offset.set(x/image.width,1-(y+h)/image.height);texture.needsUpdate=true;this.textures.set(key,texture);}return this.textures.get(key);}
 dispose(){if(this.disposed)return;this.disposed=true;for(const t of this.textures.values())t.dispose();for(const m of this.materials)m.dispose();for(const g of this.geometries)g.dispose();this.textures.clear();this.materials.clear();this.geometries.clear();}
}
// Transparent source rows beneath each painted shoe, measured at alphaTest .08.
// Register the stance sole without changing the approved atlas or its UVs.
const SOLE_ROWS=[[[0,0],[0,0],[0,0],[0,0]],[[0,0],[0,1],[0,2],[0,0]],[[0,0],[0,0],[0,2],[0,0]],[[0,0],[0,1],[0,3],[0,0]]];
const CUFF_UV=[[[[0.20661646046261434,0.4079750574335411],[0.7893644816721739,0.40902058230578087]],[[0.21448087431693988,0.43068009782228955],[0.6453341740226985,0.4191891141349625]],[[0.28039532069382817,0.4276280468162783],[0.5540540540540541,0.4276280468162783]],[[0.21723737053477069,0.41665083285831905],[0.8034108264042084,0.41978949509330343]]],[[[0.22558691308691306,0.4206718548355559],[0.7743093358737071,0.4191936411873761]],[[0.2340716019417476,0.4426943468980238],[0.6503396739130435,0.42853839037927843]],[[0.28316036570298986,0.4424383178503646],[0.5447368421052632,0.4424383178503646]],[[0.23467094703049762,0.41681832568444377],[0.7809294320137693,0.4152596300695741]]],[[[0.3273038842345773,0.42909055827116027],[0.8046063752716736,0.4301873453517143]],[[0.3395464829288359,0.44802567037279273],[0.693923723335488,0.4384106160449792]],[[0.4032446241425784,0.44678289746782895],[0.6321585903083701,0.44678289746782895]],[[0.16959706959706958,0.42743496264290215],[0.6600798403193613,0.428263039139113]]],[[[0.21982235044032797,0.43568041725936457],[0.7818608588579344,0.43554434030281186]],[[0.2269520602853936,0.4417072826163735],[0.6522314239705544,0.4325782912739434]],[[0.2557283359914939,0.44245913078149923],[0.5583333333333333,0.44245913078149923]],[[0.23158240568954855,0.43017696589125154],[0.7830209563164108,0.4299337026609753]]]];
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function material(r,color){const m=new THREE.MeshBasicMaterial({color,toneMapped:false});r.materials.add(m);return m;}
function mesh(r,g,m){r.geometries.add(g);return new THREE.Mesh(g,m);}
function arm(r,skin){const group=new THREE.Group(),parts=[];for(let i=0;i<2;i++){const outer=mesh(r,new THREE.CylinderGeometry(.058,.054,1,10),material(r,'#2b2631')),inner=mesh(r,new THREE.CylinderGeometry(.044,.041,1,10),material(r,skin));outer.material.side=THREE.BackSide;group.add(outer,inner);parts.push({outer,inner});}const hand=mesh(r,new THREE.SphereGeometry(.065,12,8),material(r,skin));group.add(hand);return {group,parts,hand};}
function segment(part,a,b,eye){const delta=b.clone().sub(a),length=delta.length(),direction=delta.clone().normalize();for(const [key,z] of [['outer',0],['inner',.035]]){const m=part[key];m.position.copy(a).add(b).multiplyScalar(.5);if(z)m.position.addScaledVector(eye.clone().sub(m.position).normalize(),z);m.scale.y=length;m.quaternion.setFromUnitVectors(v(0,1),direction);}}
export function createReferenceAthlete(resources,team,handedness,index=0){
 const root=new THREE.Group(),visual=new THREE.Group(),geometry=new THREE.PlaneGeometry(1,1,12,28),mat=new THREE.MeshBasicMaterial({transparent:true,alphaTest:.08,depthWrite:true,side:THREE.DoubleSide,toneMapped:false});resources.materials.add(mat);resources.geometries.add(geometry);
 const body=new THREE.Mesh(geometry,mat);body.name='OriginalDetailedAthlete';visual.add(body);const sleeves=[0,1].map(()=>{const g=geometry.clone(),m=mat.clone(),s=new THREE.Mesh(g,m);resources.geometries.add(g);resources.materials.add(m);visual.add(s);return s;});root.add(visual);
 const player=(team==='team1'||team==='green'?0:2)+(index%2),skin=['#efae70','#b96c35','#efa16a','#a9653c'][player],arms=[arm(resources,skin),arm(resources,skin)];for(const a of arms)visual.add(a.group);
 const paddle=new THREE.Group(),rim=mesh(resources,new THREE.CylinderGeometry(.19,.19,.046,24),material(resources,'#192d39')),face=mesh(resources,new THREE.CylinderGeometry(.167,.167,.05,24),material(resources,team==='team1'?'#3f8994':'#e7ad67'));rim.rotation.x=face.rotation.x=Math.PI/2;rim.scale.y=face.scale.y=1.2;paddle.add(rim,face);
 const grip=mesh(resources,new THREE.CylinderGeometry(.032,.028,.24,10),material(resources,'#cfa572'));grip.position.y=-.24;paddle.add(grip);visual.add(paddle);
 root.userData={team,handedness,player,resources,visual,body,sleeves,arms,paddle,baseVertices:Float32Array.from(geometry.attributes.position.array),paddleFaceWorld:v(),referenceAthlete:true};return root;
}
const directionFrame=direction=>({front:[0,1],'front-right':[1,1],right:[2,1],'back-right':[3,1],back:[3,1],'back-left':[3,-1],left:[2,-1],'front-left':[1,-1]})[direction]||[0,1];
function strokePhase(s){if(!s.profile)return 3;const t=s.strokeTime/s.profile.duration,c=s.profile.contactRatio,f=s.profile.recoverRatio||.8;return t<=c?t/c:t<=f?1+(t-c)/(f-c):2+(t-f)/(1-f);}
export function updateReferenceAthlete(root,sample,camera,contactWeight=0){
 const d=root.userData;root.position.set(sample.worldPosition.x,sample.worldPosition.y||0,sample.worldPosition.z);const cameraFacing=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');cameraFacing.x=Math.max(-20*Math.PI/180,Math.min(20*Math.PI/180,cameraFacing.x));d.visual.quaternion.setFromEuler(cameraFacing);
 const [frame,mirror]=directionFrame(sample.viewDirection),meta=d.resources.assets.metadata.frames[d.player][frame],h=meta.heightMeters,w=h*meta.rect[2]/meta.rect[3];d.body.material.map=d.resources.texture(d.player,frame);d.body.scale.set(w*mirror,h,1);
 const moving=(sample.travelSpeed||0)>.05,phase=strokePhase(sample),family=['ready','shuffle'].includes(sample.action)?'ready':((sample.action==='short-hop'||sample.shotType==='short-hop')&&!['serve','overhead'].includes(sample.instructionalFamily)?'short-hop':sample.instructionalFamily||sample.shotType)||sample.action||'ready',pose=computePixelStroke({type:family,strokeSide:sample.strokeSide,handedness:d.handedness,phase,facing:'front',moving,time:sample.timeSeconds||0,planted:sample.planted});
 // Begin and finish every stroke at the same handed ready pose. The windup,
 // strike and follow-through keep the original family-specific choreography.
 const ready=computePixelStroke({type:'ready',strokeSide:'forehand',handedness:d.handedness,phase:3,facing:'front'}),keys=family==='ready'?[ready,ready,ready,ready,ready]:[ready,...[0,1,2].map(key=>computePixelStroke({type:family,strokeSide:sample.strokeSide,handedness:d.handedness,phase:key,facing:'front'})),ready],times=[0,.45,1,2,3],interval=phase<.45?0:phase<1?1:phase<2?2:3,keyT=Math.max(0,Math.min(1,(phase-times[interval])/(times[interval+1]-times[interval]))),keyBlend=keyT*keyT*(3-2*keyT);
 pose.paddle={x:keys[interval].paddle.x+(keys[interval+1].paddle.x-keys[interval].paddle.x)*keyBlend,y:keys[interval].paddle.y+(keys[interval+1].paddle.y-keys[interval].paddle.y)*keyBlend};pose.torsoOffset={x:0,y:0};
 const jump=family==='overhead'&&phase>=0&&phase<=2?.4*Math.sin(Math.PI*phase/2)**2:0;root.position.y=(sample.worldPosition.y||0)+jump;
 const gait=moving&&!sample.planted?Math.sin(sample.travelPhase??(sample.timeSeconds||0)*12):0;
 // Correct each source shoe's transparent bottom rows in the leg deformation.
 // A planted card has two grounded painted soles; gait then lifts one foot.
 const soleGaps=SOLE_ROWS[d.player][frame].map(rows=>rows/meta.rect[3]);
 d.body.position.set(pose.torsoOffset.x*.018*mirror,h/2,0);d.body.rotation.z=(pose.torsoOffset.x*.006*mirror);
 // Low-shot posture comes from its distinct arm profile. Keep the original
 // card soles on the ground instead of translating the whole athlete downward.
 // Deform the existing richly drawn legs around their hips; shoes keep their artwork.
 const pos=d.body.geometry.attributes.position,base=d.baseVertices;for(let i=0;i<pos.count;i++){const x=base[i*3],y=base[i*3+1],leg=Math.max(0,Math.min(1,(-y-.19)/.31)),side=x<0?-1:1,gap=soleGaps[side<0?0:1],registration=gap/Math.max(.01,1-gap/.31);pos.setXYZ(i,x+leg*gait*.025*side,y+leg*(Math.max(0,gait*side)*.045-registration),base[i*3+2]);}pos.needsUpdate=true;
 root.updateMatrixWorld(true);
 const scale=.063,facing=v(sample.bodyFacing?.x||0,0,sample.bodyFacing?.z??1).normalize(),court=v(0,0,sample.worldPosition.z<0?1:-1),fromPose=(p,basis=facing)=>d.visual.worldToLocal(root.position.clone().addScaledVector(v(basis.z,0,-basis.x),p.x*scale).addScaledVector(basis,.09).add(v(0,-p.y*scale,0))),paddle=fromPose(keys[interval].paddle,interval===0?court:facing).lerp(fromPose(keys[interval+1].paddle,interval===3?court:facing),keyBlend),target=sample.paddle?.worldContactTarget;
 if(family==='short-hop'&&phase>1&&phase<3)paddle.add(v(0,.063*Math.sin((phase-1)*Math.PI/2),0).applyQuaternion(d.visual.quaternion.clone().invert()));
 // The free stroke follows continuous world body-facing, independently of the
 // eight discrete atlas views. Recovery turns must not flip paddle/grip sides.
 // Contact target is the authored ball location; preserve the swing arc around it.
 if(target&&contactWeight>0){const local=d.visual.worldToLocal(v(target.x,target.y,target.z)),contact=keys[2];local.add(paddle.clone().sub(fromPose(contact.paddle)));paddle.lerp(local,Math.min(1,contactWeight));}
 // The artwork is a camera-facing card. Put the articulated shoulders at
 // the nearest point along the exact camera-to-sleeve rays: this keeps
 // their visible attachments on the drawn sleeves without stretching the shirt
 // when a high contact is far in front of that card at an elevated camera angle.
 const handSide=(d.handedness==='left'?-1:1)*(frame===3?1:-1);
 const cameraLocal=d.visual.worldToLocal(camera.getWorldPosition(v()));
 const sleeve=side=>{const uv=CUFF_UV[d.player][frame][side*mirror<0?0:1],anchor=v(uv[0]-.5,uv[1]-.5,0);d.body.localToWorld(anchor);return d.visual.worldToLocal(anchor);};
 const workingSide=handSide*mirror<0?0:1,restCuff=sleeve(handSide),offSleeveAnchor=sleeve(-handSide),cuffUV=CUFF_UV[d.player][frame][workingSide],pivotUV=SLEEVE_META[d.player][frame][workingSide].pivotUV,pivot=v(pivotUV[0]-.5,pivotUV[1]-.5,0);d.body.localToWorld(pivot);d.visual.worldToLocal(pivot);const sleeveAnchor=pivot.clone(),sleeveHeight=pivot.y;
 const ray=sleeveAnchor.clone().sub(cameraLocal),faceShoulder=cameraLocal.clone().addScaledVector(ray,paddle.clone().sub(cameraLocal).dot(ray)/Math.max(1e-9,ray.lengthSq())),raw=paddle.clone().sub(faceShoulder),eyeNormal=cameraLocal.clone().sub(faceShoulder).normalize();
 // The face-to-shoulder vector is perpendicular to this eye ray. A small,
 // fixed depth component therefore prevents its zero-length grip singularity
 // without changing hand/grip attachment or introducing a history filter.
 const radial=raw.addScaledVector(eyeNormal,.16).normalize(),wrist=paddle.clone().addScaledVector(radial,-.235),shoulder=cameraLocal.clone().addScaledVector(ray,wrist.clone().sub(cameraLocal).dot(ray)/Math.max(1e-9,ray.lengthSq()));
 const delta=wrist.clone().sub(shoulder),len=delta.length(),mid=shoulder.clone().add(wrist).multiplyScalar(.5),bone=.42,bend=Math.sqrt(Math.max(0,bone*bone-Math.min(len,2*bone)**2/4)),bendT=Math.min(1,len/.25),screenBend=bendT*bendT*(3-2*bendT),preferred=cameraLocal.clone().sub(shoulder).normalize().multiplyScalar(.9).addScaledVector(v(handSide*.18,-.13,0),screenBend),elbowDirection=preferred.addScaledVector(delta,-preferred.dot(delta)/Math.max(1e-18,len*len)).normalize(),elbow=mid.add(elbowDirection.multiplyScalar(bend));
 const cuffFraction=Math.min(.72,restCuff.distanceTo(pivot)/bone),skinStart=shoulder.clone().lerp(elbow,cuffFraction),eye=cameraLocal.clone(),rayToCuff=skinStart.clone().sub(eye),onCard=eye.clone().addScaledVector(rayToCuff,(.002-eye.z)/rayToCuff.z),cardCuff=d.body.worldToLocal(d.visual.localToWorld(onCard)),rest=v(cuffUV[0]-pivotUV[0],cuffUV[1]-pivotUV[1],0),desired=v(cardCuff.x-(pivotUV[0]-.5),cardCuff.y-(pivotUV[1]-.5),0),den=rest.lengthSq(),real=desired.dot(rest)/den,imag=(rest.x*desired.y-rest.y*desired.x)/den;
 for(const [side,s]of d.sleeves.entries()){s.material.map=d.resources.texture(d.player,frame,side);s.visible=SLEEVE_META[d.player][frame][side].visible;s.position.copy(d.body.position);s.position.z+=.002;s.rotation.copy(d.body.rotation);s.scale.copy(d.body.scale);const attr=s.geometry.attributes.position,original=d.baseVertices;for(let i=0;i<attr.count;i++){const bx=original[i*3],by=original[i*3+1],dx=bx+.5-pivotUV[0],dy=by+.5-pivotUV[1];attr.setXYZ(i,side===workingSide?pivotUV[0]-.5+real*dx-imag*dy:bx,side===workingSide?pivotUV[1]-.5+imag*dx+real*dy:by,0);}attr.needsUpdate=true;}
 segment(d.arms[0].parts[0],skinStart,elbow,cameraLocal);segment(d.arms[0].parts[1],elbow,wrist,cameraLocal);d.arms[0].hand.position.copy(wrist);
 d.arms[1].group.visible=SLEEVE_META[d.player][frame][1-workingSide].visible;const off=offSleeveAnchor,offElbow=off.clone().add(v(-handSide*.09,-.20,0)),offHand=off.clone().add(v(handSide*.02,-.27,.07));segment(d.arms[1].parts[0],off,offElbow,cameraLocal);segment(d.arms[1].parts[1],offElbow,offHand,cameraLocal);d.arms[1].hand.position.copy(offHand);
 d.rigPose={sleeveAnchor:sleeveAnchor.clone(),shoulder:shoulder.clone(),offSleeveAnchor:offSleeveAnchor.clone(),skinStart:skinStart.clone(),cuffAnchor:onCard.clone(),elbow:elbow.clone(),wrist:wrist.clone(),workingSide,cuffFraction,sourcePivotUV:[...pivotUV],sourceCuffUV:[...cuffUV],restCuff:restCuff.clone(),upperArmLength:bone,forearmLength:bone,wristReach:len,sleeveHeight};
 d.paddle.position.copy(paddle);d.paddle.quaternion.setFromUnitVectors(v(0,1),radial);d.paddle.rotateY(sample.strokeSide==='backhand'?-.22:.22);root.updateMatrixWorld(true);d.paddle.getWorldPosition(d.paddleFaceWorld);d.animation={phase:sample.phase,action:sample.action,bodyFacing:sample.bodyFacing?{...sample.bodyFacing}:null,viewDirection:sample.viewDirection,source:'original-imagegen-articulated-v2',jumpHeight:jump,frame,mirror,contactWeight,backhand:pose.backhand,planted:pose.planted,family:pose.family};
}
export const loadDetailedAthleteAssets=loadReferenceAthleteAssets;
export const DetailedAthleteResources=ReferenceAthleteResources;
export const createDetailedAthlete=createReferenceAthlete;
export const updateDetailedAthlete=updateReferenceAthlete;
