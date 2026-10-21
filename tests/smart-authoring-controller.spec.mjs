import {test,expect} from '@playwright/test';
import {settleBuilderStartup} from './helpers/builder-navigation.mjs';
import {automaticRepairScenario,protectedPinScenario} from './fixtures/smart-coach-scenarios.mjs';

test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{await page.goto('/');await settleBuilderStartup(page);});

test('five rapid Adds serialize against current source and create five Undo steps',async({page})=>{
  const result=await page.evaluate(async()=>{
    await playBuilder.action('new');
    const empty=structuredClone(playBuilder.document);
    const results=await Promise.all(Array.from({length:5},(_,i)=>playBuilder.action('addShot',{seed:256+i})));
    const full=structuredClone(playBuilder.document);
    const valid=playBuilder.compiled.validShotCount;
    for(let i=0;i<5;i++)await playBuilder.action('undo');
    const undone=structuredClone(playBuilder.document);
    for(let i=0;i<5;i++)await playBuilder.action('redo');
    return {results,empty,full,valid,undone,redone:playBuilder.document,playing:playBuilder.session.playing};
  });
  expect(result.results.every(item=>item.ok)).toBe(true);
  expect(result.full.shots).toHaveLength(5);expect(result.valid).toBe(5);
  expect(new Set(result.full.shots.map(s=>s.id)).size).toBe(5);
  expect(result.undone).toEqual(result.empty);expect(result.redone).toEqual(result.full);expect(result.playing).toBe(false);
});

test('invalid authored prefixes are not extended or silently repaired',async({page})=>{
  const result=await page.evaluate(async()=>{
    playBuilder.selectedShotId=playBuilder.document.shots[0].id;
    await playBuilder.action('editShot',{field:'target',value:{x:16,y:3}});
    const before=JSON.stringify(playBuilder.document),history=playBuilder.history.index;
    const result=await playBuilder.action('addShot',{seed:51});
    return {result,before,after:JSON.stringify(playBuilder.document),history,afterHistory:playBuilder.history.index};
  });
  expect(result.result.ok).toBe(false);expect(result.after).toBe(result.before);expect(result.afterHistory).toBe(result.history);
});

test('a newer edit cancels Random Rally without replacing current work',async({page})=>{
  const result=await page.evaluate(async()=>{
    const oldId=playBuilder.document.id,oldShots=structuredClone(playBuilder.document.shots);
    const pending=playBuilder.action('randomRally',{count:99,seed:12648430});
    await playBuilder.action('title','Keep this newer edit');
    const result=await pending;
    return {result,oldId,oldShots,document:playBuilder.document,busy:playBuilder.proposalBusy};
  });
  expect(result.result.ok).toBe(false);expect(result.document.id).toBe(result.oldId);
  expect(result.document.title).toBe('Keep this newer edit');expect(result.document.shots).toEqual(result.oldShots);expect(result.busy).toBe(false);
});

test('99-hit generation is exact, persisted as a new draft and editable after reload',async({page})=>{
  const result=await page.evaluate(async()=>{
    await playBuilder.action('title','Authored play before Random');
    const prior=structuredClone(playBuilder.document);
    const result=await playBuilder.action('randomRally',{count:99,seed:12648430});
    const saved=JSON.parse(localStorage.getItem('pickleballpark-builder-v1'));
    return {result,prior,document:playBuilder.document,valid:playBuilder.compiled.validShotCount,chapters:playBuilder.chapters.length,saved:saved.drafts.find(d=>d.id===prior.id),lastId:saved.lastId,playing:playBuilder.session.playing};
  });
  expect(result.result.ok).toBe(true);expect(result.document.shots).toHaveLength(99);expect(result.valid).toBe(99);expect(result.chapters).toBe(99);
  expect(result.document.id).not.toBe(result.prior.id);expect(result.saved).toEqual(result.prior);expect(result.playing).toBe(false);
  expect(result.lastId).toBe(result.document.id);
  await page.reload();await settleBuilderStartup(page);
  expect(await page.evaluate(()=>playBuilder.document)).toEqual(result.document);
  expect(await page.evaluate(()=>playBuilder.compiled.validShotCount)).toBe(99);
});

test('manual target and flight values lose automatic ownership and survive family changes',async({page})=>{
  const result=await page.evaluate(async()=>{
    await playBuilder.action('randomRally',{count:7,seed:12648430});
    playBuilder.selectedShotId=playBuilder.document.shots[2].id;
    await playBuilder.action('editShot',{field:'target',value:{x:7,y:31}});
    await playBuilder.action('flight',{arc:'high',pace:'soft'});
    const before=structuredClone(playBuilder.selectedShot);
    await playBuilder.action('editShot',{field:'family',value:'drive'});
    return {before,after:playBuilder.selectedShot};
  });
  expect(result.after.target).toEqual(result.before.target);expect(result.after.arc).toBe('high');expect(result.after.pace).toBe('soft');expect(result.after.family).toBe('drive');
  expect(result.after.authoring.fields).not.toContain('target');expect(result.after.authoring.fields).not.toContain('pace');
});

test('Coach automatic repair is one reversible transaction',async({page})=>{
  const result=await page.evaluate(async fixture=>{
    playBuilder.loadDocument(fixture);
    const before=structuredClone(playBuilder.document);
    const fixed=await playBuilder.action('coachFix');
    const after=structuredClone(playBuilder.document),valid=playBuilder.compiled.validShotCount;
    await playBuilder.action('undo');const undone=structuredClone(playBuilder.document);
    await playBuilder.action('redo');return {before,fixed,after,valid,undone,redone:playBuilder.document};
  },await automaticRepairScenario());
  expect(result.fixed.ok).toBe(true);expect(result.valid).toBe(result.after.shots.length);
  expect(result.undone).toEqual(result.before);expect(result.redone).toEqual(result.after);
});

test('Coach options preserve protected pins until accepted and reject stale proposals',async({page})=>{
  const result=await page.evaluate(async fixture=>{
    playBuilder.loadDocument(fixture);
    const before=structuredClone(playBuilder.document);
    const automatic=await playBuilder.action('coachFix');
    await playBuilder.action('coachOptions');const ids=playBuilder.coachOptions.map(o=>o.id);
    const afterOptions=structuredClone(playBuilder.document);
    await playBuilder.action('coachKeep');
    const kept=structuredClone(playBuilder.document);
    await playBuilder.action('coachOptions');const staleId=playBuilder.coachOptions[0]?.id;
    await playBuilder.action('title','New intent');
    const stale=await playBuilder.action('coachApply',{id:staleId});
    return {before,automatic,ids,afterOptions,kept,stale,title:playBuilder.document.title};
  },protectedPinScenario());
  expect(result.automatic.ok).toBe(false);expect(result.ids.length).toBeGreaterThan(0);
  expect(result.afterOptions).toEqual(result.before);expect(result.kept).toEqual(result.before);
  expect(result.stale.ok).toBe(false);expect(result.title).toBe('New intent');
});
