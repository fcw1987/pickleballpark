import {COURT_LINES,COURT_DIMENSIONS} from './court-geometry.js';
import {boardToWorld,FEET_TO_METERS} from './three-d-core.js';
import {createDepthParkEnvironment} from './depth-park-environment.js';

/** Regulation geometry remains in metres. Artwork detail belongs to surfaces,
 * never to a reduced-resolution screen or altered court proportions. */
export function createReferenceWorld(THREE,{palette={}}={}){
 const group=new THREE.Group();group.name='ReferencePixelPark';
 const court=new THREE.Group();court.name='Court';group.add(court);
 const net=new THREE.Group();net.name='Net';court.add(net);
 const geometries=new Set(),materials=new Set(),textures=new Set();
 const mat=(color,extra={})=>{const m=new THREE.MeshLambertMaterial({color,...extra});materials.add(m);return m;};
 const mesh=(name,g,m,p=[0,0,0],parent=court)=>{geometries.add(g);const n=new THREE.Mesh(g,m);n.name=name;n.position.set(...p);parent.add(n);return n;};
 const w=20*FEET_TO_METERS,l=44*FEET_TO_METERS,k=7*FEET_TO_METERS;
 court.userData={width:w,length:l,kitchenDepth:k,dimensional:true};
 const apron=mat('#4d9d70'),blue=mat('#367f9e'),kitchen=mat('#408ba7'),cream=mat('#fff4dc'),ink=mat('#274753'),steel=mat('#b7d5ce');
 mesh('CourtApron',new THREE.BoxGeometry(w+2.4,.09,l+2.4),apron,[0,-.07,0]);
 mesh('CourtSlab',new THREE.BoxGeometry(w,.08,l),blue,[0,-.035,0]);
 const surface=mesh('AcrylicSurface',new THREE.PlaneGeometry(w,l),blue,[0,.008,0]);surface.rotation.x=-Math.PI/2;
 const nvz=mesh('KitchenSurface',new THREE.PlaneGeometry(w,2*k),kitchen,[0,.01,0]);nvz.rotation.x=-Math.PI/2;
 for(const line of COURT_LINES){const a=boardToWorld(line.from),b=boardToWorld(line.to),thickness=line.lineWidthFeet*FEET_TO_METERS;
  const n=mesh(line.name,new THREE.BoxGeometry(Math.abs(b.x-a.x)||thickness,.007,Math.abs(b.z-a.z)||thickness),cream,[(a.x+b.x)/2,.017,(a.z+b.z)/2]);n.userData.courtLine=line.name;
 }
 const sideHeight=36/12*FEET_TO_METERS,centerHeight=34/12*FEET_TO_METERS,half=w/2+FEET_TO_METERS,tapeRadius=.018;
 const topHeight=x=>centerHeight+(sideHeight-centerHeight)*Math.min(1,Math.abs(x)/(w/2))**2;
 const points=[];for(let i=0;i<=44;i++){const x=-half+i*half*2/44,h=topHeight(x)-2*tapeRadius;points.push(x,.035,0,x,h,0);}
 for(let j=0;j<=12;j++){const y=.035+j*(centerHeight-2*tapeRadius-.035)/12;points.push(-half,y,0,half,y,0);}
 const grid=new THREE.BufferGeometry();grid.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometries.add(grid);
 const gridMaterial=new THREE.LineBasicMaterial({color:'#243c4d',transparent:true,opacity:.9});materials.add(gridMaterial);
 const netMesh=new THREE.LineSegments(grid,gridMaterial);netMesh.name='NetMesh';net.add(netMesh);
 for(const x of[-half,half]){mesh('NetPost',new THREE.BoxGeometry(.09,sideHeight+.07,.09),ink,[x,(sideHeight+.07)/2,0],net);mesh('NetPostCap',new THREE.BoxGeometry(.12,.05,.12),steel,[x,sideHeight+.06,0],net);}
 // Parameterize the physical tape directly, avoiding spline overshoot at sidelines.
 const tape=new THREE.Curve();tape.getPoint=(t,target=new THREE.Vector3())=>{const x=-half+2*half*t;return target.set(x,topHeight(x)-tapeRadius,0);};tape.getPointAt=tape.getPoint;
 mesh('NetTopTape',new THREE.TubeGeometry(tape,176,tapeRadius,8,false),cream,[0,0,0],net);
 const environment=createDepthParkEnvironment(THREE,{palette});group.add(environment);
 let disposed=false;const dispose=()=>{if(disposed)return;disposed=true;environment.userData.dispose?.();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();group.clear();group.userData.disposed=true;};
 group.userData={referenceWorld:true,courtFeet:[20,44],kitchensFeet:7,netFeet:22,dispose,provenance:'Original detailed pixel surfaces and dimensional park with exact regulation geometry'};
 return{group,court,net,ready:environment.userData.ready,resources:{geometries,materials,textures},dispose,updateCamera:camera=>environment.userData.updateCamera?.(camera)};
}
