import { createStarterDocument, validateDocument, documentFromTemplate, MAX_SHOTS } from './play-document.js';
import { compileDocument, recompileAssistedDocument } from './play-compiler.js';
import { DraftStore, EditHistory, STORAGE_KEY } from './builder-storage.js';
import { mountBuilderUI } from './builder-ui.js';
import { BuilderCourtTools } from './builder-court-tools.js';
import { builderViewBox } from './builder-framing.js';
import { getWaypointPolicy } from './builder-waypoint-policy.js';
import { applyCoverageAssistance } from './coverage-assistance.js';
import { PICKLEBOARD_PLAYS } from './play-catalog.js';
import { buildShotChapters, chapterAtTime, mapSemanticPlayhead } from './shot-chapters.js';
const copy = value => structuredClone(value);
const id = () => crypto.randomUUID();

export class PlayBuilder {
    constructor(board) {
        this.board = board; this.view = '2d'; this.workspace = 'builder';
        this.board.courtFirstComposition = true;
        this.busy = false; this.generation = 0; this.sourceIntent = 0; this.message = ''; this.saveStatus = 'Starter draft · not saved yet';
        try { this.store = new DraftStore({ validate: validateDocument }); }
        catch { this.store = new DraftStore({validate:validateDocument,storage:{getItem:()=>null,setItem:()=>{throw Error('Browser storage is unavailable');}}}); this.saveStatus='Browser storage unavailable. Export a backup.'; }
        let document;
        try { document = this.store.loadLast(); } catch (error) { this.saveStatus = `Storage recovery needed: ${error.message}. Export your work as a backup.`; }
        this.document = document || createStarterDocument();
        if(document)this.saveStatus='Saved on this device';
        this.saveError=null;this.libraryDirty=true;this.library=[];
        this.history = new EditHistory(this.document); this.selectedShotId = this.document.shots[0]?.id || null;
        this.ui = mountBuilderUI({ onAction: (action, value) => this.action(action, value) });
        this.ui.element.addEventListener('scroll',()=>{this.fitCourt();this.courtTools?.render();},{passive:true});
        this.courtTools = new BuilderCourtTools(this);
        this.viewportChanged=()=>{
            const viewport=window.visualViewport;
            // Pinch zoom remains browser-owned. Avoid resizing the scene under it.
            if(viewport&&Math.abs(viewport.scale-1)>.01)return;
            if(this.courtTools.drag){this.courtTools.abort('Placement cancelled after the visible area changed.',false);this.scheduleRender();}
            this.ui.element.style.setProperty('--builder-visible-height',`${viewport?.height || innerHeight}px`);
            this.ui.element.style.setProperty('--builder-visible-top',`${viewport?.offsetTop || 0}px`);
            this.fitCourt();this.courtTools.render();
        };
        window.visualViewport?.addEventListener('resize',this.viewportChanged);
        window.visualViewport?.addEventListener('scroll',this.viewportChanged);
        window.addEventListener('resize',this.viewportChanged);
        this.board.onCoachingState = () => {if(this.view==='3d'&&!this.busy&&this.workspace==='builder'&&!this.board.threeD?.active){this.view='2d';this.message='3D stopped. Your draft and playhead are safe in 2D; retry 3D when ready.';}this.scheduleRender();};
        this.frame = null;
        this.chapters = Object.freeze([]);
        this.keyboard=event=>{
            // Modal focus owns its keys, including shortcuts which otherwise
            // bubble to this document listener from the dialog's buttons.
            if(event.defaultPrevented||globalThis.document.querySelector('dialog[open],#infoModal.active,#menuOverlay.active'))return;
            if(event.key==='Escape'&&this.courtTools.placing){this.courtTools.clear();this.message='Target placement cancelled.';this.render();return;}
            if(this.workspace==='builder'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.target.closest('input,textarea,select,[contenteditable]')){
                event.preventDefault();this.action(event.shiftKey?'redo':'undo');
            }
        };
        globalThis.document.addEventListener('keydown',this.keyboard);
        this.storageChanged=event=>{if(event.key===STORAGE_KEY){this.libraryDirty=true;this.message='Local drafts changed in another tab. Your current work stays here; saving checks for conflicts.';this.scheduleRender();}};
        window.addEventListener('storage',this.storageChanged);
        // Completed field edits are committed before backgrounding, never per frame.
        this.finishField=()=>{const field=globalThis.document.activeElement;if(this.ui.element.contains(field)&&field.matches('input:not([type=range]),textarea'))field.blur();};
        globalThis.document.addEventListener('visibilitychange',()=>{if(globalThis.document.hidden){this.finishField();this.courtTools.clear();}});
        window.addEventListener('pagehide',this.finishField);
        this.plannerSnapshot = board.captureBoardState(); this.savedPlayhead = 0;
        document = null;
        globalThis.document.body.classList.add('builder-workspace');
        this.installPlay(true); this.render();this.viewportChanged();
        this.switchView('3d');
    }
    get session() { return this.board.plays.session; }
    get waypointPolicy() {
        if(this.policyDocument!==this.document||this.policyAcknowledgement!==this.waypointAcknowledgement){
            this.policyDocument=this.document;this.policyAcknowledgement=this.waypointAcknowledgement;
            this.cachedWaypointPolicy=getWaypointPolicy(this.document,this.waypointAcknowledgement);
        }
        return this.cachedWaypointPolicy;
    }
    get selectedShot() { return this.document.shots.find(shot => shot.id === this.selectedShotId); }
    scheduleRender() {
        if (this.frame !== null) return;
        this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
    }
    render() {
        if(this.libraryDirty){try{this.library=this.store.list();}catch{/* Save status retains recovery information. */}this.libraryDirty=false;}const library=this.library;
        const segment=this.compiled?.timeline?.segments.find(s=>this.session.clock.elapsed<=s.endTime)||this.compiled?.timeline?.segments.at(-1);
        const currentChapter=chapterAtTime(this.chapters,this.session.clock.elapsed);
        // Playback identity follows the sampled chapter even while paused. The
        // separate selectedShotId keeps an open editor stable across playback.
        const cue={shotId:currentChapter?.shotId,title:currentChapter?`${currentChapter.number}. ${currentChapter.label}`:'Choose a shot',description:segment?.step.description||'Choose your first shot.'};
        this.ui.render({cue,waypointPolicy:this.waypointPolicy,document:this.document, selectedShotId:this.selectedShotId, findings:this.compiled?.findings || [],
            playing:this.session.playing, time:this.session.clock.elapsed, duration:this.session.duration, chapters:this.chapters, currentShotId:currentChapter?.shotId || null,
            view:this.view, workspace:this.workspace, saveStatus:this.saveStatus, saveError:this.saveError, library,
            templates:PICKLEBOARD_PLAYS.map(({id,name})=>({id,name})), loop:true, rate:this.session.clock.playbackRate,
            busy:this.busy, targetPlacement:this.courtTools.placing&&!this.courtTools.placement?.player, movementPlacement:Boolean(this.courtTools.placing&&this.courtTools.placement?.player), message:this.message, canUndo:this.history.canUndo, canRedo:this.history.canRedo,
            camera:this.board.threeD?.cameraPreset || 'overhead'});
        this.fitCourt(); this.courtTools.render();
    }
    fitCourt() {
        document.body.classList.toggle('builder-large-text',parseFloat(getComputedStyle(document.documentElement).fontSize)>24);
        const region=this.ui.element.querySelector(".builder-court-region");
        if(region!==this.observedRegion){this.regionObserver?.disconnect();this.observedRegion=region;if(region){this.regionObserver=new ResizeObserver(()=>this.fitCourt());this.regionObserver.observe(region);}}
        const surfaces=[document.querySelector(".court-container-fullscreen"),document.getElementById("threeDViewer")];
        if(this.workspace!=="builder"){for(const surface of surfaces)surface?.style.removeProperty("css-text");for(const surface of surfaces)if(surface)surface.style.cssText="";return;}
        if(!region)return;const rect=region.getBoundingClientRect();
        this.ui.element.style.setProperty('--builder-sheet-max-height',`${Math.max(100,rect.bottom-58-(window.visualViewport?.offsetTop||0))}px`);
        if(innerWidth>700&&innerHeight<=500){const meta=this.ui.element.querySelector('.builder-meta');if(meta)this.ui.element.style.setProperty('--builder-rail-sequence-top',`${meta.getBoundingClientRect().bottom-this.ui.element.getBoundingClientRect().top+4}px`);}
        // The context and playback strips already reserve their own grid rows.
        // An optional editor overlays the scene; its height must not also be
        // subtracted from the court or move the projection under a placement.
        const sceneHeight=Math.max(80,rect.height);const key=[rect.x,rect.y,rect.width,sceneHeight].join(":");
        if(key!==this.courtRect&&this.courtTools?.drag){this.courtTools.abort('Placement cancelled after the court resized.',false);this.scheduleRender();}
        for(const surface of surfaces)if(surface)Object.assign(surface.style,{position:"fixed",inset:"auto",left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,height:`${sceneHeight}px`,padding:"0"});
        const projection=this.board.projection;
        const projectionChanged=projection.configureViewport(rect.width,sceneHeight);
        if(this.fittedTimeline!==this.compiled.timeline||this.fittedProjection!==projection.name){
            this.fittedTimeline=this.compiled.timeline;this.fittedProjection=projection.name;
            this.board.presentationViewBox=builderViewBox(this.compiled.timeline.play,this.compiled.timeline,projection);
        }
        if(projectionChanged)this.board.applyProjection();
        const box=this.board.presentationViewBox;this.board.court.setAttribute('viewBox',`${box.x} ${box.y} ${box.width} ${box.height}`);
        const stage=document.getElementById("parkStage");if(stage){stage.style.width="100%";stage.style.height="100%";}
        if(key!==this.courtRect){this.courtRect=key;this.board.threeD?.resize?.();this.board.scheduleProjectionUpdate?.();}
    }
    pause() {
        this.board.plays.pause();
        if(this.board.threeD?.active) this.board.threeD.startRenderLoop();
    }
    installPlay(first = false, seconds = null) {
        const previousChapters=this.chapters,previousDuration=this.session.duration,previousTime=this.session.clock.elapsed;
        this.compiled = {...compileDocument(this.document)};
        if(this.compiled.play) {
            const assisted=applyCoverageAssistance(this.compiled.play,this.document,this.compiled.timeline);
            this.compiled=this.document.assistance.autoShading?{...recompileAssistedDocument(this.document,this.compiled,assisted.play,assisted.coverage)}:{...this.compiled,coverage:assisted.coverage};
        }
        const play = this.compiled.play || {id:this.document.id,name:this.document.title,description:'Incomplete draft',mode:'doubles',steps:[{id:'start',label:'Starting layout',description:'Add a shot to preview this draft.',durationMs:0,positions:copy(this.document.initialLayout)}]};
        const chapters=buildShotChapters(this.compiled.timeline,{shotIds:this.document.shots.slice(0,this.compiled.validShotCount).map(shot=>shot.id)});
        const mappedSeconds=seconds!=null?Math.max(0,Math.min(this.compiled.timeline.duration,seconds)):first?0:mapSemanticPlayhead(previousChapters,chapters,previousTime,previousDuration,this.compiled.timeline.duration);
        const engine=this.board.plays;
        if(first || !engine.activePlay) {
            engine.loadDefinition(play,this.compiled.timeline);
        } else engine.replaceDefinition(play,mappedSeconds,this.compiled.timeline);
        this.chapters=chapters;engine.chapters=chapters;
        for(const [player,settings] of Object.entries(this.document.players)) {
            const token=this.board.tokens[player]; if(!token)continue;
            token.handedness=settings.handedness; this.board.renderPlayerArtwork(token);
        }
        engine.session.seek(mappedSeconds); engine.applyAtTime(engine.clock.elapsed);
        if(this.board.threeD?.scene) this.board.threeD.replaceDefinition(play,engine.timeline);
        this.compiled.timeline=engine.timeline;
        this.courtTools?.render();
    }
    save() {
        try { this.store.save(this.document); this.saveStatus='Saved on this device';this.saveError=null;this.libraryDirty=true;return true; }
        catch(error) { this.saveError={conflict:error.code==='DRAFT_CONFLICT',message:error.message};this.saveStatus=this.saveError.conflict?'Not saved · changed in another tab':'Not saved · retry or export';return false; }
    }
    edit(change) {
        this.sourceIntent++;
        this.courtTools.clear();
        this.pause(); this.cancelPendingView();
        const draft=copy(this.document); change(draft); validateDocument(draft);
        this.history.commit(draft); this.document=this.history.current;
        if(!this.document.shots.some(s=>s.id===this.selectedShotId))this.selectedShotId=this.document.shots[0]?.id || null;
        // Findings have their own affected-shot route; routine edits should not
        // leave a permanent paragraph in the compact viewing strip.
        this.message='';
        this.installPlay(false);
        this.save(); this.render();
    }
    cancelPendingView() {
        this.generation++;
        if(this.busy) { this.board.threeD?.cancelLoading?.(); this.busy=false; this.view='2d'; }
    }
    async switchView(view) {
        if(this.workspace!=='builder')return;
        if(this.busy&&view==='2d'){this.cancelPendingView();this.message='3D loading cancelled. Continue in 2D.';this.render();return;}
        if(this.busy||view===this.view)return;
        this.courtTools.clear();
        const generation=++this.generation;
        if(view==='2d') {
            this.board.threeD?.suspend?.(); this.view='2d'; this.board.plays.applyAtTime(this.session.clock.elapsed);
        } else {
            this.busy=true; this.message='Opening 3D at the current playhead…'; this.render();
            const opened=await this.board.threeD.enter();
            if(generation!==this.generation||this.workspace!=='builder')return;
            this.busy=false;
            if(!opened){this.view='2d';this.message='3D is unavailable. Your draft is safe and editable in 2D. You can retry the view toggle.';this.render();return;}
            this.view='3d'; this.message='';this.board.threeD.ballObject.userData.minimumCSSDiameter=12;
            this.board.threeD.applyAtTime(this.session.clock.elapsed);
        }
        this.courtTools.bind(); this.render();
    }
    play() {
        this.courtTools.clear();this.message='';
        if(this.waypointPolicy.requiresConfirmation){this.message=this.waypointPolicy.message;this.render();return;}
        if(!this.compiled.validShotCount){this.message='Add or correct the first shot before playback.';this.render();return;}
        if(this.compiled.validShotCount<this.document.shots.length){this.pause();this.message=`Playback is paused because Shot ${this.compiled.validShotCount+1} is not valid yet. Fix that shot before previewing the rally.`;this.render();return;}
        if(this.view==='3d'&&this.board.threeD.active) {
            if(!this.session.playing)this.board.threeD.togglePlay();
        } else this.board.plays.play();
    }
    seek(seconds, { preserveIntent = false } = {}) {
        this.courtTools.clear();
        if(this.waypointPolicy.requiresConfirmation&&seconds>0){this.pause();this.message=this.waypointPolicy.message;this.render();return;}
        if(!preserveIntent)this.pause();
        this.session.seek(seconds,{preserveIntent});
        this.board.plays.applyAtTime(this.session.clock.elapsed);
        if(this.board.threeD?.scene) {this.board.threeD.applyAtTime(this.session.clock.elapsed);this.board.threeD.startRenderLoop();}
        if(preserveIntent)this.board.plays.continuePlayback();
        this.render();
    }
    async setWorkspace(workspace) {
        if(workspace===this.workspace)return;
        if(workspace==='planner')this.sourceIntent++;
        this.cancelPendingView(); this.pause();
        if(workspace==='planner') {
            this.savedPlayhead=this.session.clock.elapsed; this.savedView=this.view;
            this.workspace='planner';delete this.board.presentationViewBox;this.fittedTimeline=null;this.board.projection.configureViewport(innerWidth,innerHeight);this.board.applyProjection();this.board.courtFirstComposition=false;this.board.plays.exit();document.getElementById('parkStage').style.cssText='';this.courtRect=null; globalThis.document.body.classList.remove('builder-workspace');
            this.courtTools.clear();
        } else {
            if(this.board.plays.activePlay)this.board.plays.exit();
            this.plannerSnapshot=this.board.captureBoardState();
            this.workspace='builder';this.board.courtFirstComposition=true; this.view='2d'; globalThis.document.body.classList.add('builder-workspace');
            this.installPlay(true,this.savedPlayhead); this.render();
            if(this.savedView==='3d')await this.switchView('3d');
        }
        this.render();
    }
    loadDocument(value) {
        this.sourceIntent++;
        this.cancelPendingView(); this.pause(); validateDocument(value);
        this.document=copy(value); this.history=new EditHistory(this.document); this.selectedShotId=this.document.shots[0]?.id || null;
        this.installPlay(false,0); this.save(); this.render();
    }
    async action(action,value) {
        const replacesSource=['new','open','template','import'].includes(action);
        const sourceIntent=replacesSource?++this.sourceIntent:null;
        try {
            if(value?.shotId&&['editShot','editMovement'].includes(action)&&value.shotId!==this.selectedShotId)return {ok:false,error:'The selected shot changed; placement was cancelled.'};
            if(replacesSource&&this.saveError){this.message='Keep this unsaved work first: Retry save, Save As a copy, or export a backup before opening another play.';this.render();return {ok:false,error:this.message};}
            if(action==='retrySave'){this.save();this.render();return;}
            if(action==='acknowledgeWaypoints'){this.waypointAcknowledgement=this.waypointPolicy.key;this.message='Destination-only preview enabled. Original path points remain saved. Press Play when ready.';this.render();return;}
            if(action==='message'){this.message=String(value);this.render();return;}
            if(action==='view')return await this.switchView(value);
            if(action==='workspace')return await this.setWorkspace(value);
            if(action==='help'){this.courtTools.clear();this.pause();const trigger=this.ui.element.querySelector('.builder-menu summary');trigger?.focus({preventScroll:true});this.board.openInfoModal({returnFocus:trigger});return;}
            if(action==='appearance'){this.board.toggleTheme();this.render();return;}
            if(action==='playPause'){const playing=typeof value?.playing==='boolean'?value.playing:!this.session.playing;if(playing)this.play();else this.pause();}
            else if(action==='restart')this.seek(0);
            else if(action==='seek'){
                const time=Number(value);
                if(this.waypointPolicy.requiresConfirmation&&time>0){this.pause();this.message=this.waypointPolicy.message;}
                else if(this.compiled.validShotCount<this.document.shots.length&&time>0){this.pause();this.message=`Shot ${this.compiled.validShotCount+1} must be corrected before timeline preview.`;}
                else this.board.plays.timelineAction('seek',time);
            }
            else if(['scrubBegin','scrubSeek','scrubEnd','scrubCancel','chapter'].includes(action)){
                const chapter=action==='chapter'?this.chapters.find(item=>item.shotId===value):null;
                const blocked=action!=='scrubCancel'&&(this.waypointPolicy.requiresConfirmation||this.compiled.validShotCount<this.document.shots.length);
                if(blocked){this.pause();this.message=this.waypointPolicy.requiresConfirmation?this.waypointPolicy.message:`Shot ${this.compiled.validShotCount+1} must be corrected before timeline preview.`;}
                else if(action==='chapter'&&!chapter){this.pause();this.message='That authored shot has no valid timeline destination yet. Open it in Edit to correct it.';}
                else this.board.plays.timelineAction(action,value);
            }
            else if(action==='pauseForEditing')this.pause();
            else if(action==='rate')this.board.plays.setPlaybackRate(Number(value));
            else if(action==='loop')this.board.plays.setLoop(Boolean(value));
            else if(action==='camera'){this.courtTools.clear();this.board.threeD?.setCamera?.(value);}
            else if(action==='previous'||action==='next') {
                const shots=this.document.shots,index=shots.findIndex(s=>s.id===this.selectedShotId);
                this.selectedShotId=shots[Math.max(0,Math.min(shots.length-1,index+(action==='next'?1:-1)))]?.id || null;
                this.seek(this.compiled.timeline.segments[shots.findIndex(s=>s.id===this.selectedShotId)]?.startTime || 0);
            }
            else if(action==='selectShot'){
                const shotId=typeof value==='string'?value:value?.id;
                if(!this.document.shots.some(shot=>shot.id===shotId))return {ok:false,error:'Choose an authored shot.'};
                this.selectedShotId=shotId;
                if(!value?.preserveTime)this.seek(this.chapters.find(chapter=>chapter.shotId===shotId)?.anchor || 0);
            }
            else if(action==='cancelTarget'||action==='cancelMovement'){this.courtTools.clear();this.message='Target placement cancelled.';}
            else if(action==='placeTarget'){this.pause();if(this.courtTools.beginPlacement)this.courtTools.beginPlacement();else this.courtTools.placing=true;this.message=`Tap to place Shot ${this.document.shots.indexOf(this.selectedShot)+1}'s target. Cancel keeps the current target.`;}
            else if(action==='placeMovement'){
                const player=value.player;if(!this.document.players[player])throw Error('Choose a player for movement.');
                this.pause();this.courtTools.beginPlacement({field:player===this.selectedShot.hitter?'movement.target':`playerMovement.${player}.target`,player});
                this.message='Tap a movement destination to pin this player. Cancel keeps the current plan.';
            }
            else if(action==='editMovement')this.edit(doc=>{
                const shot=doc.shots.find(s=>s.id===this.selectedShotId);if(!shot||!doc.players[value.player])throw Error('Choose a player.');
                const movement=value.player===shot.hitter?shot.movement:((shot.playerMovement??={})[value.player]??={intent:'hold',pinned:false});
                if(!['target','target.x','target.y','intent','pinned'].includes(value.field))throw Error('Unknown movement field.');
                if(value.field.startsWith('target')){movement.target??=copy(doc.initialLayout[value.player]);if(value.field==='target')movement.target=copy(value.value);else movement.target[value.field.split('.')[1]]=value.value;movement.intent='manual';movement.pinned=true;}
                else movement[value.field]=value.value;
                if(movement.intent==='manual'&&!movement.target)movement.target=copy(doc.initialLayout[value.player]);
            });
            else if(action==='flight')this.edit(doc=>{const shot=doc.shots.find(s=>s.id===this.selectedShotId);shot.arc=value.arc;shot.pace=value.pace;});
            else if(action==='title')this.edit(doc=>{doc.title=String(value).slice(0,120);},{review:false});
            else if(action==='editShot')this.edit(doc=>{const shot=doc.shots.find(s=>s.id===this.selectedShotId);if(!shot)return;const parts=value.field.split('.');let cursor=shot;for(const part of parts.slice(0,-1)){if(['__proto__','constructor','prototype'].includes(part))throw Error('Invalid field');cursor=cursor[part]??={};}const key=parts.at(-1);if(value.field==='hitter'&&shot.hitter!==value.value){shot.playerMovement??={};shot.playerMovement[shot.hitter]=copy(shot.movement);shot.movement=shot.playerMovement[value.value]||{intent:'hold',pinned:false};delete shot.playerMovement[value.value];}if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid field');cursor[key]=value.value;if(value.field==='family'){if(shot.family==='serve')shot.serveMethod='volley';else delete shot.serveMethod;}if(value.field==='movement.intent'&&value.value==='manual'&&!shot.movement.target)shot.movement.target=copy(doc.initialLayout[shot.hitter]);});
            else if(action==='addShot')this.edit(doc=>{if(doc.shots.length>=MAX_SHOTS)throw Error(`A draft supports at most ${MAX_SHOTS} shots.`);const last=doc.shots.at(-1),hitter=last?(Number(last.hitter.at(-1))<=2?'player3':'player1'):'player1',near=Number(hitter.at(-1))>2;const shot={id:id(),family:last?'drive':'serve',hitter,receiver:'auto',contactStyle:'auto',target:{x:near?15:5,y:near?8:36},arc:'medium',pace:'medium',movement:{intent:'hold',pinned:false},...(last?{}:{serveMethod:'volley'})};doc.shots.push(shot);this.selectedShotId=shot.id;});
            else if(action==='deleteShot')this.edit(doc=>{doc.shots=doc.shots.filter(s=>s.id!==this.selectedShotId);});
            else if(action==='duplicateShot')this.edit(doc=>{if(doc.shots.length>=MAX_SHOTS)throw Error('Shot limit reached.');const i=doc.shots.findIndex(s=>s.id===this.selectedShotId);if(i>=0){const shot=copy(doc.shots[i]);shot.id=id();doc.shots.splice(i+1,0,shot);this.selectedShotId=shot.id;}});
            else if(action==='moveShot')this.edit(doc=>{const from=doc.shots.findIndex(s=>s.id===value.id),to=from+value.delta;if(from<0||to<0||to>=doc.shots.length)return;doc.shots.splice(to,0,doc.shots.splice(from,1)[0]);});
            else if(action==='assistance')this.edit(doc=>{doc.assistance[value.field]=value.value;});
            else if(action==='handedness')this.edit(doc=>{doc.players[value.id].handedness=value.value;});
            else if(['opening','ending','intentionalFault'].includes(action))this.edit(doc=>{doc[action]=value;});
            else if(action==='undo'||action==='redo') {
                this.sourceIntent++;
                this.pause();this.cancelPendingView();const restored=this.history[action]();if(restored){this.document=restored;if(!restored.shots.some(shot=>shot.id===this.selectedShotId))this.selectedShotId=restored.shots[0]?.id||null;this.installPlay(false);this.save();}
            }
            else if(action==='saveAs'){const draft=copy(this.document);draft.id=id();draft.title=`${draft.title} — copy`.slice(0,120);this.loadDocument(draft);}
            else if(replacesSource){
                if(this.workspace==='planner')await this.setWorkspace('builder');
                // Restoring the 3D view may await assets. A later play choice,
                // edit, history operation or return to Planner owns the source.
                if(sourceIntent!==this.sourceIntent)return {ok:false,error:'A newer edit or play choice was kept.'};
                if(action==='new'){const fresh=createStarterDocument();fresh.id=id();this.loadDocument(fresh);this.message='New starter draft. Choose targets or remove shots to begin from an empty sequence.';}
                else if(action==='open')this.loadDocument(this.store.open(value));
                else if(action==='template'){const template=PICKLEBOARD_PLAYS.find(p=>p.id===value);if(template){const draft=documentFromTemplate(template);draft.id=id();this.loadDocument(draft);}}
                else {const imported=this.store.importJSON(value);imported.id=id();this.loadDocument(imported);this.message='Imported as a separate copy. Existing saved plays were kept.';}
            }
            else if(action==='export'){const backup=this.store.exportJSON(this.document);this.ui.showExport?.(backup);const url=URL.createObjectURL(new Blob([this.store.exportJSON(this.document)],{type:'application/json'}));const a=globalThis.document.createElement('a');a.href=url;a.download='pickleballpark-play.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
            else if(action==='usePlanner') {
                const plannerIntent=++this.sourceIntent;
                this.pause();
                if(!await this.ui.confirmPlanner())return;
                if(plannerIntent!==this.sourceIntent)return {ok:false,error:'A newer edit or play choice was kept.'};
                const state=this.workspace==='planner'?this.board.captureBoardState():this.plannerSnapshot;await this.setWorkspace('builder');
                if(plannerIntent!==this.sourceIntent)return {ok:false,error:'A newer edit or play choice was kept.'};
                this.edit(doc=>{doc.initialLayout=copy(state.positions);for(const [key,handedness]of Object.entries(state.handedness))doc.players[key].handedness=handedness;doc.annotations=state.drawings.map(d=>({type:'path',d}));});
            }
            this.render();return {ok:true};
        } catch(error){this.message=error.message;this.render();return {ok:false,error:error.message};}
    }
}
function initialize(){const board=window.pickleboard;if(!board?.plays||!board.threeD)return;
    const start=()=>{if(!window.playBuilder)window.playBuilder=new PlayBuilder(board);};
    if(new URL(location.href).searchParams.get('workspace')==='planner'){
        const button=document.createElement('button');button.type='button';button.className='menu-btn';button.textContent='Build a Play';button.addEventListener('click',start);document.querySelector('.menu-content').prepend(button);
    }else start();
}
if(window.pickleboard?.threeD)initialize();else window.addEventListener('pickleboard:ready',initialize,{once:true});
