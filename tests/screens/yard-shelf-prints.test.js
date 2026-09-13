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
  });

  it('every shelf print carries tiny tools: play hosts through HostLaunch, pen, heart; the bin only where delete is allowed', async () => {
    const js = await read('screens/library/library.js');
    const print = js.slice(js.indexOf('function buildShelfPrint'), js.indexOf('function openActivityDialog'));
    // the tools sit beside the card (a button), never nested inside it
    expect(print).toContain("item.className = 'shelf-item'");
    expect(print).toContain('item.appendChild(card)');
    expect(print).toContain('item.appendChild(tools)');
    expect(print).toContain("shelfTool('a', 'play'");
    expect(print).toContain('HostLaunch.launch(game.id)');
    expect(print).toContain("shelfTool('a', 'pen'");
    expect(print).toContain("'/designer/edit?game=' + encodeURIComponent(game.id)");
    expect(print).toContain("'/make?game=' + encodeURIComponent(game.id)");
    expect(print).toContain("shelfTool('button', 'heart'");
    expect(print).toContain('Favorites.toggle(game.id)');
    expect(print).toMatch(/if \(own \|\| ownerOn\) \{\s*var bin = shelfTool\('button', 'bin'/);
    expect(print).toContain('deleteOwnGame(game)');
    // drawn marks, no emoji, built with the DOM (no innerHTML)
    expect(print).not.toContain('innerHTML');
    expect(print).toContain("document.createElementNS(NS, 'svg')");
    for (const k of ['play', 'pen', 'heart', 'bin']) expect(print).toContain(k + ': { d:');
  });

  it('the stylesheet lost the planks and gained the tools and a full-width board', async () => {
    const css = await read('screens/library/styles.css');
    expect(css).not.toContain('.plank-mini');
    expect(css).toMatch(/\.shelf-tool \{[^}]*width: 24px/);
    // the tools sit on the paper: a taller bottom margin, the row placed in it
    expect(css).toContain('.shelf-item .yard-print { padding-bottom: 40px; }');
    // the card is a button: its auto width is its content, so a long name
    // made a 1978px print until the wrapper told it to fill the column
    expect(css).toContain('.shelf-item .yard-card { width: 100%; }');
    expect(css).toMatch(/\.shelf-tools \{[^}]*position: absolute/);
    expect(css).toContain('.shelf-tool-heart[aria-pressed="true"] path { fill: currentColor; }');
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
