/**
 * The yard one across (owner 2026-10-05, after session recordings showed
 * visitors looking at sixteen small tiles and clicking nothing): one card
 * per row, a bigger mat, the activity's description beside it, every card
 * playing its hover once as it scrolls into view, and a click straight to
 * the make page (the popup's map is already there).
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

describe('the home yard, one across', () => {
  it('the grid carries the one-up classes and the render call asks for words, scroll plays, and plain links', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toContain('<div class="yard-grid yard-two-up yard-one-up" id="yard-grid"></div>');
    expect(html).toContain('onClick: null,');
    expect(html).toContain('describe: true,');
    expect(html).toContain("describeWith: 'description',");
    expect(html).toContain('playOnScroll: true,');
    expect(html).toContain('href: makeHref');
  });

  it('the module builds the side column and plays a card at half in view (motion rules in the phone block below)', async () => {
    const js = await read('screens/shared/yard-prints.js');
    expect(js).toContain("var side = el('div', 'yard-side');");
    expect(js).toContain("var line = opts.describeWith === 'description' ? descriptionOf(g) : whenOf(g);");
    expect(js).toContain('function playOnScroll(container)');
    expect(js).toContain("if (reducedMotion() || typeof IntersectionObserver !== 'function') {");
    expect(js).toContain('var SCROLL_PLAY_AT = 0.5;');
    expect(js).toContain('if (opts.playOnScroll) playOnScroll(container);');
    // a card with words goes straight through on touch, and says where it goes
    expect(js).toContain("if (!opts.describe && noHover() && !card.classList.contains('on')) {");
    expect(js).toContain("(opts.onClick ? ', see what it is' : ', make it yours')");
  });

  it('the stylesheet: one column, a 420px mat and a 260px window, smaller under 960, stacked on a phone', async () => {
    const css = await read('screens/shared/yard-prints.css');
    expect(css).toMatch(/\.yard-grid\.yard-one-up\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.yard-one-up \.yard-print\s*\{\s*flex:\s*0 0 420px/);
    expect(css).toMatch(/\.yard-one-up \.yard-window\s*\{\s*height:\s*260px/);
    expect(css).toMatch(/max-width: 960px\)[\s\S]*\.yard-one-up \.yard-print \{ flex: 0 0 300px; \}/);
    expect(css).toMatch(/max-width: 600px\)[\s\S]*\.yard-two-up \.yard-card \{ flex-direction: column;/);
  });
});

describe('the scroll play on a phone (owner 2026-10-06: blank the second time)', () => {
  // A stub IntersectionObserver and matchMedia drive the real module
  async function load({ hover = true, reduced = false } = {}) {
    globalThis.window = globalThis;
    const observers = [];
    globalThis.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; this.unobserved = []; observers.push(this); }
      observe() {}
      unobserve(el) { this.unobserved.push(el); }
    };
    globalThis.matchMedia = (q) => ({ matches: (q.includes('hover: none') && !hover) || (q.includes('reduced-motion') && reduced) });
    delete globalThis.YardPrints;
    const { vi } = await import('vitest');
    vi.resetModules();
    await import('../../screens/shared/yard-prints.js');
    return { YP: globalThis.YardPrints, observers };
  }
  function fakeCards(n) {
    return Array.from({ length: n }, () => {
      const set = new Set();
      return {
        isConnected: true,
        classList: { contains: (c) => set.has(c), toggle: (c, on) => { on ? set.add(c) : set.delete(c); } },
        matches: () => false, querySelector: () => null, style: { setProperty() {} }
      };
    });
  }
  function fakeGrid(cards) {
    return { querySelectorAll: () => cards };
  }

  it('on a touch screen a card stays on after it plays, so scrolling back never finds it blank', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    const { YP, observers } = await load({ hover: false });
    const cards = fakeCards(2);
    YP._playOnScroll(fakeGrid(cards));
    observers[0].cb([{ target: cards[0], isIntersecting: true }]);
    expect(cards[0].classList.contains('on')).toBe(true);
    vi.advanceTimersByTime(10000);
    observers[0].cb([{ target: cards[0], isIntersecting: false }]);
    observers[0].cb([{ target: cards[0], isIntersecting: true }]);
    expect(cards[0].classList.contains('on')).toBe(true);
    expect(observers[0].unobserved).toContain(cards[0]);
    vi.useRealTimers();
  });

  it('with a mouse a card settles, then plays again when it comes back into view', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    const { YP, observers } = await load({ hover: true });
    const cards = fakeCards(1);
    YP._playOnScroll(fakeGrid(cards));
    const io = observers[0];
    io.cb([{ target: cards[0], isIntersecting: true }]);
    expect(cards[0].classList.contains('on')).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(cards[0].classList.contains('on')).toBe(false);
    io.cb([{ target: cards[0], isIntersecting: false }]);
    io.cb([{ target: cards[0], isIntersecting: true }]);
    expect(cards[0].classList.contains('on')).toBe(true);
    vi.useRealTimers();
  });

  it('a touch screen with reduced motion shows every card on from the start', async () => {
    const { YP } = await load({ hover: false, reduced: true });
    const cards = fakeCards(3);
    YP._playOnScroll(fakeGrid(cards));
    expect(cards.every((c) => c.classList.contains('on'))).toBe(true);
  });
});
