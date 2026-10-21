// Audit the rendered triangles, independently of authored contact metadata.
export async function installDimensionalAudit(page) {
  await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    window.__athleteAudit = root => {
      root.updateWorldMatrix(true, true);
      const meshes = [];
      root.traverse(mesh => { if (mesh.isMesh && mesh.visible && mesh.name !== 'AthleteContactShadow') meshes.push(mesh); });
      const points = mesh => {
        const attr = mesh.geometry.attributes.position, result = [];
        for (let i = 0; i < attr.count; i++) result.push(new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(mesh.matrixWorld));
        return result;
      };
      const face = root.getObjectByName('PaddleFace');
      const body = root.userData.bodyBatch;
      const shoeBottom = name => {
        const part = body?.parts.find(part => part.source.name === name);
        if (!part) return Math.min(...points(root.getObjectByName(name)).map(p => p.y));
        const attr = body.batch.geometry.attributes.position;
        let bottom = Infinity;
        for (let i = part.start; i < part.start + part.count; i++) {
          bottom = Math.min(bottom, new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(body.batch.matrixWorld).y);
        }
        return bottom;
      };
      return {
        get vertices() { return meshes.flatMap(points); },
        shoeBottoms: ['LeftSneaker', 'RightSneaker'].map(shoeBottom),
        batchError() {
          if (!body) return Infinity;
          const attr = body.batch.geometry.attributes.position;
          const sourcePoint = new THREE.Vector3(), renderedPoint = new THREE.Vector3();
          let error = 0;
          for (const part of body.parts) {
            const geometry = part.source.geometry, source = geometry.attributes.position, index = geometry.index;
            for (let i = 0; i < part.count; i++) {
              sourcePoint.fromBufferAttribute(source, index ? index.getX(i) : i).applyMatrix4(part.source.matrixWorld);
              renderedPoint.fromBufferAttribute(attr, part.start + i).applyMatrix4(body.batch.matrixWorld);
              error = Math.max(error, sourcePoint.distanceTo(renderedPoint));
            }
          }
          return error;
        },
        paddleDistance(ball) {
          const attr = face.geometry.attributes.position, index = face.geometry.index;
          const triangle = new THREE.Triangle(), nearest = new THREE.Vector3();
          let distance = Infinity;
          for (let i = 0; i < (index?.count ?? attr.count); i += 3) {
            for (const [corner, target] of [[0, triangle.a], [1, triangle.b], [2, triangle.c]]) {
              target.fromBufferAttribute(attr, index ? index.getX(i + corner) : i + corner).applyMatrix4(face.matrixWorld);
            }
            triangle.closestPointToPoint(ball, nearest);
            distance = Math.min(distance, nearest.distanceTo(ball));
          }
          return distance;
        }
      };
    };
  });
}
