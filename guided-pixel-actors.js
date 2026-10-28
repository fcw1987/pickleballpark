import { loadPixelActorAssets } from './pixel-actor-assets.js';
import { worldToBoard, FEET_TO_METERS } from './three-d-core.js';
// Lightweight 2D Play overlays backed by the same layered replay pixel art
// used by the optional Three.js viewer. No Three.js import is needed here.
const SVG_NS = 'http://www.w3.org/2000/svg';
const ASSET_ROOT = new URL('./assets/replay/', import.meta.url);
const DIRECTIONS = Object.freeze(['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left']);
const TEAMS = Object.freeze(['green', 'orange']);
const HANDS = Object.freeze(['left', 'right']);
let assetPromise = null;

const imageURL = file => new URL(file, ASSET_ROOT).href;
async function loadAssets() {
    if(assetPromise)return assetPromise;
    assetPromise=loadPixelActorAssets().then(({metadata,images})=>{
        if(metadata.cell?.join(',')!=='64,64'||metadata.footPivot?.join(',')!=='32,54')throw new Error('Invalid guided actor pivot');
        const atlases=Object.fromEntries(Object.entries(metadata.atlases).map(([key,atlas])=>[key,{...atlas,frames:new Map(atlas.frames.map(frame=>[frame.action,frame])),body:images[key][0],action:images[key][1]}]));
        return {metadata,atlases};
    }).catch(error=>{assetPromise=null;throw error;});
    return assetPromise;
}

const visualSprite = () => globalThis.PICKLEBOARD_VISUAL?.sprite || { width: 64, height: 64, anchorX: 32, anchorY: 54, worldWidth: 16 / 3, worldHeight: 16 / 3 };
const makeElement = (document, name, attributes = {}) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
};
const setHref = (element, href) => {
    element.setAttribute('href', href);
    element.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href);
};
const normalizeSamples = samples => {
    if (samples instanceof Map) return [...samples.entries()];
    if (Array.isArray(samples)) return samples.filter(sample => sample?.playerId).map(sample => [sample.playerId, sample]);
    return Object.entries(samples || {});
};
const phaseName = phase => phase === 'follow-through' ? 'follow' : phase === 'locomotion' ? 'ready' : phase || 'ready';

function frameName(sample, metadata) {
    if (sample.action === 'ready') return 'ready';
    if (sample.action === 'shuffle' || sample.phase === 'locomotion') return `shuffle-${sample.locomotionFrame % 2 ? 'b' : 'a'}`;
    const candidate = `${sample.action}-${phaseName(sample.phase)}`;
    return metadata.actions?.includes(candidate) ? candidate : metadata.actions?.includes(`${sample.action}-contact`) ? `${sample.action}-contact` : 'ready';
}

export class GuidedPixelActors {
    constructor(board) {
        if (!board?.tokens) throw new TypeError('GuidedPixelActors requires a Pickleboard board instance.');
        this.board = board;
        this.assets = null;
        this.loaded = false;
        this.active = false;
        this.nodes = new Map();
        this.originalVisibility = new Map();
        this.loadGeneration = 0;
    }

    async load() {
        const generation = ++this.loadGeneration;
        const assets = await loadAssets();
        if (generation !== this.loadGeneration) return false;
        this.assets = assets;
        this.loaded = true;
        this.ensureNodes();
        return true;
    }

    ensureNodes() {
        if (!this.loaded || !this.assets) return;
        const document = this.board.court?.ownerDocument || globalThis.document;
        if (!document) return;
        const sprite = visualSprite();
        for (const [id, token] of Object.entries(this.board.tokens)) {
            if (token.type !== 'player' || this.nodes.has(id) || !token.element) continue;
            const parent = token.element.parentNode || document.getElementById(`${id}-actor`);
            if (!parent) continue;
            const node = makeElement(document, 'svg', { class: 'guided-pixel-actor', 'data-token': id, x: token.x - sprite.worldWidth / 2, y: token.y - sprite.worldHeight / 2, width: sprite.worldWidth, height: sprite.worldHeight, viewBox: '0 0 64 64', preserveAspectRatio: 'none', 'aria-hidden': 'true', 'pointer-events': 'none' });
            const body = makeElement(document, 'image', { width: 64, height: 64, preserveAspectRatio: 'none', 'shape-rendering': 'crispEdges' });
            const action = makeElement(document, 'image', { width: 64, height: 64, preserveAspectRatio: 'none', 'shape-rendering': 'crispEdges' });
            const bodyView=makeElement(document,'svg',{width:64,height:64,overflow:'hidden'});
            const actionView=makeElement(document,'svg',{width:64,height:64,overflow:'hidden'});
            const armGroup=makeElement(document,'g');
            bodyView.append(body);actionView.append(action);armGroup.append(actionView);node.append(bodyView,armGroup);
            node.style.imageRendering='pixelated';node.style.overflow='visible';
            parent.appendChild(node);
            this.nodes.set(id, { node, body, action, bodyView, actionView, armGroup, frameKey: null, parent, token });
            this.originalVisibility.set(id, token.element.style.visibility);
        }
    }

