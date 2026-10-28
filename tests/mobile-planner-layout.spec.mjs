import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

for (const viewport of [{width:390,height:844},{width:375,height:667},{width:844,height:390},{width:667,height:375}]) {
  test(`Court Planner keeps near athletes and ball reachable at ${viewport.width}x${viewport.height}`, async ({browser}, testInfo) => {
    const context = await browser.newContext({viewport,hasTouch:true});
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
    await page.evaluate(() => playBuilder.setWorkspace('planner'));
    const inspector = page.locator('.builder-planner .builder-inspector');
    await expect(inspector.getByRole('heading',{name:'Court Planner'})).toBeVisible();
    const assertSeparate = async () => {
      const currentViewport=page.viewportSize();
      const court = await page.locator('#parkStage').boundingBox();
      const panel = await inspector.boundingBox();
      const identity = await page.locator('.planner-identity').boundingBox();
      expect(identity.y+identity.height <= court.y || identity.y >= court.y+court.height).toBe(true);
      expect(court.width).toBeGreaterThan(140);
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.x+panel.width).toBeLessThanOrEqual(currentViewport.width);
      expect(panel.y+panel.height).toBeLessThanOrEqual(currentViewport.height);
      expect(court.y+court.height <= panel.y || court.x+court.width <= panel.x).toBe(true);
    };
    await assertSeparate();
    const taps=[];
    for (const mode of ['doubles','singles']) {
      await page.locator('#menuToggle').tap();
      await page.locator(`input[name="gameMode"][value="${mode}"]`).check();
      await page.locator('#menuClose').tap();
      for (const id of [mode==='doubles'?'player3-touch':'player2-touch','ball']) {
        const target=page.locator(`#${id}`);
        await page.evaluate(() => { window.plannerTap=null; document.querySelector('#court').addEventListener('pointerdown',e => {window.plannerTap=e.target.id;},{once:true,capture:true}); });
        const bounds=await target.boundingBox();
        await expect(page.locator('#menuOverlay')).toBeHidden();
        await page.touchscreen.tap(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
        const actual=await page.evaluate(() => window.plannerTap);
        expect(actual).toMatch(id==='ball' ? /^ball$/ : /^player[23](?:-touch)?$/);
        taps.push({mode,id,actual});
      }
      await assertSeparate();
      if(process.env.MOBILE_EVIDENCE) {
        await fs.mkdir(process.env.MOBILE_EVIDENCE,{recursive:true});
        await page.screenshot({path:`${process.env.MOBILE_EVIDENCE}/${testInfo.project.name}-${viewport.width}x${viewport.height}-${mode}.png`});
      }
    }
    await inspector.locator('p').last().scrollIntoViewIfNeeded();
    await expect(inspector.locator('p').last()).toBeInViewport();
    await inspector.evaluate(el => {el.scrollTop=0;});
    const evidence = process.env.MOBILE_EVIDENCE;
    if (evidence) {
      await fs.mkdir(evidence,{recursive:true});
      const name=`${testInfo.project.name}-${viewport.width}x${viewport.height}`;
      await page.screenshot({path:`${evidence}/${name}.png`});
      await fs.writeFile(`${evidence}/${name}-taps.json`,JSON.stringify(taps,null,2)+'\n');
    }
    await page.setViewportSize({width:viewport.height,height:viewport.width});
    await assertSeparate();
    await inspector.getByRole('button',{name:'Return to builder',exact:true}).tap();
    await expect(page.locator('.builder-planner')).toHaveCount(0);
    await expect(page.locator('.builder-camera-bar')).toBeVisible();
    await context.close();
  });
}
