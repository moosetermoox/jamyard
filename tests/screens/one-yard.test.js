/**
 * One yard (owner, 2026-09-13: "maybe the homepage becomes the yard and
 * there's just one place to view the activities"). The home page IS the
 * yard: the teacher's shelf (shared/my-yard.js) above the grid of prints,
 * the search beside the chips, deep links on the home. The old yard page
 * is the owner's curation console, reached through /owner; every other
 * visit redirects. Every "back to the yard" link points at the home's
 * yard section.
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else if (/\.(js|html)$/.test(entry.name)) out.push(p);
  }
  return out;
}

describe('the home is the yard', () => {
  it('carries the shelf section above the grid, the search in the head, and the yard named plainly', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toContain('<section class="myyard-section" id="my-yard" hidden aria-label="My yard"></section>');
    expect(html.indexOf('id="my-yard"')).toBeLessThan(html.indexOf('id="yard"'));
    expect(html).toContain('<h2>The yard</h2>');
    expect(html).not.toContain('The whole yard</h2>');
    expect(html).toContain('id="yard-search"');
    expect(html).toContain('MyYard.split(games, { query: query })');
    expect(html).toContain('MyYard.buildShelf(mine, shed, { onOpen: openShelfPopup, onChange: onShelfChange })');
    expect(html).toContain('function handleDeepLinks');
    for (const dep of ['/shared/my-yard.css', '/shared/my-yard.js', '/shared/activity-prefs.js', '/shared/owner-mode.js', '/shared/host-launch.js']) {
      expect(html, dep).toContain(dep);
    }
    // the modules load before the page's own script
    const inline = html.indexOf('// ── The planks, the projector, and the yard');
    expect(inline).toBeGreaterThan(-1);
    for (const dep of ['/shared/my-yard.js', '/shared/activity-prefs.js', '/shared/host-launch.js', '/shared/yard-prints.js']) {
      expect(html.indexOf('<script src="' + dep + '"'), dep + ' before the page script').toBeLessThan(inline);
    }
  });

  it('a search that matches nothing anywhere shows everything with an honest line; a shelf hit is never called nothing', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toContain('var shelfHit = mine.length + shed.length > 0;');
    expect(html).toContain('if (pool.length === 0 && query && !shelfHit) {');
    expect(html).toContain('Nothing mentions "');
    expect(html).toContain('Nothing else mentions "');
  });

  it('landing on /#yard jumps to the activities once the list is in (the section is hidden before that)', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toContain('function settleHash()');
    expect(html).toMatch(/settleHash\(\);\s*handleDeepLinks\(\);/);
    // your things first: the shelf when there is one
    expect(html).toContain("(hash === '#yard' && !myYardEl.hidden) ? myYardEl");
  });

  it('the shelf is headed "My yard" above its prints, never labelled under them', async () => {
    const js = await read('screens/shared/my-yard.js');
    expect(js).toContain("head.appendChild(el('h2', null, 'My yard'))");
    expect(js.indexOf("'myyard-head'")).toBeLessThan(js.indexOf("'myyard-row yard-grid'"));
    expect(js).not.toContain('pile-tag');
    const css = await read('screens/shared/my-yard.css');
    expect(css).not.toContain('.pile-tag');
  });
});

describe('the shelf module', () => {
  it('splits by the one-place rule and draws prints with tools; play hosts through HostLaunch; the bin only where delete is allowed', async () => {
    const js = await read('screens/shared/my-yard.js');
    for (const fn of ['function split(', 'function buildShelf(', 'function buildShelfPrint(', 'function shelfTool(', 'function openDialog(', 'function deleteOwnGame(', 'function copyShareLink(']) {
      expect(js).toContain(fn);
    }
    expect(js).toContain('P.orderYard(recent.concat(hearts, copies)');
    expect(js).toContain("row = el('div', 'myyard-row yard-grid')");
    expect(js).toContain('YardPrints.buildCard(game, index,');
    // the tools sit beside the card (a button), never nested inside it
    expect(js).toContain("item = el('div', 'shelf-item')");
    expect(js).toContain('item.appendChild(card)');
    expect(js).toContain('item.appendChild(tools)');
    expect(js).toContain("shelfTool('a', 'play'");
    expect(js).toContain('HostLaunch.launch(game.id)');
    expect(js).toContain("shelfTool('a', 'pen'");
    expect(js).toContain("shelfTool('button', 'heart'");
    expect(js).toMatch(/if \(editable\) \{\s*var bin = shelfTool\('button', 'bin'/);
    // share from the shelf (18d), own copies only, the popup's link
    expect(js).toMatch(/if \(isOwn\(game\.id\)\) \{\s*var share = shelfTool\('button', 'share'/);
    expect(js).toContain('copyShareLink(game.id, share, flashTool(share))');
    // drawn marks, built with the DOM: no innerHTML anywhere in the module
    expect(js).not.toContain('innerHTML');
    expect(js).toContain("document.createElementNS(NS, 'svg')");
    for (const k of ['play', 'pen', 'heart', 'share', 'bin']) expect(js).toContain(k + ': { d:');
  });

  it('its stylesheet makes the shelf row a yard grid, a print fill its column, and the tools sit on the paper', async () => {
    const css = await read('screens/shared/my-yard.css');
    expect(css).toContain('.shelf-item .yard-card { width: 100%; }');
    // the tools sit under the name row (18d), no longer on the paper
    expect(css).not.toContain('padding-bottom: 40px');
    expect(css).toMatch(/\.shelf-tools \{[^}]*margin-top: 8px/);
    expect(css).not.toMatch(/\.shelf-tools \{[^}]*position: absolute/);
    expect(css).toMatch(/\.shelf-tool \{[^}]*width: 24px/);
    expect(css).toContain('.shelf-tool-heart[aria-pressed="true"] path { fill: currentColor; }');
    expect(css).toMatch(/\.myyard-board \{[^}]*width: 100%/);
    const row = /\.myyard-row \{([^}]*)\}/.exec(css);
    expect(row).not.toBeNull();
    expect(row[1]).not.toContain('display:');
  });
});

describe('the old yard page is the owner console', () => {
  it('library.js sends anyone but the owner to the home yard and keeps only the curation grid', async () => {
    const js = await read('screens/library/library.js');
    expect(js).toContain("window.location.replace('/#yard')");
    for (const gone of ['function buildMyYardShelf', 'function buildShelfPrint', 'function openActivityDialog', 'function copyShareLink', 'function renderSetupCard', 'handleAboutDeepLink', 'MakeItYours']) {
      expect(js, gone).not.toContain(gone);
    }
    expect(js).toContain('function buildCard(');
    expect(js).toContain('function toggleFeatured(');
    const html = await read('screens/library/index.html');
    expect(html).not.toContain('make-it-yours');
    expect(html).not.toContain('teacher-setup');
  });

  it('the server redirects /library to the home yard with its deep links, except the owner doorway', async () => {
    const server = await read('server.js');
    expect(server).toContain("app.get(['/library', '/library/'], (req, res, next) => {");
    expect(server).toContain("if (params.get('owner') === '1') return next();");
    expect(server).toContain("for (const key of ['about', 'highlight', 'q'])");
    expect(server).toContain("res.redirect('/' + (qs ? '?' + qs : '') + '#yard');");
    expect(server).toContain("res.redirect('/?about=' + encodeURIComponent(req.params.gameId) + '#yard');");
    expect(server).toContain("app.get('/share', (req, res) => res.redirect('/#yard'));");
    expect(server).toContain("res.redirect('/library?owner=1');");
  });
});

describe('every way back to the yard is the home', () => {
  it('no screen links to /library any more (the owner doorway is a server route)', async () => {
    const files = await walk(join(ROOT.pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'screens'));
    for (const f of files) {
      if (/[\\/]screens[\\/]library[\\/]/.test(f) || /[\\/]shots[\\/]/.test(f)) continue;
      const text = await readFile(f, 'utf8');
      const code = text.split('\n').filter((line) => !/^\s*(\/\/|\*|<!--)/.test(line)).join('\n');
      expect(code, f).not.toMatch(/["'`]\/library(\?[^"'`]*)?["'`]/);
    }
  });
});
