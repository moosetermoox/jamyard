/**
 * The Start here route (2026-09-24): one recommended first run on the
 * home for a teacher who has never pressed Host. A paper card under the
 * how-it-works strip, above the yard: a yellow tag, one line, the page's
 * one red door to Live Poll's make page with from=start, and "or browse
 * the yard" beside it, so browsing stays open. The make page reads
 * from=start: the back link goes home and a yellow line over the doors
 * says what to press first, in the words on that screen. The entry
 * point rides page_viewed's from, so the route can be counted.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

describe('the Start here route', () => {
  it('the home has the card between the how strip and the yard, with the one red door and browsing still open', async () => {
    const html = await read('screens/home/index.html');
    const how = html.indexOf('<section class="how"');
    const start = html.indexOf('<section class="start-here"');
    const yard = html.indexOf('<section class="yard"');
    expect(start).toBeGreaterThan(how);
    expect(start).toBeLessThan(yard);
    const card = html.slice(start, html.indexOf('</section>', start));
    expect(card).toContain('href="/make?game=live-poll&amp;from=start"');
    expect(card).toContain('class="start-door t-red t-lift"');
    expect(card).toContain('href="#yard"');
    expect(card).toContain('Try Live Poll');
    expect(card).toContain('pretend students');
    expect(card).toContain('two minutes');
    // the page's one red at rest: only this door wears it
    const body = html.slice(html.indexOf('<body>'));
    expect((body.match(/t-red/g) || []).length).toBe(1);
    // never a room straight from home, never the code words
    expect(card).not.toContain('/host?');
    expect(card).not.toMatch(/simulat|preview|customize/i);
  });

  it('the card is for a first-time browser only: shipped hidden, shown when nothing says the teacher has been here, remembered once the door is pressed', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toContain('<section class="start-here" id="start-here" aria-label="Start here" hidden>');
    expect(html).toContain('.start-here[hidden] { display: none; }');
    expect(html).toContain("var START_KEY = 'jamyard.startHereDone';");
    expect(html).toContain("localStorage.getItem('jamyard.hostKey') || localStorage.getItem(START_KEY)");
    expect(html).toContain('if (window.MyGames && MyGames.list().length) return false;');
    expect(html).toContain('P.Recents.list().length');
    expect(html).toContain('P.Favorites.list().length');
    expect(html).toContain('if (firstTimeHere()) card.hidden = false;');
    expect(html).toContain("localStorage.setItem(START_KEY, '1');");
    // the host page's key is the one the home reads
    const host = await read('screens/host/host.js');
    expect(host).toContain("localStorage.setItem('jamyard.hostKey', key);");
  });

  it('the make page shows the first-run line only on from=start, in the words on that screen, and the back link goes home', async () => {
    const html = await read('screens/make/index.html');
    expect(html).toContain('id="start-note" hidden');
    const note = html.match(/<span class="doors-note start-note" id="start-note" hidden>([^]*?)<\/span>/);
    expect(note).not.toBeNull();
    expect(note[1]).toContain('Try it with pretend students');
    expect(note[1]).not.toMatch(/simulat|preview|door|fit/i);
    const js = await read('screens/make/make.js');
    expect(js).toContain("if (from === 'start' && el.startNote) el.startNote.hidden = false;");
    expect(js).toContain("if (from === 'home' || from === 'start') el.back.href = '/#yard';");
    const css = await read('screens/make/styles.css');
    expect(css).toContain('.start-note {');
  });

  it('start is an entry point on both sides of the analytics relay', async () => {
    const server = await read('services/analytics.js');
    const client = await read('screens/shared/analytics.js');
    expect(server).toContain("const ENTRY_POINTS = ['home', 'library', 'create', 'share', 'start', 'none'];");
    expect(client).toContain("var ENTRY_POINTS = ['home', 'library', 'create', 'share', 'start'];");
  });
});
