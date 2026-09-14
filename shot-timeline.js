/**
 * One-clock shot timeline control.
 *
 * The host owns playback and sampling. This component owns only the semantic
 * range, its pixel-art presentation and one guarded pointer operation.
 */

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function formatClock(seconds) {
  const safe = Math.max(0, finite(seconds));
  const wholeMinutes = Math.floor(safe / 60);
  const remaining = safe - wholeMinutes * 60;
  const displaySeconds = remaining < 10 ? `0${remaining.toFixed(1)}` : remaining.toFixed(1);
  return `${wholeMinutes}:${displaySeconds}`;
}

function chapterAt(chapters, time, preferredId) {
  const preferred = preferredId && chapters.find(chapter => chapter.shotId === preferredId);
  if (preferred) return preferred;
  let current = chapters[0] || null;
  for (const chapter of chapters) {
    if (chapter.anchor <= time + Number.EPSILON) current = chapter;
  }
  return current;
}

function chapterLabel(chapter) {
  if (!chapter) return 'Rally';
  return `Shot ${chapter.number}, ${chapter.label}`;
}

function valueText(chapters, time, duration, preferredId) {
  return `${chapterLabel(chapterAt(chapters, time, preferredId))}, ${finite(time).toFixed(1)} seconds of ${finite(duration).toFixed(1)} seconds`;
}

function normalizeChapters(chapters, duration) {
  if (!Array.isArray(chapters)) return [];
  return chapters.map((chapter, index) => ({
    shotId: String(chapter?.shotId ?? `shot-${index + 1}`),
    number: finite(chapter?.number, index + 1),
    label: String(chapter?.label || 'Shot'),
    anchor: clamp(finite(chapter?.anchor), 0, duration),
    contactTime: clamp(finite(chapter?.contactTime, chapter?.anchor), 0, duration),
    startTime: clamp(finite(chapter?.startTime, chapter?.anchor), 0, duration),
    endTime: clamp(finite(chapter?.endTime, chapter?.anchor), 0, duration)
  }));
}

