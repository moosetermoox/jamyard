/**
 * The yard, 17g (design handoff 2026-09-22): seventeen cards a teacher can
 * tell apart without reading. A card is a name, a colour square for the
 * need, and a pictogram of the mechanic built from blocks; no prompt
 * sentence, no meta line at rest. The prompt appears only on hover, when
 * the pictogram slides up and its arrival block lands. Paper time marks
 * pin to the first card of each duration step. Touch: first tap previews,
 * second opens. The first card plays its hover once on load.
 *
 * These run the two modules against a small fake document (no DOM
 * library in the test setup) and grep the page for the wiring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

// ── A fake document: just enough for createElement-built cards ──
function makeNode(tag) {
  const node = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    children: [],
    parentNode: null,
    attrs: {},
    listeners: {},
    isConnected: true,
    style: {
      props: {},
      setProperty(k, v) { this.props[k] = v; },
      getPropertyValue(k) { return this.props[k] || ''; }
    },
    get classList() {
      const self = this;
      return {
        add(c) { const s = new Set(self.className.split(/\s+/).filter(Boolean)); s.add(c); self.className = [...s].join(' '); },
        remove(c) { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
        toggle(c, force) { const has = this.contains(c); if (force === undefined ? has : !force) this.remove(c); else this.add(c); },
        contains(c) { return self.className.split(/\s+/).includes(c); }
      };
    },
    get firstChild() { return this.children[0] || null; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    matches(sel) { return sel === ':hover' ? !!this.hovered : false; },
    querySelectorAll(sel) { return all(this).filter((n) => matchesSel(n, sel)); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  };
  return node;
}
function all(node) {
  const out = [];
  for (const c of node.children) { out.push(c); out.push(...all(c)); }
  return out;
}
// Class selectors only: ".a", ".a.b", ".a:not(.b)", ".a .b" (descendant)
function matchesSel(node, sel) {
  const parts = sel.trim().split(/\s+/);
  const last = parts.pop();
  if (!matchesCompound(node, last)) return false;
  if (parts.length === 0) return true;
  for (let p = node.parentNode; p; p = p.parentNode) if (matchesSel(p, parts.join(' '))) return true;
  return false;
}
function matchesCompound(node, sel) {
  const classes = node.className.split(/\s+/).filter(Boolean);
  const not = /:not\(\.([\w-]+)\)/.exec(sel);
  const base = sel.replace(/:not\([^)]*\)/, '');
  const need = base.split('.').filter(Boolean);
  if (!need.every((c) => classes.includes(c))) return false;
  if (not && classes.includes(not[1])) return false;
  return true;
}

async function loadModules(opts = {}) {
  globalThis.window = globalThis;
  globalThis.document = { createElement: makeNode };
  globalThis.matchMedia = (q) => ({ matches: q.includes('hover: none') ? !!opts.noHover : !!opts.reduced });
  delete globalThis.GoalGroups;
  delete globalThis.YardPictograms;
  delete globalThis.YardPrints;
  delete globalThis.HoverCard;
  vi.resetModules();
  await import('../../screens/shared/goal-groups.js');
  await import('../../screens/shared/yard-pictograms.js');
  await import('../../screens/shared/yard-prints.js');
}

const SIXTEEN = ['exit-ticket', 'live-poll', 'speed-quiz', 'art-gallery', 'snowball', 'solo-quiz',
  'someones-got-you', 'vocab-match', 'one-more-thing', 'both-sides-rope', 'whose-eyes',
  'rose-bud-thorn', 'doodle-bluff', 'trivia-bluff', 'group-work-day', 'closer'];

const NEED = { connect: 't-magenta', think: 't-cyan', review: 't-green', play: 't-orange' };

describe('the pictograms', () => {
  beforeEach(() => loadModules());

  it('draws one for each of the sixteen activities in the handoff table', () => {
    expect(globalThis.YardPictograms.IDS.sort()).toEqual([...SIXTEEN].sort());
  });

  it('every pictogram has exactly one arrival and at least one block in the need colour, and no paint bleeds in from elsewhere', () => {
    for (const id of SIXTEEN) {
      for (const paint of Object.values(NEED)) {
        const { node } = globalThis.YardPictograms.build({ id }, paint, globalThis.YardPrints.picture({ id }));
        const arrivals = node.querySelectorAll('.pg-arrive');
        expect(arrivals.length, `${id} arrivals`).toBe(1);
        const painted = node.querySelectorAll('.' + paint);
        expect(painted.length, `${id} ${paint}`).toBeGreaterThanOrEqual(1);
        // The other jobs' paints never show (cyan on Snowball IS its paint
        // and is passed in, so only the three foreign ones are checked)
        for (const other of Object.values(NEED)) {
          if (other === paint) continue;
          if (id === 'rose-bud-thorn' && other === 't-green') continue; // its green line is a fixed rose/bud/thorn tone
          expect(node.querySelectorAll('.' + other).length, `${id} foreign ${other}`).toBe(0);
        }
      }
    }
  });

  it('a copy of a built-in reads its template\'s pictogram; an unknown activity gets the fallback from its glimpse', () => {
    const P = globalThis.YardPictograms;
    expect(P.has({ id: 'exit-ticket-2' })).toBe(true);
    expect(P.has({ id: 'doodle-bluff-14' })).toBe(true);
    expect(P.has({ id: 'my-own-thing' })).toBe(false);
    const pic = globalThis.YardPrints.picture({ id: 'my-own-thing' });
    for (const mode of ['answer', 'join', 'talk']) {
      const { node } = P.build({ id: 'my-own-thing', glimpse: { mode } }, 't-cyan', pic);
      expect(node.querySelectorAll('.pg-arrive').length, mode).toBe(1);
      expect(node.querySelectorAll('.t-cyan').length, mode).toBeGreaterThanOrEqual(1);
    }
    // the join fallback spells the dealt code, never a real room's
    const join = P.build({ id: 'my-own-thing', glimpse: { mode: 'join' } }, 't-cyan', pic).node;
    expect(join.querySelectorAll('.pg-letter').map((n) => n.textContent).join('')).toBe(pic.code);
  });

  it('Speed Quiz carries the timer chip that ticks on hover; the checklists put the arriving check on the last, painted line', () => {
    const P = globalThis.YardPictograms;
    const quiz = P.build({ id: 'speed-quiz' }, 't-green');
    expect(quiz.tick).not.toBeNull();
    expect(quiz.tick.textContent).toBe('0:06');
    for (const id of ['solo-quiz', 'group-work-day']) {
      const { node } = P.build({ id }, 't-cyan');
      const lines = node.querySelectorAll('.pg-check');
      const last = lines[lines.length - 1];
      expect(last.className, id).toContain('t-cyan');
      expect(last.querySelector('.pg-arrive').textContent, id).toBe('✓');
      expect(lines.slice(0, -1).every((l) => l.className.includes('pg-done') && l.textContent === '✓'), id).toBe(true);
    }
  });

  it('builds with the DOM only, never HTML strings', async () => {
    const js = await read('screens/shared/yard-pictograms.js');
    expect(js).not.toContain('innerHTML');
    expect(js).not.toContain('insertAdjacentHTML');
  });
});

describe('the cards', () => {
  beforeEach(() => loadModules());

  const game = (id, extra = {}) => ({ id, name: 'Name of ' + id, playTime: '~10 min', tags: ['review'], glimpse: { mode: 'answer', prompt: 'What stuck with you today?' }, ...extra });

  it('a card is a mat with a window (pictogram + hidden prompt) and a name row with the need square; no meta line, no minutes', () => {
    const card = globalThis.YardPrints.buildCard(game('exit-ticket'), 0, { href: (g) => '/make?game=' + g.id });
    expect(card.tagName).toBe('A');
    expect(card.querySelector('.yard-print .yard-window .yard-pict')).not.toBeNull();
    expect(card.querySelector('.yard-prompt').textContent).toBe('What stuck with you today?');
    const need = card.querySelector('.yard-name-row .yard-need');
    expect(need.className).toContain('t-green');
    expect(card.querySelector('.yard-name').textContent).toBe('Name of exit-ticket');
    expect(card.querySelector('.yard-meta')).toBeNull();
    expect(card.querySelector('.yp-mini')).toBeNull();
    expect(card.querySelector('.yp-caps')).toBeNull();
  });

  it('the hover state is a class the pictogram, arrival, prompt and timer answer to', () => {
    const YP = globalThis.YardPrints;
    const card = YP.buildCard(game('speed-quiz'), 0, { href: (g) => '/' + g.id });
    card.listeners.mouseenter[0]();
    expect(card.classList.contains('on')).toBe(true);
    expect(card.querySelector('.pg-tick').textContent).toBe('0:05');
    card.listeners.mouseleave[0]();
    expect(card.classList.contains('on')).toBe(false);
    expect(card.querySelector('.pg-tick').textContent).toBe('0:06');
  });

  it('the prompt is the glimpse\'s, else a one-line hook, cut short, bold markers stripped', () => {
    const YP = globalThis.YardPrints;
    expect(YP.promptOf({ glimpse: { prompt: 'Which **one**? Tap it.' } })).toBe('Which one? Tap it.');
    expect(YP.promptOf({ hook: 'A hook line.', description: 'Long. Longer.' })).toBe('A hook line.');
    expect(YP.promptOf({ description: 'First sentence here. Second one.' })).toBe('First sentence here.');
    const long = YP.promptOf({ glimpse: { prompt: 'word '.repeat(40).trim() } });
    expect(long.length).toBeLessThanOrEqual(97);
    expect(long.endsWith('…')).toBe(true);
  });

  it('time marks land on the first card of each duration step, computed from the sorted list', () => {
    const YP = globalThis.YardPrints;
    expect(YP.MARK_STEPS).toEqual([5, 10, 15, 20, 30]);
    const sorted = [
      { minutes: 5 }, { minutes: 5 }, { minutes: 10 }, { minutes: 12 }, { minutes: 15 },
      { minutes: 20 }, { minutes: 20 }, { minutes: 35 }, { minutes: 45 }
    ];
    expect(YP.marksFor(sorted)).toEqual(['5 MIN', null, '10 MIN', null, '15 MIN', '20 MIN', null, '30 MIN', null]);
    // under five minutes: no mark until the first five-minute card
    expect(YP.marksFor([{ minutes: 3 }, { minutes: 5 }])).toEqual([null, '5 MIN']);
    // the server's reading of playTime wins over the first number in it
    expect(YP.minutesOf({ playTime: '~15–20 min', minutes: 20 })).toBe(20);
    expect(YP.minutesOf({ playTime: '~15–20 min' })).toBe(15);
  });

  it('the grid sorts shortest first, pins the marks, and ends with the AI door to /designer', () => {
    const YP = globalThis.YardPrints;
    const grid = makeNode('div');
    YP.buildGrid(grid, [game('closer', { minutes: 35 }), game('exit-ticket', { minutes: 5 }), game('snowball', { minutes: 10 })], { href: (g) => '/make?game=' + g.id, marks: true });
    const cards = grid.querySelectorAll('.yard-card');
    expect(cards.map((c) => c.getAttribute('data-game-id'))).toEqual(['exit-ticket', 'snowball', 'closer', null]);
    expect(cards[0].querySelector('.yard-mark').textContent).toBe('5 MIN');
    expect(cards[1].querySelector('.yard-mark').textContent).toBe('10 MIN');
    expect(cards[2].querySelector('.yard-mark').textContent).toBe('30 MIN');
    const door = cards[3];
    expect(door.className).toContain('yard-card-make');
    expect(door.href).toBe('/designer');
    expect(door.querySelector('.yard-slot .yp-slot')).not.toBeNull();
    expect(door.querySelector('.yp-chip').textContent).toBe('Build it');
    expect(door.querySelector('.yard-name').textContent).toBe('Have an idea? Make it real');
    expect(door.querySelector('.yard-need')).toBeNull();
    // marks off by default (the shelf draws none)
    const shelf = makeNode('div');
    YP.buildGrid(shelf, [game('exit-ticket')], { ai: false });
    expect(shelf.querySelector('.yard-mark')).toBeNull();
  });

  it('on load the first card plays its hover once (700ms on, settles by 2600ms), never under reduced motion', async () => {
    vi.useFakeTimers();
    try {
      const YP = globalThis.YardPrints;
      const grid = makeNode('div');
      YP.buildGrid(grid, [game('exit-ticket'), game('snowball')], { play: true });
      const first = grid.querySelector('.yard-card');
      expect(first.classList.contains('on')).toBe(false);
      vi.advanceTimersByTime(700);
      expect(first.classList.contains('on')).toBe(true);
      vi.advanceTimersByTime(1900);
      expect(first.classList.contains('on')).toBe(false);

      await loadModules({ reduced: true });
      const quiet = makeNode('div');
      globalThis.YardPrints.buildGrid(quiet, [game('exit-ticket')], { play: true });
      vi.advanceTimersByTime(3000);
      expect(quiet.querySelector('.yard-card').classList.contains('on')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('with no hover, the first tap shows the hover state and cancels the open; the second opens', async () => {
    await loadModules({ noHover: true });
    const YP = globalThis.YardPrints;
    const opened = [];
    const grid = makeNode('div');
    YP.buildGrid(grid, [game('exit-ticket'), game('snowball')], { href: (g) => '/' + g.id, onClick: (g) => opened.push(g.id), ai: false });
    const [a, b] = grid.querySelectorAll('.yard-card');
    const tap = (card) => { const e = { button: 0, preventDefault: vi.fn() }; card.listeners.click[0](e); return e; };
    tap(a);
    expect(a.classList.contains('on')).toBe(true);
    expect(opened).toEqual([]);
    tap(b); // only one previewed at a time
    expect(a.classList.contains('on')).toBe(false);
    expect(b.classList.contains('on')).toBe(true);
    tap(b);
    expect(opened).toEqual(['snowball']);
    // emulated mouse events from a tap do not pre-arm the state
    a.listeners.mouseenter[0]();
    expect(a.classList.contains('on')).toBe(false);
  });
});

describe('the yard on the home page', () => {
  let html, css, shelfCss;
  beforeEach(async () => {
    html = await read('screens/home/index.html');
    css = await read('screens/shared/yard-prints.css');
    shelfCss = await read('screens/shared/my-yard.css');
  });

  it('loads the pictograms before the prints and asks the grid for marks and the load play', () => {
    expect(html.indexOf('<script src="/shared/yard-pictograms.js">')).toBeLessThan(html.indexOf('<script src="/shared/yard-prints.js">'));
    expect(html).toContain('marks: true,');
    expect(html).toContain('play: !playedOnce,');
  });

  it('the title row is the name and the search plank; the chip row is its own sticky row under it', () => {
    const head = html.slice(html.indexOf('<div class="yard-head">'), html.indexOf('<div class="yard-moments"'));
    expect(head).toContain('<h2>The yard</h2>');
    expect(head).toContain('id="yard-search"');
    expect(head).not.toContain('class="yard-tools"');
    expect(head).toMatch(/<\/div>\s*<div class="yard-chips" id="yard-chips"/);
    expect(html).toMatch(/\.yard-chips\s*\{[^}]*position:\s*sticky[^}]*background:\s*var\(--t-gesso\)/);
    expect(html).not.toMatch(/\.yard-head\s*\{[^}]*position:\s*sticky/);
    expect(html).toMatch(/\.yard-search\s*\{[^}]*width:\s*300px[^}]*height:\s*44px/);
    // the chip's swatch is a 10×10 square
    expect(html).toMatch(/\.goal-chip\[data-goal\]::before\s*\{[^}]*width:\s*10px;\s*height:\s*10px/);
  });

  it('the grid is four columns of paper mats with a 156px window; hover is the only motion and reduced motion stills it', () => {
    expect(css).toMatch(/\.yard-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/);
    expect(css).toMatch(/\.yard-grid\s*\{[^}]*gap:\s*34px 26px/);
    expect(css).toMatch(/\.yard-window\s*\{[^}]*height:\s*156px/);
    expect(css).toMatch(/\.yard-print\s*\{[^}]*padding:\s*9px 9px 11px/);
    expect(css).toContain('.yard-card.on .yard-pict');
    expect(css).toContain('.yard-card.on .pg-arrive');
    expect(css).toContain('.yard-card.on .yard-prompt');
    // keyboard users see the same arrival
    expect(css).toContain('.yard-card:focus-visible .pg-arrive');
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.yard-card, \.yard-pict, \.yard-prompt, \.pg-arrive \{ transition: none; \}/);
    expect(css).not.toContain('.yard-meta');
    expect(css).not.toContain('.yp-mini');
  });

  it('the shelf\'s tools sit under the taller window', () => {
    expect(shelfCss).toContain('top: 173px; /* 9px paper + 156px window + 8px */');
  });
});
