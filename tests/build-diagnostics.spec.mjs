import {test,expect} from '@playwright/test';
import {settleBuilderStartup} from './helpers/builder-navigation.mjs';

test.use({serviceWorkers:'block'});
test('Help diagnostics preserve the loaded snapshot when the server changes or disappears',async({page})=>{
  await page.goto('/');await settleBuilderStartup(page);
  const before=await page.evaluate(()=>({document:JSON.stringify(playBuilder.document),history:playBuilder.history.index,running:pickleboard.buildDiagnostics.controller.running}));
  await page.evaluate(()=>playBuilder.action('buildDiagnostics'));
  await expect(page.getByRole('heading',{name:'Build diagnostics',exact:true})).toBeFocused();
  await page.route('**/version.json?diagnostic=*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...before.running,sourceRevision:'a'.repeat(40)})}));
  await page.getByRole('button',{name:'Check server build',exact:true}).click();
  const text=page.getByLabel('Build diagnostic text');
  await expect(text).toContainText(`Server build: ${'a'.repeat(40)}`);
  expect(await page.evaluate(()=>pickleboard.buildDiagnostics.controller.running)).toEqual(before.running);
  await page.unroute('**/version.json?diagnostic=*');
  await page.route('**/version.json?diagnostic=*',route=>route.abort('internetdisconnected'));
  await page.getByRole('button',{name:'Check server build',exact:true}).click();
  await expect(text).toContainText('Environment: offline');
  await expect(text).toContainText('Server build: unavailable');
  expect(await page.evaluate(()=>pickleboard.buildDiagnostics.controller.running)).toEqual(before.running);
  expect(await page.evaluate(()=>JSON.stringify(playBuilder.document))).toBe(before.document);
  expect(await page.evaluate(()=>playBuilder.history.index)).toBe(before.history);
  await expect(text).not.toContainText('/Users/');
});

test('the source version endpoint exists and Help remains available in Planner',async({page,request})=>{
  const endpoint=await request.get('/version.json');expect(endpoint.ok()).toBe(true);
  expect((await endpoint.json()).product).toBe('Pickleball Park');
  await page.goto('/');await settleBuilderStartup(page);
  await page.evaluate(()=>playBuilder.action('workspace','planner'));
  await page.getByRole('button',{name:'Open help and information',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Build diagnostics',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close help and information',exact:true}).click();
  await expect(page.locator('#infoModal')).not.toHaveClass(/active/);
});
