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
 dispose(){if(this.disposed)return;this.disposed=true;for(const t of this.textures.values())t.dispose();for(const m of this.materials)m.dispose();for(const g of this.geometries)g.dispose();this.textures.clear();this.materials.clear();this.geometries.clear();this.pixelGeometryCache?.clear();this.pixelMaterial=null;}
}
// Original dimensional pixel athletes. Local +Z is forward, never camera-facing.
// Closed chamfered contours, stepped hair and a small palette carry the handheld
// pixel-art language in real geometry. The atlas API above remains compatible
// with saved artwork tools, but none of the actor surfaces are sprite planes.
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const UP=v(0,1,0),INK='#28313d';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
const PALETTES=[
 {shirt:'#3c9d79',light:'#a7d4a2',dark:'#286a59',skin:'#edb28a',hair:'#5b3d35',cap:'#f2d58f'},
 {shirt:'#3c9d79',light:'#a7d4a2',dark:'#286a59',skin:'#aa6d48',hair:'#34303a',cap:'#e7ece0'},
 {shirt:'#e98557',light:'#f8d58b',dark:'#a94c43',skin:'#edb28a',hair:'#6b4938',cap:'#eee8d5'},
 {shirt:'#e98557',light:'#f8d58b',dark:'#a94c43',skin:'#aa6d48',hair:'#34303a',cap:'#e7ece0'}
];
// An eight-sided rectangle has broad pixel-like front/side planes rather than
// cylinder facets. Repeated ring heights form genuine horizontal cloth ledges.
function pixelVolume(rings,color,{outline=.012,chamfer=.20}={}){
 const c=chamfer,shape=[[-.5+c,-.5],[.5-c,-.5],[.5,-.5+c],[.5,.5-c],[.5-c,.5],[-.5+c,.5],[-.5,.5-c],[-.5,-.5+c]],positions=[],normals=[],colors=[];
 const base=new THREE.Color(color),ink=new THREE.Color(INK),a=v(),b=v(),n=v();
 const points=rings.flatMap(([y,w,d])=>shape.map(([x,z])=>v(x*w,y,z*d)));
 const triangle=(ia,ib,ic,hull=false)=>{
  const ps=[points[ia],points[ib],points[ic]];n.crossVectors(a.subVectors(ps[1],ps[0]),b.subVectors(ps[2],ps[0])).normalize();
  const shade=n.y>.45?1.07:n.y<-.45?.67:n.z>.45?1:n.x<-.45?.83:.90,tint=hull?ink:base.clone().multiplyScalar(shade);
  for(const p of ps){positions.push(p.x+(hull?Math.sign(p.x)*outline:0),p.y+(hull?(p.y>(rings[0][0]+rings.at(-1)[0])/2?outline:-outline):0),p.z+(hull?Math.sign(p.z)*outline:0));normals.push(n.x,n.y,n.z);colors.push(tint.r,tint.g,tint.b);}
 };
 const emit=(i,j,k)=>{triangle(i,k,j);if(outline)triangle(j,k,i,true);};
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<8;i++){const a=r*8+i,b=r*8+(i+1)%8,c=b+8,d=a+8;emit(a,b,d);emit(b,c,d);}
 for(let i=1;i<7;i++){emit(0,i+1,i);const top=(rings.length-1)*8;emit(top,top+i,top+i+1);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeBoundingBox();return geometry;
}
function vertexMaterial(r){if(!r.pixelMaterial){r.pixelMaterial=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});r.materials.add(r.pixelMaterial);}return r.pixelMaterial;}
function volume(r,parent,name,color,rings,position=[0,0,0],options={}){
 r.pixelGeometryCache??=new Map();const key=JSON.stringify([color,rings,options]);let geometry=r.pixelGeometryCache.get(key);if(!geometry){geometry=pixelVolume(rings,color,options);r.pixelGeometryCache.set(key,geometry);r.geometries.add(geometry);}
 const mesh=new THREE.Mesh(geometry,vertexMaterial(r));mesh.name=name;mesh.position.set(...position);parent.add(mesh);return mesh;
}
function block(r,parent,name,color,size,position,outline=.006){const [w,h,d]=size;return volume(r,parent,name,color,[[-h/2,w,d],[h/2,w,d]],position,{outline,chamfer:.04});}
function segment(object,a,b){object.position.copy(a).add(b).multiplyScalar(.5);object.scale.y=a.distanceTo(b);object.quaternion.setFromUnitVectors(UP,b.clone().sub(a).normalize());}
function limb(r,parent,name,color,width,depth=width){return volume(r,parent,name,color,[[-.5,width*.88,depth*.88],[.5,width,depth]],undefined,{outline:.009,chamfer:.22});}
function makeArm(r,parent,name,c){
 const group=new THREE.Group();group.name=name;parent.add(group);const parts=[0,1].map(i=>{const outer=limb(r,group,`${name}${i?'Forearm':'UpperArm'}`,c.skin,i?.105:.125);return {outer,inner:outer};});
 const sleeve=limb(r,group,`${name}Sleeve`,c.shirt,.205,.23),cuff=limb(r,group,`${name}Cuff`,'#f5edda',.209,.235);
 const hand=new THREE.Group();hand.name=`${name}Hand`;group.add(hand);
 volume(r,hand,`${name}Palm`,c.skin,[[-.063,.105,.09],[.050,.118,.10]],undefined,{outline:.009,chamfer:.23});
 // Thumb and knuckle blocks wrap a real grip instead of ending beside it.
 block(r,hand,`${name}Thumb`,c.skin,[.052,.065,.055],[.052,-.005,.027],.005);
 return {group,parts,hand,sleeve,cuff};
}
function makeLeg(r,parent,name,c){
 const thigh=limb(r,parent,`${name}Thigh`,c.skin,.16,.17),shorts=limb(r,parent,`${name}Shorts`,'#354452',.235,.25),shin=limb(r,parent,`${name}Shin`,c.skin,.115,.12),sock=limb(r,parent,`${name}Sock`,'#f5edda',.125,.13),foot=new THREE.Group();foot.name=`${name}Foot`;parent.add(foot);
 // Bottom vertices are symmetric about the authored sole target. A shoe's toe
 // extends forward above this contact patch, not by moving its ground anchor.
 const sole=volume(r,foot,`${name}Sole`,INK,[[0,.19,.30],[.035,.19,.30]],undefined,{outline:0,chamfer:.12});
 volume(r,foot,`${name}Sneaker`,'#f5edda',[[.032,.18,.29],[.080,.18,.29],[.135,.145,.20]],undefined,{outline:.006,chamfer:.18});
 block(r,foot,`${name}ShoeStripe`,c.shirt,[.192,.025,.11],[0,.069,-.015],0);
 block(r,foot,`${name}Laces`,'#e0dacb',[.08,.012,.09],[0,.132,.014],0);
 return {thigh,shorts,shin,sock,foot,sole,hip:v(),knee:v(),ankle:v(),thighLength:.32,shinLength:.31};
}
// One dynamic vertex-color body draw. Hidden originals are semantic geometry
// handles and test sources, never contact-only or camera-dependent substitutes.
function batchBody(r,visual){
 const sources=[];visual.traverse(o=>{if(o.isMesh)sources.push(o);});const positions=[],normals=[],colors=[],parts=[];
 for(const source of sources){const p=source.geometry.attributes.position,n=source.geometry.attributes.normal,c=source.geometry.attributes.color,start=positions.length/3;positions.push(...p.array);normals.push(...n.array);colors.push(...c.array);parts.push({source,start,count:p.count,positions:Float32Array.from(p.array),normals:Float32Array.from(n.array),matrix:new THREE.Matrix4()});source.visible=false;}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));r.geometries.add(geometry);const batch=new THREE.Mesh(geometry,vertexMaterial(r));batch.name='DimensionalPixelAthlete';batch.frustumCulled=false;visual.add(batch);return {batch,parts,inverse:new THREE.Matrix4()};
}
function updateBodyBatch(body,visual){
 const p=body.batch.geometry.attributes.position,n=body.batch.geometry.attributes.normal;body.inverse.copy(visual.matrixWorld).invert();
 for(const part of body.parts){part.matrix.multiplyMatrices(body.inverse,part.source.matrixWorld);const m=part.matrix.elements,s=part.positions,normal=part.normals;let at=part.start*3;
  // Vertex colors already contain discrete local-space shade bands. Normals
  // remain authored for geometric audits; no per-frame normal recomputation.
  for(let i=0;i<s.length;i+=3,at+=3){const x=s[i],y=s[i+1],z=s[i+2];p.array[at]=m[0]*x+m[4]*y+m[8]*z+m[12];p.array[at+1]=m[1]*x+m[5]*y+m[9]*z+m[13];p.array[at+2]=m[2]*x+m[6]*y+m[10]*z+m[14];n.array[at]=normal[i];n.array[at+1]=normal[i+1];n.array[at+2]=normal[i+2];}
 }p.needsUpdate=true;
}
export function createReferenceAthlete(resources,team,handedness,index=0){
 if(resources.disposed)throw new Error('Reference athlete resources are disposed');
 const r=resources,root=new THREE.Group(),visual=new THREE.Group(),upper=new THREE.Group(),head=new THREE.Group(),player=(team==='team1'||team==='green'?0:2)+(index%2),c=PALETTES[player],alternate=player%2!==0;
 root.name=`PixelAthlete-${team}-${handedness}`;visual.name='WorldFacingPixelAthlete';upper.name='PixelAthleteTorso';head.name='PixelAthleteHead';root.add(visual);visual.add(upper);upper.add(head);
 const body=volume(r,upper,'PixelJersey',c.shirt,[[.69,.37,.30],[.73,.41,.31],[1.02,.45,.32],[1.13,.50,.32],[1.18,.40,.28]]);
 volume(r,upper,'JerseyHem',c.dark,[[.69,.38,.31],[.75,.42,.32]],undefined,{outline:0});
 volume(r,upper,'PixelShorts','#354452',[[.57,.38,.29],[.71,.39,.30]]);
 // Small stepped collar and a clean continuous chest stripe wrap both sides.
 volume(r,upper,'Collar',c.dark,[[1.14,.23,.20],[1.19,.22,.20]],undefined,{outline:.004});
 block(r,upper,'FrontShirtStripe',c.light,[.41,.068,.016],[0,1.005,.163],0);
 block(r,upper,'BackShirtStripe',c.light,[.41,.068,.016],[0,1.005,-.163],0);
 for(const side of [-1,1])block(r,upper,'SideShirtStripe',c.light,[.014,.068,.28],[side*.224,1.005,0],0);
 block(r,upper,'ClubBadge','#f5edda',[.07,.08,.018],[-.123,1.09,.164],0);
 block(r,upper,'BadgePixel',c.dark,[.027,.045,.022],[-.132,1.09,.166],0);
 volume(r,upper,'Neck',c.skin,[[1.16,.16,.16],[1.29,.17,.17]],undefined,{outline:.008});
 const face=volume(r,head,'PixelHead',c.skin,[[1.22,.35,.33],[1.27,.46,.40],[1.34,.51,.43],[1.58,.54,.43],[1.69,.46,.39]],undefined,{outline:.014,chamfer:.19});
 // Hair is a solid cap with stepped edge, back and side locks. No rear face art.
 volume(r,head,'HairCrown',c.hair,[[1.56,.55,.45],[1.68,.57,.47],[1.75,.47,.40],[1.78,.34,.31]],undefined,{outline:.011,chamfer:.17});
 for(const side of [-1,1]){
  block(r,head,'Ear',c.skin,[.065,.115,.12],[side*.263,1.415,-.005],.006);
  block(r,head,'Sideburn',c.hair,[.075,.16,.13],[side*.247,1.54,-.04],.006);
  block(r,head,'EyeWhite','#f9f4dd',[.072,.075,.018],[side*.115,1.46,.217],0);
  block(r,head,'EyePixel',INK,[.037,.065,.022],[side*.107,1.457,.229],0);
  block(r,head,'Eyebrow',c.hair,[.075,.022,.026],[side*.115,1.526,.222],0);
 }
 block(r,head,'NosePixel',c.skin,[.037,.04,.018],[0,1.407,.224],0);
 block(r,head,'MouthPixel','#8b5749',[.058,.014,.016],[0,1.346,.207],0);
 if(alternate){
  // A recognisable ponytail is three joined stepped volumes, readable in back.
  volume(r,head,'PonytailRoot',c.hair,[[1.43,.20,.19],[1.64,.22,.20]],[0,0,-.27],{outline:.01});
  volume(r,head,'Ponytail',c.hair,[[1.10,.15,.19],[1.20,.21,.23],[1.47,.23,.24]],[0,0,-.31],{outline:.01});
  block(r,head,'HairTie',c.light,[.20,.06,.205],[0,1.47,-.285],.002);
  block(r,head,'FringeLeft',c.hair,[.23,.09,.075],[-.12,1.58,.20],.004);
  block(r,head,'FringeStep',c.hair,[.12,.055,.07],[.04,1.608,.21],.004);
  block(r,head,'FringeLock',c.hair,[.08,.065,.05],[-.04,1.548,.218],.003);
 }else{
  volume(r,head,'Cap',c.cap,[[1.64,.57,.47],[1.74,.57,.47],[1.81,.44,.38]],undefined,{outline:.011,chamfer:.16});
  volume(r,head,'CapBand',c.dark,[[1.628,.574,.477],[1.668,.574,.477]],undefined,{outline:.004,chamfer:.16});
  volume(r,head,'CapVisor',c.cap,[[-.029,.58,.23],[.029,.58,.23]],[0,1.654,.275],{outline:.008,chamfer:.18});
  block(r,head,'CapBadge',c.shirt,[.075,.065,.02],[0,1.732,.244],0);
 }
 const legs={left:makeLeg(r,visual,'Left',c),right:makeLeg(r,visual,'Right',c)},arms=[makeArm(r,visual,'Working',c),makeArm(r,visual,'Support',c)],bodyBatch=batchBody(r,visual);
 const paddle=new THREE.Group();paddle.name='PixelPaddle';
 const rim=volume(r,paddle,'PaddleRim',INK,[[-.026,.345,.43],[.026,.345,.43]],undefined,{outline:0,chamfer:.23});rim.rotation.x=Math.PI/2;
 const paddleFace=volume(r,paddle,'PaddleFace',c.light,[[-.029,.305,.38],[.029,.305,.38]],undefined,{outline:0,chamfer:.23});paddleFace.rotation.x=Math.PI/2;
 const grip=volume(r,paddle,'PaddleGrip','#b88b65',[[-.12,.06,.065],[.12,.06,.065]],[0,-.235,0],{outline:.004,chamfer:.1});
 // Visible face seam and handle cap keep the equipment readable at court scale.
 block(r,paddle,'PaddleFaceMark',c.dark,[.035,.20,.005],[0,0,.031],0);
 block(r,paddle,'PaddleButt',INK,[.075,.035,.078],[0,-.34,0],0);
 visual.add(paddle);
 root.userData={team,handedness,player,resources:r,visual,upper,head,face,body,sleeves:handedness==='left'?[arms[1].sleeve,arms[0].sleeve]:arms.map(a=>a.sleeve),arms,legs,paddle,bodyBatch,baseVertices:Float32Array.from(body.geometry.attributes.position.array),paddleFaceWorld:v(),referenceAthlete:true,volumetric:true};
 return root;
}
function strokePhase(s){if(!s.profile)return 3;const t=s.strokeTime/s.profile.duration,c=s.profile.contactRatio,f=s.profile.recoverRatio||.8;return t<=c?t/c:t<=f?1+(t-c)/(f-c):2+(t-f)/(1-f);}
function bendPoint(shoulder,wrist,side){
 const delta=wrist.clone().sub(shoulder),length=Math.max(1e-9,delta.length()),axis=delta.clone().divideScalar(length);
 // A front/outward elbow plane is independent of camera projection. The
 // authored 3D wrist envelope stays clear of this anatomical pole, including
 // cross-body backhands, without choosing a different bend on reverse seek.
 const pole=v(side*.65,.1,.70),bend=pole.addScaledVector(axis,-pole.dot(axis)).normalize();
 return shoulder.clone().addScaledVector(delta,.5).addScaledVector(bend,Math.sqrt(Math.max(0,.34*.34-length*length/4)));
}
function poseArm(arm,shoulder,wrist,side,paddleQuaternion){
 const elbow=bendPoint(shoulder,wrist,side),cuffFraction=.35,skinStart=shoulder.clone().lerp(elbow,cuffFraction),cuffStart=shoulder.clone().lerp(elbow,cuffFraction-.07);
 segment(arm.parts[0].outer,skinStart,elbow);segment(arm.parts[1].outer,elbow,wrist);segment(arm.sleeve,shoulder,skinStart);segment(arm.cuff,cuffStart,skinStart);arm.hand.position.copy(wrist);arm.hand.quaternion.copy(paddleQuaternion||arm.parts[1].outer.quaternion);
 return {shoulder:shoulder.clone(),sleeveAnchor:shoulder.clone(),skinStart,elbow,wrist:wrist.clone(),cuffAnchor:skinStart.clone(),cuffFraction,upperArmLength:.34,forearmLength:.34,wristReach:shoulder.distanceTo(wrist),sleeveHeight:shoulder.y};
}
export function updateReferenceAthlete(root,sample,camera,contactWeight=0){
 const d=root.userData,{visual,upper,legs,paddle}=d,moving=(sample.travelSpeed||0)>.05,phase=strokePhase(sample),family=['ready','shuffle'].includes(sample.action)?'ready':((sample.action==='short-hop'||sample.shotType==='short-hop')&&!['serve','overhead'].includes(sample.instructionalFamily)?'short-hop':sample.instructionalFamily||sample.shotType)||sample.action||'ready',hand=d.handedness==='left'?1:-1;
 const facing=v(sample.bodyFacing?.x||0,0,sample.bodyFacing?.z??(d.team==='team1'?1:-1)).normalize();root.position.set(sample.worldPosition.x,sample.worldPosition.y||0,sample.worldPosition.z);visual.rotation.set(0,Math.atan2(facing.x,facing.z),0);
 const groundedModel2=sample.modelVersion===2&&sample.footTargets&&Object.values(sample.footTargets).every(point=>Math.abs(point.y)<1e-8),jump=!groundedModel2&&family==='overhead'&&phase>=0&&phase<=2?.4*Math.sin(Math.PI*phase/2)**2:0;root.position.y+=jump;
 // Entire gestures are authored in world-oriented 3D metres. Only the contact
 // key comes from the ball; prepare/follow/recovery are free to route around the
 // actual head and shirt. The old sprite X/Y keypaths are not physical anatomy.
 const pose=computePixelStroke({type:family,strokeSide:sample.strokeSide,handedness:d.handedness,phase,facing:'front',moving,time:sample.timeSeconds||0,planted:sample.planted}),strokeSide=hand*(pose.backhand?-1:1),compactStroke=['drop','dink','short-hop','volley','block','reset'].includes(family),times=[0,.45,1,2,3],interval=phase<.45?0:phase<1?1:phase<2?2:3,blend=smooth((phase-times[interval])/(times[interval+1]-times[interval])),court=v(0,0,sample.worldPosition.z<0?1:-1),target=sample.paddle?.worldContactTarget;
 const ready=v(hand*.18,.98,.36),soft=['drop','dink','short-hop'].includes(family),compact=['volley','block','reset'].includes(family);
 const prepare=family==='overhead'?v(hand*(pose.backhand?.18:.30),1.80,.52):family==='lob'?v(strokeSide*.35,.56,.38):soft?v(strokeSide*.30,family==='short-hop'?.48:.58,.38):compact?v(strokeSide*.26,1.0,.40):family==='serve'?v(strokeSide*(pose.backhand?.32:.45),.70,.43):v(strokeSide*.50,.98,.38);
 const follow=family==='overhead'?v(strokeSide*.32,1.02,.50):family==='lob'?v(strokeSide*.15,1.43,.55):soft?v(strokeSide*.18,family==='short-hop'?.77:.92,.45):compact?v(strokeSide*.20,1.08,.48):v(-strokeSide*(family==='serve'?.22:.32),family==='serve'?1.15:1.18,.50);
 root.updateMatrixWorld(true);
 const fromPose=(p,basis=facing)=>visual.worldToLocal(root.position.clone().addScaledVector(v(basis.z,0,-basis.x),p.x).addScaledVector(basis,p.z).add(v(0,p.y,0))),contact=target?visual.worldToLocal(v(target.x,target.y,target.z)):fromPose(v(strokeSide*.30,family==='overhead'?1.80:.8,.35)),keys=family==='ready'?[fromPose(ready,court),fromPose(ready,court),fromPose(ready,court),fromPose(ready,court),fromPose(ready,court)]:[fromPose(ready,court),fromPose(prepare),contact,fromPose(follow),fromPose(ready,court)],face=keys[interval].clone().lerp(keys[interval+1],blend);
 const activity=family==='ready'?0:Math.sin(Math.PI*clamp(phase/3))**2,low=target?Math.max(0,.67-target.y):0;
 const overheadLoad=family==='overhead'&&phase<=2?Math.sin(Math.PI*phase/2)**2:0,pelvis=v(0,.65,0),neck=v(0,1.25,0);
 upper.rotation.set(-.22*overheadLoad,0,0);upper.position.copy(pelvis).sub(pelvis.clone().applyEuler(upper.rotation)).add(v(0,-Math.min(.17,low*.4)*activity,0));
 d.head.rotation.set(-.42*overheadLoad,0,0);d.head.position.copy(neck).sub(neck.clone().applyEuler(d.head.rotation));
 root.updateMatrixWorld(true);
 const shoulder=visual.worldToLocal(upper.localToWorld(v(hand*.265,1.13,.08)));
 // Equipment rotates in a real stroke plane. Low contacts put the face below
 // the grip in front of the shirt; a radial shoulder ray would pull that wrist
 // backwards through the body. Signed angle keys stay continuous on reverse seek.
 const strokeSign=hand*(pose.backhand?-1:1),angles=family==='overhead'?[0,strokeSign*.35,strokeSign*.15,strokeSign*2.3,0]:family==='lob'?[0,strokeSign*2.4,strokeSign*2.15,strokeSign*.3,0]:compactStroke?[0,strokeSign*2.0,strokeSign*2.25,strokeSign*1.8,0]:[0,strokeSign*1.8,strokeSign*2.25,-strokeSign*1.0,0],angle=family==='ready'?0:angles[interval]+(angles[interval+1]-angles[interval])*blend,axisWeight=family==='ready'?0:phase<.45?smooth(phase/.45):phase>2?smooth(3-phase):1,open=(family==='lob'?.45:compactStroke?.12:.035)*axisWeight,paddleNormal=v(0,open,1).normalize(),radial=v(Math.sin(angle),Math.cos(angle),-open*Math.cos(angle)).normalize(),wrist=face.clone().addScaledVector(radial,-.235);
 if(shoulder.distanceTo(wrist)>.679999){
  // Chibi shoulder load is carried by the real torso and head, not a detached
  // joint. This is only needed for extreme legacy windups, never shifts feet.
  const delta=wrist.clone().sub(shoulder),shift=delta.clone().multiplyScalar((delta.length()-.679999)/delta.length());upper.position.add(shift);root.updateMatrixWorld(true);shoulder.add(shift);
 }
 for(const [name,side]of [['left',1],['right',-1]]){
  const leg=legs[name],gait=moving&&!sample.planted?Math.sin(sample.travelPhase??(sample.timeSeconds||0)*12)*side:0,footTarget=sample.footTargets?.[name],ankle=footTarget?visual.worldToLocal(v(footTarget.x,footTarget.y+(sample.modelVersion===2?0:jump),footTarget.z)):v(side*.205,Math.max(0,gait)*.07,gait*.10),hip=visual.worldToLocal(upper.localToWorld(v(side*.125,.65,0))),shinEnd=ankle.clone().add(v(0,.135,0)),delta=shinEnd.clone().sub(hip),axis=delta.clone().normalize(),length=Math.max(.001,delta.length()),a=leg.thighLength,b=leg.shinLength,reach=clamp(length,Math.abs(a-b)+1e-6,a+b-1e-6),along=(a*a-b*b+reach*reach)/(2*reach),pole=v(0,0,1).addScaledVector(axis,-axis.z).normalize(),knee=hip.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)));
  segment(leg.thigh,hip,knee);segment(leg.shorts,hip,hip.clone().lerp(knee,.55));segment(leg.shin,knee,shinEnd);segment(leg.sock,ankle.clone().add(v(0,.105,0)),ankle.clone().add(v(0,.23,0)));leg.foot.position.copy(ankle);leg.foot.rotation.set(0,sample.footTargets?(sample.worldPosition.z<0?0:Math.PI)-visual.rotation.y:0,0);leg.hip.copy(hip);leg.knee.copy(knee);leg.ankle.copy(ankle);
 }
 const normal=paddleNormal;const x=v().crossVectors(radial,normal).normalize();normal.crossVectors(x,radial).normalize();paddle.position.copy(face);paddle.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,radial,normal));
 const rig=poseArm(d.arms[0],shoulder,wrist,hand,paddle.quaternion),offShoulder=visual.worldToLocal(upper.localToWorld(v(-hand*.265,1.13,.08))),offWrist=offShoulder.clone().add(v(hand*.22,-.25,.30));poseArm(d.arms[1],offShoulder,offWrist,-hand,null);
 d.sleeves=d.handedness==='left'?[d.arms[1].sleeve,d.arms[0].sleeve]:d.arms.map(a=>a.sleeve);
 d.rigPose={...rig,workingSide:d.handedness==='left'?1:0,offSleeveAnchor:offShoulder.clone(),restCuff:rig.skinStart.clone()};root.updateMatrixWorld(true);updateBodyBatch(d.bodyBatch,visual);paddle.getWorldPosition(d.paddleFaceWorld);
 d.animation={phase:sample.phase,action:sample.action,bodyFacing:sample.bodyFacing?{...sample.bodyFacing}:null,viewDirection:sample.viewDirection,source:'dimensional-pixel-athletes-v1',volumetric:true,bodyYaw:visual.rotation.y,jumpHeight:jump,torsoLean:upper.rotation.x,headTilt:d.head.rotation.x,frame:0,mirror:1,contactWeight,backhand:pose.backhand,planted:pose.planted,family:pose.family};
}
export const loadDetailedAthleteAssets=loadReferenceAthleteAssets;
export const DetailedAthleteResources=ReferenceAthleteResources;
export const createDetailedAthlete=createReferenceAthlete;
export const updateDetailedAthlete=updateReferenceAthlete;
