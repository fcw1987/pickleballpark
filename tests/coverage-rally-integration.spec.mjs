import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.playBuilder?.view === '3d' && !playBuilder.busy && pickleboard.threeD?.worldAssetsReady);
  await page.evaluate(() => playBuilder.pause());
}

test('installed coverage shares seed-2 service roles, bounce facts and world samples through scrub and orbit', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  expect((await page.evaluate(() => playBuilder.action('randomRally', { count: 7, seed: 2 }))).ok).toBe(true);
  await page.getByRole('button', { name: 'Player coverage', exact: true }).click();
  const result = await page.evaluate(async () => {
    const { worldToBoard, FEET_TO_METERS } = await import('/three-d-core.js');
    const builder = playBuilder, view = pickleboard.threeD, source = JSON.stringify(builder.document);
    const sample = time => {
      builder.seek(time); view.renderSessionSample();
      const context = { timeSeconds: builder.session.clock.elapsed, ball: view.sampleBall(time), samples: view.coverageSamples };
      return { snapshot: pickleboard.coverageSnapshotProvider(context), overlay: structuredClone(view.playerCoverage.getDiagnostics()),
        actors: [...view.playerObjects].map(([id, actor]) => ({ id, position: worldToBoard(actor.position) })),
        ball: { ...worldToBoard(view.ballObject.position), heightFeet: view.ballObject.position.y / FEET_TO_METERS } };
    };
    const bounce = builder.compiled.timeline.events.find(event => event.type === 'bounce' && event.rallyLeg === 1);
    const returned = builder.compiled.timeline.events.filter(event => event.type === 'contact')[1];
    const beforeBounce = sample(bounce.time - .001), afterBounce = sample(bounce.time + .001);
    const afterReturn = sample(returned.time + .001);
    const beforeOrbit = sample(bounce.time - .001);
    for (const azimuth of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      view.cameraControls.setState({ azimuth, elevation: 50, distance: 21, target: { x: 0, y: .6, z: 0 } });
    }
    const afterOrbit = sample(bounce.time - .001);
    sample(returned.time + .1);
    const scrubbedBack = sample(bounce.time - .001);
    return { beforeBounce, afterBounce, afterReturn, beforeOrbit, afterOrbit, scrubbedBack,
      unchanged: JSON.stringify(builder.document) === source, valid: builder.compiled.validShotCount,
      returnActor: returned.actor, matchingState: pickleboard.plays.timeline.play === pickleboard.plays.activePlay };
  });
  expect(result.valid).toBe(7); expect(result.returnActor).toBe('player3'); expect(result.matchingState).toBe(true);
  expect(result.beforeBounce.snapshot.legalReceiverId).toBe('player3');
  expect(result.beforeBounce.snapshot.eligibleHitters).toEqual(['player3']);
  expect(result.beforeBounce.snapshot.mustBounceBeforeContact).toBe(true);
  expect(result.afterBounce.snapshot.mustBounceBeforeContact).toBe(false);
  expect(result.afterReturn.snapshot.legalReceiverId).toBeNull();
  expect(result.afterReturn.snapshot.eligibleHitters).toEqual(['player1', 'player2']);
  for (const sample of [result.beforeBounce, result.afterBounce, result.afterReturn]) {
    expect(sample.overlay.source).toBe('rally-intelligence'); expect(sample.overlay.enabled).toBe(true);
    expect(sample.overlay.sectors).toHaveLength(4);
    for (const actor of sample.actors) {
      const sector = sample.overlay.sectors.find(sector => sector.id === actor.id);
      const tactical = sample.snapshot.players.find(player => player.id === actor.id);
      expect(sector.position).toEqual(actor.position);
      expect(sector.direction.x).toBeCloseTo(tactical.coverageFacing.x, 12);
      expect(sector.direction.y).toBeCloseTo(tactical.coverageFacing.y, 12);
      expect(sector.legalReceiver).toBe(tactical.legalReceiver);
    }
    for (const coordinate of ['x', 'y', 'heightFeet']) expect(sample.overlay.ball[coordinate]).toBeCloseTo(sample.ball[coordinate], 9);
  }
  expect(result.afterOrbit).toEqual(result.beforeOrbit); expect(result.scrubbedBack).toEqual(result.beforeOrbit);
  expect(result.unchanged).toBe(true); expect(errors).toEqual([]);
});

