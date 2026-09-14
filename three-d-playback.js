import { createPark3D, disposePark3D, updateParkCamera } from './park-scene.js';
import { COURT_LINES } from './court-geometry.js';
import { updateCoachingUI } from './coaching-ui.js';
import * as THREE from './vendor/three.module.min.js';
import {
    CAMERA_PRESETS,
    COURT_DIMENSIONS,
    FEET_TO_METERS,
    samplePlayBall,
    boardToWorld,

    fitCameraPreset
} from './three-d-core.js';
import { sampleActorPresentation, selectCameraRelativeDirection } from './three-d-presentation.js';
import { loadPixelActorAssets, PixelActorResources, createPixelActor, updatePixelActor } from './three-d-pixel-actors.js';
import { ReadableBall } from './three-d-ball.js';
import { chapterAtTime } from './shot-chapters.js';
import { mountShotTimeline } from './shot-timeline.js';

const FALLBACK_PALETTE = Object.freeze({
    ink: '#263449', navy: '#304762', navyLight: '#526d86', navyDark: '#1c2b40',
    green: '#83bc65', greenLight: '#b7dc88', greenDark: '#42775a',
    orange: '#df8b50', orangeLight: '#f4bf78', orangeDark: '#98563e',
    skin: '#efca9c', skinShade: '#ca9978', shoe: '#f5edd8', court: '#648f86',
    kitchen: '#b4c8b0', surround: '#7fa375', line: '#fff6db', ball: '#edee73'
});
const VISUAL = globalThis.PICKLEBOARD_VISUAL || { palette: FALLBACK_PALETTE, render: { pixelScale: 1, maxPixelRatio: 2 } };
const PALETTE = { ...FALLBACK_PALETTE, ...VISUAL.palette };
const DEFAULT_PIXEL_SCALE = [1, 2].includes(Number(VISUAL.render?.pixelScale)) ? Number(VISUAL.render.pixelScale) : 1;

class ThreeDPlaybackViewer {
    constructor(board) {
        this.board = board;
        this.elements = {
            root: document.getElementById('threeDViewer'),
            canvas: document.getElementById('threeDCanvas'),
            title: document.getElementById('threeDTitle'),
            progress: document.getElementById('threeDProgress'),
            stepLabel: document.getElementById('threeDStepLabel'),
            description: document.getElementById('threeDDescription'),
            shotCue: document.getElementById('threeDShotCue'),
            status: document.getElementById('threeDStatus'),
            playPause: document.getElementById('threeDPlayPause'),
            camera: document.getElementById('threeDCamera'),
            rate: document.getElementById('threeDRate'),
            exit: document.getElementById('threeDExit'),
            enter: document.getElementById('play3dView'),
            loadStatus: document.getElementById('threeDLoadStatus')
        };
        this.session = board.plays.session;
        this.clock = this.session.clock;
        this.active = false;
        this.loadGeneration = 0;
        this.renderLoopId = null;
        this.renderLoopCount = 0;
        this.currentPlay = null;
        this.timeline = null;
        this.playerObjects = new Map();
        this.ballObject = null;
        this.lastState = null;
        this.pixelScale = DEFAULT_PIXEL_SCALE;
        this.gradientMap = null;
        this.boundResize = () => this.resize();
        this.boundVisibilityChange = () => {
            // requestAnimationFrame is suspended in background tabs. Discard its
            // timestamp baseline on both edges so hidden time never enters play.
            this.clock.lastTimestamp = null;
            if (document.hidden) {
                if (this.renderLoopId !== null) cancelAnimationFrame(this.renderLoopId);
                this.renderLoopId = null;
            } else if (this.active) this.startRenderLoop();
        };
        this.boundContextLost = event => {
            event.preventDefault();
            // A suspended builder view retains its scene for fast re-entry. A
            // context can still be reclaimed while that canvas is hidden; do
            // not leave the dead renderer available for the reuse path.
            if (!this.scene || event.currentTarget !== this.renderer?.domElement) return;
            this.exit();
            this.elements.loadStatus.textContent='Graphics were interrupted. Your board is safe. Try 3D View again.';
            this.elements.loadStatus.hidden=false;
        };
        this.bindControls();
        const timelineMount = document.getElementById('threeDTimelineMount');
        this.shotTimeline = timelineMount ? mountShotTimeline({ onAction: (action, value) => this.board.plays.timelineAction(action, value) }) : null;
        if (timelineMount && this.shotTimeline) timelineMount.replaceChildren(this.shotTimeline.element);
        this.updateEntryAvailability();
    }

