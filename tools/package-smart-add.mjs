import { expect } from '@playwright/test';

/** A committed shot count can be visible before an asynchronous Add finishes.
 * Wait for the actual task, then verify its result, persistence and idle queue.
 * This also detects a click that never queued work instead of waiting on count.
 */
export async function clickAndVerifySmartAdd(page, expectedShots) {
  await page.evaluate(() => { window.__packagePreviousAddQueue = playBuilder.addQueue; });
  await page.getByRole('button', { name: 'Add shot' }).click();
  const completion = await page.evaluate(async () => {
    const task = playBuilder.addQueue, queued = task !== window.__packagePreviousAddQueue;
    delete window.__packagePreviousAddQueue;
    const result = queued ? await task : null;
    return { queued, result, shots: playBuilder.document.shots.length,
      valid: playBuilder.compiled.validShotCount, pending: playBuilder.pendingAddCount,
      busy: playBuilder.proposalBusy, saveError: playBuilder.saveError };
  });
  expect(completion).toMatchObject({ queued: true, result: { ok: true },
    shots: expectedShots, valid: expectedShots, pending: 0, busy: false, saveError: null });
  return completion;
}
