import { populateParkSVG, updateParkSVGProjection } from './park-scene.js';
import { PARK_LAYOUT } from './park-layout.js';
import './guided-plays.js';
import { COURT_LINES } from './court-geometry.js';
import { mountBuildDiagnostics } from './build-diagnostics-ui.js';
import { playerLabel } from './player-labels.js';
// Pickleboard - Interactive Pickleball Coaching and Strategy

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    });
}
class Pickleboard {
    constructor() {
        this.court = document.getElementById('court');
        this.projection = window.PickleboardProjection;
        if (!this.projection) throw new Error('Pickleboard projection is unavailable');
        this.actorLayer = document.getElementById('actorLayer');
        this.tracerLayer = document.getElementById('tracerLayer');
        const touchLayer = document.getElementById('touchLayer');
        if (touchLayer && this.actorLayer) this.court.insertBefore(touchLayer, this.actorLayer);
        this.resetBtn = document.getElementById('resetBtn');
        this.clearTracersBtn = document.getElementById('clearTracersBtn');
        this.themeToggle = document.getElementById('themeToggle');
        this.gameModeInputs = document.querySelectorAll('input[name="gameMode"]');
        this.currentGameMode = null;
        this.drawToggle = document.getElementById('drawToggle');
        this.undoBtn = document.getElementById('undoBtn');
        this.clearDrawingsBtn = document.getElementById('clearDrawingsBtn');
        this.drawingLayer = document.getElementById('drawingLayer');
        
        // New UI elements
        this.menuToggle = document.getElementById('menuToggle');
        this.menuOverlay = document.getElementById('menuOverlay');
        this.menuClose = document.getElementById('menuClose');
        this.infoToggle = document.getElementById('infoToggle');
        this.infoModal = document.getElementById('infoModal');
        this.infoClose = document.getElementById('infoClose');
        this.drawControls = document.getElementById('drawControls');
        this.playInteractionLocked = false;
        this.keyboardMovementStep = 0.5;
        this.minimumTouchTargetCssSize = 44;
        this.maximumTouchTargetRadius = 4;
        
        // Court boundaries (SVG coordinates in feet) - expanded to allow movement outside court
        this.courtBounds = {
            left: -8,
            right: 28,
            top: -8,
            bottom: 52
        };
        
        // Default positions for different game modes
        this.positions = {
            singles: {
                player1: { cx: 5, cy: -1 },    // Top player (red) - left service box, behind baseline
                player2: { cx: 15, cy: 45 },   // Bottom player (blue) - right service box, behind baseline
                player3: { cx: 5, cy: 36 },    // Left court, front (hidden in singles)
                player4: { cx: 15, cy: 36 },   // Right court, front (hidden in singles)
                ball: { cx: 19, cy: 45 }       // Ball beside the bottom player with clear visual separation
            },
            doubles: {
                player1: { cx: 5, cy: -1 },    // Top team (red) - left service box, behind baseline
                player2: { cx: 15, cy: 14 },   // Top team (red) - slightly behind NVZ line (legal position)
                player3: { cx: 5, cy: 45 },    // Bottom team (blue) - left service box, behind baseline
                player4: { cx: 15, cy: 45 },   // Bottom team (blue) - right service box, behind baseline (server)
                ball: { cx: 19, cy: 45 }       // Ball beside the server with clear visual separation
            }
        };
        
        // Token state
        this.tokens = this.initializeTokens();
        this.dragState = {
            isDragging: false,
            dragElement: null,
            startX: 0,
            startY: 0,
            elementStartX: 0,
            elementStartY: 0,
            touchStartClientX: 0,
            touchStartClientY: 0,
            touchMoved: false,
            touchIdentifier: null
        };
        this.touchTapState = {
            lastTokenId: null,
            lastTapTime: 0,
            lastTouchToggleTime: 0,
            maxDelay: 350,
            maxMovement: 12
        };
        
        // Tracer system
        this.tracerDots = [];
        this.tracerSettings = {
            fadeTime: 10000, // 10 seconds
            maxTracers: 500, // Prevent memory issues
            minDistance: 0.5 // Minimum distance between tracer dots
        };
        
        // Numeric image attributes remain canonical; the render transform anchors the visible soles.
        this.playerArtworkSize = { width: PICKLEBOARD_VISUAL.sprite.worldWidth, height: PICKLEBOARD_VISUAL.sprite.worldHeight };
        this.playerArtworkColors = { team1: 'green', team2: 'orange' };

        // Drawing system
        this.drawingMode = false;
        this.isDrawing = false;
        this.currentPath = null;
        this.drawingTouchIdentifier = null;
        this.drawingPaths = [];
        this.drawingState = {
            startX: 0,
            startY: 0,
            pathData: []
        };
        
        this.init();
    }
    
    init() {
        this.projection.configureViewport(innerWidth, innerHeight);
        this.setupProjectedScene();
        this.setupEventListeners();
        this.setupAdaptiveTouchTargets();
        this.setDrawingMode(false);
        this.loadTheme();
        this.setGameMode('doubles'); // Start with doubles
        this.initializeGuidedPlays();
        this.setupResponsiveProjection();
    }

    setupProjectedScene() {
        const viewBox = this.presentationViewBox || this.projection.COURT_VIEWBOX;
        this.court.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        const groundPlane = document.getElementById('groundPlane');
        if (groundPlane) groundPlane.setAttribute('transform', this.projection.svgMatrix());
        populateParkSVG(this.court, groundPlane);
        const markings = document.getElementById('courtMarkings');
        markings.replaceChildren(...COURT_LINES.map(line => {
            const node = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            node.dataset.courtLine = line.name;
            for (const [key, value] of Object.entries({x1:line.from.x,y1:line.from.y,x2:line.to.x,y2:line.to.y,'stroke-width':line.lineWidthFeet,stroke:'var(--pb-line)'})) node.setAttribute(key,value);
            return node;
        }));

        const bounds = [
            this.projection.courtToView(-8, -8),
            this.projection.courtToView(28, -8),
            this.projection.courtToView(28, 52),
            this.projection.courtToView(-8, 52)
        ];
        const points = (values) => values.map(point => `${point.x},${point.y}`).join(' ');
        const shadow = document.getElementById('courtCastShadow');
        if (shadow) shadow.setAttribute('points', points(bounds.map(point => ({ x: point.x + 1, y: point.y + 1.1 }))));
        const slab = document.getElementById('courtSlabEdge');
        if (slab) slab.setAttribute('points', points([
            bounds[3], bounds[2],
            { x: bounds[2].x, y: bounds[2].y + 1.1 },
            { x: bounds[3].x, y: bounds[3].y + 1.1 }
        ]));

        const net = document.getElementById('netActor');
        const netGround = this.projection.courtToView(0, 22);
        if (net) {
            net.setAttribute('transform', `translate(0 ${netGround.y})`);
            net.dataset.depth = String(netGround.y);
        }
        this.court.closest('.park-stage')?.setAttribute('data-projection', this.projection.name);
        this.updateParkControls();
    }

