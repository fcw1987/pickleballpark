// Controlled, temporary render overrides. Never edits application source or clocks.
// RAF callback cadence and CPU submission times are not displayed FPS/GPU time.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = process.argv[2] || 'docs/art-overhaul/performance-iteration/recheck';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const modes = (process.env.PERFORMANCE_MODES ||
    'soft1024,soft512,basic512,none,none-lambert-world,basic512-lambert-world,none-lambert-all,soft1024-lambert-world').split(',');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const records = [];
try {
    for (const mode of modes) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${base}/index.html?workspace=planner&three-d-visual=1`);
        await page.waitForFunction(() => window.pickleboard?.threeD);
        await page.evaluate(() => pickleboard.plays.load('third-shot-drop'));
        await page.locator('#play3dView').click();
        await page.waitForFunction(() => pickleboard.threeD.active);
        await page.evaluate(async mode => {
            const THREE = await import('./vendor/three.module.min.js');
            const v = pickleboard.threeD, shadowMode = mode.split('-')[0];
            const light = v.scene.children.find(object => object.isDirectionalLight);
            v.setCamera('overhead');
            v.renderer.shadowMap.enabled = shadowMode !== 'none';
            v.renderer.shadowMap.type = shadowMode === 'basic512' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
            light.castShadow = shadowMode !== 'none';
            light.shadow.mapSize.set(shadowMode === 'soft1024' ? 1024 : 512, shadowMode === 'soft1024' ? 1024 : 512);
            Object.assign(light.shadow.camera, { left: -8, right: 8, top: 10, bottom: -10 });
            light.shadow.camera.updateProjectionMatrix();
            Object.assign(light.shadow, { normalBias: .025, intensity: .6, bias: -.00035 });
            light.shadow.map?.dispose(); light.shadow.map = null;
            // Explicitly restore Standard for control modes, so this benchmark
            // can reproduce the pre-optimization graph after shipping Lambert.
            const converted = new Map();
            const Material = mode.includes('lambert') ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
            (mode.endsWith('-all') ? v.scene : v.world.group).traverse(object => {
                if (!object.isMesh || !object.material) return;
                const convert = material => {
                    if (!material.isMeshStandardMaterial && !material.isMeshLambertMaterial) return material;
                    if (!converted.has(material)) {
                        const options = { color: material.color, map: material.map, vertexColors: material.vertexColors,
                            flatShading: material.flatShading, side: material.side, transparent: material.transparent,
                            opacity: material.opacity, alphaTest: material.alphaTest, depthWrite: material.depthWrite, depthTest: material.depthTest };
                        if (Material === THREE.MeshStandardMaterial) Object.assign(options, { roughness: 1, metalness: 0 });
                        converted.set(material, new Material(options));
                    }
                    return converted.get(material);
                };
                object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
            });
            v.scene.traverse(object => { if (object.material) for (const material of [object.material].flat()) material.needsUpdate = true; });
            v.renderer.render(v.scene, v.camera);
        }, mode);
        await page.waitForTimeout(1500);
        const stats = await page.evaluate(async () => {
            const v = pickleboard.threeD, intervals = [], apply = [], render = [];
            const originalApply = v.applyAtTime, originalRender = v.renderer.render;
            v.applyAtTime = function (...args) {
                const start = performance.now();
                try { return originalApply.apply(this, args); } finally { apply.push(performance.now() - start); }
            };
            v.renderer.render = function (...args) {
                const start = performance.now();
                try { return originalRender.apply(this, args); } finally { render.push(performance.now() - start); }
            };
            v.restart(); v.togglePlay();
            await new Promise(resolve => {
                let first = null, prior = null;
                function tick(t) {
                    first ??= t;
                    if (prior !== null) intervals.push(t - prior);
                    prior = t;
                    if (t - first < 6000) requestAnimationFrame(tick); else resolve();
                }
                requestAnimationFrame(tick);
            });
            v.togglePlay(); v.applyAtTime = originalApply; v.renderer.render = originalRender;
            const summarize = values => {
                const sorted = [...values].sort((a, b) => a - b);
                return { count: sorted.length, median: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1) };
            };
            return { raf: summarize(intervals), applyCPU: summarize(apply), renderCPU: summarize(render),
                memory: { ...v.renderer.info.memory }, calls: v.renderer.info.render.calls, triangles: v.renderer.info.render.triangles,
                pixels: [v.renderer.domElement.width, v.renderer.domElement.height] };
        });
        for (const camera of ['overhead', 'behind-orange']) {
            await page.evaluate(camera => {
                const v = pickleboard.threeD;
                v.setCamera(camera);
                const segment = v.timeline.segments.find(segment => segment.shotSemantics?.stroke === 'drop');
                v.session.seek(segment.startTime + segment.contactTime);
                v.applyAtTime(v.clock.elapsed); v.renderer.render(v.scene, v.camera);
            }, camera);
            await page.screenshot({ path: `${output}/${mode}-${camera}-contact.png` });
        }
        records.push({ mode, stats, errors });
        console.log(JSON.stringify({ mode, ...stats, errors }));
        await context.close();
    }
} finally {
    await browser.close();
}
await writeFile(`${output}/results.json`, JSON.stringify({
    browser: browser.version(),
    method: 'One headless Chromium process, sequential contexts, 1440x900 DPR1; six seconds of active Third Shot Drop overhead after 1.5s material warm-up. RAF callback cadence and CPU submission durations, not display FPS or GPU completion.',
    records
}, null, 2) + '\n');
