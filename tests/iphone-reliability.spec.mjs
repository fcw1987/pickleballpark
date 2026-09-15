import {test,expect} from '@playwright/test';
const open=async page=>{await page.goto('/');await page.waitForFunction(()=>window.playBuilder&&!playBuilder.busy);};
const fileMenu=async page=>{const menu=page.locator('.builder-main-menu');if(!(await menu.evaluate(node=>node.open)))await menu.locator(':scope > summary').click();const files=page.locator('.builder-document-menu');if(!(await files.evaluate(node=>node.open)))await page.getByLabel('Play file',{exact:true}).click();return files;};
const title=async(page,value)=>{await fileMenu(page);await page.getByLabel('Play title').fill(value);await page.getByLabel('Play title').press('Tab');};

test('two tabs keep both authored versions and recover a conflict as a copy',async({context,page})=>{
 await open(page);await title(page,'Shared original');const identity=await page.evaluate(()=>playBuilder.document.id);
 const other=await context.newPage();await open(other);await title(page,'First tab version');await title(other,'Second tab version');
 expect(await page.evaluate(()=>playBuilder.store.open(playBuilder.document.id).title)).toBe('First tab version');
 expect(await other.evaluate(()=>playBuilder.saveError?.conflict)).toBe(true);
 expect(await other.evaluate(()=>playBuilder.document.title)).toBe('Second tab version');
 await fileMenu(other);await other.getByRole('button',{name:'Save As',exact:true}).click();
 expect(await other.evaluate(()=>playBuilder.saveError)).toBe(null);expect(await other.evaluate(()=>playBuilder.document.id)).not.toBe(identity);
 expect(await other.evaluate(()=>playBuilder.store.list().map(d=>d.title))).toEqual(['First tab version','Second tab version — copy']);
 await other.reload();await other.waitForFunction(()=>window.playBuilder&&!playBuilder.busy);await fileMenu(other);expect(await other.getByLabel('Play title').inputValue()).toBe('Second tab version — copy');
});
test('import with a matching identity creates a separate copy and a failed import keeps the source',async({page})=>{
 await open(page);await title(page,'Original');const original=await page.evaluate(()=>structuredClone(playBuilder.document));
 await page.evaluate(doc=>playBuilder.action('import',JSON.stringify({...doc,title:'Imported'})),original);
 expect(await page.evaluate(()=>playBuilder.document.id)).not.toBe(original.id);
 expect(await page.evaluate(id=>playBuilder.store.open(id).title,original.id)).toBe('Original');
 const copy=await page.evaluate(()=>JSON.stringify(playBuilder.document));await page.evaluate(()=>playBuilder.action('import','{"oops":'));
 expect(await page.evaluate(()=>JSON.stringify(playBuilder.document))).toBe(copy);
});
test('completed contextual name edits save and playback does not read the library per frame',async({page})=>{
 await open(page);await fileMenu(page);await page.getByLabel('Play title').fill('Background edit');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 expect(await page.evaluate(()=>playBuilder.store.loadLast().title)).toBe('Background edit');
 await page.evaluate(()=>{window.libraryReads=0;const read=playBuilder.store.list.bind(playBuilder.store);playBuilder.store.list=()=>{window.libraryReads++;return read();};playBuilder.play();});
 await expect.poll(()=>page.evaluate(()=>playBuilder.session.clock.elapsed)).toBeGreaterThan(.5);
 expect(await page.evaluate(()=>window.libraryReads)).toBeLessThanOrEqual(1);
});
test('save failure preserves the unsaved draft across new/open attempts and retries honestly',async({page})=>{
 await open(page);await page.evaluate(()=>{const storage=playBuilder.store.storage;window.failedWrites=0;window.restoreWrites=()=>{playBuilder.store.storage=storage;};playBuilder.store.storage={getItem:storage.getItem.bind(storage),removeItem:storage.removeItem.bind(storage),setItem:()=>{window.failedWrites++;throw new DOMException('Storage quota reached','QuotaExceededError');}};});
 await title(page,'Unsaved work');expect(await page.evaluate(()=>window.failedWrites)).toBeGreaterThan(0);expect(await page.evaluate(()=>Boolean(playBuilder.saveError))).toBe(true);const source=await page.evaluate(()=>JSON.stringify(playBuilder.document));
 await page.evaluate(()=>playBuilder.action('new'));expect(await page.evaluate(()=>JSON.stringify(playBuilder.document))).toBe(source);
 await page.evaluate(()=>{window.restoreWrites();return playBuilder.action('retrySave');});expect(await page.evaluate(()=>playBuilder.saveError)).toBe(null);
 expect(await page.evaluate(()=>playBuilder.store.loadLast().title)).toBe('Unsaved work');
});