    applyProjection() {
        const viewBox = this.presentationViewBox || this.projection.COURT_VIEWBOX;
        this.court.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        document.getElementById('groundPlane')?.setAttribute('transform', this.projection.svgMatrix());
        updateParkSVGProjection(this.court);
        const corners=[[-8,-8],[28,-8],[28,52],[-8,52]].map(([x,y])=>this.projection.courtToView(x,y));
        const points=values=>values.map(point=>`${point.x},${point.y}`).join(' ');
        document.getElementById('courtCastShadow')?.setAttribute('points',points(corners.map(point=>({x:point.x+1,y:point.y+1.1}))));
        document.getElementById('courtSlabEdge')?.setAttribute('points',points([corners[3],corners[2],{x:corners[2].x,y:corners[2].y+1.1},{x:corners[3].x,y:corners[3].y+1.1}]));
        const net=document.getElementById('netActor'), netGround=this.projection.courtToView(0,22);
        if(net){net.setAttribute('transform',`translate(0 ${netGround.y})`);net.dataset.depth=String(netGround.y);}
        Object.values(this.tokens).forEach(token=>this.renderTokenPosition(token));
        this.court.closest('.park-stage')?.setAttribute('data-projection',this.projection.name);
        requestAnimationFrame(()=>{this.updateParkControls();this.updateTouchTargetSizes();});
    }

    updateParkControls() {
        const stage=this.court.closest('.park-stage'); if(!stage)return;
        const rect=stage.getBoundingClientRect(), matrix=this.court.getScreenCTM();
        if(!matrix)return;
        const courtCorners=[[0,0],[20,0],[20,44],[0,44]].map(([x,y])=>{const view=this.projection.courtToView(x,y);return new DOMPoint(view.x,view.y).matrixTransform(matrix);});
        const edgeX=(from,to,y)=>from.x+(to.x-from.x)*(y-from.y)/(to.y-from.y);
        const place=(element,anchor,padding=4,side=null)=>{if(!element||!anchor)return;const view=this.projection.courtToView(anchor);
            const screen=new DOMPoint(view.x,view.y).matrixTransform(matrix);
            const halfWidth=element.offsetWidth/2,halfHeight=element.offsetHeight/2;
            let x=screen.x,y=screen.y;
            if(side==='left')x=Math.min(x,Math.min(edgeX(courtCorners[0],courtCorners[3],y-halfHeight),edgeX(courtCorners[0],courtCorners[3],y+halfHeight))-halfWidth-padding);
            if(side==='right')x=Math.max(x,Math.max(edgeX(courtCorners[1],courtCorners[2],y-halfHeight),edgeX(courtCorners[1],courtCorners[2],y+halfHeight))+halfWidth+padding);
            const localX=Math.max(halfWidth+padding-rect.left,Math.min(innerWidth-rect.left-halfWidth-padding,x-rect.left));
            const localY=Math.max(halfHeight+padding-rect.top,Math.min(innerHeight-rect.top-halfHeight-padding,y-rect.top));
            element.style.left=`${localX}px`; element.style.top=`${localY}px`;};
        place(this.menuToggle,PARK_LAYOUT.controls.menu,4,'left'); place(this.infoToggle,PARK_LAYOUT.controls.help,4,'right');
        const banner=stage.querySelector('.park-banner'),bannerAnchor=PARK_LAYOUT.controls.banner;
        if(banner&&bannerAnchor){const view=this.projection.courtToView(bannerAnchor),screen=new DOMPoint(view.x,view.y).matrixTransform(matrix),scale=Math.hypot(matrix.a,matrix.b);
            banner.style.width=`${Math.max(112,Math.min(280,14*scale))}px`;
            const halfWidth=banner.offsetWidth/2,height=banner.offsetHeight;
            banner.style.left=`${Math.max(halfWidth+4-rect.left,Math.min(innerWidth-rect.left-halfWidth-4,screen.x-rect.left))}px`;
            banner.style.top=`${Math.max(height+8-rect.top,Math.min(innerHeight-rect.top-4,screen.y-rect.top))}px`;}
        this.court.querySelector('[data-landmark-id="park-banner"]')?.setAttribute('visibility','hidden');
    }

    setupResponsiveProjection() {
        let frame=null; const update=()=>{frame=null;if(this.dragState.isDragging||this.isDrawing){this.projectionResizePending=true;return;}
            const viewport=this.presentationViewBox?this.court.getBoundingClientRect():{width:innerWidth,height:innerHeight};const changed=this.projection.configureViewport(viewport.width,viewport.height);if(changed)this.applyProjection();else this.updateParkControls();};
        this.scheduleProjectionUpdate=()=>{if(frame===null)frame=requestAnimationFrame(update);};
        window.addEventListener('resize',this.scheduleProjectionUpdate);
        window.addEventListener('load',this.scheduleProjectionUpdate,{once:true});
        const observer=new ResizeObserver(this.scheduleProjectionUpdate);
        for(const element of [this.court.closest('.park-stage'),this.menuToggle,this.infoToggle,this.court.closest('.park-stage')?.querySelector('.park-banner')]) if(element)observer.observe(element);
        this.projectionResizeObserver=observer;
    }

    initializeGuidedPlays() {
        if (!window.GuidedPlayEngine || !window.PICKLEBOARD_PLAYS) return;
        this.plays = new window.GuidedPlayEngine(this, window.PICKLEBOARD_PLAYS, {
            library: document.getElementById('playLibrary'),
            loop: document.getElementById('playLoop'),
            rate: document.getElementById('playRate'),
            shotCue: document.getElementById('playShotCue'),
            pathLayer: document.getElementById('playPathLayer'),
            controls: document.getElementById('playbackControls'),
            title: document.getElementById('playbackTitle'),
            progress: document.getElementById('playbackProgress'),
            stepLabel: document.getElementById('playbackStepLabel'),
            description: document.getElementById('playbackDescription'),
            previous: document.getElementById('playPrevious'),
            playPause: document.getElementById('playPlayPause'),
            next: document.getElementById('playNext'),
            restart: document.getElementById('playRestart'),
            exit: document.getElementById('playExit'),
            announcement: document.getElementById('playbackAnnouncement')
        });
    }
    
