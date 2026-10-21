import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleDesktopSpace,
  isEligibleDesktopSpace
} from '../keyboard-shortcuts.js';

function node({ selectors = [], parent = null, editable = false, tabIndex } = {}) {
  return {
    isContentEditable: editable,
    tabIndex,
    matches(selector) { return selectors.includes(selector) || (selector.includes('[tabindex]') && tabIndex != null && tabIndex !== -1); },
    closest(selector) {
      if (selectors.some(value => selector.split(',').map(item => item.trim()).includes(value))) return this;
      return parent?.closest?.(selector) || null;
    }
  };
}

const space = (target, overrides = {}) => ({ key: ' ', code: 'Space', target, ...overrides });

test('accepts one ordinary unmodified Space event from the court', () => {
  const target = node();
  assert.equal(isEligibleDesktopSpace(space(target), { activeElement: target }), true);
});

test('ignores repetition, composition, modifiers, handled events, and other keys', () => {
  const target = node();
  for (const overrides of [
    { repeat: true }, { isComposing: true }, { defaultPrevented: true },
    { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true },
    { key: 'Enter', code: 'Enter' }
  ]) assert.equal(isEligibleDesktopSpace(space(target, overrides), { activeElement: target }), false);
});

test('leaves native and focused controls responsible for Space', () => {
  for (const selectors of [
    ['input'], ['textarea'], ['select'], ['button'], ['[role="slider"]'],
    ['[role="button"]'], ['[tabindex]']
  ]) {
    const target = node({ selectors, tabIndex: selectors.includes('[tabindex]') ? 0 : undefined });
    assert.equal(isEligibleDesktopSpace(space(target), { activeElement: target }), false, selectors.join(','));
  }
  const editable = node({ editable: true });
  assert.equal(isEligibleDesktopSpace(space(editable), { activeElement: editable }), false);
  const child = node({ parent: node({ selectors: ['button'] }) });
  assert.equal(isEligibleDesktopSpace(space(child), { activeElement: child }), false);
});

test('handles an eligible event exactly once and only then prevents scrolling', () => {
  const target = node();
  let calls = 0;
  const event = space(target);
  event.preventDefault = () => { event.defaultPrevented = true; };
  assert.equal(handleDesktopSpace(event, () => { calls += 1; }, { activeElement: target }), true);
  assert.equal(calls, 1);
  assert.equal(event.defaultPrevented, true);
  assert.equal(handleDesktopSpace(event, () => { calls += 1; }, { activeElement: target }), false);
  assert.equal(calls, 1);
});

test('does not handle an ineligible event even when an action is supplied', () => {
  let calls = 0;
  const target = node({ selectors: ['input'] });
  const event = space(target);
  event.preventDefault = () => { throw new Error('must stay native'); };
  assert.equal(handleDesktopSpace(event, () => { calls += 1; }, { activeElement: target }), false);
  assert.equal(calls, 0);
});
