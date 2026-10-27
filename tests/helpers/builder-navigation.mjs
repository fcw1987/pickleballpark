export async function settleBuilderStartup(page) {
  await page.waitForFunction(() => Boolean(window.playBuilder && !playBuilder.busy));
}

export async function openBuilderMainMenu(page) {
  const menu = page.locator('.builder-main-menu');
  if (!(await menu.evaluate(node => node.open))) {
    await page.getByLabel('Menu', { exact: true }).click();
  }
  return menu;
}

export async function openPlayFileMenu(page) {
  await openBuilderMainMenu(page);
  const files = page.locator('.builder-document-menu');
  if (!(await files.evaluate(node => node.open))) {
    await page.getByLabel('Manage plays', { exact: true }).click();
  }
  return files;
}

export async function openIntentTab(page, name) {
  const details = page.locator('.builder-shot-details');
  if (!(await details.evaluate(node => node.open))) {
    await details.locator(':scope > summary').click();
  }
  const tab = page.getByRole('tab', { name, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  return page.getByRole('tabpanel', { name, exact: true });
}

export async function openCoachTools(page) {
  await openIntentTab(page, 'Coach Tools');
  const tools = page.locator('.builder-assistance');
  if (!(await tools.evaluate(node => node.open))) {
    await tools.locator(':scope > summary').click();
  }
  return tools;
}

// Explicit compatibility API: the primary pixel court has no public 3D toggle.
export async function switchCourtView(page, view) {
  await page.evaluate(view => playBuilder.switchView(view), view);
  await page.waitForFunction(expected => !playBuilder.busy && playBuilder.view === expected, view);
}

export async function chooseShotFamily(page, family) {
  const picker = page.locator('.builder-family-picker');
  if (!(await picker.evaluate(node => node.open))) await picker.locator(':scope > summary').click();
  await picker.getByRole('option', {name:new RegExp(`^${family}:`, 'i')}).click();
  await page.waitForFunction(() => !window.playBuilder?.proposalBusy);
}
