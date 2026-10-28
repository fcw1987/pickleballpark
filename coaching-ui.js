// Shared display-only coaching story and cue rendering for guided and 3D views.
import { terminalCueLabel } from './terminal-cues.js';
export function updateCoachingUI(elements, sample = {}) {
  const set = (key, value = '') => { const el = elements[key]; if (el && el.textContent !== String(value)) el.textContent = value; };
  const active = sample.playId != null;
  set('title', sample.title || '');
  set('progress', active && Number.isFinite(sample.stepIndex) ? `Step ${sample.stepIndex + 1} of ${sample.stepCount || 0}` : '');
  set('stepLabel', sample.label || '');
  set('description', sample.description || '');
  const phaseLabel={'waiting-contact':'Prepare','post-bounce':'After bounce','incoming-contact':'Contact',contact:'Contact',flight:'In flight',bounce:'Bounce',held:'Recovery',complete:'Complete','net-touch':'Net touch','net-drop':'Ball dropping','second-bounce':'Second bounce',out:'Out',fault:'Fault',dead:'Point over'}[sample.phase]||sample.phase;
  const cue = terminalCueLabel(sample.terminalEvent) || (sample.shotType && sample.phase && sample.phase !== 'ready' ? `${sample.nextShot ? 'Next shot: ' : ''}${sample.shotType.replaceAll('-',' ')} · ${phaseLabel}` : '');
  ['shotCue', 'threeDShotCue'].forEach(key => {
    const el = elements[key]; if (!el) return;
    if (el.textContent !== cue) el.textContent = cue;
    if (el.hidden !== Boolean(!cue)) el.hidden = !cue;
    if (sample.terminalEvent) el.dataset.terminalEvent = sample.terminalEvent.type;
    else if (el.dataset.terminalEvent) delete el.dataset.terminalEvent;
    const eventTime = sample.terminalEvent?.time ?? sample.eventTime;
    if (cue && Number.isFinite(eventTime) && Number.isFinite(sample.elapsed)) {
      const age = Math.max(0, Math.min(0.2, sample.elapsed - eventTime));
      const progress = Math.max(0, Math.min(1, age / 0.2));
      const reduced = Boolean(sample.reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      const opacity=reduced?'1':String(.75+.25*progress), offset=reduced?'0px':`${3*(1-progress)}px`;
      if(el.style.getPropertyValue('--cue-opacity')!==opacity)el.style.setProperty('--cue-opacity',opacity);
      if(el.style.getPropertyValue('--cue-y')!==offset)el.style.setProperty('--cue-y',offset);
      const phase = sample.terminalEvent?.type || sample.phase;
      if(el.dataset.phase!==phase)el.dataset.phase=phase;
    }
  });
  if(elements.loop&&elements.loop.getAttribute('aria-pressed')!==String(Boolean(sample.loop)))elements.loop.setAttribute('aria-pressed',String(Boolean(sample.loop)));
  if (elements.threeDLoop) elements.threeDLoop.setAttribute('aria-pressed', String(Boolean(sample.loop)));
  return { cue, active };
}