test('the live provider follows import, handedness Undo and reload while preserving manual pins and shared coverage', async ({ page }) => {
  await open(page);
  const imported = await page.evaluate(async () => {
    await playBuilder.action('template', 'dink-exchange');
    const document = structuredClone(playBuilder.document);
    document.title = 'Integrated coverage with authored pin';
    document.players.player3.handedness = 'left';
    document.shots[0].playerMovement ??= {};
    document.shots[0].playerMovement.player2 = { intent: 'manual', pinned: true, target: { ...document.initialLayout.player2 } };
    await playBuilder.action('import', JSON.stringify(document));
    playBuilder.seek(.7);
    return structuredClone(playBuilder.document);
  });
  await page.getByRole('button', { name: 'Player coverage', exact: true }).click();
  const result = await page.evaluate(async () => {
    const { sharedCoverageAt } = await import('/player-coverage.js');
    const sample = () => { playBuilder.seek(.7); pickleboard.threeD.renderSessionSample(); return structuredClone(pickleboard.threeD.playerCoverage.getDiagnostics()); };
    const before = sample(), shared = new Set();
    for (let x = .5; x < 20; x += .5) for (let y = .5; y < 44; y += .5) {
      for (const team of sharedCoverageAt(before.sectors, { x, y })) shared.add(team);
    }
    await playBuilder.action('handedness', { id: 'player3', value: 'right' });
    const changed = sample();
    await playBuilder.action('undo');
    const restored = sample();
    return { before, changed, restored, shared: [...shared], document: structuredClone(playBuilder.document),
      exported: JSON.parse(playBuilder.store.exportJSON(playBuilder.document)), saveError: playBuilder.saveError };
  });
  expect(result.before.source).toBe('rally-intelligence'); expect(result.shared.length).toBeGreaterThan(0);
  expect(result.before.sectors.find(player => player.id === 'player3').handedness).toBe('left');
  expect(result.changed.sectors.find(player => player.id === 'player3').handedness).toBe('right');
  expect(result.restored).toEqual(result.before); expect(result.document).toEqual(imported);
  expect(result.exported).toEqual(imported); expect(result.saveError).toBeNull();
  await page.reload();
  await page.waitForFunction(() => pickleboard.threeD?.worldAssetsReady && !playBuilder.busy);
  await expect(page.getByRole('button', { name: 'Player coverage', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => playBuilder.document)).toEqual(imported);
  expect(await page.evaluate(() => pickleboard.threeD.playerCoverage.getDiagnostics().source)).toBe('rally-intelligence');
});

test('leaving the builder cannot apply its tactical state to an unrelated planner and returning restores it', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Player coverage', exact: true }).click();
  const result = await page.evaluate(async () => {
    const before = structuredClone(playBuilder.document), provider = pickleboard.coverageSnapshotProvider;
    await playBuilder.setWorkspace('planner');
    const outside = provider({ timeSeconds: 0 });
    await playBuilder.setWorkspace('builder');
    playBuilder.seek(.5); pickleboard.threeD.renderSessionSample();
    return { outside, sameProvider: provider === pickleboard.coverageSnapshotProvider,
      source: pickleboard.threeD.playerCoverage.getDiagnostics().source,
      unchanged: JSON.stringify(before) === JSON.stringify(playBuilder.document) };
  });
  expect(result).toEqual({ outside: null, sameProvider: true, source: 'rally-intelligence', unchanged: true });
});
