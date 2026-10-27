// Independent test geometry: source alpha -> atlas UV -> rendered triangle -> world.
// This factory is also executable in Node with supplied RGBA pixels (no GPU).
export function referenceAthleteGeometryKernel(THREE) {
 const imageCache=new WeakMap(),contourCache=new WeakMap(),uvCache=new WeakMap();
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
