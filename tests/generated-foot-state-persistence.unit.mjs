import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateRally} from '../rally-engine.js';
import {validateDocument} from '../play-document.js';
import {compileDocument} from '../play-compiler.js';
import {sampleActorFeetV2} from '../play-actors-v2.js';
import {DraftStore, EditHistory, STORAGE_KEY, MAX_DRAFTS} from '../builder-storage.js';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const copy=structuredClone;
const generated=async()=>{const result=await simulateRally({seed:0,options:{maxShots:3}});assert.ok(result.document,JSON.stringify(result.diagnostics));return result.document;};
function feet(document){const compiled=compileDocument(document);return compiled.timeline.segments.flatMap(segment=>Object.keys(document.players).flatMap(id=>[0,segment.contactTime,segment.duration].map(time=>sampleActorFeetV2(segment,id,time))));}

test('the explicit generated foot state survives save, load, import, copy and history without changing actual feet',async()=>{
 const document=await generated(),original=JSON.stringify(document),expected=feet(document),storage=memory(),store=new DraftStore({storage,validate:validateDocument});
 store.save(document);assert.deepEqual(store.loadLast(),document);
 const imported=store.importJSON(store.exportJSON(document));assert.deepEqual(imported,document);assert.deepEqual(feet(imported),expected);
 const duplicate={...copy(document),id:'ready-stance-copy',title:'Ready stance copy'};store.save(duplicate);assert.deepEqual(store.open(duplicate.id),duplicate);assert.deepEqual(feet(duplicate),expected);
 const edited={...copy(document),title:'Updated title'},history=new EditHistory(document);history.commit(edited);
 assert.deepEqual(history.undo(),document);assert.deepEqual(history.redo(),edited);assert.deepEqual(feet(edited),expected);
 assert.equal(JSON.stringify(document),original);
});

test('malformed foot-state imports and failed, conflicting or full-library saves retain the previous source bytes',async()=>{
 const document=await generated(),storage=memory(),store=new DraftStore({storage,validate:validateDocument});store.save(document);
 const saved=storage.getItem(STORAGE_KEY),invalid=copy(document);invalid.defaultFootState.version='unknown';
 assert.throws(()=>store.importJSON(JSON.stringify(invalid)),/defaultFootState/);assert.equal(storage.getItem(STORAGE_KEY),saved);
 const edited={...copy(document),title:'Keep this unsaved title'},write=storage.setItem;storage.setItem=()=>{throw Object.assign(Error('full'),{name:'QuotaExceededError'});};
 assert.throws(()=>store.save(edited),/previous saved library was kept/);assert.equal(storage.getItem(STORAGE_KEY),saved);storage.setItem=write;
 const other=new DraftStore({storage,validate:validateDocument});other.open(document.id);store.save(edited);const newer=storage.getItem(STORAGE_KEY);
 assert.throws(()=>other.save(document),error=>error.code==='DRAFT_CONFLICT');assert.equal(storage.getItem(STORAGE_KEY),newer);
 for(let i=1;i<MAX_DRAFTS;i++)store.save({...copy(document),id:`ready-state-${i}`});const full=storage.getItem(STORAGE_KEY);
 assert.throws(()=>store.save({...copy(document),id:'ready-state-overflow'}),error=>error.code==='DRAFT_CAPACITY');assert.equal(storage.getItem(STORAGE_KEY),full);assert.equal(store.list().length,MAX_DRAFTS);
 assert.deepEqual(edited.defaultFootState,document.defaultFootState);
});
