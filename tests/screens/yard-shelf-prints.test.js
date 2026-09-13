/**
 * The yard's My yard shelf draws the grid's own prints (owner's call,
 * 2026-09-13: "go with the prints and have one visual"). The mini planks
 * are gone; the shelf row is a .yard-grid of YardPrints cards in the
 * shelf's own order, a heart pinned to hearted prints, the board under.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

describe('the My yard shelf is prints', () => {
  it('the shelf and the shed rows are yard-grids of YardPrints cards, in the shelf order', async () => {
    const js = await read('screens/library/library.js');
    expect(js).not.toContain('buildMiniPlank');
    expect(js).not.toContain('plank-mini');
    const shelf = js.slice(js.indexOf('function buildMyYardShelf'), js.indexOf('function buildShelfPrint'));
    expect(shelf).toContain("row.className = 'myyard-row yard-grid'");
    expect(shelf).toContain("shedRow.className = 'myyard-row shed-row yard-grid'");
    expect(shelf).toContain('buildShelfPrint(games[i], i)');
    // the shelf keeps ActivityPrefs.orderYard's order: never the grid's shortest-first sort
    expect(shelf).not.toContain('buildGrid(');
    const print = js.slice(js.indexOf('function buildShelfPrint'), js.indexOf('function openActivityDialog'));
    expect(print).toContain('YardPrints.buildCard(game, index, { onClick: openActivityDialog })');
    expect(print).toContain("fav.className = 'yard-heart'");
  });

  it('the stylesheet lost the planks and gained the heart and a full-width board', async () => {
    const css = await read('screens/library/styles.css');
    expect(css).not.toContain('.plank-mini');
    expect(css).toMatch(/\.yard-heart \{[^}]*position: absolute/);
    expect(css).toMatch(/\.myyard-board \{[^}]*width: 100%/);
    // the row must not fight .yard-grid's display: grid
    const row = /\.myyard-row \{([^}]*)\}/.exec(css);
    expect(row).not.toBeNull();
    expect(row[1]).not.toContain('display:');
  });

  it('the yard page loads the prints module before its own script', async () => {
    const html = await read('screens/library/index.html');
    expect(html.indexOf('/shared/yard-prints.js')).toBeGreaterThan(-1);
    expect(html.indexOf('/shared/yard-prints.js')).toBeLessThan(html.indexOf('src="library.js"'));
  });
});
