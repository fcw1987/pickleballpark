/**
 * Court first play builder UI.
 *
 * This module owns only the builder controls. The court renderer and the play
 * compiler remain authoritative elsewhere; every interaction is reported as a
 * small action so the integration layer can keep one document and one clock.
 */

import { mountShotTimeline } from './shot-timeline.js';
import { createPlayerCoverageControl } from './player-coverage-ui.js';
import { MAX_SHOTS } from './play-document.js';
import { getPlayerLabels, playerChoices, playerLabel as stablePlayerLabel } from './player-labels.js';

const FAMILIES = [
  ['serve', 'Serve'], ['return', 'Return'], ['drive', 'Drive'], ['drop', 'Drop'],
  ['dink', 'Dink'], ['volley', 'Volley / block'], ['reset', 'Reset'],
  ['lob', 'Lob'], ['overhead', 'Overhead']
];
const FAMILY_GLYPHS = { serve: '◆', return: '↶', drive: '➤', drop: '◇', dink: '•', volley: '✦', reset: '↺', lob: '⌁', overhead: '△' };
const FAMILY_DESCRIPTIONS = {
  serve: 'Start the rally with a legal diagonal serve.',
  return: 'Send the serve back deep after its bounce.',
  drive: 'A firm groundstroke that moves through transition.',
  drop: 'A soft bouncing ball that falls into the kitchen.',
  dink: 'A short, soft exchange at the kitchen line.',
  volley: 'Meet the ball in the air with a compact block.',
  reset: 'Soften a fast ball into a playable reset.',
  lob: 'Lift the ball high over an advancing player.',
  overhead: 'Strike a high ball before it bounces.'
};
const PLAYERS = [['player1', 'Green Left'], ['player2', 'Green Right'], ['player3', 'Orange Left'], ['player4', 'Orange Right']];
const FLIGHTS=[['high/medium','High / steady'],['high/soft','High / soft'],['low/firm','Low / firm'],['medium/medium','Medium / steady']];
const MAX_IMPORT_BYTES = 512 * 1024;
const UI_MAX_SHOTS = MAX_SHOTS;

const text = (element, value) => { element.textContent = value == null ? '' : String(value); return element; };
const el = (tag, className, label) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) text(node, label);
  return node;
};
const button = (label, action, className = '') => {
  const node = el('button', className, label);
  node.type = 'button';
  node.dataset.action = action;
  return node;
};
const option = (value, label) => { const node = el('option', '', label); node.value = value; return node; };
const select = (label, action, values) => {
  const wrap = el('label', 'builder-field');
  text(wrap.appendChild(el('span', 'builder-field-label')), label);
  const control = el('select'); control.dataset.action = action; control.setAttribute('aria-label', label);
  values.forEach(([value, name]) => control.appendChild(option(value, name)));
  wrap.appendChild(control); return wrap;
};
const labelled = (label, control) => {
  const wrap = el('label', 'builder-field');
  wrap.appendChild(el('span', 'builder-field-label', label)); wrap.appendChild(control); return wrap;
};
const numberField = (label, action, value, min, max) => {
  const input = document.createElement('input'); input.type = 'number'; input.value = Number(Number(value).toFixed(3)); input.min = min; input.max = max; input.step = '0.1'; input.dataset.action = action; input.setAttribute('aria-label', label);
  return labelled(label, input);
};

function shotLabel(shot, index) { return `${FAMILY_GLYPHS[shot?.family] || '◆'} ${index + 1}. ${FAMILIES.find(([id]) => id === shot?.family)?.[1] || 'Shot'}`; }

function updateChapterSummary(summary, label) {
  let full = summary.querySelector('.builder-chapter-full');
  let compact = summary.querySelector('.builder-chapter-compact');
  if (!full || !compact) {
    full = el('span', 'builder-chapter-full'); compact = el('span', 'builder-chapter-compact');
    summary.replaceChildren(full, compact);
  }
  const number = /^\D*(\d+)\./.exec(label)?.[1];
  const shortLabel = number ? `Shot ${number}` : 'Shots';
  if (full.textContent !== label) full.textContent = label;
  if (compact.textContent !== shortLabel) compact.textContent = shortLabel;
  summary.setAttribute('aria-description', `Current chapter: ${label}`);
}