    bindControls() {
        this.elements.enter.addEventListener('click', () => this.enter());
        this.elements.playPause.addEventListener('click', () => this.togglePlay());
        this.elements.camera.addEventListener('change', event => this.setCamera(event.target.value));
        this.elements.rate.addEventListener('change', event => this.setPlaybackRate(Number(event.target.value)));
        this.elements.exit.addEventListener('click', () => this.exit());
    }

    updateEntryAvailability() {
        this.elements.enter.disabled = Boolean(this.loading) || !this.board.plays?.activePlay;
    }

    cancelLoading() {
        this.loadGeneration += 1;
        this.loadAbort?.abort();this.loadAbort=null;
        this.loading=false;
        this.elements.enter.removeAttribute('aria-busy');
        this.updateEntryAvailability();
        const suspension=this.loadSuspension;this.loadSuspension=null;
        if (suspension && this.session.resumeSuspension(suspension)) this.board.plays.startPlaybackLoop();
    }

    cancelRenderWork() {
        if (this.renderLoopId !== null) cancelAnimationFrame(this.renderLoopId);
        this.renderLoopId = null;
    }

    renderSessionSample() {
        if (!this.scene || !this.currentPlay) return;
        this.applyAtTime(this.clock.elapsed);
        this.renderer?.render(this.scene, this.camera);
        this.updateUI();
    }

