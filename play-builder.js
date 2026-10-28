import { createStarterDocument, validateDocument, documentFromTemplate, MAX_SHOTS } from './play-document.js';
import { DraftStore, EditHistory, STORAGE_KEY, DRAFT_CAPACITY_CODE } from './builder-storage.js';
import { mountBuilderUI, downloadPlayBackup } from './builder-ui.js';
import { BuilderCourtTools } from './builder-court-tools.js';
import { builderViewBox } from './builder-framing.js';
import { getWaypointPolicy } from './builder-waypoint-policy.js';
import { PICKLEBOARD_PLAYS } from './play-catalog.js';
import { buildShotChapters, chapterAtTime, mapSemanticPlayhead } from './shot-chapters.js';
import { handleDesktopSpace } from './keyboard-shortcuts.js';
import { proposeSmartAdd, proposeRandomRally } from './smart-rally-generator.js';
import { authorizeProposal, compileEffectiveCandidate, documentSourceIdentity, evaluateFullCandidate, proposeFamilyChange } from './rally-proposals.js';
import { proposeCoachFix, proposeCoachOptions } from './rally-coach.js';
import { playerLabel } from './player-labels.js';
import { resolveServiceContext, updateServiceFromShotEdit, updateServiceCourt } from './rally-state.js';
import { createRallyCoverageProvider } from './rally-coverage-provider.js';
const copy = value => structuredClone(value);
const id = () => crypto.randomUUID();
function claimShotFields(shot, fields) {
    if(Array.isArray(shot?.authoring?.fields))shot.authoring.fields=shot.authoring.fields.filter(field=>!fields.includes(field));
}

// An explicit edit claims the changed field. A value matching a generated
// default does not make it automatic again, including after export/import.
function claimChangedShotFields(before, after) {
    const previous = new Map(before.shots.map(shot => [shot.id, shot]));
    for (const shot of after.shots) {
        const old = previous.get(shot.id);
        if (!old || shot.authoring?.ownership !== 'automatic' || !Array.isArray(shot.authoring.fields)) continue;
        shot.authoring.fields = shot.authoring.fields.filter(field =>
            JSON.stringify(old[field]) === JSON.stringify(shot[field]));
    }
}

