import { COURT_LINES, COURT_DIMENSIONS } from './court-geometry.js';
import { boardToWorld, FEET_TO_METERS } from './three-d-core.js';

/**
 * Original Pickleball Park sports garden, authored in metres from regulation feet.
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
        grass: '#719b6a', leaf: '#5f946b', leafLight: '#86ae70', leafShade: '#456e55',
        ...palette
    };
    const group = new THREE.Group(); group.name = 'DimensionalSportsGarden';
    const court = new THREE.Group(); court.name = 'Court'; group.add(court);
    const net = new THREE.Group(); net.name = 'Net'; court.add(net);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    const batches = new Map();
    const width = COURT_DIMENSIONS.widthFeet * FEET_TO_METERS;
    const length = COURT_DIMENSIONS.lengthFeet * FEET_TO_METERS;
    const kitchenDepth = COURT_DIMENSIONS.kitchenDepthFeet * FEET_TO_METERS;
    court.userData = { width, length, kitchenDepth, dimensional: true };
    const material = (color, extra = {}) => {
        const value = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, ...extra });
        materials.add(value); return value;
    };
    const m = {
        apron: material(colors.apron), clay: material(colors.terracotta),
        clayShade: material(colors.clayShade), stone: material(colors.stone),
        stoneShade: material(colors.stoneShade), metal: material(colors.metal),
        wood: material(colors.wood), woodLight: material(colors.woodLight),
        soil: material(colors.soil), grass: material(colors.grass),
        leaf: material(colors.leaf), leafLight: material(colors.leafLight), leafShade: material(colors.leafShade),
        line: material(colors.line)
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
    // A second scale of authored clusters anchors the plaza in a quiet lawn.
    // These broad stepped patches have deliberately far less contrast than
    // court markings. Sparse L-shaped flecks suggest cut turf, never white noise.
    const turf = (() => {
        const side = 96, data = new Uint8Array(side * side * 4);
        const srgb = new THREE.Color(colors.grass).getRGB({}, THREE.SRGBColorSpace);
        const rgb = [srgb.r, srgb.g, srgb.b].map(v => Math.round(v * 255));
        for (let p = 0; p < side * side; p++) data.set([...rgb, 255], p * 4);
        let state = 731;
        const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
        for (let patch = 0; patch < 32; patch++) {
            const x = Math.floor(random() * side), y = Math.floor(random() * side);
            const w = 3 + Math.floor(random() * 6), h = 2 + Math.floor(random() * 3);
            const delta = patch % 3 === 0 ? 5 : -3;
            for (let dy = 0; dy < h + 2; dy++) for (let dx = 0; dx < w; dx++) {
                if (dy >= h && dx > Math.floor(w * .4)) continue;
                const offset = (((y + dy) % side) * side + (x + dx) % side) * 4;
                for (let channel = 0; channel < 3; channel++) data[offset + channel] = Math.max(0, Math.min(255, rgb[channel] + delta));
            }
        }
        const texture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat);
        texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(26, 26); texture.magFilter = THREE.NearestFilter;
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
    // Batch all static furniture and foliage by material (one draw per finish).
    const stamp = (geometry, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
        const expanded = geometry.index ? geometry.toNonIndexed() : geometry.clone();
        expanded.applyMatrix4(matrix);
        if (!batches.has(mat)) batches.set(mat, []);
        batches.get(mat).push(expanded); geometry.dispose();
    };
    const box = (mat, w, h, d, x, y, z, ry = 0) => stamp(new THREE.BoxGeometry(w, h, d), mat, x, y, z, 0, ry);
    const pole = (mat, a, b, radius, topRadius = radius) => {
        const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
        const g = new THREE.CylinderGeometry(topRadius, radius, delta.length(), 7);
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

    // Asymmetric angular broadleaf crowns, visibly supported by forked trunks.
    // Each crown is a hand-shaped seven-sided volume with irregular shoulders.
    const canopy = (radius, height, phase) => {
        const points = [], segments = 7, rings = [[.40, 0], [.96, .18], [1, .49], [.72, .82], [.25, 1]];
        const ringPoint = (ring, i) => {
            const angle = phase + i * Math.PI * 2 / segments;
            const irregular = 1 + .09 * Math.sin(i * 2.7 + phase);
            return [Math.cos(angle) * radius * rings[ring][0] * irregular,
                height * rings[ring][1], Math.sin(angle) * radius * rings[ring][0] * irregular * .86];
        };
        for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < segments; i++) {
            const a = ringPoint(r, i), b = ringPoint(r, (i + 1) % segments), c = ringPoint(r + 1, i), d = ringPoint(r + 1, (i + 1) % segments);
            points.push(...a, ...c, ...b, ...b, ...c, ...d);
        }
        for (let i = 0; i < segments; i++) {
            points.push(0, height, 0, ...ringPoint(rings.length - 1, (i + 1) % segments), ...ringPoint(rings.length - 1, i));
            points.push(0, 0, 0, ...ringPoint(0, i), ...ringPoint(0, (i + 1) % segments));
        }
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.computeVertexNormals(); return geometry;
    };
    const tree = (x, z, scale, phase) => {
        box(m.soil, 1.75, .04, 1.58, x, -.1, z);
        box(m.stoneShade, 1.88, .10, .10, x, -.075, z - .84);
        box(m.stone, 1.88, .10, .10, x, -.075, z + .84);
        box(m.stone, .10, .10, 1.58, x - .89, -.075, z);
        box(m.stoneShade, .10, .10, 1.58, x + .89, -.075, z);
        pole(m.wood, [x, -.09, z], [x + .06, 2.2 * scale, z - .07], .115 * scale, .055 * scale);
        pole(m.woodLight, [x, 1.1 * scale, z], [x - .5 * scale, 2.15 * scale, z + .08], .065 * scale, .028 * scale);
        pole(m.wood, [x + .02, 1.45 * scale, z], [x + .52 * scale, 2.32 * scale, z - .12], .058 * scale, .025 * scale);
        stamp(canopy(1.02 * scale, 1.10 * scale, phase), m.leafShade, x - .30 * scale, 1.60 * scale, z + .07);
        stamp(canopy(.96 * scale, 1.08 * scale, phase + .22), m.leaf, x + .31 * scale, 1.94 * scale, z - .10);
        stamp(canopy(.78 * scale, .94 * scale, phase + .43), m.leafLight, x - .07 * scale, 2.43 * scale, z - .04);
        for (const [dx, dz, size] of [[-.50, .36, .29], [.55, .32, .24], [-.25, -.46, .23]])
            stamp(canopy(size, size * .8, phase), m.leafShade, x + dx, -.06, z + dz);
    };
    tree(-6.55, -8.3, 1.02, .35); tree(6.55, -8.55, .86, .8);
    tree(-6.55, 8.35, .88, 1.4); tree(6.55, 8.55, 1.0, .1);

    // Two proper slatted garden benches, each 1.65m wide, facing the court.
    const bench = (x, z, rotation) => {
        const point = (dx, dy, dz) => [x + dx * Math.cos(rotation) + dz * Math.sin(rotation), dy, z - dx * Math.sin(rotation) + dz * Math.cos(rotation)];
        const slat = (mat, w, h, d, dx, dy, dz) => { const p = point(dx, dy, dz); box(mat, w, h, d, ...p, rotation); };
        for (const dx of [-.62, .62]) {
            slat(m.metal, .055, .44, .42, dx, .14, 0);
            slat(m.metal, .06, .65, .06, dx, .28, -.21);
            slat(m.metal, .32, .045, .06, dx, .54, -.09);
        }
        for (let i = 0; i < 4; i++) slat(i % 2 ? m.wood : m.woodLight, 1.65, .055, .095, 0, .40, -.16 + i * .11);
        for (let i = 0; i < 3; i++) slat(i % 2 ? m.woodLight : m.wood, 1.65, .09, .045, 0, .59 + i * .105, -.23);
        slat(m.stoneShade, 1.95, .025, .85, 0, -.115, 0);
    };
    bench(-5.98, -3.6, Math.PI / 2); bench(5.98, 3.6, -Math.PI / 2);
    // Low shrubs mark plaza corners without hiding feet or approaching balls.
    for (const [x, z, phase] of [[-6.1, 1.7, .3], [6.1, -1.7, 1.1]]) {
        box(m.stoneShade, .92, .18, 1.74, x, -.06, z);
        box(m.soil, .80, .02, 1.62, x, .035, z);
        for (let i = 0; i < 3; i++) stamp(canopy(.48, .48, phase + i), i % 2 ? m.leafLight : m.leaf, x, .04, z + (i - 1) * .48);
    }

    for (const [mat, parts] of batches) {
        const positions = [], normals = [];
        for (const part of parts) {
            positions.push(...part.attributes.position.array); normals.push(...part.attributes.normal.array); part.dispose();
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        mesh('GardenFinish', geometry, mat);
    }
    const resources = { geometries, materials, textures };
    let disposed = false;
    const dispose = () => {
        if (disposed) return; disposed = true;
        geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
        group.clear(); group.userData.disposed = true;
    };
    group.userData = {
        dimensionalWorld: true, dispose,
        provenance: 'Original procedural geometry and hand-authored pigment clusters. No third-party art.',
        resources: { geometries: geometries.size, materials: materials.size, textures: textures.size },
        drawCalls: geometries.size,
        surfaceHeight: 0, courtUnits: 'metres', courtFeet: [20, 44],
        artDirection: 'Walkable angular sports garden; native-resolution acrylic court, warm pavers, layered broadleaf canopy.'
    };
    return { group, court, net, resources, dispose };
}