    // A builder view toggle parks this renderer; leaving the workspace still disposes it.
    suspend() {
        if (!this.active) return false;
        const suspension=this.session.suspend(performance.now(), this.board.plays.timingScale);
        this.board.plays.cancelScheduledWork();
        this.cancelRenderWork(); this.active = false; this.session.owner = 'guided';
        this.elements.root.hidden = true; document.body.classList.remove('three-d-active');
        this.board.plays.applyAtTime(this.clock.elapsed);
        if (this.session.resumeSuspension(suspension)) this.board.plays.startPlaybackLoop();
        return true;
    }
    replaceDefinition(play, timeline) {
        this.currentPlay = play; this.timeline = timeline; this.sceneEnvelope = null;
        for (const [id, actor] of this.playerObjects) actor.userData.handedness = this.board.tokens[id].handedness;
        if (this.renderer) { this.applyAtTime(this.clock.elapsed); this.applyCameraFraming(); this.startRenderLoop(); }
    }
    async enter() {
        const play = this.board.plays?.activePlay;
        if (!play || this.active || this.loading) return false;
        if (this.scene && this.currentPlay === play) {
            this.session.owner = 'replay'; this.active = true;
            this.elements.root.hidden = false; document.body.classList.add('three-d-active');
            this.resize(); this.applyAtTime(this.clock.elapsed); this.updateUI(); this.startRenderLoop();
            return true;
        }
        const snapshot=this.board.plays.snapshot;
        const playbackSuspension = this.session.suspend(performance.now(), this.board.plays.timingScale);
        this.loadSuspension=playbackSuspension;
        this.board.plays.cancelScheduledWork({ preserveTransition: true });
        const generation=++this.loadGeneration;
        const controller=new AbortController();this.loadAbort=controller;
        this.loading=true;
        this.updateEntryAvailability();
        this.elements.enter.setAttribute('aria-busy','true');
        let loadingSubject='Pixel athletes';
        try {
            this.pixelAssets=await loadPixelActorAssets();
            loadingSubject='The park';
            if(generation!==this.loadGeneration)return false;
            const park = await createPark3D(THREE,{signal:controller.signal});
            if(generation!==this.loadGeneration||this.board.plays.activePlay!==play||this.board.plays.snapshot!==snapshot){disposePark3D(park);return false;}
            this.parkObject=park;
        } catch(error) {
            if(generation!==this.loadGeneration)return false;
            controller.abort();
            this.elements.loadStatus.textContent=`${loadingSubject} could not load. Your board is safe. Try 3D View again.`;
            this.elements.loadStatus.hidden=false;
            this.loadSuspension=null;
            if (this.session.resumeSuspension(playbackSuspension)) this.board.plays.startPlaybackLoop();
            return false;
        } finally {
            if(generation===this.loadGeneration){this.loading=false;this.loadAbort=null;
            this.elements.enter.removeAttribute('aria-busy');this.updateEntryAvailability();}
        }
        this.currentPlay = play;
        this.timeline = this.board.plays.timeline;
        this.session.owner = 'replay';
        this.elements.root.hidden = false;
        document.body.classList.add('three-d-active');
        try {
            this.initializeScene();
            this.applyAtTime(this.clock.elapsed);
            this.setCamera(this.elements.camera.value);
        } catch (error) {
            this.disposeScene();
            this.session.owner = 'guided';
            this.board.plays.updateUI();
            this.elements.root.hidden = true;
            document.body.classList.remove('three-d-active');
            this.active = false;
            this.currentPlay = null;
            this.timeline = null;
            this.loadSuspension=null;
            if (this.session.resumeSuspension(playbackSuspension)) this.board.plays.startPlaybackLoop();
            if (this.elements.loadStatus) {
                this.elements.loadStatus.textContent = `3D view unavailable: ${error?.message || 'WebGL could not start.'}`;
                this.elements.loadStatus.hidden = false;
            }
            this.elements.enter.disabled = false;
            this.elements.enter.focus?.();
            return false;
        }
        this.active = true;
        if (this.elements.loadStatus) {
            this.elements.loadStatus.textContent = '';
            this.elements.loadStatus.hidden = true;
        }
        window.addEventListener('resize', this.boundResize);
        document.addEventListener('visibilitychange', this.boundVisibilityChange);
        this.loadSuspension=null;
        this.session.resumeSuspension(playbackSuspension);
        this.startRenderLoop();
        this.updateUI();
        this.elements.playPause.focus?.();
        return true;
    }

    initializeScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(PALETTE.surround).multiplyScalar(0.72);
        this.camera = new THREE.PerspectiveCamera(48, 1, 0.05, 100);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.shadowMap.enabled = false;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;
        this.renderer.setPixelRatio(this.renderPixelRatio());
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.elements.canvas.replaceChildren(this.renderer.domElement);
        this.renderer.domElement.addEventListener('webglcontextlost',this.boundContextLost);

        this.scene.add(new THREE.HemisphereLight(PALETTE.line, PALETTE.greenDark, 0.85));
        this.scene.add(new THREE.AmbientLight(PALETTE.line, 0.45));
        const key = new THREE.DirectionalLight(PALETTE.line, 1.35);
        key.position.set(-5, 10, -4);
        key.castShadow = false;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.left = -8;
        key.shadow.camera.right = 8;
        key.shadow.camera.top = 10;
        key.shadow.camera.bottom = -10;
        key.shadow.bias = -0.00035;
        this.scene.add(key);
        this.gradientMap = new THREE.DataTexture(new Uint8Array([72, 164, 255]), 3, 1, THREE.RedFormat);
        this.gradientMap.minFilter = THREE.NearestFilter;
        this.gradientMap.magFilter = THREE.NearestFilter;
        this.gradientMap.generateMipmaps = false;
        this.gradientMap.needsUpdate = true;
        this.buildCourt();
        this.scene.add(this.parkObject);
        this.buildPlayers();
        this.buildBall();

