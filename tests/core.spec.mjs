import { expect, test } from '@playwright/test';

const APP_PATH = '/index.html?workspace=planner&e2e=1';

async function openApp(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(APP_PATH);
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard))).toBe(true);
  return errors;
}

async function openMenu(page) {
  if (!await page.locator('#menuOverlay').evaluate(element => element.classList.contains('active'))) {
    await page.locator('#menuToggle').click();
  }
}

const playerArtwork = {
  player1: { href: 'assets/players/green-right-handed.png', handedness: 'right' },
  player2: { href: 'assets/players/green-right-handed.png', handedness: 'right' },
  player3: { href: 'assets/players/orange-right-handed.png', handedness: 'right' },
  player4: { href: 'assets/players/orange-right-handed.png', handedness: 'right' }
};

async function appState(page) {
  return page.evaluate(() => ({
    mode: window.pickleboard.currentGameMode,
    checkedMode: document.querySelector('input[name="gameMode"]:checked')?.value,
    positions: window.pickleboard.getTokenPositions(),
    playerClasses: Object.fromEntries([1, 2, 3, 4].map(number => [
      `player${number}`,
      [...document.querySelector(`#player${number}`).classList]
    ])),
    displays: Object.fromEntries([3, 4].map(number => [
      `player${number}`,
      getComputedStyle(document.querySelector(`#player${number}`)).display
    ])),
    hitTargetDisplays: Object.fromEntries([3, 4].map(number => [
      `player${number}`,
      getComputedStyle(document.querySelector(`#player${number}-touch`)).display
    ]))
  }));
}

test('initializes without uncaught JavaScript errors', async ({ page }) => {
  const errors = await openApp(page);
  await page.waitForTimeout(100);
  expect(errors).toEqual([]);
});

test('all four players initialize right handed with expected team artwork', async ({ page }) => {
  const failedPlayerRequests = [];
  page.on('requestfailed', request => {
    if (request.url().includes('/assets/players/')) failedPlayerRequests.push(request.url());
  });
  await openApp(page);

  for (const [playerId, expected] of Object.entries(playerArtwork)) {
    const player = page.locator(`#${playerId}`);
    await expect(player).toHaveAttribute('href', expected.href);
    await expect(player).toHaveAttribute('data-handedness', expected.handedness);
    await expect(player).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    await expect(player).toHaveAttribute('width', String(16 / 3));
    await expect(player).toHaveAttribute('height', String(16 / 3));
  }

  const assetResponses = await page.evaluate(async paths => Promise.all(paths.map(async path => {
    const response = await fetch(path);
    const blob = await response.blob();
    return { path, ok: response.ok, type: blob.type, size: blob.size };
  })), Object.values(playerArtwork).map(artwork => artwork.href));
  expect(assetResponses.every(response => response.ok && response.type === 'image/png' && response.size > 0)).toBe(true);
  expect(failedPlayerRequests).toEqual([]);
});

test('double clicking toggles each player handedness and a second double click restores it', async ({ page }) => {
  await openApp(page);

  for (const [playerId, initial] of Object.entries(playerArtwork)) {
    const hitTarget = page.locator(`#${playerId}-touch`);
    const player = page.locator(`#${playerId}`);
    const toggledHandedness = initial.handedness === 'left' ? 'right' : 'left';
    const teamColor = initial.href.includes('/green-') ? 'green' : 'orange';
    const stateBefore = await page.evaluate(id => ({
      position: window.pickleboard.getTokenPositions()[id],
      mode: window.pickleboard.currentGameMode
    }), playerId);

    await hitTarget.dispatchEvent('dblclick');
    await expect(player).toHaveAttribute('data-handedness', toggledHandedness);
    await expect(player).toHaveAttribute('href', `assets/players/${teamColor}-${toggledHandedness}-handed.png`);
    expect(await page.evaluate(id => window.pickleboard.getTokenPositions()[id], playerId)).toEqual(stateBefore.position);

    await hitTarget.dispatchEvent('dblclick');
    await expect(player).toHaveAttribute('data-handedness', initial.handedness);
    await expect(player).toHaveAttribute('href', initial.href);
    expect(await page.evaluate(id => window.pickleboard.getTokenPositions()[id], playerId)).toEqual(stateBefore.position);
    expect(await page.evaluate(() => window.pickleboard.currentGameMode)).toBe(stateBefore.mode);
  }
});

