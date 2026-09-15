/**
 * Court first play builder UI.
 *
 * This module owns only the builder controls. The court renderer and the play
 * compiler remain authoritative elsewhere; every interaction is reported as a
 * small action so the integration layer can keep one document and one clock.
 */

import { mountShotTimeline } from './shot-timeline.js';

const FAMILIES = [
  ['serve', 'Serve'], ['return', 'Return'], ['drive', 'Drive'], ['drop', 'Drop'],
  ['dink', 'Dink'], ['volley', 'Volley / block'], ['reset', 'Reset'],
  ['lob', 'Lob'], ['overhead', 'Overhead']
];
const FAMILY_GLYPHS = { serve: '◆', return: '↶', drive: '➤', drop: '◇', dink: '•', volley: '✦', reset: '↺', lob: '⌁', overhead: '△' };
const PLAYERS = [['player1', 'Green 1'], ['player2', 'Green 2'], ['player3', 'Orange 1'], ['player4', 'Orange 2']];
const FLIGHTS=[['high/medium','High / steady'],['high/soft','High / soft'],['low/firm','Low / firm'],['medium/medium','Medium / steady']];
const MAX_IMPORT_BYTES = 512 * 1024;

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

function findingText(item, shots) {
  const index=shots.findIndex(s=>s.id===(item.shotId || item.stepId));
  const kind={rule:'Rules issue',feasibility:'Movement or flight limit',tactical:'Coaching suggestion',unsupported:'Preview limitation'}[item.kind] || 'Review';
  let message=item.message || 'Review this shot';
  for(const [id,label] of PLAYERS)message=message.replaceAll(id,label);
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
  let current = { document: null, selectedShotId: null, selectedChapterId: null, currentShotId: null, chapters: [], findings: [], playing: false, time: 0, duration: 8.5, view: '3d', workspace: 'builder', saveStatus: 'Saved locally', library: [], templates: [], loop: false, rate: 1, busy: false, message: '', canUndo: false, canRedo: false, camera: 'overhead' };
  let destroyed = false;
  let renderedDocument = null;
  let renderedSelectedShotId = null;
  let renderedView = null;
  let renderedWorkspace = null;
  let renderedWaypointKey = '';
  let renderedSaveErrorKey = '';
  let userInspectorExpanded = null;
  let inspectorManualCollapsed = null;
  let advancedOpen = false;
  let shotDetailsOpen = false;
  let detailGroup = 'target';
  let handednessOpen = false;
  let assistanceOpen = false;
  let importFileGeneration = 0;
  let pendingField = false;
  let exportedBackup = '';
  let timelineControl = null;
  const templateDialog = el('dialog', 'builder-dialog');
  const importDialog = el('dialog', 'builder-dialog');
  templateDialog.setAttribute('aria-label', 'Play library and templates');
  importDialog.setAttribute('aria-label', 'Import or export play');
  function closeDialog(dialog) { if (dialog.open) dialog.close(); }
  function openTemplateDialog(mode = 'learn') {
    timelineControl?.cancel?.();
    const libraryMode = mode === 'library';
    templateDialog.setAttribute('aria-label', libraryMode ? 'My Plays' : 'Learn and templates');
    templateDialog.replaceChildren(el('h2', '', libraryMode ? 'My Plays' : 'Learn / Templates'), el('p', 'builder-dialog-copy', libraryMode ? 'Open a saved play from this device.' : 'Choose a lesson or template to open as a copy.'));
    const list = el('div', 'builder-dialog-list'); const entries = (libraryMode ? current.library || [] : current.templates || []).map(item => ({ ...item, __kind: libraryMode ? 'open' : 'template' }));
    entries.forEach(item => { const id = item.id; const label = item.name || item.title || id; const b = button(label, 'template-open', 'builder-button'); b.dataset.id = id; b.dataset.kind = item.__kind; list.appendChild(b); });
    if (!entries.length) list.appendChild(el('p', 'builder-dialog-copy', 'No saved plays or templates yet.'));
    templateDialog.appendChild(list); templateDialog.appendChild(button('Close', 'dialog-close', 'builder-button'));
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
    root.classList.toggle('builder-placing',Boolean(current.targetPlacement||current.movementPlacement));
    const doc = current.document || { title: 'Build a Play', shots: [], players: {}, assistance: {} };
    const shots = Array.isArray(doc.shots) ? doc.shots : [];
    const selected = shots.find(shot => shot.id === current.selectedShotId) || shots[0];
    if (selected) current.selectedShotId = selected.id;
    const waypointKey = JSON.stringify(current.waypointPolicy || null);
    const saveErrorKey = JSON.stringify(current.saveError || null);
    const structureChanged = renderedDocument !== doc || renderedSelectedShotId !== current.selectedShotId || renderedView !== current.view || renderedWorkspace !== current.workspace || renderedWaypointKey !== waypointKey || renderedSaveErrorKey !== saveErrorKey;
    if (!structureChanged && root.childElementCount) {
      timelineControl?.update({ chapters: current.chapters || [], time: current.time || 0, duration: current.duration || 0, playing: Boolean(current.playing), busy: Boolean(current.busy), currentShotId: current.currentShotId || current.selectedChapterId || null });
      const liveChapterId = current.currentShotId || current.selectedChapterId || null;
      root.querySelectorAll('[data-action="chapter"]').forEach(chapter => chapter.setAttribute('aria-current', String(Boolean(liveChapterId && chapter.dataset.shotId === liveChapterId))));
      const save = root.querySelector('.builder-save-status'); if (save) save.textContent = pendingField?'Editing · not saved yet':current.saveStatus || 'Draft';
      const savePill = root.querySelector('[data-ui="save-pill"]'); if (savePill) { const saveText = pendingField ? 'Editing' : (current.saveStatus || 'Saved'); savePill.textContent = saveText; savePill.setAttribute('aria-label', `Save state: ${saveText}`); }
      const message = root.querySelector('.builder-message'); if (message) message.textContent = current.message || '';
      const cueNode = root.querySelector('.builder-cue'); const fastCue = current.cue; if (cueNode && fastCue) { const summary = cueNode.querySelector('.builder-chapter-menu > summary'),summaryText=fastCue.title||'Current shot'; if (summary&&summary.textContent!==summaryText) summary.textContent=summaryText; }
      const liveShot = shots.find(shot => shot.id === (current.currentShotId || current.selectedShotId));
      const card = root.querySelector('[data-shot-card]');
      if (card && liveShot) {
        const cardIndex = shots.findIndex(shot => shot.id === liveShot.id);
        const target = targetSummary(liveShot);
        const number = card.querySelector('[data-shot-card-number]'); if (number) number.textContent = `SHOT ${Math.max(1, cardIndex + 1)}`;
        const family = card.querySelector('[data-shot-card-family]'); if (family) family.textContent = FAMILIES.find(([id]) => id === liveShot.family)?.[1] || 'Shot';
        const description = card.querySelector('[data-shot-card-description]'); if (description) description.textContent = `${target.depth} ${target.direction.toLowerCase()}`;
        const flight = card.querySelector('[data-shot-card-flight]'); if (flight) flight.textContent = flightSummary(liveShot);
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
          const collapseText=placement==='target'?'Cancel target':placement==='movement'?'Cancel movement':'Edit shot';
          if(collapseButton.textContent!==collapseText||collapseButton.childElementCount)collapseButton.textContent=collapseText;
        } else if(!collapseButton.querySelector('.builder-collapse-label-collapse')||!collapseButton.querySelector('.builder-collapse-label-done'))
          collapseButton.replaceChildren(el('span','builder-collapse-label-collapse','Collapse'),el('span','builder-collapse-label-done','Done'));
        collapseButton.dataset.action=placement==='target'?'cancel-target':placement==='movement'?'cancel-movement':'collapse-inspector'; collapseButton.setAttribute('aria-label', placement === 'target' ? 'Cancel target' : placement === 'movement' ? 'Cancel movement' : collapsed ? 'Edit shot' : (innerWidth<=700?'Done':'Collapse')); collapseButton.setAttribute('aria-expanded', String(!collapsed));
      }
      return;
    }
    renderedDocument = doc; renderedSelectedShotId = current.selectedShotId; renderedView = current.view; renderedWorkspace = current.workspace; renderedWaypointKey = waypointKey; renderedSaveErrorKey = saveErrorKey;
    const previousAdvanced = root.querySelector('.builder-advanced'); if (previousAdvanced) advancedOpen = previousAdvanced.open;
    const oldDetails=root.querySelector('.builder-shot-details');if(oldDetails)shotDetailsOpen=oldDetails.open;
    const oldHanded=root.querySelector('.builder-handedness');if(oldHanded)handednessOpen=oldHanded.open;
    const oldAssistance=root.querySelector('.builder-assistance');if(oldAssistance)assistanceOpen=oldAssistance.open;
    const mainMenuOpen=Boolean(root.querySelector('.builder-main-menu')?.open);
    const documentMenuOpen=Boolean(root.querySelector('.builder-document-menu')?.open);
    const optionsMenuOpen=Boolean(root.querySelector('.builder-context-menu')?.open);
    const chaptersOpen=Boolean(root.querySelector('.builder-chapter-menu')?.open);
    const focused=document.activeElement;const focusIdentity=root.contains(focused)?{action:focused.dataset.action,shotId:focused.dataset.shotId,label:focused.getAttribute('aria-label')}:null;
    const oldInspectorScroll=root.querySelector('.builder-inspector')?.scrollTop || 0;
    // Keep modal dialogs connected through save/field/viewport updates.
    for(const child of [...root.children])if(child.tagName!=='DIALOG')child.remove();
    root.classList.toggle('builder-planner', current.workspace === 'planner');

    const mainMenu = el('details', 'builder-menu builder-main-menu'); mainMenu.open=mainMenuOpen;
    const menuSummary=el('summary');menuSummary.setAttribute('aria-label','Menu');
    const menuIcon=el('span','builder-menu-icon','☰');menuIcon.setAttribute('aria-hidden','true');
    menuSummary.append(menuIcon,el('span','builder-menu-word','Menu'));mainMenu.append(menuSummary);
    const menuPanel = el('div', 'builder-menu-panel');
    const menuHeading = el('div', 'builder-menu-heading'); menuHeading.append(el('span', 'builder-park-mark', '◆'), el('strong', '', 'Pickleball Park'));
    const menuKicker = el('div', 'builder-menu-kicker', 'PARK DESK · PLAY BUILDER');
    const rename = button('Rename play', 'rename', 'builder-menu-item builder-button');
    const titleInput = el('input'); titleInput.type = 'text'; titleInput.value = doc.title || 'Untitled play'; titleInput.maxLength = 80; titleInput.dataset.action = 'title'; titleInput.setAttribute('aria-label', 'Play title');
    const titleField = labelled('Play name', titleInput); titleField.classList.add('builder-menu-field');
    const documentMenu = el('details', 'builder-document-menu'); documentMenu.open = documentMenuOpen;
    const documentSummary = el('summary', 'builder-menu-submenu-summary', 'Play file'); documentSummary.setAttribute('aria-label', 'Play file'); documentMenu.append(documentSummary);
    const playGroup = el('div', 'builder-menu-group'); playGroup.append(el('h3', '', 'My play'), titleField, rename, button('New Play', 'new', 'builder-menu-item builder-button builder-button-primary'), button('My Plays', 'open', 'builder-menu-item builder-button'), button('Save As', 'save-as', 'builder-menu-item builder-button'));
    documentMenu.append(playGroup);
    const learnGroup = el('div', 'builder-menu-group'); learnGroup.append(el('h3', '', 'Practice'), button('Learn', 'templates', 'builder-menu-item builder-button'), button(current.workspace === 'planner' ? 'Return to builder' : 'Court Planner', current.workspace === 'planner' ? 'workspace-builder' : 'workspace-planner', 'builder-menu-item builder-button'));
    const toolsGroup = el('div', 'builder-menu-group'); toolsGroup.append(el('h3', '', 'Tools'), button('Import / Export', 'import-export', 'builder-menu-item builder-button'), button('Help', 'help', 'builder-menu-item builder-button'), button('Appearance', 'appearance', 'builder-menu-item builder-button'));
    menuPanel.append(menuHeading, menuKicker, documentMenu, learnGroup, toolsGroup);
    const meta = el('div', 'builder-meta');
    status.textContent = pendingField?'Editing · not saved yet':current.saveStatus || 'Draft'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.className = 'builder-save-status'; menuPanel.appendChild(status); mainMenu.appendChild(menuPanel);
    meta.appendChild(mainMenu);
    const compactStatus = el('span', 'builder-save-pill', pendingField ? 'Editing' : (current.saveStatus || 'Saved'));
    compactStatus.dataset.ui = 'save-pill'; compactStatus.setAttribute('aria-label', `Save state: ${compactStatus.textContent}`); compactStatus.setAttribute('role', 'status');
    meta.appendChild(compactStatus);
    const compactMessage = el('span', 'builder-message', current.message || '');
    meta.appendChild(compactMessage);
    if (current.saveError) {
      const error = el('div', 'builder-save-error');
      error.append(el('strong', '', current.saveError.conflict ? 'This draft changed elsewhere.' : 'Could not save this draft.'), el('span', '', current.saveError.message || 'Your edits are still here. Retry or save a copy.'));
      if (!current.saveError.conflict) error.append(button('Retry save', 'retry-save', 'builder-button builder-button-accent'));
      error.append(button(current.saveError.conflict ? 'Save a copy' : 'Save a copy', 'save-as', 'builder-button'));
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
      card.append(cardKicker, cardDescription, cardFlight);
    }
    const chapterMenu = el('details', 'builder-chapter-menu'); chapterMenu.open=chaptersOpen;
    const chapterSummary = el('summary', 'builder-chip', cue?.title || 'Choose a shot'); chapterSummary.setAttribute('aria-label', 'Choose shot chapter'); chapterMenu.append(chapterSummary);
    const chapterList = el('div', 'builder-chapter-list'); chapterList.setAttribute('aria-label', 'Shot chapters');
    const chapterEntries = shots.map((shot, index) => { const chapter = (current.chapters || []).find(item => item.shotId === shot.id); return { ...(chapter || {}), shotId: shot.id, number: chapter?.number || index + 1, label: chapter?.label || FAMILIES.find(([id]) => id === shot.family)?.[1] || 'Shot', authoredOnly: !chapter }; });
    chapterEntries.forEach((chapter, index) => { const id = chapter.shotId || chapter.id || shots[index]?.id || ''; const shot = shots.find(item => item.id === id); const glyph = FAMILY_GLYPHS[shot?.family] || '◆'; const row = el('div', 'builder-chapter-row'); const b = button(`${glyph} Shot ${chapter.number || index + 1} · ${chapter.label || 'Shot'}${chapter.authoredOnly ? ' · needs review' : ''}`, 'chapter', 'builder-menu-item builder-button'); b.dataset.shotId = id; b.disabled = Boolean(chapter.authoredOnly); b.title = chapter.authoredOnly ? 'This authored shot is not in the valid playback prefix yet. Edit it to review.' : 'Seek to shot chapter'; b.setAttribute('aria-current', String((current.currentShotId || current.selectedChapterId || current.selectedShotId) === id)); row.appendChild(b); if (id) { const edit = button('Edit', 'edit-chapter', 'builder-button builder-button-quiet'); edit.dataset.shotId = id; edit.setAttribute('aria-label', `Edit Shot ${chapter.number || index + 1}`); row.appendChild(edit); } chapterList.appendChild(row); });
    if (!chapterEntries.length) chapterList.appendChild(el('span', 'builder-empty', 'Add a shot to create chapters.'));
    chapterMenu.append(chapterList);
    if (shotCardNode) { shotCardNode.append(chapterMenu); cueNode.append(shotCardNode); }
    else cueNode.append(chapterMenu);
    meta.appendChild(cueNode);
    const context = el('div', 'builder-context-actions');
    const editButton = button('Edit', 'collapse-inspector', 'builder-button builder-button-quiet'); editButton.setAttribute('aria-label',selected?'Edit shot':'Edit play');editButton.setAttribute('aria-expanded', String(inspectorManualCollapsed === false));
    const addButton = button('Add', 'add-shot', 'builder-button builder-button-primary'); addButton.setAttribute('aria-label', 'Add shot'); addButton.disabled = shots.length >= 64; addButton.title = addButton.disabled ? 'This play has reached the 64-shot limit' : 'Append a shot';
    context.append(editButton, addButton);
    const viewToggle = el('div', 'builder-view-toggle'); viewToggle.setAttribute('role', 'group'); viewToggle.setAttribute('aria-label', 'Court view');
    const nextView = current.view === '3d' ? '2d' : '3d';
    const viewButton = button(nextView.toUpperCase(), 'view', 'builder-view-button'); viewButton.dataset.view = nextView; viewButton.setAttribute('aria-label', `Switch to ${nextView.toUpperCase()} court view`); viewButton.title = `Switch to ${nextView.toUpperCase()} court view`; viewToggle.appendChild(viewButton);
    context.append(viewToggle); meta.appendChild(context);
    if (current.waypointPolicy?.requiresConfirmation) {
      const affected = (current.waypointPolicy.affected || []).map(item => `${item.number ? `Shot ${item.number}` : item.shotId || 'Shot'}${item.player ? ` · ${PLAYERS.find(([id])=>id===item.player)?.[1] || item.player}` : ''}`).join(', ');
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
      const inspectorHeader = el('div', 'builder-inspector-header'); inspectorHeader.append(el('div', '', selected ? `Shot ${shots.indexOf(selected) + 1} details` : 'No shot selected')); const inPlacement = current.targetPlacement || current.movementPlacement; const collapse = button(current.targetPlacement ? 'Cancel target' : current.movementPlacement ? 'Cancel movement' : inspectorAutoCollapsed ? 'Edit shot' : 'Collapse', current.targetPlacement?'cancel-target':current.movementPlacement?'cancel-movement':'collapse-inspector', 'builder-button builder-collapse'); collapse.setAttribute('aria-label', current.targetPlacement ? 'Cancel target' : current.movementPlacement ? 'Cancel movement' : inspectorAutoCollapsed ? 'Edit shot' : (innerWidth<=700?'Done':'Collapse')); collapse.setAttribute('aria-expanded', String(!inspectorAutoCollapsed)); if (!inPlacement && !inspectorAutoCollapsed) { collapse.replaceChildren(el('span', 'builder-collapse-label-collapse', 'Collapse'), el('span', 'builder-collapse-label-done', 'Done')); } inspectorHeader.append(collapse); inspector.appendChild(inspectorHeader);
      const summary = el('p', 'builder-selected-summary', recipeSummary(selected)); inspector.appendChild(summary);
      const shotGroup = el('section', 'builder-control-group builder-group-shot'); shotGroup.append(el('h3', '', 'Shot'));
      const familySelect = select('Shot family', 'edit-family', FAMILIES); familySelect.querySelector('select').value = selected.family; familySelect.classList.add('builder-choice-field', 'builder-choice-family'); familySelect.dataset.glyph = FAMILY_GLYPHS[selected.family] || '◆'; familySelect.querySelector('.builder-field-label').textContent = 'Family'; familySelect.querySelector('select').setAttribute('aria-label', 'Shot family');
      const hitterSelect = select('Hitter', 'edit-hitter', PLAYERS); hitterSelect.querySelector('select').value = selected.hitter; hitterSelect.classList.add('builder-choice-field', 'builder-choice-hitter'); hitterSelect.dataset.team = /^player[12]$/.test(selected.hitter || '') ? 'green' : 'orange'; hitterSelect.querySelector('.builder-field-label').textContent = 'Hitter'; hitterSelect.querySelector('select').setAttribute('aria-label', 'Hitter');
      const shotChoices = el('div', 'builder-choice-grid'); shotChoices.append(familySelect, hitterSelect); shotGroup.append(shotChoices); inspector.appendChild(shotGroup);
      const flightValue=`${selected.arc}/${selected.pace}`;
      const flight=select('Flight','flight-preset', [...FLIGHTS,...(FLIGHTS.some(([v])=>v===flightValue)?[]:[[flightValue,`Custom · ${selected.arc} / ${selected.pace}`]])]);flight.querySelector('select').value=flightValue;
      const quickTarget = el('div', 'builder-quick-actions'); quickTarget.append(el('span', 'builder-quick-label', 'Target'), button('Place target on court', 'place-target', 'builder-button builder-button-accent')); inspector.appendChild(quickTarget);
      const details = el('details', 'builder-shot-details'); details.open=shotDetailsOpen;details.append(el('summary', '', 'Edit by intent'));
      const detailTabs = el('div', 'builder-detail-tabs'); detailTabs.setAttribute('role', 'tablist'); detailTabs.setAttribute('aria-label', 'Shot detail sections');
      const detailTab = (label, group) => { const tab = button(label, 'detail-group', 'builder-detail-tab'); tab.dataset.group = group; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(detailGroup === group)); tab.setAttribute('tabindex', detailGroup === group ? '0' : '-1'); return tab; };
      ['target', 'flight', 'players', 'movement', 'coach', 'precision'].forEach(group => detailTabs.appendChild(detailTab(titleCase(group === 'coach' ? 'Coach tools' : group), group)));
      details.append(detailTabs);
      const targetGroup = el('section', 'builder-control-group builder-group-target'); targetGroup.dataset.detailGroup = 'target'; targetGroup.setAttribute('role', 'tabpanel'); targetGroup.setAttribute('aria-label', 'Target settings'); targetGroup.classList.toggle('is-active', detailGroup === 'target'); targetGroup.append(el('h3', '', 'Target'));
      const targetRow = el('div', 'builder-target-row'); targetRow.append(el('div', 'builder-target-readout', 'Drag the target ring to adjust')); targetGroup.append(targetRow);
      const presets = el('div', 'builder-presets'); presets.append(el('span', 'builder-field-label', 'Quick target · green side')); [['wide', 3], ['middle', 10], ['centerline', 10]].forEach(([label, x]) => { const b = button(label, 'target-preset', 'builder-chip'); b.dataset.x = x; b.dataset.y = selected.target?.y || 20; b.dataset.direction = label; presets.appendChild(b); }); targetGroup.append(presets); details.appendChild(targetGroup);
      const flightGroup = el('section', 'builder-control-group builder-group-flight'); flightGroup.dataset.detailGroup = 'flight'; flightGroup.setAttribute('role', 'tabpanel'); flightGroup.setAttribute('aria-label', 'Flight settings'); flightGroup.classList.toggle('is-active', detailGroup === 'flight'); flightGroup.append(el('h3', '', 'Flight'), flight);
      const tuning = el('div', 'builder-grid-fields'); const arc = select('Arc', 'edit-arc', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]); const pace = select('Pace', 'edit-pace', [['soft', 'Soft'], ['medium', 'Medium'], ['firm', 'Firm']]); arc.querySelector('select').value = selected.arc || 'medium'; pace.querySelector('select').value = selected.pace || 'medium'; tuning.append(arc, pace); flightGroup.append(tuning); details.appendChild(flightGroup);
      const playersGroup = el('section', 'builder-control-group builder-group-players'); playersGroup.dataset.detailGroup = 'players'; playersGroup.setAttribute('role', 'tabpanel'); playersGroup.setAttribute('aria-label', 'Players settings'); playersGroup.classList.toggle('is-active', detailGroup === 'players'); playersGroup.append(el('h3', '', 'Players'));
      const receiver = select('Receiver', 'edit-receiver', [['auto', 'Automatic'], ...PLAYERS]); receiver.querySelector('select').value = selected.receiver || 'auto'; playersGroup.append(receiver);
      const contactStyle = select('Contact style', 'edit-contactStyle', [['auto', 'Automatic'], ['forehand', 'Forehand'], ['backhand', 'Backhand'], ['short-hop', 'Short hop']]); contactStyle.querySelector('select').value = selected.contactStyle || 'auto'; playersGroup.append(contactStyle);
      if (selected.family === 'serve') { const serveMethod = select('Serve method', 'edit-serveMethod', [['drop', 'Drop serve'], ['volley', 'Volley serve']]); serveMethod.querySelector('select').value = selected.serveMethod || 'drop'; playersGroup.append(serveMethod); } details.appendChild(playersGroup);
      const precisionGroup = el('section', 'builder-control-group builder-group-precision'); precisionGroup.dataset.detailGroup = 'precision'; precisionGroup.setAttribute('role', 'tabpanel'); precisionGroup.setAttribute('aria-label', 'Precision settings'); precisionGroup.classList.toggle('is-active', detailGroup === 'precision'); precisionGroup.append(el('h3', '', 'Precision'));
      const coords = el('div', 'builder-grid-fields'); coords.appendChild(numberField('Target width', 'edit-target.x', selected.target?.x ?? 10, 0, 20)); coords.appendChild(numberField('Target depth', 'edit-target.y', selected.target?.y ?? 20, 0, 44)); precisionGroup.append(coords); details.appendChild(precisionGroup);
      const movementGroup = el('section', 'builder-control-group builder-group-movement'); movementGroup.dataset.detailGroup = 'movement'; movementGroup.setAttribute('role', 'tabpanel'); movementGroup.setAttribute('aria-label', 'Movement settings'); movementGroup.classList.toggle('is-active', detailGroup === 'movement'); movementGroup.append(el('h3', '', 'Movement'));
      const movementPlayer = current.movementPlayer || selected.hitter;
      const movementState = movementPlayer === selected.hitter ? (selected.movement || {}) : (selected.playerMovement?.[movementPlayer] || {});
      const movementOwner = select('Moving player', 'movement-player', PLAYERS); movementOwner.querySelector('select').value = movementPlayer; movementGroup.append(movementOwner);
      const movement = select('Movement intent', 'edit-movement.intent', [['hold', 'Hold'], ['advance', 'Advance'], ['recover', 'Recover'], ['manual', 'Manual']]); movement.querySelector('select').value = movementState.intent || 'recover';
      const initialTarget = doc.initialLayout?.[movementPlayer]?.target || doc.initialLayout?.[movementPlayer] || {};
      const movementTarget = movementState.target || initialTarget;
      movementGroup.append(movement);
      const manual = el('div', 'builder-grid-fields'); manual.appendChild(numberField('Manual X', 'edit-movement.target.x', movementTarget.x ?? 10, -8, 28)); manual.appendChild(numberField('Manual Y', 'edit-movement.target.y', movementTarget.y ?? 20, -8, 52)); movementGroup.append(manual);
      movementGroup.append(button('Place movement on court', 'place-movement', 'builder-button builder-button-accent'));
      const pinned = el('label', 'builder-switch'); const pin = el('input'); pin.type = 'checkbox'; pin.checked = Boolean(movementState.pinned); pin.dataset.action = 'edit-movement.pinned'; pinned.append(pin, el('span', '', 'Pin movement target')); movementGroup.append(pinned); details.appendChild(movementGroup); inspector.appendChild(details);
      const actionMenu = el('details', 'builder-shot-actions-menu'); actionMenu.append(el('summary', '', 'More shot actions'));
      const actions = el('div', 'builder-shot-actions'); actions.append(button('Duplicate', 'duplicate-shot', 'builder-button')); actions.append(button('Delete', 'delete-shot', 'builder-button builder-button-danger')); actions.append(button('Move earlier', 'move-earlier', 'builder-button')); actions.append(button('Move later', 'move-later', 'builder-button')); actionMenu.append(actions); shotGroup.appendChild(actionMenu);
      const advanced = el('details', 'builder-advanced'); advanced.open = advancedOpen; advanced.append(el('summary', '', 'Rally details'));
      const opening = select('Starting condition', 'opening', [['serve', 'Opening serve'], ['midrally', 'Mid-rally']]); opening.querySelector('select').value = doc.opening || 'serve'; advanced.append(opening);
      const ending = select('Ending intent', 'ending', [['stop', 'Stop at authored end'], ['winner', 'Declared winner'], ['fault', 'Declared fault']]); ending.querySelector('select').value = doc.ending || 'stop'; advanced.append(ending);
      const fault = el('label', 'builder-switch'); const faultInput = el('input'); faultInput.type = 'checkbox'; faultInput.checked = Boolean(doc.intentionalFault); faultInput.dataset.action = 'intentionalFault'; fault.append(faultInput, el('span', '', 'Intentional coaching mistake'), el('small', '', 'Keep the rule warning visible at the terminal fault.')); advanced.append(fault);
      const scope = select('Shade team', 'shade-team', [['both', 'Both teams'], ['green', 'Green'], ['orange', 'Orange']]); scope.querySelector('select').value = doc.assistance?.team || 'both'; advanced.append(scope);
      const handed = el('details', 'builder-handedness'); handed.open = handednessOpen; handed.append(el('summary', '', 'Player handedness')); PLAYERS.forEach(([id, name]) => { const value = doc.players?.[id]?.handedness || 'right'; const field = select(name, 'handedness', [['right', 'Right-handed'], ['left', 'Left-handed']]); const control = field.querySelector('select'); control.value = value; control.dataset.playerId = id; handed.append(field); });
      const assistance = el('details', 'builder-assistance'); assistance.open=assistanceOpen || detailGroup === 'coach'; assistance.append(el('summary', '', 'Shading & Guides')); [['autoShading', 'Auto Shading', 'Shading changes eligible movement'], ['showGuides', 'Coverage Guides', 'Explain suggested positions only']].forEach(([field, label, description]) => { const row = el('label', 'builder-switch'); const input = el('input'); input.type = 'checkbox'; input.checked = Boolean(doc.assistance?.[field]); input.dataset.assistance = field; input.setAttribute('aria-label', label); row.append(input, el('span', '', label), el('small', '', description)); assistance.append(row); });
      const coachGroup = el('section', 'builder-control-group builder-group-coach'); coachGroup.dataset.detailGroup = 'coach'; coachGroup.setAttribute('role', 'tabpanel'); coachGroup.setAttribute('aria-label', 'Coach tools settings'); coachGroup.classList.toggle('is-active', detailGroup === 'coach'); coachGroup.append(el('h3', '', 'Coach tools'), advanced, handed, assistance); details.appendChild(coachGroup);
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
          row.append(el('span', 'builder-finding-kind', label), el('p', '', findingText(item, shots)));
          const affectedId = item.shotId || item.stepId;
          if (affectedId) { const index = shots.findIndex(shot => shot.id === affectedId); const go = button(`Review ${index >= 0 ? `Shot ${index + 1}` : 'shot'}`, 'finding-shot', 'builder-button builder-button-quiet'); go.dataset.shotId = affectedId; go.setAttribute('aria-label', `Edit affected ${index >= 0 ? `Shot ${index + 1}` : 'shot'}`); row.appendChild(go); }
          const pinSource = findingPinSource(item, shots);
          if (pinSource) {
            const playerLabel = PLAYERS.find(([id]) => id === pinSource.player)?.[1];
            const editPin = button(`Edit ${playerLabel} pin · Shot ${pinSource.number}`, 'finding-pin', 'builder-button builder-button-quiet');
            editPin.dataset.shotId = pinSource.shotId; editPin.dataset.player = pinSource.player;
            row.appendChild(editPin);
          }
          find.appendChild(row);
        });
        inspector.appendChild(find);
      }
    } else {
      const header=el('div','builder-inspector-header');header.append(el('span','','Play settings'),button(inspectorAutoCollapsed?'Edit play':'Collapse','collapse-inspector','builder-button builder-collapse'));inspector.append(header,el('p','builder-empty','Add a shot to start authoring.'));
      const global = el('div', 'builder-global-settings'); global.append(el('h2', '', 'Play settings')); [['autoShading', 'Auto Shading'], ['showGuides', 'Show Coverage Guides']].forEach(([field, label]) => { const row = el('label', 'builder-switch'); const input = el('input'); input.type = 'checkbox'; input.checked = Boolean(doc.assistance?.[field]); input.dataset.assistance = field; row.append(input, el('span', '', label)); global.append(row); }); global.append(select('Starting condition', 'opening', [['serve', 'Opening serve'], ['midrally', 'Mid-rally']])); global.append(select('Ending intent', 'ending', [['stop', 'Stop at authored end'], ['winner', 'Declared winner'], ['fault', 'Declared fault']])); inspector.append(global);
    }
    layout.appendChild(inspector); root.appendChild(layout);

    const transport = el('footer', 'builder-transport'); transport.setAttribute('aria-label', 'Rally playback');
    const transportTop = el('div', 'builder-transport-top');
    const undo = button('↶', 'undo', 'builder-button builder-icon-button'); undo.setAttribute('aria-label', 'Undo authored edit'); undo.disabled = !current.canUndo;
    const redo = button('↷', 'redo', 'builder-button builder-icon-button'); redo.setAttribute('aria-label', 'Redo authored edit'); redo.disabled = !current.canRedo;
    const play = button('', 'play-pause', 'builder-button builder-button-primary builder-play-button'); play.replaceChildren(el('span', 'pixel-play-icon', current.playing ? 'Ⅱ' : '▶'), el('span', 'pixel-play-label', current.playing ? 'Pause' : 'Play')); play.setAttribute('aria-pressed', String(Boolean(current.playing))); play.setAttribute('aria-label', current.playing ? 'Pause' : 'Play');
    transportTop.append(play);
    const history = el('div', 'builder-history-controls'); history.setAttribute('aria-label', 'Edit history'); history.append(undo, redo); transportTop.append(history);
    const timelineHost = el('div', 'builder-transport-timeline'); timelineHost.append(timelineControl.element); transportTop.append(timelineHost);
    const optionsMenu = el('details', 'builder-menu builder-context-menu'); optionsMenu.append(el('summary', '', 'Playback options'));
    const rate = select('Playback speed', 'rate', [['0.25', '0.25×'], ['0.5', '0.5×'], ['1', '1×']]); rate.querySelector('select').value = String(current.rate || 1);
    const cameraChoices = select('Camera', 'camera', [['overhead', 'Overhead'], ['sideline', 'Sideline'], ['behind-green', 'Behind Green'], ['behind-orange', 'Behind Orange']]); cameraChoices.querySelector('select').value = current.camera || 'overhead';
    const optionsSummary=optionsMenu.querySelector('summary');optionsSummary.replaceChildren(el('span','','⋮'),el('span','sr-only','Playback options'));optionsSummary.setAttribute('aria-label','Playback options');optionsMenu.open=optionsMenuOpen;
    const optionsPanel=el('div','builder-menu-panel');optionsPanel.append(rate,cameraChoices);optionsMenu.append(optionsPanel);
    transportTop.append(optionsMenu); transport.append(transportTop); root.appendChild(transport);
    for(const dialog of [templateDialog,importDialog])if(dialog.parentElement!==root)root.appendChild(dialog);
    timelineControl?.update({ chapters: current.chapters || [], time: current.time || 0, duration: current.duration || 0, playing: Boolean(current.playing), busy: Boolean(current.busy), currentShotId: current.currentShotId || current.selectedChapterId || null });
    const nextInspector=root.querySelector('.builder-inspector'); if(nextInspector) nextInspector.scrollTop=oldInspectorScroll;
    if(focusIdentity && document.activeElement===document.body){
      const next=[...root.querySelectorAll('[data-action],[aria-label]')].find(n=>focusIdentity.shotId?n.dataset.shotId===focusIdentity.shotId:focusIdentity.action?n.dataset.action===focusIdentity.action:n.getAttribute('aria-label')===focusIdentity.label);
      if(next?.getClientRects().length)next.focus({preventScroll:true});
    }
  }
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
    const menu = target.closest('.builder-menu'); if (menu && action !== 'rename') {menu.open = false;menu.querySelector('summary').focus();}
    const picker=target.closest('.builder-chapter-menu');
    if(picker&&['chapter','edit-chapter'].includes(action)){picker.open=false;picker.querySelector('summary')?.focus();}
    const input=document.activeElement;if(input&&root.contains(input)&&input.matches('input:not([type=range]),textarea'))input.blur();
    if (action === 'select-shot') { inspectorManualCollapsed = false; userInspectorExpanded = true; current.movementPlayer = null; rerenderAction('selectShot', target.dataset.shotId); }
    else if (action === 'chapter') {await rerenderAction('chapter', target.dataset.shotId);await syncViewingShot();}
    else if (action === 'edit-chapter') { inspectorManualCollapsed = false; userInspectorExpanded = true; current.movementPlayer = null; await fire('pauseForEditing');await rerenderAction('selectShot', target.dataset.shotId);root.querySelector('[data-action="edit-family"]')?.focus({ preventScroll: true }); }
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
    else if (action === 'add-shot') { fire('pauseForEditing'); inspectorManualCollapsed=false;rerenderAction('addShot'); }
    else if (action === 'new') rerenderAction('new');
    else if (action === 'templates') openTemplateDialog('learn');
    else if (action === 'template-open') { closeDialog(templateDialog); rerenderAction(target.dataset.kind === 'open' ? 'open' : 'template', target.dataset.id); }
    else if (action === 'dialog-close') { closeDialog(templateDialog); closeDialog(importDialog); }
    else if (action === 'review-findings') { fire('pauseForEditing'); if (target.dataset.shotId) rerenderAction('selectShot', target.dataset.shotId); inspectorManualCollapsed=false;render({});root.querySelector('.builder-findings')?.scrollIntoView({block:'nearest'}); }
    else if (action === 'finding-shot') { fire('pauseForEditing'); inspectorManualCollapsed=false; userInspectorExpanded=true; current.movementPlayer=null; rerenderAction('selectShot', target.dataset.shotId); }
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
    else if (action === 'duplicate-shot') rerenderAction('duplicateShot', current.selectedShotId);
    else if (action === 'delete-shot') rerenderAction('deleteShot', current.selectedShotId);
    else if (action === 'move-earlier') rerenderAction('moveShot', { id: current.selectedShotId, delta: -1 });
    else if (action === 'move-later') rerenderAction('moveShot', { id: current.selectedShotId, delta: 1 });
    else if (action === 'collapse-inspector') {
      const opening=root.querySelector('.builder-inspector')?.classList.contains('builder-inspector-collapsed');
      inspectorManualCollapsed=!opening;userInspectorExpanded=opening;
      if(opening){await fire('pauseForEditing');const liveShotId=current.currentShotId||current.selectedShotId;if(liveShotId&&liveShotId!==current.selectedShotId)await fire('selectShot',{id:liveShotId,preserveTime:true});}
      render({});
      root.querySelector(opening?'[data-action="edit-family"]':'.builder-context-actions [data-action="collapse-inspector"]')?.focus({preventScroll:true});
    }
    else if (action === 'play-pause') { inspectorManualCollapsed = true; userInspectorExpanded = null; await rerenderAction('playPause',{playing:target.getAttribute('aria-pressed')!=='true'});await syncViewingShot(); }
    else if (action === 'restart' || action === 'previous' || action === 'next' || action === 'undo' || action === 'redo' || action === 'save-as' || action === 'use-planner') rerenderAction(({ 'save-as': 'saveAs', 'use-planner': 'usePlanner' }[action] || action));
    else if (action === 'rename') { const field = root.querySelector('[data-action="title"]'); field?.focus(); field?.select(); }
    else if (action === 'open') openTemplateDialog('library');
    else if (action === 'import-export') openImportDialog();
    else if (action === 'import-json') { const area = importDialog.querySelector('textarea'); const result = await rerenderAction('import', area?.value || ''); if (!result || result.ok !== false) { importFileGeneration += 1; closeDialog(importDialog); } else { const status = importDialog.querySelector('.builder-import-status') || el('p', 'builder-import-status'); status.textContent = result.error || 'Import could not be completed. Check the JSON and try again.'; importDialog.insertBefore(status, importDialog.querySelector('.builder-dialog-actions')); } }
    else if (action === 'export') rerenderAction('export');
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
    else if(event.target.matches('input[type=number],input[type=text]')){pendingField=true;const status=root.querySelector('.builder-save-status');if(status)status.textContent='Editing · not saved yet';}
  }
  root.addEventListener('pointerdown',event=>{if(event.target.closest('button,summary')&&root.contains(document.activeElement)&&document.activeElement.matches('input:not([type=range]),textarea'))event.preventDefault();});
  root.addEventListener('keydown', event => { if (event.key !== 'Escape') return; const menu = event.target.closest('.builder-menu[open],.builder-chapter-menu[open]'); if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); event.preventDefault(); } });
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
    if (field && !field.querySelector('.builder-field-error')) {const error=el('span','builder-field-error',message);error.id=`builder-error-${target.dataset.action.replace(/[^a-z0-9]/gi,'-')}`;error.setAttribute('role','alert');field.appendChild(error);target.setAttribute('aria-describedby',error.id);}
  }
  function clearInvalidField(target) {
    pendingField=false;
    target.removeAttribute('aria-invalid');target.removeAttribute('aria-describedby');
    target.closest('.builder-field')?.querySelector('.builder-field-error')?.remove();
  }
  let plannerConfirmation = null;
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
  return { render, showExport, confirmPlanner, destroy() { destroyed = true; importFileGeneration += 1; timelineControl?.cancel?.(); timelineControl?.destroy?.(); root.remove(); document.body.classList.remove('builder-workspace', 'planner-workspace'); }, element: root };
}

export { FAMILIES };
