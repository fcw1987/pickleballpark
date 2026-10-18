import { COURT_LINES, COURT_DIMENSIONS } from './court-geometry.js';
import { boardToWorld, FEET_TO_METERS } from './three-d-core.js';

/**
 * Original sunny Pickleball Park neighborhood, authored in regulation metres.
 * No downloaded art, sprite billboards, or screen-space pixelation. The three
 * tiny acrylic maps below are deterministic, original clustered pigment.
 * Static ornament is merged by material; semantic court/net parts stay named.
 */
export function createDimensionalWorld(THREE, { palette = {} } = {}) {
    const colors = {
        court: '#376e73', kitchen: '#91ad94', line: '#fff5dc',
        apron: '#547d7a', terracotta: '#b77e62', clayShade: '#8d604f',
        stone: '#e4d7b9', stoneShade: '#c4b79a', metal: '#293e48',
        wood: '#a97550', woodLight: '#c89765', soil: '#57694d',
        grass: '#81ad62', leaf: '#4b985d', leafLight: '#8cba5d', leafShade: '#377b51',
        ...palette
    };
    const group = new THREE.Group(); group.name = 'DimensionalSportsGarden';
    const court = new THREE.Group(); court.name = 'Court'; group.add(court);
    const net = new THREE.Group(); net.name = 'Net'; court.add(net);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    const batches = new Map(), triangleBudget = {};
    let artCategory = 'court-trim';
    const width = COURT_DIMENSIONS.widthFeet * FEET_TO_METERS;
    const length = COURT_DIMENSIONS.lengthFeet * FEET_TO_METERS;
    const kitchenDepth = COURT_DIMENSIONS.kitchenDepthFeet * FEET_TO_METERS;
    court.userData = { width, length, kitchenDepth, dimensional: true };
    const material = (color, extra = {}) => {
        // Smooth diffuse lighting and painted vertex tones keep the village soft.
        const value = new THREE.MeshLambertMaterial({ color, flatShading: false, ...extra });
        materials.add(value); return value;
    };
    const m = {
        apron: material(colors.apron), clay: material(colors.terracotta),
        clayShade: material(colors.clayShade), stone: material(colors.stone),
        stoneShade: material(colors.stoneShade), metal: material(colors.metal),
        wood: material(colors.wood), woodLight: material(colors.woodLight),
        soil: material(colors.soil), grass: material(colors.grass),
        leaf: material(colors.leaf), leafLight: material(colors.leafLight), leafShade: material(colors.leafShade),
        line: material(colors.line),
        cream: material('#fff1d0'), plasterShade: material('#e5d0a7'),
        roof: material('#bd5d56'), roofLight: material('#df8370'),
        window: material('#b1dde4'), windowShade: material('#6da1b0'),
        petal: material('#fff4d1'), flower: material('#efaf74'),
        path: material('#d4bd89'), pathLight: material('#dfcc9c')
    };
    // Several rectangular pigment clusters per tile, only 2–3% contrast. These
    // are surface detail, never a display filter or competing high-frequency noise.
    const acrylic = (base, seed) => {
        const side = 64, data = new Uint8Array(side * side * 4), c = new THREE.Color(base);
        const srgb = c.getRGB({}, THREE.SRGBColorSpace);
        const rgb = [srgb.r, srgb.g, srgb.b].map(v => Math.round(v * 255));
        for (let p = 0; p < side * side; p++) data.set([...rgb, 255], p * 4);
        let state = seed >>> 0;
        const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
        for (let cluster = 0; cluster < 38; cluster++) {
            const x = Math.floor(random() * 61), y = Math.floor(random() * 62);
            const w = 1 + Math.floor(random() * 3), h = 1 + Math.floor(random() * 2);
            const delta = random() > .5 ? 5 : -4;
            for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
                const i = ((y + dy) * side + x + dx) * 4;
                data[i] = Math.max(0, Math.min(255, rgb[0] + delta));
                data[i + 1] = Math.max(0, Math.min(255, rgb[1] + delta));
                data[i + 2] = Math.max(0, Math.min(255, rgb[2] + delta));
            }
        }
        const texture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true; texture.needsUpdate = true;
        textures.add(texture); return texture;
    };
    // A seamless original wash: broad brushed patches with quiet leaf dashes.
    // Linear filtering deliberately avoids the old square/pixel lawn pattern.
    const turf = (() => {
        const side = 128, data = new Uint8Array(side * side * 4);
        const srgb = new THREE.Color(colors.grass).getRGB({}, THREE.SRGBColorSpace);
        const rgb = [srgb.r, srgb.g, srgb.b].map(v => Math.round(v * 255));
        for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
            const wash = Math.sin(x / side * Math.PI * 4 + Math.sin(y / side * Math.PI * 2)) * 2.8
                + Math.cos(y / side * Math.PI * 6) * 1.8;
            const i = (y * side + x) * 4;
            for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, rgb[c] + wash));
            data[i + 3] = 255;
        }
        let state = 731;
        const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
        for (let i = 0; i < 55; i++) {
            const x = Math.floor(random() * side), y = Math.floor(random() * side);
            for (let d = 0; d < 4; d++) {
                const index = (((y + d) % side) * side + (x + Math.floor(d / 2)) % side) * 4;
                for (let c = 0; c < 3; c++) data[index + c] = Math.min(255, data[index + c] + 6);
            }
        }
        const texture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat);
        texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(20, 20); texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
        textures.add(texture); return texture;
    })();
    m.grass.map = turf; m.grass.color.set('#ffffff');
    const mesh = (name, geometry, mat, x = 0, y = 0, z = 0, parent = group) => {
        geometries.add(geometry);
        const object = new THREE.Mesh(geometry, mat); object.name = name;
        object.position.set(x, y, z); object.castShadow = object.receiveShadow = true;
        parent.add(object); return object;
    };
    // Stage static ornaments by finish; final assembly merges their vertex paint.
    const stamp = (geometry, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
        const category=geometry.userData.artCategory||artCategory;
        triangleBudget[category]=(triangleBudget[category]||0)+(geometry.index?.count??geometry.attributes.position.count)/3;
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
        const expanded = geometry.index ? geometry.toNonIndexed() : geometry.clone();
        expanded.applyMatrix4(matrix);
        // Fixed spatial cells permit ordinary frustum culling in every camera.
        expanded.userData.zone = z < -9.5 ? 'FarVillage' : z > 9.5 ? 'Entrance'
            : x < -5.5 ? 'WestGarden' : x > 5.5 ? 'EastGarden' : 'CourtTrim';
        if (!batches.has(mat)) batches.set(mat, []);
        batches.get(mat).push(expanded); geometry.dispose();
    };
    const box = (mat, w, h, d, x, y, z, ry = 0) => stamp(new THREE.BoxGeometry(w, h, d), mat, x, y, z, 0, ry);
    const pole = (mat, a, b, radius, topRadius = radius) => {
        const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
        const g = new THREE.CylinderGeometry(topRadius, radius, delta.length(), radius < .026 ? 3 : radius < .08 ? 5 : 8, 1, true);
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
        g.applyQuaternion(rotation);
        const center = start.add(end).multiplyScalar(.5); stamp(g, mat, center.x, center.y, center.z);
    };

    // Walkable garden grade, terrace edges only 12cm tall. No toy-diorama pedestal.
    mesh('GardenGround', new THREE.PlaneGeometry(140, 140), m.grass, 0, -.145).rotation.x = -Math.PI / 2;
    mesh('CourtSurround', new THREE.BoxGeometry(10.8, .10, 18.8), m.clayShade, 0, -.09);
    mesh('CourtTerrace', new THREE.BoxGeometry(10.66, .025, 18.66), m.clay, 0, -.029);
    mesh('CourtApron', new THREE.BoxGeometry(9.64, .025, 17.62), m.apron, 0, -.014);
    // Acrylic service boxes and kitchens follow the same authoritative mapping
    // as the play solver. Surface origin remains exactly y=0 for feet and ball.
    const courtMap = acrylic(colors.court, 804); courtMap.repeat.set(3, 6);
    const courtMat = material('#ffffff', { map: courtMap });
    const kitchenMap = acrylic(colors.kitchen, 217); kitchenMap.repeat.set(3, 2);
    const kitchenMat = material('#ffffff', { map: kitchenMap });
    const slab = mesh('CourtSlab', new THREE.BoxGeometry(width, .12, length), m.apron, 0, -.061, 0, court);
    const surface = mesh('AcrylicSurface', new THREE.PlaneGeometry(width, length), courtMat, 0, 0, 0, court);
    surface.rotation.x = -Math.PI / 2;
    const kitchen = mesh('KitchenSurface', new THREE.PlaneGeometry(width, kitchenDepth * 2), kitchenMat, 0, .001, 0, court);
    kitchen.rotation.x = -Math.PI / 2;
    slab.userData.surfaceHeight = 0;
    const lineNames = ['GreenBaseline', 'OrangeBaseline', 'LeftSideline', 'RightSideline', 'GreenKitchenLine', 'OrangeKitchenLine', 'GreenCenterline', 'OrangeCenterline'];
    COURT_LINES.forEach((line, index) => {
        const a = boardToWorld(line.from), b = boardToWorld(line.to), thickness = line.lineWidthFeet * FEET_TO_METERS;
        const value = mesh(lineNames[index], new THREE.BoxGeometry(Math.abs(b.x - a.x) || thickness, .004, Math.abs(b.z - a.z) || thickness),
            m.line, (a.x + b.x) / 2, .004, (a.z + b.z) / 2, court);
        value.userData.courtLine = line;
    });

    // Fine real net, bowed tape and rigid 3in posts. Mesh openings are 14cm;
    // the single LineSegments grid stays legible without becoming a solid wall.
    const centerHeight = COURT_DIMENSIONS.netCenterHeightFeet * FEET_TO_METERS;
    const sideHeight = COURT_DIMENSIONS.netSidelineHeightFeet * FEET_TO_METERS;
    const netWidth = width + 2 * FEET_TO_METERS;
    net.userData = { centerHeight, sideHeight, width: netWidth };
    // Regulation heights describe the visible tape TOP at the court sidelines,
    // not the posts 1ft farther out. Continue that parabola to the posts.
    const heightAt = x => centerHeight + (sideHeight - centerHeight) * (2 * x / width) ** 2;
    const vertices = [], columns = 48, rows = 7;
    for (let i = 0; i <= columns; i++) {
        const x = -netWidth / 2 + netWidth * i / columns;
        vertices.push(x, .055, 0, x, heightAt(x) - .025, 0);
    }
    for (let j = 0; j <= rows; j++) for (let i = 0; i < columns; i++) {
        const a = -netWidth / 2 + netWidth * i / columns, b = a + netWidth / columns;
        vertices.push(a, .055 + (heightAt(a) - .08) * j / rows, 0, b, .055 + (heightAt(b) - .08) * j / rows, 0);
    }
    const grid = new THREE.BufferGeometry(); grid.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometries.add(grid);
    const gridMat = new THREE.LineBasicMaterial({ color: colors.metal, transparent: true, opacity: .58 }); materials.add(gridMat);
    const netMesh = new THREE.LineSegments(grid, gridMat); netMesh.name = 'NetMesh'; net.add(netMesh);
    // Explicit stations make the actual triangulated top exactly 34in / 36in.
    // A tube centered on those heights would add its radius to the net height.
    const stations = [...new Set(
        Array.from({ length: 49 }, (_, i) => -netWidth / 2 + netWidth * i / 48)
            .concat([-width / 2, 0, width / 2])
    )].sort((a, b) => a - b);
    const tapePositions = [], tapeDepth = .024, tapeHeight = .044;
    const quad = (a, b, c, d) => tapePositions.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < stations.length - 1; i++) {
        const a = stations[i], b = stations[i + 1], ya = heightAt(a), yb = heightAt(b), z = tapeDepth / 2;
        quad([a, ya, z], [b, yb, z], [b, yb, -z], [a, ya, -z]);
        quad([a, ya - tapeHeight, z], [b, yb - tapeHeight, z], [b, yb, z], [a, ya, z]);
        quad([b, yb - tapeHeight, -z], [a, ya - tapeHeight, -z], [a, ya, -z], [b, yb, -z]);
        quad([a, ya - tapeHeight, -z], [b, yb - tapeHeight, -z], [b, yb - tapeHeight, z], [a, ya - tapeHeight, z]);
    }
    for (const [x, direction] of [[stations[0], -1], [stations.at(-1), 1]]) {
        const top = heightAt(x), z = tapeDepth / 2;
        const corners = [[x, top - tapeHeight, -z], [x, top - tapeHeight, z], [x, top, z], [x, top, -z]];
        if (direction > 0) corners.reverse();
        quad(...corners);
    }
    const tapeGeometry = new THREE.BufferGeometry();
    tapeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tapePositions, 3));
    tapeGeometry.computeVertexNormals();
    mesh('NetTopTape', tapeGeometry, m.line, 0, 0, 0, net);
    for (const x of [-netWidth / 2, netWidth / 2]) {
        mesh('NetPost', new THREE.CylinderGeometry(.04, .044, sideHeight + .08, 8), m.metal, x, (sideHeight + .08) / 2, 0, net);
        box(m.stoneShade, .19, .025, .19, x, -.007, 0);
        box(m.line, .085, .038, .085, x, sideHeight + .055, 0);
        pole(m.metal, [x, .23, .035], [x, .23, .20], .012);
    }

    // Quiet running-bond path: sparse joints in the outer terracotta strip,
    // warm ivory perimeter coping, with clear runoffs around every baseline.
    for (const sign of [-1, 1]) {
        box(m.stone, .11, .055, 18.82, sign * 5.39, -.012, 0);
        box(m.stone, 10.88, .055, .11, 0, -.012, sign * 9.43);
        for (let i = -8; i <= 8; i++) box(m.clayShade, .44, .003, .018, sign * 5.05, -.014, i * 1.04);
        for (let i = -4; i <= 4; i++) box(m.clayShade, .018, .003, .44, i * 1.04, -.014, sign * 9.06);
    }

    artCategory = 'paths';
    // Every decorative solid remains beyond the 10.8 x 18.8m terrace.
    // These paths meet the terrace without narrowing either player's runoff.
    box(m.path, 36, .018, 1.65, 0, -.125, -10.5);
    box(m.path, 1.2, .018, 7.6, -.8, -.123, -13.4);
    for (const x of [-6.45, 6.45]) box(m.path, 1.25, .018, 24, x, -.125, 0);
    box(m.path, 19, .018, 1.35, 0, -.125, 10.7);
    box(m.path, 6.0, .018, 1.2, -10, -.123, -.2);
    // Broad inset strokes give the paths a brushed, sun-worn center.
    box(m.pathLight, 35, .006, .72, 0, -.113, -10.47);
    box(m.pathLight, .62, .006, 6, -.8, -.111, -13.4);
    for (const x of [-6.45, 6.45]) box(m.pathLight, .58, .006, 23.4, x, -.113, 0);

    // Deformed low-resolution spheres have smooth normals, asymmetrical lobes
    // and a hand-painted light/shadow wash, rather than stacked polygon cones.
    const crown = (rx, ry, rz, phase = 0, detail = false) => {
        const geometry = new THREE.SphereGeometry(1, detail ? 10 : 5, detail ? 5 : 3);
        const positions = geometry.attributes.position, paint = [];
        const light = new THREE.Color('#a6cb70'), shade = new THREE.Color('#39845a');
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
            const ripple = 1 + .045 * Math.sin(x * 6 + phase) * Math.cos(z * 5 + y * 3);
            positions.setXYZ(i, x * rx * ripple, y * ry * ripple, z * rz * ripple);
            const wash = THREE.MathUtils.clamp(.36 + y * .30 - x * .16 - z * .09
                + Math.sin(x * 9 + z * 7 + phase) * .045, 0, 1);
            const color = shade.clone().lerp(light, wash); paint.push(color.r, color.g, color.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(paint, 3));
        geometry.computeVertexNormals(); geometry.userData.artCategory=detail?'tree-canopies':'low-shrubs'; return geometry;
    };
    const paintedLeaf = material('#ffffff');
    const lens = (width, length, fold = .02, color = null, topOnly = false) => {
        const positions = [], paint = [], edge = [[0,0,length*.6],[width*.5,0,0],[0,0,-length*.5],[-width*.5,0,0]];
        if (fold === 0) {
            positions.push(...edge[0],...edge[1],...edge[2],...edge[0],...edge[2],...edge[3]);
            if(!topOnly)positions.push(...edge[2],...edge[1],...edge[0],...edge[3],...edge[2],...edge[0]);
        } else for (let i = 0; i < 4; i++) {
            positions.push(0,fold,0,...edge[i],...edge[(i+1)%4]);
            if (!topOnly) positions.push(0,-fold*.25,0,...edge[(i+1)%4],...edge[i]);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
        geometry.computeVertexNormals();
        if (color) {
            const bright = color.clone().lerp(new THREE.Color('#c0d98a'), .18);
            for (let i = 0; i < positions.length / 3; i++) { const c = i % 3 === 0 ? bright : color; paint.push(c.r,c.g,c.b); }
            geometry.setAttribute('color',new THREE.Float32BufferAttribute(paint,3));
        }
        geometry.userData.artCategory=color?'crown-leaves':'leaves-and-petals';
        return geometry;
    };
    // A separate static translucent batch uses native RGBA vertex colors to
    // fade grounding shadows smoothly, without image maps or a shadow pass.
    const contactMaterial = material('#ffffff', { vertexColors: true, transparent: true, opacity: 1, depthWrite: false });
    const contactWash = (x, z, rx, rz, opacity = .32) => {
        const positions = [], normals = [], paint = [], segments = 12;
        const ink = new THREE.Color('#2b4c42'), rings = [[0,opacity],[.48,opacity*.55],[1,0]];
        const vertex = (radius, angle, alpha) => {
            positions.push(Math.cos(angle)*rx*radius,0,Math.sin(angle)*rz*radius);
            normals.push(0,1,0); paint.push(ink.r,ink.g,ink.b,alpha);
        };
        for(let r=0;r<rings.length-1;r++) for(let i=0;i<segments;i++) {
            const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
            const [inner,ia]=rings[r],[outer,oa]=rings[r+1];
            vertex(inner,a,ia);vertex(outer,b,oa);vertex(outer,a,oa);
            if(inner>0){vertex(inner,a,ia);vertex(inner,b,ia);vertex(outer,b,oa);}
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(paint, 4));
        g.userData.artCategory='ground-shadows';
        stamp(g, contactMaterial, x, -.106, z);
    };
    const tree = (x, z, scale, phase) => {
        artCategory='tree-wood';
        contactWash(x + .65, z + .45, 1.9 * scale, 1.3 * scale);
        pole(m.wood, [x, -.12, z], [x + .12 * scale, 2.55 * scale, z], .16 * scale, .075 * scale);
        for (const [dx, dz] of [[-.62, .12], [.66, -.25], [.12, .65]])
            pole(m.woodLight, [x, 1.35 * scale, z], [x + dx * scale, 2.55 * scale, z + dz * scale], .08 * scale, .028 * scale);
        for (const [dx, dy, dz, radius] of [[-.63, 2.75, .08, .96], [.55, 2.82, -.2, 1.03], [.12, 3.36, .0, .94], [.08, 2.63, .65, .88], [-.45, 3.2, -.6, .78]]) {
            const cx=x+dx*scale, cy=dy*scale, cz=z+dz*scale;
            stamp(crown(radius * scale, radius * .79 * scale, radius * .87 * scale, phase + dx, true), paintedLeaf, cx, cy, cz);
            // Small folded leaf patches follow the rounded crown surface. Their
            // tonal paint and central vein bring a readable leafy scale to it.
            for (let i=0; i<5; i++) {
                const angle=i*2.399+phase+dx, ny=.22+(i%4)*.20, horizontal=Math.sqrt(1-ny*ny);
                const nx=Math.cos(angle)*horizontal, nz=Math.sin(angle)*horizontal;
                const direction=new THREE.Vector3(nx,ny/.79,nz/.87).normalize();
                const rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction));
                const wash=THREE.MathUtils.clamp(.43+ny*.3-nx*.16-nz*.09,0,1);
                const color=new THREE.Color('#39845a').lerp(new THREE.Color('#a6cb70'),wash);
                stamp(lens(.16*scale,.31*scale,.018*scale,color,true),paintedLeaf,
                    cx+nx*radius*scale*1.035,cy+ny*radius*.79*scale*1.035,cz+nz*radius*.87*scale*1.035,
                    rotation.x,rotation.y,rotation.z);
            }
        }
        for (let i = 0; i < 4; i++) {
            const a = phase + i * 1.9;
            stamp(crown(.28, .21, .37, a), paintedLeaf, x + Math.cos(a) * .45, .05, z + Math.sin(a) * .45);
        }
    };
    for (const [x, z, scale, phase] of [
        [-7.9, -8.9, 1.0, .2], [8.4, -11.2, 1.08, 1.0],
        [-7.9, 7.4, .96, 1.7], [8.7, 11.2, 1.06, .6],
        [-7.9, -3.4, .9, 2.1], [9.4, -13.0, .88, 1.3],
        [-6.5, -15.0, 1.13, 2.4], [5.8, -15.2, 1.05, .5],
        [-12.6, 5.9, 1.1, 1.5], [12.2, -10.9, 1.15, 2.0]
    ]) tree(x, z, scale, phase);

    // Pale capped rails frame a public garden. Clear gateways line up with paths.
    const fence = (ax, az, bx, bz, height = .72) => {
        artCategory='fences';
        const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz), steps = Math.ceil(length / 1.45);
        for (let i = 0; i <= steps; i++) {
            const x = ax + dx * i / steps, z = az + dz * i / steps;
            box(m.stone, .13, height, .13, x, height / 2 - .12, z);
            stamp(new THREE.SphereGeometry(.105, 5, 3), m.cream, x, height - .08, z);
        }
        for (const y of [.22, .50]) pole(m.stone, [ax, y, az], [bx, y, bz], .042);
    };
    fence(-8.8, -9.7, -1.8, -9.7, .66); fence(.4, -9.7, 8.8, -9.7, .66);
    fence(-9.0, -8.2, -9.0, -4.7); fence(-9.0, 1.8, -9.0, 9.4);
    fence(9.0, -8.2, 9.0, 9.4);

    // Cream cottages with generous colored eaves, inset glazing and timber trim.
    // Local +z is the entrance; the left cottage faces the court from beyond x=-8.
    const cottage = (x, z, rotation, width, depth, height, roofMaterial) => {
        artCategory='architecture';
        const point = (dx, dy, dz) => [x + dx * Math.cos(rotation) + dz * Math.sin(rotation), dy, z - dx * Math.sin(rotation) + dz * Math.cos(rotation)];
        const block = (mat, w, h, d, dx, dy, dz) => box(mat, w, h, d, ...point(dx, dy, dz), rotation);
        contactWash(x+.55,z+.50,rotation ? depth*.88 : width*.73,rotation ? width*.72 : depth*.94);
        block(m.stoneShade, width + .2, .20, depth + .2, 0, -.02, 0);
        block(m.cream, width, height, depth, 0, height / 2, 0);
        block(m.plasterShade, width + .08, .20, depth + .08, 0, .12, 0);
        for (const dx of [-width / 2 + .05, width / 2 - .05]) block(m.woodLight, .14, height, depth + .05, dx, height / 2, 0);
        const roof = new THREE.BufferGeometry(), w = width / 2 + .3, d = depth / 2 + .3, rise = .72;
        roof.setAttribute('position', new THREE.Float32BufferAttribute([
            -w,0,d,w,0,d,0,rise,d, -w,0,-d,0,rise,-d,w,0,-d,
            -w,0,-d,-w,0,d,0,rise,d, -w,0,-d,0,rise,d,0,rise,-d,
            w,0,d,w,0,-d,0,rise,-d, w,0,d,0,rise,-d,0,rise,d
        ], 3)); roof.computeVertexNormals();
        stamp(roof, roofMaterial, ...point(0, height + .05, 0), 0, rotation);
        block(roofMaterial, width + .64, .20, depth + .64, 0, height, 0);
        const roofHighlight=material(roofMaterial.color.clone().lerp(new THREE.Color('#f8dca8'),.20));
        const roofShade=material(roofMaterial.color.clone().multiplyScalar(.82));
        const roofLine=(mat,ax,ay,az,bx,by,bz,r)=>pole(mat,point(ax,ay,az),point(bx,by,bz),r);
        roofLine(roofHighlight,0,height+.83,-d,0,height+.83,d,.060);
        for (const side of [-1,1]) for(let i=1;i<=4;i++) {
            const tx=side*w*i/5, ty=height+.055+rise*(1-Math.abs(tx)/w);
            roofLine(roofHighlight,tx,ty+.016,-d,tx,ty+.016,d,.017);
            for(let j=0;j<4;j++) {
                const za=-d+(j+.3+(i%2)*.35)*d/2, near=side*w*(i-.70)/5;
                roofLine(roofShade,tx,ty+.020,za,near,height+.078+rise*(1-Math.abs(near)/w),za,.010);
            }
        }
        block(roofHighlight, width + .65, .055, .13, 0, height - .06, depth / 2 + .3);
        block(m.stone, width + .45, .07, .10, 0, height - .17, depth / 2 + .22);
        const front = depth / 2 + .025;
        block(m.petal,width-.30,.12,.025,0,height-.30,front+.04);
        block(m.wood, .85, 1.55, .10, -.70, .78, front);
        block(m.woodLight, .065, 1.54, .03, -.88, .80, front + .065);
        block(m.window, .13, 1.20, .025, -.51, .91, front + .065);
        stamp(new THREE.SphereGeometry(.055, 5, 3), m.stone, ...point(-.89, .76, front + .10));
        for (const wx of (width > 4.5 ? [-1.9, 1.2] : [.9])) {
            block(m.wood, 1.10, 1.14, .10, wx, 1.30, front + .015);
            block(m.windowShade, .95, .96, .04, wx, 1.31, front + .08);
            block(m.window, .82, .80, .025, wx - .035, 1.36, front + .11);
            block(m.petal, .035, .63, .012, wx-.29, 1.42, front+.132);
            block(m.petal, .35, .025, .014, wx-.17, 1.67, front+.132);
            block(m.stone, .045, .96, .04, wx, 1.31, front + .13);
            block(m.stone, .94, .045, .04, wx, 1.31, front + .13);
            block(m.woodLight, 1.20, .09, .24, wx, .74, front + .10);
        }
        block(m.stone, 1.16, .14, .52, -.70, -.02, front + .22);
        block(m.stone, .96, .10, .68, -.70, -.08, front + .43);
        // Side window remains readable in the normal wide builder view.
        block(m.wood, .10, .92, 1.12, width / 2 + .03, 1.32, -.15);
        block(m.window, .035, .76, .94, width / 2 + .10, 1.34, -.15);
        block(m.stone, .05, .80, .045, width / 2 + .13, 1.34, -.15);
        block(m.stone, .05, .045, .97, width / 2 + .13, 1.34, -.15);
        block(m.plasterShade, .43, .65, .46, width * .28, height + .56, -.4);
        block(m.stone, .55, .12, .58, width * .28, height + .89, -.4);
    };
    cottage(-.1, -13.45, 0, 5.6, 3.0, 2.12, m.roof);
    cottage(-11.15, -1.4, Math.PI / 2, 4.0, 3.0, 1.95, m.windowShade);

    // Slender pointed leaves and five-petal daisies make intentional planted beds.
    const leaf = (x, y, z, angle, size = .22) => {
        stamp(lens(.12,size*1.7,0), m.leaf, x, y+size*.48, z, -1.0, angle, -.40);
    };
    const flowerBed = (x, z, alongX, count, length) => {
        artCategory='flowers';
        contactWash(x+.15,z+.12,alongX ? length*.65 : .65,alongX ? .65 : length*.65);
        box(m.soil, alongX ? length : .63, .065, alongX ? .63 : length, x, -.09, z);
        box(m.stone, alongX ? length + .12 : .76, .065, alongX ? .10 : length + .12, x, -.06, z + (alongX ? .36 : 0));
        for (let i = 0; i < count; i++) {
            const offset = (i / Math.max(1, count - 1) - .5) * (length - .36);
            const px = x + (alongX ? offset : .12 * Math.sin(i * 2.7)), pz = z + (alongX ? .12 * Math.cos(i * 2.7) : offset);
            for (let j = 0; j < 3; j++) leaf(px + Math.sin(j * 2.1) * .12, -.03, pz + Math.cos(j * 2.1) * .12, j * 2.1 + i, .24);
            pole(m.leafShade, [px, -.05, pz], [px, .25, pz], .018);
            for (let j = 0; j < 5; j++) {
                const a = j / 5 * Math.PI * 2;
                stamp(lens(.14,.19,0,null,true), i % 4 === 0 ? m.flower : m.petal, px + Math.cos(a) * .075, .27, pz + Math.sin(a) * .075, 0, -a + Math.PI / 2);
            }
            stamp(new THREE.CircleGeometry(.045,5),m.flower,px,.30,pz,-Math.PI/2);
        }
    };
    flowerBed(2.0, -11.70, true, 7, 2.2);
    flowerBed(-2.0, -11.70, true, 4, 1.1);
    flowerBed(-7.35, 2.1, false, 12, 3.2);
    flowerBed(7.35, 2.4, false, 11, 3.0);
    flowerBed(-7.35, -6.6, false, 6, 1.8);
    flowerBed(7.35, -6.0, false, 7, 2.0);
    flowerBed(-8.8, .5, true, 6, 1.6);
    // Pointed ground leaves soften the path edges in small uneven clumps.
    for(const side of [-1,1]) for(let i=0;i<28;i++) {
        const z=-9.0+i*.70, x=side*(7.12+.06*Math.sin(i*2.3));
        for(let j=0;j<3;j++) stamp(lens(.10,.20+.05*Math.sin(i),0,null,true),m.leafLight,
            x+side*j*.065,-.085+j*.008,z+Math.sin(j*2.3)*.08,0,i+j*1.8,-.1);
    }
    // Leafy hedge rhythm across the village boundary, interrupted by the gateway.
    for (const [ax, bx] of [[-7.8, -2.2], [1.0, 7.7]]) for (let x = ax; x < bx; x += .65)
        stamp(crown(.43, .28, .38, x), paintedLeaf, x, .14, -10.22);

    // Original raised-letter paddle sign; no font, downloaded art or extra map.
    artCategory='sign';
    const sx = 4.5, sz = -11.0;
    for (const dx of [-.84, .84]) {
        box(m.wood, .13, 1.60, .13, sx + dx, .68, sz);
        stamp(new THREE.SphereGeometry(.10, 5, 3), m.stone, sx + dx, 1.52, sz);
    }
    box(m.stone, 1.98, 1.09, .16, sx, 1.04, sz);
    box(m.metal, 1.81, .90, .025, sx, 1.05, sz + .093);
    const glyphs = {
        P: [[0,0,0,1],[0,1,.65,1],[.65,1,.65,.54],[0,.54,.65,.54]],
        A: [[0,0,.32,1],[.32,1,.65,0],[.14,.43,.51,.43]],
        D: [[0,0,0,1],[0,1,.54,.87],[.54,.87,.65,.5],[.65,.5,.54,.13],[.54,.13,0,0]],
        L: [[0,1,0,0],[0,0,.65,0]],
        E: [[0,0,0,1],[0,1,.65,1],[0,.52,.53,.52],[0,0,.65,0]],
        R: [[0,0,0,1],[0,1,.65,1],[.65,1,.65,.54],[0,.54,.65,.54],[.30,.54,.65,0]],
        K: [[0,0,0,1],[0,.48,.65,1],[0,.48,.65,0]]
    };
    const lettering = (word, y, scale) => {
        const span = (word.length - 1) * .92 * scale + .65 * scale;
        for (let i = 0; i < word.length; i++) for (const [ax, ay, bx, by] of glyphs[word[i]])
            pole(m.petal, [sx - span / 2 + (i * .92 + ax) * scale, y + ay * scale, sz + .115],
                [sx - span / 2 + (i * .92 + bx) * scale, y + by * scale, sz + .115], .012);
    };
    lettering('PADDLE', 1.12, .235); lettering('PARK', .80, .21);
    // A paddle medallion above the sign is recognizable at the distant camera.
    const paddle = new THREE.SphereGeometry(1, 7, 4); paddle.scale(.24, .29, .055);
    stamp(paddle, m.roofLight, sx, 1.86, sz + .03, 0, 0, -.24);
    box(m.wood, .07, .25, .075, sx + .045, 1.58, sz + .03, 0);
    stamp(new THREE.SphereGeometry(.08, 5, 3), m.petal, sx + .35, 1.96, sz + .03);

    // Garden benches sit on the side promenade beyond the broad court runoff.
    const bench = (x, z, rotation) => {
        artCategory='benches';
        const point = (dx, dy, dz) => [x + dx * Math.cos(rotation) + dz * Math.sin(rotation), dy, z - dx * Math.sin(rotation) + dz * Math.cos(rotation)];
        const slat = (mat, w, h, d, dx, dy, dz) => box(mat, w, h, d, ...point(dx, dy, dz), rotation);
        for (const dx of [-.62, .62]) {
            slat(m.metal, .055, .44, .42, dx, .14, 0);
            slat(m.metal, .06, .65, .06, dx, .28, -.21);
            slat(m.metal, .32, .045, .06, dx, .54, -.09);
        }
        for (let i = 0; i < 4; i++) slat(i % 2 ? m.wood : m.woodLight, 1.65, .055, .095, 0, .40, -.16 + i * .11);
        for (let i = 0; i < 3; i++) slat(i % 2 ? m.woodLight : m.wood, 1.65, .09, .045, 0, .59 + i * .105, -.23);
        slat(m.stoneShade, 1.95, .025, .85, 0, -.115, 0);
    };
    bench(-6.3, 4.1, Math.PI / 2); bench(6.3, -3.6, -Math.PI / 2);

    // Weld only bit-identical complete vertices. Keeping normal and RGBA bits
    // in the key preserves hard edges, leaf paint, soft alpha and signed zero.
    // Indices retain the original triangle order; no quantization or geometry
    // simplification is involved.
    const staticIndexing = { before: 0, after: 0, attributeBitsVerified: true };
    const indexStaticGeometry = geometry => {
        const attributes=Object.entries(geometry.attributes);
        const bits=attributes.map(([,attribute])=>new Uint32Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.length));
        const unique=attributes.map(()=>[]),indices=[],vertices=new Map();
        const count=geometry.attributes.position.count;
        for(let i=0;i<count;i++) {
            let key='';
            for(let a=0;a<attributes.length;a++) {
                const size=attributes[a][1].itemSize;
                for(let c=0;c<size;c++)key+=`${bits[a][i*size+c]},`;
            }
            let vertex=vertices.get(key);
            if(vertex===undefined) {
                vertex=vertices.size;vertices.set(key,vertex);
                for(let a=0;a<attributes.length;a++) {
                    const attribute=attributes[a][1];
                    for(let c=0;c<attribute.itemSize;c++)unique[a].push(attribute.array[i*attribute.itemSize+c]);
                }
            }
            indices.push(vertex);
        }
        for(let a=0;a<attributes.length;a++) {
            const [name,attribute]=attributes[a];
            const replacement=new THREE.Float32BufferAttribute(unique[a],attribute.itemSize,attribute.normalized);
            // Verify that expanding the indexed attribute reproduces every bit
            // from the original, including normals and transparent alpha.
            const outputBits=new Uint32Array(replacement.array.buffer);
            for(let i=0;i<count;i++)for(let c=0;c<attribute.itemSize;c++) {
                if(outputBits[indices[i]*attribute.itemSize+c]!==bits[a][i*attribute.itemSize+c])
                    throw new Error(`Static world indexing changed ${name}.`);
            }
            geometry.setAttribute(name,replacement);
        }
        geometry.setIndex(indices);
        staticIndexing.before+=count;staticIndexing.after+=vertices.size;
        return geometry;
    };
    // Five opaque spatial cells and four shadow cells stay fixed in world
    // space. Ordinary frustum culling can omit distant village/entrance detail;
    // every camera sees the same authored geometry and resource identities.
    const finishBatch = (name, selected, targetMaterial, alpha = false) => {
        const positions=[],normals=[],paint=[];
        for(const [mat,parts] of selected) for(const part of parts) {
            const p=part.attributes.position,n=part.attributes.normal,c=part.attributes.color;
            for(let i=0;i<p.count;i++) {
                positions.push(p.getX(i),p.getY(i),p.getZ(i));
                normals.push(n.getX(i),n.getY(i),n.getZ(i));
                paint.push(mat.color.r*(c?c.getX(i):1),mat.color.g*(c?c.getY(i):1),mat.color.b*(c?c.getZ(i):1));
                if(alpha)paint.push(c?c.getW(i):1);
            }
            part.dispose();
        }
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
        geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
        geometry.setAttribute('color',new THREE.Float32BufferAttribute(paint,alpha?4:3));
        return mesh(name,indexStaticGeometry(geometry),targetMaterial);
    };
    const gardenMaterial=material('#ffffff',{vertexColors:true});
    for(const zone of ['CourtTrim','FarVillage','WestGarden','EastGarden','Entrance']) {
        const selected=[...batches].filter(([mat])=>mat!==contactMaterial)
            .map(([mat,parts])=>[mat,parts.filter(part=>part.userData.zone===zone)]).filter(([,parts])=>parts.length);
        if(selected.length)finishBatch(`Neighborhood${zone}`,selected,gardenMaterial);
        const shades=[...batches].filter(([mat])=>mat===contactMaterial)
            .map(([mat,parts])=>[mat,parts.filter(part=>part.userData.zone===zone)]).filter(([,parts])=>parts.length);
        if(shades.length){const contactMesh=finishBatch(`GardenGroundContact${zone}`,shades,contactMaterial,true);
            contactMesh.castShadow=false;contactMesh.renderOrder=1;}
    }
    const resources = { geometries, materials, textures };
    let disposed = false;
    const dispose = () => {
        if (disposed) return; disposed = true;
        geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
        group.clear(); group.userData.disposed = true;
    };
    group.userData = {
        dimensionalWorld: true, dispose, triangleBudget, staticIndexing,
        provenance: 'Original procedural geometry and hand-authored pigment clusters. No third-party art.',
        resources: { geometries: geometries.size, materials: materials.size, textures: textures.size },
        drawCalls: geometries.size,
        surfaceHeight: 0, courtUnits: 'metres', courtFeet: [20, 44],
        artDirection: 'Sunny human neighborhood; smooth painted broadleaf trees, cream cottages, colored eaves, capped garden fences and flower borders around a clear regulation court.'
    };
    return { group, court, net, resources, dispose };
}