test('handedness survives game mode changes and Reset while team artwork follows mode', async ({ page }) => {
  await openApp(page);
  await page.locator('#player2').dblclick();
  await expect(page.locator('#player2')).toHaveAttribute('data-handedness', 'left');
  await expect(page.locator('#player2')).toHaveAttribute('href', 'assets/players/green-left-handed.png');

  await page.evaluate(() => window.pickleboard.setGameMode('singles'));
  await expect(page.locator('#player2')).toHaveAttribute('href', 'assets/players/orange-left-handed.png');
  await page.evaluate(() => window.pickleboard.resetPositions());
  await expect(page.locator('#player2')).toHaveAttribute('data-handedness', 'left');
  await expect(page.locator('#player2')).toHaveAttribute('href', 'assets/players/orange-left-handed.png');

  await page.evaluate(() => window.pickleboard.setGameMode('doubles'));
  await expect(page.locator('#player2')).toHaveAttribute('data-handedness', 'left');
  await expect(page.locator('#player2')).toHaveAttribute('href', 'assets/players/green-left-handed.png');
});

test('default ball is visually separate from Player 4 artwork', async ({ page }) => {
  await openApp(page);
  const geometry = await page.evaluate(() => {
    const player = document.querySelector('#player4').getBoundingClientRect();
    const ball = document.querySelector('#ball').getBoundingClientRect();
    return {
      player: { left: player.left, right: player.right, top: player.top, bottom: player.bottom },
      ball: { left: ball.left, right: ball.right, top: ball.top, bottom: ball.bottom },
      ballPosition: window.pickleboard.getTokenPositions().ball
    };
  });

  const overlaps = geometry.player.left < geometry.ball.right &&
    geometry.player.right > geometry.ball.left &&
    geometry.player.top < geometry.ball.bottom &&
    geometry.player.bottom > geometry.ball.top;
  expect(overlaps).toBe(false);
  expect(geometry.ballPosition).toEqual({ x: 19, y: 45 });
});

test('drawing mode remains enabled, creates a stroke, and can be disabled', async ({ page }) => {
  await openApp(page);
  await openMenu(page);

  const toggle = page.locator('#drawToggle');
  const controls = page.locator('#drawControls');
  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#court')).toHaveClass(/drawing-mode/);
  await expect(controls).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.pickleboard.drawingMode)).toBe(true);

  await page.locator('#menuClose').click();
  await expect(page.locator('#menuOverlay')).toBeHidden();
  const court = page.locator('#court');
  const box = await court.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator('#drawingLayer .drawing-stroke')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.pickleboard.drawingPaths.length)).toBe(1);

  await openMenu(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#court')).not.toHaveClass(/drawing-mode/);
  await expect(controls).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.pickleboard.drawingMode)).toBe(false);
});

test('drag keeps the visible token, hit target, and public state synchronized', async ({ page }) => {
  await openApp(page);
  const target = page.locator('#player1-touch');
  const box = await target.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 70, { steps: 8 });
  await page.mouse.up();

  const synchronized = await page.evaluate(() => {
    const visual = document.querySelector('#player1');
    const hitTarget = document.querySelector('#player1-touch');
    const state = window.pickleboard.getTokenPositions().player1;
    return {
      state,
      visualAnchor: { x: Number(visual.dataset.cx), y: Number(visual.dataset.cy) },
      imageOrigin: { x: Number(visual.getAttribute('x')), y: Number(visual.getAttribute('y')) },
      hitTarget: { x: Number(hitTarget.getAttribute('cx')), y: Number(hitTarget.getAttribute('cy')) },
      tracerCount: window.pickleboard.tracerDots.length
    };
  });

  expect(synchronized.visualAnchor).toEqual(synchronized.state);
  expect(synchronized.imageOrigin).toEqual({
    x: synchronized.state.x - 8 / 3,
    y: synchronized.state.y - 8 / 3
  });
  expect(synchronized.hitTarget).toEqual(synchronized.state);
  expect(synchronized.tracerCount).toBeGreaterThan(0);
  expect(synchronized.state).not.toEqual({ x: 5, y: -1 });
});

