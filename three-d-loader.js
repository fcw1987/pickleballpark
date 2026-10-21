// Keep Three.js out of the editable board's execution path.
function initialize() {
    const board = window.pickleboard;
    if (!board?.plays) return;
    const entry = document.getElementById('play3dView');
    let loading = null;
    let attempts = 0, generation = 0;
    const announce = message => {
        const status = document.getElementById('threeDLoadStatus');
        if (status) {
            status.textContent = message;
            status.hidden = !message;
        }
    };
    const loader = {
        active: false,
        updateEntryAvailability() {
            entry.disabled = Boolean(loading) || !board.plays.activePlay;
        },
        getState() { return { active: false, playing: false, elapsed: 0, renderLoopCount: 0 }; },
        cancelLoading(){generation+=1;loading=null;entry.removeAttribute('aria-busy');announce('');loader.updateEntryAvailability();const token=loader.suspension;loader.suspension=null;if(token&&board.plays.session.resumeSuspension(token))board.plays.startPlaybackLoop();},
        async enter() {
            if (loading || !board.plays.activePlay) return false;
            const requestGeneration=++generation;
            const requestedPlay = board.plays.activePlay;
            const requestedSnapshot = board.plays.snapshot;
            const playbackSuspension=board.plays.session.suspend(performance.now(),board.plays.timingScale);
            loader.suspension=playbackSuspension;
            board.plays.cancelScheduledWork({preserveTransition:true});
            announce('Opening 3D court…');
            entry.setAttribute('aria-busy', 'true');
            // Failed module requests can remain cached by the browser. A retry gets a
            // fresh module URL; the service worker normalizes it to the owned asset.
            const moduleURL = attempts++ === 0 ? './three-d-playback.js' : `./three-d-playback.js?retry=${attempts}`;
            loading = import(moduleURL);
            loader.updateEntryAvailability();
            try {
                const { ThreeDPlaybackViewer } = await loading;
                // The coach may leave or select another Play while the module loads.
                if (requestGeneration!==generation || board.plays.activePlay !== requestedPlay || board.plays.snapshot !== requestedSnapshot) {
                    return false;
                }
                entry.removeEventListener('click', enter);
                const viewer = new ThreeDPlaybackViewer(board);
                board.threeD = viewer;
                loader.suspension=null;
                announce('');
                return viewer.enter();
            } catch (error) {
                if(requestGeneration!==generation)return false;
                announce('The 3D court could not open. Your board is safe. Try 3D View again.');
                console.warn('3D court unavailable:', error);
                loader.suspension=null;
                if(board.plays.session.resumeSuspension(playbackSuspension))board.plays.startPlaybackLoop();
                return false;
            } finally {
                if(requestGeneration===generation){loading = null;
                entry.removeAttribute('aria-busy');board.threeD.updateEntryAvailability();}
            }
        }
    };
    const enter = () => loader.enter();
    entry.addEventListener('click', enter);
    board.threeD = loader;
    const updateUI = board.plays.updateUI.bind(board.plays);
    board.plays.updateUI = (...args) => {
        const result = updateUI(...args);
        board.threeD.updateEntryAvailability();
        return result;
    };
    loader.updateEntryAvailability();
}
if (window.pickleboard?.plays) initialize();
else window.addEventListener('pickleboard:ready', initialize, { once: true });
