// Independent test geometry: source alpha -> atlas UV -> rendered triangle -> world.
// This factory is also executable in Node with supplied RGBA pixels (no GPU).
export function referenceAthleteGeometryKernel(THREE) {
 const imageCache=new WeakMap(),contourCache=new WeakMap(),uvCache=new WeakMap();
 // Inspect submitted triangles, never root/planned anchors. Welding coincident
 // positions makes closure independent of indexed/flat-shaded GPU layouts.
 const solidCache=new WeakMap();
 const componentCache=new WeakMap();
 function closedComponents(geometry){
  const a=geometry.attributes.position,index=geometry.index,old=componentCache.get(geometry);if(old&&old.position===a&&old.version===a.version)return old.components;
  const ids=new Map(),vertices=[],parents=[],triangles=[],find=i=>parents[i]===i?i:parents[i]=find(parents[i]);
  const vertex=i=>{const p=new THREE.Vector3().fromBufferAttribute(a,i),key=p.toArray().map(n=>Math.round(n*1e7)).join('/');if(!ids.has(key)){ids.set(key,vertices.length);parents.push(vertices.length);vertices.push(p);}return ids.get(key);};
  for(let i=0;i<(index?.count??a.count);i+=3){const tri=[0,1,2].map(j=>vertex(index?index.getX(i+j):i+j));if(new THREE.Triangle(...tri.map(i=>vertices[i])).getArea()<1e-14)continue;parents[find(tri[1])]=find(tri[0]);parents[find(tri[2])]=find(tri[0]);triangles.push(tri);}
  const groups=new Map();for(const tri of triangles){const key=find(tri[0]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(tri.map(i=>vertices[i]));}
  const components=[...groups.values()].map(triangles=>({triangles,bounds:new THREE.Box3().setFromPoints(triangles.flat())}));componentCache.set(geometry,{position:a,version:a.version,components});return components;
 }
 function containsPoint(mesh,world){
  const p=mesh.worldToLocal(world.clone()),ray=new THREE.Ray(p,new THREE.Vector3(1,.371,.529).normalize()),near=new THREE.Vector3();
  // Outline hulls have opposite winding from the colored body. Treat separate
  // closed shells as a union rather than canceling their signed volumes.
  for(const component of closedComponents(mesh.geometry)){
   if(!component.bounds.containsPoint(p))continue;const hits=new Set();
   for(const points of component.triangles){const triangle=new THREE.Triangle(...points);if(triangle.closestPointToPoint(p,near).distanceTo(p)<1e-8)return true;if(ray.intersectTriangle(...points,false,near))hits.add(Math.round(near.distanceTo(p)*1e7));}
   if(hits.size%2)return true;
  }return false;
 }
 function uniqueMeshPoints(mesh){const a=mesh.geometry.attributes.position,unique=new Map();for(let i=0;i<a.count;i++){const p=new THREE.Vector3().fromBufferAttribute(a,i),key=p.toArray().join('/');if(!unique.has(key))unique.set(key,p.applyMatrix4(mesh.matrixWorld));}return [...unique.values()];}
 // Narrow convex SAT audit for head components versus the paddle face/rim.
 // Independent of vertex containment: thin crossing slabs can intersect while
 // neither object has a single vertex inside the other.
 const convexCache=new WeakMap(),worldConvexCache=new WeakMap(),collisionTolerance=1e-6;
 function uniqueAxes(vectors){const result=[],keys=new Set();for(const vector of vectors){if(vector.lengthSq()<1e-14)continue;const axis=vector.clone().normalize();if(axis.x< -1e-8||(Math.abs(axis.x)<=1e-8&&(axis.y< -1e-8||(Math.abs(axis.y)<=1e-8&&axis.z<0))))axis.negate();const key=axis.toArray().map(n=>Math.round(n*1e6)).join('/');if(!keys.has(key)){keys.add(key);result.push(axis);}}return result;}
 function convexComponents(geometry){
  const source=closedComponents(geometry),old=convexCache.get(geometry);if(old?.source===source)return old.components;
  const components=source.map(component=>{
   const unique=new Map();for(const p of component.triangles.flat())unique.set(p.toArray().map(n=>Math.round(n*1e7)).join('/'),p);const vertices=[...unique.values()],center=vertices.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(vertices.length),normals=[],edges=[];let convex=true;
   for(const triangle of component.triangles){const [a,b,c]=triangle,n=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();if(n.dot(center.clone().sub(a))>0)n.negate();if(vertices.some(p=>n.dot(p.clone().sub(a))>5e-7))convex=false;normals.push(n);for(let i=0;i<3;i++)edges.push(triangle[(i+1)%3].clone().sub(triangle[i]));}
   return{vertices,normals:uniqueAxes(normals),edges:uniqueAxes(edges),convex};
  });convexCache.set(geometry,{source,components});return components;
 }
 function worldConvexComponents(mesh){
  mesh.updateWorldMatrix(true,false);const source=convexComponents(mesh.geometry),matrix=mesh.matrixWorld,old=worldConvexCache.get(mesh);if(old?.source===source&&old.matrix.every((n,i)=>n===matrix.elements[i]))return old.components;
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix),components=source.map(component=>{const vertices=component.vertices.map(p=>p.clone().applyMatrix4(matrix));return{...component,vertices,bounds:new THREE.Box3().setFromPoints(vertices),normals:component.normals.map(n=>n.clone().applyMatrix3(normalMatrix).normalize()),edges:component.edges.map(e=>e.clone().transformDirection(matrix))};});worldConvexCache.set(mesh,{source,matrix:matrix.elements.slice(),components});return components;
 }
 function convexMeshPair(first,second){
  const aa=worldConvexComponents(first),bb=worldConvexComponents(second);if([...aa,...bb].some(c=>!c.convex))return{convex:false,intersects:null,separatingAxis:null};let separatingAxis='bounds';
  for(const a of aa)for(const b of bb){
   if(!a.bounds.intersectsBox(b.bounds))continue;let separated=false;const axes=[...a.normals.map(axis=>({axis,type:'face'})),...b.normals.map(axis=>({axis,type:'face'})),...uniqueAxes(a.edges.flatMap(x=>b.edges.map(y=>new THREE.Vector3().crossVectors(x,y)))).map(axis=>({axis,type:'edge-cross'}))];
   for(const {axis,type}of axes){let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;for(const p of a.vertices){const n=p.dot(axis);amin=Math.min(amin,n);amax=Math.max(amax,n);}for(const p of b.vertices){const n=p.dot(axis);bmin=Math.min(bmin,n);bmax=Math.max(bmax,n);}if(amax<=bmin+collisionTolerance||bmax<=amin+collisionTolerance){separated=true;separatingAxis=type;break;}}
   if(!separated)return{convex:true,intersects:true,separatingAxis:null};
  }return{convex:true,intersects:false,separatingAxis};
 }
 function worldTriangles(mesh){
  worldConvexComponents(mesh);const record=worldConvexCache.get(mesh);if(!record.triangles)record.triangles=closedComponents(mesh.geometry).flatMap(c=>c.triangles.map(points=>{const world=points.map(p=>p.clone().applyMatrix4(mesh.matrixWorld));return{points:world,bounds:new THREE.Box3().setFromPoints(world)};}));return record.triangles;
 }
 function coplanarTriangles(a,b){
  const normal=new THREE.Triangle(...a).getNormal(new THREE.Vector3());if(b.some(p=>Math.abs(normal.dot(p.clone().sub(a[0])))>1e-8))return false;
  const drop=normal.toArray().map(Math.abs).indexOf(Math.max(...normal.toArray().map(Math.abs))),project=p=>p.toArray().filter((_,i)=>i!==drop),aa=a.map(project),bb=b.map(project),cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const inside=(p,t)=>{const signs=[0,1,2].map(i=>cross(t[i],t[(i+1)%3],p));return signs.every(n=>n>=-1e-10)||signs.every(n=>n<=1e-10);};if(aa.some(p=>inside(p,bb))||bb.some(p=>inside(p,aa)))return true;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){const p=aa[i],q=aa[(i+1)%3],r=bb[j],s=bb[(j+1)%3];if(Math.max(Math.min(p[0],q[0]),Math.min(r[0],s[0]))>Math.min(Math.max(p[0],q[0]),Math.max(r[0],s[0]))+1e-10||Math.max(Math.min(p[1],q[1]),Math.min(r[1],s[1]))>Math.min(Math.max(p[1],q[1]),Math.max(r[1],s[1]))+1e-10)continue;if(cross(p,q,r)*cross(p,q,s)<=1e-10&&cross(r,s,p)*cross(r,s,q)<=1e-10)return true;}return false;
 }
 function surfaceMeshPair(first,second){
  const aa=worldConvexComponents(first),bb=worldConvexComponents(second);if(!aa.some(a=>bb.some(b=>a.bounds.intersectsBox(b.bounds))))return false;
  if(uniqueMeshPoints(first).some(p=>containsPoint(second,p))||uniqueMeshPoints(second).some(p=>containsPoint(first,p)))return true;
  const ray=new THREE.Ray(),delta=new THREE.Vector3(),hit=new THREE.Vector3();
  const edgeHits=(a,b)=>{for(let i=0;i<3;i++){ray.origin.copy(a[i]);delta.subVectors(a[(i+1)%3],a[i]);const length=delta.length();if(length<1e-12)continue;ray.direction.copy(delta).divideScalar(length);if(ray.intersectTriangle(...b,false,hit)&&hit.distanceToSquared(ray.origin)<=(length+1e-8)**2)return true;}return false;};
  // Lofted pixel rings can be slightly concave at a chamfer diagonal. Rejecting
  // convex SAT there must trigger actual triangle/edge testing, never a pass.
  for(const a of worldTriangles(first))for(const b of worldTriangles(second)){if(!a.bounds.intersectsBox(b.bounds))continue;if(edgeHits(a.points,b.points)||edgeHits(b.points,a.points)||coplanarTriangles(a.points,b.points))return true;}return false;
 }
 function solidGeometry(geometry){
  const position=geometry.attributes.position,index=geometry.index,old=solidCache.get(geometry);
  if(old&&old.position===position&&old.version===position.version)return old.result;
  const edges=new Map(),vertices=new Set(),bounds=new THREE.Box3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let signedVolume=0,degenerate=0;
  const key=p=>p.toArray().map(n=>Math.round(n*1e7)).join('/');
  for(let i=0;i<(index?.count??position.count);i+=3){
   [a,b,c].forEach((p,j)=>p.fromBufferAttribute(position,index?index.getX(i+j):i+j));
   const keys=[a,b,c].map(key);[a,b,c].forEach(p=>bounds.expandByPoint(p));keys.forEach(k=>vertices.add(k));
   if(new THREE.Triangle(a,b,c).getArea()<1e-14){degenerate++;continue;}
   signedVolume+=a.dot(new THREE.Vector3().crossVectors(b,c))/6;
   for(let j=0;j<3;j++){const from=keys[j],to=keys[(j+1)%3],edge=from<to?`${from}|${to}`:`${to}|${from}`,state=edges.get(edge)||{count:0,balance:0};state.count++;state.balance+=from<to?1:-1;edges.set(edge,state);}
  }
  const result={closed:edges.size>0&&[...edges.values()].every(e=>e.count===2&&e.balance===0),volume:Math.abs(signedVolume),depth:bounds.max.z-bounds.min.z,width:bounds.max.x-bounds.min.x,height:bounds.max.y-bounds.min.y,degenerate,vertices:vertices.size};
  solidCache.set(geometry,{position,version:position.version,result});return result;
 }
 function pixelsFor(root,supplied){
  if(supplied)return supplied;
  const image=root.userData.body.material.map.image;
  if(!imageCache.has(image)){const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);imageCache.set(image,context.getImageData(0,0,canvas.width,canvas.height));}
  return imageCache.get(image);
 }
 function frameFor(body,pixels){const map=body.material.map;return{x:Math.round(map.offset.x*pixels.width),y:Math.round((1-map.offset.y-map.repeat.y)*pixels.height),width:Math.round(map.repeat.x*pixels.width),height:Math.round(map.repeat.y*pixels.height)};}
 function sourceContours(root,pixels){
  const body=root.userData.body,frame=frameFor(body,pixels),threshold=Math.max(1,Math.ceil((body.material.alphaTest||0)*255)),key=[pixels.width,pixels.height,frame.x,frame.y,frame.width,frame.height,threshold].join('/');
  let cache=contourCache.get(pixels);if(!cache){cache=new Map();contourCache.set(pixels,cache);}if(cache.has(key))return cache.get(key);
  const alpha=(x,y)=>x>=0&&x<frame.width&&y>=0&&y<frame.height?pixels.data[((frame.y+y)*pixels.width+frame.x+x)*4+3]:0,boundary=[],footPixels=[[],[]],bottom=[-1,-1];
  for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++)if(alpha(x,y)>=threshold){
   if(alpha(x-1,y)<threshold||alpha(x+1,y)<threshold||alpha(x,y-1)<threshold||alpha(x,y+1)<threshold)boundary.push({u:(x+.5)/frame.width,v:1-(y+.5)/frame.height});
   if(y>=frame.height*.7){const side=x<frame.width/2?0:1;if(y>bottom[side]){bottom[side]=y;footPixels[side]=[];}if(y===bottom[side])footPixels[side].push({u:(x+.5)/frame.width,v:1-(y+1)/frame.height});}
  }
  if(footPixels.some(points=>!points.length))throw Error('Missing painted shoe alpha; cannot substitute a root anchor');
  const result={frame,boundary,feet:footPixels};cache.set(key,result);return result;
 }
 function surfaceAtUV(mesh,point){
  const currentUV=mesh.geometry.attributes.uv;let record=uvCache.get(mesh.geometry);if(!record||record.uv!==currentUV||record.version!==currentUV.version){record={uv:currentUV,version:currentUV.version,map:new Map()};uvCache.set(mesh.geometry,record);}const cache=record.map,key=point.u+'/'+point.v;let entry=cache.get(key);
  const uv=mesh.geometry.attributes.uv,position=mesh.geometry.attributes.position,index=mesh.geometry.index,p=new THREE.Vector3(point.u,point.v,0),triangle=new THREE.Triangle(),weights=new THREE.Vector3();
  if(entry){const world=new THREE.Vector3();for(let c=0;c<3;c++)world.addScaledVector(new THREE.Vector3().fromBufferAttribute(position,entry.ids[c]),entry.weights[c]);return world.applyMatrix4(mesh.matrixWorld);}
  for(let i=0;i<(index?.count??position.count);i+=3){const ids=[0,1,2].map(c=>index?index.getX(i+c):i+c);for(let c=0;c<3;c++)[triangle.a,triangle.b,triangle.c][c].set(uv.getX(ids[c]),uv.getY(ids[c]),0);triangle.getBarycoord(p,weights);if(weights.x>=-1e-7&&weights.y>=-1e-7&&weights.z>=-1e-7){entry={ids,weights:weights.toArray()};cache.set(key,entry);const world=new THREE.Vector3();for(let c=0;c<3;c++)world.addScaledVector(new THREE.Vector3().fromBufferAttribute(position,ids[c]),weights.getComponent(c));return world.applyMatrix4(mesh.matrixWorld);}}
  throw Error(`Atlas UV ${point.u}/${point.v} has no rendered body triangle`);
 }
 function meshPoints(mesh){const a=mesh.geometry.attributes.position;return Array.from({length:a.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld));}
 function triangleDistance(mesh,point){
  if(!mesh?.geometry)throw Error('Missing actual solid paddle-face mesh');const a=mesh.geometry.attributes.position,index=mesh.geometry.index,triangle=new THREE.Triangle(),near=new THREE.Vector3();let distance=Infinity;
  for(let i=0;i<(index?.count??a.count);i+=3){for(const[c,target]of[[0,triangle.a],[1,triangle.b],[2,triangle.c]])target.fromBufferAttribute(a,index?index.getX(i+c):i+c).applyMatrix4(mesh.matrixWorld);triangle.closestPointToPoint(point,near);distance=Math.min(distance,near.distanceTo(point));}return distance;
 }
 return function audit(root,{pixels:supplied,camera,viewportHeight=1}={}){
  if(root.userData.volumetric){
   root.updateWorldMatrix(true,true);const d=root.userData,batch=d.bodyBatch,meshes=[];
   const visible=mesh=>{for(let p=mesh;p;p=p.parent)if(!p.visible)return false;return true;};
   root.traverse(mesh=>{if(mesh.isMesh&&visible(mesh)&&mesh.name!=='AthleteContactShadow')meshes.push(mesh);});
   const renderedPoints=source=>{
    const part=batch?.parts.find(part=>part.source===source);
    if(part){const a=batch.batch.geometry.attributes.position;return Array.from({length:part.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(a,part.start+i).applyMatrix4(batch.batch.matrixWorld));}
    if(!visible(source))throw Error('A hidden sole without rendered batch triangles cannot establish ground contact');
    return meshPoints(source);
   };
   const feet=['left','right'].map(side=>{
    const sole=d.legs?.[side]?.sole;if(!sole?.geometry)throw Error(`Missing actual ${side} solid shoe sole`);
    const local=sole.geometry.attributes.position,minimum=Math.min(...Array.from({length:local.count},(_,i)=>local.getY(i))),part=batch?.parts.find(part=>part.source===sole),index=sole.geometry.index,points=renderedPoints(sole);
    // Batched positions expand source indices; unbatched positions retain them.
    const unique=new Map();points.forEach((point,i)=>{const id=part&&index?index.getX(i):i;if(Math.abs(local.getY(id)-minimum)<1e-7){const key=[local.getX(id),local.getY(id),local.getZ(id)].join('/');if(!unique.has(key))unique.set(key,point);}});return [...unique.values()];
   });
   const batchError=()=>{
    if(!batch?.parts?.length||!visible(batch.batch))return Infinity;
    const attr=batch.batch.geometry.attributes.position,sourcePoint=new THREE.Vector3(),renderedPoint=new THREE.Vector3();let error=0;
    for(const part of batch.parts){const source=part.source.geometry.attributes.position,index=part.source.geometry.index;if(part.count!==(index?.count??source.count))return Infinity;
     for(let i=0;i<part.count;i++){sourcePoint.fromBufferAttribute(source,index?index.getX(i):i).applyMatrix4(part.source.matrixWorld);renderedPoint.fromBufferAttribute(attr,part.start+i).applyMatrix4(batch.batch.matrixWorld);error=Math.max(error,sourcePoint.distanceTo(renderedPoint));}}
    return error;
   };
   return{
    get vertices(){return meshes.flatMap(meshPoints);},
    shoeBottoms:feet.map(points=>Math.min(...points.map(p=>p.y))),
    paintedSoles:feet.map(points=>points.map(p=>p.toArray())),
    projectedSoleGroundOffsets:camera?feet.map(points=>points.map(p=>{const actual=p.clone().project(camera),ground=new THREE.Vector3(p.x,0,p.z).project(camera);return{worldY:p.y,pixelsBelowGround:(actual.y-ground.y)*-viewportHeight/2};})):null,
    artworkError:batchError,batchError,
    solids:[...(batch?.parts.map(p=>p.source)||[]),...meshes.filter(m=>m!==batch?.batch)].map(mesh=>({name:mesh.name,...solidGeometry(mesh.geometry)})),
    bodyDepth:solidGeometry(d.body.geometry).depth,
    get paddleHeadPenetrations(){
     const points=[d.paddleFaceWorld.clone(),...d.paddle.children.slice(0,2).flatMap(uniqueMeshPoints)],head=batch.parts.filter(part=>{for(let p=part.source;p;p=p.parent)if(p===d.head)return true;return false;});
     return head.map(part=>({name:part.source.name,points:points.filter(p=>containsPoint(part.source,p)).length})).filter(result=>result.points>0);
    },
    get armTorsoPenetrations(){return d.arms.map((arm,index)=>({arm:index,points:uniqueMeshPoints(arm.parts[1].outer).filter(p=>containsPoint(d.body,p)).length})).filter(result=>result.points>0);},
    convexMeshPair,surfaceMeshPair,
    get convexPaddleHead(){
     const intersections=[],nonConvex=[],exactFallbacks=[],head=batch.parts.filter(part=>{for(let p=part.source;p;p=p.parent)if(p===d.head)return true;return false;});
     for(const part of head)for(const paddle of d.paddle.children.slice(0,2)){const result=convexMeshPair(part.source,paddle),pair={head:part.source.name,paddle:paddle.name};if(!result.convex){nonConvex.push(pair);exactFallbacks.push(pair);if(surfaceMeshPair(part.source,paddle))intersections.push({...pair,method:'triangles'});}else if(result.intersects)intersections.push({...pair,method:'SAT'});}
     return{intersections,nonConvex,exactFallbacks};
    },
    paddleDistance:point=>triangleDistance(d.paddle.children[1],point)
   };
  }
  root.updateWorldMatrix(true,true);const d=root.userData,body=d.body,pixels=pixelsFor(root,supplied),source=sourceContours(root,pixels),feet=source.feet.map(points=>points.map(p=>surfaceAtUV(body,p))),meshes=[];
  root.traverse(m=>{if(m.isMesh&&m.visible&&m!==body&&m.name!=='AthleteContactShadow')meshes.push(m);});
  const artworkError=()=>{const p=body.geometry.attributes.position,uv=body.geometry.attributes.uv,base=d.baseVertices;let error=0;if(!base||base.length!==p.array.length||uv.count!==p.count)return Infinity;for(let i=0;i<p.count;i++){if(base[i*3+1]>-.19)for(let k=0;k<3;k++)error=Math.max(error,Math.abs(p.array[i*3+k]-base[i*3+k]));error=Math.max(error,Math.abs(uv.getX(i)-(base[i*3]+.5)),Math.abs(uv.getY(i)-(base[i*3+1]+.5)));}return error;};
  return {
   get vertices(){return [...source.boundary.map(p=>surfaceAtUV(body,p)),...meshes.flatMap(meshPoints)];},
   shoeBottoms:feet.map(points=>Math.min(...points.map(p=>p.y))),
   paintedSoles:feet.map(points=>points.map(p=>p.toArray())),sourceFrame:source.frame,
   projectedSoleGroundOffsets:camera?feet.map(points=>points.map(p=>{const actual=p.clone().project(camera),ground=new THREE.Vector3(p.x,0,p.z).project(camera);return{worldY:p.y,pixelsBelowGround:(actual.y-ground.y)*-viewportHeight/2};})):null,
   artworkError,
   // Compatibility API: reference art has no baked body batch. Audit its original
   // upper-body shape and UV registration, while old rigs retain batch/source checks.
   batchError:artworkError,
   paddleDistance:point=>triangleDistance(d.paddle.children[1],point)
  };
 };
}