    initializeTokens() {
        const tokens = {};
        
        // Initialize player tokens with both touch targets and visual elements
        for (let i = 1; i <= 4; i++) {
            const visualElement = document.getElementById(`player${i}`);
            const touchElement = document.getElementById(`player${i}-touch`);
            if (visualElement && touchElement) {
                tokens[`player${i}`] = {
                    id: `player${i}`,
                    type: 'player',
                    element: visualElement,
                    touchElement: touchElement,
                    baseTouchRadius: parseFloat(touchElement.getAttribute('r')),
                    x: parseFloat(visualElement.dataset.cx),
                    y: parseFloat(visualElement.dataset.cy),
                    handedness: visualElement.dataset.handedness === 'left' ? 'left' : 'right'
                };
            }
        }
        
        // Initialize ball token with both touch target and visual element
        const ballVisual = document.getElementById('ball');
        const ballTouch = document.getElementById('ball-touch');
        if (ballVisual && ballTouch) {
            tokens.ball = {
                id: 'ball',
                type: 'ball',
                element: ballVisual,
                touchElement: ballTouch,
                baseTouchRadius: parseFloat(ballTouch.getAttribute('r')),
                x: parseFloat(ballVisual.getAttribute('cx')),
                y: parseFloat(ballVisual.getAttribute('cy'))
            };
        }
        
        // Set initial player colors for doubles mode (default)
        if (tokens.player1) {
            tokens.player1.element.classList.remove('team2-player');
            tokens.player1.element.classList.add('team1-player');
        }
        if (tokens.player2) {
            tokens.player2.element.classList.remove('team2-player');
            tokens.player2.element.classList.add('team1-player');
        }
        if (tokens.player3) {
            tokens.player3.element.classList.remove('team1-player');
            tokens.player3.element.classList.add('team2-player');
        }
        if (tokens.player4) {
            tokens.player4.element.classList.remove('team1-player');
            tokens.player4.element.classList.add('team2-player');
        }
        
        return tokens;
    }
    
    setupEventListeners() {
        // Drag events for tokens
        Object.values(this.tokens).forEach(token => {
            this.setupTokenDragEvents(token);
        });
        
        // Reset button
        this.resetBtn.addEventListener('click', () => this.resetPositions());
        
        // Clear tracers button
        this.clearTracersBtn.addEventListener('click', () => this.clearAllTracers());
        
        // Theme toggle
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        
        // Game mode selection
        this.gameModeInputs.forEach(radio => {
            radio.addEventListener('change', (event) => {
                if (event.target.checked) {
                    this.setGameMode(event.target.value);
                }
            });
        });
        
        // Prevent context menu on tokens
        Object.values(this.tokens).forEach(token => {
            token.element.addEventListener('contextmenu', (e) => e.preventDefault());
        });
        
        // Drawing mode controls
        this.drawToggle.addEventListener('click', () => this.toggleDrawingMode());
        this.undoBtn.addEventListener('click', () => this.undoLastStroke());
        this.clearDrawingsBtn.addEventListener('click', () => this.clearAllDrawings());
        
        // Set up drawing event listeners
        this.setupDrawingEvents();
        
        // New UI event listeners
        this.setupUIEventListeners();
    }
    
