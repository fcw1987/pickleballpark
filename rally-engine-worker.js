// One simulation per owned module worker. The browser client can terminate this
// worker even while final synchronous validation is occupying its event loop.
import { simulateRally } from './rally-engine.js';

let started = false;
const controller = new AbortController();

globalThis.addEventListener('message', async event => {
    const message = event.data;
    if (message?.type === 'abort') { controller.abort(); return; }
    if (started || message?.type !== 'start') {
        globalThis.postMessage({ type: 'error', error: { name: 'TypeError', message: 'A rally worker accepts one start request.' } });
        return;
    }
    started = true;
    try {
        const result = await simulateRally({
            ...message.input,
            signal: controller.signal,
            onProgress: progress => {
                if (!controller.signal.aborted) globalThis.postMessage({ type: 'progress', progress });
            }
        });
        if (!controller.signal.aborted) globalThis.postMessage({ type: 'result', result });
    } catch (failure) {
        if (!controller.signal.aborted) globalThis.postMessage({
            type: 'error', error: { name: failure?.name || 'Error', message: failure?.message || 'Rally generation failed.' }
        });
    } finally { globalThis.close(); }
});