// Minimal, deterministic decoding for this checked-in non-interlaced RGBA8 atlas.
// Tests use the original PNG bytes, without depending on browser/GPU decoding.
export async function readReferenceAtlasPixels(path) {
 const {readFile}=await import('node:fs/promises'),{inflateSync}=await import('node:zlib'),png=await readFile(path);
 if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG signature');
 let width,height,depth,type,interlace;const compressed=[];
 for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset),name=png.toString('ascii',offset+4,offset+8),chunk=png.subarray(offset+8,offset+8+length);if(name==='IHDR'){width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);depth=chunk[8];type=chunk[9];interlace=chunk[12];}if(name==='IDAT')compressed.push(chunk);offset+=length+12;}
 if(depth!==8||type!==6||interlace!==0)throw Error('Expected the source non-interlaced RGBA8 atlas');
 const raw=inflateSync(Buffer.concat(compressed)),stride=width*4,data=new Uint8Array(width*height*4),paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 if(raw.length!==(stride+1)*height)throw Error('Unexpected decoded PNG length');
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('Unknown PNG row filter');for(let x=0;x<stride;x++){const at=y*stride+x,a=x>=4?data[at-4]:0,b=y?data[at-stride]:0,c=y&&x>=4?data[at-stride-4]:0,predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];data[at]=(raw[y*(stride+1)+1+x]+predictor)&255;}}
 return{width,height,data};
}
