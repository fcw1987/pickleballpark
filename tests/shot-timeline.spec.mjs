import { expect, test } from '@playwright/test';

const chapters = [
  { shotId: 'serve', number: 1, label: 'Serve', anchor: 0, contactTime: .4, startTime: 0, endTime: 2.2 },
  { shotId: 'return', number: 2, label: 'Return', anchor: 2.2, contactTime: 3, startTime: 2.2, endTime: 7.4 },
  { shotId: 'drop-a', number: 3, label: 'Drop', anchor: 7.4, contactTime: 7.8, startTime: 7.4, endTime: 10 },
  { shotId: 'drop-b', number: 4, label: 'Volley', anchor: 7.4, contactTime: 8.1, startTime: 7.4, endTime: 10 }
];

async function mount(page, extra = {}) {
  await page.goto('/tests/fixtures/shot-timeline.html');
  await page.evaluate(async ({ chapters: chapterList, extraState }) => {
    const { mountShotTimeline } = await import('/shot-timeline.js');
    window.timelineActions = [];
    window.timeline = mountShotTimeline({ onAction: (type, payload) => window.timelineActions.push({ type, payload }) });
    document.querySelector('#fixture').append(window.timeline.element);
    window.timeline.update({ chapters: chapterList, time: 0, duration: 10, playing: false, busy: false, ...extraState });
  }, { chapters, extraState: extra });
}

async function syntheticBegin(page, pointerId = 71) {
  await page.locator('.shot-timeline-range').evaluate((input, id) => {
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: true }));
  }, pointerId);
}

test('shows real unequal chapter positions through one semantic native range', async ({ page }) => {
  await mount(page, { time: 7.4 });
  const control = page.getByRole('slider', { name: 'Rally timeline' });
  await expect(control).toHaveAttribute('min', '0');
  await expect(control).toHaveAttribute('max', '10');
  await expect(control).toHaveAttribute('aria-valuetext', 'Shot 4, Volley, 7.4 seconds of 10.0 seconds');
  await expect(page.locator('.shot-timeline-identity')).toHaveText('Shot 4, Volley');
  await expect(page.locator('[aria-live]')).toHaveCount(0);
  expect(await page.locator('.shot-timeline-target').evaluate(node => node.getBoundingClientRect().height)).toBe(48);
  expect(await page.locator('.shot-timeline-marker').evaluateAll(nodes => nodes.map(node => node.style.getPropertyValue('--shot-marker-position'))))
    .toEqual(['0', '0.22000000000000003', '0.74', '0.74']);
  await expect(page.locator('.shot-timeline-marker.is-current')).toHaveAttribute('data-shot-id', 'drop-b');
});

test('standard range keys seek exact endpoints without a transport stepping action', async ({ page }) => {
  await mount(page, { time: 4 });
  const control = page.getByRole('slider', { name: 'Rally timeline' });
  await control.focus();
  await control.press('End');
  await control.press('Home');
  const actions = await page.evaluate(() => window.timelineActions);
  expect(actions).toEqual([{ type: 'seek', payload: 10 }, { type: 'seek', payload: 0 }]);
  await expect(control).toHaveAttribute('aria-valuetext', 'Shot 1, Serve, 0.0 seconds of 10.0 seconds');
  await expect(page.locator('button')).toHaveCount(0);
});

test('a real track tap seeks through the pointer operation and stays scoped to the control', async ({ page }) => {
  await mount(page, { time: 0 });
  const box = await page.getByRole('slider').boundingBox();
  await page.mouse.move(box.x + box.width * .68, box.y + box.height / 2);
  await page.evaluate(() => {
    window.outerPointerEvents = [];
    document.querySelector('#fixture').addEventListener('pointerdown', () => window.outerPointerEvents.push('down'));
    document.querySelector('#fixture').addEventListener('pointermove', () => window.outerPointerEvents.push('move'));
    document.querySelector('#fixture').addEventListener('pointerup', () => window.outerPointerEvents.push('up'));
  });
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .76, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const result = await page.evaluate(() => ({ actions: window.timelineActions, outer: window.outerPointerEvents, value: Number(document.querySelector('.shot-timeline-range').value) }));
  expect(result.actions[0].type).toBe('scrubBegin');
  expect(result.actions.at(-1).type).toBe('scrubEnd');
  expect(result.actions.slice(1, -1).length).toBeGreaterThan(0);
  expect(result.actions.slice(1, -1).every(action => action.type === 'scrubSeek')).toBe(true);
  expect(result.actions.at(-2).payload.time).toBe(result.value);
  // Engines differ slightly in whether the first range press or the final
  // pointer position wins in synthetic mouse input; both are within this drag.
  expect(result.value).toBeGreaterThan(6.5);
  expect(result.value).toBeLessThan(8);
  expect(result.outer).toEqual([]);
});