        this.resize();
    }

    toonMaterial(color) {
        return new THREE.MeshToonMaterial({ color, gradientMap: this.gradientMap });
    }

    flatMaterial(color) {
        return new THREE.MeshBasicMaterial({ color });
    }

    renderPixelRatio() {
        const cap = Number(VISUAL.render?.maxPixelRatio) || 2;
        return Math.max(0.5, Math.min(window.devicePixelRatio || 1, cap) / this.pixelScale);
    }

    setPixelScale(scale) {
        if (![1, 2].includes(scale)) throw new RangeError('Pixel scale must be 1 or 2.');
        this.pixelScale = scale;
        if (this.renderer) {
            this.renderer.setPixelRatio(this.renderPixelRatio());
            this.resize();
        }
        return this.pixelScale;
    }

    buildCourt() {
        const width = COURT_DIMENSIONS.widthFeet * FEET_TO_METERS;
        const length = COURT_DIMENSIONS.lengthFeet * FEET_TO_METERS;
        const courtGroup = new THREE.Group();
        courtGroup.name = 'Court';
        courtGroup.userData = { width, length, kitchenDepth: COURT_DIMENSIONS.kitchenDepthFeet * FEET_TO_METERS };
        this.scene.add(courtGroup);

        const surround = new THREE.Mesh(
            new THREE.PlaneGeometry(width + 10, length + 10),
            this.flatMaterial(PALETTE.surround)
        );
        surround.name = 'CourtSurround';
        surround.rotation.x = -Math.PI / 2;
        surround.position.y = -0.075;
        surround.receiveShadow = true;
        courtGroup.add(surround);

        const slab = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.11, length),
            this.flatMaterial(PALETTE.court)
        );
        slab.name = 'CourtSlab';
        slab.position.y = -0.055;
        slab.receiveShadow = true;
        courtGroup.add(slab);

        const kitchen = new THREE.Mesh(
            new THREE.PlaneGeometry(width - 0.04, 14 * FEET_TO_METERS),
            this.flatMaterial(PALETTE.kitchen)
        );
        kitchen.name = 'KitchenSurface';
        kitchen.rotation.x = -Math.PI / 2;
        kitchen.position.y = 0.004;
        kitchen.receiveShadow = true;
        courtGroup.add(kitchen);

        const lineMaterial = this.flatMaterial(PALETTE.line);
        const lineWidth = 0.045;
        const addLine = (name, x, z, w, d) => {
            const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, d), lineMaterial);
            line.name = name;
            line.position.set(x, 0.018, z);
            courtGroup.add(line);
        };
        const names = ['GreenBaseline','OrangeBaseline','LeftSideline','RightSideline','GreenKitchenLine','OrangeKitchenLine','GreenCenterline','OrangeCenterline'];
        COURT_LINES.forEach((line,index) => {
            const from=boardToWorld(line.from),to=boardToWorld(line.to),thickness=line.lineWidthFeet*FEET_TO_METERS;
            addLine(names[index],(from.x+to.x)/2,(from.z+to.z)/2,Math.abs(to.x-from.x)||thickness,Math.abs(to.z-from.z)||thickness);
            const mesh=courtGroup.children.at(-1); mesh.userData.courtLine=line;
        });

        const shadowReceiver = new THREE.Mesh(
            new THREE.PlaneGeometry(width + 10, length + 10),
            new THREE.ShadowMaterial({ color: PALETTE.ink, opacity: 0.13, depthWrite: false })
        );
        shadowReceiver.name = 'CourtShadowReceiver';
        shadowReceiver.rotation.x = -Math.PI / 2;
        shadowReceiver.position.y = 0.032;
        shadowReceiver.receiveShadow = true;
        courtGroup.add(shadowReceiver);

        const centerHeight = COURT_DIMENSIONS.netCenterHeightFeet * FEET_TO_METERS;
        const sideHeight = COURT_DIMENSIONS.netSidelineHeightFeet * FEET_TO_METERS;
        const netWidth = width + 0.55;
        const netGroup = new THREE.Group();
        netGroup.name = 'Net';
        netGroup.userData = { centerHeight, sideHeight, width: netWidth };
        courtGroup.add(netGroup);

        const netMaterial = new THREE.LineBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.62 });
        const points = [];
        const segments = 16;
        const heightAt = x => centerHeight + (sideHeight - centerHeight) * Math.pow(Math.abs(x) / (netWidth / 2), 1.7);
        for (let index = 0; index <= segments; index += 1) {
            const x = -netWidth / 2 + (netWidth * index / segments);
            points.push(x, 0.03, 0, x, heightAt(x), 0);
        }
        for (let row = 1; row < 7; row += 1) {
            for (let index = 0; index < segments; index += 1) {
                const x1 = -netWidth / 2 + netWidth * index / segments;
                const x2 = -netWidth / 2 + netWidth * (index + 1) / segments;
                const ratio = row / 7;
                points.push(x1, heightAt(x1) * ratio, 0, x2, heightAt(x2) * ratio, 0);
            }
        }
        const netGeometry = new THREE.BufferGeometry();
        netGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        const net = new THREE.LineSegments(netGeometry, netMaterial);
        net.name = 'NetMesh';
        netGroup.add(net);

        const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(-netWidth / 2, sideHeight, 0),
            new THREE.Vector3(0, centerHeight - 0.025, 0),
            new THREE.Vector3(netWidth / 2, sideHeight, 0)
        );
        const tape = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 24, 0.028, 6, false),
            this.toonMaterial(PALETTE.line)
        );
        tape.name = 'NetTopTape';
        netGroup.add(tape);
        const postMaterial = this.toonMaterial(PALETTE.navyDark);
        for (const x of [-netWidth / 2, netWidth / 2]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, sideHeight + 0.12, 12), postMaterial);
            post.name = 'NetPost';
            post.position.set(x, (sideHeight + 0.12) / 2, 0);
            netGroup.add(post);
        }
        this.courtObject = courtGroup;
        this.netObject = netGroup;
    }

    buildPlayers() {
        this.actorResources=new PixelActorResources(this.pixelAssets);
        for(let index=1;index<=4;index++) {
            const token=this.board.tokens[`player${index}`];
            const team=token.element.classList.contains('team2-player')?'team2':'team1';
            const actor=createPixelActor(this.actorResources,team,token.handedness);
            actor.userData.id=token.id;this.scene.add(actor);this.playerObjects.set(token.id,actor);
        }
    }

    applyPixelActors(segment,localTime) {
        for(const [id,actor] of this.playerObjects) {
            let sample;
            if(segment) sample=sampleActorPresentation({segment,timeline:this.timeline,seconds:segment.startTime+localTime,playerId:id,localTime,cameraPosition:this.camera.position,cameraTarget:this.cameraTarget,handedness:actor.userData.handedness});
            else {
                const position=this.currentPlay.steps[0].positions[id],world=boardToWorld(position);
                const facing={x:0,z:position.y<22?1:-1};
                sample={handedness:actor.userData.handedness,worldPosition:world,viewDirection:selectCameraRelativeDirection(facing,world,this.camera.position,this.cameraTarget),action:'ready',phase:'ready',locomotionFrame:null,paddle:null};
            }
            const isStriker=segment?.shotSemantics?.playerId===id;
            const isIncoming=segment?.nextShotSemantics?.playerId===id;
            const distance=isStriker?Math.abs(localTime-segment.contactTime):isIncoming?Math.abs(segment.duration-localTime):Infinity;
            const window=localTime<segment?.contactTime?0.18:0.22;
            const t=Math.max(0,1-distance/window),weight=t*t*(3-2*t);
            updatePixelActor(actor,sample,this.camera,weight);
        }
    }

    segmentEndpointTime(index) {
        if (index <= 0) return 0;
        return this.timeline.segments[Math.min(index - 1, this.timeline.segments.length - 1)].endTime;
    }

    currentStepIndex() {
        if (!this.timeline || this.clock.elapsed <= 0) return 0;
        const index = this.timeline.segments.findIndex(segment => this.clock.elapsed < segment.endTime - 1e-9);
        return index < 0 ? this.currentPlay.steps.length - 1 : this.timeline.segments[index].index;
    }

    previous() {
        if (!this.active) return false;
        this.board.plays.cancelScheduledWork();
        const target = Math.max(0, this.currentStepIndex() - 1);
        this.session.seek(this.segmentEndpointTime(target));
        this.applyAtTime(this.clock.elapsed);
        this.updateUI();
        this.startRenderLoop();
        return true;
    }

    next() {
        if (!this.active) return false;
        this.board.plays.cancelScheduledWork();
        const target = Math.min(this.currentPlay.steps.length - 1, this.currentStepIndex() + 1);
        this.session.seek(this.segmentEndpointTime(target));
        this.applyAtTime(this.clock.elapsed);
        this.updateUI();
        this.startRenderLoop();
        return true;
    }

    buildBall() {
        this.readableBall=new ReadableBall(this.scene,PALETTE);
        this.ballObject=this.readableBall.object;
    }

    setCamera(name) {
        if (!CAMERA_PRESETS[name] || !this.camera) return false;
        this.cameraPreset = name;
        this.elements.camera.value = name;
        this.applyCameraFraming();
        if(this.currentPlay&&this.ballObject)this.applyAtTime(this.clock.elapsed);
        this.startRenderLoop();
        return true;
    }

    applyCameraFraming() {
        if (!this.camera || !this.cameraPreset) return;
        const width = Math.max(1, this.elements.canvas.clientWidth);
        const height = Math.max(1, this.elements.canvas.clientHeight);
        const hudHeight = this.elements.root.hidden ? 0 : (this.elements.root.querySelector('.three-d-hud')?.getBoundingClientRect().height || 0);
        const reservedPixels = this.board.courtFirstComposition ? 0 : Math.min(height * 0.8, hudHeight + 24);
        // Include every authored position and shot, so playback never needs camera chasing.
        // Conservative upright pixel-actor bounds include cap, feet and stroke reach.
        const envelope = this.sceneEnvelope || [];
        if (!this.sceneEnvelope) {
        const halfWidth = COURT_DIMENSIONS.widthFeet * FEET_TO_METERS / 2;
        const halfLength = COURT_DIMENSIONS.lengthFeet * FEET_TO_METERS / 2;
        for (const x of [-halfWidth, halfWidth]) for (const z of [-halfLength, halfLength]) envelope.push([x, 0, z]);
        for (const x of [-halfWidth - 0.3, halfWidth + 0.3]) for (const y of [0, 1.2]) envelope.push([x, y, 0]);
        for (const step of this.currentPlay.steps) {
            for (const [id, position] of Object.entries(step.positions)) {
                if (id === 'ball') continue;
                const point = boardToWorld(position);
                for (const x of [-1, 1]) for (const y of [0, 2.4]) for (const z of [-1, 1]) {
                    envelope.push([point.x + x, y, point.z + z]);
                }
            }
        }
        for (const segment of this.timeline.segments.filter(item => item.trajectory)) {
            for (let i = 0; i <= 24; i++) {
                const point = segment.trajectory.sample(segment.trajectory.totalDuration * i / 24);
                envelope.push([point.x, point.y + 0.05, point.z]);
            }
        }
        this.sceneEnvelope=envelope;
        }
        const framing = fitCameraPreset(this.cameraPreset, width / height, reservedPixels / height, envelope, {courtFirst:Boolean(this.board.courtFirstComposition)});
        this.camera.clearViewOffset();
        this.camera.aspect = width / height;
        this.camera.fov = framing.fov;
        this.camera.position.fromArray(framing.position);
        this.camera.lookAt(...framing.target);
        this.cameraTarget = {x:framing.target[0],y:framing.target[1],z:framing.target[2]};
        // Shift the optical center into the usable area above the HUD.
        this.camera.setViewOffset(width, height, 0, reservedPixels / 2, width, height);
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld(true);
        updateParkCamera(this.parkObject,this.camera);
        this.updateBallReadability();
        this.cameraFraming = {
            aspect: width / height,
            usableAspect: width / Math.max(1, height - reservedPixels),
            reservedPixels,
            distanceScale: framing.distanceScale,
            position: [...framing.position],
            target: [...framing.target]
        };
    }

    updateBallReadability() {
        if(!this.readableBall||!this.camera)return;
        const time=this.lastState?.elapsed||0;
        this.readableBall.update(this.camera,this.elements.canvas.clientHeight,time,t=>this.sampleBall(t),this.lastState?.launched);
    }

    sampleBall(seconds) { return samplePlayBall(this.timeline, seconds); }

    setPlaybackRate(rate) { this.board.plays.setPlaybackRate(rate); this.updateUI(); }
    togglePlay() {
        if (!this.active) return;
        this.board.plays.cancelScheduledWork({preserveTransition:true});
        if (this.session.playing) this.session.pause(performance.now(), this.board.plays.timingScale);
        else this.session.play();
        this.updateUI(); this.startRenderLoop();
    }
    restart() {
        this.board.plays.cancelScheduledWork(); this.session.seek(0);
        this.applyAtTime(0); this.updateUI(); this.startRenderLoop();
    }

    startRenderLoop() {
        if (!this.active || document.hidden || this.renderLoopId !== null) return;
        this.renderLoopCount += 1;
        const frame = timestamp => {
            this.renderLoopId = null;
            if (!this.active || document.hidden) return;
            const elapsed = this.session.tick(timestamp, this.board.plays.timingScale);
            try {
                this.applyAtTime(elapsed);
                this.renderer.render(this.scene, this.camera);
            } catch(error) {
                this.exit();
                this.elements.loadStatus.textContent='Replay could not continue. Your board is safe. Try 3D View again.';
                this.elements.loadStatus.hidden=false;
                return;
            }
            this.updateUI();
            if (this.session.holding && this.session.playing && this.clock.playing) this.board.plays.scheduleHold();
            else if (this.session.playing && this.clock.playing) this.renderLoopId = requestAnimationFrame(frame);
        };
        this.renderLoopId = requestAnimationFrame(frame);
    }

    applyAtTime(seconds) {
        const segment=seconds>0?(this.timeline.segments.find(item=>seconds<item.endTime-1e-9)||this.timeline.segments.at(-1)):null;
        const local=segment?Math.max(0,Math.min(segment.duration,seconds-segment.startTime)):0;
        this.applyPixelActors(segment,local);
        const ball=this.sampleBall(seconds);
        this.ballObject.position.set(ball.x,ball.y,ball.z);
        this.lastState={...ball,elapsed:seconds,stepIndex:segment?.index||0};
        this.updateBallReadability();
        const status=segment?`${segment.step.label} · ${ball.phase}`:'Ready';
        if(this.elements.status.textContent!==status)this.elements.status.textContent=status;
        return this.lastState;
    }

    resize() {
        if (!this.renderer || !this.camera) return;
        const width = Math.max(1, this.elements.canvas.clientWidth);
        const height = Math.max(1, this.elements.canvas.clientHeight);
        this.renderer.setSize(width, height, false);
        this.applyCameraFraming();
        this.startRenderLoop();
    }

    updateUI() {
        if (!this.currentPlay) return;
        const index=this.currentStepIndex(),step=this.currentPlay.steps[index];
        const segment=this.timeline.segments.find(item=>this.clock.elapsed<item.endTime-1e-9)||this.timeline.segments.at(-1);
        const cueStep=this.timeline.segments.find(s=>s.rallyLeg===this.lastState?.rallyLeg)?.step;
        updateCoachingUI(this.elements,{playId:this.currentPlay.id,title:`${this.currentPlay.name} · 3D`,stepIndex:index,stepCount:this.currentPlay.steps.length,label:step.label,description:step.description,shotType:cueStep?.shot?.type||step.shot?.type,nextShot:Boolean(cueStep&&cueStep.id!==step.id),phase:this.session.holding?'complete':this.lastState?.phase,elapsed:this.clock.elapsed,eventTime:segment?.startTime||0,loop:true,reducedMotion:this.board.plays.reducedMotion.matches});
        this.elements.rate.value=String(this.clock.playbackRate);
        this.elements.playPause.textContent = this.session.playing ? 'Ⅱ' : '▶';
        this.elements.playPause.setAttribute('aria-label', this.session.playing ? 'Pause rally' : 'Play rally');
        this.elements.playPause.setAttribute('aria-pressed', String(this.session.playing));
        if (!this.session.playing && this.clock.elapsed === 0) this.elements.status.textContent = 'Ready';
        const chapters = this.board.plays.chapters || [];
        const chapter = chapterAtTime(chapters, this.clock.elapsed);
        this.shotTimeline?.update({ chapters, time: this.clock.elapsed, duration: this.session.duration,
            playing: this.session.playing, busy: Boolean(this.loading), currentShotId: chapter?.shotId || null });
        this.board.onCoachingState?.();
    }

    getState() {
        return {
            active: this.active,
            loop: true, holding: this.session.holding, iteration: this.session.iteration,
            playing: this.session.playing,
            elapsed: this.clock.elapsed,
            playbackRate: this.clock.playbackRate,
            camera: this.cameraPreset,
            playId: this.currentPlay?.id || null,
            playerCount: this.playerObjects.size,
            hasBall: Boolean(this.ballObject),
            renderLoopCount: this.renderLoopCount,
            pixelScale: this.pixelScale,
            framing: this.cameraFraming ? { ...this.cameraFraming } : null,
            lastState: this.lastState
        };
    }

    disposeScene() {
        this.renderer?.domElement.removeEventListener('webglcontextlost',this.boundContextLost);
        disposePark3D(this.parkObject);this.parkObject=null;
        this.readableBall?.dispose();this.readableBall=null;
        this.actorResources?.dispose();this.actorResources=null;
        this.scene?.traverse(object => {
            object.geometry?.dispose?.();
            if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
            else object.material?.dispose?.();
        });
        this.gradientMap?.dispose?.();
        this.renderer?.dispose?.();
        this.renderer?.forceContextLoss?.();
        this.elements.canvas.replaceChildren();
        this.playerObjects.clear();
        this.ballObject = null;
        this.courtObject = null;
        this.netObject = null;
        this.gradientMap = null;
        this.scene = null;
        this.renderer = null;
        this.camera = null;
        this.cameraFraming = null;
        this.sceneEnvelope=null;
    }

    exit({ preservePlayback = true } = {}) {
        if (!this.active && !this.scene) return false;
        const suspension=preservePlayback?this.session.suspend(performance.now(),this.board.plays.timingScale):null;
        if(!preservePlayback)this.session.pause(performance.now(),this.board.plays.timingScale);
        this.board.plays.cancelScheduledWork();
        this.session.owner='guided';
        this.active = false;
        if (this.renderLoopId !== null) cancelAnimationFrame(this.renderLoopId);
        this.renderLoopId = null;
        window.removeEventListener('resize', this.boundResize);
        document.removeEventListener('visibilitychange', this.boundVisibilityChange);
        this.disposeScene();
        this.elements.root.hidden = true;
        document.body.classList.remove('three-d-active');
        this.currentPlay = null;
        this.timeline = null;
        this.board.plays.applyAtTime(this.clock.elapsed);
        this.board.plays.status = this.session.complete ? 'complete' : 'paused';
        this.board.plays.updateUI();
        if(suspension&&this.session.resumeSuspension(suspension))this.board.plays.startPlaybackLoop();
        this.elements.enter.focus?.();
        return true;
    }
}

export { ThreeDPlaybackViewer };
