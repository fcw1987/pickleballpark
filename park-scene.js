import { PARK_LAYOUT, PARK_MATERIALS } from './park-layout.js';
import { boardToWorld, FEET_TO_METERS } from './three-d-core.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const projection = point => {
    const courtToView = globalThis.PickleboardProjection?.courtToView;
    if (!courtToView) throw new Error('PickleboardProjection is required for park SVG placement.');
    return courtToView(point);
};
const TILE_FEET = 128 / 12;

const svgElement = (document, name, attributes = {}) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
};
const setHref = (element, href) => {
    element.setAttribute('href', href);
    element.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href);
};
const imageRendering = element => { element.style.imageRendering = 'pixelated'; element.setAttribute('shape-rendering', 'crispEdges'); };

function existingParkLayer(svg) {
    return [...(svg?.children || [])].find(child => child.getAttribute?.('data-park-scene') === 'true') || null;
}

/**
 * Add the shared park textures and upright landmark layer to the editor SVG.
 * The ground images live inside the projected ground plane; detail sprites
 * stay in an upright sibling layer so the court shear never distorts them.
 */
export function populateParkSVG(svg, groundPlane) {
    if (!svg || !groundPlane) throw new TypeError('populateParkSVG requires an SVG root and ground plane.');
    const existing = existingParkLayer(svg);
    if (existing) return existing;
    const document = svg.ownerDocument || globalThis.document;
    if (!document) throw new Error('An SVG document is required.');

    const groundAssets = svgElement(document, 'g', { 'data-park-ground': 'true', 'aria-hidden': 'true', 'pointer-events': 'none' });
    const defs = svgElement(document, 'defs');
    const patterns = new Map();
    const patternFor = (name, href) => {
        const id = `park-texture-${name}`;
        const pattern = svgElement(document, 'pattern', { id, patternUnits: 'userSpaceOnUse', width: TILE_FEET, height: TILE_FEET });
        const image = svgElement(document, 'image', { x: 0, y: 0, width: TILE_FEET, height: TILE_FEET, preserveAspectRatio: 'none' });
        setHref(image, href); imageRendering(image); pattern.appendChild(image); defs.appendChild(pattern); patterns.set(name, id);
    };
    patternFor('grass', PARK_LAYOUT.assets.grass); patternFor('quiet-court', PARK_LAYOUT.assets.quietCourt); patternFor('path', PARK_LAYOUT.assets.path);
    groundAssets.appendChild(defs);
    // Continue the park material beneath the playable apron. The apron still
    // receives its authored tile overlay below, but this keeps the projected
    // outer edge from meeting a flat CSS-colored void at a hard diagonal.
    const outsideArea = groundPlane.querySelector?.('.outside-area');
    if (outsideArea) {
        // The presentation viewBox includes a little breathing room around
        // the authored apron. Extend the same material into that margin so
        // resize and portrait projection never expose a hard empty triangle.
        outsideArea.setAttribute('x', '-24');
        outsideArea.setAttribute('y', '-24');
        outsideArea.setAttribute('width', '68');
        outsideArea.setAttribute('height', '100');
        outsideArea.style.fill = `url(#${patterns.get('grass')})`;
        outsideArea.style.opacity = '1';
    }
    const fillRect = (name, rect, opacity) => {
        const element = svgElement(document, 'rect', { x: rect.x, y: rect.y, width: rect.width, height: rect.height, opacity, fill: `url(#${patterns.get(name)})` });
        element.setAttribute('shape-rendering', 'crispEdges'); groundAssets.appendChild(element);
    };
    groundAssets.appendChild(svgElement(document,'path',{d:'M -8 -8 H 28 V 52 H -8 Z M 0 0 V 44 H 20 V 0 Z','fill-rule':'evenodd',fill:`url(#${patterns.get('grass')})`,opacity:0.96}));
    fillRect('quiet-court', { x: 0, y: 0, width: 20, height: 44 }, 0.18);
    for (const path of PARK_LAYOUT.paths) fillRect('path', path, 1);
    const courtMarkings = [...(groundPlane.children || [])].find(child => child.id === 'courtMarkings');
    if (courtMarkings) groundPlane.insertBefore(groundAssets, courtMarkings); else groundPlane.appendChild(groundAssets);

    const layer = svgElement(document, 'g', { 'data-park-scene': 'true', 'aria-hidden': 'true', 'pointer-events': 'none' });
    const details = svgElement(document, 'g', { 'data-park-details': 'true', 'pointer-events': 'none' });
    const assetFor = { tree: PARK_LAYOUT.assets.tree, shrub: PARK_LAYOUT.assets.shrub, bench: PARK_LAYOUT.assets.bench, sign: PARK_LAYOUT.assets.sign, banner: PARK_LAYOUT.assets.banner };
    const ordered = [...PARK_LAYOUT.landmarks].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const landmark of ordered) {
        const view = projection(landmark);
        const image = svgElement(document, 'image', {
            x: -landmark.size / 2, y: -landmark.height*58/64, width: landmark.size, height: landmark.height,
            'data-landmark-id': landmark.id, 'data-depth': landmark.y, preserveAspectRatio: 'none'
        });
        setHref(image, assetFor[landmark.type]); imageRendering(image);
        image.setAttribute('transform', `translate(${view.x} ${view.y})`);
        details.appendChild(image);
    }
    layer.appendChild(details);
    const actorLayer = [...(svg.children || [])].find(child => child.id === 'actorLayer');
    if (actorLayer) svg.insertBefore(layer, actorLayer); else svg.appendChild(layer);
    layer.groundLayer = groundAssets;
    layer.detailLayer = details;
    return layer;
}