test('a pointer scrub keeps one operation identity and ignores stale frame updates', async ({ page }) => {
  await mount(page, { time: 2, playing: true });
  await syntheticBegin(page, 72);
  await page.locator('.shot-timeline-range').evaluate((input, chapterList) => {
    input.value = '8.25';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.timeline.update({ chapters: chapterList, time: 3, duration: 10, playing: true, busy: false });
  }, chapters);
  await expect(page.getByRole('slider')).toHaveValue('8.25');
  await page.locator('.shot-timeline-range').evaluate(input => {
    input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 72, pointerType: 'touch', isPrimary: true }));
  });
  const actions = await page.evaluate(() => window.timelineActions);
  expect(actions).toHaveLength(3);
  expect(actions[0]).toMatchObject({ type: 'scrubBegin' });
  expect(actions[1]).toEqual({ type: 'scrubSeek', payload: { id: actions[0].payload.id, time: 8.25 } });
  expect(actions[2]).toEqual({ type: 'scrubEnd', payload: { id: actions[0].payload.id } });
  expect(actions[0].payload.id).toMatch(/^shot-timeline-\d+$/);
});

test('an explicit paused update during a scrub remains paused when released', async ({ page }) => {
  await mount(page, { time: 3, playing: true });
  await syntheticBegin(page, 73);
  await page.evaluate(chapterList => window.timeline.update({ chapters: chapterList, time: 3, duration: 10, playing: false, busy: false }), chapters);
  await expect(page.locator('.shot-timeline')).toHaveAttribute('data-playing', 'false');
  await page.locator('.shot-timeline-range').evaluate(input => {
    input.value = '6';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 73, pointerType: 'touch', isPrimary: true }));
  });
  const actions = await page.evaluate(() => window.timelineActions);
  expect(actions.at(-1)).toEqual({ type: 'scrubEnd', payload: { id: actions[0].payload.id } });
  expect(await page.locator('.shot-timeline').getAttribute('data-playing')).toBe('false');
});

for (const reason of ['pointercancel', 'lostpointercapture', 'resize', 'second-touch', 'modal']) {
  test(`${reason} cancels the active scrub once and leaves the last coherent sample`, async ({ page }) => {
    await mount(page, { time: 2, playing: true });
    await syntheticBegin(page, 80);
    await page.locator('.shot-timeline-range').evaluate((input, interruption) => {
      input.value = '5.5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (interruption === 'pointercancel') input.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 80, pointerType: 'touch' }));
      else if (interruption === 'lostpointercapture') input.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 80, pointerType: 'touch' }));
      else if (interruption === 'resize') window.dispatchEvent(new Event('resize'));
      else if (interruption === 'second-touch') document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 81, pointerType: 'touch', isPrimary: false }));
      else window.timeline.cancel();
      input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 80, pointerType: 'touch' }));
    }, reason);
    const actions = await page.evaluate(() => window.timelineActions);
    expect(actions.map(action => action.type)).toEqual(['scrubBegin', 'scrubSeek', 'scrubCancel']);
    expect(actions[2].payload.id).toBe(actions[0].payload.id);
    await expect(page.getByRole('slider')).toHaveValue('5.5');
    await expect(page.locator('.shot-timeline')).toHaveAttribute('data-scrubbing', 'false');
  });
}

test('busy and empty states disable seeking and destroy releases the surface', async ({ page }) => {
  await mount(page, { duration: 0, chapters: [], busy: false });
  await expect(page.getByRole('slider')).toBeDisabled();
  await page.evaluate(chapterList => window.timeline.update({ chapters: chapterList, time: 0, duration: 10, playing: false, busy: true }), chapters);
  await expect(page.getByRole('slider')).toBeDisabled();
  await page.evaluate(() => window.timeline.destroy());
  await expect(page.locator('.shot-timeline')).toHaveCount(0);
  expect(await page.evaluate(() => window.timelineActions)).toEqual([]);
});
