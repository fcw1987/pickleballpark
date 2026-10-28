import { test, expect } from '@playwright/test';

test('actual builder installs a long doubles rally with off-ball movement and preserves its source', async ({ page }) => {
  await page.goto('/index.html?doubles-strategy-proof=1');
  await page.waitForFunction(() => window.playBuilder && !playBuilder.busy);
  const proof = await page.evaluate(async () => {
    const response = await playBuilder.action('randomRally', {count:60,seed:42});
    const {compileDocument} = await import('/play-compiler.js');
    const document=playBuilder.document;
    const before=JSON.stringify(document);
    const compiled=compileDocument(document);
    const ids=['player1','player2','player3','player4'];
    return { response, hits:document.shots.length, valid:compiled.validShotCount, preserved:before===JSON.stringify(playBuilder.document), touches:Object.fromEntries(ids.map(id=>[id,document.shots.filter(shot=>shot.hitter===id).length])), offball:Object.fromEntries(ids.map(id=>[id,compiled.play.steps.slice(1).filter((step,index)=>step.shot.playerId!==id && compiled.play.steps[index+2]?.shot?.playerId!==id && Math.hypot(step.positions[id].x-compiled.play.steps[index].positions[id].x,step.positions[id].y-compiled.play.steps[index].positions[id].y)>.05).length])) };
  });
  expect(proof.hits).toBe(60);
  expect(proof.valid).toBe(60);
  expect(proof.preserved).toBe(true);
  for (const id of Object.keys(proof.touches)) {
    expect(proof.touches[id],id).toBeGreaterThanOrEqual(4);
    expect(proof.offball[id],id).toBeGreaterThanOrEqual(3);
  }
  await expect(page.locator('.builder-chapter-list [data-action="chapter"]')).toHaveCount(60);
  await test.info().attach('doubles-strategy-proof.json',{body:JSON.stringify(proof,null,2),contentType:'application/json'});
});