export class PlayBuilder {
    constructor(board) {
        this.board = board; this.view = '2d'; this.workspace = 'builder';
        this.board.courtFirstComposition = true;
        this.busy = false; this.generation = 0; this.sourceIntent = 0; this.message = ''; this.saveStatus = 'Starter draft · not saved yet';
        this.proposalGeneration = 0; this.proposalBusy = false; this.proposalProgress = null;
        this.proposalController = null; this.pendingAddCount = 0; this.addQueue = Promise.resolve();
        this.coachOptions = []; this.coachCandidates = new Map();
        try { this.store = new DraftStore({ validate: validateDocument }); }
        catch { this.store = new DraftStore({validate:validateDocument,storage:{getItem:()=>null,setItem:()=>{throw Error('Browser storage is unavailable');}}}); this.saveStatus='Browser storage unavailable. Export a backup.'; }
        let document;
        try { document = this.store.loadLast(); } catch (error) { this.saveStatus = `Storage recovery needed: ${error.message}. Export your work as a backup.`; }
        this.document = document || createStarterDocument();
        // Fresh tabs have independent unsaved work. A shared starter id would
        // let a later first save overwrite another tab before either observed it.
        if(!document)this.document.id=id();
        if(document)this.saveStatus='Saved on this device';
        this.pristineSource=JSON.stringify(this.document);
        this.persistedSource=document?this.pristineSource:null;
        this.saveError=null;this.libraryDirty=true;this.library=[];
        this.history = new EditHistory(this.document); this.selectedShotId = this.document.shots[0]?.id || null;
        // Read the installed source on every sample so edits, imports and Undo
        // share the renderer's playhead without retaining an obsolete timeline.
        this.board.coverageSnapshotProvider = createRallyCoverageProvider(() => {
            if (this.workspace !== 'builder') return null;
            return {
                play: this.board.plays.activePlay,
                timeline: this.board.plays.timeline,
                document: this.document,
                positions: Object.fromEntries(Object.keys(this.document.players).map(playerId => [
                    playerId, { x: this.board.tokens[playerId].x, y: this.board.tokens[playerId].y }
                ]))
            };
        });
        this.ui = mountBuilderUI({ onAction: (action, value) => this.action(action, value) });
        this.ui.element.addEventListener('scroll',()=>{this.fitCourt();this.courtTools?.render();},{passive:true});
        this.courtTools = new BuilderCourtTools(this);
        this.viewportChanged=()=>{
            const viewport=window.visualViewport;
            // Pinch zoom remains browser-owned. Avoid resizing the scene under it.
            if(viewport&&Math.abs(viewport.scale-1)>.01)return;
            if(this.courtTools.drag||this.courtTools.placing){this.courtTools.abort('Placement cancelled after the visible area changed.',false);this.scheduleRender();}
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
            if(this.workspace==='builder'&&handleDesktopSpace(event,()=>this.action('playPause'),{activeElement:globalThis.document.activeElement}))return;
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
        // Detailed artwork lives in a dimensional court with a freely movable camera.
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
    get hasUnsavedChanges() {
        const baseline=this.persistedSource??this.pristineSource;
        // Authored edits replace the document. Playback renders reuse it and
        // must not serialize a long rally or inspect storage on every frame.
        if(this.dirtyDocument!==this.document||this.dirtyBaseline!==baseline){
            this.dirtyDocument=this.document;this.dirtyBaseline=baseline;
            this.dirtySource=JSON.stringify(this.document)!==baseline;
        }
        return this.dirtySource;
    }
    scheduleRender() {
        if (this.frame !== null) return;
        this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
    }
    render() {
        if(this.libraryDirty){try{this.library=this.store.list({includeRevision:true});}catch{/* Save status retains recovery information. */}this.libraryDirty=false;}const library=this.library;
        const segment=this.compiled?.timeline?.segments.find(s=>this.session.clock.elapsed<=s.endTime)||this.compiled?.timeline?.segments.at(-1);
        const currentChapter=chapterAtTime(this.chapters,this.session.clock.elapsed);
        // Playback identity follows the sampled chapter even while paused. The
        // separate selectedShotId keeps an open editor stable across playback.
        const cue={shotId:currentChapter?.shotId,title:currentChapter?`${currentChapter.number}. ${currentChapter.label}`:'Choose a shot',description:segment?.step.description||'Choose your first shot.'};
        this.ui.render({cue,waypointPolicy:this.waypointPolicy,document:this.document, selectedShotId:this.selectedShotId, findings:this.compiled?.findings || [],
            playing:this.session.playing, time:this.session.clock.elapsed, duration:this.session.duration, chapters:this.chapters, currentShotId:currentChapter?.shotId || null,
            view:this.view, workspace:this.workspace, saveStatus:this.saveStatus, saveError:this.saveError, unsavedChanges:this.hasUnsavedChanges, library,
            templates:PICKLEBOARD_PLAYS.map(({id,name})=>({id,name})), loop:true, rate:this.session.clock.playbackRate,
            busy:this.busy, retry3D:this.graphicsUnavailable&&this.view==='2d'&&!this.busy, targetPlacement:this.courtTools.placing&&!this.courtTools.placement?.player, movementPlacement:Boolean(this.courtTools.placing&&this.courtTools.placement?.player), message:this.message, canUndo:this.history.canUndo, canRedo:this.history.canRedo,
            proposalBusy:this.proposalBusy, proposalProgress:this.proposalProgress, coachOptions:this.coachOptions,
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
        // The menu scrolls within the space above playback, including short
        // screens and enlarged text. Its overflow never covers the transport.
        const menu=this.ui.element.querySelector('.builder-main-menu');
        const transport=this.ui.element.querySelector('.builder-transport');
        if(menu&&transport){
            const visibleBottom=window.visualViewport?visualViewport.height+visualViewport.offsetTop:innerHeight;
            const menuBottom=Math.min(visibleBottom,transport.getBoundingClientRect().top);
            this.ui.element.style.setProperty('--builder-menu-max-height',`${Math.max(80,menuBottom-menu.getBoundingClientRect().bottom-14)}px`);
            // The phone popup is fixed to the viewport. Coverage controls and
            // enlarged text can grow the dock beyond its original fixed offset.
            this.ui.element.style.setProperty('--builder-menu-bottom-offset',`${Math.max(0,innerHeight-menuBottom+8)}px`);
        }
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
        this.compiled = {...compileEffectiveCandidate(this.document)};
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
        try { this.store.save(this.document);this.persistedSource=JSON.stringify(this.document);this.saveStatus='Saved on this device';this.saveError=null;this.libraryDirty=true;return true; }
        catch(error) { this.saveError={conflict:error.code==='DRAFT_CONFLICT',libraryFull:error.code===DRAFT_CAPACITY_CODE,message:error.message};this.saveStatus=this.saveError.conflict?'Not saved · changed in another tab':this.saveError.libraryFull?'Not saved · My Plays is full':'Not saved · retry or export';return false; }
    }
    edit(change, { automatic = false, proposalGeneration = null } = {}) {
        if(proposalGeneration!==null&&proposalGeneration!==this.proposalGeneration)throw Error('A newer edit was kept. Please try again.');
        if(proposalGeneration===null)this.cancelPendingProposals();
        this.coachOptions=[];this.coachCandidates.clear();
        this.sourceIntent++;
        this.courtTools.clear();
        this.pause(); this.cancelPendingView();
        const draft=copy(this.document); change(draft);
        if (!automatic) claimChangedShotFields(this.document, draft);
        validateDocument(draft);
        const changed=JSON.stringify(draft)!==JSON.stringify(this.document);
        this.history.commit(draft); this.document=this.history.current;
        if(!this.document.shots.some(s=>s.id===this.selectedShotId))this.selectedShotId=this.document.shots[0]?.id || null;
        // Findings have their own affected-shot route; routine edits should not
        // leave a permanent paragraph in the compact viewing strip.
        this.message='';
        this.installPlay(false);
        if(changed||this.persistedSource!==null||this.hasUnsavedChanges)this.save();
        this.render();
    }
    cancelPendingProposals() {
        this.proposalController?.abort(); this.proposalController=null;
        this.proposalGeneration++; this.pendingAddCount=0; this.addQueue=Promise.resolve();
        this.proposalBusy=false; this.proposalProgress=null;
        this.coachOptions=[];this.coachCandidates?.clear();
    }
    proposalIsCurrent(generation, revision, proposal) {
        return generation===this.proposalGeneration&&revision===this.sourceIntent&&
            proposal.sourceIdentity===documentSourceIdentity(this.document);
    }
    applyProposalDocument(candidate, generation) {
        this.edit(draft=>{
            for(const key of Object.keys(draft))delete draft[key];
            Object.assign(draft,copy(candidate));
        },{automatic:true,proposalGeneration:generation});
    }
    queueSmartAdd(options={}) {
        if(this.document.shots.length+this.pendingAddCount>=MAX_SHOTS){
            this.message=`A rally supports at most ${MAX_SHOTS} hits, including queued additions.`;this.render();
            return Promise.resolve({ok:false,error:this.message});
        }
        if(!this.pendingAddCount){
            this.cancelPendingProposals();this.proposalController=new AbortController();
        }
        const generation=this.proposalGeneration,signal=this.proposalController.signal;
        this.pendingAddCount++;this.proposalBusy=true;this.pause();this.courtTools.clear();
        this.proposalProgress={label:'Adding compatible shots',completed:0,total:this.pendingAddCount};this.render();
        const task=this.addQueue.then(async()=>{
            if(signal.aborted||generation!==this.proposalGeneration)return {ok:false,error:'Addition cancelled.'};
            const revision=this.sourceIntent;
            const seed=options.seed??crypto.getRandomValues(new Uint32Array(1))[0];
            const proposal=await proposeSmartAdd(this.document,{seed,signal});
            if(!this.proposalIsCurrent(generation,revision,proposal)||signal.aborted)return {ok:false,error:'A newer edit was kept; the old addition was cancelled.'};
            const authorized=authorizeProposal(proposal,this.document,{operation:'smart-add'});
            if(!authorized.ok){this.message=`${authorized.reason} Your current rally is unchanged. Review the issue with Coach.`;return {ok:false,error:this.message};}
            this.selectedShotId=authorized.document.shots.at(-1).id;
            this.applyProposalDocument(authorized.document,generation);
            this.seek(this.chapters.find(chapter=>chapter.shotId===this.selectedShotId)?.anchor||0);
            this.message=`Added Shot ${this.document.shots.length}. Undo is available.`;
            return {ok:true};
        }).catch(error=>{if(generation===this.proposalGeneration)this.message=error.message;return {ok:false,error:error.message};}).finally(()=>{
            if(generation!==this.proposalGeneration)return;
            this.pendingAddCount=Math.max(0,this.pendingAddCount-1);
            this.proposalBusy=this.pendingAddCount>0;
            this.proposalProgress=this.pendingAddCount?{label:'Adding compatible shots',completed:0,total:this.pendingAddCount}:null;
            if(!this.pendingAddCount)this.proposalController=null;
            this.render();
        });
        this.addQueue=task;return task;
    }
    async randomRally({count,seed}={}) {
        this.cancelPendingProposals();this.pause();this.courtTools.clear();
        if(!Number.isInteger(count)||count<1||count>MAX_SHOTS){this.message=`Choose a whole number of hits from 1 to ${MAX_SHOTS}.`;this.render();return {ok:false,error:this.message};}
        // Claim no new draft until the current one is safely retained.
        if((this.hasUnsavedChanges||this.saveError)&&!this.save()){this.message='Keep this play first: retry saving, Save As a copy, or export a backup.';this.render();return {ok:false,error:this.message};}
        const previousWasSaved=this.persistedSource!==null;
        const generation=this.proposalGeneration,revision=this.sourceIntent;
        const controller=this.proposalController=new AbortController();
        this.proposalBusy=true;this.proposalProgress={label:'Building rally',completed:0,total:count};this.render();
        try {
            const proposal=await proposeRandomRally({length:count,sourceDocument:this.document,seed:seed??crypto.getRandomValues(new Uint32Array(1))[0],signal:controller.signal,
                onProgress:progress=>{if(generation!==this.proposalGeneration)return;this.proposalProgress={label:'Building rally',completed:progress.shot,total:count};this.render();}});
            if(controller.signal.aborted||!this.proposalIsCurrent(generation,revision,proposal))return {ok:false,error:'Generation cancelled; the newer play was kept.'};
            const authorized=authorizeProposal(proposal,this.document,{operation:'random-rally'});
            if(!authorized.ok){this.message=authorized.reason;return {ok:false,error:this.message};}
            const candidate=authorized.document;candidate.id=id();
            this.loadDocument(candidate);
            this.message=previousWasSaved?`New ${count}-hit rally ready. The previous play remains in My Plays. Press Play when ready.`:`New ${count}-hit rally saved in My Plays. Press Play when ready.`;
            return {ok:true};
        } catch(error){if(generation===this.proposalGeneration)this.message=error.message;return {ok:false,error:error.message};}
        finally {if(generation===this.proposalGeneration){this.proposalBusy=false;this.proposalProgress=null;this.proposalController=null;}this.render();}
    }
    async changeFamily(family) {
        this.cancelPendingProposals();this.pause();
        const generation=this.proposalGeneration,revision=this.sourceIntent,shotId=this.selectedShotId;
        const proposal=await proposeFamilyChange(this.document,{shotId,family});
        if(!this.proposalIsCurrent(generation,revision,proposal))return {ok:false,error:'A newer edit was kept.'};
        if(!proposal.document)throw Error(proposal.reason);
        const changed=proposal.document.shots.find(shot=>shot.id===shotId);
        if(changed?.authoring?.fields)changed.authoring.fields=changed.authoring.fields.filter(field=>field!=='family');
        this.applyProposalDocument(proposal.document,generation);
        if(!proposal.ok)this.message=`Applied ${family}. The rally now needs review: ${proposal.reason} Coach can evaluate repair options.`;
        this.render();return {ok:true,playable:proposal.ok};
    }
    async insertShot({position,shotId=this.selectedShotId}={}) {
        const index=this.document.shots.findIndex(shot=>shot.id===shotId);
        if(index<0||!['before','after'].includes(position))throw Error('Choose a shot and an insertion position.');
        if(this.document.shots.length>=MAX_SHOTS)throw Error(`A rally supports at most ${MAX_SHOTS} hits.`);
        this.cancelPendingProposals();this.pause();
        const at=index+(position==='after'?1:0),generation=this.proposalGeneration,revision=this.sourceIntent;
        const originalIdentity=documentSourceIdentity(this.document),prefix=copy(this.document);
        prefix.shots=prefix.shots.slice(0,at);prefix.ending='stop';prefix.intentionalFault=false;
        const proposal=await proposeSmartAdd(prefix,{seed:crypto.getRandomValues(new Uint32Array(1))[0]});
        if(generation!==this.proposalGeneration||revision!==this.sourceIntent||originalIdentity!==documentSourceIdentity(this.document))return {ok:false,error:'A newer edit was kept.'};
        if(!proposal.ok)throw Error(proposal.reason);
        const shot=copy(proposal.document.shots.at(-1));shot.id=id();
        this.selectedShotId=shot.id;
        this.edit(doc=>doc.shots.splice(at,0,shot),{automatic:true,proposalGeneration:generation});
        this.message=this.compiled.validShotCount===this.document.shots.length?'Shot inserted. Undo is available.':'Shot inserted; later authored intent was kept. Review the highlighted downstream conflict, or Undo.';
        this.render();return {ok:true};
    }
    async requestCoach(optionsOnly=false) {
        this.cancelPendingProposals();this.pause();this.courtTools.clear();
        const generation=this.proposalGeneration,revision=this.sourceIntent;
        const controller=this.proposalController=new AbortController();
        this.proposalBusy=true;this.proposalProgress={label:'Coach is checking the complete rally'};this.render();
        try {
            const result=optionsOnly?await proposeCoachOptions(this.document,{signal:controller.signal}):await proposeCoachFix(this.document,{signal:controller.signal});
            if(controller.signal.aborted||!this.proposalIsCurrent(generation,revision,result))return {ok:false,error:'The play changed; ask Coach to review the new version.'};
            if(optionsOnly){
                const candidates=result.slice(0,6);
                for(const proposal of candidates)this.coachCandidates.set(proposal.candidateIdentity,{proposal,revision});
                const valueText=value=>{
                    if(value===undefined||value===null)return 'none';
                    if(typeof value==='string'&&this.document.players[value])return playerLabel(value,this.document);
                    if(typeof value==='object')return Object.entries(value).map(([key,item])=>`${this.document.players[key]?playerLabel(key,this.document):key}: ${valueText(item)}`).join(', ');
                    return String(value);
                };
                const changeLabel=path=>path.replace(/shots\[(\d+)\]/,(_,n)=>`Shot ${Number(n)+1}`).replace(/player[1-4]/g,id=>playerLabel(id,this.document)).replace(/initialLayout/g,'Starting positions').replace(/playerMovement/g,'partner movement').replace(/\./g,' · ');
                this.coachOptions=candidates.map((proposal,index)=>({
                    id:proposal.candidateIdentity,
                    label:`Apply option ${index+1}${proposal.requiresConsent?' · changes authored settings':''}`,
                    description:proposal.changes.map(change=>`${changeLabel(change.path)}: ${valueText(change.before)} → ${valueText(change.after)}`).join('; '),
                    changes:proposal.changes,requiresConsent:proposal.requiresConsent
                }));
                this.message=candidates.length?'Coach found validated options. Review the listed changes before applying one.':result.reason||'Coach found no safe repair within this model. Your play was kept.';
                return {ok:true,options:candidates.length};
            }
            if(!result.ok||result.requiresConsent){this.message=result.reason||'A protected setting needs your approval. Choose Show options.';return {ok:false,error:this.message};}
            const authorized=authorizeProposal(result,this.document,{operation:'coach-fix'});
            if(!authorized.ok||!evaluateFullCandidate(authorized.document).ok)throw Error(authorized.reason||'Coach could not validate the complete repaired rally. Your play was kept.');
            this.applyProposalDocument(authorized.document,generation);
            this.message=`Fixed ${result.affectedShots?.length?`Shot ${result.affectedShots.join(', ')}`:'the rally'} using automatic settings. Authored targets and manual pins were kept. Undo is available.`;
            return {ok:true};
        } catch(error){if(generation===this.proposalGeneration)this.message=error.message;return {ok:false,error:error.message};}
        finally {if(generation===this.proposalGeneration){this.proposalBusy=false;this.proposalProgress=null;this.proposalController=null;}this.render();}
    }
    applyCoachOption(optionId) {
        const entry=this.coachCandidates.get(optionId);
        if(!entry||entry.revision!==this.sourceIntent)throw Error('That Coach proposal is stale. Ask Coach to check this play again.');
        const authorized=authorizeProposal(entry.proposal,this.document,{operation:'coach-option'});
        if(!authorized.ok||!evaluateFullCandidate(authorized.document).ok)throw Error(authorized.reason||'The repair no longer passes complete validation.');
        const changes=entry.proposal.changes,consented=entry.proposal.requiresConsent;
        if(consented)for(const change of changes){
            const match=/^shots\[(\d+)\]\.([^.]+)/.exec(change.path);
            const shot=match&&authorized.document.shots[Number(match[1])];
            if(shot?.authoring?.fields)shot.authoring.fields=shot.authoring.fields.filter(field=>field!==match[2]);
        }
        this.applyProposalDocument(authorized.document,this.proposalGeneration);
        const labels=changes.map(change=>change.path.replace(/shots\[(\d+)\]/,(_,n)=>`Shot ${Number(n)+1}`).replace(/player[1-4]/g,id=>playerLabel(id,this.document)).replace(/initialLayout/g,'Starting positions').replace(/playerMovement/g,'partner movement').replace(/\./g,' · '));
        this.message=`Applied the reviewed Coach changes: ${labels.join(', ')}. Undo is available.`;
        this.render();return {ok:true};
    }
    cancelPendingView() {
        window.courtStartup?.complete();
        this.generation++;
        if(this.busy) { this.board.threeD?.cancelLoading?.(); this.busy=false; this.view='2d'; }
        globalThis.document.documentElement.removeAttribute('data-court-loading');
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
            let timer;
            let opened=false;
            try {
                opened=await Promise.race([
                    Promise.resolve().then(()=>this.board.threeD.enter()),
                    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('3D startup timed out')),12000);})
                ]);
            } catch {
                // Only this attempt may cancel its loader. An older rejection or
                // deadline must not interrupt a newer view request.
                if(generation===this.generation&&this.workspace==='builder')this.board.threeD?.cancelLoading?.();
            } finally { clearTimeout(timer); }
            if(generation!==this.generation||this.workspace!=='builder')return;
            this.busy=false;
            window.courtStartup?.complete();
            globalThis.document.documentElement.removeAttribute('data-court-loading');
            if(!opened){this.graphicsUnavailable=true;this.view='2d';this.message='3D is unavailable. Your draft is safe and editable in 2D. Choose Retry 3D to try again.';this.render();return;}
            this.graphicsUnavailable=false;this.view='3d'; this.message='';this.board.threeD.ballObject.userData.minimumCSSDiameter=12;
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
        this.cancelPendingProposals();
        if(workspace==='planner')this.sourceIntent++;
        this.cancelPendingView(); this.pause();
        if(workspace==='planner') {
            this.savedPlayhead=this.session.clock.elapsed; this.savedView=this.view;
            this.workspace='planner';delete this.board.presentationViewBox;this.fittedTimeline=null;this.board.projection.configureViewport(innerWidth,innerHeight);this.board.applyProjection();this.board.courtFirstComposition=false;this.board.plays.exit();document.getElementById('parkStage').style.cssText='';this.courtRect=null; globalThis.document.body.classList.remove('builder-workspace');
            this.courtTools.clear();
        } else {
            if(this.board.plays.activePlay)this.board.plays.exit();
            this.board.endDrag?.();if(this.board.isDrawing)this.board.endDrawing?.();
            this.plannerSnapshot=this.board.captureBoardState();
            this.workspace='builder';this.board.courtFirstComposition=true; this.view='2d'; globalThis.document.body.classList.add('builder-workspace');
            this.installPlay(true,this.savedPlayhead); this.render();
            if(this.savedView==='3d')await this.switchView('3d');
        }
        this.render();
    }
    loadDocument(value, { persist = true, saved = false } = {}) {
        // Explicit copies/imports/generation commit before replacing the visible
        // draft. Quota, capacity and conflict errors leave that draft untouched.
        validateDocument(value);
        const next=copy(value);
        if(persist)this.store.save(next);
        this.cancelPendingProposals();
        this.sourceIntent++;
        this.cancelPendingView(); this.pause();
        this.document=next;this.pristineSource=JSON.stringify(next);this.persistedSource=persist||saved?this.pristineSource:null;
        this.saveError=null;this.saveStatus=this.persistedSource?'Saved on this device':'Draft · not saved yet';this.libraryDirty=true;
        this.history=new EditHistory(this.document); this.selectedShotId=this.document.shots[0]?.id || null;
        this.installPlay(false,0); this.render();
    }
    async action(action,value) {
        const replacesSource=['new','open','template','import'].includes(action);
        if(replacesSource)this.cancelPendingProposals();
        const sourceIntent=replacesSource?++this.sourceIntent:null;
        try {
            if(value?.shotId&&['editShot','editMovement'].includes(action)&&value.shotId!==this.selectedShotId)return {ok:false,error:'The selected shot changed; placement was cancelled.'};
            if(replacesSource&&(this.hasUnsavedChanges||(this.saveError&&!this.saveError.libraryFull))){this.message='Keep this unsaved work first: Retry save or Save As a copy before opening another play. My Plays remains available to delete a saved play and make room; Export creates a backup.';this.render();return {ok:false,error:this.message};}
            if(action==='retrySave'){this.save();this.render();return;}
            if(action==='deletePlay'){
                const playId=typeof value==='string'?value:value?.id;
                const revision=typeof value==='string'?this.library.find(item=>item.id===playId)?.revision:value?.revision;
                const deleted=this.store.remove(playId,{expectedRevision:revision});
                if(deleted&&playId===this.document.id){
                    const dirty=this.hasUnsavedChanges;
                    this.persistedSource=null;
                    if(!dirty){this.pristineSource=JSON.stringify(this.document);this.saveError=null;}
                    this.saveStatus=dirty?'Saved copy deleted · current changes not saved':'Removed from My Plays · not saved yet';
                }
                if(deleted&&this.saveError?.libraryFull){
                    this.saveError={...this.saveError,libraryFull:false,message:'Space was freed. Retry saving your current draft.'};
                    this.saveStatus='Not saved · retry save';
                }
                this.libraryDirty=true;this.message=deleted?'Saved play deleted. Your current court stays here.':'That saved play is already gone.';this.render();
                return {ok:true,deleted,id:playId};
            }
            if(action==='addShot')return await this.queueSmartAdd(value);
            if(action==='randomRally')return await this.randomRally(value);
            if(action==='insertShot')return await this.insertShot(value);
            if(action==='cancelProposal'){this.cancelPendingProposals();this.message='Cancelled. Your current play was kept.';this.render();return {ok:true};}
            if(action==='coachFix')return await this.requestCoach(false);
            if(action==='coachOptions')return await this.requestCoach(true);
            if(action==='coachApply')return this.applyCoachOption(value?.id||value);
            if(action==='coachKeep'){this.cancelPendingProposals();this.message='Kept as authored. The existing validation issue remains visible.';this.render();return {ok:true};}
            if(action==='editShot'&&value.field==='family')return await this.changeFamily(value.value);
            if(action==='editServiceCourt'){
                this.edit(doc=>{
                    const context=resolveServiceContext(doc);
                    if(!context.known)throw Error('Choose the designated receiver on the serve before setting its serving court.');
                    if(!['right','left','unspecified'].includes(value))throw Error('Choose a supported serving court.');
                    updateServiceCourt(doc,value);
                });
                return {ok:true};
            }
            if(action==='acknowledgeWaypoints'){this.waypointAcknowledgement=this.waypointPolicy.key;this.message='Destination-only preview enabled. Original path points remain saved. Press Play when ready.';this.render();return;}
            if(action==='message'){this.message=String(value);this.render();return;}
            if(action==='view')return await this.switchView(value);
            if(action==='workspace')return await this.setWorkspace(value);
            if(action==='buildDiagnostics'){await this.action('help',{diagnostics:true});return;}
            if(action==='help'){this.courtTools.clear();this.board.endDrag?.();if(this.board.isDrawing)this.board.endDrawing?.();this.pause();this.render();const trigger=this.ui.element.querySelector('.builder-menu summary');trigger?.focus({preventScroll:true});this.board.openInfoModal({returnFocus:trigger,...(value?.diagnostics?{initialFocus:globalThis.document.querySelector('#buildDiagnostics h3')}:{})});if(value?.diagnostics)this.board.buildDiagnostics.open();return;}
            if(action==='appearance'){this.board.toggleTheme();this.render();return;}
            if(action==='playPause'){const playing=typeof value?.playing==='boolean'?value.playing:!this.session.playing;if(playing)this.play();else this.pause();}
            else if(action==='restart')this.seek(0);
            else if(action==='seek'){
                if(this.courtTools.placing||this.courtTools.drag){this.courtTools.clear();this.message='Placement cancelled before timeline navigation.';}
                const time=Number(value);
                if(this.waypointPolicy.requiresConfirmation&&time>0){this.pause();this.message=this.waypointPolicy.message;}
                else if(this.compiled.validShotCount<this.document.shots.length&&time>0){this.pause();this.message=`Shot ${this.compiled.validShotCount+1} must be corrected before timeline preview.`;}
                else this.board.plays.timelineAction('seek',time);
            }
            else if(['scrubBegin','scrubSeek','scrubEnd','scrubCancel','chapter'].includes(action)){
                if(this.courtTools.placing||this.courtTools.drag){this.courtTools.clear();this.message='Placement cancelled before timeline navigation.';}
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
                claimShotFields(shot,[value.player===shot.hitter?'movement':'playerMovement']);
                const movement=value.player===shot.hitter?shot.movement:((shot.playerMovement??={})[value.player]??={intent:'hold',pinned:false});
                if(!['target','target.x','target.y','intent','pinned'].includes(value.field))throw Error('Unknown movement field.');
                if(value.field.startsWith('target')){movement.target??=copy(doc.initialLayout[value.player]);if(value.field==='target')movement.target=copy(value.value);else movement.target[value.field.split('.')[1]]=value.value;movement.intent='manual';movement.pinned=true;}
                else movement[value.field]=value.value;
                if(movement.intent==='manual'&&!movement.target)movement.target=copy(doc.initialLayout[value.player]);
            });
            else if(action==='flight')this.edit(doc=>{const shot=doc.shots.find(s=>s.id===this.selectedShotId);claimShotFields(shot,['arc','pace']);shot.arc=value.arc;shot.pace=value.pace;});
            else if(action==='title')this.edit(doc=>{doc.title=String(value).slice(0,120);},{review:false});
            else if(action==='editShot')this.edit(doc=>{const shot=doc.shots.find(s=>s.id===this.selectedShotId);if(!shot)return;claimShotFields(shot,[value.field.split('.')[0]]);const parts=value.field.split('.');let cursor=shot;for(const part of parts.slice(0,-1)){if(['__proto__','constructor','prototype'].includes(part))throw Error('Invalid field');cursor=cursor[part]??={};}const key=parts.at(-1);if(value.field==='hitter'&&shot.hitter!==value.value){shot.playerMovement??={};shot.playerMovement[shot.hitter]=copy(shot.movement);shot.movement=shot.playerMovement[value.value]||{intent:'hold',pinned:false};delete shot.playerMovement[value.value];}if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid field');cursor[key]=value.value;updateServiceFromShotEdit(doc,shot,value.field);if(value.field==='family'){if(shot.family==='serve')shot.serveMethod='volley';else delete shot.serveMethod;}if(value.field==='movement.intent'&&value.value==='manual'&&!shot.movement.target)shot.movement.target=copy(doc.initialLayout[shot.hitter]);});
            else if(action==='deleteShot')this.edit(doc=>{doc.shots=doc.shots.filter(s=>s.id!==(value||this.selectedShotId));});
            else if(action==='duplicateShot')this.edit(doc=>{if(doc.shots.length>=MAX_SHOTS)throw Error('Shot limit reached.');const i=doc.shots.findIndex(s=>s.id===(value||this.selectedShotId));if(i>=0){const shot=copy(doc.shots[i]);shot.id=id();delete shot.authoring;doc.shots.splice(i+1,0,shot);this.selectedShotId=shot.id;}});
            else if(action==='moveShot')this.edit(doc=>{const from=doc.shots.findIndex(s=>s.id===value.id),to=from+value.delta;if(from<0||to<0||to>=doc.shots.length)return;doc.shots.splice(to,0,doc.shots.splice(from,1)[0]);});
            else if(action==='assistance')this.edit(doc=>{doc.assistance[value.field]=value.value;});
            else if(action==='handedness')this.edit(doc=>{doc.players[value.id].handedness=value.value;});
            else if(['opening','ending','intentionalFault'].includes(action))this.edit(doc=>{doc[action]=value;});
            else if(action==='undo'||action==='redo') {
                this.cancelPendingProposals();
                this.sourceIntent++;
                this.pause();this.cancelPendingView();const before=JSON.stringify(this.document),restored=this.history[action]();if(restored){this.document=restored;if(!restored.shots.some(shot=>shot.id===this.selectedShotId))this.selectedShotId=restored.shots[0]?.id||null;this.installPlay(false);if(JSON.stringify(restored)!==before||this.persistedSource!==null||this.hasUnsavedChanges)this.save();}
            }
            else if(action==='saveAs'){const draft=copy(this.document);draft.id=id();draft.title=`${draft.title} — copy`.slice(0,120);this.loadDocument(draft);}
            else if(replacesSource){
                if(this.workspace==='planner')await this.setWorkspace('builder');
                // Restoring the 3D view may await assets. A later play choice,
                // edit, history operation or return to Planner owns the source.
                if(sourceIntent!==this.sourceIntent)return {ok:false,error:'A newer edit or play choice was kept.'};
                if(action==='new'){const fresh=createStarterDocument();fresh.id=id();fresh.title='Untitled play';fresh.shots=[];this.loadDocument(fresh,{persist:false});this.message='Choose Add to create the first hit. Each Add continues your rally.';}
                else if(action==='open')this.loadDocument(this.store.open(value),{persist:false,saved:true});
                else if(action==='template'){const template=PICKLEBOARD_PLAYS.find(p=>p.id===value);if(template){const draft=documentFromTemplate(template);draft.id=id();this.loadDocument(draft,{persist:false});}}
                else {const imported=this.store.importJSON(value);imported.id=id();this.loadDocument(imported);this.message='Imported as a separate copy. Existing saved plays were kept.';}
            }
            else if(action==='export'){const backup=this.store.exportJSON(this.document);this.ui.showExport?.(backup);downloadPlayBackup(backup,this.document.title);}
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
    const start=()=>{
        if(window.courtStartup?.expired)return;
        try { if(!window.playBuilder)window.playBuilder=new PlayBuilder(board); }
        catch(error){window.courtStartup?.fail();console.warn('Play builder unavailable:',error);}
    };
    if(new URL(location.href).searchParams.get('workspace')==='planner'){
        const button=document.createElement('button');button.type='button';button.className='menu-btn';button.textContent='Build a Play';button.addEventListener('click',start);document.querySelector('.menu-content').prepend(button);
    }else start();
}
if(window.pickleboard?.threeD)initialize();else window.addEventListener('pickleboard:ready',initialize,{once:true});
