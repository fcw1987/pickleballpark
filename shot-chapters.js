// Canonical shot chapters derived once from an accepted compiled rally.
// A chapter starts at its shot segment's preparation/navigation boundary. For
// serves this includes the authored preparation bounce; later shot boundaries
// coincide with the incoming contact when the compiler places contact at zero.
import { terminalCueLabel } from './terminal-cues.js';

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function shotIdentity(segment, fallback) {
    return segment.step?.shot?.authoring?.recipeId || segment.step?.id || fallback;
}

function shotLabel(segment, number) {
    const explicit = String(segment.step?.label || '').replace(/^\s*\d+\.?\s*/, '').trim();
    const family = segment.step?.shot?.authoring?.family || segment.shotSemantics?.shotType || segment.step?.shot?.type;
    if (explicit) return explicit;
    if (family) return String(family).replaceAll('-', ' ').replace(/\b\w/g, character => character.toUpperCase());
    return `Shot ${number}`;
}

export function buildShotChapters(timeline, { shotIds = [] } = {}) {
    if (!timeline?.segments || !Number.isFinite(timeline.duration)) return Object.freeze([]);
    const segments = timeline.segments.filter(segment => segment.shotSemantics && segment.step?.shot);
    const chapters = segments.map((segment, index) => {
        const next = segments[index + 1];
        const anchor = clamp(segment.startTime, 0, timeline.duration);
        const endTime = clamp(next?.startTime ?? timeline.duration, anchor, timeline.duration);
        const shotId = shotIds[index] || shotIdentity(segment, `shot-${index + 1}`);
        const terminalEvents = timeline.play?.modelVersion === 2
            ? (timeline.events || []).filter(event => ['net-touch', 'out', 'second-bounce', 'fault', 'dead'].includes(event.type) && event.rallyLeg === segment.rallyLeg)
            : null;
        return Object.freeze({
            shotId,
            number: index + 1,
            label: shotLabel(segment, index + 1),
            anchor,
            contactTime: clamp(segment.startTime + (segment.contactTime || 0), anchor, timeline.duration),
            startTime: anchor,
            endTime,
            ...(terminalEvents ? {
                description: segment.step.description || '',
                terminalEvents: Object.freeze(terminalEvents),
                terminalLabel: terminalCueLabel(terminalEvents.findLast(event => event.type === 'fault') || terminalEvents.at(-1))
            } : {})
        });
    });
    return Object.freeze(chapters);
}

export function chapterAtTime(chapters, seconds) {
    if (!chapters?.length) return null;
    const time = Number.isFinite(seconds) ? seconds : 0;
    let current = chapters[0];
    // Intentionally retain the final chapter at a coincident timestamp so every
    // stable destination is exact and ties resolve in authored order.
    for (const chapter of chapters) {
        if (chapter.anchor > time + 1e-9) break;
        current = chapter;
    }
    return current;
}

export function mapSemanticPlayhead(previousChapters, nextChapters, seconds, previousDuration, nextDuration) {
    const oldDuration = Math.max(0, Number(previousDuration) || 0);
    const newDuration = Math.max(0, Number(nextDuration) || 0);
    const time = clamp(Number(seconds) || 0, 0, oldDuration);
    if (!newDuration || !nextChapters?.length) return 0;
    if (oldDuration && time >= oldDuration - 1e-9) return newDuration;
    if (!previousChapters?.length) return clamp(time, 0, newDuration);
    const current = chapterAtTime(previousChapters, time);
    let destination = nextChapters.find(chapter => chapter.shotId === current?.shotId);
    if (!destination && current) {
        const oldIndex = previousChapters.indexOf(current);
        for (let distance = 1; distance < previousChapters.length && !destination; distance += 1) {
            const after = previousChapters[oldIndex + distance];
            const before = previousChapters[oldIndex - distance];
            destination = nextChapters.find(chapter => chapter.shotId === after?.shotId)
                || nextChapters.find(chapter => chapter.shotId === before?.shotId);
        }
    }
    if (!destination) return clamp(time, 0, newDuration);
    const oldSpan = Math.max(0, current.endTime - current.startTime);
    const progress = oldSpan > 1e-9 ? clamp((time - current.startTime) / oldSpan, 0, 1) : 0;
    return clamp(destination.startTime + progress * (destination.endTime - destination.startTime), 0, newDuration);
}