/** Reproject upright scenery after a viewport preset change, without reloading art. */
export function updateParkSVGProjection(svg) {
    for (const landmark of PARK_LAYOUT.landmarks) {
        const image = svg.querySelector(`[data-landmark-id="${landmark.id}"]`);
        if (!image) continue;
        const view = projection(landmark);
        image.setAttribute('transform', `translate(${view.x} ${view.y})`);
    }
}

const assetURL = asset => new URL(`./${asset}`, import.meta.url).href;
const configureTexture = (texture, THREE, repeat = [1, 1], tiled = true) => {
    texture.colorSpace = THREE.SRGBColorSpace || texture.colorSpace;
    texture.magFilter = THREE.NearestFilter;
    // Blend mip levels on the angled ground rather than switching abruptly.
    // Upright art retains nearest magnification and padded transparent edges.
    texture.minFilter = THREE.LinearMipmapLinearFilter || THREE.LinearFilter;
    texture.generateMipmaps = true;
    const wrapping=tiled?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;
    if (wrapping !== undefined) { texture.wrapS = wrapping; texture.wrapT = wrapping; }
    texture.repeat?.set(repeat[0], repeat[1]);
    texture.needsUpdate = true;
    return texture;
};
const boardWorldRect = rect => {
    const centerX = rect.x + rect.width / 2, centerY = rect.y + rect.height / 2;
    const center = boardToWorld({ x: centerX, y: centerY });
    return { x: center.x, z: center.z, width: rect.width * FEET_TO_METERS, depth: rect.height * FEET_TO_METERS };
};

