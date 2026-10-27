/** Original detailed park environment. Authored feet are converted to world metres. */
export function createDepthParkEnvironment(THREE,{palette={}}={}) {
 const group=new THREE.Group();group.name='ReferenceDepthPark';group.scale.setScalar(.3048);
 const geometries=new Set(),materials=new Set(),textures=new Set();
 const mat=(color,extra={})=>{const m=new THREE.MeshLambertMaterial({color,...extra});materials.add(m);return m;};
 const ink=mat('#294e49'),wood=mat('#805337'),woodLight=mat('#c89751'),silver=mat('#a4b9bc'),silverLight=mat('#e2e8d8'),silverDark=mat('#506c79'),cream=mat('#f6e8bc');
 const box=(name,x,y,z,w,h,d,m,parent=group)=>{const g=new THREE.BoxGeometry(w,h,d);geometries.add(g);const v=new THREE.Mesh(g,m);v.name=name;v.position.set(x,y,z);v.castShadow=true;v.receiveShadow=true;parent.add(v);return v;};
 function tileTexture(kind,size=128){
  const bytes=new Uint8Array(size*size*4);let seed=kind==='grass'?1967:kind==='sand'?783:394;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const fill=(x,y,w,h,c)=>{for(let yy=Math.max(0,y);yy<Math.min(size,y+h);yy++)for(let xx=Math.max(0,x);xx<Math.min(size,x+w);xx++){const n=(yy*size+xx)*4;bytes.set([...c,255],n);}};
  fill(0,0,size,size,kind==='grass'?[112,183,106]:kind==='sand'?[231,204,139]:kind==='roof'?[195,80,60]:kind==='wall'?[173,194,190]:[63,141,183]);
  if(kind==='grass')for(let i=0;i<220;i++){const x=Math.floor(rnd()*size),y=Math.floor(rnd()*size);const c=rnd()>.5?[98,169,96]:[127,193,112];fill(x,y,1,3,c);fill(x+1,y+2,3,1,c);}
  if(kind==='sand')for(let i=0;i<150;i++)fill(Math.floor(rnd()*size),Math.floor(rnd()*size),1+Math.floor(rnd()*3),1,rnd()>.5?[242,218,157]:[215,187,122]);
  if(kind==='roof')for(let y=0;y<size;y+=16)for(let x=0;x<size;x+=16){fill(x,y,15,2,[237,131,93]);fill(x,y+14,16,2,[157,60,47]);fill(x+14,y,2,16,[171,62,46]);fill(x+2,y+3,1,9,[222,112,77]);}
  if(kind==='wall')for(let y=0;y<size;y+=12){fill(0,y,size,2,[108,142,151]);fill(0,y+2,size,2,[207,216,200]);}
  if(kind==='water')for(let i=0;i<45;i++){const x=Math.floor(rnd()*size),y=Math.floor(rnd()*size);fill(x,y,8+Math.floor(rnd()*12),1,[101,184,215]);fill(x+6,y+1,4,1,[80,163,202]);}
  const t=new THREE.DataTexture(bytes,size,size);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;textures.add(t);return t;
 }
 const grass=tileTexture('grass');grass.repeat.set(10,10);const ground=mat('#ffffff',{map:grass});
 const grassBackdrop=tileTexture('grass');grassBackdrop.repeat.set(40,40);
 box('Continuing park grass',0,-.46,0,304,.4,312,mat('#ffffff',{map:grassBackdrop}));
 box('Moss park ground',0,-.22,0,76,.4,78,ground);
 const sand=tileTexture('sand');sand.repeat.set(1,6);const pathMat=mat('#ffffff',{map:sand}),verge=mat('#a1b068'),edge=mat('#d1b777');
 function path(x,z,w,d){box('Path grass verge',x,.015,z,w+.75,.13,d+.75,verge);box('Path sandy edge',x,.065,z,w+.25,.10,d+.25,edge);box('Warm sandy path',x,.12,z,w,.08,d,pathMat);}
 path(-19,0,4.5,78);path(19,0,4.5,78);path(0,29,76,4.5);path(0,-30,76,4.5);
 // Distinct rail geometry carries depth from every camera angle.
 function post(x,z){box('Fence post ink',x,1.65,z,.56,3.3,.56,silverDark);box('Fence post silver',x-.06,1.75,z-.06,.42,3.3,.42,silver);box('Fence post cap',x,3.42,z,.66,.20,.66,silverLight);box('Fence post highlight',x-.19,1.8,z+.22,.10,2.9,.07,silverLight);}
 function fence(x1,z1,x2,z2){const length=Math.hypot(x2-x1,z2-z1),count=Math.ceil(length/3.7);for(let n=0;n<=count;n++)post(x1+(x2-x1)*n/count,z1+(z2-z1)*n/count);for(const y of [1.1,2.35]){const beam=box('Continuous silver fence rail',(x1+x2)/2,y,(z1+z2)/2,length,.20,.24,silver);beam.rotation.y=-Math.atan2(z2-z1,x2-x1);const hi=box('Rail top glint',(x1+x2)/2,y+.12,(z1+z2)/2,length,.055,.25,silverLight);hi.rotation.y=beam.rotation.y;}}
 fence(-14,-26,14,-26);fence(-14,-26,-14,26);fence(14,-26,14,26);fence(-14,26,-3,26);fence(3,26,14,26);
 // Clubhouse built as an actual four-sided structure, including a gable roof.
 const house=new THREE.Group();house.name='PARK clubhouse';house.position.set(27,0,-23);group.add(house);
 const siding=tileTexture('wall');siding.repeat.set(2,1);const wall=mat('#ffffff',{map:siding}),roofTexture=tileTexture('roof');roofTexture.repeat.set(3,2);const roof=mat('#ffffff',{map:roofTexture}),trim=mat('#455e6b'),red=mat('#af5544'),glass=mat('#4d98c1');
 box('Clubhouse foundation',0,.25,0,13,.5,11,trim,house);box('Sided clubhouse',0,3.7,0,12,7,10,wall,house);
 // One closed triangular roof volume: the tile slopes, gable ends and
 // underside share exact vertices, so no floating ridge/eave trim is needed.
 const roofHalfDepth=5.9,roofEave=7.05,roofRidge=10.05,roofHalfWidth=7;
 const roofSection=new THREE.Shape();roofSection.moveTo(-roofHalfDepth,roofEave);roofSection.lineTo(0,roofRidge);roofSection.lineTo(roofHalfDepth,roofEave);roofSection.closePath();
 const roofBodyGeometry=new THREE.ExtrudeGeometry(roofSection,{depth:roofHalfWidth*2,bevelEnabled:false});geometries.add(roofBodyGeometry);
 const roofBody=new THREE.Mesh(roofBodyGeometry,red);roofBody.name='Closed terracotta gable roof';roofBody.rotation.y=Math.PI/2;roofBody.position.x=-roofHalfWidth;roofBody.castShadow=true;roofBody.receiveShadow=true;house.add(roofBody);
 const roofAngle=Math.atan2(roofRidge-roofEave,roofHalfDepth),roofSlopeLength=Math.hypot(roofHalfDepth,roofRidge-roofEave);
 for(const side of [-1,1]){const slope=box('Terracotta tile roof slope',0,(roofEave+roofRidge)/2+.025,side*roofHalfDepth/2,roofHalfWidth*2,.12,roofSlopeLength,roof,house);slope.rotation.x=side*roofAngle;}
 box('Attached terracotta ridge cap',0,roofRidge+.035,0,14,.16,.24,red,house);
 for(const side of [-1,1])box('Attached roof eave fascia',0,roofEave,side*roofHalfDepth,14,.18,.16,red,house);
 for(const side of [-1,1])for(const x of [-3.9,3.9]){box('Window deep frame',x,3.65,side*5.08,2.6,2.9,.22,trim,house);box('Blue window glass',x,3.8,side*5.23,2.1,2.3,.12,glass,house);box('Window vertical mullion',x,3.8,side*5.31,.12,2.35,.10,cream,house);box('Window horizontal mullion',x,3.8,side*5.32,2.2,.10,.10,cream,house);box('Window sill',x,2.2,side*5.3,2.9,.26,.55,silverLight,house);}
 box('Door ink frame',0,2.6,5.12,2.9,5.2,.25,trim,house);box('Door red wood',0,2.5,5.30,2.3,4.8,.15,red,house);for(const y of [1.4,3.45])box('Door panel',0,y,5.42,1.8,1.5,.10,mat('#c97955'),house);box('Brass handle',.76,2.4,5.54,.12,.32,.12,cream,house);
 function sign(){const c=document.createElement('canvas');c.width=256;c.height=80;const a=c.getContext('2d');a.fillStyle='#41596a';a.fillRect(0,0,256,80);a.fillStyle='#f4e8bf';a.fillRect(5,5,246,70);a.fillStyle='#273b51';a.font='bold 50px monospace';a.textAlign='center';a.textBaseline='middle';a.fillText('PARK',128,43);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.add(t);return mat('#ffffff',{map:t});}
 box('PARK sign',0,6.3,5.6,5.5,1.75,.25,sign(),house);
 // Bank rim, clay shoreline and water surface are separate levels.
 const pond=new THREE.Shape();pond.moveTo(-4,-8);pond.quadraticCurveTo(-7,-8,-7,-4);pond.lineTo(-7,5);pond.quadraticCurveTo(-7,8,-3,8);pond.lineTo(3,8);pond.quadraticCurveTo(6,8,6,4);pond.lineTo(6,-4);pond.quadraticCurveTo(6,-8,2,-8);pond.closePath();
 const pondGroup=new THREE.Group();pondGroup.position.set(-28,.14,-4);group.add(pondGroup);
 for(const [scale,y,color] of [[1.10,0,'#8d8052'],[1.03,.035,'#b39059'],[.96,.07,'#34759b']]){const g=new THREE.ShapeGeometry(pond,32);geometries.add(g);const mesh=new THREE.Mesh(g,mat(color));mesh.rotation.x=-Math.PI/2;mesh.scale.setScalar(scale);mesh.position.y=y;pondGroup.add(mesh);}
 const waterMap=tileTexture('water');const wg=new THREE.ShapeGeometry(pond,32);geometries.add(wg);const water=new THREE.Mesh(wg,mat('#ffffff',{map:waterMap}));water.rotation.x=-Math.PI/2;water.scale.setScalar(.91);water.position.y=.11;pondGroup.add(water);
 function bench(x,z,rotation=0){const b=new THREE.Group();b.position.set(x,0,z);b.rotation.y=rotation;group.add(b);for(const xx of [-1.4,1.4])for(const zz of [-.6,.6])box('Bench iron leg',xx,.7,zz,.16,1.4,.16,trim,b);for(const zz of [-.55,0,.55])box('Bench golden seat slat',0,1.4,zz,3.6,.2,.45,woodLight,b);for(const yy of [2,2.55])box('Bench back slat',0,yy,-.72,3.6,.44,.16,woodLight,b);for(const xx of [-1.45,1.45])box('Bench back support',xx,2,-.74,.16,1.7,.18,wood,b);}
 bench(-24,14,-.3);bench(25,13,.3);
 // Flowers use small petal clusters and leaves, rather than generic spheres.
 const petalColors=['#f7cc62','#f27c47','#f7f1c7'];
 function flowers(x,z,seed=0){for(let n=0;n<5;n++){const dx=Math.sin(n*2.4+seed)*.9,dz=Math.cos(n*2.4+seed)*.7,h=.7+(n%3)*.25;box('Flower stem',x+dx,h/2,z+dz,.075,h,.075,ink);box('Flower leaves',x+dx,.25,z+dz,.48,.14,.24,mat('#43894e'));const m=mat(petalColors[(n+seed)%3]);for(const [px,pz] of [[-.14,0],[.14,0],[0,-.14],[0,.14]])box('Flower petal',x+dx+px,h,z+dz+pz,.22,.15,.22,m);box('Flower center',x+dx,h+.08,z+dz,.15,.1,.15,cream);}}
 for(const [x,z,n] of [[-11,-19,0],[-11,2,1],[-11,20,2],[11,-19,1],[11,19,0],[25,-15,2],[32,-14,0],[-25,24,1],[29,22,0]])flowers(x,z,n);
 let resolveTree,rejectTree;const ready=new Promise((resolve,reject)=>{resolveTree=resolve;rejectTree=reject;});
 const treeTexture=new THREE.TextureLoader().load(new URL('./assets/reference-depth/park-tree-v1.png',import.meta.url).href,resolveTree,undefined,rejectTree);treeTexture.colorSpace=THREE.SRGBColorSpace;treeTexture.magFilter=THREE.NearestFilter;treeTexture.minFilter=THREE.LinearMipmapLinearFilter;textures.add(treeTexture);
 const treeMat=new THREE.SpriteMaterial({map:treeTexture,transparent:true,alphaTest:.12,toneMapped:false});materials.add(treeMat);
 function tree(x,z,size=11){const sprite=new THREE.Sprite(treeMat);sprite.name='Detailed scalloped tree';sprite.center.set(.5,.045);sprite.position.set(x,.06,z);sprite.scale.set(size*(1283/1226),size,1);group.add(sprite);const shadowGeometry=new THREE.CircleGeometry(size*.34,24);geometries.add(shadowGeometry);const shadowMat=new THREE.MeshBasicMaterial({color:'#244c3d',transparent:true,opacity:.21,depthWrite:false});materials.add(shadowMat);const shadow=new THREE.Mesh(shadowGeometry,shadowMat);shadow.rotation.x=-Math.PI/2;shadow.position.set(x,.05,z);group.add(shadow);}
 for(let i=0;i<6;i++){tree(-26,-31+i*11,10.6+(i%2)*.8);if(i>2)tree(28,-31+i*11,10+(i%2)*1.1);}
 for(let i=0;i<5;i++)tree(-25+i*11,-36,10.4+(i%2));
 for(const [x,z] of [[-34,30],[-23,35],[31,33],[36,4]])tree(x,z,8);
 group.userData.ready=ready;
 group.userData.updateCamera=()=>{}; // THREE.Sprite uses camera-facing quads at every azimuth and tilt.
 group.userData.dispose=()=>{geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());};
 group.userData.art={units:'feet scaled .3048 to metres',generatedFoliage:'assets/reference-depth/park-tree-v1.png',originalGeometry:true};
 return group;
}