test('singles and doubles preserve expected positions, visibility, and teams', async ({ page }) => {
  await openApp(page);
  await openMenu(page);
  await page.locator('input[value="singles"]').check();

  let state = await appState(page);
  expect(state.mode).toBe('singles');
  expect(state.checkedMode).toBe('singles');
  expect(state.positions).toEqual({
    player1: { x: 5, y: -1 }, player2: { x: 15, y: 45 },
    player3: { x: 5, y: 36 }, player4: { x: 15, y: 36 }, ball: { x: 19, y: 45 }
  });
  expect(state.displays).toEqual({ player3: 'none', player4: 'none' });
  expect(state.hitTargetDisplays).toEqual({ player3: 'none', player4: 'none' });
  expect(state.playerClasses.player1).toContain('team1-player');
  expect(state.playerClasses.player2).toContain('team2-player');

  await page.locator('input[value="doubles"]').check();
  state = await appState(page);
  expect(state.mode).toBe('doubles');
  expect(state.checkedMode).toBe('doubles');
  expect(state.positions).toEqual({
    player1: { x: 5, y: -1 }, player2: { x: 15, y: 14 },
    player3: { x: 5, y: 45 }, player4: { x: 15, y: 45 }, ball: { x: 19, y: 45 }
  });
  expect(state.displays).toEqual({ player3: 'block', player4: 'block' });
  expect(state.hitTargetDisplays).toEqual({ player3: 'block', player4: 'block' });
  expect(state.playerClasses.player1).toContain('team1-player');
  expect(state.playerClasses.player2).toContain('team1-player');
  expect(state.playerClasses.player3).toContain('team2-player');
  expect(state.playerClasses.player4).toContain('team2-player');
});

test('programmatic mode changes synchronize controls and reset uses authoritative mode', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    window.pickleboard.setGameMode('singles');
    window.pickleboard.setTokenPosition('player1', 10, 10);
    window.pickleboard.resetPositions();
    const visual = document.querySelector('#player1');
    return {
      mode: window.pickleboard.currentGameMode,
      checkedMode: document.querySelector('input[name="gameMode"]:checked').value,
      player1: window.pickleboard.getTokenPositions().player1,
      player1VisualAnchor: { x: Number(visual.dataset.cx), y: Number(visual.dataset.cy) },
      player1ImageOrigin: { x: Number(visual.getAttribute('x')), y: Number(visual.getAttribute('y')) },
      player3Display: getComputedStyle(document.querySelector('#player3')).display
    };
  });

  expect(result).toEqual({
    mode: 'singles',
    checkedMode: 'singles',
    player1: { x: 5, y: -1 },
    player1VisualAnchor: { x: 5, y: -1 },
    player1ImageOrigin: { x: 5 - 8 / 3, y: -1 - 8 / 3 },
    player3Display: 'none'
  });
  await expect(page.evaluate(() => window.pickleboard.setGameMode('invalid'))).resolves.toBe(false);
});

test('theme switches and restores the stored preference', async ({ page }) => {
  await page.goto('/tests/fixtures/cache-setup.html');
  await page.evaluate(() => localStorage.setItem('pickleboard-theme', 'dark'));
  await openApp(page);
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');

  await openMenu(page);
  await page.locator('#themeToggle').click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pickleboard-theme'))).toBe('light');

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
});
