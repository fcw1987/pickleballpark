/**
 * Small, DOM-independent guards for desktop playback shortcuts.
 *
 * The builder supplies the action.  Keeping the eligibility check here means
 * Space has one policy wherever the builder installs the document listener,
 * while native controls continue to own their own keyboard interaction.
 */

const CONTROL_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'summary',
  'option',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function matches(node, selector) {
  return Boolean(node && typeof node.matches === 'function' && node.matches(selector));
}

function hasControlAncestor(node) {
  if (!node) return false;
  if (matches(node, CONTROL_SELECTOR)) return true;
  return typeof node.closest === 'function' && Boolean(node.closest(CONTROL_SELECTOR));
}

function isEditable(node) {
  if (!node) return false;
  if (node.isContentEditable === true) return true;
  return Boolean(typeof node.closest === 'function' && node.closest('[contenteditable=""], [contenteditable="true"]'));
}

function hasModifier(event) {
  return Boolean(event?.altKey || event?.ctrlKey || event?.metaKey || event?.shiftKey);
}

/**
 * Return true only for the unmodified desktop Spacebar gesture owned by the
 * playback surface. `activeElement` is injectable to keep this helper pure
 * and straightforward to test without a browser document.
 */
export function isEligibleDesktopSpace(event, { activeElement = event?.target } = {}) {
  if (!event || (event.key !== ' ' && event.key !== 'Spacebar' && event.code !== 'Space')) return false;
  if (event.repeat || event.isComposing || event.defaultPrevented || hasModifier(event)) return false;
  const target = event.target || activeElement;
  if (isEditable(target) || isEditable(activeElement)) return false;
  if (hasControlAncestor(target) || hasControlAncestor(activeElement)) return false;
  return true;
}

/**
 * Handle a single eligible Spacebar event. The action receives no arguments
 * so callers can route it to their existing Play/Pause command exactly once.
 * The return value reports whether this helper handled the event.
 */
export function handleDesktopSpace(event, action, options = {}) {
  if (!isEligibleDesktopSpace(event, options)) return false;
  if (typeof action !== 'function') return false;
  event.preventDefault();
  action();
  return true;
}

// Descriptive aliases keep the policy easy to discover for callers and tests.
export const shouldHandleDesktopSpace = isEligibleDesktopSpace;
export const isDesktopSpacebar = isEligibleDesktopSpace;

export { CONTROL_SELECTOR };