/** Build a disposable Three.js park group using the same landmark contract. */
export async function createPark3D(THREE, { signal } = {}) {
    if (!THREE?.Group || !THREE?.TextureLoader) throw new TypeError('createPark3D requires a Three.js namespace.');
    const loader = new THREE.TextureLoader();
    const assetEntries = Object.entries(PARK_LAYOUT.assets);
    const pendingTextures = assetEntries.map(async ([name,asset])=>{
        // Fetch owns cancellation; TextureLoader alone cannot abort its Image request.
        const response=await fetch(assetURL(asset),{signal});
        if(!response.ok)throw new Error(`Park asset unavailable: ${asset}`);
        const blobURL=URL.createObjectURL(await response.blob());
        try{
            const texture=await loader.loadAsync(blobURL);
            if(signal?.aborted){texture.dispose();throw new DOMException('Park loading cancelled','AbortError');}
            return [name,configureTexture(texture,THREE,[1,1],['grass','path','quietCourt'].includes(name))];
        }finally{URL.revokeObjectURL(blobURL);}
    });
    let loadedTextures;
    try { loadedTextures=await Promise.all(pendingTextures); }
    catch(error){
        // Dispose each successful sibling, including any that resolves after a failure.
        pendingTextures.forEach(p=>p.then(([,texture])=>texture.dispose(),()=>{}));
        throw error;
    }
    const textures = new Map(loadedTextures);
    const ownedTextures = new Set(textures.values());
    const group = new THREE.Group();
    group.name = 'ParkScene';
    group.userData = { parkLayout: PARK_LAYOUT, materials: PARK_MATERIALS, textures, landmarks: new Map() };
    const material = (texture, opacity = 1) => { ownedTextures.add(texture); return new THREE.MeshBasicMaterial({ map: texture, transparent: opacity < 1, opacity, alphaTest: 0.08, depthTest: true, depthWrite: opacity >= 0.95, side: THREE.DoubleSide, toneMapped: false }); };
    const addGround = (name, rect, texture, opacity, y) => {
        const world = boardWorldRect(rect);
        const map = texture.clone ? texture.clone() : texture;
        map.repeat?.set(world.width / (TILE_FEET * FEET_TO_METERS), world.depth / (TILE_FEET * FEET_TO_METERS)); map.needsUpdate = true;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(world.width, world.depth), material(map, opacity));
        mesh.name = name; mesh.rotation.x = -Math.PI / 2; mesh.position.set(world.x, y, world.z); mesh.renderOrder = -5; mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    const apron = PARK_LAYOUT.apronFeet;
    const apronRect = { x: apron.x[0], y: apron.y[0], width: apron.x[1] - apron.x[0], height: apron.y[1] - apron.y[0] };
    // Carry the park material beyond the authored apron. The extra layer is
    // deliberately quiet and sits below the court slab; it removes the hard
    // diagonal between the playable surround and the renderer clear color.
    addGround('ParkWorld', { x: -100, y: -100, width: 220, height: 260 }, textures.get('grass'), 1, -0.12);
    addGround('ParkGrass', apronRect, textures.get('grass'), 1, -0.06);
    addGround('ParkCourtTexture', { x: 0, y: 0, width: 20, height: 44 }, textures.get('quietCourt'), 0.24, 0.006);
    for (const path of PARK_LAYOUT.paths) addGround(path.id, path, textures.get('path'), 1, -0.045);

    const detailTextures = { tree: textures.get('tree'), shrub: textures.get('shrub'), bench: textures.get('bench'), sign: textures.get('sign'), banner: textures.get('banner') };
    for (const landmark of PARK_LAYOUT.landmarks) {
        const world = boardToWorld({ x: landmark.x, y: landmark.y });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(landmark.size * FEET_TO_METERS, landmark.height * FEET_TO_METERS), material(detailTextures[landmark.type], 1));
        mesh.name = `ParkLandmark-${landmark.id}`;
        mesh.position.set(world.x, landmark.height * FEET_TO_METERS * (58/64-.5), world.z);
        mesh.userData.foot = new THREE.Vector3(world.x, 0.012, world.z);
        mesh.userData.anchorOffset = landmark.height * FEET_TO_METERS * (58/64-.5);
        mesh.userData.offset = new THREE.Vector3();
        mesh.frustumCulled = false;
        mesh.renderOrder = -2;
        group.userData.landmarks.set(landmark.id, mesh); group.add(mesh);
    }
    const dispose = () => {
        if (group.userData.disposed) return;
        const geometries = new Set(), materials = new Set();
        group.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(value => materials.add(value)); });
        geometries.forEach(value => value.dispose?.()); materials.forEach(value => value.dispose?.()); ownedTextures.forEach(value => value.dispose?.());
        group.clear(); group.userData.disposed = true;
    };
    group.userData.dispose = dispose;
    return group;
}

/** Orient upright landmark planes after each camera change/resize. */
export function updateParkCamera(group, camera) {
    if (!group || !camera) return group;
    const landmarks = group.userData?.landmarks;
    if (landmarks) for (const mesh of landmarks.values()) {
        // Keep original pixel landmarks upright in screen space. Yaw-only
        // planes collapsed into thin slivers in the normal overhead view.
        // Reposition around the stored foot so the sprite never floats away.
        mesh.quaternion.copy(camera.quaternion);
        mesh.userData.offset.set(0,mesh.userData.anchorOffset,0).applyQuaternion(mesh.quaternion);
        mesh.position.copy(mesh.userData.foot).add(mesh.userData.offset);
    }
    group.updateMatrixWorld?.(true);
    return group;
}

export const disposePark3D = group => group?.userData?.dispose?.();
