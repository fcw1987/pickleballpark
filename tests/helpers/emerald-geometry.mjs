// Browser-side measurements from the GLB's deformed triangles. The verifier
// uses mesh vertices independently of the renderer's foot and paddle sockets.
export function emeraldGeometryKernel(THREE) {
    const v=()=>new THREE.Vector3();
    const sections=new WeakMap();
    function meshes(root) {
        if (!sections.has(root)) {
            const all=[];root.traverse(o=>{if(o.isSkinnedMesh)all.push(o)});
            const sole=all.find(o=>o.parent.name==='Court_shoes'&&o.material.name==='Rubber');
            const ids={FootL:[],FootR:[]};
            for (const name of Object.keys(ids)) {
                const geom=sole.geometry.attributes, bottom=[];
                let lowest=Infinity;
                for (let i=0;i<geom.position.count;i++) {
                    if(sole.skeleton.bones[geom.skinIndex.getX(i)].name!==name)continue;
                    lowest=Math.min(lowest,geom.position.getY(i));bottom.push(i);
                }
                const unique=new Map();
                for(const i of bottom) if(geom.position.getY(i)<=lowest+1e-5) {
                    const key=v().fromBufferAttribute(geom.position,i).toArray().map(x=>x.toFixed(6)).join(',');
                    unique.set(key,i);
                }
                ids[name]=[...unique.values()];
            }
            sections.set(root,{all,sole,ids,paddle:all.find(o=>o.parent.name==='Paddle'&&o.material.name==='Paddle')});
        }
        return sections.get(root);
    }
    const world=(mesh,i)=>mesh.getVertexPosition(i,v()).applyMatrix4(mesh.matrixWorld);
    return root=>{
        root.updateWorldMatrix(true,true);
        const {all,sole,ids,paddle}=meshes(root);
        const feet=Object.values(ids).map(indices=>indices.map(i=>world(sole,i).toArray()));
        return {
            get vertices(){
                return all.flatMap(mesh=>Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>world(mesh,i)));
            },
            shoeBottoms:feet.map(points=>Math.min(...points.map(p=>p[1]))),
            paintedSoles:feet,
            paddleDistance(ball) {
                const index=paddle.geometry.index, triangle=new THREE.Triangle();
                let result=Infinity;
                for(let i=0;i<index.count;i+=3){
                    triangle.set(...[0,1,2].map(j=>world(paddle,index.getX(i+j))));
                    result=Math.min(result,triangle.closestPointToPoint(ball,v()).distanceTo(ball));
                }
                return result;
            },
            rigidPaddleError() {
                const attr=paddle.geometry.attributes.position,origin=world(paddle,0),rest=v().fromBufferAttribute(attr,0);
                let error=0;
                for(let i=1;i<attr.count;i++) error=Math.max(error,Math.abs(origin.distanceTo(world(paddle,i))-rest.distanceTo(v().fromBufferAttribute(attr,i))));
                return error;
            }
        };
    };
}