export function mountShotTimeline({ onAction = () => {} } = {}) {
  const root = document.createElement('div');
  root.className = 'shot-timeline';
  root.dataset.playing = 'false';
  root.dataset.scrubbing = 'false';

  const identity = document.createElement('span');
  identity.className = 'shot-timeline-identity game-chip';
  identity.setAttribute('aria-hidden', 'true');
  identity.textContent = 'Rally';

  const railTarget = document.createElement('div');
  railTarget.className = 'shot-timeline-target';

  const rail = document.createElement('div');
  rail.className = 'shot-timeline-rail';
  rail.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('span');
  fill.className = 'shot-timeline-fill';
  const markers = document.createElement('span');
  markers.className = 'shot-timeline-markers';
  const thumb = document.createElement('span');
  thumb.className = 'shot-timeline-thumb';
  rail.append(fill, markers, thumb);

  const input = document.createElement('input');
  input.className = 'shot-timeline-range';
  input.type = 'range';
  input.min = '0';
  input.max = '0';
  input.step = '0.01';
  input.value = '0';
  input.setAttribute('aria-label', 'Rally timeline');
  input.setAttribute('aria-valuetext', 'Rally, 0.0 seconds of 0.0 seconds');
  input.disabled = true;
  railTarget.append(rail, input);

  const time = document.createElement('span');
  time.className = 'shot-timeline-time';
  time.setAttribute('aria-hidden', 'true');
  time.textContent = '0:00.0 / 0:00.0';
  root.append(identity, railTarget, time);

  let state = { chapters: [], time: 0, duration: 0, playing: false, busy: false, currentShotId: null };
  let operation = null;
  let operationSequence = 0;
  let destroyed = false;
  let chapterSignature = '';

  const emit = (type, payload) => {
    if (destroyed) return;
    try {
      const result = onAction(type, payload);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // The host reports command failures. Keep the control responsive so a
      // later authoritative update can restore its state.
    }
  };

  const renderValue = (rawTime, preferredId = null) => {
    const currentTime = clamp(finite(rawTime), 0, state.duration);
    const progress = state.duration > 0 ? currentTime / state.duration : 0;
    const currentChapter = chapterAt(state.chapters, currentTime, preferredId);
    root.style.setProperty('--shot-timeline-progress', String(progress));
    input.value = String(currentTime);
    input.setAttribute('aria-valuetext', valueText(state.chapters, currentTime, state.duration, preferredId));
    identity.textContent = chapterLabel(currentChapter);
    identity.dataset.shotId = currentChapter?.shotId || '';
    time.textContent = `${formatClock(currentTime)} / ${formatClock(state.duration)}`;
    for (const marker of markers.children) {
      marker.classList.toggle('is-current', marker.dataset.shotId === currentChapter?.shotId);
    }
    return currentTime;
  };

  const renderMarkers = () => {
    const signature = state.chapters.map(chapter => `${chapter.shotId}:${chapter.anchor}:${chapter.number}:${chapter.label}`).join('|');
    if (signature === chapterSignature) return;
    chapterSignature = signature;
    markers.replaceChildren(...state.chapters.map(chapter => {
      const marker = document.createElement('i');
      marker.className = 'shot-timeline-marker';
      marker.dataset.shotId = chapter.shotId;
      marker.style.setProperty('--shot-marker-position', String(state.duration > 0 ? chapter.anchor / state.duration : 0));
      return marker;
    }));
  };

  const clearOperation = () => {
    operation = null;
    root.dataset.scrubbing = 'false';
  };

  const cancelOperation = () => {
    if (!operation) return;
    const cancelled = operation;
    clearOperation();
    emit('scrubCancel', { id: cancelled.id });
  };

  const begin = event => {
    if (input.disabled || state.duration <= 0) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (operation) {
      if (event.pointerId !== operation.pointerId) cancelOperation();
      return;
    }
    if (event.pointerType === 'touch' && event.isPrimary === false) return;
    operation = {
      id: `shot-timeline-${++operationSequence}`,
      pointerId: event.pointerId,
      rect: input.getBoundingClientRect(),
      time: finite(input.value)
    };
    root.dataset.scrubbing = 'true';
    try { input.setPointerCapture(event.pointerId); } catch {}
    emit('scrubBegin', { id: operation.id });
    event.stopPropagation();
  };

  const seekFromInput = () => {
    const nextTime = renderValue(input.value);
    if (operation) {
      operation.time = nextTime;
      emit('scrubSeek', { id: operation.id, time: nextTime });
    } else {
      emit('seek', nextTime);
    }
  };

  const end = event => {
    if (!operation || event.pointerId !== operation.pointerId) return;
    const completed = operation;
    clearOperation();
    try {
      if (input.hasPointerCapture(event.pointerId)) input.releasePointerCapture(event.pointerId);
    } catch {}
    emit('scrubEnd', { id: completed.id });
    event.stopPropagation();
  };

  const containMove = event => {
    if (operation && event.pointerId === operation.pointerId) event.stopPropagation();
  };

  const interrupted = event => {
    if (!operation || (event?.pointerId != null && event.pointerId !== operation.pointerId)) return;
    cancelOperation();
    event?.stopPropagation?.();
  };

  const secondPointer = event => {
    if (!operation || event.pointerId === operation.pointerId) return;
    if (event.pointerType === 'touch') cancelOperation();
  };

  input.addEventListener('pointerdown', begin);
  input.addEventListener('pointermove', containMove);
  input.addEventListener('input', seekFromInput);
  input.addEventListener('pointerup', end);
  input.addEventListener('pointercancel', interrupted);
  input.addEventListener('lostpointercapture', interrupted);
  input.addEventListener('click', event => event.stopPropagation());
  input.addEventListener('keydown', event => event.stopPropagation());
  document.addEventListener('pointerdown', secondPointer, true);

  const cancelForLayoutChange = () => cancelOperation();
  const cancelForVisibility = () => { if (document.hidden) cancelOperation(); };
  window.addEventListener('resize', cancelForLayoutChange);
  window.addEventListener('orientationchange', cancelForLayoutChange);
  window.visualViewport?.addEventListener('resize', cancelForLayoutChange);
  document.addEventListener('visibilitychange', cancelForVisibility);

  const update = nextState => {
    if (destroyed) return;
    const nextDuration = Math.max(0, finite(nextState?.duration));
    const nextChapters = normalizeChapters(nextState?.chapters, nextDuration);
    const nextChapterSignature = nextChapters.map(chapter => `${chapter.shotId}:${chapter.anchor}:${chapter.number}:${chapter.label}`).join('|');
    if (operation && (nextDuration !== state.duration || nextChapterSignature !== chapterSignature)) cancelOperation();
    state = {
      chapters: nextChapters,
      time: clamp(finite(nextState?.time), 0, nextDuration),
      duration: nextDuration,
      playing: Boolean(nextState?.playing),
      busy: Boolean(nextState?.busy),
      currentShotId: nextState?.currentShotId || null,
      selectedShotId: nextState?.selectedShotId || null
    };
    if ((state.busy || state.duration <= 0) && operation) cancelOperation();
    input.max = String(state.duration);
    input.disabled = state.busy || state.duration <= 0;
    input.setAttribute('aria-busy', String(state.busy));
    root.dataset.playing = String(state.playing);
    root.dataset.busy = String(state.busy);
    renderMarkers();
    if (!operation) renderValue(state.time, state.currentShotId);
  };

  const destroy = () => {
    if (destroyed) return;
    cancelOperation();
    destroyed = true;
    document.removeEventListener('pointerdown', secondPointer, true);
    window.removeEventListener('resize', cancelForLayoutChange);
    window.removeEventListener('orientationchange', cancelForLayoutChange);
    window.visualViewport?.removeEventListener('resize', cancelForLayoutChange);
    document.removeEventListener('visibilitychange', cancelForVisibility);
    root.remove();
  };

  return { element: root, update, cancel: cancelOperation, destroy };
}

export { chapterAt, formatClock, valueText };
