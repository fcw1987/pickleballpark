import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const base=process.env.PROFILE_URL||'http://127.0.0.1:4176';
const out=process.env.PROFILE_OUT||'docs/town-art/performance-study';
const modes=(process.env.PROFILE_MODES||'full,empty,half-pixels,three-quarter-pixels,no-msaa,flat-bake,world-bake,actor-lambert,actor-basic,all-basic,no-textures,front-first,frozen-actor-upload,world-hidden,actors-hidden,flat-bake-front-first,full').split(',');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
for(const mode of modes){
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?workspace=planner&render-profile=${mode}`);
 await page.waitForFunction(()=>window.pickleboard?.plays);
 await page.evaluate(()=>pickleboard.plays.load('third-shot-drop'));
 await page.locator('#play3dView').click();
 await page.waitForFunction(()=>pickleboard.threeD?.active);
 const setup=await page.evaluate(async ({mode,fxaa})=>{
  const THREE=await import('/vendor/three.module.min.js'),v=pickleboard.threeD;
  v.cancelRenderWork();v.session.pause(performance.now(),v.board.plays.timingScale);v.session.seek(1.7);v.applyAtTime(1.7);
  const directionals=[],hemis=[],ambient=new THREE.Color(0);
  v.scene.updateMatrixWorld(true);v.scene.traverse(o=>{if(!o.visible)return;if(o.isAmbientLight)ambient.add(o.color.clone().multiplyScalar(o.intensity));if(o.isHemisphereLight)hemis.push({direction:o.position.clone().normalize(),sky:o.color.clone().multiplyScalar(o.intensity),ground:o.groundColor.clone().multiplyScalar(o.intensity)});if(o.isDirectionalLight)directionals.push({direction:o.getWorldPosition(new THREE.Vector3()).sub(o.target.getWorldPosition(new THREE.Vector3())).normalize(),color:o.color.clone().multiplyScalar(o.intensity)});});
  const lighting=n=>{const c=ambient.clone();for(const h of hemis)c.add(h.ground.clone().lerp(h.sky,n.dot(h.direction)*.5+.5));for(const d of directionals)c.add(d.color.clone().multiplyScalar(Math.max(0,n.dot(d.direction))));return c.multiplyScalar(1/Math.PI);};
  let bakedMeshes=0,bakedVertices=0;
  const bake=(root,flatOnly=false)=>root.traverse(o=>{
   if(!o.isMesh||!o.geometry.attributes.normal)return;
   const original=o.material,g=o.geometry,n=g.attributes.normal,p=g.attributes.position,index=g.index;
   if(flatOnly){for(let i=0;i<(index?.count??p.count);i+=3){const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;if(n.getX(a)!==n.getX(b)||n.getX(a)!==n.getX(c)||n.getY(a)!==n.getY(b)||n.getY(a)!==n.getY(c)||n.getZ(a)!==n.getZ(b)||n.getZ(a)!==n.getZ(c))return;}}
   const geometry=g.clone(),colors=g.attributes.color,rgba=colors?.itemSize===4,paint=[],nm=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
   for(let i=0;i<p.count;i++){const normal=new THREE.Vector3().fromBufferAttribute(n,i).applyMatrix3(nm).normalize(),light=lighting(normal);paint.push(original.color.r*(colors?colors.getX(i):1)*light.r,original.color.g*(colors?colors.getY(i):1)*light.g,original.color.b*(colors?colors.getZ(i):1)*light.b);if(rgba)paint.push(colors.getW(i));}
   geometry.setAttribute('color',new THREE.Float32BufferAttribute(paint,rgba?4:3));
   o.geometry=geometry;o.material=new THREE.MeshBasicMaterial({color:'#ffffff',map:original.map,vertexColors:true,transparent:original.transparent,opacity:original.opacity,depthWrite:original.depthWrite,side:original.side});bakedMeshes++;bakedVertices+=p.count;
  });
  if(mode==='empty'){v.scene.children.filter(o=>!o.isLight).forEach(o=>o.visible=false);}
  if(mode==='world-hidden')v.world.group.visible=false;
  if(mode==='actors-hidden')for(const a of v.playerObjects.values())a.visible=false;
  if(mode==='half-pixels'||mode==='three-quarter-pixels')v.renderer.setPixelRatio(mode==='half-pixels'?.5:.75);
  if(['no-msaa','no-msaa-125','no-msaa-150','fxaa','fxaa-light','msaa2','flat-fxaa','flat-no-msaa-125'].includes(mode)){
   const previous=v.renderer,r=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});r.setPixelRatio(previous.getPixelRatio());r.outputColorSpace=previous.outputColorSpace;r.setSize(previous.domElement.clientWidth,previous.domElement.clientHeight);v.elements.canvas.replaceChildren(r.domElement);v.renderer=r;previous.dispose();
   if(['no-msaa-125','flat-no-msaa-125'].includes(mode))r.setPixelRatio(1.25);if(mode==='no-msaa-150')r.setPixelRatio(1.5);
  }
  if(['flat-bake','flat-bake-front-first','flat-fxaa','flat-no-msaa-125'].includes(mode))bake(v.world.group,true);
  if(mode==='world-bake'||mode==='all-basic')bake(v.world.group);
  if(mode==='actor-lambert'||mode==='actor-basic'||mode==='all-basic')for(const a of v.playerObjects.values())a.traverse(o=>{if(!o.isMesh||o.name==='AthleteContactShadow')return;const m=o.material;o.material=new (mode==='actor-lambert'?THREE.MeshLambertMaterial:THREE.MeshBasicMaterial)({color:m.color,vertexColors:m.vertexColors,transparent:m.transparent,opacity:m.opacity,depthWrite:m.depthWrite,flatShading:m.flatShading,side:m.side});});
  if(mode==='no-textures')v.world.group.traverse(o=>{if(o.isMesh&&o.material.map){o.material=o.material.clone();o.material.map=null;o.material.needsUpdate=true;}});
  if(mode==='front-first'||mode==='flat-bake-front-first')v.renderer.setOpaqueSort((a,b)=>a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder||a.z-b.z||a.id-b.id);
  if(mode==='frozen-actor-upload'){const seen=new Set();for(const a of v.playerObjects.values())a.traverse(o=>{if(o.isMesh)for(const at of Object.values(o.geometry.attributes))if(!seen.has(at)){seen.add(at);Object.defineProperty(at,'needsUpdate',{set(){},configurable:true});}});}
  if(mode==='cached-world'){
   const renderer=v.renderer,size=renderer.getDrawingBufferSize(new THREE.Vector2()),target=new THREE.WebGLRenderTarget(size.x,size.y,{samples:4,depthBuffer:true,stencilBuffer:false});
   target.depthTexture=new THREE.DepthTexture(size.x,size.y,THREE.UnsignedIntType);
   const cacheScene=new THREE.Scene();cacheScene.background=v.scene.background.clone();const cacheWorld=v.world.group.clone(true);cacheWorld.getObjectByName('NetMesh').visible=false;cacheScene.add(cacheWorld);const liveNet=v.world.net.getObjectByName('NetMesh').clone();liveNet.name='LiveCachedNetGrid';v.scene.add(liveNet);
   for(const light of v.scene.children.filter(o=>o.isLight))cacheScene.add(light.clone());
   const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:{colorMap:{value:target.texture},depthMap:{value:target.depthTexture}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D colorMap;uniform sampler2D depthMap;varying vec2 vUv;void main(){gl_FragColor=texture2D(colorMap,vUv);gl_FragDepth=texture2D(depthMap,vUv).r;\n#include <colorspace_fragment>\n}',depthTest:true,depthWrite:true,depthFunc:THREE.AlwaysDepth}));
   quad.frustumCulled=false;quad.renderOrder=-10000;v.scene.add(quad);
   const render=renderer.render.bind(renderer);let cached=false;renderer.info.autoReset=false;
   renderer.render=(s,c)=>{renderer.info.reset();if(!cached){renderer.setRenderTarget(target);render(cacheScene,c);renderer.setRenderTarget(null);cached=true;}const visible=v.world.group.visible;v.world.group.visible=false;try{render(s,c);}finally{v.world.group.visible=visible;}};
   window.__profileTarget=target;
  }
  if(['fxaa','fxaa-light','msaa2','flat-fxaa'].includes(mode)){
   const renderer=v.renderer,size=renderer.getDrawingBufferSize(new THREE.Vector2());
   const target=new THREE.WebGLRenderTarget(size.x,size.y,{samples:mode==='msaa2'?2:0,depthBuffer:true,stencilBuffer:false});
   const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1),scene=new THREE.Scene();
   const lightShader=`uniform sampler2D tDiffuse;uniform vec2 resolution;varying vec2 vUv;
   void main(){vec2 p=resolution;vec3 nw=texture2D(tDiffuse,vUv+vec2(-1.,-1.)*p).rgb;vec3 ne=texture2D(tDiffuse,vUv+vec2(1.,-1.)*p).rgb;vec3 sw=texture2D(tDiffuse,vUv+vec2(-1.,1.)*p).rgb;vec3 se=texture2D(tDiffuse,vUv+p).rgb;vec3 m=texture2D(tDiffuse,vUv).rgb;vec3 l=vec3(.299,.587,.114);float a=dot(nw,l),b=dot(ne,l),c=dot(sw,l),d=dot(se,l),e=dot(m,l);float lo=min(e,min(min(a,b),min(c,d))),hi=max(e,max(max(a,b),max(c,d)));vec3 rgb=m;if(hi-lo>max(.04,hi*.09)){vec2 dir=vec2(-((a+b)-(c+d)),((a+c)-(b+d)));float reduce=max((a+b+c+d)*(.25*.125),.0078125);dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+reduce),vec2(-8.),vec2(8.))*p;vec3 x=.5*(texture2D(tDiffuse,vUv+dir*(1./3.-.5)).rgb+texture2D(tDiffuse,vUv+dir*(2./3.-.5)).rgb);vec3 y=x*.5+.25*(texture2D(tDiffuse,vUv+dir*-.5).rgb+texture2D(tDiffuse,vUv+dir*.5).rgb);float z=dot(y,l);rgb=(z<lo||z>hi)?x:y;}gl_FragColor=vec4(rgb,1.);
   #include <colorspace_fragment>
   }`;
   const material=mode==='msaa2'?new THREE.MeshBasicMaterial({map:target.texture,depthTest:false,depthWrite:false}):new THREE.ShaderMaterial({vertexShader:fxaa.vertexShader,fragmentShader:mode==='fxaa-light'?lightShader:fxaa.fragmentShader.replace('gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );','gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );\n#include <colorspace_fragment>'),uniforms:{tDiffuse:{value:target.texture},resolution:{value:new THREE.Vector2(1/size.x,1/size.y)}},depthTest:false,depthWrite:false});
   scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
   const render=renderer.render.bind(renderer);renderer.render=(s,c)=>{renderer.setRenderTarget(target);render(s,c);renderer.setRenderTarget(null);render(scene,camera);};
   window.__profileTarget=target;
  }
  const gl=v.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  window.__renderProfile={v,gl};
  return{bakedMeshes,bakedVertices,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),attributes:gl.getContextAttributes(),timerQuery:Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2')),samples:gl.getParameter(gl.SAMPLES),supportedSamples:[...gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA8,gl.SAMPLES)],pixels:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
 },{mode,fxaa:{vertexShader:FXAAShader.vertexShader,fragmentShader:FXAAShader.fragmentShader}});
 await page.evaluate(async()=>{const{v,gl}=__renderProfile;for(let i=0;i<12;i++){v.applyAtTime(i*.035);v.renderer.render(v.scene,v.camera);gl.finish();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));await new Promise(requestAnimationFrame);}});
 const timings=await page.evaluate(async()=>{
  const{v,gl}=__renderProfile,render=[],apply=[],intervals=[];
  const stats=a=>{const s=[...a].sort((a,b)=>a-b);return{count:s.length,median:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],mean:s.reduce((a,b)=>a+b,0)/s.length};};
  for(let i=0;i<32;i++){await new Promise(requestAnimationFrame);let t=performance.now();v.applyAtTime((i*.043)%3.8);apply.push(performance.now()-t);t=performance.now();v.renderer.render(v.scene,v.camera);gl.finish();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));render.push(performance.now()-t);}
  v.restart();v.togglePlay();await new Promise(resolve=>{let start,prior;function tick(t){start??=t;if(prior!==undefined)intervals.push(t-prior);prior=t;if(t-start<2600)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});v.togglePlay();v.cancelRenderWork();
  v.session.seek(1.7);v.applyAtTime(1.7);v.renderer.render(v.scene,v.camera);gl.finish();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
  return{completedRenderReadbackMs:stats(render),applyMs:stats(apply),rafMs:stats(intervals),calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,programs:v.renderer.info.programs.length};
 });
 if(!['empty','half-pixels','three-quarter-pixels','frozen-actor-upload'].includes(mode))await page.screenshot({path:`${out}/${mode}.png`});
 const sourceHashes=Object.fromEntries(await Promise.all(['three-d-world.js','three-d-playback.js','three-d-athletes.js'].map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
 const result={mode,sourceHashes,...setup,...timings,errors};results.push(result);console.log(JSON.stringify(result));
 await writeFile(`${out}/ablation.json`,JSON.stringify({base,viewport:[1440,900],method:'One isolated browser, fresh page per mode, paused fixed camera. Warm12 frames;32 RAF-paced completed-render+1px-readPixels samples with changing poses (includes readback overhead, not pure GPU time); then2600ms normal active playback callback cadence. Diagnosis-only ablations are not product changes.',results},null,2));
 await context.close();
}
await browser.close();
