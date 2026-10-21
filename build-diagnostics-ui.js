import { createBuildDiagnostics } from './build-diagnostics.js';
import { buildIdentityLabel } from './build-identity.js';

// The controller snapshots embedded metadata once. Opening Help or fetching a
// new endpoint cannot change the identity this running page was loaded with.
export function mountBuildDiagnostics(element) {
  const controller = createBuildDiagnostics();
  const label = element.querySelector('[data-running-build]');
  const report = element.querySelector('pre');
  const status = element.querySelector('[role="status"]');
  const compare = element.querySelector('[data-check-server]');
  const copy = element.querySelector('[data-copy-build]');
  const details = element.querySelector('details');
  label.textContent = buildIdentityLabel(controller.running);
  const render = () => { report.textContent = controller.report(); };
  render();
  compare.addEventListener('click', async () => {
    compare.disabled = true;
    status.textContent = 'Checking server build…';
    try {
      const result = await controller.queryServerBuild();
      render();
      status.textContent = result.server?.identity
        ? 'Server metadata received. The Running build above is unchanged.'
        : 'Server build unavailable. The Running build above is unchanged.';
      details.open = true;
    } finally { compare.disabled = false; }
  });
  copy.addEventListener('click', async () => {
    const result = await controller.copy();
    status.textContent = result.ok ? 'Build diagnostics copied.' : 'Copy is unavailable. Select and copy the diagnostic text below.';
    details.open = true;
    render();
  });
  return Object.freeze({ controller, open() {
    element.scrollIntoView({block:'nearest'});
    element.querySelector('h3').focus({preventScroll:true});
  } });
}