function recipeSummary(shot) {
  if (!shot) return '';
  const family = FAMILIES.find(([id]) => id === shot.family)?.[1] || 'Shot';
  const {x, y} = shot.target || {};
  const depth = Number.isFinite(y) ? (y <= 9 || y >= 35 ? 'deep ' : y >= 15 && y <= 29 ? 'short ' : '') : '';
  const direction = Number.isFinite(x) ? (Math.abs(x-10) <= 1 ? 'toward the centerline' : x < 7 ? 'toward the left sideline' : x > 13 ? 'toward the right sideline' : 'through the middle') : 'to the selected target';
  const flight = `${shot.arc || 'medium'} arc, ${shot.pace || 'medium'} pace`;
  return `${family} · ${flight} · ${depth}${direction} (green-side view)`;
}
function titleCase(value) {
  return String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
function playerLabel(id, labels) { return labels?.[id] || stablePlayerLabel(id); }
function targetSummary(shot) {
  if (!shot) return { depth: 'Open target', direction: 'Choose a court point' };
  const x = Number(shot.target?.x);
  const y = Number(shot.target?.y);
  const depth = Number.isFinite(y) ? (y <= 9 || y >= 35 ? 'Deep' : y >= 15 && y <= 29 ? 'Short' : 'Middle') : 'Open';
  const direction = Number.isFinite(x) ? (Math.abs(x - 10) <= 1 ? 'Centerline lane' : x < 7 ? 'Left lane' : x > 13 ? 'Right lane' : 'Middle lane') : 'Selected target';
  return { depth, direction };
}
function flightSummary(shot) {
  const arc = ['low', 'medium', 'high'].includes(shot?.arc) ? `${titleCase(shot.arc)} arc` : 'Custom arc';
  const pace = ['soft', 'medium', 'firm'].includes(shot?.pace) ? `${titleCase(shot.pace)} pace` : 'Custom pace';
  return `${pace} · ${arc}`;
}
function shotCardDescription(shot) {
  const target = targetSummary(shot);
  return `${target.depth} ${target.direction.toLowerCase()}`;
}
function cueDescription(current, shots, selected) {
  const shot = shots.find(s => s.id === current.cue?.shotId) || selected;
  return current.cue?.description?.startsWith('Authored ') ? recipeSummary(shot) : (current.cue?.description || recipeSummary(shot));
}

function findingText(item, shots, labels = null) {
  const index=shots.findIndex(s=>s.id===(item.shotId || item.stepId));
  const kind={rule:'Rules issue',feasibility:'Movement or flight limit',tactical:'Coaching suggestion',unsupported:'Preview limitation'}[item.kind] || 'Review';
  let message=item.message || 'Review this shot';
  for(const [id,label] of PLAYERS)message=message.replaceAll(id,labels?.[id] || label);
  let correction='';
  if(message.includes('diagonal receiving'))correction=' Move the serve target into the opposite service box beyond the kitchen.';
  else if(message.includes('alternate between teams'))correction=' Choose a hitter on the opposite team or remove the duplicate contact.';
  else if(message.includes('must let'))correction=' Choose a bounced return or groundstroke for this opening contact.';
  else if(message.includes('pinned'))correction=' Adjust the manual destination, or explicitly unpin that movement before retrying.';
  else if(message.includes('cannot reach') || message.includes('could not reach'))correction=' Try a softer incoming shot or move the starting player closer; your target and pins have been kept.';
  else if(message.includes('must cross the net'))correction=' Place the target on the other side of the net.';
  return `${index>=0?`Shot ${index+1} · `:''}${kind}: ${message}${correction}`;
}

// Navigation only: follow the last authored movement command for the named
// player before the blocked contact. The compiler remains the lock authority.
function findingPinSource(item, shots) {
  const player = /\bplayer[1-4]\b/.exec(item.message || '')?.[0];
  const affected = shots.findIndex(shot => shot.id === (item.shotId || item.stepId));
  if (!player || affected < 1 || !item.message?.includes('is pinned at')) return null;
  let source = null;
  for (let index = 0; index < affected; index++) {
    const shot = shots[index];
    const command = shot.playerMovement?.[player] || (shot.hitter === player ? shot.movement : null);
    if (command) source = command.pinned ? { shotId: shot.id, number: index + 1, player } : null;
  }
  return source;
}

export function mountBuilderUI({ onAction = () => {} } = {}) {
  const root = el('section', 'builder-ui');
  root.setAttribute('aria-label', 'Build a Play');
  document.body.appendChild(root);
  document.body.classList.add('builder-workspace');
  let current = { document: null, selectedShotId: null, selectedChapterId: null, currentShotId: null, chapters: [], findings: [], playing: false, time: 0, duration: 8.5, view: '2d', workspace: 'builder', saveStatus: 'Saved locally', library: [], templates: [], loop: false, rate: 1, busy: false, message: '', canUndo: false, canRedo: false, camera: 'overhead' };
  let destroyed = false;
  let renderedDocument = null;
  let renderedSelectedShotId = null;
  let renderedView = null;
  let renderedWorkspace = null;
  let renderedWaypointKey = '';
  let renderedSaveErrorKey = '';
  let renderedProposalKey = '';
  let renderedCoachOptionsKey = '';
  let renderedSettingsKey = '';
  let renderedControlsState = [];
  let userInspectorExpanded = null;
  let inspectorManualCollapsed = null;
  let advancedOpen = false;
  let shotDetailsOpen = false;
  let familyPickerOpen = false;
  let familyTypeahead = '';
  let familyTypeaheadTimer = null;
  let detailGroup = 'target';
  let handednessOpen = false;
  let assistanceOpen = false;
  // A family choice is a controlled state transition. The native details
  // element is still allowed to open for browsing, but its stale DOM `open`
  // value must not win when the choice itself triggers a rerender.
  let preserveFamilyPickerState = false;
  let importFileGeneration = 0;
  let pendingField = false;
  let exportedBackup = '';
  let timelineControl = null;
  let placementWasActive = false;
  const templateDialog = el('dialog', 'builder-dialog');
  const importDialog = el('dialog', 'builder-dialog');
  const randomDialog = el('dialog', 'builder-dialog builder-random-dialog');
  templateDialog.setAttribute('aria-label', 'Play library and templates');
  importDialog.setAttribute('aria-label', 'Import or export play');
  randomDialog.setAttribute('aria-label', 'Random rally');
  function closeDialog(dialog) { if (dialog.open) dialog.close(); }
  function openTemplateDialog(mode = 'learn', message = '') {
    timelineControl?.cancel?.();
    const libraryMode = mode === 'library';
    templateDialog.setAttribute('aria-label', libraryMode ? 'My Plays' : 'Learn and templates');
    templateDialog.replaceChildren(el('h2', '', libraryMode ? 'My Plays' : 'Learn / Templates'), el('p', 'builder-dialog-copy', libraryMode ? 'Open a saved play from this device.' : 'Choose a lesson or template to open as a copy.'));
    const list = el('div', 'builder-dialog-list'); const entries = (libraryMode ? current.library || [] : current.templates || []).map(item => ({ ...item, __kind: libraryMode ? 'open' : 'template' }));
    entries.forEach(item => {
      const id = item.id; const label = item.name || item.title || id;
      const b = button(label, 'template-open', 'builder-button'); b.dataset.id = id; b.dataset.kind = item.__kind;
      if (libraryMode) {
        const row = el('div', 'builder-saved-play-row'); row.dataset.playId = id;
        const remove = button('Delete', 'delete-play', 'builder-button builder-button-danger'); remove.dataset.id = id; remove.setAttribute('aria-label', `Delete ${label}`);
        // Keep the revision the user actually saw, even if a storage event
        // refreshes current.library while this dialog remains open.
        remove.savedPlaySnapshot = { id, title: item.title, name: item.name, revision: item.revision };
        row.append(b, remove); list.appendChild(row);
      } else list.appendChild(b);
    });
    if (!entries.length) list.appendChild(el('p', 'builder-dialog-copy', 'No saved plays or templates yet.'));
    templateDialog.appendChild(list);
    const status = el('p', 'builder-library-status', message); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); templateDialog.appendChild(status);
    templateDialog.appendChild(button('Close', 'dialog-close', 'builder-button'));
    if (!templateDialog.open) templateDialog.showModal();
  }
  function openImportDialog() {
    timelineControl?.cancel?.();
    importFileGeneration += 1;
    importDialog.replaceChildren(el('h2', '', 'Import / Export'), el('p', 'builder-dialog-copy', 'Import creates a separate editable copy. Paste a versioned play JSON backup or choose a local file, then select Import JSON.'), labelled('JSON backup', Object.assign(document.createElement('textarea'), { rows: 8, spellcheck: false })));
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'application/json,.json'; file.setAttribute('aria-label', 'Choose JSON file'); file.dataset.action = 'import-file'; importDialog.appendChild(labelled('JSON file', file));
    const actions = el('div', 'builder-dialog-actions'); actions.append(button('Import JSON', 'import-json', 'builder-button builder-button-primary')); actions.append(button('Export current play', 'export', 'builder-button')); actions.append(button('Close', 'dialog-close', 'builder-button')); importDialog.appendChild(actions);
    if (!importDialog.open) importDialog.showModal();
  }
  function openRandomDialog() {
    timelineControl?.cancel?.();
    const count = el('input'); count.type = 'number'; count.min = '1'; count.max = String(UI_MAX_SHOTS); count.step = '1'; count.value = '7'; count.inputMode = 'numeric'; count.dataset.action = 'random-count'; count.setAttribute('aria-label', 'Number of hits');
    const seed = el('input'); seed.type = 'number'; seed.min = '0'; seed.max = '4294967295'; seed.step = '1'; seed.inputMode = 'numeric'; seed.placeholder = 'Optional number'; seed.dataset.action = 'random-seed'; seed.setAttribute('aria-label', 'Random seed'); seed.setAttribute('aria-describedby', 'builder-random-seed-help');
    const seedHelp = el('p', 'builder-dialog-copy', 'Optional whole number from 0 to 4294967295. Reuse a number to repeat a rally, or leave it blank for a new one.'); seedHelp.id = 'builder-random-seed-help';
    randomDialog.replaceChildren(
      el('h2', '', 'Random Rally'),
      el('p', 'builder-dialog-copy', `Create a fresh playable rally with exactly the requested number of paddle contacts (1–${UI_MAX_SHOTS}). Your current play stays safe until you choose to use the result.`),
      labelled('Hits', count),
      labelled('Seed', seed),
      seedHelp,
      el('p', 'builder-dialog-copy builder-proposal-status', current.proposalBusy ? (typeof current.proposalProgress === 'object' && current.proposalProgress ? `${current.proposalProgress.label || 'Building rally'}${Number.isFinite(current.proposalProgress.completed) && Number.isFinite(current.proposalProgress.total) ? ` · ${current.proposalProgress.completed}/${current.proposalProgress.total}` : '…'}` : 'Building rally…') : ''),
      (() => { const actions = el('div', 'builder-dialog-actions'); const cancel = button('Cancel', 'cancel-proposal', 'builder-button'); const create = button('Create rally', 'random-rally', 'builder-button builder-button-primary'); create.disabled = Boolean(current.proposalBusy); actions.append(cancel, create); return actions; })()
    );
    if (!randomDialog.open) randomDialog.showModal();
    randomDialog.querySelector('[data-action="random-count"]')?.focus({ preventScroll: true });
  }
  const cancelRandomDialog = () => { closeDialog(randomDialog); rerenderAction('cancelProposal'); };
  randomDialog.addEventListener('cancel', event => { event.preventDefault(); cancelRandomDialog(); });
  randomDialog.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); cancelRandomDialog();
  });

  const fire = (type, payload) => onAction(type, payload);
  const syncViewingShot = async () => {
    if (!current.playing && inspectorManualCollapsed !== false && current.currentShotId && current.currentShotId !== current.selectedShotId)
      await fire('selectShot',{id:current.currentShotId,preserveTime:true});
  };
  const handleTimelineAction = async (action, payload) => {
    const result=await fire(action, action==='seek'?Number(payload):payload);
    if(['seek','chapter','scrubEnd','scrubCancel'].includes(action))await syncViewingShot();
    return result;
  };
  timelineControl = mountShotTimeline({ onAction: handleTimelineAction });
  const title = el('h1', 'builder-title', 'Build a Play');
  const status = el('span', 'builder-save-status');

  function render(state = {}) {
    if (destroyed) return;
    current = { ...current, ...state, document: state.document || current.document };
    const placementActive = Boolean(current.targetPlacement || current.movementPlacement);
    const placementJustFinished = placementWasActive && !placementActive;
    placementWasActive = placementActive;
    if (placementJustFinished) {
      inspectorManualCollapsed = false;
      userInspectorExpanded = true;
    }
    const doc = current.document || { title: 'Build a Play', shots: [], players: {}, assistance: {} };
    const shots = Array.isArray(doc.shots) ? doc.shots : [];
    const selected = shots.find(shot => shot.id === current.selectedShotId) || shots[0];
    if (selected) current.selectedShotId = selected.id;
    const waypointKey = JSON.stringify(current.waypointPolicy || null);
    const saveErrorKey = JSON.stringify(current.saveError || null);
    const proposalKey = JSON.stringify([current.proposalBusy, current.proposalProgress]);
    const coachOptionsKey = JSON.stringify(current.coachOptions || null);
    const settingsKey = JSON.stringify([current.rate, current.camera, current.canUndo, current.canRedo, current.findings, document.body.dataset.theme]);
    const structureChanged = renderedDocument !== doc || renderedSelectedShotId !== current.selectedShotId || renderedView !== current.view || renderedWorkspace !== current.workspace || renderedWaypointKey !== waypointKey || renderedSaveErrorKey !== saveErrorKey || renderedProposalKey !== proposalKey || renderedCoachOptionsKey !== coachOptionsKey || renderedSettingsKey !== settingsKey;
    // The clock still updates the timeline every frame. Other controls change
    // only when their displayed state changes, preserving focused inputs and
    // avoiding repeated DOM queries and live-region writes during playback.
    timelineControl?.update({ chapters: current.chapters || [], time: current.time || 0, duration: current.duration || 0, playing: Boolean(current.playing), busy: Boolean(current.busy), currentShotId: current.currentShotId || current.selectedChapterId || null });
    const controlsState = [current.currentShotId, current.selectedChapterId, current.cue?.title, current.playing, current.busy, current.saveStatus, current.message, current.targetPlacement, current.movementPlacement, inspectorManualCollapsed, pendingField];
    if (!structureChanged && controlsState.every((value, index) => value === renderedControlsState[index])) return;
    renderedControlsState = controlsState;
    root.classList.toggle('builder-placing', placementActive);
    const labels = getPlayerLabels(doc);
    const players = playerChoices(doc);
    if (!structureChanged && root.childElementCount) {
      const liveChapterId = current.currentShotId || current.selectedChapterId || null;
      root.querySelectorAll('[data-action="chapter"]').forEach(chapter => chapter.setAttribute('aria-current', String(Boolean(liveChapterId && chapter.dataset.shotId === liveChapterId))));
      const save = root.querySelector('.builder-save-status'); if (save) save.textContent = pendingField?'Editing · not saved yet':current.saveStatus || 'Draft';
      const savePill = root.querySelector('[data-ui="save-pill"]'); if (savePill) { const saveText = pendingField ? 'Editing' : (current.saveStatus || 'Saved'); savePill.textContent = saveText; savePill.setAttribute('aria-label', `Save state: ${saveText}`); }
      const message = root.querySelector('.builder-message'); if (message) message.textContent = current.message || '';
      const cueNode = root.querySelector('.builder-cue'); const fastCue = current.cue; if (cueNode && fastCue) { const summary = cueNode.querySelector('.builder-chapter-menu > summary'); if (summary) updateChapterSummary(summary, fastCue.title || 'Current shot'); }
      const liveShot = shots.find(shot => shot.id === (current.currentShotId || current.selectedShotId));
      const card = root.querySelector('[data-shot-card]');
      if (card && liveShot) {
        const cardIndex = shots.findIndex(shot => shot.id === liveShot.id);
        const target = targetSummary(liveShot);
        const number = card.querySelector('[data-shot-card-number]'); if (number) number.textContent = `SHOT ${Math.max(1, cardIndex + 1)}`;
        const family = card.querySelector('[data-shot-card-family]'); if (family) family.textContent = FAMILIES.find(([id]) => id === liveShot.family)?.[1] || 'Shot';
        const description = card.querySelector('[data-shot-card-description]'); if (description) description.textContent = `${target.depth} ${target.direction.toLowerCase()}`;
        const flight = card.querySelector('[data-shot-card-flight]'); if (flight) flight.textContent = flightSummary(liveShot);
      const player = card.querySelector('[data-shot-card-player]'); if (player) player.textContent = playerLabel(liveShot.hitter, labels);
      }
      const play = root.querySelector('[data-action="play-pause"]'); if (play) {
        const icon=play.querySelector('.pixel-play-icon'),label=play.querySelector('.pixel-play-label');
        const iconText=current.playing?'Ⅱ':'▶',labelText=current.playing?'Pause':'Play';
        if(icon&&label){if(icon.textContent!==iconText)icon.textContent=iconText;if(label.textContent!==labelText)label.textContent=labelText;}
        else play.replaceChildren(el('span','pixel-play-icon',iconText),el('span','pixel-play-label',labelText));
        play.setAttribute('aria-pressed', String(Boolean(current.playing))); play.setAttribute('aria-label', labelText);
      }
      root.classList.toggle('builder-busy', Boolean(current.busy));
      root.querySelector('.builder-context-actions [data-action="collapse-inspector"]')?.setAttribute('aria-expanded', String(current.workspace === 'planner' || inspectorManualCollapsed === false));
      const inspector = root.querySelector('.builder-inspector'); const collapsed = current.workspace==='planner'?false:Boolean(inspectorManualCollapsed ?? true); if (inspector) inspector.classList.toggle('builder-inspector-collapsed', collapsed); const collapseButton = root.querySelector('.builder-inspector [data-action="collapse-inspector"],.builder-inspector [data-action="cancel-target"],.builder-inspector [data-action="cancel-movement"]'); if (collapseButton) {
        const placement = current.targetPlacement ? 'target' : current.movementPlacement ? 'movement' : '';
        if (placement === 'target' || placement === 'movement' || collapsed) {
          const collapseText=placement==='target'?'Cancel target':placement==='movement'?'Cancel movement':'Customize';
          if(collapseButton.textContent!==collapseText||collapseButton.childElementCount)collapseButton.textContent=collapseText;
        } else if (collapseButton.textContent !== 'Close') collapseButton.textContent = collapsed ? 'Customize' : 'Close';
        collapseButton.dataset.action=placement==='target'?'cancel-target':placement==='movement'?'cancel-movement':'collapse-inspector'; collapseButton.setAttribute('aria-label', placement === 'target' ? 'Cancel target' : placement === 'movement' ? 'Cancel movement' : collapsed ? 'Customize shot' : 'Close editor'); collapseButton.setAttribute('aria-expanded', String(!collapsed));
      }
      return;
    }
    renderedDocument = doc; renderedSelectedShotId = current.selectedShotId; renderedView = current.view; renderedWorkspace = current.workspace; renderedWaypointKey = waypointKey; renderedSaveErrorKey = saveErrorKey; renderedProposalKey = proposalKey; renderedCoachOptionsKey = coachOptionsKey; renderedSettingsKey = settingsKey;
    const previousAdvanced = root.querySelector('.builder-advanced'); if (previousAdvanced) advancedOpen = previousAdvanced.open;
    const oldDetails=root.querySelector('.builder-shot-details');if(oldDetails)shotDetailsOpen=oldDetails.open;
    const oldFamilyPicker=root.querySelector('.builder-family-picker');if(oldFamilyPicker && !preserveFamilyPickerState)familyPickerOpen=oldFamilyPicker.open;
    preserveFamilyPickerState = false;
    const oldHanded=root.querySelector('.builder-handedness');if(oldHanded)handednessOpen=oldHanded.open;
    const oldAssistance=root.querySelector('.builder-assistance');if(oldAssistance)assistanceOpen=oldAssistance.open;
    const mainMenuOpen=Boolean(root.querySelector('.builder-main-menu')?.open);
    const documentMenuOpen=Boolean(root.querySelector('.builder-document-menu')?.open);
    const optionsMenuOpen=Boolean(root.querySelector('.builder-context-menu')?.open);
    const chaptersOpen=Boolean(root.querySelector('.builder-chapter-menu')?.open);
    const focused=document.activeElement;const focusIdentity=root.contains(focused)?{action:focused.dataset.action,shotId:focused.dataset.shotId,label:focused.getAttribute('aria-label')}:null;
    const oldInspectorScroll=root.querySelector('.builder-inspector')?.scrollTop || 0;
    // Enlarged controls scroll this root. Removing its children temporarily
    // collapses scrollHeight; preserve the user's viewport through a rebuild.
    const oldRootScroll=root.scrollTop;
    // Keep modal dialogs connected through save/field/viewport updates.
    for(const child of [...root.children])if(child.tagName!=='DIALOG')child.remove();
    root.classList.toggle('builder-planner', current.workspace === 'planner');

    const mainMenu = el('details', 'builder-menu builder-main-menu'); mainMenu.open=mainMenuOpen;
    const menuSummary=el('summary');menuSummary.setAttribute('aria-label','Menu');
    const menuIcon=el('span','builder-menu-icon','☰');menuIcon.setAttribute('aria-hidden','true');
    menuSummary.append(menuIcon,el('span','builder-menu-word','Menu'));mainMenu.append(menuSummary);
    const menuPanel = el('div', 'builder-menu-panel');
    const menuHeading = el('div', 'builder-menu-heading'); menuHeading.append(el('span', 'builder-park-mark', '◆'), el('strong', '', 'PICKLEBALL PARK'));
    const rename = button('Rename play', 'rename', 'builder-menu-item builder-button');
    const titleInput = el('input'); titleInput.type = 'text'; titleInput.value = doc.title || 'Untitled play'; titleInput.maxLength = 80; titleInput.dataset.action = 'title'; titleInput.setAttribute('aria-label', 'Play title');
    const titleField = labelled('Play name', titleInput); titleField.classList.add('builder-menu-field');
    const documentMenu = el('details', 'builder-document-menu'); documentMenu.open = documentMenuOpen;
    const documentSummary = el('summary', 'builder-menu-submenu-summary', 'Manage plays'); documentSummary.setAttribute('aria-label', 'Manage plays'); documentMenu.append(documentSummary);
    const playGroup = el('div', 'builder-menu-group'); playGroup.append(el('h3', '', 'Your plays'), titleField, rename, button('My Plays', 'open', 'builder-menu-item builder-button'), button('Save As', 'save-as', 'builder-menu-item builder-button'));
    playGroup.append(button('Import / Export', 'import-export', 'builder-menu-item builder-button'), button('Build diagnostics', 'buildDiagnostics', 'builder-menu-item builder-button builder-appearance-toggle'));
    documentMenu.append(playGroup);
    const learnGroup = el('div', 'builder-menu-group'); learnGroup.append(el('h3', '', 'Practice'), button('Learn', 'templates', 'builder-menu-item builder-button'), button('Random Rally', 'random', 'builder-menu-item builder-button'), button(current.workspace === 'planner' ? 'Return to builder' : 'Court Planner', current.workspace === 'planner' ? 'workspace-builder' : 'workspace-planner', 'builder-menu-item builder-button'));
    const toolsGroup = el('div', 'builder-menu-group');
    const appearance = button(document.body.dataset.theme === 'dark' ? '☀ Light mode' : '☾ Dark mode', 'appearance', 'builder-menu-item builder-button builder-appearance-toggle'); appearance.setAttribute('aria-label', document.body.dataset.theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance');
    toolsGroup.append(el('h3', '', 'Tools'), button('Help', 'help', 'builder-menu-item builder-button'), appearance);
    const newPlay = button('New Play', 'new', 'builder-menu-item builder-button builder-button-primary builder-new-play');
    menuPanel.append(menuHeading, newPlay, documentMenu, learnGroup, toolsGroup);
    const meta = el('div', 'builder-meta');
    status.textContent = pendingField?'Editing · not saved yet':current.saveStatus || 'Draft'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.className = 'builder-save-status'; playGroup.append(status); mainMenu.appendChild(menuPanel);
    meta.appendChild(mainMenu);
    meta.appendChild(el('span', 'builder-app-title', 'PICKLEBALL PARK'));
    const needsStatus = pendingField || current.saveError || (current.saveStatus && !/^saved(?: locally| on this device)?$/i.test(current.saveStatus));
    if (needsStatus) {
      const compactStatus = el('span', 'builder-save-pill', pendingField ? 'Editing' : (current.saveStatus || 'Draft'));
      compactStatus.dataset.ui = 'save-pill'; compactStatus.setAttribute('aria-label', `Save state: ${compactStatus.textContent}`); compactStatus.setAttribute('role', 'status');
      meta.appendChild(compactStatus);
    }
    const compactMessage = el('span', 'builder-message', current.message || '');
    meta.appendChild(compactMessage);
    if (current.saveError) {
      const error = el('div', 'builder-save-error');
      error.append(el('strong', '', current.saveError.libraryFull ? 'My Plays is full.' : current.saveError.conflict ? 'This draft changed elsewhere.' : 'Could not save this draft.'), el('span', '', current.saveError.message || 'Your edits are still here. Retry or save a copy.'));
      if (!current.saveError.conflict) error.append(button('Retry save', 'retry-save', 'builder-button builder-button-accent'));
      if (current.saveError.libraryFull) {
        error.append(el('span', '', 'Delete a saved play in My Plays to make room, then retry saving. You can export this draft as a backup.'), button('Manage saved plays', 'open', 'builder-button'), button('Export this draft', 'export', 'builder-button'));
      } else error.append(button('Save a copy', 'save-as', 'builder-button'));
      meta.appendChild(error);
    }
    const cue = current.cue || (selected ? { title: shotLabel(selected, shots.indexOf(selected)), description: '' } : null);
    const cueNode = el('div', 'builder-cue');
    let shotCardNode = null;
    if (selected) {
      const target = targetSummary(selected);
      const card = el('div', 'builder-shot-card'); card.dataset.shotCard = 'true'; shotCardNode = card;
      const cardKicker = el('div', 'builder-shot-card-kicker'); cardKicker.append(el('span', 'builder-shot-card-number', `SHOT ${Math.max(1, shots.indexOf(selected) + 1)}`), el('span', 'builder-shot-card-family', FAMILIES.find(([id]) => id === selected.family)?.[1] || 'Shot'));
      cardKicker.querySelector('.builder-shot-card-number').dataset.shotCardNumber = 'true'; cardKicker.querySelector('.builder-shot-card-family').dataset.shotCardFamily = 'true';
      const cardDescription = el('strong', 'builder-shot-card-description', `${target.depth} ${target.direction.toLowerCase()}`); cardDescription.dataset.shotCardDescription = 'true';
      const cardFlight = el('span', 'builder-shot-card-flight', flightSummary(selected)); cardFlight.dataset.shotCardFlight = 'true';
      const cardPlayer = el('span', 'builder-shot-card-player', playerLabel(selected.hitter, labels)); cardPlayer.dataset.shotCardPlayer = 'true';
      card.append(cardKicker, cardDescription, cardFlight, cardPlayer);
    }
    const chapterMenu = el('details', 'builder-chapter-menu'); chapterMenu.open=chaptersOpen;
    const chapterSummary = el('summary', 'builder-chip'); updateChapterSummary(chapterSummary, cue?.title || 'Choose a shot'); chapterSummary.setAttribute('aria-label', 'Choose shot chapter'); chapterMenu.append(chapterSummary);
    const chapterList = el('div', 'builder-chapter-list'); chapterList.setAttribute('aria-label', 'Shot chapters');
    const chapterEntries = shots.map((shot, index) => { const chapter = (current.chapters || []).find(item => item.shotId === shot.id); return { ...(chapter || {}), shotId: shot.id, number: chapter?.number || index + 1, label: chapter?.label || FAMILIES.find(([id]) => id === shot.family)?.[1] || 'Shot', authoredOnly: !chapter }; });
    chapterEntries.forEach((chapter, index) => { const id = chapter.shotId || chapter.id || shots[index]?.id || ''; const shot = shots.find(item => item.id === id); const glyph = FAMILY_GLYPHS[shot?.family] || '◆'; const row = el('div', 'builder-chapter-row'); const b = button(`${glyph} Shot ${chapter.number || index + 1} · ${chapter.label || 'Shot'}${chapter.authoredOnly ? ' · needs review' : ''}`, 'chapter', 'builder-menu-item builder-button'); b.dataset.shotId = id; b.disabled = Boolean(chapter.authoredOnly); b.title = chapter.authoredOnly ? 'This authored shot is not in the valid playback prefix yet. Customize it to review.' : 'Seek to shot chapter'; b.setAttribute('aria-current', String((current.currentShotId || current.selectedChapterId || current.selectedShotId) === id)); row.appendChild(b); if (id) { const edit = button('Customize', 'edit-chapter', 'builder-button builder-button-quiet'); edit.dataset.shotId = id; edit.setAttribute('aria-label', `Customize Shot ${chapter.number || index + 1}`); row.appendChild(edit); const rowActions = el('details', 'builder-chapter-actions'); const rowSummary = el('summary', '', 'Actions'); rowSummary.setAttribute('aria-label', `Shot ${chapter.number || index + 1} actions`); const rowActionPanel = el('div', 'builder-chapter-action-panel'); const before = button('Insert before', 'insert-shot', 'builder-button'); before.dataset.position = 'before'; before.dataset.shotId = id; const after = button('Insert after', 'insert-shot', 'builder-button'); after.dataset.position = 'after'; after.dataset.shotId = id; const copyShot = button('Duplicate', 'duplicate-shot', 'builder-button'); copyShot.dataset.shotId = id; const removeShot = button('Delete', 'delete-shot', 'builder-button builder-button-danger'); removeShot.dataset.shotId = id; rowActionPanel.append(before, after, copyShot, removeShot); rowActions.append(rowSummary, rowActionPanel); row.appendChild(rowActions); } chapterList.appendChild(row); });
    if (!chapterEntries.length) chapterList.appendChild(el('span', 'builder-empty', 'Add a shot to create chapters.'));
    chapterMenu.append(chapterList);
    if (shotCardNode) { shotCardNode.append(chapterMenu); cueNode.append(shotCardNode); }
    else cueNode.append(chapterMenu);
    meta.appendChild(cueNode);
    const context = el('div', 'builder-context-actions');
    const editButton = button('Edit', 'collapse-inspector', 'builder-button builder-button-quiet'); editButton.setAttribute('aria-label',selected?'Edit shot':'Edit play');editButton.setAttribute('aria-expanded', String(inspectorManualCollapsed === false));
    const addButton = button('Add', 'add-shot', 'builder-button builder-button-primary'); addButton.setAttribute('aria-label', 'Add shot'); addButton.disabled = shots.length >= UI_MAX_SHOTS; addButton.title = addButton.disabled ? `This play has reached the ${UI_MAX_SHOTS}-shot limit` : 'Add a compatible next shot';
    context.append(editButton, addButton);
    const viewToggle = el('div', 'builder-view-toggle'); viewToggle.setAttribute('role', 'group'); viewToggle.setAttribute('aria-label', 'Court view');
    const nextView = current.view === '3d' ? '2d' : '3d';
    const viewButton = button(nextView.toUpperCase(), 'view', 'builder-view-button'); viewButton.dataset.view = nextView; viewButton.setAttribute('aria-label', `Switch to ${nextView.toUpperCase()} court view`); viewButton.title = `Switch to ${nextView.toUpperCase()} court view`; viewToggle.appendChild(viewButton);
    context.append(viewToggle); meta.appendChild(context);
    if (current.waypointPolicy?.requiresConfirmation) {
      const affected = (current.waypointPolicy.affected || []).map(item => `${item.number ? `Shot ${item.number}` : item.shotId || 'Shot'}${item.player ? ` · ${labels[item.player] || item.player}` : ''}`).join(', ');
      const detail = [current.waypointPolicy.message || 'Some movement waypoints are preview-only.', affected ? `Affected: ${affected}` : ''].filter(Boolean).join(' ');
      const notice = el('div', 'builder-waypoint-notice'); notice.append(el('strong', '', 'Movement path preview'), el('span', '', detail), button('Preview destination only', 'acknowledge-waypoints', 'builder-button builder-button-accent')); meta.appendChild(notice);
    }
    if(current.findings?.length){const firstFinding = typeof current.findings[0] === 'string' ? {} : current.findings[0]; const affectedId = firstFinding.shotId || firstFinding.stepId; const affectedIndex = shots.findIndex(shot => shot.id === affectedId); const review=button(`${affectedIndex >= 0 ? `Shot ${affectedIndex + 1} needs attention` : `${current.findings.length} items need attention`}`,'review-findings','builder-button builder-button-accent builder-issue-chip'); if (affectedId) review.dataset.shotId = affectedId; review.setAttribute('aria-label', affectedIndex >= 0 ? `Shot ${affectedIndex + 1} needs attention` : 'Review findings'); meta.append(review);}
    root.appendChild(meta);

    // The chapter map replaces the old permanently visible shot strip. Details
    // remain reachable from the compact chip without consuming court space.

    const layout = el('div', 'builder-layout');
    const court = el('div', 'builder-court-region'); court.dataset.view = current.view; court.setAttribute('aria-label', `${current.view === '3d' ? '3D' : '2D'} rally court host region`);
    court.setAttribute('data-builder-court-region', 'true');
    layout.appendChild(court);
    // Camera stays in the compact transport context menu so the court remains
    // available for coaching and placement.

    const inspectorAutoCollapsed = current.workspace === 'planner' ? false : (inspectorManualCollapsed ?? true);
    const inspector = el('aside', `builder-inspector ${inspectorAutoCollapsed ? 'builder-inspector-collapsed' : ''}`); inspector.setAttribute('aria-label', 'Selected shot settings'); inspector.setAttribute('role', 'region'); inspector.dataset.surface = 'nonmodal-sheet';
    if (current.workspace === 'planner') {
      inspector.append(el('h2', '', 'Court Planner')); inspector.append(el('p', 'builder-selected-summary', 'Your planner layout is preserved. Use it as the starting layout for a new or selected play.'));
      inspector.append(button('Return to builder', 'workspace-builder', 'builder-button builder-button-primary'));
      inspector.append(button('Use as starting layout', 'use-planner', 'builder-button builder-button-accent'));
      inspector.append(el('p', 'builder-selected-summary', 'Planner arrows and markup stay in the planner. They are not interpreted as rally shots.'));
    } else if (selected) {
      const inspectorHeader = el('div', 'builder-inspector-header'); inspectorHeader.append(el('div', '', selected ? `Shot ${shots.indexOf(selected) + 1} details` : 'No shot selected')); const inPlacement = current.targetPlacement || current.movementPlacement; const collapse = button(current.targetPlacement ? 'Cancel target' : current.movementPlacement ? 'Cancel movement' : inspectorAutoCollapsed ? 'Customize' : 'Close', current.targetPlacement?'cancel-target':current.movementPlacement?'cancel-movement':'collapse-inspector', 'builder-button builder-collapse'); collapse.setAttribute('aria-label', current.targetPlacement ? 'Cancel target' : current.movementPlacement ? 'Cancel movement' : inspectorAutoCollapsed ? 'Customize shot' : 'Close editor'); collapse.setAttribute('aria-expanded', String(!inspectorAutoCollapsed)); inspectorHeader.append(collapse); inspector.appendChild(inspectorHeader);
      const summary = el('p', 'builder-selected-summary', recipeSummary(selected)); inspector.appendChild(summary);
      const shotGroup = el('section', 'builder-control-group builder-group-shot'); shotGroup.append(el('h3', '', 'Shot'));
      const familyPicker = el('details', 'builder-family-picker'); familyPicker.open = familyPickerOpen;
      const familySummary = el('summary', 'builder-family-summary'); familySummary.append(el('span', 'builder-family-summary-glyph', FAMILY_GLYPHS[selected.family] || '◆'), el('span', 'builder-family-summary-text', FAMILIES.find(([id]) => id === selected.family)?.[1] || 'Choose shot type'));
      familySummary.setAttribute('aria-label', `Shot family: ${FAMILIES.find(([id]) => id === selected.family)?.[1] || 'Choose shot type'}`);
      const familyOptions = el('div', 'builder-family-options'); familyOptions.setAttribute('role', 'listbox'); familyOptions.setAttribute('aria-label', 'Shot families');
      FAMILIES.forEach(([id, label]) => { const choice = button('', 'choose-family', 'builder-family-option'); choice.dataset.family = id; choice.setAttribute('role', 'option'); choice.setAttribute('aria-selected', String(selected.family === id)); choice.tabIndex = selected.family === id ? 0 : -1; choice.setAttribute('aria-label', `${label}: ${FAMILY_DESCRIPTIONS[id] || 'Supported shot family'}`); const copy = el('span', 'builder-family-option-copy'); copy.append(el('strong', '', label), el('small', '', FAMILY_DESCRIPTIONS[id] || 'Supported shot family')); choice.append(el('span', 'builder-family-option-glyph', FAMILY_GLYPHS[id] || '◆'), copy); familyOptions.appendChild(choice); });
      familyPicker.append(familySummary, familyOptions);
      const hitterSelect = select('Hitter', 'edit-hitter', players); hitterSelect.querySelector('select').value = selected.hitter; hitterSelect.classList.add('builder-choice-field', 'builder-choice-hitter'); hitterSelect.dataset.team = /^player[12]$/.test(selected.hitter || '') ? 'green' : 'orange'; hitterSelect.querySelector('.builder-field-label').textContent = 'Hitter'; hitterSelect.querySelector('select').setAttribute('aria-label', 'Hitter');
      const familyLabel = el('span', 'builder-field-label', 'Shot type');
      const familyWrap = el('div', 'builder-choice-field builder-choice-family'); familyWrap.append(familyLabel, familyPicker);
      const shotChoices = el('div', 'builder-choice-grid'); shotChoices.append(familyWrap, hitterSelect); shotGroup.append(shotChoices); inspector.appendChild(shotGroup);
      const flightValue=`${selected.arc}/${selected.pace}`;
      const flight=select('Flight','flight-preset', [...FLIGHTS,...(FLIGHTS.some(([v])=>v===flightValue)?[]:[[flightValue,`Custom · ${selected.arc} / ${selected.pace}`]])]);flight.querySelector('select').value=flightValue;
      const quickTarget = el('div', 'builder-quick-actions'); quickTarget.append(el('span', 'builder-quick-label', 'Target'), button('Place target on court', 'place-target', 'builder-button builder-button-accent')); inspector.appendChild(quickTarget);
      const details = el('details', 'builder-shot-details'); details.open=shotDetailsOpen;details.append(el('summary', '', 'Customize'));
      const detailTabs = el('div', 'builder-detail-tabs'); detailTabs.setAttribute('role', 'tablist'); detailTabs.setAttribute('aria-label', 'Shot detail sections');
      const detailTab = (label, group) => { const tab = button(label, 'detail-group', 'builder-detail-tab'); tab.dataset.group = group; tab.id = `builder-detail-tab-${group}`; tab.setAttribute('aria-controls', `builder-detail-panel-${group}`); tab.setAttribute('role', 'tab'); tab.setAttribute('aria-label', label); tab.setAttribute('aria-selected', String(detailGroup === group)); tab.setAttribute('tabindex', detailGroup === group ? '0' : '-1'); return tab; };
      ['target', 'flight', 'players', 'movement', 'coach', 'precision'].forEach(group => detailTabs.appendChild(detailTab(titleCase(group === 'coach' ? 'Coach tools' : group), group)));
      details.append(detailTabs);
      const targetGroup = el('section', 'builder-control-group builder-group-target'); targetGroup.dataset.detailGroup = 'target'; targetGroup.setAttribute('role', 'tabpanel'); targetGroup.setAttribute('aria-label', 'Target settings'); targetGroup.classList.toggle('is-active', detailGroup === 'target'); targetGroup.append(el('h3', '', 'Target'));
      const targetRow = el('div', 'builder-target-row'); targetRow.append(el('div', 'builder-target-readout', 'Drag the target ring to adjust')); targetGroup.append(targetRow);
      const presets = el('div', 'builder-presets'); presets.append(el('span', 'builder-field-label', 'Quick target · green side')); [['wide', 3], ['middle', 10], ['centerline', 10]].forEach(([label, x]) => { const b = button(label, 'target-preset', 'builder-chip'); b.dataset.x = x; b.dataset.y = selected.target?.y || 20; b.dataset.direction = label; presets.appendChild(b); }); targetGroup.append(presets); details.appendChild(targetGroup);
      const flightGroup = el('section', 'builder-control-group builder-group-flight'); flightGroup.dataset.detailGroup = 'flight'; flightGroup.setAttribute('role', 'tabpanel'); flightGroup.setAttribute('aria-label', 'Flight settings'); flightGroup.classList.toggle('is-active', detailGroup === 'flight'); flightGroup.append(el('h3', '', 'Flight'), flight);
      const tuning = el('div', 'builder-grid-fields'); const arc = select('Arc', 'edit-arc', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]); const pace = select('Pace', 'edit-pace', [['soft', 'Soft'], ['medium', 'Medium'], ['firm', 'Firm']]); arc.querySelector('select').value = selected.arc || 'medium'; pace.querySelector('select').value = selected.pace || 'medium'; tuning.append(arc, pace); flightGroup.append(tuning); details.appendChild(flightGroup);
      const playersGroup = el('section', 'builder-control-group builder-group-players'); playersGroup.dataset.detailGroup = 'players'; playersGroup.setAttribute('role', 'tabpanel'); playersGroup.setAttribute('aria-label', 'Players settings'); playersGroup.classList.toggle('is-active', detailGroup === 'players'); playersGroup.append(el('h3', '', 'Players'));
      const receiver = select('Receiver', 'edit-receiver', [['auto', 'Automatic'], ...players]); receiver.querySelector('select').value = selected.receiver || 'auto'; playersGroup.append(receiver);
      const contactStyle = select('Contact style', 'edit-contactStyle', [['auto', 'Automatic'], ['forehand', 'Forehand'], ['backhand', 'Backhand'], ['short-hop', 'Short hop']]); contactStyle.querySelector('select').value = selected.contactStyle || 'auto'; playersGroup.append(contactStyle);
      if (selected.family === 'serve') {
        const serveMethod = select('Serve method', 'edit-serveMethod', [['drop', 'Drop serve'], ['volley', 'Volley serve']]); serveMethod.querySelector('select').value = selected.serveMethod || 'drop'; playersGroup.append(serveMethod);
        if (shots[0] === selected && doc.opening === 'serve') {
          const court = select('Serving court', 'service-court', [['unspecified', 'Not declared'], ['right', 'Right / even'], ['left', 'Left / odd']]);
          court.querySelector('select').value = doc.service?.court || 'unspecified'; playersGroup.append(court);
          const designated = doc.service?.receiver || (selected.receiver !== 'auto' ? selected.receiver : null);
          playersGroup.append(el('p', 'builder-selected-summary', designated ? `Serve returner: ${playerLabel(designated, labels)}. Change Receiver here to declare a different returner; their partner may stand elsewhere.` : 'Choose Receiver to declare the serve returner. Automatic positioning cannot establish service order.'));
        }
      } details.appendChild(playersGroup);
      const precisionGroup = el('section', 'builder-control-group builder-group-precision'); precisionGroup.dataset.detailGroup = 'precision'; precisionGroup.setAttribute('role', 'tabpanel'); precisionGroup.setAttribute('aria-label', 'Precision settings'); precisionGroup.classList.toggle('is-active', detailGroup === 'precision'); precisionGroup.append(el('h3', '', 'Precision'));
      const coords = el('div', 'builder-grid-fields'); coords.appendChild(numberField('Target width', 'edit-target.x', selected.target?.x ?? 10, 0, 20)); coords.appendChild(numberField('Target depth', 'edit-target.y', selected.target?.y ?? 20, 0, 44)); precisionGroup.append(coords); details.appendChild(precisionGroup);
      const movementGroup = el('section', 'builder-control-group builder-group-movement'); movementGroup.dataset.detailGroup = 'movement'; movementGroup.setAttribute('role', 'tabpanel'); movementGroup.setAttribute('aria-label', 'Movement settings'); movementGroup.classList.toggle('is-active', detailGroup === 'movement'); movementGroup.append(el('h3', '', 'Movement'));
      const movementPlayer = current.movementPlayer || selected.hitter;
      const movementState = movementPlayer === selected.hitter ? (selected.movement || {}) : (selected.playerMovement?.[movementPlayer] || {});
      const movementOwner = select('Moving player', 'movement-player', players); movementOwner.querySelector('select').value = movementPlayer; movementGroup.append(movementOwner);
      const movement = select('Movement intent', 'edit-movement.intent', [['hold', 'Hold'], ['advance', 'Advance'], ['recover', 'Recover'], ['manual', 'Manual']]); movement.querySelector('select').value = movementState.intent || 'recover';
      const initialTarget = doc.initialLayout?.[movementPlayer]?.target || doc.initialLayout?.[movementPlayer] || {};
      const movementTarget = movementState.target || initialTarget;
      movementGroup.append(movement);
      const manual = el('div', 'builder-grid-fields'); manual.appendChild(numberField('Manual X', 'edit-movement.target.x', movementTarget.x ?? 10, -8, 28)); manual.appendChild(numberField('Manual Y', 'edit-movement.target.y', movementTarget.y ?? 20, -8, 52)); movementGroup.append(manual);
      movementGroup.append(button('Place movement on court', 'place-movement', 'builder-button builder-button-accent'));
      const pinned = el('label', 'builder-switch'); const pin = el('input'); pin.type = 'checkbox'; pin.checked = Boolean(movementState.pinned); pin.dataset.action = 'edit-movement.pinned'; pinned.append(pin, el('span', '', 'Pin movement target')); movementGroup.append(pinned); details.appendChild(movementGroup); inspector.appendChild(details);
      const actionMenu = el('details', 'builder-shot-actions-menu'); actionMenu.append(el('summary', '', 'Shot actions'));
      const actions = el('div', 'builder-shot-actions');
      const insertBefore = button('Insert before', 'insert-shot', 'builder-button'); insertBefore.dataset.position = 'before'; insertBefore.dataset.shotId = selected.id;
      const insertAfter = button('Insert after', 'insert-shot', 'builder-button'); insertAfter.dataset.position = 'after'; insertAfter.dataset.shotId = selected.id;
      const duplicate = button('Duplicate shot', 'duplicate-shot', 'builder-button'); duplicate.dataset.shotId = selected.id;
      const remove = button('Delete shot', 'delete-shot', 'builder-button builder-button-danger'); remove.dataset.shotId = selected.id;
      actions.append(insertBefore, insertAfter, duplicate, remove); actionMenu.append(actions); shotGroup.appendChild(actionMenu);
      const advanced = el('details', 'builder-advanced'); advanced.open = advancedOpen; advanced.append(el('summary', '', 'Rally details'));
      const opening = select('Starting condition', 'opening', [['serve', 'Opening serve'], ['midrally', 'Mid-rally']]); opening.querySelector('select').value = doc.opening || 'serve'; advanced.append(opening);
      const ending = select('Ending intent', 'ending', [['stop', 'Stop at authored end'], ['winner', 'Declared winner'], ['fault', 'Declared fault']]); ending.querySelector('select').value = doc.ending || 'stop'; advanced.append(ending);
      const fault = el('label', 'builder-switch'); const faultInput = el('input'); faultInput.type = 'checkbox'; faultInput.checked = Boolean(doc.intentionalFault); faultInput.dataset.action = 'intentionalFault'; fault.append(faultInput, el('span', '', 'Intentional coaching mistake'), el('small', '', 'Keep the rule warning visible at the terminal fault.')); advanced.append(fault);
      const scope = select('Shade team', 'shade-team', [['both', 'Both teams'], ['green', 'Green'], ['orange', 'Orange']]); scope.querySelector('select').value = doc.assistance?.team || 'both'; advanced.append(scope);
      const handed = el('details', 'builder-handedness'); handed.open = handednessOpen; handed.append(el('summary', '', 'Player handedness')); players.forEach(([id, name]) => { const value = doc.players?.[id]?.handedness || 'right'; const field = select(name, 'handedness', [['right', 'Right-handed'], ['left', 'Left-handed']]); const control = field.querySelector('select'); control.value = value; control.dataset.playerId = id; handed.append(field); });
      const assistance = el('details', 'builder-assistance'); assistance.open=assistanceOpen || detailGroup === 'coach'; assistance.append(el('summary', '', 'Shading & Guides')); [['autoShading', 'Auto Shading', 'Shading changes eligible movement'], ['showGuides', 'Coverage Guides', 'Explain suggested positions only']].forEach(([field, label, description]) => { const row = el('label', 'builder-switch'); const input = el('input'); input.type = 'checkbox'; input.checked = Boolean(doc.assistance?.[field]); input.dataset.assistance = field; input.setAttribute('aria-label', label); row.append(input, el('span', '', label), el('small', '', description)); assistance.append(row); });
      const coachGroup = el('section', 'builder-control-group builder-group-coach'); coachGroup.dataset.detailGroup = 'coach'; coachGroup.setAttribute('role', 'tabpanel'); coachGroup.setAttribute('aria-label', 'Coach tools settings'); coachGroup.classList.toggle('is-active', detailGroup === 'coach'); coachGroup.append(el('h3', '', 'Coach tools'), advanced, handed, assistance); details.appendChild(coachGroup);
      for (const panel of details.querySelectorAll('[role="tabpanel"]')) {
        panel.id = `builder-detail-panel-${panel.dataset.detailGroup}`;
        panel.setAttribute('aria-labelledby', `builder-detail-tab-${panel.dataset.detailGroup}`);
        panel.removeAttribute('aria-label');
      }
      if (current.findings?.length) {
        const find = el('section', 'builder-findings');
        const firstFinding = typeof current.findings[0] === 'string' ? {} : current.findings[0];
        const affectedIndex = shots.findIndex(shot => shot.id === (firstFinding.shotId || firstFinding.stepId));
        const heading = el('div', 'builder-findings-heading');
        heading.append(el('span', 'builder-findings-kicker', 'Coach review'), el('strong', '', `${current.findings.length} ${current.findings.length === 1 ? 'item' : 'items'} need attention`));
        find.append(heading);
        find.append(el('p', 'builder-findings-copy', affectedIndex >= 0 ? `Shot ${affectedIndex + 1} needs attention. Your authored intent is preserved while you review the cause.` : 'Review these findings before sharing the play.'));
        current.findings.forEach(f => {
          const item = typeof f === 'string' ? { message: f } : f;
          const row = el('div', 'builder-finding-row');
          row.dataset.kind = item.kind || 'review';
          const label = { rule: 'Rule issue', feasibility: 'Movement or flight limit', tactical: 'Coaching note', unsupported: 'Preview limit' }[item.kind] || 'Review';
          row.append(el('span', 'builder-finding-kind', label), el('p', '', findingText(item, shots, labels)));
          const affectedId = item.shotId || item.stepId;
          if (affectedId) { const index = shots.findIndex(shot => shot.id === affectedId); const go = button(`Review ${index >= 0 ? `Shot ${index + 1}` : 'shot'}`, 'finding-shot', 'builder-button builder-button-quiet'); go.dataset.shotId = affectedId; go.setAttribute('aria-label', `Edit affected ${index >= 0 ? `Shot ${index + 1}` : 'shot'}`); row.appendChild(go); }
          const pinSource = findingPinSource(item, shots);
          if (pinSource) {
            const editPin = button(`Edit ${labels[pinSource.player] || pinSource.player} pin · Shot ${pinSource.number}`, 'finding-pin', 'builder-button builder-button-quiet');
            editPin.dataset.shotId = pinSource.shotId; editPin.dataset.player = pinSource.player;
            row.appendChild(editPin);
          }
          find.appendChild(row);
        });
        const coachActions = el('div', 'builder-coach-actions');
        coachActions.append(button('Fix for me', 'coach-fix', 'builder-button builder-button-primary'), button('Show options', 'coach-options', 'builder-button builder-button-accent'), button('Keep as authored', 'coach-keep', 'builder-button builder-button-quiet'));
        find.appendChild(coachActions);
        if (Array.isArray(current.coachOptions) && current.coachOptions.length) {
          const options = el('div', 'builder-coach-options'); options.append(el('strong', '', 'Evaluated repair options'));
          current.coachOptions.forEach((item, optionIndex) => { const optionButton = button(item.label || `Option ${optionIndex + 1}`, 'coach-apply', 'builder-button'); optionButton.dataset.optionId = item.id || String(optionIndex); options.append(optionButton); if (item.description) options.append(el('p', 'builder-coach-option-copy', item.description)); });
          find.appendChild(options);
        }
        inspector.appendChild(find);
      }
    } else {
      const header=el('div','builder-inspector-header');header.append(el('span','','Play settings'),button(inspectorAutoCollapsed?'Customize play':'Close','collapse-inspector','builder-button builder-collapse'));inspector.append(header,el('p','builder-empty','Add a shot to start authoring.'));
      const global = el('div', 'builder-global-settings'); global.append(el('h2', '', 'Play settings')); [['autoShading', 'Auto Shading'], ['showGuides', 'Show Coverage Guides']].forEach(([field, label]) => { const row = el('label', 'builder-switch'); const input = el('input'); input.type = 'checkbox'; input.checked = Boolean(doc.assistance?.[field]); input.dataset.assistance = field; row.append(input, el('span', '', label)); global.append(row); }); global.append(select('Starting condition', 'opening', [['serve', 'Opening serve'], ['midrally', 'Mid-rally']])); global.append(select('Ending intent', 'ending', [['stop', 'Stop at authored end'], ['winner', 'Declared winner'], ['fault', 'Declared fault']])); inspector.append(global);
    }
    layout.appendChild(inspector); root.appendChild(layout);

    const transport = el('footer', 'builder-transport'); transport.setAttribute('aria-label', 'Rally playback');
    const transportTop = el('div', 'builder-transport-top');
    const undo = button('↶', 'undo', 'builder-button builder-icon-button'); undo.setAttribute('aria-label', 'Undo authored edit'); undo.disabled = !current.canUndo;
    const redo = button('↷', 'redo', 'builder-button builder-icon-button'); redo.setAttribute('aria-label', 'Redo authored edit'); redo.disabled = !current.canRedo;
    const play = button('', 'play-pause', 'builder-button builder-button-primary builder-play-button'); play.replaceChildren(el('span', 'pixel-play-icon', current.playing ? 'Ⅱ' : '▶'), el('span', 'pixel-play-label', current.playing ? 'Pause' : 'Play')); play.setAttribute('aria-pressed', String(Boolean(current.playing))); play.setAttribute('aria-label', current.playing ? 'Pause' : 'Play');
    context.prepend(play);
    transportTop.append(addButton, cueNode);
    const history = el('div', 'builder-history-controls'); history.setAttribute('aria-label', 'Edit history'); history.append(undo, redo); transportTop.append(history);
    const timelineHost = el('div', 'builder-transport-timeline'); timelineHost.append(timelineControl.element); transportTop.append(timelineHost);
    const optionsMenu = el('details', 'builder-menu builder-context-menu'); optionsMenu.append(el('summary', '', 'Playback options'));
    const rate = select('Playback speed', 'rate', [['0.25', '0.25×'], ['0.5', '0.5×'], ['1', '1×']]); rate.querySelector('select').value = String(current.rate || 1);
    const cameraChoices = select('Camera', 'camera', [['overhead', 'Overhead'], ['sideline', 'Sideline'], ['behind-green', 'Behind Green'], ['behind-orange', 'Behind Orange']]); cameraChoices.querySelector('select').value = current.camera || 'overhead';
    const optionsSummary=optionsMenu.querySelector('summary');optionsSummary.replaceChildren(el('span','','⋮'),el('span','sr-only','Playback options'));optionsSummary.setAttribute('aria-label','Playback options');optionsMenu.open=optionsMenuOpen;
    const optionsPanel=el('div','builder-menu-panel');optionsPanel.append(rate);optionsMenu.append(optionsPanel);
    transportTop.append(optionsMenu); transport.append(transportTop);
    const dock=el('section','builder-reference-dock');dock.setAttribute('aria-label','Park controls');
    dock.append(meta,transport);
    const cameraBar=el('div','builder-camera-bar');cameraBar.setAttribute('aria-label','Camera controls');
    const cameraModes=el('div','builder-camera-modes');cameraModes.setAttribute('role','group');cameraModes.setAttribute('aria-label','Drag mode');
    const mode=globalThis.pickleboard?.threeD?.cameraControls?.getState?.().mode||'orbit';
    for(const [value,label]of [['orbit','Rotate'],['pan','Pan']]){const control=button(label,`camera-mode-${value}`,'builder-button builder-camera-button');control.setAttribute('aria-pressed',String(mode===value));control.title=value==='orbit'?'Drag empty court to rotate and tilt':'Drag empty court to move the view';cameraModes.append(control);}
    const reset=button('↺','camera-reset','builder-button builder-camera-button');reset.setAttribute('aria-label','Reset view');reset.title='Reset view';
    const zoomOut=button('−','camera-zoom-out','builder-button builder-camera-button builder-camera-zoom');zoomOut.setAttribute('aria-label','Zoom out');
    const zoomIn=button('+','camera-zoom-in','builder-button builder-camera-button builder-camera-zoom');zoomIn.setAttribute('aria-label','Zoom in');
    const cameraHelp=el('details','builder-camera-help');cameraHelp.append(el('summary','','Camera help'),el('p','','Drag empty space to rotate and tilt. Choose Pan to move the view. On touch screens, use two fingers to pan or pinch to zoom. Drag players and targets directly to edit.'));
    cameraBar.append(createPlayerCoverageControl(),cameraModes,reset,zoomOut,zoomIn,cameraHelp);dock.append(cameraBar);root.append(dock);
    syncCameraControls();
    for(const dialog of [templateDialog,importDialog,randomDialog])if(dialog.parentElement!==root)root.appendChild(dialog);
    if (randomDialog.open) {
      const progress = randomDialog.querySelector('.builder-proposal-status');
      const info = current.proposalProgress;
      if (progress) progress.textContent = current.proposalBusy ? (typeof info === 'object' && info ? `${info.label || 'Building rally'}${Number.isFinite(info.completed) && Number.isFinite(info.total) ? ` · ${info.completed}/${info.total}` : '…'}` : 'Building rally…') : (typeof info === 'string' ? info : '');
      const create = randomDialog.querySelector('[data-action="random-rally"]'); if (create) create.disabled = Boolean(current.proposalBusy);
    }
    const nextInspector=root.querySelector('.builder-inspector'); if(nextInspector) nextInspector.scrollTop=oldInspectorScroll;
    root.scrollTop=oldRootScroll;
    if(optionsMenuOpen&&document.body.classList.contains('builder-large-text'))optionsPanel.scrollIntoView({block:'nearest'});
    if(placementJustFinished){
      root.querySelector('.builder-inspector [data-action="collapse-inspector"]')?.focus({preventScroll:true});
    } else if(focusIdentity && document.activeElement===document.body){
      const next=[...root.querySelectorAll('[data-action],[aria-label]')].find(n=>focusIdentity.shotId?n.dataset.shotId===focusIdentity.shotId:focusIdentity.action?n.dataset.action===focusIdentity.action:n.getAttribute('aria-label')===focusIdentity.label);
      if(next?.getClientRects().length)next.focus({preventScroll:true});
    }
  }
  function syncCameraControls(){
    const controls=globalThis.pickleboard?.threeD?.cameraControls;
    const ready=Boolean(controls&&globalThis.pickleboard?.threeD?.active);
    root.querySelectorAll('.builder-camera-button').forEach(control=>{control.disabled=!ready;});
    if(controls)root.querySelectorAll('[data-action^="camera-mode-"]').forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.action===`camera-mode-${controls.getState().mode}`)));
  }
  const onCameraReady=()=>syncCameraControls();
  globalThis.addEventListener('pickleboard:camera-ready',onCameraReady);
  function rerenderAction(type, payload) { return fire(type, payload); }
  function cancelActivePlacement() {
    if (current.targetPlacement) fire('cancelTarget');
    if (current.movementPlacement) fire('cancelMovement');
  }
  function handleSurfaceClick(event) {
    const summary = event.target.closest('summary');
    if (!summary || !root.contains(summary)) return;
    const details = summary.closest('details');
    if (details && !details.open && details.matches('.builder-main-menu,.builder-context-menu,.builder-chapter-menu,.builder-shot-details,.builder-advanced,.builder-handedness,.builder-assistance')) cancelActivePlacement();
  }
  async function handleClick(event) {
    const target = event.target.closest('[data-action]'); if (!target || !root.contains(target)) return;
    const action = target.dataset.action;
    // Opening the editor or using the transport dismisses a browsing menu.
    // This keeps its upward popover clear of the live editing controls.
    root.querySelectorAll('.builder-menu[open]').forEach(openMenu => { if (!openMenu.contains(target)) openMenu.open = false; });
    const menu = target.closest('.builder-menu'); if (menu && action !== 'rename' && !['SELECT','INPUT','TEXTAREA'].includes(target.tagName)) {menu.open = false;menu.querySelector('summary').focus();}
    const picker=target.closest('.builder-chapter-menu');
    if(picker&&['chapter','edit-chapter'].includes(action)){picker.open=false;picker.querySelector('summary')?.focus();}
    const input=document.activeElement;if(input&&root.contains(input)&&input.matches('input:not([type=range]),textarea'))input.blur();
    if(action.startsWith('camera-')){
      const controls=globalThis.pickleboard?.threeD?.cameraControls;if(!controls)return;
      if(action.startsWith('camera-mode-'))controls.setMode(action.slice('camera-mode-'.length));
      else if(action==='camera-reset')controls.reset();
      else if(action==='camera-zoom-in')controls.zoomBy(.85);
      else if(action==='camera-zoom-out')controls.zoomBy(1/.85);
      syncCameraControls();return;
    }
    if (action === 'select-shot') { inspectorManualCollapsed = false; userInspectorExpanded = true; current.movementPlayer = null; rerenderAction('selectShot', target.dataset.shotId); }
    else if (action === 'chapter') {
      const shotId = target.dataset.shotId;
      await rerenderAction('chapter', shotId);
      // Choosing a named shot is explicit authoring intent, including while
      // the editor is open. Automatic playback/seek updates keep its selection.
      await rerenderAction('selectShot', { id: shotId, preserveTime: true });
    }
    else if (action === 'edit-chapter') { inspectorManualCollapsed = false; userInspectorExpanded = true; current.movementPlayer = null; await fire('pauseForEditing');await rerenderAction('selectShot', target.dataset.shotId);root.querySelector('.builder-inspector [data-action="collapse-inspector"]')?.focus({ preventScroll: true }); }
    else if (action === 'view') rerenderAction('view', target.dataset.view);
    else if (action === 'detail-group') {
      detailGroup = target.dataset.group || 'target';
      shotDetailsOpen = true;
      renderedDocument = null;
      render({});
      root.querySelector(`[data-action="detail-group"][data-group="${detailGroup}"]`)?.focus({ preventScroll: true });
    }
    else if (action === 'workspace-planner') rerenderAction('workspace', 'planner');
    else if (action === 'workspace-builder') rerenderAction('workspace', 'builder');
    else if (action === 'add-shot') { fire('pauseForEditing'); inspectorManualCollapsed=true; userInspectorExpanded=null; rerenderAction('addShot'); }
    else if (action === 'choose-family') { familyPickerOpen = false; preserveFamilyPickerState = true; rerenderAction('editShot', { field: 'family', value: target.dataset.family }); }
    else if (action === 'new') rerenderAction('new');
    else if (action === 'templates') openTemplateDialog('learn');
    else if (action === 'template-open') {
      const result = await rerenderAction(target.dataset.kind === 'open' ? 'open' : 'template', target.dataset.id);
      if (!result || result.ok !== false) closeDialog(templateDialog);
      else {
        const status = templateDialog.querySelector('.builder-library-status');
        status.textContent = result.error || 'This play could not be opened. Your current draft was kept.'; status.setAttribute('role', 'alert');
      }
    }
    else if (action === 'delete-play') {
      const item = target.savedPlaySnapshot;
      if (!item) return;
      if (!await confirmDeletePlay(item)) { target.focus(); return; }
      const result = await rerenderAction('deletePlay', typeof item.revision === 'string' ? { id: item.id, revision: item.revision } : item.id);
      if (result?.ok === false) {
        const status = templateDialog.querySelector('.builder-library-status'); status.textContent = result.error || 'This saved play could not be deleted.'; status.setAttribute('role', 'alert'); target.focus();
      } else {
        openTemplateDialog('library', `${result?.deleted === false ? 'Already removed' : 'Deleted'} ${item.name || item.title || item.id}. Your current draft is still open.`);
        templateDialog.querySelector('[data-action="template-open"], [data-action="dialog-close"]')?.focus();
      }
    }
    else if (action === 'dialog-close') { closeDialog(templateDialog); closeDialog(importDialog); }
    else if (action === 'review-findings') { fire('pauseForEditing'); if (target.dataset.shotId) rerenderAction('selectShot', target.dataset.shotId); inspectorManualCollapsed=false;render({});root.querySelector('.builder-findings')?.scrollIntoView({block:'nearest'}); }
    else if (action === 'finding-shot') { fire('pauseForEditing'); inspectorManualCollapsed=false; userInspectorExpanded=true; current.movementPlayer=null; rerenderAction('selectShot', target.dataset.shotId); }
    else if (action === 'coach-fix') rerenderAction('coachFix');
    else if (action === 'coach-options') rerenderAction('coachOptions');
    else if (action === 'coach-keep') rerenderAction('coachKeep');
    else if (action === 'coach-apply') rerenderAction('coachApply', { id: target.dataset.optionId });
    else if (action === 'finding-pin') {
      await fire('pauseForEditing');
      inspectorManualCollapsed = false; userInspectorExpanded = true;
      detailGroup = 'movement'; shotDetailsOpen = true; current.movementPlayer = target.dataset.player;
      await rerenderAction('selectShot', target.dataset.shotId);
      const details = root.querySelector('.builder-shot-details'); if (details) details.open = true;
      renderedDocument = null; render({});
      root.querySelector('.builder-group-movement')?.scrollIntoView({ block: 'nearest' });
      root.querySelector('[data-action="edit-movement.pinned"]')?.focus({ preventScroll: true });
    }
    else if (action === 'cancel-target') rerenderAction('cancelTarget');
    else if (action === 'cancel-movement') rerenderAction('cancelMovement');
    else if (action === 'place-target') { fire('pauseForEditing'); inspectorManualCollapsed = true; userInspectorExpanded = null; rerenderAction('placeTarget', { shotId: current.selectedShotId });root.querySelector('[data-action=cancel-target]')?.focus({preventScroll:true}); }
    else if (action === 'place-movement') { fire('pauseForEditing'); inspectorManualCollapsed = true; userInspectorExpanded = null; rerenderAction('placeMovement', { shotId: current.selectedShotId, player: current.movementPlayer || current.document?.shots?.find(shot => shot.id === current.selectedShotId)?.hitter }); }
    else if (action === 'target-preset') rerenderAction('editShot', { field: 'target', value: { x: Number(target.dataset.x), y: Number(target.dataset.y) } });
    else if (action === 'insert-shot') rerenderAction('insertShot', { position: target.dataset.position, shotId: target.dataset.shotId || current.selectedShotId });
    else if (action === 'duplicate-shot') rerenderAction('duplicateShot', target.dataset.shotId || current.selectedShotId);
    else if (action === 'delete-shot') rerenderAction('deleteShot', target.dataset.shotId || current.selectedShotId);
    else if (action === 'move-earlier') rerenderAction('moveShot', { id: current.selectedShotId, delta: -1 });
    else if (action === 'move-later') rerenderAction('moveShot', { id: current.selectedShotId, delta: 1 });
    else if (action === 'collapse-inspector') {
      const opening=root.querySelector('.builder-inspector')?.classList.contains('builder-inspector-collapsed');
      inspectorManualCollapsed=!opening;userInspectorExpanded=opening;
      if(opening){await fire('pauseForEditing');const liveShotId=current.currentShotId||current.selectedShotId;if(liveShotId&&liveShotId!==current.selectedShotId)await fire('selectShot',{id:liveShotId,preserveTime:true});}
      render({});
      root.querySelector(opening?'.builder-inspector [data-action="collapse-inspector"]':'.builder-context-actions [data-action="collapse-inspector"]')?.focus({preventScroll:true});
    }
    else if (action === 'play-pause') { inspectorManualCollapsed = true; userInspectorExpanded = null; await rerenderAction('playPause',{playing:target.getAttribute('aria-pressed')!=='true'});await syncViewingShot(); }
    else if (action === 'restart' || action === 'previous' || action === 'next' || action === 'undo' || action === 'redo' || action === 'save-as' || action === 'use-planner') rerenderAction(({ 'save-as': 'saveAs', 'use-planner': 'usePlanner' }[action] || action));
    else if (action === 'rename') { const field = root.querySelector('[data-action="title"]'); field?.focus(); field?.select(); }
    else if (action === 'open') openTemplateDialog('library');
    else if (action === 'import-export') openImportDialog();
    else if (action === 'random') openRandomDialog();
    else if (action === 'random-rally') {
      const countField = randomDialog.querySelector('[data-action="random-count"]');
      const seedField = randomDialog.querySelector('[data-action="random-seed"]');
      const count = Number(countField.value);
      const seed = seedField.value.trim() === '' ? undefined : Number(seedField.value);
      if (!countField.checkValidity() || !Number.isInteger(count) || count < 1 || count > UI_MAX_SHOTS) {
        markInvalidField(countField, `Enter a whole number of hits from 1 to ${UI_MAX_SHOTS}.`); countField.focus(); return;
      }
      clearInvalidField(countField);
      if (!seedField.checkValidity() || (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > 4294967295))) {
        markInvalidField(seedField, 'Enter a whole number from 0 to 4294967295, or leave the seed blank.'); seedField.focus(); return;
      }
      clearInvalidField(seedField);
      const result = await rerenderAction('randomRally', { count, ...(seed !== undefined ? { seed } : {}) });
      if (!result || result.ok !== false) closeDialog(randomDialog);
      else {
        const status = randomDialog.querySelector('.builder-proposal-status');
        if (status) { status.textContent = result.error || 'Rally generation could not complete. Your current play was kept.'; status.setAttribute('role', 'alert'); status.setAttribute('aria-live', 'assertive'); }
      }
    }
    else if (action === 'cancel-proposal') { closeDialog(randomDialog); rerenderAction('cancelProposal'); }
    else if (action === 'import-json') { const area = importDialog.querySelector('textarea'); const result = await rerenderAction('import', area?.value || ''); if (!result || result.ok !== false) { importFileGeneration += 1; closeDialog(importDialog); } else { const status = importDialog.querySelector('.builder-import-status') || el('p', 'builder-import-status'); status.textContent = result.error || 'Import could not be completed. Check the JSON and try again.'; importDialog.insertBefore(status, importDialog.querySelector('.builder-dialog-actions')); } }
    else if (action === 'export') rerenderAction('export');
    else if (action === 'buildDiagnostics') rerenderAction('buildDiagnostics');
    else if (action === 'appearance') rerenderAction('appearance');
    else if (action === 'help') {timelineControl?.cancel();await rerenderAction('help');await syncViewingShot();}
    else if (action === 'acknowledge-waypoints') rerenderAction('acknowledgeWaypoints');
    else if (action === 'retry-save') rerenderAction('retrySave');
  }
  function handleChange(event) {
    const target = event.target; if (!target.dataset.action && !target.dataset.assistance) return;
    if (target.dataset.assistance) fire('assistance', { field: target.dataset.assistance, value: target.checked });
    else if (target.dataset.action === 'title') { if (!target.value.trim()) { markInvalidField(target, 'Enter a play title.'); fire('message', 'Enter a play title before saving.'); return; } clearInvalidField(target); fire('title', target.value); }
    else if (target.dataset.action === 'flight-preset') {const [arc,pace]=target.value.split('/');fire('flight',{arc,pace});}
    else if (target.dataset.action === 'movement-player') { current.movementPlayer = target.value; renderedDocument = null; render({}); }
    else if (target.dataset.action === 'service-court') fire('editServiceCourt', target.value);
    else if (target.dataset.action.startsWith('edit-')) {
      const field = target.dataset.action.slice(5); if (target.type === 'number' && (target.value === '' || (target.validity.badInput||target.validity.rangeUnderflow||target.validity.rangeOverflow))) { markInvalidField(target, 'Enter a value in range.'); return; } clearInvalidField(target); const value = target.type === 'checkbox' ? target.checked : (target.type === 'number' ? Number(target.value) : target.value);
      if (field.startsWith('movement.')) fire('editMovement', { player: current.movementPlayer || current.document?.shots?.find(shot => shot.id === current.selectedShotId)?.hitter, field: field.slice(9), value });
      else fire('editShot', { field, value });
    }
    else if (target.dataset.action === 'shade-team') fire('assistance',{field:'team',value:target.value});
    else if (target.dataset.action === 'rate') fire('rate', Number(target.value));
    else if (target.dataset.action === 'camera') fire('camera', target.value);
    else if (target.dataset.action === 'handedness') fire('handedness', { id: target.dataset.playerId, value: target.value });
    else if (target.dataset.action === 'import-file') {
      const file = target.files?.[0]; const generation = ++importFileGeneration; if (file) { if (file.size > MAX_IMPORT_BYTES) { fire('message', `Import is limited to ${Math.round(MAX_IMPORT_BYTES / 1024)} KiB.`); return; } file.text().then(raw => { if (!importDialog.open || generation !== importFileGeneration) return; const area=importDialog.querySelector('textarea'); if(area)area.value=raw; }).catch(() => { if (generation === importFileGeneration) fire('message','The selected file could not be read. Try another JSON backup.'); });  }
    }
    else if (target.dataset.action === 'opening' || target.dataset.action === 'ending') fire(target.dataset.action, target.value);
    else if (target.dataset.action === 'intentionalFault') fire('intentionalFault', target.checked);
    else if (target.dataset.action === 'seek') fire('seek', Number(target.value));
  }
  function handleInput(event) {
    if (event.target.dataset.action === 'seek') fire('seek', Number(event.target.value));
    else if(event.target.matches('input[type=number],input[type=text]') && !event.target.closest('.builder-dialog')){pendingField=true;const status=root.querySelector('.builder-save-status');if(status)status.textContent='Editing · not saved yet';const savePill=root.querySelector('[data-ui="save-pill"]');if(savePill){savePill.textContent='Editing';savePill.setAttribute('aria-label','Save state: Editing');}}
  }
  root.addEventListener('pointerdown',event=>{if(event.target.closest('button,summary')&&root.contains(document.activeElement)&&document.activeElement.matches('input:not([type=range]),textarea'))event.preventDefault();});
  root.addEventListener('keydown', event => { if (event.key !== 'Escape') return; const menu = event.target.closest('.builder-menu[open],.builder-chapter-menu[open]'); if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); event.preventDefault(); } });
  root.addEventListener('keydown', event => {
    const tab = event.target.closest('[role="tab"][data-action="detail-group"]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); event.stopPropagation(); tabs[next].click();
  });
  root.addEventListener('keydown', event => {
    const optionNode = event.target.closest('.builder-family-option[role="option"]');
    if (!optionNode) return;
    const options = [...root.querySelectorAll('.builder-family-option[role="option"]')];
    const index = options.indexOf(optionNode);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); optionNode.click(); return;
    }
    let next = -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % options.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      familyTypeahead += event.key.toLowerCase();
      clearTimeout(familyTypeaheadTimer);
      familyTypeaheadTimer = setTimeout(() => { familyTypeahead = ''; }, 700);
      next = options.findIndex(item => item.textContent.trim().toLowerCase().startsWith(familyTypeahead));
    }
    if (next < 0) return;
    event.preventDefault(); options[next].focus();
  });
  root.addEventListener('toggle', event => {
    const opened = event.target;
    const transientSelector = '.builder-main-menu,.builder-context-menu,.builder-chapter-menu,.builder-shot-actions-menu';
    if (!(opened instanceof HTMLDetailsElement) || !opened.open || !opened.matches(transientSelector)) return;
    if(opened.matches('.builder-context-menu')&&document.body.classList.contains('builder-large-text'))opened.querySelector('.builder-menu-panel')?.scrollIntoView({block:'nearest'});
    // Keep one unrelated transient surface visible. Nested pickers and action
    // menus belong to their parent and are therefore exempt from dismissal.
    const transient = root.querySelectorAll(transientSelector);
    transient.forEach(other => {
      if (other === opened || other.contains(opened) || opened.contains(other)) return;
      other.open = false;
    });
  }, true);
  root.addEventListener('click', handleSurfaceClick); root.addEventListener('click', handleClick); root.addEventListener('change', handleChange); root.addEventListener('input', handleInput);
  root.addEventListener('keydown', event => {
    if (!event.target.matches('input[type="number"], input[type="text"]')) return;
    if (event.key === 'Escape') { pendingField=false; renderedDocument = null; render({}); event.preventDefault(); return; }
    if (event.key !== 'Enter') return;
    if (event.target.type === 'number' && (event.target.value === '' || (event.target.validity.badInput||event.target.validity.rangeUnderflow||event.target.validity.rangeOverflow))) { markInvalidField(event.target, 'Enter a value in range.'); event.preventDefault(); return; }
    event.target.blur();
  });
  function showExport(raw) {
    exportedBackup = String(raw || '');
    if (!importDialog.open) openImportDialog();
    const area = importDialog.querySelector('textarea');
    if (area) { area.value = exportedBackup; area.focus({ preventScroll: true }); area.select(); }
  }
  function markInvalidField(target, message) {
    target.setAttribute('aria-invalid', 'true');
    const field = target.closest('.builder-field') || target.parentElement;
    if (field && !field.querySelector('.builder-field-error')) {const error=el('span','builder-field-error',message);error.id=`builder-error-${target.dataset.action.replace(/[^a-z0-9]/gi,'-')}`;error.setAttribute('role','alert');field.appendChild(error);target.setAttribute('aria-describedby',[target.getAttribute('aria-describedby'),error.id].filter(Boolean).join(' '));}
  }
  function clearInvalidField(target) {
    pendingField=false;
    target.removeAttribute('aria-invalid');
    const error = target.closest('.builder-field')?.querySelector('.builder-field-error');
    const descriptions = (target.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== error?.id);
    if (descriptions.length) target.setAttribute('aria-describedby', descriptions.join(' ')); else target.removeAttribute('aria-describedby');
    error?.remove();
  }
  let plannerConfirmation = null;
  function confirmDeletePlay(item) {
    const dialog = el('dialog', 'builder-dialog builder-confirm-dialog');
    dialog.setAttribute('aria-label', 'Delete saved play');
    dialog.append(el('h2', '', 'Delete saved play?'), el('p', 'builder-dialog-copy', `Delete “${item.name || item.title || item.id}” from this device? This removes the saved copy. The play currently open in the builder will stay open.`));
    const actions = el('div', 'builder-dialog-actions');
    const cancel = button('Cancel', 'delete-cancel', 'builder-button');
    const accept = button('Delete saved play', 'delete-confirm', 'builder-button builder-button-danger');
    actions.append(cancel, accept); dialog.append(actions); root.appendChild(dialog);
    return new Promise(resolve => {
      const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
      cancel.addEventListener('click', () => finish(false));
      accept.addEventListener('click', () => finish(true));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); }, { once: true });
      dialog.showModal(); cancel.focus();
    });
  }
  const confirmPlanner = () => {
    if (plannerConfirmation) return plannerConfirmation;
    const dialog = el('dialog', 'builder-dialog builder-confirm-dialog');
    dialog.setAttribute('aria-label', 'Use planner layout');
    dialog.append(el('h2', '', 'Use planner layout?'), el('p', 'builder-dialog-copy', 'Replace this play’s starting layout with the current planner arrangement? Your shots will be preserved and revalidated.'));
    const actions = el('div', 'builder-dialog-actions');
    const cancel = button('Cancel', 'planner-cancel', 'builder-button');
    const accept = button('Use layout', 'planner-confirm', 'builder-button builder-button-primary');
    actions.append(cancel, accept); dialog.append(actions); root.appendChild(dialog);
    plannerConfirmation = new Promise(resolve => {
      const finish = value => { plannerConfirmation = null; dialog.close(); dialog.remove(); resolve(value); };
      cancel.addEventListener('click', () => finish(false));
      accept.addEventListener('click', () => finish(true));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); }, { once: true });
      dialog.addEventListener('close', () => { if (plannerConfirmation) finish(false); }, { once: true });
      dialog.showModal(); accept.focus();
    });
    return plannerConfirmation;
  };
  render();
  return { render, showExport, confirmPlanner, destroy() { globalThis.removeEventListener('pickleboard:camera-ready',onCameraReady); destroyed = true; importFileGeneration += 1; timelineControl?.cancel?.(); timelineControl?.destroy?.(); root.remove(); document.body.classList.remove('builder-workspace', 'planner-workspace'); }, element: root };
}

export { FAMILIES };