    setupTokenDragEvents(token) {
        // Use touch target for better touch interaction, fallback to visual element
        const touchElement = token.touchElement || token.element;
        const visualElement = token.element;

        touchElement.setAttribute('tabindex', '0');
        touchElement.setAttribute('role', 'button');
        touchElement.setAttribute('aria-roledescription', 'movable court token');
        touchElement.addEventListener('keydown', event => this.handleTokenKeydown(event, token));
        visualElement.setAttribute('aria-hidden', 'true');
        this.updateTokenAccessibility(token);
        
        // Mouse events on both touch element and visual element
        touchElement.addEventListener('mousedown', (e) => this.startDrag(e, token));
        visualElement.addEventListener('mousedown', (e) => this.startDrag(e, token));
        
        // Touch events on touch element with pointer capture
        touchElement.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (touchElement.setPointerCapture && e.touches[0]) {
                // Use pointer capture for smoother touch dragging
                try {
                    touchElement.setPointerCapture(e.touches[0].identifier);
                } catch (err) {
                    // Fallback if pointer capture not supported
                }
            }
            this.startDrag(e, token);
        }, { passive: false });
        touchElement.addEventListener('touchend', (event) => this.handlePlayerTouchEnd(event, token));
        touchElement.addEventListener('touchcancel', () => this.cancelPlayerTouch());
        
        // Touch events on visual element (for direct touches)
        visualElement.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (visualElement.setPointerCapture && e.touches[0]) {
                // Use pointer capture for smoother touch dragging
                try {
                    visualElement.setPointerCapture(e.touches[0].identifier);
                } catch (err) {
                    // Fallback if pointer capture not supported
                }
            }
            this.startDrag(e, token);
        }, { passive: false });
        visualElement.addEventListener('touchend', (event) => this.handlePlayerTouchEnd(event, token));
        visualElement.addEventListener('touchcancel', () => this.cancelPlayerTouch());
        
        // A double click toggles handedness without changing the logical position.
        if (token.type === 'player') {
            const toggleHandedness = (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (this.playInteractionLocked) return;
                if (!this.touchTapState.lastTouchToggleTime ||
                    performance.now() - this.touchTapState.lastTouchToggleTime > this.touchTapState.maxDelay) {
                    this.togglePlayerHandedness(token);
                }
            };
            touchElement.addEventListener('dblclick', toggleHandedness);
            visualElement.addEventListener('dblclick', toggleHandedness);
        }

        // Prevent context menu on both elements
        touchElement.addEventListener('contextmenu', (e) => e.preventDefault());
        visualElement.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Global events (attached to document) - only set up once
        if (!this.globalEventsSetup) {
            document.addEventListener('mousemove', (e) => this.drag(e));
            document.addEventListener('mouseup', (e) => this.endDrag(e));
            document.addEventListener('touchmove', (e) => this.drag(e), { passive: false });
            document.addEventListener('touchend', (e) => this.endDrag(e));
            document.addEventListener('touchcancel', (e) => this.endDrag(e));
            this.globalEventsSetup = true;
        }
    }

    handleTokenKeydown(event, token) {
        const directions = {
            ArrowLeft: [-this.keyboardMovementStep, 0],
            ArrowRight: [this.keyboardMovementStep, 0],
            ArrowUp: [0, -this.keyboardMovementStep],
            ArrowDown: [0, this.keyboardMovementStep]
        };
        const movement = directions[event.key];
        const handednessToggle = token.type === 'player' && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar');
        if (!movement && !handednessToggle) return;

        event.preventDefault();
        if (this.drawingMode || this.playInteractionLocked) return;

        if (movement) {
            this.setTokenPosition(token.id, token.x + movement[0], token.y + movement[1]);
            return;
        }
        this.togglePlayerHandedness(token);
    }

    updateTokenAccessibility(token) {
        if (!token.touchElement) return;
        const disabled = this.drawingMode || this.playInteractionLocked;
        token.touchElement.setAttribute('aria-disabled', String(disabled));
        const position = `${Number(token.x.toFixed(1))}, ${Number(token.y.toFixed(1))} feet`;
        if (token.type === 'player') {
            const teamColor = this.getPlayerTeamColor(token);
            const authored = window.playBuilder?.workspace === 'builder' ? window.playBuilder.document : null;
            const playerName = authored ? playerLabel(token.id, authored) : token.id.replace('player', 'Player ');
            token.touchElement.setAttribute(
                'aria-label',
                `${playerName}, ${teamColor} team, ${token.handedness}-handed, at ${position}. Arrow keys move; Enter or Space switches handedness.`
            );
            token.touchElement.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space');
        } else {
            token.touchElement.setAttribute('aria-label', `Ball at ${position}. Arrow keys move.`);
            token.touchElement.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
        }
    }

    updateTokenAccessibilityStates() {
        Object.values(this.tokens).forEach(token => this.updateTokenAccessibility(token));
    }

    setupAdaptiveTouchTargets() {
        let scheduledFrame = null;
        const scheduleUpdate = () => {
            if (scheduledFrame !== null) return;
            scheduledFrame = requestAnimationFrame(() => {
                scheduledFrame = null;
                this.updateTouchTargetSizes();
            });
        };

        this.updateTouchTargetSizes();
        window.addEventListener('resize', scheduleUpdate);
        if ('ResizeObserver' in window) {
            this.touchTargetResizeObserver = new ResizeObserver(scheduleUpdate);
            this.touchTargetResizeObserver.observe(this.court);
        }
    }

    updateTouchTargetSizes() {
        const matrix = this.court.getScreenCTM();
        if (!matrix) return;
        const scaleX = Math.hypot(matrix.a, matrix.b);
        const scaleY = Math.hypot(matrix.c, matrix.d);
        const pixelsPerUnit = Math.min(scaleX, scaleY);
        if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) return;

        const minimumRadius = (this.minimumTouchTargetCssSize / 2) / pixelsPerUnit;
        Object.values(this.tokens).forEach(token => {
            if (!token.touchElement) return;
            const radius = Math.min(
                this.maximumTouchTargetRadius,
                Math.max(token.baseTouchRadius, minimumRadius)
            );
            token.touchElement.setAttribute('r', String(Math.round(radius * 1000) / 1000));
        });
    }
    
    startDrag(event, token) {
        // Don't start dragging in drawing or guided play mode.
        if (this.drawingMode || this.playInteractionLocked) return;

        if (!event.touches && event.button !== undefined && event.button !== 0) {
            if (this.dragState.isDragging) this.endDrag();
            event.preventDefault();
            return;
        }
        if (this.dragState.isDragging) {
            this.cancelPlayerTouch();
            this.endDrag();
            event.preventDefault();
            return;
        }

        // One touch owns a Planner drag. A second contact cancels the current
        // operation instead of silently transferring authority to another token.
        if (event.touches?.length > 1) {
            this.cancelPlayerTouch();
            this.endDrag();
            event.preventDefault();
            return;
        }
        
        event.preventDefault();
        
        this.dragState.isDragging = true;
        this.dragState.dragElement = token;
        
        // Get the correct coordinates based on event type
        const coords = this.getEventCoords(event);
        const svgCoords = this.screenToSVG(coords.x, coords.y);
        
        this.dragState.startX = svgCoords.x;
        this.dragState.startY = svgCoords.y;
        this.dragState.elementStartX = token.x;
        this.dragState.elementStartY = token.y;
        this.dragState.touchMoved = false;
        if (event.touches) {
            this.dragState.touchIdentifier = event.changedTouches?.[0]?.identifier ?? event.touches[0]?.identifier ?? null;
            this.dragState.touchStartClientX = coords.x;
            this.dragState.touchStartClientY = coords.y;
        } else {
            this.dragState.touchIdentifier = null;
        }
        
        // Add visual feedback
        token.element.classList.add('dragging');
        
        // Prevent text selection during drag
        document.body.style.userSelect = 'none';
    }
    
    drag(event) {
        if (!this.dragState.isDragging || !this.dragState.dragElement) return;

        if (event.touches?.length > 1) {
            this.cancelPlayerTouch();
            this.endDrag();
            event.preventDefault();
            return;
        }
        
        event.preventDefault();
        
        const coords = this.getEventCoords(event);
        const svgCoords = this.screenToSVG(coords.x, coords.y);
        if (event.touches) {
            const movement = Math.hypot(
                coords.x - this.dragState.touchStartClientX,
                coords.y - this.dragState.touchStartClientY
            );
            if (movement > this.touchTapState.maxMovement) {
                this.dragState.touchMoved = true;
                this.clearPendingTouchTap();
            }
        }
        
        // Calculate new position
        const deltaX = svgCoords.x - this.dragState.startX;
        const deltaY = svgCoords.y - this.dragState.startY;
        
        let newX = this.dragState.elementStartX + deltaX;
        let newY = this.dragState.elementStartY + deltaY;
        
        // Constrain to court boundaries
        const token = this.dragState.dragElement;
        const radius = token.type === 'ball' ? 0.5 : 0.8;
        
        newX = Math.max(this.courtBounds.left + radius, Math.min(this.courtBounds.right - radius, newX));
        newY = Math.max(this.courtBounds.top + radius, Math.min(this.courtBounds.bottom - radius, newY));
        
        // Update position
        this.updateTokenPosition(token, newX, newY);
    }
    
    endDrag(event) {
        if (!this.dragState.isDragging) return;
        
        // Remove visual feedback
        if (this.dragState.dragElement) {
            this.dragState.dragElement.element.classList.remove('dragging');
        }
        
        // Reset drag state
        this.dragState.isDragging = false;
        this.dragState.dragElement = null;
        this.dragState.touchIdentifier = null;
        
        // Restore text selection
        document.body.style.userSelect = '';
        if(this.projectionResizePending){this.projectionResizePending=false;this.scheduleProjectionUpdate?.();}
    }

    handlePlayerTouchEnd(event, token) {
        if (this.playInteractionLocked || this.drawingMode || this.dragState.dragElement !== token || this.dragState.touchMoved) {
            this.clearPendingTouchTap();
            return;
        }

        const now = performance.now();
        const isDoubleTap = this.touchTapState.lastTokenId === token.id &&
            now - this.touchTapState.lastTapTime <= this.touchTapState.maxDelay;

        if (isDoubleTap) {
            event.preventDefault();
            this.togglePlayerHandedness(token);
            this.touchTapState.lastTouchToggleTime = now;
            this.clearPendingTouchTap();
            return;
        }

        this.touchTapState.lastTokenId = token.id;
        this.touchTapState.lastTapTime = now;
    }

    clearPendingTouchTap() {
        this.touchTapState.lastTokenId = null;
        this.touchTapState.lastTapTime = 0;
    }

    cancelPlayerTouch() {
        this.dragState.touchMoved = true;
        this.clearPendingTouchTap();
    }
    
    getEventCoords(event) {
        if (event.touches && event.touches[0]) {
            const touchIdentifier = this.dragState.touchIdentifier ?? this.drawingTouchIdentifier;
            const ownedTouch = touchIdentifier == null
                ? event.touches[0]
                : [...event.touches].find(touch => touch.identifier === touchIdentifier);
            const touch = ownedTouch || event.changedTouches?.[0] || event.touches[0];
            return { x: touch.clientX, y: touch.clientY };
        } else {
            return { x: event.clientX, y: event.clientY };
        }
    }
    
    screenToSVG(screenX, screenY) {
        const svg = this.court;
        const screenMatrix = svg.getScreenCTM();
        if (!screenMatrix) return { x: 0, y: 0 };
        // SVGMatrix.inverse() may round its coefficients to float32. Invert the
        // reported affine coefficients in JS doubles so subpixel input round-trips.
        const { a, b, c, d, e, f } = screenMatrix;
        const determinant = a * d - b * c;
        const px = screenX - e, py = screenY - f;
        const viewPoint = { x: (d * px - c * py) / determinant, y: (a * py - b * px) / determinant };
        return this.projection.viewToCourt(viewPoint);
    }
    
    updateTokenPosition(token, x, y) {
        // Check if this is a significant movement to create tracer dot
        if (this.shouldCreateTracer(token, x, y)) {
            this.createTracerDot(token, token.x, token.y);
        }
        
        token.x = x;
        token.y = y;
        this.renderTokenPosition(token);
        
        // Canonical coordinates remain on the hit target; projection is render-only.
        if (token.touchElement) {
            token.touchElement.setAttribute('cx', x);
            token.touchElement.setAttribute('cy', y);
        }
        if (token.type === 'ball') this.updateTokenAccessibility(token);
    }

    renderTokenPosition(token) {
        const view = this.projection.courtToView(token.x, token.y);
        const dx = view.x - token.x;
        const dy = view.y - token.y;
        const actor = document.getElementById(`${token.id}-actor`);

        if (token.type === 'player') {
            const { width, height } = this.playerArtworkSize;
            const soleOffset = height * (PICKLEBOARD_VISUAL.sprite.anchorY / PICKLEBOARD_VISUAL.sprite.height - 0.5);
            token.element.setAttribute('width', width);
            token.element.setAttribute('height', height);
            token.element.setAttribute('x', token.x - width / 2);
            token.element.setAttribute('y', token.y - height / 2);
            token.element.dataset.cx = token.x;
            token.element.dataset.cy = token.y;
            if (actor) {
                actor.setAttribute('transform', `translate(${dx} ${dy - soleOffset})`);
                actor.dataset.depth = String(view.y);
                const shadow = actor.querySelector('.actor-shadow');
                if (shadow) {
                    shadow.setAttribute('cx', token.x);
                    shadow.setAttribute('cy', token.y + soleOffset);
                }
            }
            if (token.touchElement) token.touchElement.setAttribute('transform', `translate(${dx} ${dy})`);
            this.renderPlayerArtwork(token);
            this.sortActorsByDepth();
            return;
        }

        token.element.setAttribute('cx', token.x);
        token.element.setAttribute('cy', token.y);
        token.element.setAttribute('transform', `translate(0 ${-this.projection.projectHeight(this.playBallHeight || 0)})`);
        if (actor) {
            actor.setAttribute('transform', `translate(${dx} ${dy})`);
            actor.dataset.depth = String(view.y);
            const shadow = actor.querySelector('.ball-shadow');
            if (shadow) {
                shadow.setAttribute('cx', token.x);
                shadow.setAttribute('cy', token.y + 0.35);
            }
        }
        if (token.touchElement) token.touchElement.setAttribute('transform', `translate(${dx} ${dy})`);
        this.sortActorsByDepth();
    }

    sortActorsByDepth() {
        if (!this.actorLayer) return;
        const current = [...this.actorLayer.children];
        const sorted = [...current].sort((a, b) => Number(a.dataset.depth || 0) - Number(b.dataset.depth || 0));
        if (current.every((actor, index) => actor === sorted[index])) return;
        sorted.forEach(actor => this.actorLayer.appendChild(actor));
    }

    getPlayerTeamColor(token) {
        return token.element.classList.contains('team2-player')
            ? this.playerArtworkColors.team2
            : this.playerArtworkColors.team1;
    }

    renderPlayerArtwork(token) {
        const teamColor = this.getPlayerTeamColor(token);
        token.element.setAttribute('href', `assets/players/${teamColor}-${token.handedness}-handed.png`);
        token.element.dataset.handedness = token.handedness;
        token.element.setAttribute('aria-label', `${token.id}, ${teamColor} team, ${token.handedness}-handed`);
        this.updateTokenAccessibility(token);
    }

    togglePlayerHandedness(token) {
        token.handedness = token.handedness === 'left' ? 'right' : 'left';
        this.renderPlayerArtwork(token);
    }
    
    setGameMode(mode, { source = 'user' } = {}) {
        if (this.playInteractionLocked && source !== 'playback' && source !== 'restore') return false;
        if (!Object.hasOwn(this.positions, mode)) {
            console.warn(`Unsupported game mode: ${mode}`);
            return false;
        }

        this.currentGameMode = mode;
        this.gameModeInputs.forEach(radio => {
            radio.checked = radio.value === mode;
        });

        const positions = this.positions[mode];
        const isDoubles = mode === 'doubles';
        
        // Update positions for all tokens
        Object.keys(positions).forEach(tokenId => {
            if (this.tokens[tokenId]) {
                const pos = positions[tokenId];
                this.updateTokenPosition(this.tokens[tokenId], pos.cx, pos.cy);
            }
        });
        
        // Update player colors based on game mode
        this.updatePlayerColors(mode);
        
        // Show/hide players based on game mode
        if (this.tokens.player3 && this.tokens.player4) {
            this.tokens.player3.element.style.display = isDoubles ? 'block' : 'none';
            this.tokens.player4.element.style.display = isDoubles ? 'block' : 'none';
            const player3Actor = document.getElementById('player3-actor');
            const player4Actor = document.getElementById('player4-actor');
            if (player3Actor) player3Actor.style.display = isDoubles ? 'block' : 'none';
            if (player4Actor) player4Actor.style.display = isDoubles ? 'block' : 'none';
            
            // Also show/hide touch targets
            if (this.tokens.player3.touchElement) {
                this.tokens.player3.touchElement.style.display = isDoubles ? 'block' : 'none';
            }
            if (this.tokens.player4.touchElement) {
                this.tokens.player4.touchElement.style.display = isDoubles ? 'block' : 'none';
            }
        }
        
        console.log(`Game mode set to: ${mode}`);
        return true;
    }
    
    updatePlayerColors(mode) {
        // In doubles mode:
        // - players 1 & 2 are team1 (green artwork)
        // - players 3 & 4 are team2 (orange artwork)
        //
        // In singles mode:
        // - player 1 remains team1 (green artwork)
        // - player 2 becomes team2 (orange artwork)
        // - players 3 & 4 are hidden
        
        if (mode === 'doubles') {
            if (this.tokens.player1) {
                this.tokens.player1.element.classList.remove('team2-player');
                this.tokens.player1.element.classList.add('team1-player');
            }
            if (this.tokens.player2) {
                this.tokens.player2.element.classList.remove('team2-player');
                this.tokens.player2.element.classList.add('team1-player');
            }
            if (this.tokens.player3) {
                this.tokens.player3.element.classList.remove('team1-player');
                this.tokens.player3.element.classList.add('team2-player');
            }
            if (this.tokens.player4) {
                this.tokens.player4.element.classList.remove('team1-player');
                this.tokens.player4.element.classList.add('team2-player');
            }
        } else {
            // Singles mode - players are opponents (different teams)
            if (this.tokens.player1) {
                this.tokens.player1.element.classList.remove('team2-player');
                this.tokens.player1.element.classList.add('team1-player');
            }
            if (this.tokens.player2) {
                this.tokens.player2.element.classList.remove('team1-player');
                this.tokens.player2.element.classList.add('team2-player');
            }
        }

        Object.values(this.tokens)
            .filter(token => token.type === 'player')
            .forEach(token => this.renderPlayerArtwork(token));
    }
    
    resetPositions() {
        if (this.playInteractionLocked) return false;
        this.setGameMode(this.currentGameMode);
        console.log('Positions reset');
    }
    
    captureBoardState() {
        return {
            mode: this.currentGameMode,
            positions: this.getTokenPositions(),
            handedness: Object.fromEntries(Object.entries(this.tokens)
                .filter(([, token]) => token.type === 'player')
                .map(([id, token]) => [id, token.handedness])),
            drawingMode: this.drawingMode,
            drawings: this.drawingPaths.map(path => path.getAttribute('d')),
            tracers: this.tracerDots.map(tracer => ({
                cx: tracer.element.getAttribute('cx'),
                cy: tracer.element.getAttribute('cy'),
                r: tracer.element.getAttribute('r'),
                className: tracer.element.getAttribute('class')
            }))
        };
    }

    restoreBoardState(snapshot) {
        if (!snapshot) return;
        this.setGameMode(snapshot.mode, { source: 'restore' });
        Object.entries(snapshot.positions).forEach(([id, position]) => {
            if (this.tokens[id]) this.updateTokenPosition(this.tokens[id], position.x, position.y);
        });
        Object.entries(snapshot.handedness).forEach(([id, handedness]) => {
            if (this.tokens[id]) {
                this.tokens[id].handedness = handedness;
                this.renderPlayerArtwork(this.tokens[id]);
            }
        });
        this.clearAllDrawings();
        snapshot.drawings.forEach(d => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.classList.add('drawing-stroke');
            path.setAttribute('d', d);
            this.drawingLayer.appendChild(path);
            this.drawingPaths.push(path);
        });
        this.clearAllTracers();
        snapshot.tracers.forEach(data => {
            const element = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            element.setAttribute('cx', data.cx);
            element.setAttribute('cy', data.cy);
            element.setAttribute('r', data.r);
            element.setAttribute('class', data.className);
            (this.tracerLayer || this.court).appendChild(element);
            const tracer = { element, createdTime: Date.now(), timeout: null };
            tracer.timeout = setTimeout(() => this.removeTracerDot(tracer), this.tracerSettings.fadeTime);
            this.tracerDots.push(tracer);
        });
        this.setDrawingMode(snapshot.drawingMode);
    }

    prepareForPlay() {
        this.endDrag();
        this.clearPendingTouchTap();
        if (this.isDrawing) this.endDrawing();
        this.setDrawingMode(false);
    }

    setPlayInteractionLocked(locked) {
        this.playInteractionLocked = Boolean(locked);
        this.court.classList.toggle('playback-locked', this.playInteractionLocked);
        this.resetBtn.disabled = this.playInteractionLocked;
        this.drawToggle.disabled = this.playInteractionLocked;
        this.undoBtn.disabled = this.playInteractionLocked;
        this.clearDrawingsBtn.disabled = this.playInteractionLocked;
        this.gameModeInputs.forEach(input => { input.disabled = this.playInteractionLocked; });
        this.updateTokenAccessibilityStates();
    }

    applyPlayPositions(positions) {
        Object.entries(positions).forEach(([id, position]) => {
            if (this.tokens[id]) this.updateTokenPosition(this.tokens[id], position.x, position.y);
        });
    }

    updateThemeControl(theme) {
        this.themeToggle.textContent = theme === 'dark' ? 'Day' : 'Night';
        this.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }

    toggleTheme() {
        const body = document.body;
        const currentTheme = body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        body.setAttribute('data-theme', newTheme);
        
        // Update theme toggle button
        this.updateThemeControl(newTheme);
        
        // Save theme preference
        localStorage.setItem('pickleboard-theme', newTheme);
        
        console.log(`Theme switched to: ${newTheme}`);
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('pickleboard-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? 'dark' : 'light');
        
        document.body.setAttribute('data-theme', theme);
        this.updateThemeControl(theme);
        
        console.log(`Theme loaded: ${theme}`);
    }
    
    // Public API for external interaction
    getTokenPositions() {
        const positions = {};
        Object.entries(this.tokens).forEach(([id, token]) => {
            positions[id] = { x: token.x, y: token.y };
        });
        return positions;
    }
    
    setTokenPosition(tokenId, x, y) {
        if (this.playInteractionLocked) return false;
        if (this.tokens[tokenId]) {
            // Constrain to court boundaries
            const token = this.tokens[tokenId];
            const radius = token.type === 'ball' ? 0.5 : 0.8;
            
            x = Math.max(this.courtBounds.left + radius, Math.min(this.courtBounds.right - radius, x));
            y = Math.max(this.courtBounds.top + radius, Math.min(this.courtBounds.bottom - radius, y));
            
            this.updateTokenPosition(token, x, y);
        }
    }
    
    // Tracer system methods
    shouldCreateTracer(token, newX, newY) {
        // Don't create tracers during initialization or reset
        if (!this.dragState.isDragging) {
            console.log('No tracer: not dragging');
            return false;
        }
        
        // Calculate distance moved
        const dx = newX - token.x;
        const dy = newY - token.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        console.log(`Distance moved: ${distance}, min required: ${this.tracerSettings.minDistance}`);
        return distance >= this.tracerSettings.minDistance;
    }
    
    createTracerDot(token, x, y) {
        console.log('Creating tracer dot at:', x, y, 'for token:', token.type);
        
        // Limit number of tracer dots for performance
        if (this.tracerDots.length >= this.tracerSettings.maxTracers) {
            // Remove oldest tracer dots
            const toRemove = this.tracerDots.splice(0, 50);
            toRemove.forEach(tracer => {
                if (tracer.element && tracer.element.parentNode) {
                    tracer.element.parentNode.removeChild(tracer.element);
                }
                if (tracer.timeout) {
                    clearTimeout(tracer.timeout);
                }
            });
        }
        
        // Create SVG circle element for the tracer dot
        const tracerElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        tracerElement.setAttribute('cx', x);
        tracerElement.setAttribute('cy', y);
        tracerElement.classList.add('tracer-dot');
        
        // Set size based on token type - MUST set radius as attribute, not CSS
        if (token.type === 'ball') {
            tracerElement.setAttribute('r', '0.2'); // Set radius as attribute
            tracerElement.classList.add('ball');
            tracerElement.classList.add('ball-token');
        } else {
            tracerElement.setAttribute('r', '0.3'); // Set radius as attribute
            tracerElement.classList.add('player');
            // Copy the player team colors
            if (token.element.classList.contains('team1-player')) {
                tracerElement.classList.add('team1-player');
            } else if (token.element.classList.contains('team2-player')) {
                tracerElement.classList.add('team2-player');
            }
        }
        
        console.log('Tracer element classes:', tracerElement.classList.toString());
        
        // Ground marks share the same projection as lines, drawings, and Play paths.
        (this.tracerLayer || this.court).appendChild(tracerElement);
        
        console.log('Tracer element added to DOM');
        
        // Create tracer object
        const tracer = {
            element: tracerElement,
            createdTime: Date.now(),
            timeout: null
        };
        
        // Set up automatic removal
        tracer.timeout = setTimeout(() => {
            this.removeTracerDot(tracer);
        }, this.tracerSettings.fadeTime);
        
        // Add to tracking array
        this.tracerDots.push(tracer);
    }
    
    removeTracerDot(tracer) {
        // Remove from DOM
        if (tracer.element && tracer.element.parentNode) {
            tracer.element.parentNode.removeChild(tracer.element);
        }
        
        // Clear timeout
        if (tracer.timeout) {
            clearTimeout(tracer.timeout);
        }
        
        // Remove from tracking array
        const index = this.tracerDots.indexOf(tracer);
        if (index > -1) {
            this.tracerDots.splice(index, 1);
        }
    }
    
    clearAllTracers() {
        // Remove all tracer dots
        this.tracerDots.forEach(tracer => {
            if (tracer.element && tracer.element.parentNode) {
                tracer.element.parentNode.removeChild(tracer.element);
            }
            if (tracer.timeout) {
                clearTimeout(tracer.timeout);
            }
        });
        
        // Clear the array
        this.tracerDots = [];
        
        console.log('All tracer dots cleared');
    }
    
    // Drawing mode methods
    setupDrawingEvents() {
        // Mouse events for drawing
        this.court.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.court.addEventListener('mousemove', (e) => this.draw(e));
        this.court.addEventListener('mouseup', (e) => this.endDrawing(e));
        this.court.addEventListener('mouseleave', (e) => this.endDrawing(e));
        
        // Touch events for drawing
        this.court.addEventListener('touchstart', (e) => {
            if (this.drawingMode) {
                e.preventDefault();
                this.startDrawing(e);
            }
        }, { passive: false });
        
        this.court.addEventListener('touchmove', (e) => {
            if (this.drawingMode) {
                e.preventDefault();
                this.draw(e);
            }
        }, { passive: false });
        
        this.court.addEventListener('touchcancel', () => this.endDrawing());
        this.court.addEventListener('touchend', (e) => {
            if (this.drawingMode) {
                e.preventDefault();
                this.endDrawing(e);
            }
        }, { passive: false });
    }
    
    setDrawingMode(enabled) {
        this.drawingMode = Boolean(enabled);
        this.drawToggle.classList.toggle('active', this.drawingMode);
        this.drawToggle.setAttribute('aria-pressed', String(this.drawingMode));
        this.court.classList.toggle('drawing-mode', this.drawingMode);
        this.drawControls.hidden = !this.drawingMode;
        this.updateTokenAccessibilityStates();

        if (!this.drawingMode && this.isDrawing) {
            this.endDrawing();
        }
    }

    toggleDrawingMode() {
        if (this.playInteractionLocked) return;
        this.setDrawingMode(!this.drawingMode);
    }
    
    startDrawing(event) {
        if (!this.drawingMode || this.playInteractionLocked) return;

        if (this.isDrawing || event.touches?.length > 1) {
            if (this.isDrawing) this.endDrawing();
            event.preventDefault();
            return;
        }
        
        event.preventDefault();
        this.isDrawing = true;
        this.drawingTouchIdentifier = event.changedTouches?.[0]?.identifier ?? event.touches?.[0]?.identifier ?? null;
        
        const coords = this.getEventCoords(event);
        const svgCoords = this.screenToSVG(coords.x, coords.y);
        
        // Create new path element
        this.currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.currentPath.classList.add('drawing-stroke');
        
        // Start path data
        this.drawingState.pathData = [`M ${svgCoords.x} ${svgCoords.y}`];
        this.currentPath.setAttribute('d', this.drawingState.pathData.join(' '));
        
        // Add to drawing layer
        this.drawingLayer.appendChild(this.currentPath);
    }
    
    draw(event) {
        if (!this.isDrawing || !this.drawingMode || !this.currentPath) return;

        if (event.touches?.length > 1) {
            this.endDrawing();
            event.preventDefault();
            return;
        }
        
        event.preventDefault();
        
        const coords = this.getEventCoords(event);
        const svgCoords = this.screenToSVG(coords.x, coords.y);
        
        // Add line to current point
        this.drawingState.pathData.push(`L ${svgCoords.x} ${svgCoords.y}`);
        this.currentPath.setAttribute('d', this.drawingState.pathData.join(' '));
    }
    
    endDrawing(event) {
        if (!this.isDrawing) return;

        if (event?.touches && this.drawingTouchIdentifier != null) {
            const ownerEnded=[...(event.changedTouches || [])].some(touch=>touch.identifier===this.drawingTouchIdentifier);
            const ownerRemains=[...event.touches].some(touch=>touch.identifier===this.drawingTouchIdentifier);
            if (!ownerEnded && ownerRemains) return;
        }
        
        this.isDrawing = false;
        
        // Save the completed path
        if (this.currentPath && this.drawingState.pathData.length > 1) {
            this.drawingPaths.push(this.currentPath);
        } else if (this.currentPath) {
            // Remove if it's just a point
            this.currentPath.remove();
        }
        
        this.currentPath = null;
        this.drawingTouchIdentifier = null;
        this.drawingState.pathData = [];
        if(this.projectionResizePending){this.projectionResizePending=false;this.scheduleProjectionUpdate?.();}
    }
    
    undoLastStroke() {
        if (this.drawingPaths.length > 0) {
            const lastPath = this.drawingPaths.pop();
            lastPath.remove();
            console.log('Undid last drawing stroke');
        }
    }
    
    clearAllDrawings() {
        // Remove all drawing paths
        this.drawingPaths.forEach(path => path.remove());
        this.drawingPaths = [];
        
        // Also clear the drawing layer
        while (this.drawingLayer.firstChild) {
            this.drawingLayer.removeChild(this.drawingLayer.firstChild);
        }
        
        console.log('All drawings cleared');
    }
    
    // New UI methods
    setupUIEventListeners() {
        this.setupDialogSemantics();

        // Menu toggle
        this.menuToggle.addEventListener('click', () => this.toggleMenu());
        this.menuClose.addEventListener('click', () => this.closeMenu());
        
        // Info modal
        this.infoToggle.addEventListener('click', () => this.openInfoModal());
        this.infoClose.addEventListener('click', () => this.closeInfoModal());
        
        // Close overlays on backdrop click
        this.menuOverlay.addEventListener('click', (e) => {
            if (e.target === this.menuOverlay) {
                this.closeMenu();
            }
        });
        
        this.infoModal.addEventListener('click', (e) => {
            if (e.target === this.infoModal) {
                this.closeInfoModal();
            }
        });
        
        document.addEventListener('keydown', event => this.handleDialogKeydown(event));
    }

    setupDialogSemantics() {
        const menuTitle = this.menuOverlay.querySelector('h2');
        const infoTitle = this.infoModal.querySelector('h2');
        if (menuTitle && !menuTitle.id) menuTitle.id = 'menuTitle';
        if (infoTitle && !infoTitle.id) infoTitle.id = 'infoTitle';

        this.menuOverlay.setAttribute('role', 'dialog');
        this.menuOverlay.setAttribute('aria-modal', 'true');
        this.menuOverlay.setAttribute('aria-labelledby', menuTitle?.id || 'menuTitle');
        this.infoModal.setAttribute('role', 'dialog');
        this.infoModal.setAttribute('aria-modal', 'true');
        this.infoModal.setAttribute('aria-labelledby', infoTitle?.id || 'infoTitle');
        this.menuToggle.setAttribute('aria-expanded', 'false');
        this.menuToggle.setAttribute('aria-haspopup', 'dialog');
        this.infoToggle.setAttribute('aria-expanded', 'false');
        this.infoToggle.setAttribute('aria-haspopup', 'dialog');
        this.menuClose.setAttribute('aria-label', 'Close menu');
        this.infoClose.setAttribute('aria-label', 'Close help and information');
    }

    getDialogFocusables(dialog) {
        return [...dialog.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])'
        )].filter(element => !element.hidden && getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length > 0);
    }

    focusDialogWhenVisible(dialog, preferredElement) {
        const tryFocus = (attempt = 0) => {
            if (!dialog.classList.contains('active')) return;
            if (getComputedStyle(dialog).visibility !== 'hidden' &&
                getComputedStyle(preferredElement).visibility !== 'hidden') {
                preferredElement.focus({ preventScroll: true });
                return;
            }
            if (attempt < 60) requestAnimationFrame(() => tryFocus(attempt + 1));
        };
        requestAnimationFrame(() => tryFocus(0));
    }

    handleDialogKeydown(event) {
        const dialog = this.infoModal.classList.contains('active')
            ? this.infoModal
            : this.menuOverlay.classList.contains('active') ? this.menuOverlay : null;
        if (!dialog) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            if (dialog === this.infoModal) this.closeInfoModal();
            else this.closeMenu();
            return;
        }
        if (event.key !== 'Tab') return;

        const focusables = this.getDialogFocusables(dialog);
        if (focusables.length === 0) {
            event.preventDefault();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const focusIsInside = dialog.contains(document.activeElement);
        if (event.shiftKey && (!focusIsInside || document.activeElement === first)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (!focusIsInside || document.activeElement === last)) {
            event.preventDefault();
            first.focus();
        }
    }
    
    toggleMenu() {
        const isActive = this.menuOverlay.classList.contains('active');
        if (isActive) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }
    
    openMenu() {
        if (this.infoModal.classList.contains('active')) this.closeInfoModal({ restoreFocus: false });
        this.menuOverlay.classList.add('active');
        this.menuToggle.classList.add('active');
        this.menuToggle.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        this.focusDialogWhenVisible(this.menuOverlay, this.menuClose);
    }
    
    closeMenu({ restoreFocus = true } = {}) {
        const wasActive = this.menuOverlay.classList.contains('active');
        this.menuOverlay.classList.remove('active');
        this.menuToggle.classList.remove('active');
        this.menuToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = ''; // Restore scrolling
        if (wasActive && restoreFocus) this.menuToggle.focus({ preventScroll: true });
    }
    
    openInfoModal({ returnFocus = this.infoToggle, initialFocus = this.infoClose } = {}) {
        this.infoReturnFocus = returnFocus;
        if (this.menuOverlay.classList.contains('active')) this.closeMenu({ restoreFocus: false });
        this.infoModal.classList.add('active');
        this.infoToggle.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        this.focusDialogWhenVisible(this.infoModal, initialFocus);
    }
    
    closeInfoModal({ restoreFocus = true } = {}) {
        const wasActive = this.infoModal.classList.contains('active');
        this.infoModal.classList.remove('active');
        this.infoToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = ''; // Restore scrolling
        if (wasActive && restoreFocus) {
            const target = this.infoReturnFocus?.isConnected && this.infoReturnFocus !== document.body && this.infoReturnFocus !== document.documentElement && !this.infoModal.contains(this.infoReturnFocus) && this.infoReturnFocus.getClientRects().length ? this.infoReturnFocus : this.infoToggle;
            target.focus({ preventScroll: true });
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create global instance
    window.pickleboard = new Pickleboard();
    window.pickleboard.buildDiagnostics = mountBuildDiagnostics(document.getElementById('buildDiagnostics'));
    window.dispatchEvent(new CustomEvent('pickleboard:ready', { detail: window.pickleboard }));
    
    console.log('Pickleboard initialized successfully');
});

// Handle browser back/forward navigation
window.addEventListener('popstate', () => {
    if (window.pickleboard) {
        window.pickleboard.resetPositions();
    }
});

// Handle page visibility changes (pause/resume)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // A hidden page cannot keep an input gesture owner. Finish the last
        // coherent Planner position/stroke before browser events are suspended.
        window.pickleboard?.endDrag();
        if (window.pickleboard?.isDrawing) window.pickleboard.endDrawing();
        window.pickleboard?.clearPendingTouchTap();
        console.log('Page hidden');
    } else {
        // Page is visible - could resume animations if any
        console.log('Page visible');
    }
});
