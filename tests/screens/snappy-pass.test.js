/**
 * The snappiness pass outside the AI (2026-09-20), measured on the live
 * site first (every teacher page cold and warm, unthrottled and on a
 * simulated school wifi; the socket round trips):
 *  - the games list carried every teacher's activity to every page load
 *    (96 of 143 rows, 60 of 92 KB): pages now ask for what they can see;
 *  - the class pages loaded the unminified socket client (38 KB gzipped
 *    against 15) and connected polling-first, so the first emits rode
 *    HTTP (create-room 80 to 210 ms, join 80 to 95) instead of a socket
 *    (about 30 ms);
 *  - the two fonts started only after the stylesheet had parsed.
 * A page that loses one of these silently gets slower; this pins them.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

const PAGES = ['home', 'make', 'designer', 'host', 'player', 'teacher', 'prototype', 'guide'];
const SOCKET_PAGES = ['host', 'player', 'teacher', 'prototype'];

describe('fonts start with the HTML', () => {
  for (const page of PAGES) {
    it(`${page} preloads both fonts before the stylesheet`, async () => {
      const html = await read(`screens/${page}/index.html`);
      const bricolage = html.indexOf('rel="preload" as="font" type="font/woff2" crossorigin href="/shared/fonts/bricolage-grotesque-v9-latin-variable.woff2"');
      const dmSans = html.indexOf('rel="preload" as="font" type="font/woff2" crossorigin href="/shared/fonts/dm-sans-v17-latin-variable.woff2"');
      const css = html.indexOf('href="/shared/totem.css"');
      expect(bricolage).toBeGreaterThan(-1);
      expect(dmSans).toBeGreaterThan(-1);
      expect(bricolage).toBeLessThan(css);
      expect(dmSans).toBeLessThan(css);
    });
  }

  it('the font files are cached for a year (their names carry the version)', async () => {
    const server = await read('server.js');
    expect(server).toMatch(/app\.use\('\/shared\/fonts', express\.static\([^)]*\), \{ maxAge: '365d', immutable: true \}\)\)/);
  });
});

describe('the socket pages', () => {
  for (const page of SOCKET_PAGES) {
    it(`${page} loads the minified socket client`, async () => {
      const html = await read(`screens/${page}/index.html`);
      expect(html).toContain('<script src="/socket.io/socket.io.min.js"></script>');
      expect(html).not.toContain('/socket.io/socket.io.js"');
    });
  }

  for (const [file, decl] of [['screens/host/host.js', 'const socket = '], ['screens/player/player.js', 'const socket = '], ['screens/teacher/teacher.js', 'var socket = '], ['screens/prototype/prototype.js', 'railSocket = ']]) {
    it(`${file} connects websocket first with polling as the fallback`, async () => {
      const js = await read(file);
      expect(js).toContain(decl + "io({ transports: ['websocket', 'polling'], tryAllTransports: true })");
      expect(js).not.toMatch(/=\s*io\(\)\s*;/);
    });
  }
});

describe('the games list is scoped to the visitor', () => {
  it('the route reads ?mine= and answers with ids', async () => {
    const server = await read('server.js');
    expect(server).toContain("import { parseMine, wantedUserIds } from './engine/games-list-scope.js';");
    expect(server).toContain('const mine = parseMine(req.query.mine);');
    expect(server).toContain('res.json({ games: applyFeaturedOverrides(games, overrides), ids });');
    expect(server).toContain('listUserGamesByIdsRepaired(wanted)');
  });

  const MINE = "'/api/games?mine=' + encodeURIComponent(";
  for (const file of ['screens/home/index.html', 'screens/designer/designer.js', 'screens/make/make.js', 'screens/shared/make-it-yours.js', 'screens/prototype/prototype.js']) {
    it(`${file} asks for its own copies, never the whole list`, async () => {
      const src = await read(file);
      expect(src).toContain(MINE);
      expect(src).not.toMatch(/fetch\('\/api\/games'\)/);
    });
  }

  it('the owner console still asks for everything', async () => {
    const lib = await read('screens/library/library.js');
    expect(lib).toContain("fetch('/api/games')");
  });

  it('the copy-id dedupe reads the ids the route sends', async () => {
    const miy = await read('screens/shared/make-it-yours.js');
    expect(miy).toContain('if (data && Array.isArray(data.ids)) knownIds = data.ids.slice();');
    const designer = await read('screens/designer/designer.js');
    expect(designer).toContain('allIds = Array.isArray(data.ids) ? data.ids : allGames.map(function (g) { return g.id; });');
  });
});
