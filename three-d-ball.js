// One visible, depth-tested ball; readability never changes its tactical center.
import * as THREE from './vendor/three.module.min.js';

function pixelBallTexture(palette) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const rows = [0,0,6,8,10,12,12,12,12,12,12,10,8,6,0,0];
    rows.forEach((width,y) => {
        if (!width) return;
        const x=(16-width)/2;
        ctx.fillStyle=palette.ink;ctx.fillRect(x,y,width,1);
        if(y>2&&y<13){ctx.fillStyle=palette.ball;ctx.fillRect(x+1,y,width-2,1);}
    });
    ctx.fillStyle=palette.line;ctx.fillRect(5,5,3,2);
    const texture=new THREE.CanvasTexture(canvas);
    texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
    texture.generateMipmaps=false;texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
}

export class ReadableBall {
    constructor(scene,palette) {
        this.scene=scene;
        this.texture=pixelBallTexture(palette);
        this.material=new THREE.SpriteMaterial({map:this.texture,transparent:true,alphaTest:0.1,depthTest:true,depthWrite:true,toneMapped:false});
        this.object=new THREE.Group();
        this.sprite=new THREE.Sprite(this.material);this.sprite.renderOrder=900;this.object.add(this.sprite);
        const cueCanvas=document.createElement('canvas');cueCanvas.width=cueCanvas.height=16;
        const cueContext=cueCanvas.getContext('2d');cueContext.fillStyle=palette.line;
        for(const [x,y,w,h] of [[6,1,4,2],[6,13,4,2],[1,6,2,4],[13,6,2,4]])cueContext.fillRect(x,y,w,h);
        this.cueTexture=new THREE.CanvasTexture(cueCanvas);this.cueTexture.magFilter=THREE.NearestFilter;this.cueTexture.minFilter=THREE.NearestFilter;this.cueTexture.generateMipmaps=false;
        this.cue=new THREE.Sprite(new THREE.SpriteMaterial({map:this.cueTexture,transparent:true,opacity:0.7,depthTest:true,depthFunc:THREE.GreaterDepth,depthWrite:false,toneMapped:false}));
        this.cue.name='OccludedBallCue';this.cue.renderOrder=901;this.object.add(this.cue);
        this.object.name='CoachingBall';
        this.object.userData={physicalRadius:0.037,visualRadius:0.037,minimumCSSDiameter:12};
        scene.add(this.object);
        this.viewPosition=new THREE.Vector3();
        this.shadow=new THREE.Mesh(new THREE.CircleGeometry(1,20),new THREE.MeshBasicMaterial({color:palette.ink,transparent:true,opacity:0.2,depthWrite:false}));
        this.shadow.name='BallGroundShadow';this.shadow.rotation.x=-Math.PI/2;scene.add(this.shadow);
        this.trail=Array.from({length:4},(_,i)=>{
            const material=this.material.clone();material.opacity=0.32*(1-i/4);material.depthWrite=false;
            const dot=new THREE.Sprite(material);dot.name='BallPastPosition';dot.visible=false;scene.add(dot);return dot;
        });
    }
    sizeAt(position,camera,height,diameter=12) {
        const depth=Math.max(0.01,-this.viewPosition.copy(position).applyMatrix4(camera.matrixWorldInverse).z);
        const worldPerPixel=2*depth*Math.tan(camera.fov*Math.PI/360)/Math.max(1,height);
        // The artwork occupies 12 of the 16 texture columns.
        return Math.max(0.074,diameter*worldPerPixel)*16/12;
    }
    update(camera,height,time,samplePast,launched) {
        const size=this.sizeAt(this.object.position,camera,height,this.object.userData.minimumCSSDiameter);
        this.sprite.scale.set(size,size,1);
        // Render the near surface of the visual sphere on the same camera ray.
        // Its logical center and projected center remain exactly unchanged.
        this.sprite.position.copy(camera.position).sub(this.object.position).normalize().multiplyScalar(size*0.375);
        this.cue.position.copy(this.sprite.position);this.cue.scale.set(size*1.25,size*1.25,1);
        this.shadow.position.set(this.object.position.x,0.008,this.object.position.z);
        const footprint=0.075+Math.min(0.1,this.object.position.y*0.025);
        this.shadow.scale.setScalar(footprint);
        this.shadow.material.opacity=Math.max(0.08,0.23-this.object.position.y*0.025);
        this.trail.forEach((dot,i)=>{
            const pastTime=time-(i+1)*0.035;
            const p=launched&&samplePast&&pastTime>=0?samplePast(pastTime):null;
            dot.visible=Boolean(p&&p.launched);
            if(!dot.visible)return;
            dot.position.set(p.x,p.y,p.z);
            const s=this.sizeAt(dot.position,camera,height,4-i*0.5);
            dot.scale.set(s,s,1);
        });
    }
    dispose() {
        for (const item of [this.object, this.shadow, ...this.trail]) this.scene.remove(item);
        // Sprite geometry belongs to Three.js's shared cache, not this view.
        this.shadow.geometry.dispose();this.shadow.material.dispose();
        for (const dot of this.trail) dot.material.dispose();
        this.material.dispose();this.texture.dispose();this.cue.material.dispose();this.cueTexture.dispose();
    }
}

