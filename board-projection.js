(function exposeBoardProjection(global) {
    'use strict';

    const COURT_MIDLINE = 22;
    // Ground fitting is an affine 2.5D layout, not a camera tilt. Keep upright
    // actor and ball height calibrated together across responsive presets.
    const UPRIGHT_HEIGHT_SCALE = Math.sqrt(1 - 0.9 * 0.9);
    const PRESETS = Object.freeze({
        portrait: Object.freeze({ shear: 0.04, depthScale: 0.9,
            viewBox: Object.freeze({ x: -10.6, y: -11, width: 41.2, height: 59 }) }),
        wide: Object.freeze({ shear: 0.09, depthScale: 0.65,
            viewBox: Object.freeze({ x: -12, y: -9.2, width: 44, height: 43.8 }) })
    });
    let activeName = 'portrait';
    let active = PRESETS[activeName];
    const matrixFor = preset => Object.freeze({ a: 1, b: 0, c: -preset.shear,
        d: preset.depthScale, e: preset.shear * COURT_MIDLINE, f: 0 });
    let matrix = matrixFor(active);

    function courtToView(xOrPoint, optionalY) {
        const point = typeof xOrPoint === 'object'
            ? xOrPoint
            : { x: xOrPoint, y: optionalY };
        return {
            x: matrix.a * point.x + matrix.c * point.y + matrix.e,
            y: matrix.d * point.y
        };
    }

    function viewToCourt(xOrPoint, optionalY) {
        const point = typeof xOrPoint === 'object'
            ? xOrPoint
            : { x: xOrPoint, y: optionalY };
        const y = point.y / matrix.d;
        return {
            x: point.x - matrix.c * y - matrix.e,
            y
        };
    }

    function svgMatrix() {
        const values = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
            .map(value => Number(value.toFixed(10)));
        return `matrix(${values.join(' ')})`;
    }

    function configureViewport(width, height) {
        const nextName = Number(width) / Math.max(1, Number(height)) >= 1.15 ? 'wide' : 'portrait';
        if (nextName === activeName) return false;
        activeName = nextName; active = PRESETS[activeName]; matrix = matrixFor(active);
        return true;
    }

    global.PickleboardProjection = Object.freeze({
        PRESETS,
        configureViewport,
        get name() { return activeName; },
        get COURT_VIEWBOX() { return active.viewBox; },
        HEIGHT_SCALE: UPRIGHT_HEIGHT_SCALE,
        projectHeight: feet => feet * UPRIGHT_HEIGHT_SCALE,
        get MATRIX() { return matrix; },
        courtToView,
        viewToCourt,
        svgMatrix
    });
})(window);
