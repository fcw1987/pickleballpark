import { test, expect } from '@playwright/test';
import { clickAndVerifySmartAdd } from '../tools/package-smart-add.mjs';
import { settleBuilderStartup } from './helpers/builder-navigation.mjs';

test.use({ serviceWorkers: 'block' });

test('package Add verification waits for a pending fifth proposal and retains the exact five-shot result', async ({ page }) => {
  await page.goto('/'); await settleBuilderStartup(page);
  await page.evaluate(async () => {
    await playBuilder.action('new');
    const seeds = [1027220423, 18026106, 1276464017, 4140339132, 3074369515];
    const add = playBuilder.queueSmartAdd.bind(playBuilder);
    playBuilder.queueSmartAdd = options => add({ ...options, seed: seeds.shift() });
    const cancel = playBuilder.cancelPendingProposals;
    window.__delayedSmartTurn = false;
    playBuilder.cancelPendingProposals = function () {
      cancel.call(this);
      if (window.__delayedSmartTurn || this.document.shots.length !== 4) return;
      this.cancelPendingProposals = cancel;
      // Hold the fifth Add after its normal queue reset, independently of how
      // many search attempts the real generator needs before finding a result.
      this.addQueue = new Promise(resolve => {
        queueMicrotask(() => {
          window.__delayedSmartTurn = true;
          window.__pendingAddEvidence = { shots: playBuilder.document.shots.length,
            pending: playBuilder.pendingAddCount, busy: playBuilder.proposalBusy,
            source: structuredClone(playBuilder.document), saveError: playBuilder.saveError };
          // The real Add has now set its counters and queued its task. Keep it
          // pending beyond the previous count-only assertion's 5-second deadline.
          setTimeout(resolve, 5500);
        });
      });
    };
  });
  for (let count = 1; count <= 5; count++) await clickAndVerifySmartAdd(page, count);
  const proof = await page.evaluate(() => {
    const source = playBuilder.document;
    return { held: window.__delayedSmartTurn, before: window.__pendingAddEvidence,
      source: structuredClone(source), saved: JSON.parse(localStorage.getItem('pickleballpark-builder-v1')).drafts.find(draft => draft.id === source.id) };
  });
  expect(proof.held).toBe(true);
  expect(proof.before).toMatchObject({ shots: 4, pending: 1, busy: true, saveError: null });
  expect(proof.source.shots).toHaveLength(5);
  expect(proof.source.shots.slice(0, 4)).toEqual(proof.before.source.shots);
  expect(proof.saved).toEqual(proof.source);
});
