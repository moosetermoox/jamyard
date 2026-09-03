/**
 * Growing text box (library Customize dialogs, 2026-09-02): a one-row
 * textarea that grows downward as the entry gets longer, so a long
 * question is never clipped past the right edge the way an <input> is.
 * Single-line semantics stay: Enter never inserts a newline.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import '../../screens/shared/growing-text.js';

const G = globalThis.GrowingText;

// Minimal element stand-in: the helper only needs a style bag, attributes,
// listeners, and a scrollHeight the test can steer.
function fakeTextarea() {
  const listeners = {};
  return {
    tagName: 'TEXTAREA',
    style: {},
    value: '',
    rows: 2,
    scrollHeight: 0,
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    fire(name, ev) { (listeners[name] || []).forEach(fn => fn(ev || {})); }
  };
}

beforeEach(() => {
  globalThis.document = { createElement: (tag) => { const el = fakeTextarea(); el.tagName = tag.toUpperCase(); return el; } };
  globalThis.requestAnimationFrame = (fn) => fn();
});

describe('GrowingText.create', () => {
  it('returns a one-row textarea with resizing off and the given css', () => {
    const ta = G.create({ css: 'width:100%;', placeholder: 'The question', maxLength: 300 });
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta.rows).toBe(1);
    expect(ta.style.cssText).toContain('width:100%;');
    expect(ta.style.cssText).toContain('resize:none');
    expect(ta.style.cssText).toContain('overflow:hidden');
    expect(ta.placeholder).toBe('The question');
    expect(ta.maxLength).toBe(300);
  });

  it('grows to its scrollHeight on input and shrinks back when text is removed', () => {
    const ta = G.create({ css: '' });
    ta.value = 'a long question that wraps onto a second line';
    ta.scrollHeight = 72;
    ta.fire('input');
    expect(ta.style.height).toBe('72px');
    expect(ta.style.overflow).toBe('hidden'); // clip would break the scrollHeight read
    ta.value = 'short';
    ta.scrollHeight = 38;
    ta.fire('input');
    expect(ta.style.height).toBe('38px');
  });

  it('stays one row while empty, whatever the placeholder would wrap to', () => {
    const ta = G.create({ css: '', placeholder: 'e.g. fractions, the water cycle, Spanish past tense' });
    ta.scrollHeight = 90;
    G.fit(ta);
    expect(ta.style.height).toBe('');
    expect(ta.style.overflow).toBe('clip'); // no placeholder sliver under the padding
    expect(ta.rows).toBe(1);
  });

  it('fits a pre-filled value once mounted', () => {
    const ta = G.create({ css: '', value: 'a long saved question that wraps' });
    ta.scrollHeight = 60;
    G.fit(ta);
    expect(ta.style.height).toBe('60px');
  });

  it('keeps single-line semantics: Enter is swallowed and pasted newlines become spaces', () => {
    const ta = G.create({ css: '' });
    let prevented = false;
    ta.fire('keydown', { key: 'Enter', preventDefault() { prevented = true; } });
    expect(prevented).toBe(true);
    ta.value = 'line one\nline two\r\nline three';
    ta.fire('input');
    expect(ta.value).toBe('line one line two line three');
  });
});