    activate() {
        if (!this.loaded) return false;
        this.ensureNodes();
        this.active = true;
        for (const { token } of this.nodes.values()) token.element.style.visibility = 'hidden';
        return true;
    }

    deactivate() {
        this.board.pixelSamples = null;
        this.active = false;
        for (const [id, entry] of this.nodes) {
            const visibility = this.originalVisibility.get(id);
            if (visibility) entry.token.element.style.visibility = visibility;
            else if (typeof entry.token.element.style.removeProperty === 'function') entry.token.element.style.removeProperty('visibility');
            else entry.token.element.style.visibility = '';
        }
        return true;
    }

    restore() {
        this.deactivate();
        for (const entry of this.nodes.values()) entry.node.remove();
        this.nodes.clear();
        this.originalVisibility.clear();
        return true;
    }

    update(samples) {
        this.board.pixelSamples = Object.fromEntries(normalizeSamples(samples));
        if (!this.loaded || !this.assets) return false;
        if (!this.active) this.activate();
        const sprite = visualSprite();
        for (const [id, sample] of normalizeSamples(samples)) {
            const entry = this.nodes.get(id), token = this.board.tokens[id];
            if (!entry || !token || !sample) continue;
            const team = token.element.classList.contains('team2-player') ? 'orange' : 'green';
            const hand = token.handedness === 'left' ? 'left' : 'right';
            const direction = this.assets.metadata.directions.includes(sample.viewDirection) ? sample.viewDirection : team === 'orange' ? 'back' : 'front';
            const atlasKey = `${team}/${hand}/${direction}`;
            const atlas = this.assets.atlases[atlasKey];
            if (!atlas) continue;
            const action = frameName(sample, this.assets.metadata);
            const frame = atlas.frames.get(action) || atlas.frames.get('ready');
            if (!frame) continue;
            entry.node.setAttribute('x', String(token.x - sprite.worldWidth / 2));
            entry.node.setAttribute('y', String(token.y - sprite.worldHeight / 2));
            entry.node.setAttribute('width', String(sprite.worldWidth));
            entry.node.setAttribute('height', String(sprite.worldHeight));
            const frameKey = `${atlasKey}/${frame.action}`;
            if (frameKey !== entry.frameKey) {
                const [x, y] = frame.rect;
                entry.bodyView.setAttribute('viewBox',frame.rect.join(' '));entry.actionView.setAttribute('viewBox',frame.rect.join(' '));
                entry.body.setAttribute('width',atlas.body.width);entry.body.setAttribute('height',atlas.body.height);
                entry.action.setAttribute('width',atlas.action.width);entry.action.setAttribute('height',atlas.action.height);
                setHref(entry.body, imageURL(atlas.bodyFile)); setHref(entry.action, imageURL(atlas.actionFile));
                entry.node.dataset.frame = frame.action;
                entry.node.dataset.paddleGrip = frame.paddleGrip?.join(',') || '';
                entry.node.dataset.paddleFace = frame.paddleFace?.join(',') || '';
                entry.node.dataset.shoulderPivot = frame.shoulderPivot?.join(',') || '';
                entry.frameKey = frameKey;
            }
            const target=sample.paddle?.worldContactTarget,weight=sample.contactWeight||0;
            let transform='';
            if(target&&weight>0){
                const ground=this.board.projection.courtToView(token.x,token.y),point=this.board.projection.courtToView(worldToBoard(target));
                const desired=[32+(point.x-ground.x)*64/sprite.worldWidth,54+(point.y-ground.y-this.board.projection.projectHeight(target.y/FEET_TO_METERS))*64/sprite.worldHeight];
                const [sx,sy]=frame.shoulderPivot,[fx,fy]=frame.paddleFace;
                const tx=fx+(desired[0]-fx)*weight,ty=fy+(desired[1]-fy)*weight;
                const angle=(Math.atan2(ty-sy,tx-sx)-Math.atan2(fy-sy,fx-sx))*180/Math.PI;
                const scale=Math.hypot(tx-sx,ty-sy)/Math.max(1,Math.hypot(fx-sx,fy-sy));
                transform=`translate(${sx} ${sy}) rotate(${angle}) scale(${scale}) translate(${-sx} ${-sy})`;
            }
            if(entry.armGroup.getAttribute('transform')!==transform)entry.armGroup.setAttribute('transform',transform);
        }
        return true;
    }

    dispose() {
        ++this.loadGeneration;
        this.restore();
        this.loaded = false;
        this.assets = null;
        return true;
    }
}

export { loadAssets as loadGuidedPixelAssets };
