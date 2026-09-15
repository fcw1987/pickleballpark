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
    await page.getByLabel('Play file', { exact: true }).click();
  }
  return files;
}

export async function openIntentTab(page, name) {
  const details = page.locator('.builder-shot-details');
  if (!(await details.evaluate(node => node.open))) {
    await page.getByText('Edit by intent', { exact: true }).click();
  }
  const tab = page.getByRole('tab', { name, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  return page.getByRole('tabpanel', { name: `${name} settings`, exact: true });
}

export async function openCoachTools(page) {
  await openIntentTab(page, 'Coach Tools');
  const tools = page.locator('.builder-assistance');
  if (!(await tools.evaluate(node => node.open))) {
    await tools.locator(':scope > summary').click();
  }
  return tools;
}

export async function switchCourtView(page, view) {
  const label = `Switch to ${view.toUpperCase()} court view`;
  const button = page.getByRole('button', { name: label, exact: true });
  await button.click();
  await page.waitForFunction(expected => !playBuilder.busy && playBuilder.view === expected, view);
}
