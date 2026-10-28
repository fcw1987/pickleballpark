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
    const timer = window.setTimeout.bind(window);
    window.__delayedSmartTurn = false;
    window.setTimeout = (callback, delay, ...args) => {
      if (!window.__delayedSmartTurn && playBuilder.document.shots.length === 4 && delay === 0
          && new Error().stack.includes('smart-rally-generator.js')) {
        window.__delayedSmartTurn = true;
        window.__pendingAddEvidence = { shots: playBuilder.document.shots.length,
          pending: playBuilder.pendingAddCount, busy: playBuilder.proposalBusy,
          source: structuredClone(playBuilder.document), saveError: playBuilder.saveError };
        // Simulate a delayed cooperative generator turn beyond the previous
        // count-only assertion's 5-second deadline, without burning CPU.
        return timer(callback, 5500, ...args);
      }
      return timer(callback, delay, ...args);
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