// Dynamic model 2 annotations stay separate from the ball and cached world.
// Callers supply the shared playhead sample; this object never reads time.
export class TerminalEventMarkers {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'Model2TerminalMarkers';
        this.objects = new Map();
        this.textures = new Set();
        this.diagnostics = [];
        scene.add(this.group);
    }
    create(type) {
        const group = new THREE.Group();
        group.name = `TerminalMarker:${type}`;
        const material = color => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
        if (type === 'net-touch' || type === 'second-bounce') {
            const ring = new THREE.Mesh(new THREE.RingGeometry(.12, .16, 20), material(type === 'net-touch' ? '#fff7cf' : '#ffe65c'));
            ring.name = 'TerminalRing';
            if (type === 'second-bounce') ring.rotation.x = -Math.PI / 2;
            group.add(ring);
        } else if (type === 'out') {
            for (const angle of [-Math.PI / 4, Math.PI / 4]) {
                const bar = new THREE.Mesh(new THREE.BoxGeometry(.48, .025, .055), material('#b54035'));
                bar.rotation.y = angle; group.add(bar);
            }
        } else if (type === 'fault') {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#263449'; ctx.fillRect(5, 2, 3, 29); ctx.fillRect(7, 2, 23, 16);
            ctx.fillStyle = '#e78b54'; ctx.fillRect(9, 4, 19, 12);
            ctx.fillStyle = '#fff7cf'; ctx.fillRect(12, 6, 3, 7); ctx.fillRect(12, 14, 3, 1);
            const texture = new THREE.CanvasTexture(canvas);
            texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
            texture.colorSpace = THREE.SRGBColorSpace; this.textures.add(texture);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: .1, depthWrite: false, toneMapped: false }));
            sprite.center.set(.2, 0); sprite.scale.set(.6, .6, 1); group.add(sprite);
        }
        this.objects.set(type, group); this.group.add(group);
        return group;
    }
    update(markers = []) {
        for (const object of this.objects.values()) object.visible = false;
        this.group.visible = Boolean(markers.length);
        this.diagnostics = markers.map(marker => {
            const object = this.objects.get(marker.type) || this.create(marker.type);
            object.visible = true;
            object.position.set(marker.position.x, marker.type === 'out' || marker.type === 'second-bounce' ? .025 : marker.position.y, marker.position.z);
            object.userData.event = { ...marker, position: { ...marker.position } };
            if (marker.type === 'net-touch' || marker.type === 'second-bounce') {
                object.scale.setScalar(marker.type === 'net-touch' ? .7 + marker.progress * 2 : 1 + marker.progress);
                object.children[0].material.opacity = marker.type === 'net-touch' ? .85 * (1 - marker.progress) : .95;
            }
            return { ...marker, visible: true };
        });
        return this.diagnostics;
    }
    dispose() {
        this.scene.remove(this.group);
        this.group.traverse(object => {
            // Sprite geometry is Three.js's shared cache, as for ReadableBall.
            if (!object.isSprite) object.geometry?.dispose();
            object.material?.dispose();
        });
        for (const texture of this.textures) texture.dispose();
        this.objects.clear(); this.textures.clear(); this.diagnostics = [];
    }
}
