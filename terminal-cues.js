// Display-only samples of model 2 events. Every effect uses the session's
// playhead; seeking or orbiting never starts an animation clock of its own.
const TYPES = new Set(['net-touch', 'out', 'second-bounce', 'fault', 'dead']);
const PRIORITY = { 'net-touch': 0, dead: 1, 'second-bounce': 2, out: 3, fault: 4 };
const REASONS = Object.freeze({
    net: 'Ball stopped by net', long: 'Ball long', wide: 'Ball wide',
    unreachable: 'Beyond modeled reach', 'second-bounce': 'Second bounce',
    body: 'Body contact', 'nvz-foot': 'Non-volley-zone foot fault',
    'nvz-momentum': 'Non-volley-zone momentum fault', 'two-bounce': 'Opening bounce fault'
});

export function terminalCueLabel(event) {
    if (!event || !TYPES.has(event.type)) return '';
    const reason = REASONS[event.reason];
    if (event.type === 'net-touch') return 'Net touch';
    if (event.type === 'out') return reason || 'Out';
    if (event.type === 'second-bounce') return 'Second bounce';
    if (event.type === 'fault') return reason ? `Fault · ${reason}` : 'Fault';
    return reason ? `Point over · ${reason}` : 'Point over';
}

function occurredEvents(timeline, seconds) {
    if (timeline?.play?.modelVersion !== 2 || !Number.isFinite(seconds)) return [];
    const time = Math.max(0, Math.min(timeline.duration, seconds));
    return (timeline.events || []).filter(event => TYPES.has(event.type)
        && Number.isFinite(event.time) && event.time <= time + 1e-9
        && event.position && ['x', 'y', 'z'].every(axis => Number.isFinite(event.position[axis])))
        .sort((a, b) => a.time - b.time || PRIORITY[a.type] - PRIORITY[b.type] || String(a.id).localeCompare(String(b.id)));
}

export function terminalCueAtTime(timeline, seconds) {
    const time = Math.max(0, Math.min(timeline?.duration || 0, Number(seconds) || 0));
    return occurredEvents(timeline, seconds).filter(event => event.type !== 'net-touch'
        || time - event.time <= .8 && !(timeline.events || []).some(next => next.type === 'contact' && next.time > event.time && next.time <= time + 1e-9))
        .at(-1) || null;
}

export function terminalVisualsAtTime(timeline, seconds) {
    const time = Math.max(0, Math.min(timeline?.duration || 0, Number(seconds) || 0));
    const latestByType = new Map();
    for (const event of occurredEvents(timeline, seconds)) {
        // A net ripple is transient; decisive result markers remain through
        // the end hold so a paused final frame still explains the outcome.
        if (event.type === 'dead' || event.type === 'net-touch' && time - event.time > .8) continue;
        latestByType.set(event.type, event);
    }
    return Object.freeze([...latestByType.values()].map(event => Object.freeze({
        id: event.id, type: event.type, actor: event.actor ?? null,
        reason: event.reason ?? null, label: terminalCueLabel(event),
        time: event.time, age: Math.max(0, time - event.time),
        progress: Math.max(0, Math.min(1, (time - event.time) / .8)),
        position: Object.freeze({ ...event.position }),
        ...(Number.isFinite(event.violationOccurrenceTime) ? { violationOccurrenceTime: event.violationOccurrenceTime } : {}),
        ...(Number.isFinite(event.evidenceObservedTime) ? { evidenceObservedTime: event.evidenceObservedTime } : {})
    })));
}
