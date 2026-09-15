// Shared authored park contract. Board feet stay canonical; renderers consume
// these landmarks without changing playable bounds or token coordinates.
const freezeLandmark = landmark => Object.freeze({ ...landmark, anchorFoot: Object.freeze([...landmark.anchorFoot]) });

export const PARK_LAYOUT = Object.freeze({
    boardFeet: Object.freeze({ x: Object.freeze([0, 20]), y: Object.freeze([0, 44]) }),
    apronFeet: Object.freeze({ x: Object.freeze([-8, 28]), y: Object.freeze([-8, 52]) }),
    controls: Object.freeze({ menu: Object.freeze({ x: -6.5, y: 15 }), help: Object.freeze({ x: 26.5, y: 8 }), banner: Object.freeze({ x: 10, y: -8 }) }),
    paths: Object.freeze([
        Object.freeze({ id: 'path-top', x: -8, y: -8, width: 36, height: 3.5 }),
        Object.freeze({ id: 'path-bottom', x: -8, y: 48.5, width: 36, height: 3.5 }),
        Object.freeze({ id: 'path-left', x: -8, y: -4.5, width: 3.5, height: 53 }),
        Object.freeze({ id: 'path-right', x: 24.5, y: -4.5, width: 3.5, height: 53 })
    ]),
    landmarks: Object.freeze([
        // Trees sit beyond the path, but their canopies should read as park
        // landmarks beside a 5.33-foot athlete rather than tiny stickers.
        freezeLandmark({ id: 'tree-green-court', type: 'tree', x: -6.3, y: 5, size: 5.8, height: 6.3, anchorFoot: [-6.3, 5] }),
        freezeLandmark({ id: 'tree-orange-court', type: 'tree', x: 26.3, y: 39, size: 5.8, height: 6.3, anchorFoot: [26.3, 39] }),
        freezeLandmark({ id: 'park-banner', type: 'banner', x: 10, y: -8, size: 7, height: 1.75, anchorFoot: [10, -8] }),
        freezeLandmark({ id: 'shrub-left', type: 'shrub', x: -6.2, y: 25, size: 4.7, height: 4.2, anchorFoot: [-6.2, 25] }),
        freezeLandmark({ id: 'shrub-right', type: 'shrub', x: 26.2, y: 19, size: 4.7, height: 4.2, anchorFoot: [26.2, 19] }),
        freezeLandmark({ id: 'bench-left', type: 'bench', x: -6.5, y: 34, size: 5.6, height: 4.5, anchorFoot: [-6.5, 34] }),
        freezeLandmark({ id: 'park-sign', type: 'sign', x: 26.5, y: 8, size: 3.8, height: 3.8, anchorFoot: [26.5, 8] })
    ]),
    assets: Object.freeze({
        quietCourt: 'assets/park/quiet-court.png',
        grass: 'assets/park/grass.png',
        path: 'assets/park/path.png',
        tree: 'assets/park/tree.png',
        shrub: 'assets/park/shrub.png',
        bench: 'assets/park/bench.png',
        sign: 'assets/park/sign.png',
        banner: 'assets/park/banner.png'
    })
});

export const PARK_MATERIALS = Object.freeze({
    court: '#4f8f88',
    kitchen: '#a7c7aa',
    grass: '#739b70',
    path: '#b86f52',
    line: '#fff6db',
    shadow: '#2f584b'
});
