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

  it('the module builds the side column, plays each card once at half in view, and never under reduced motion', async () => {
    const js = await read('screens/shared/yard-prints.js');
    expect(js).toContain("var side = el('div', 'yard-side');");
    expect(js).toContain("var line = opts.describeWith === 'description' ? descriptionOf(g) : whenOf(g);");
    expect(js).toContain('function playOnScroll(container)');
    expect(js).toContain("if (reducedMotion() || typeof IntersectionObserver !== 'function') return;");
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
